const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9550) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/json/new?${encodeURIComponent(url)}`,
      method: 'PUT'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const proc = spawn('/usr/bin/chromium-browser', [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9550',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9550);
  const ws = new WebSocket(json.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 1;
  const handlers = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && handlers.has(m.id)) {
      const { resolve } = handlers.get(m.id);
      handlers.delete(m.id);
      resolve(m.result);
    }
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    handlers.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(1000);

  // 1. 登录页全新通行证
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/ui_inspect/01_login_screen_new.png', Buffer.from(shot.data, 'base64'));

  // 2. 点击头像打开 Avatar Modal
  await send('Runtime.evaluate', {
    expression: `document.getElementById('avatar-trigger').click();`
  });
  await sleep(600);

  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/ui_inspect/02_avatar_modal_opened.png', Buffer.from(shot.data, 'base64'));

  console.log("Screenshots captured: /tmp/ui_inspect/01_login_screen_new.png and 02_avatar_modal_opened.png");
  ws.close();
  proc.kill();
}

run();
