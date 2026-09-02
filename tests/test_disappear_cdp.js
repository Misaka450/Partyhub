/**
 * 🍔 偷吃怪/谁不见了 (Who Disappeared) 真机 CDP 全流程实测
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9449;
const SERVER_URL = 'http://127.0.0.1:8080';
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
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

class BrowserClient {
  constructor(name, wsUrl) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.token = `tok_disp_cdp_${Math.random().toString(36).substr(2, 9)}`;
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

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outDir = ensureScreensDir();
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`📸 截图已保存: ${filePath}`);
    return filePath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('====================================================');
  console.log('🍔 启动 Headless Chromium CDP【偷吃怪】餐盘食物真机实测');
  console.log('====================================================');

  const browserPath = findBrowserPath();
  chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=412,892',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  const testRoomId = 'DISP_CDP_' + Math.floor(Math.random() * 8999 + 1000);

  try {
    const target = await createTarget(SERVER_URL, CDP_PORT);
    const client = new BrowserClient('房主', target.webSocketDebuggerUrl);
    await client.connect();

    console.log(`1. 玩家加入房间: ${testRoomId}...`);
    await client.waitFor("return document.getElementById('player-name') !== null", 15000);
    await client.eval(`
      myPlayerToken = '${client.token}';
      localStorage.setItem('dg_player_token', '${client.token}');
      document.getElementById('player-name').value = '吃货大侦探';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '吃货大侦探',
        avatar: '😋',
        playerToken: '${client.token}'
      });
    `);

    await wait(800);
    await client.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 8000);
    console.log('✓ 成功进入游戏大厅');

    console.log('2. 切换至【谁不见了/偷吃怪】模式...');
    await client.eval("socket.emit('switch_game', { gameType: 'who-disappeared' })");
    await client.waitFor("return currentRoomState && currentRoomState.gameType === 'who-disappeared'", 5000);
    await client.eval("socket.emit('update_room_settings', { maxRounds: 1 })");
    await wait(400);

    console.log('3. 启动游戏...');
    await client.eval("socket.emit('start_game')");
    await client.waitFor("return currentRoomState && currentRoomState.status === 'DISAPPEAR_MEMORIZE'", 6000);
    console.log('✓ 成功进入【DISAPPEAR_MEMORIZE】记忆阶段！');

    // 4. 等待餐盘内食物加载完毕
    console.log('4. 检验记忆阶段餐盘中的食物渲染...');
    await client.waitFor(`
      const plate = document.getElementById('disappear-plate');
      return plate && plate.querySelectorAll('.disappear-food-item').length > 0;
    `, 5000);

    const memoryMetrics = await client.eval(`
      const plate = document.getElementById('disappear-plate');
      const items = Array.from(plate.querySelectorAll('.disappear-food-item')).map(el => ({
        emoji: el.textContent,
        title: el.title
      }));
      const rect = plate.getBoundingClientRect();
      return {
        foodCount: items.length,
        items,
        plateWidth: Math.round(rect.width),
        plateHeight: Math.round(rect.height)
      };
    `);

    console.log('📊 记忆阶段餐盘测量:');
    console.log(`- 餐盘食物数量: ${memoryMetrics.foodCount} 个 (绝非空盘!)`);
    console.log(`- 食物列表: ${memoryMetrics.items.map(i => `${i.emoji}${i.title}`).join(' ')}`);
    console.log(`- 餐盘尺寸: ${memoryMetrics.plateWidth}px × ${memoryMetrics.plateHeight}px`);

    if (memoryMetrics.foodCount < 4) {
      throw new Error(`记忆阶段食物数量异常: ${memoryMetrics.foodCount}`);
    }

    await client.captureScreenshot('disappear_memory_real.png');

    // 5. 等待 3 秒记忆期结束，进入偷吃抢答阶段 (DISAPPEAR_GUESSING)
    console.log('5. 等待 3 秒记忆结束，偷吃怪吃掉一个食物...');
    await client.waitFor("return currentRoomState && (currentRoomState.status === 'DISAPPEAR_GUESSING' || currentRoomState.status === 'DISAPPEAR_GUESS')", 6000);
    console.log('✓ 成功进入【DISAPPEAR_GUESSING】抢答阶段！');

    await client.waitFor(`
      const grid = document.getElementById('disappear-options-grid');
      return grid && !grid.classList.contains('hidden') && grid.querySelectorAll('button').length === 4;
    `, 5000);

    const guessMetrics = await client.eval(`
      const plate = document.getElementById('disappear-plate');
      const grid = document.getElementById('disappear-options-grid');
      const remainingItems = Array.from(plate.querySelectorAll('.disappear-food-item')).map(el => el.textContent);
      const options = Array.from(grid.querySelectorAll('button')).map(b => b.textContent.trim());
      return {
        remainingCount: remainingItems.length,
        remainingItems,
        optionsCount: options.length,
        options
      };
    `);

    console.log('📊 抢答阶段餐盘与选项测量:');
    console.log(`- 剩余食物数量: ${guessMetrics.remainingCount} 个 (比记忆阶段少 1 个被吃掉了)`);
    console.log(`- 候选项(4个): ${guessMetrics.options.join(' | ')}`);

    if (guessMetrics.remainingCount !== memoryMetrics.foodCount - 1) {
      throw new Error(`剩余食物数量不对: 初始 ${memoryMetrics.foodCount}, 剩余 ${guessMetrics.remainingCount}`);
    }

    await client.captureScreenshot('disappear_guess_real.png');

    console.log('====================================================');
    console.log('✅ 偷吃怪游戏餐盘食物真机实测 100% 验证通过！');
    console.log('====================================================');

    client.close();
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

run().catch(e => {
  console.error('❌ 测试失败:', e);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
