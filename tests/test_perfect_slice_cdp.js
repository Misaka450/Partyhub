/**
 * 🍕 《切披萨 50:50》CDP 真机多轮次程序化随机形状切割实测
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

const CDP_PORT = 9444;
const SERVER_URL = 'http://127.0.0.1:8080';
const screensDir = ensureScreensDir();
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserClient {
  constructor(name, wsUrl, index) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.index = index;
    this.token = `tok_cdp_slice_${index}_${Math.random().toString(36).substr(2, 9)}`;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (e) {}
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          ${expression}
        } catch (e) {
          return { __eval_err: e.message || String(e) };
        }
      })()`,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : null;
  }

  async waitFor(fnExpr, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.eval(fnExpr);
        if (res && !res.__eval_err) return res;
      } catch (e) {}
      await wait(intervalMs);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${fnExpr}`);
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(screensDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(res.data, 'base64'));
    return fullPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function createTarget(url, port = CDP_PORT) {
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

async function runTest() {
  console.log('====================================================');
  console.log('🍕 启动 Headless Chromium 真机 CDP 切披萨算法验证');
  console.log('====================================================');

  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error('未找到可用浏览器');
    process.exit(1);
  }

  chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=390,844',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  const testRoomId = 'PIZZA_CDP_' + Math.floor(Math.random() * 8999 + 1000);
  const clients = [];

  try {
    const target1 = await createTarget(SERVER_URL, CDP_PORT);
    const host = new BrowserClient('神刀房主', target1.webSocketDebuggerUrl, 0);
    await host.connect();
    await host.waitFor("return document.getElementById('player-name') !== null", 15000);
    clients.push(host);

    const target2 = await createTarget(SERVER_URL, CDP_PORT);
    const p2 = new BrowserClient('吃货小明', target2.webSocketDebuggerUrl, 1);
    await p2.connect();
    await p2.waitFor("return document.getElementById('player-name') !== null", 15000);
    clients.push(p2);

    console.log(`1. 两名真实浏览器玩家加入房间: ${testRoomId}`);
    await host.eval(`
      myPlayerToken = '${host.token}';
      myPlayerName = '神刀房主';
      localStorage.setItem('dg_player_token', '${host.token}');
      localStorage.setItem('dg_player_name', '神刀房主');
      document.getElementById('player-name').value = '神刀房主';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '神刀房主',
        avatar: '👑',
        playerToken: '${host.token}'
      });
    `);
    await wait(600);

    await p2.eval(`
      myPlayerToken = '${p2.token}';
      myPlayerName = '吃货小明';
      localStorage.setItem('dg_player_token', '${p2.token}');
      localStorage.setItem('dg_player_name', '吃货小明');
      document.getElementById('player-name').value = '吃货小明';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '吃货小明',
        avatar: '🍕',
        playerToken: '${p2.token}'
      });
    `);
    await wait(800);

    await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 8000);
    console.log('✓ 成功进入游戏大厅');

    console.log('2. 切换到【切披萨 50:50】并启动游戏');
    await host.eval("socket.emit('switch_game', { gameType: 'perfect-slice' })");
    await host.waitFor("return currentRoomState && currentRoomState.gameType === 'perfect-slice'", 5000);
    await host.eval("socket.emit('start_game')");
    await wait(1000);

    // 等待第 1 轮披萨形状生成与舞台展示
    await host.waitFor("return currentSliceShape !== null && currentSliceShape.points.length >= 3", 6000);

    const round1Info = await host.eval(`
      return {
        name: currentSliceShape.name,
        pointsCount: currentSliceShape.points.length,
        stageVisible: !document.getElementById('stage-perfect-slice').classList.contains('hidden'),
        canvasW: document.getElementById('slice-canvas').width,
        canvasH: document.getElementById('slice-canvas').height
      };
    `);
    console.log('  -> 第 1 轮程序化披萨形状:', round1Info);
    if (!round1Info.stageVisible) throw new Error('Stage not visible');

    // 截图记录第 1 轮真实 Canvas 渲染
    const shot1 = await host.screenshot('cdp_pizza_round1.png');
    console.log(`  ✓ 第 1 轮披萨 Canvas 渲染截图成功: ${shot1}`);

    // 模拟真机下刀操作（host 沿垂直中线划一刀）
    console.log('3. 模拟真机 Canvas 触摸拖动划出切线 (0.5, 0.1) -> (0.5, 0.9)');
    await host.eval(`
      const canvas = document.getElementById('slice-canvas');
      const rect = canvas.getBoundingClientRect();
      const x1 = rect.left + rect.width * 0.5;
      const y1 = rect.top + rect.height * 0.1;
      const x2 = rect.left + rect.width * 0.5;
      const y2 = rect.top + rect.height * 0.9;

      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x1, clientY: y1, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x2, clientY: y2, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x2, clientY: y2, bubbles: true }));
    `);
    await wait(800);

    // 检查提交结果与徽章上屏
    const cutFeedback = await host.eval(`
      return {
        badgeVisible: !document.getElementById('slice-result-badge').classList.contains('hidden'),
        ratioText: document.getElementById('slice-ratio-text')?.textContent,
        diffText: document.getElementById('slice-diff-text')?.textContent
      };
    `);
    console.log('  ✓ 切割即时反馈徽章:', cutFeedback);

    // p2 也划一刀完成本轮
    await p2.eval(`
      socket.emit('slice_cut_submit', {
        p1: { x: 0.3, y: 0.2 },
        p2: { x: 0.7, y: 0.8 }
      });
    `);

    // 等待第 1 轮结算与第 2 轮开启
    console.log('4. 等待本轮结算公布并流转至第 2 轮...');
    await host.waitFor("return currentRoomState && currentRoomState.round === 2", 12000);

    const round2Info = await host.eval(`
      return {
        round: currentRoomState.round,
        name: currentSliceShape.name,
        pointsCount: currentSliceShape.points.length
      };
    `);
    console.log('  -> 第 2 轮程序化披萨形状:', round2Info);
    if (round2Info.name === round1Info.name) {
      console.warn('  ⚠️ 提示：两轮名称相同');
    } else {
      console.log(`  ✓ 第 2 轮成功生成不同名称与几何的新披萨: 【${round2Info.name}】！`);
    }

    const shot2 = await host.screenshot('cdp_pizza_round2.png');
    console.log(`  ✓ 第 2 轮披萨 Canvas 渲染截图成功: ${shot2}`);

    console.log('====================================================');
    console.log('🎉 Headless Chromium CDP 切披萨程序化算法实测 100% 通过！');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ CDP 测试失败:', err);
    process.exitCode = 1;
  } finally {
    clients.forEach(c => c.close());
    if (chromeProc) chromeProc.kill();
  }
}

runTest();
