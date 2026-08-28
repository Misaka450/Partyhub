const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
// 跨平台浏览器启动工具：自动探测本机可用浏览器（Windows/Linux/macOS）
const { findBrowserPath } = require('./lib/browser_launcher');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9994) {
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

async function debugTrace() {
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
    '--remote-debugging-port=9994',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9994);
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
  await sleep(1500);

  const trace = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        document.getElementById('player-name').value = '房主测试';
        document.getElementById('room-id').value = 'TRACE_ROOM_2';
        document.getElementById('btn-join').click();
        await new Promise(r => setTimeout(r, 1200));

        const before = {
          activeGame: document.querySelector('.game-tile.active')?.dataset.game,
          connected: socket.connected
        };

        // 模拟断开
        socket.disconnect();
        await new Promise(r => setTimeout(r, 1500));

        // 模拟重连唤醒
        window.dispatchEvent(new Event('focus'));
        await new Promise(r => setTimeout(r, 1000));

        // 点击切披萨
        const psCard = document.querySelector('.game-tile[data-game="perfect-slice"]');
        psCard.click();
        await new Promise(r => setTimeout(r, 800));

        const after = {
          activeGame: document.querySelector('.game-tile.active')?.dataset.game,
          connected: socket.connected,
          toast: document.querySelector('.toast')?.textContent
        };

        return { before, after };
      } catch(err) {
        return { error: err.message, stack: err.stack };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Trace result:", JSON.stringify(trace.result.value, null, 2));

  ws.close();
  proc.kill();
}

debugTrace();
