const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9880) {
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
    '--remote-debugging-port=9880',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9880);
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
  await sleep(500);

  // 登录并进入房间
  await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主小马';
      document.getElementById('room-id').value = 'M24_TEST';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 800));
      // 切换到决战 24 点
      document.querySelector('.game-tile[data-game="math-24"]')?.click();
      await new Promise(r => setTimeout(r, 400));
      // 滚动到底部确保 Action Dock 居中在视口
      document.querySelector('.lobby-card')?.scrollTo({ top: 9999, behavior: 'instant' });
    })()`,
    awaitPromise: true
  });
  await sleep(600);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/ui_inspect/action_dock_scrolled.png', Buffer.from(shot.data, 'base64'));
  console.log("Captured /tmp/ui_inspect/action_dock_scrolled.png");

  ws.close();
  proc.kill();
}

run();
