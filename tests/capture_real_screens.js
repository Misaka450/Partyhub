const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OUT_DIR = '/tmp/ui_inspect';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

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
    this.proc = spawn('/usr/bin/chromium-browser', [
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
  console.log("🚀 启动真机 CDP 精确捕获各对局真实画面");
  console.log("=========================================");

  const browser = new CDPBrowser(9440, 390, 844);
  try {
    await browser.launch();
    await sleep(1500);

    const roomId = 'ROOM_' + Math.floor(Math.random() * 9000 + 1000);
    const joined = await browser.eval(`
      new Promise((resolve) => {
        socket.emit('join_room', {
          roomId: '${roomId}',
          playerName: '房主小马',
          avatar: '🐱',
          playerToken: myPlayerToken
        });
        socket.once('joined_successfully', (d) => resolve(d));
      })
    `);
    console.log("Joined result:", joined);
    await sleep(1000);

    // 1. 房主进入大厅后的真实全景
    await browser.capture('real_lobby_host');

    // 2. 切换到决战24点卡带
    await browser.eval(`
      document.querySelector('.game-tile[data-game="math-24"]').click();
    `);
    await sleep(600);
    await browser.capture('real_lobby_math24_selected');

    // 3. 启动决战24点
    await browser.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await browser.capture('real_stage_math24_active');

    // 4. 返回大厅 -> 切换到切披萨并启动
    await browser.eval(`socket.emit('back_to_lobby');`);
    await sleep(800);
    await browser.eval(`
      document.querySelector('.game-tile[data-game="perfect-slice"]').click();
    `);
    await sleep(500);
    await browser.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await browser.capture('real_stage_slice_active');

    // 5. 返回大厅 -> 切换到盲压挑战并启动
    await browser.eval(`socket.emit('back_to_lobby');`);
    await sleep(800);
    await browser.eval(`
      document.querySelector('.game-tile[data-game="hold-five"]').click();
    `);
    await sleep(500);
    await browser.eval(`document.getElementById('btn-start-game').click();`);
    await sleep(1500);
    await browser.capture('real_stage_hold_active');

    browser.close();
    console.log("=========================================");
    console.log("✅ 真实运行画面已成功保存！");
    console.log("=========================================");
  } catch (err) {
    console.error("❌ 异常:", err);
    browser.close();
  }
}

run();
