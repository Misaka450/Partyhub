const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
// 跨平台浏览器启动工具：自动探测本机可用浏览器（Windows/Linux/macOS）
const { findBrowserPath } = require('./lib/browser_launcher');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9995) {
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

async function test2PlayerSwitch() {
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
    '--remote-debugging-port=9995',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json1 = await createTarget('http://127.0.0.1:8080', 9995);
  const json2 = await createTarget('http://127.0.0.1:8080', 9995);

  const ws1 = new WebSocket(json1.webSocketDebuggerUrl);
  const ws2 = new WebSocket(json2.webSocketDebuggerUrl);
  await Promise.all([
    new Promise(r => ws1.on('open', r)),
    new Promise(r => ws2.on('open', r))
  ]);

  let msgId1 = 1, msgId2 = 1;
  const handlers1 = new Map(), handlers2 = new Map();
  ws1.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && handlers1.has(m.id)) {
      const { resolve } = handlers1.get(m.id);
      handlers1.delete(m.id);
      resolve(m.result);
    }
  });
  ws2.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && handlers2.has(m.id)) {
      const { resolve } = handlers2.get(m.id);
      handlers2.delete(m.id);
      resolve(m.result);
    }
  });

  const send1 = (method, params = {}) => new Promise((resolve) => {
    const id = msgId1++;
    handlers1.set(id, { resolve });
    ws1.send(JSON.stringify({ id, method, params }));
  });
  const send2 = (method, params = {}) => new Promise((resolve) => {
    const id = msgId2++;
    handlers2.set(id, { resolve });
    ws2.send(JSON.stringify({ id, method, params }));
  });

  await send1('Page.enable');
  await send1('Page.navigate', { url: 'http://127.0.0.1:8080' });
  await send2('Page.enable');
  await send2('Page.navigate', { url: 'http://127.0.0.1:8080' });
  await sleep(1500);

  const room = 'ROOM_2P_SWITCH';

  // 1. P1 joins as Host
  await send1('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主小马';
      document.getElementById('room-id').value = '${room}';
      document.getElementById('btn-join').click();
    })()`
  });
  await sleep(800);

  // 2. P2 joins as Guest
  await send2('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '队员小凯';
      document.getElementById('room-id').value = '${room}';
      document.getElementById('btn-join').click();
    })()`
  });
  await sleep(1000);

  // 3. P1 (Host) simulates switching away to WeChat (disconnects)
  console.log("3. 房主小马切到微信 (socket.disconnect)...");
  await send1('Runtime.evaluate', {
    expression: `socket.disconnect();`
  });
  await sleep(2000);

  // 4. P2 is active in the room (e.g. toggles ready)
  console.log("4. 队员小凯在房间内点击准备...");
  await send2('Runtime.evaluate', {
    expression: `document.getElementById('btn-toggle-ready')?.click();`
  });
  await sleep(1000);

  // 5. P1 (Host) switches back to browser
  console.log("5. 房主小马切回浏览器 (focus / reconnect)...");
  await send1('Runtime.evaluate', {
    expression: `(async () => {
      window.dispatchEvent(new Event('focus'));
    })()`
  });
  await sleep(1500);

  // 6. P1 attempts to switch game to math-24
  console.log("6. 房主小马切回后点击切换【决战 24 点】...");
  const switchRes = await send1('Runtime.evaluate', {
    expression: `(async () => {
      const card = document.querySelector('.game-tile[data-game="math-24"]');
      card.click();
      await new Promise(r => setTimeout(r, 800));
      return {
        activeGameP1: document.querySelector('.game-tile.active')?.dataset.game,
        toastP1: document.querySelector('.toast')?.textContent,
        isStartBtnVisible: !document.getElementById('btn-start-game')?.classList.contains('hidden'),
        isReadyBtnVisible: !document.getElementById('btn-toggle-ready')?.classList.contains('hidden')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const p2State = await send2('Runtime.evaluate', {
    expression: `({
      activeGameP2: document.querySelector('.game-tile.active')?.dataset.game,
      isStartBtnVisibleP2: !document.getElementById('btn-start-game')?.classList.contains('hidden'),
      isReadyBtnVisibleP2: !document.getElementById('btn-toggle-ready')?.classList.contains('hidden')
    })`,
    returnByValue: true
  });

  console.log("P1 State:", switchRes.result.value);
  console.log("P2 State:", p2State.result.value);

  ws1.close();
  ws2.close();
  proc.kill();
}

test2PlayerSwitch();
