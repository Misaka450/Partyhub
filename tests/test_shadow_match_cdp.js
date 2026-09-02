/**
 * 🔦 影子猜物 (Shadow Match) CDP 真机全流程与视觉自测
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

const CDP_PORT = 9446;
const SERVER_URL = 'http://127.0.0.1:8080';
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserClient {
  constructor(name, wsUrl, index = 0) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.token = `tok_shadow_cdp_${index}_${Math.random().toString(36).substr(2, 9)}`;
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
  console.log('🔦 启动 Headless Chromium CDP【影子猜物】真机视觉与交互实测');
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
    '--window-size=412,892', // 移动端视口尺寸
    '--disable-dev-shm-usage',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  const testRoomId = 'SHADOW_CDP_' + Math.floor(Math.random() * 8999 + 1000);

  try {
    const target = await createTarget(SERVER_URL, CDP_PORT);
    const client = new BrowserClient('房主', target.webSocketDebuggerUrl, 0);
    await client.connect();

    console.log(`1. 玩家加入房间: ${testRoomId}...`);
    await client.waitFor("return document.getElementById('player-name') !== null", 15000);
    await client.eval(`
      myPlayerToken = '${client.token}';
      localStorage.setItem('dg_player_token', '${client.token}');
      document.getElementById('player-name').value = '侦探小马';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '侦探小马',
        avatar: '🕵️',
        playerToken: '${client.token}'
      });
    `);

    await wait(800);
    await client.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 8000);
    console.log('✓ 成功进入游戏大厅');

    console.log('2. 切换至【影子猜物】模式...');
    await client.eval("socket.emit('switch_game', { gameType: 'shadow-match' })");
    await client.waitFor("return currentRoomState && currentRoomState.gameType === 'shadow-match'", 5000);
    await client.eval("socket.emit('update_room_settings', { maxRounds: 1 })");
    await wait(400);

    console.log('3. 启动游戏...');
    await client.eval("socket.emit('start_game')");
    await client.waitFor("return currentRoomState && currentRoomState.status === 'SHADOW_GUESSING'", 6000);
    console.log('✓ 成功进入【SHADOW_GUESSING】剪影竞猜阶段！');

    // 4. 等待舞台可见
    await client.waitFor(`
      const stage = document.getElementById('stage-shadow-match');
      const emoji = document.getElementById('shadow-emoji-item');
      return stage && !stage.classList.contains('hidden') && emoji && emoji.textContent.trim().length > 0;
    `, 6000);

    // 5. 获取舞台及剪影测量指标
    const metrics = await client.eval(`
      const box = document.getElementById('shadow-box-container');
      const emoji = document.getElementById('shadow-emoji-item');
      const beam = document.querySelector('.shadow-spotlight-beam');
      const badge = document.querySelector('.shadow-stage-badge');
      const rect = box.getBoundingClientRect();
      const emojiStyle = window.getComputedStyle(emoji);
      return {
        boxWidth: Math.round(rect.width),
        boxHeight: Math.round(rect.height),
        emojiFontSize: emojiStyle.fontSize,
        emojiFilter: emojiStyle.filter,
        emojiText: emoji.textContent,
        isRevealed: emoji.classList.contains('revealed'),
        hasBeam: !!beam,
        hasBadge: !!badge
      };
    `);

    console.log('📊 真实 DOM 样式测量:');
    console.log(`- 舞台容器: ${metrics.boxWidth}px × ${metrics.boxHeight}px (此前为局促的 180×180)`);
    console.log(`- Emoji 字号: ${metrics.emojiFontSize}`);
    console.log(`- Emoji 文本: [${metrics.emojiText}]`);
    console.log(`- 剪影状态: filter = "${metrics.emojiFilter}"`);
    console.log(`- 聚光灯背光与徽章: beam=${metrics.hasBeam}, badge=${metrics.hasBadge}`);

    if (metrics.boxWidth < 260 || metrics.boxHeight < 180) {
      throw new Error(`舞台容器过小: ${metrics.boxWidth}x${metrics.boxHeight}`);
    }
    if (!metrics.emojiFilter.includes('brightness(0)')) {
      throw new Error(`竞猜阶段必须为黑色剪影`);
    }

    await wait(600);
    const screen1 = await client.captureScreenshot('shadow_guessing_real.png');

    // 6. 模拟玩家点击一个选项
    console.log('6. 玩家点击答题选项...');
    await client.eval(`
      const btn = document.querySelector('#shadow-options-grid button');
      if (btn) btn.click();
      return true;
    `);

    // 7. 等待进入揭晓状态 (约 7 秒)
    console.log('7. 等待 7 秒轮次结束，揭晓彩色原型...');
    await client.waitFor(`
      const emoji = document.getElementById('shadow-emoji-item');
      return emoji && emoji.classList.contains('revealed');
    `, 12000);

    const revealedMetrics = await client.eval(`
      const box = document.getElementById('shadow-box-container');
      const emoji = document.getElementById('shadow-emoji-item');
      const emojiStyle = window.getComputedStyle(emoji);
      return {
        isRevealed: emoji.classList.contains('revealed'),
        boxRevealed: box.classList.contains('revealed'),
        emojiFilter: emojiStyle.filter
      };
    `);

    console.log('🎉 揭晓时刻测量:');
    console.log(`- Emoji revealed: ${revealedMetrics.isRevealed}`);
    console.log(`- Box revealed: ${revealedMetrics.boxRevealed}`);
    console.log(`- Emoji Filter: ${revealedMetrics.emojiFilter} (滤镜恢复彩色)`);

    await wait(500);
    const screen2 = await client.captureScreenshot('shadow_revealed_real.png');

    console.log('====================================================');
    console.log('✅ 影子猜物 CDP 真机自动化测试全部通过！');
    console.log('====================================================');

    client.close();
  } finally {
    if (chromeProc) {
      chromeProc.kill();
    }
  }
}

runTest().catch(err => {
  console.error('❌ 测试失败:', err);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
