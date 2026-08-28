const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
// 跨平台浏览器启动工具：自动探测浏览器路径 + 统一截图输出目录
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

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
  // 先探测本机可用浏览器路径（支持 TEST_BROWSER 环境变量覆盖），找不到直接退出
  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error('未找到可用浏览器，可用 TEST_BROWSER 环境变量指定路径');
    process.exit(1);
  }

  const proc = spawn(browserPath, [
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
  // 截图统一保存到 tests/screens 目录（跨平台，ensureScreensDir 会自动创建目录）
  const shot1Path = path.join(ensureScreensDir(), '01_login_passport.png');
  fs.writeFileSync(shot1Path, Buffer.from(shot1.data, 'base64'));
  console.log(`Captured ${shot1Path}`);

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
  const shot2Path = path.join(ensureScreensDir(), '02_room_lobby_stage.png');
  fs.writeFileSync(shot2Path, Buffer.from(shot2.data, 'base64'));
  console.log(`Captured ${shot2Path}`);

  ws.close();
  proc.kill();
}

captureScreens();
