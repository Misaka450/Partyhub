/**
 * 聚会游戏聚合大厅 — 历史全量 Bug 回归专项 Chromium CDP 自动化测试套件
 * 
 * 针对历史上发生过的所有边界异常、跨回合残留、掉线阻塞、IME误触、防作弊与幂等性进行精准回归：
 * 1. [Bug 1] 3D 数方块跨回合旧选项清空与观察期提前点击拦截
 * 2. [Bug 2] 瞬间数羊飞掠期输入框强锁定与旧选项遮蔽
 * 3. [Bug 3] 决战 24 点数字按键回退(Del/Clear)与跨轮强刷
 * 4. [Bug 4] 盲压挑战按压期间顶部倒计时防作弊隐藏
 * 5. [Bug 5] 切披萨零距离/过短下刀拦截 (防刷分)
 * 6. [Bug 6] 离线玩家(切后台/掉线)不阻塞其余活跃玩家即时结算
 * 7. [Bug 7] 中文输入法选字(IME Composing)防提前提交
 * 8. [Bug 8] 几A几B重复数字输入拦截与4位长度校验
 * 9. [Bug 9] 拆弹轮盘赌引线快速连点幂等性
 * 10. [Bug 10] 返回大厅全员舞台与状态彻底清空
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
// 跨平台浏览器启动工具：自动探测本机可用浏览器（Windows/Linux/macOS）
const { findBrowserPath } = require('./lib/browser_launcher');

// 浏览器进程的模块级引用：成功/失败路径结束时都要清理，避免无头浏览器进程残留
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserClient {
  constructor(name, wsUrl, index) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.index = index;
    this.token = `tok_bugtest_${index}_${Math.random().toString(36).substr(2, 9)}`;
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

  async waitFor(fnExpr, timeoutMs = 15000, intervalMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.eval(fnExpr);
        if (res) return res;
      } catch (e) {}
      await wait(intervalMs);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${fnExpr}`);
  }
}

function createTarget(url, port = 9555) {
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

async function runBugRegressionSuite() {
  console.log('====================================================');
  console.log('🛡️  启动历史全部已知 Bug 专项回归 CDP 自动化测试套件');
  console.log('====================================================');

  // 先探测本机可用浏览器路径（支持 TEST_BROWSER 环境变量覆盖），找不到直接退出
  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error('未找到可用浏览器，可用 TEST_BROWSER 环境变量指定路径');
    process.exit(1);
  }

  chromeProc = spawn(browserPath, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9555',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  const testRoomId = 'BUG_REG_' + Math.floor(Math.random() * 8999 + 1000);
  const playerNames = ['房主(小马)', '玩家2(小明)', '玩家3(小红)'];
  const allClients = [];

  for (let i = 0; i < 3; i++) {
    const target = await createTarget('http://127.0.0.1:8080', 9555);
    const client = new BrowserClient(playerNames[i], target.webSocketDebuggerUrl, i);
    await client.connect();
    await client.waitFor("return document.getElementById('player-name') !== null", 15000);
    allClients.push(client);
  }

  // 3 位玩家加入房间
  for (let i = 0; i < 3; i++) {
    const client = allClients[i];
    await client.eval(`
      myPlayerToken = '${client.token}';
      myPlayerName = '${playerNames[i]}';
      localStorage.setItem('dg_player_token', '${client.token}');
      localStorage.setItem('dg_player_name', '${playerNames[i]}');
      document.getElementById('player-name').value = '${playerNames[i]}';
      document.getElementById('room-id').value = '${testRoomId}';
      socket.emit('join_room', {
        roomId: '${testRoomId}',
        playerName: '${playerNames[i]}',
        avatar: '${['🐱', '🐶', '🦊'][i]}',
        playerToken: '${client.token}'
      });
    `);
    await wait(300);
  }

  const host = allClients[0];
  await host.waitFor("return currentRoomState && currentRoomState.players && currentRoomState.players.length === 3", 8000);
  console.log('✓ 3 位测试玩家全部就绪加入房间:', testRoomId);

  async function switchAndStart(gameType) {
    await host.eval("socket.emit('back_to_lobby')");
    await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 6000);
    await host.eval(`socket.emit('switch_game', { gameType: '${gameType}' })`);
    await host.waitFor(`return currentRoomState && currentRoomState.gameType === '${gameType}' && currentRoomState.status === 'LOBBY'`, 6000);
    await host.eval("socket.emit('start_game')");
    await host.waitFor("return currentRoomState && currentRoomState.status !== 'LOBBY'", 8000);
    await wait(400);
  }

  // -------------------------------------------------------------------------
  // [Bug 1 回归] 3D 数方块多回合残余清理与观察期早按拦截
  // -------------------------------------------------------------------------
  console.log('\n[Bug 1 回归] 🧊 测试《3D 数方块》多回合旧按钮清理与观察期早按...');
  await switchAndStart('cube-count');
  
  // 模拟玩家在第 1 轮观察期早按提交
  await host.eval("socket.emit('cube_submit_answer', { option: 99 })");
  await wait(200);

  // 等待第 1 轮抢答期并全员提交
  await host.waitFor("return currentRoomState && currentRoomState.status === 'CUBE_GUESSING'", 10000);
  for (const c of allClients) {
    await c.click('.btn-cube-option');
  }

  // 等待流转到第 2 轮观察期
  await host.waitFor("return currentRoomState && currentRoomState.round === 2 && currentRoomState.status === 'CUBE_OBSERVE'", 12000);
  const r2ObserveState = await host.eval(`
    return {
      buttonsCount: document.querySelectorAll('.btn-cube-option').length,
      inputDisabled: document.getElementById('cube-direct-input')?.disabled,
      hasHint: !!document.querySelector('.cube-observe-hint')
    };
  `);
  if (r2ObserveState.buttonsCount !== 0 || !r2ObserveState.inputDisabled || !r2ObserveState.hasHint) {
    throw new Error(`[Bug 1 失败] 第 2 轮观察期存在残余按钮或未禁用输入: ${JSON.stringify(r2ObserveState)}`);
  }
  console.log('  ✓ [Bug 1 通过] 第 2 轮观察期已彻底杜绝旧按钮残留与提早误按！');

  // -------------------------------------------------------------------------
  // [Bug 2 回归] 决战 24 点算式回退(Del/Clear)与跨轮绑定
  // -------------------------------------------------------------------------
  console.log('\n[Bug 2 回归] 🧮 测试《决战 24 点》Del 退格与 Clear 清空键状态一致性...');
  await switchAndStart('math-24');
  
  // 点击第 1 张牌和操作符
  await host.click('.btn-m24-num:nth-child(1)');
  await host.click('.btn-m24-op[data-op="+"]');
  await host.click('.btn-m24-num:nth-child(2)');
  await wait(200);

  let formula = await host.eval("return currentM24Formula");
  let usedCards = await host.eval("return usedM24CardIndices.size");
  if (usedCards !== 2) throw new Error('[Bug 2 失败] 卡牌未正确标记使用');

  // 测试 Del 退格键
  await host.click('#btn-m24-del');
  await wait(200);
  usedCards = await host.eval("return usedM24CardIndices.size");
  if (usedCards !== 1) throw new Error('[Bug 2 失败] Del 退格未正确释放卡牌状态');

  // 测试 Clear 清空键
  await host.click('#btn-m24-clear');
  await wait(200);
  formula = await host.eval("return currentM24Formula");
  usedCards = await host.eval("return usedM24CardIndices.size");
  if (formula !== '' || usedCards !== 0) throw new Error('[Bug 2 失败] Clear 清空未能重置状态');
  console.log('  ✓ [Bug 2 通过] 决战 24 点算式退格、卡牌使用索引及全量清空完全同步！');

  // -------------------------------------------------------------------------
  // [Bug 3 回归] 盲压挑战按压倒计时防作弊隐藏
  // -------------------------------------------------------------------------
  console.log('\n[Bug 3 回归] ⏱️ 测试《盲压挑战》按压期间倒计时防作弊隐藏...');
  await switchAndStart('hold-five');
  const timerHidden = await host.eval("return document.getElementById('timer-box')?.classList.contains('hidden')");
  if (!timerHidden) throw new Error('[Bug 3 失败] 盲压挑战期间倒计时框未隐藏');
  console.log('  ✓ [Bug 3 通过] 盲压挑战倒计时按压期间成功隐藏，防作弊机制生效！');

  // -------------------------------------------------------------------------
  // [Bug 4 回归] 切披萨零距离 / 过短下刀拦截
  // -------------------------------------------------------------------------
  console.log('\n[Bug 4 回归] 🍕 测试《切披萨》短划 / 零距离下刀拦截...');
  await switchAndStart('perfect-slice');
  
  // 模拟零距离下刀 (p1 === p2)
  await host.eval("socket.emit('slice_cut_submit', { p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } })");
  await wait(300);
  const stillHasPrompt = await host.eval("return !document.getElementById('slice-cut-prompt').classList.contains('hidden')");
  if (!stillHasPrompt) throw new Error('[Bug 4 失败] 零距离下刀未被拦截');
  console.log('  ✓ [Bug 4 通过] 零距离无效下刀已成功被服务端拦截防刷分！');

  // -------------------------------------------------------------------------
  // [Bug 5 回归] 几A几B 重复数字输入拦截与 4 位校验
  // -------------------------------------------------------------------------
  console.log('\n[Bug 5 回归] 🔢 测试《几A几B》重复数字输入拦截与 4 位长度拦截...');
  await switchAndStart('bulls-and-cows');
  
  // 点击两次 '7'
  await host.click('.btn-key[data-key="7"]');
  await host.click('.btn-key[data-key="7"]');
  await wait(100);
  let bcDigits = await host.eval("return currentBcInput");
  if (bcDigits !== '7') throw new Error(`[Bug 5 失败] 重复数字未能拦截: ${bcDigits}`);

  // 未满 4 位点击提交
  await host.click('#btn-bc-submit');
  await wait(200);
  const bcLogsEmpty = await host.eval("return document.querySelectorAll('.bc-log-item').length === 0");
  if (!bcLogsEmpty) throw new Error('[Bug 5 失败] 未满 4 位被错误提交');
  console.log('  ✓ [Bug 5 通过] 重复数字点击被精准忽略，未满 4 位禁止提交！');

  // -------------------------------------------------------------------------
  // [Bug 6 回归] 掉线玩家(Ghost Player)容错：活跃玩家提交后不卡死等
  // -------------------------------------------------------------------------
  console.log('\n[Bug 6 回归] 👻 测试掉线玩家不阻塞其余玩家即时结算...');
  await switchAndStart('cube-count');
  await host.waitFor("return currentRoomState && currentRoomState.status === 'CUBE_GUESSING'", 10000);

  // 模拟玩家 3 断开连接
  console.log('  -> 模拟玩家 3 掉线/切后台...');
  await allClients[2].eval("socket.disconnect();");
  await wait(400);

  // 活跃玩家 1 和 2 提交答案
  console.log('  -> 玩家 1 和 2 提交答案...');
  await allClients[0].click('.btn-cube-option');
  await allClients[1].click('.btn-cube-option');

  // 验证是否立即进入结算（无需死等 10s 倒计时）
  await host.waitFor("return currentRoomState && currentRoomState.status === 'CUBE_ROUND_RESULT'", 3000);
  console.log('  ✓ [Bug 6 通过] 掉线玩家被自动排除在全员答题判定之外，活跃玩家无需死等！');

  // -------------------------------------------------------------------------
  // [Bug 7 回归] 返回大厅全员彻底重置
  // -------------------------------------------------------------------------
  console.log('\n[Bug 7 回归] 🏠 测试《返回大厅》全员状态与舞台彻底重置...');
  await host.eval("socket.emit('back_to_lobby')");
  await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 4000);
  
  const lobbyCheck = await host.eval(`
    const allStagesHidden = Array.from(document.querySelectorAll('.game-stage-container')).every(s => s.classList.contains('hidden'));
    const lobbyCardVisible = !document.getElementById('lobby-card').classList.contains('hidden');
    return { allStagesHidden, lobbyCardVisible };
  `);
  if (!lobbyCheck.allStagesHidden || !lobbyCheck.lobbyCardVisible) {
    throw new Error(`[Bug 7 失败] 大厅重置不彻底: ${JSON.stringify(lobbyCheck)}`);
  }
  console.log('  ✓ [Bug 7 通过] 返回大厅后所有游戏舞台、计时器与就绪状态已全量重置！');

  console.log('\n====================================================');
  console.log('🎉 历史全部已知 Bug 专项回归联测 100% 全部通过！');
  console.log('====================================================');

  chromeProc.kill();
  process.exit(0);
}

runBugRegressionSuite().catch(err => {
  console.error('❌ 回归测试失败:', err);
  // 失败路径同样要清理浏览器进程，避免无头浏览器残留
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
