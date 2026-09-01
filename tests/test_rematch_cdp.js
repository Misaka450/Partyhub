/**
 * 🔄 【再来一局】CDP 真机真实点击与弹窗/状态全流程实测
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

const CDP_PORT = 9445;
const SERVER_URL = 'http://127.0.0.1:8080';
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserClient {
  constructor(name, wsUrl, index) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.index = index;
    this.token = `tok_cdp_rematch_${index}_${Math.random().toString(36).substr(2, 9)}`;
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
  console.log('🔄 启动 Headless Chromium CDP【再来一局】真机点击验证');
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

  const testRoomId = 'REMATCH_CDP_' + Math.floor(Math.random() * 8999 + 1000);
  const clients = [];

  try {
    const target1 = await createTarget(SERVER_URL, CDP_PORT);
    const host = new BrowserClient('房主', target1.webSocketDebuggerUrl, 0);
    await host.connect();
    await host.waitFor("return document.getElementById('player-name') !== null", 15000);
    clients.push(host);

    const target2 = await createTarget(SERVER_URL, CDP_PORT);
    const p2 = new BrowserClient('队员', target2.webSocketDebuggerUrl, 1);
    await p2.connect();
    await p2.waitFor("return document.getElementById('player-name') !== null", 15000);
    clients.push(p2);

    console.log(`1. 两名真实玩家加入房间: ${testRoomId}`);
    await host.eval(`
      myPlayerToken = '${host.token}';
      localStorage.setItem('dg_player_token', '${host.token}');
      document.getElementById('player-name').value = '房主';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '房主',
        avatar: '👑',
        playerToken: '${host.token}'
      });
    `);
    await wait(600);

    await p2.eval(`
      myPlayerToken = '${p2.token}';
      localStorage.setItem('dg_player_token', '${p2.token}');
      document.getElementById('player-name').value = '队员';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '队员',
        avatar: '🐱',
        playerToken: '${p2.token}'
      });
    `);
    await wait(800);

    await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 8000);
    console.log('✓ 成功进入游戏大厅');

    console.log('2. 切换至切披萨并设置 maxRounds = 1...');
    await host.eval("socket.emit('switch_game', { gameType: 'perfect-slice' })");
    await host.waitFor("return currentRoomState && currentRoomState.gameType === 'perfect-slice'", 5000);
    await host.eval("socket.emit('update_room_settings', { maxRounds: 1 })");
    await wait(400);

    console.log('3. 房主启动第 1 场游戏...');
    await host.eval("socket.emit('start_game')");
    await host.waitFor("return currentRoomState && currentRoomState.status === 'SLICE_CUTTING'", 6000);

    // 两名玩家真机下刀
    await host.eval(`
      socket.emit('slice_cut_submit', { p1: { x: 0.5, y: 0.1 }, p2: { x: 0.5, y: 0.9 } });
    `);
    await p2.eval(`
      socket.emit('slice_cut_submit', { p1: { x: 0.4, y: 0.1 }, p2: { x: 0.4, y: 0.9 } });
    `);

    console.log('4. 等待游戏结算弹窗出现 (gameover-modal.active)...');
    await host.waitFor(`
      const m = document.getElementById('gameover-modal');
      return m && m.classList.contains('active');
    `, 15000);
    await p2.waitFor(`
      const m = document.getElementById('gameover-modal');
      return m && m.classList.contains('active');
    `, 15000);
    console.log('✓ 房主与队员屏幕均已弹出结算颁奖台！');

    // 验证房主能看到【再来一局】按钮
    const rematchBtnVisible = await host.eval(`
      const b = document.getElementById('btn-gameover-rematch');
      return b && !b.classList.contains('hidden') && b.offsetParent !== null;
    `);
    if (!rematchBtnVisible) throw new Error('房主未看到【再来一局】按钮');
    console.log('✓ 房主界面【再来一局】按钮正常可见并可点击');

    // 房主真机点击【再来一局】
    console.log('5. 房主点击【再来一局】按钮...');
    await host.eval(`
      document.getElementById('btn-gameover-rematch').click();
    `);
    await wait(800);

    // 验证全员流转至新局第 1 轮
    console.log('6. 验证全员是否无缝进入新一局游戏...');
    await host.waitFor(`
      const m = document.getElementById('gameover-modal');
      return currentRoomState && currentRoomState.status === 'SLICE_CUTTING' && (!m || !m.classList.contains('active'));
    `, 10000);
    await p2.waitFor(`
      const m = document.getElementById('gameover-modal');
      return currentRoomState && currentRoomState.status === 'SLICE_CUTTING' && (!m || !m.classList.contains('active'));
    `, 10000);

    const newGameInfo = await host.eval(`
      return {
        round: currentRoomState.round,
        status: currentRoomState.status,
        shapeName: currentSliceShape?.name,
        modalActive: document.getElementById('gameover-modal').classList.contains('active')
      };
    `);
    console.log('  -> 新局状态数据:', newGameInfo);

    if (newGameInfo.status === 'SLICE_CUTTING' && !newGameInfo.modalActive) {
      console.log('✓ 验证成功：【再来一局】已在新一局正常开局，旧弹窗已关闭！');
    } else {
      throw new Error(`新局状态异常: ${JSON.stringify(newGameInfo)}`);
    }

    console.log('====================================================');
    console.log('🎉 Headless Chromium CDP【再来一局】实战验证 100% 全部通过！');
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
