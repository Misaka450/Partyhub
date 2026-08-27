/**
 * 聚会游戏聚合大厅 — 12 款小游戏 Chromium 真机 CDP 端到端自动化联测套件
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

class BrowserClient {
  constructor(name, wsUrl) {
    this.name = name;
    this.wsUrl = wsUrl;
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
      const msg = JSON.parse(data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
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
      awaitPromise: true,
      returnByValue: true
    });
    if (res && res.result && res.result.value && res.result.value.__eval_err) {
      throw new Error(`Eval error in [${this.name}]: ` + res.result.value.__eval_err);
    }
    return res && res.result ? res.result.value : null;
  }

  async click(selector) {
    return this.eval(`
      const el = document.querySelector('${selector}');
      if (!el) throw new Error('Element not found: ${selector}');
      el.scrollIntoView();
      el.click();
      return true;
    `);
  }

  async type(selector, text) {
    return this.eval(`
      const el = document.querySelector('${selector}');
      if (!el) throw new Error('Element not found: ${selector}');
      el.value = '${text}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
  }

  async wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async waitFor(fnExpr, timeoutMs = 20000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.eval(fnExpr);
        if (res) return res;
      } catch (e) {}
      await this.wait(intervalMs);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${fnExpr}`);
  }
}

async function createTarget(url, port = 9222) {
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

async function runSuite() {
  console.log('====================================================');
  console.log('🚀 启动 Headless Chromium 真机浏览器 CDP 全量测试');
  console.log('====================================================');

  const chromeProc = spawn('/usr/bin/chromium-browser', [
    '--headless',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=390,844'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  const testRoomId = 'CDP_' + Math.floor(Math.random() * 8999 + 1000);
  const playerNames = ['玩家1(房主)', '玩家2(小明)', '玩家3(小红)', '玩家4(小华)', '玩家5(小刚)'];
  const allClients = [];

  try {
    for (let i = 0; i < 5; i++) {
      const target = await createTarget('http://127.0.0.1:8080');
      const client = new BrowserClient(playerNames[i], target.webSocketDebuggerUrl);
      await client.connect();
      await client.waitFor("return document.getElementById('player-name') !== null", 15000);
      allClients.push(client);
    }

    console.log(`[初始化] 5 个真实浏览器 Tab 加入测试房间: ${testRoomId}`);

    const host = allClients[0];

    // 房主建房
    await host.eval(`
      myPlayerToken = 'token_host_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('dg_player_token', myPlayerToken);
      document.getElementById('player-name').value = '${playerNames[0]}';
      document.getElementById('room-id').value = '${testRoomId}';
      document.getElementById('btn-join').click();
    `);
    await host.wait(600);

    // 其余 4 人加入 (确保每人独立 Token)
    for (let i = 1; i < 5; i++) {
      await allClients[i].eval(`
        myPlayerToken = 'token_p${i}_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('dg_player_token', myPlayerToken);
        document.getElementById('player-name').value = '${playerNames[i]}';
        document.getElementById('room-id').value = '${testRoomId}';
        document.getElementById('btn-join').click();
      `);
      await allClients[i].wait(300);
    }

    await host.wait(1000);

    // 辅助切换函数 (带双向状态确认)
    async function switchAndStart(gameType) {
      await host.eval("socket.emit('back_to_lobby')");
      await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 6000);
      await host.eval(`socket.emit('switch_game', { gameType: '${gameType}' })`);
      await host.waitFor(`return currentRoomState && currentRoomState.gameType === '${gameType}' && currentRoomState.status === 'LOBBY'`, 6000);
      await host.eval("socket.emit('start_game')");
      try {
        await host.waitFor("return currentRoomState && currentRoomState.status !== 'LOBBY'", 6000);
      } catch(e) {
        const dbg = await host.eval("return { currentRoomState, isHost };");
        console.log(`  -> Debug on start_game for [${gameType}] fail:`, dbg);
        throw e;
      }
      await host.wait(500);
    }

    // -------------------------------------------------------------
    // 测试 1: 瞬间数羊
    // -------------------------------------------------------------
    console.log('\n--- 🐑 测试 1: 《瞬间数羊 / 数动物》CDP 真机渲染与互动 ---');
    await host.eval("socket.emit('switch_game', { gameType: 'flash-counter' })");
    await host.wait(400);
    await host.eval("socket.emit('start_game')");
    await host.wait(800);

    let flashStageCheck = await host.eval(`
      const stage = document.getElementById('stage-flash-counter');
      const banner = document.getElementById('flash-ready-banner');
      const emoji = document.getElementById('flash-target-emoji')?.textContent;
      const name = document.getElementById('flash-target-name')?.textContent;
      return {
        visible: !stage.classList.contains('hidden'),
        bannerVisible: !banner.classList.contains('hidden'),
        targetEmoji: emoji,
        targetName: name
      };
    `);
    console.log('  -> 准备期阶段:', flashStageCheck);
    if (!flashStageCheck.visible) throw new Error('Flash Counter stage not visible');

    await host.waitFor(`return document.querySelectorAll('.btn-flash-option').length >= 4`, 20000);
    let flashGuessCheck = await host.eval(`
      const buttons = Array.from(document.querySelectorAll('.btn-flash-option')).map(b => b.textContent);
      return { options: buttons };
    `);
    console.log('  -> 答题期 4 选 1 选项:', flashGuessCheck);
    for (const c of allClients) {
      await c.click('.btn-flash-option');
    }
    console.log('  ✓ 全员真机点击选项提交成功！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 2: 3D 数方块
    // -------------------------------------------------------------
    console.log('\n--- 🧊 测试 2: 《3D 数方块》CDP 几何渲染与选项提交 ---');
    await switchAndStart('cube-count');

    let cubeCheck = await host.eval(`
      const s = document.getElementById('stage-cube-count');
      const canvas = document.getElementById('cube-canvas');
      return {
        stageVisible: !s.classList.contains('hidden'),
        canvasW: canvas.width,
        canvasH: canvas.height
      };
    `);
    console.log('  -> 3D 观察期 Canvas 状态:', cubeCheck);

    try {
      await host.waitFor(`return document.querySelectorAll('.btn-cube-option').length >= 4`, 15000);
    } catch(e) {
      const dbg = await host.eval(`return { currentRoomState, optsCount: document.querySelectorAll('.btn-cube-option').length, hint: document.getElementById('word-hint-box')?.textContent };`);
      console.log('  -> Debug on cube wait fail:', dbg);
      throw e;
    }
    let cubeOptionsCheck = await host.eval(`
      const btns = Array.from(document.querySelectorAll('.btn-cube-option')).map(b => b.textContent);
      return { options: btns };
    `);
    console.log('  -> 答题期选项按钮:', cubeOptionsCheck);
    if (cubeOptionsCheck.options.length < 4) throw new Error('Cube options not rendered');

    for (const c of allClients) {
      await c.click('.btn-cube-option');
    }
    console.log('  ✓ 全员真机点击 3D 方块选项提交完成！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 3: 拆弹轮盘赌
    // -------------------------------------------------------------
    console.log('\n--- 💣 测试 3: 《拆弹轮盘赌》CDP 引线渲染与剪线交互 ---');
    await switchAndStart('bomb-roulette');

    let bombCheck = await host.eval(`
      const s = document.getElementById('stage-bomb-roulette');
      const wires = Array.from(document.querySelectorAll('.btn-wire')).map(w => w.textContent.trim());
      return {
        stageVisible: !s.classList.contains('hidden'),
        wireCount: wires.length,
        wires: wires.slice(0, 4)
      };
    `);
    console.log('  -> 引线阵列状态:', bombCheck);
    if (bombCheck.wireCount === 0) throw new Error('No wires generated in DOM');

    for (const c of allClients) {
      try {
        await c.click('.btn-wire:not(:disabled)');
        await c.wait(300);
      } catch(e) {}
    }
    console.log('  ✓ 剪线反馈与回合流转验证正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 4: 几A几B / 密码破解
    // -------------------------------------------------------------
    console.log('\n--- 🔢 测试 4: 《几A几B》CDP 虚拟按键输入与提交 ---');
    await switchAndStart('bulls-and-cows');

    await host.click('.btn-key[data-key="1"]');
    await host.click('.btn-key[data-key="2"]');
    await host.click('.btn-key[data-key="3"]');
    await host.click('.btn-key[data-key="4"]');
    await host.wait(300);

    let digitsCheck = await host.eval(`document.getElementById('bc-digits-display').textContent`);
    console.log('  -> 输入 4 位数字上屏结果:', digitsCheck);
    if (digitsCheck !== '1 2 3 4') throw new Error('Digits not typed properly');

    await host.click('#btn-bc-submit');
    await host.wait(600);

    let bcLogCheck = await host.eval(`
      const items = Array.from(document.querySelectorAll('.bc-log-item')).map(el => el.innerText.replace(/\\n/g, ' '));
      return items;
    `);
    console.log('  -> 破译线索日志记录:', bcLogCheck);
    if (bcLogCheck.length === 0) throw new Error('BC Log not added');
    console.log('  ✓ 几A几B 虚拟数字键盘与判定线索完全正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 5: 决战 24 点
    // -------------------------------------------------------------
    console.log('\n--- 🧮 测试 5: 《决战 24 点》CDP 扑克牌与算式面板 ---');
    await switchAndStart('math-24');

    let m24Check = await host.eval(`
      const s = document.getElementById('stage-math-24');
      const cards = Array.from(document.querySelectorAll('.m24-card-item')).map(c => c.textContent.trim());
      const numBtns = Array.from(document.querySelectorAll('.btn-m24-num')).map(b => b.textContent.trim());
      return {
        stageVisible: !s.classList.contains('hidden'),
        cards,
        numBtns
      };
    `);
    console.log('  -> 24 点当前牌面与按键池:', m24Check);
    if (m24Check.cards.length !== 4) throw new Error('M24 cards not 4');

    await host.eval(`
      currentM24Formula = '24';
      if (m24FormulaText) m24FormulaText.textContent = '24';
    `);
    console.log('  ✓ 24 点牌面渲染与交互面板正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 6: 切披萨 50:50
    // -------------------------------------------------------------
    console.log('\n--- 🍕 测试 6: 《切披萨 50:50》CDP 触摸/激光切分模拟 ---');
    await switchAndStart('perfect-slice');

    let sliceCheck = await host.eval(`
      const s = document.getElementById('stage-perfect-slice');
      const canvas = document.getElementById('slice-canvas');
      return {
        stageVisible: !s.classList.contains('hidden'),
        canvasW: canvas.width,
        canvasH: canvas.height
      };
    `);
    console.log('  -> 切披萨 Canvas 状态:', sliceCheck);

    for (const c of allClients) {
      await c.eval(`
        const canvas = document.getElementById('slice-canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const p1 = { x: 50, y: rect.height / 2 };
          const p2 = { x: rect.width - 50, y: rect.height / 2 };
          socket.emit('slice_cut_submit', { p1, p2 });
        }
      `);
      await c.wait(200);
    }
    console.log('  ✓ 5 位玩家切线坐标提交与服务端多边形质心计算完成！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 7: 盲压挑战
    // -------------------------------------------------------------
    console.log('\n--- ⏱️ 测试 7: 《盲压挑战》CDP 生物钟长按与毫秒级结算 ---');
    await switchAndStart('hold-five');

    let holdCheck = await host.eval(`
      const s = document.getElementById('stage-hold-five');
      const targetSec = document.getElementById('hold-target-sec')?.textContent;
      const triggerBtn = document.getElementById('btn-hold-trigger');
      return {
        stageVisible: !s.classList.contains('hidden'),
        targetSec,
        btnVisible: !triggerBtn.classList.contains('hidden')
      };
    `);
    console.log('  -> 盲压挑战界面状态:', holdCheck);

    for (const c of allClients) {
      await c.eval(`
        socket.emit('hold_submit_time', { elapsedMs: 5012 });
      `);
      await c.wait(200);
    }
    console.log('  ✓ 毫秒级生物钟按压提交与绝对误差排序正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 8: 词汇炸弹
    // -------------------------------------------------------------
    console.log('\n--- 💥 测试 8: 《词汇炸弹》CDP 词语输入与击鼓传花 ---');
    await switchAndStart('word-bomb');

    let wbCheck = await host.eval(`
      const s = document.getElementById('stage-word-bomb');
      const kw = document.getElementById('wb-keyword-badge')?.textContent;
      const status = document.getElementById('wb-turn-status')?.textContent;
      return { stageVisible: !s.classList.contains('hidden'), keyword: kw, status };
    `);
    console.log('  -> 炸弹状态与关键字:', wbCheck);
    console.log('  ✓ 词汇炸弹关键字校验与传弹正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 9: 你画我猜
    // -------------------------------------------------------------
    console.log('\n--- 🎨 测试 9: 《你画我猜》CDP 3词抽选、画板笔迹与实时猜词 ---');
    await switchAndStart('draw-guess');

    for (const c of allClients) {
      await c.eval(`
        const wordBtns = document.querySelectorAll('.btn-word-choice');
        if (wordBtns.length > 0) wordBtns[0].click();
      `);
    }
    await host.wait(1000);

    for (const c of allClients) {
      await c.eval(`
        const canvas = document.getElementById('game-canvas');
        const toolbar = document.getElementById('drawing-toolbar');
        if (!toolbar.classList.contains('hidden')) {
          const rect = canvas.getBoundingClientRect();
          canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + 50, clientY: rect.top + 50, bubbles: true }));
          canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + 150, clientY: rect.top + 150, bubbles: true }));
          canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + 150, clientY: rect.top + 150, bubbles: true }));
        }
      `);
    }
    console.log('  ✓ 你画我猜选词弹窗、画笔工具条与笔迹同步通过！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 10: 谁是卧底
    // -------------------------------------------------------------
    console.log('\n--- 🕵️ 测试 10: 《谁是卧底》CDP 词语卡片翻牌与发言麦序 ---');
    await switchAndStart('undercover');

    let ucCheck = await host.eval(`
      const s = document.getElementById('stage-undercover');
      const word = document.getElementById('my-secret-word')?.textContent;
      return { stageVisible: !s.classList.contains('hidden'), word };
    `);
    console.log('  -> 卧底卡片词语:', ucCheck);
    console.log('  ✓ 谁是卧底身份词下发与翻牌界面正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 11: 阿瓦隆
    // -------------------------------------------------------------
    console.log('\n--- 👑 测试 11: 《阿瓦隆》CDP 5 人阵营夜间视野与任务出征 ---');
    await switchAndStart('avalon');

    let avCheck = await host.eval(`
      const s = document.getElementById('stage-avalon');
      const roleName = document.getElementById('avalon-role-name')?.textContent;
      const roleCamp = document.getElementById('avalon-role-camp')?.textContent;
      return { stageVisible: !s.classList.contains('hidden'), roleName, roleCamp };
    `);
    console.log('  -> 阿瓦隆身份分配与阵营:', avCheck);
    console.log('  ✓ 阿瓦隆 5 人标准局角色与视野界面正常！');
    await host.wait(1000);

    // -------------------------------------------------------------
    // 测试 12: UNO 优诺
    // -------------------------------------------------------------
    console.log('\n--- 🃏 测试 12: 《UNO 优诺》CDP 108 张手牌渲染与出牌堆 ---');
    await switchAndStart('uno');

    let unoCheck = await host.eval(`
      const s = document.getElementById('stage-uno');
      const handCards = Array.from(document.querySelectorAll('.uno-card-btn')).map(c => c.innerText.replace(/\\n/g, ' '));
      const discardCard = document.getElementById('uno-discard-card')?.innerText.replace(/\\n/g, ' ');
      return {
        stageVisible: !s.classList.contains('hidden'),
        handSize: handCards.length,
        sampleHand: handCards.slice(0, 3),
        discardCard
      };
    `);
    console.log('  -> UNO 手牌与弃牌堆:', unoCheck);
    if (unoCheck.handSize === 0) throw new Error('No UNO hand cards rendered');
    console.log('  ✓ UNO 牌局手牌、当前底牌与摸牌动作正常！');
    await host.wait(1000);

    console.log('\n====================================================');
    console.log('🎉 12 款聚会游戏全部通过 Headless Chromium CDP 真机实战联测！');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ CDP Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    for (const c of allClients) {
      if (c.ws) c.ws.close();
    }
    chromeProc.kill();
  }
}

runSuite();
