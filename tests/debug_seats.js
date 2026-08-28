const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
// 跨平台浏览器启动工具：自动探测浏览器路径 + 统一截图输出目录
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9660) {
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
    '--remote-debugging-port=9660',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9660);
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

  // 1. Join room
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主小马';
      document.getElementById('room-id').value = 'TEST_SEATS';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 1200));
      return {
        seatsGrid: document.getElementById('lobby-seats-grid')?.innerHTML,
        seatsCount: document.getElementById('lobby-seats-grid')?.children.length,
        heroRoomId: document.getElementById('hero-room-id')?.textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Seats debug info:", res.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  // 截图统一保存到 tests/screens 目录（跨平台，ensureScreensDir 会自动创建目录）
  const shotPath = path.join(ensureScreensDir(), 'debug_seats_lobby.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`Captured ${shotPath}`);

  ws.close();
  proc.kill();
}

run();
