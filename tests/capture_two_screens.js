const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9998) {
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

async function captureScreens() {
  const proc = spawn('/usr/bin/chromium-browser', [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9998',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9998);
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
  await send('Page.navigate', { url: 'http://127.0.0.1:8080' });
  await sleep(1200);

  // 1. Capture Login Screen (Full viewport)
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/ui_inspect/01_login_passport.png', Buffer.from(shot1.data, 'base64'));
  console.log("Captured /tmp/ui_inspect/01_login_passport.png");

  // 2. Click Join Room
  const joinRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = 'bao';
      document.getElementById('room-id').value = '123';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 1000));
      return {
        loginScreenActive: document.getElementById('login-screen')?.classList.contains('active'),
        gameScreenActive: document.getElementById('game-screen')?.classList.contains('active')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Join state:", joinRes.result.value);

  // 3. Capture In-Room Lobby
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/ui_inspect/02_room_lobby_stage.png', Buffer.from(shot2.data, 'base64'));
  console.log("Captured /tmp/ui_inspect/02_room_lobby_stage.png");

  ws.close();
  proc.kill();
}

captureScreens();
