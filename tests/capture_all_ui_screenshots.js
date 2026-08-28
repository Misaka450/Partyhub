const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
// 跨平台浏览器启动工具：自动探测浏览器路径 + 统一截图输出目录
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

// 截图统一保存到 tests/screens 目录（跨平台，ensureScreensDir 会自动创建目录）
const OUT_DIR = ensureScreensDir();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function createTarget(url, port) {
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

class CDPBrowser {
  constructor(port, width = 390, height = 844) {
    this.port = port;
    this.width = width;
    this.height = height;
    this.proc = null;
    this.ws = null;
    this.msgId = 1;
    this.handlers = new Map();
  }

  async launch() {
    // 先探测本机可用浏览器路径（支持 TEST_BROWSER 环境变量覆盖），找不到直接退出
    const browserPath = findBrowserPath();
    if (!browserPath) {
      console.error('未找到可用浏览器，可用 TEST_BROWSER 环境变量指定路径');
      process.exit(1);
    }

    this.proc = spawn(browserPath, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${this.port}`,
      `--window-size=${this.width},${this.height}`,
      '--hide-scrollbars'
    ]);
    await sleep(2000);

    const json = await createTarget('http://127.0.0.1:8080', this.port);
    this.ws = new WebSocket(json.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && this.handlers.has(msg.id)) {
        const { resolve, reject } = this.handlers.get(msg.id);
        this.handlers.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    await this.send('Page.enable');
    await this.send('DOM.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 2,
      mobile: true
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { return (${expr}); })()`,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result ? res.result.value : null;
  }

  async capture(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(OUT_DIR, `${name}.png`);
    fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
    console.log(`📸 [Screenshot] ${p}`);
    return p;
  }

  close() {
    if (this.ws) this.ws.close();
    if (this.proc) this.proc.kill();
  }
}

async function run() {
  console.log("=========================================");
  console.log("🚀 开始全自动化真机浏览器 UI 视觉全景巡检");
  console.log("=========================================");

  const browser = new CDPBrowser(9330, 390, 844);
  try {
    await browser.launch();
    await sleep(1500);

    // 1. 登录页
    await browser.capture('01_login_screen');

    // 2. 加入房间 -> 进入大厅
    const roomId = 'UI_TEST_' + Math.floor(Math.random() * 9000 + 1000);
    await browser.eval(`
      socket.emit('join_room', {
        roomId: '${roomId}',
        playerName: '房主小马',
        avatar: '🐱',
        playerToken: myPlayerToken
      });
    `);
    await sleep(2000);

    // 3. 房主大厅全景
    await browser.capture('02_lobby_host_full');

    // 4. 测试切换各个游戏模式并截图查看配置面板
    const games = [
      'draw-guess', 'math-24', 'perfect-slice', 'hold-five',
      'cube-count', 'flash-counter', 'bomb-roulette', 'word-bomb'
    ];

    for (const g of games) {
      await browser.eval(`
        const card = document.querySelector('.game-tile[data-game="${g}"]');
        if (card) card.click();
      `);
      await sleep(400);
      await browser.capture(`03_lobby_selected_${g}`);
    }

    console.log("🎉 全部大厅视觉截图已生成！正在启动 2 号客户端测试对局内舞台...");
    browser.close();

    // 现在启动一个真实 2 人局，快速截取各个游戏在进行中的局内舞台！
    const b1 = new CDPBrowser(9331, 390, 844);
    const b2 = new CDPBrowser(9332, 390, 844);
    await b1.launch();
    await b2.launch();
    await sleep(1500);

    const gameRoom = 'STAGE_' + Math.floor(Math.random() * 9000 + 1000);
    await b1.eval(`
      socket.emit('join_room', {
        roomId: '${gameRoom}',
        playerName: '房主小马',
        avatar: '🐱',
        playerToken: myPlayerToken
      });
    `);
    await sleep(1000);

    await b2.eval(`
      socket.emit('join_room', {
        roomId: '${gameRoom}',
        playerName: '队员小凯',
        avatar: '🐶',
        playerToken: myPlayerToken
      });
    `);
    await sleep(1500);

    // 截图队员视角大厅
    await b2.capture('04_lobby_guest_view');

    // 测试开局各游戏舞台并截图
    // A. 决战 24 点
    await b1.eval(`
      document.querySelector('.game-tile[data-game="math-24"]').click();
    `);
    await sleep(500);
    await b1.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await b1.capture('05_stage_math24');

    // B. 返回大厅 -> 切披萨
    await b1.eval(`socket.emit('back_to_lobby');`);
    await sleep(1000);
    await b1.eval(`
      document.querySelector('.game-tile[data-game="perfect-slice"]').click();
    `);
    await sleep(500);
    await b1.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await b1.capture('06_stage_perfect_slice');

    // C. 返回大厅 -> 盲压挑战
    await b1.eval(`socket.emit('back_to_lobby');`);
    await sleep(1000);
    await b1.eval(`
      document.querySelector('.game-tile[data-game="hold-five"]').click();
    `);
    await sleep(500);
    await b1.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await b1.capture('07_stage_hold_five');

    b1.close();
    b2.close();
    console.log("=========================================");
    console.log("✅ 全部端到端真实舞台截图已全部采集完毕！");
    console.log("=========================================");
  } catch (err) {
    console.error("❌ 视觉巡检异常:", err);
    browser.close();
  }
}

run();
