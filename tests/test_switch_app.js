const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
// 跨平台浏览器启动工具：自动探测本机可用浏览器（Windows/Linux/macOS）
const { findBrowserPath } = require('./lib/browser_launcher');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9990) {
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

async function testAppSwitching() {
  console.log("=== 测试跨应用切换与重连游戏切换机制 ===");
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
    '--remote-debugging-port=9990',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9990);
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

  // 1. Join room as host
  const joinRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主测试';
      document.getElementById('room-id').value = 'TEST_SWITCH_APP';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 800));
      return { isHost, currentRoomId, currentGameType, connected: socket.connected };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("1. 初始加入房间状态:", joinRes.result.value);

  // 2. 模拟切到后台 (disconnect socket + simulate visibility hidden)
  console.log("2. 模拟切换到其他应用 (微信/小红书) 5秒...");
  await send('Runtime.evaluate', {
    expression: `(async () => {
      socket.disconnect(); // 模拟移动端系统切后台断网/挂起
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`,
    awaitPromise: true
  });
  await sleep(2000);

  // 3. 模拟切回浏览器 (visibility visible + window focus)
  console.log("3. 模拟切回浏览器前端...");
  await send('Runtime.evaluate', {
    expression: `(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    })()`,
    awaitPromise: true
  });
  await sleep(1000);

  // 4. 切回后立刻点击切换游戏 (例如切披萨 perfect-slice)
  console.log("4. 切回后尝试点击选择【切披萨】游戏...");
  const clickRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const card = document.querySelector('.game-tile[data-game="perfect-slice"]');
      card.click();
      await new Promise(r => setTimeout(r, 600));
      return {
        isHost,
        currentGameType,
        activeCardGame: document.querySelector('.game-tile.active')?.dataset.game,
        settingsVisible: !document.getElementById('settings-perfect-slice')?.classList.contains('hidden'),
        socketConnected: socket.connected
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("5. 切游戏结果:", clickRes.result.value);

  ws.close();
  proc.kill();
}

testAppSwitching();
