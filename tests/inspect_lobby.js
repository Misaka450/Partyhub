const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
// 跨平台浏览器启动工具：自动探测本机可用浏览器（Windows/Linux/macOS）
const { findBrowserPath } = require('./lib/browser_launcher');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9996) {
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

async function inspectLobby() {
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
    '--remote-debugging-port=9996',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9996);
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
  await sleep(1000);

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主小马';
      document.getElementById('room-id').value = 'INSPECT_ROOM';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 1200));

      const lobbyCard = document.getElementById('lobby-card');
      const hero = document.querySelector('.lobby-room-hero');
      const tiles = document.querySelector('.game-tiles-grid');
      const stageSection = document.querySelector('.stage-section');

      return {
        lobbyCardClass: lobbyCard?.className,
        lobbyCardRect: lobbyCard?.getBoundingClientRect(),
        heroRect: hero?.getBoundingClientRect(),
        tilesRect: tiles?.getBoundingClientRect(),
        stageSectionRect: stageSection?.getBoundingClientRect(),
        stageSectionStyle: stageSection ? window.getComputedStyle(stageSection).display : null,
        lobbyCardStyle: lobbyCard ? window.getComputedStyle(lobbyCard).display : null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Inspect Result:", JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

inspectLobby();
