const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { findBrowserPath, ensureScreensDir } = require('/opt/draw-guess/tests/lib/browser_launcher');

const CDP_PORT = 9666;
const SERVER_URL = 'http://127.0.0.1:8080';
const wait = ms => new Promise(r => setTimeout(r, ms));

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

class HumanAgent {
  constructor(ws, name) {
    this.ws = ws;
    this.name = name;
    this.msgId = 1;
    this.pending = new Map();
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m.result);
        this.pending.delete(m.id);
      }
    });
  }

  send(method, params = {}) {
    return new Promise(res => {
      const id = this.msgId++;
      this.pending.set(id, res);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return res?.result?.value;
  }

  // 模拟真实人类光标移动与点击
  async clickElement(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector('${selector}');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`Element not found: ${selector}`);

    // 移动光标 + 按下 + 释放 (真机人机事件)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await wait(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(80);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(120);
  }

  // 模拟真实打字
  async typeText(selector, text) {
    await this.clickElement(selector);
    // 清空现有内容
    await this.eval(`document.querySelector('${selector}').value = ''`);
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp' });
      await wait(30 + Math.random() * 40);
    }
  }

  async captureScreenshot(filename) {
    const screensDir = ensureScreensDir();
    const snap = await this.send('Page.captureScreenshot');
    fs.writeFileSync(`${screensDir}/${filename}`, Buffer.from(snap.data, 'base64'));
    console.log(`  📸 [${this.name}] 截图已保存: ${filename}`);
  }
}

async function runHumanPlaytest() {
  console.log('======================================================================');
  console.log('🤖 启动 Hermes 拟人真机端到端全流程模拟游玩 (Human Agent Playtest)');
  console.log('======================================================================');

  const browserPath = findBrowserPath();
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'human-test-'));

  const chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=430,932',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(2000);

  try {
    // 1. 创建两个真机标签页模拟两位真实玩家 (房主 Alice 与 玩家 Bob)
    console.log('\n[步骤 1] 真实浏览器挂载: Alice (房主) 与 Bob (玩家)...');
    const target1 = await createTarget(SERVER_URL, CDP_PORT);
    const target2 = await createTarget(SERVER_URL, CDP_PORT);

    const ws1 = new WebSocket(target1.webSocketDebuggerUrl);
    const ws2 = new WebSocket(target2.webSocketDebuggerUrl);
    await Promise.all([new Promise(r => ws1.on('open', r)), new Promise(r => ws2.on('open', r))]);

    const alice = new HumanAgent(ws1, 'Alice(房主)');
    const bob = new HumanAgent(ws2, 'Bob(玩家)');

    await Promise.all([
      alice.send('Page.enable'),
      bob.send('Page.enable'),
      alice.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true }),
      bob.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true }),
      alice.send('Page.navigate', { url: SERVER_URL }),
      bob.send('Page.navigate', { url: SERVER_URL })
    ]);

    // 等待 DOM 准备就绪
    while (true) {
      const ready = await alice.eval('Boolean(document.getElementById("player-name"))');
      if (ready) break;
      await wait(100);
    }
    while (true) {
      const ready = await bob.eval('Boolean(document.getElementById("player-name"))');
      if (ready) break;
      await wait(100);
    }
    await wait(300);

    // 2. 拟人操作：Alice 输入昵称与房间号 888，点击进入
    console.log('\n[步骤 2] Alice 拟人键入昵称【小马爱丽丝】和房间【888】，点击进入房间...');
    await alice.typeText('#player-name', '小马爱丽丝');
    await alice.typeText('#room-id', '888');
    await alice.clickElement('#btn-join');
    await wait(1200);

    // 3. 拟人操作：Bob 输入昵称与快捷点击 888 胶囊进房
    console.log('\n[步骤 3] Bob 拟人键入昵称【小马鲍勃】，点击快捷推荐标签【888】进房...');
    await bob.typeText('#player-name', '小马鲍勃');
    await bob.clickElement('button[data-room="888"]');
    await bob.clickElement('#btn-join');
    await wait(1200);

    // 4. 验证大厅席位
    console.log('\n[步骤 4] 拟人观察大厅席位状态与游戏列表...');
    const lobbyStatus = await alice.eval(`(() => {
      const seats = Array.from(document.querySelectorAll('.player-seat-card .seat-name')).map(el => el.textContent.trim());
      return {
        seats,
        isGameSelectVisible: !document.getElementById('host-game-select-box').classList.contains('hidden')
      };
    })()`);
    console.log(`  ✓ 席位已就绪: ${JSON.stringify(lobbyStatus.seats)}`);
    const hasAlice = lobbyStatus.seats.some(s => s.includes('小马爱丽丝'));
    const hasBob = lobbyStatus.seats.some(s => s.includes('小马鲍勃'));
    if (!hasAlice || !hasBob) {
      throw new Error('席位未同步！');
    }

    // 5. 拟人挑选《决战 24 点》卡带并点击启动
    console.log('\n[步骤 5] Alice 浏览并真实点击挑选《决战 24 点》游戏卡带...');
    await alice.clickElement('.game-tile[data-game="math-24"]');
    await wait(300);

    console.log('  Alice 拟人点击底部吸底按钮【开始游戏】...');
    await alice.clickElement('#btn-start-game');
    await wait(1500);

    // 6. 真实进入《决战 24 点》舞台实测
    console.log('\n[步骤 6] 模拟真实人类玩家在 24 点中看牌、按键拼凑算式...');
    const m24View = await alice.eval(`(() => {
      const cardEls = Array.from(document.querySelectorAll('#m24-cards-row .m24-card-val'));
      const numBtns = Array.from(document.querySelectorAll('#m24-num-buttons .btn-m24-num'));
      const stageVisible = !document.getElementById('stage-math-24').classList.contains('hidden');
      return {
        stageVisible,
        cardVals: cardEls.map(el => el.textContent.trim()),
        btnVals: numBtns.map(el => el.textContent.trim())
      };
    })()`);

    console.log(`  ✓ 24点游戏主舞台是否激活可见: ${m24View.stageVisible}`);
    console.log(`  ✓ 现场呈现的真实扑克牌面: [${m24View.cardVals.join(', ')}]`);
    console.log(`  ✓ 现场生成的真实数字按键: [${m24View.btnVals.join(', ')}]`);

    // 核心质检断言
    if (m24View.cardVals.includes('?')) {
      throw new Error('❌ 人眼视检发现致命 BUG: 卡牌依然是问号 ? 占位符！');
    }
    if (m24View.cardVals.length !== 4) {
      throw new Error(`❌ 卡牌数量不正确: ${m24View.cardVals.length}`);
    }

    // 模拟真实人类点击输入按键：先按第 1 张牌数字，再按 '+' 号
    console.log(`  Alice 拟人伸出手指点击按键 [${m24View.btnVals[0]}]...`);
    await alice.clickElement('#m24-num-buttons .btn-m24-num:first-child');
    await wait(200);

    console.log('  Alice 拟人点击符号 [+]...');
    await alice.clickElement('.btn-m24-op[data-op="+"]');
    await wait(200);

    const formula = await alice.eval(`document.getElementById('m24-formula-text').textContent`);
    console.log(`  ✓ 算式栏实时显示拼凑内容: "${formula}"`);

    await alice.captureScreenshot('human_playtest_math24.png');
    console.log('\n======================================================================');
    console.log('🎉 Hermes 拟人操作测试全链路通关！真实按键、真机DOM、真实点击拼凑算式 100% 成功！');
    console.log('======================================================================\n');

    ws1.close();
    ws2.close();
  } finally {
    chromeProc.kill('SIGKILL');
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  }
}

runHumanPlaytest().catch(e => {
  console.error('\n❌ 拟人测试失败:', e);
  process.exit(1);
});
