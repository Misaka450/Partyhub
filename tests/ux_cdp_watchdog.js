/**
 * ==============================================================================
 * 🛡️ 聚会游戏大厅体验级看门狗自动化测试套件 (UX & Visual CDP Watchdog Suite)
 * ------------------------------------------------------------------------------
 * 针对历史严重痛点，强制推行三大防护体系：
 * 1. 【全链路参数闭环看门狗】：断言房主配置变更能真实穿透并改变后端算法输出；
 * 2. 【DOM 视觉与人机工程看门狗】：真实挂载 Chromium 测量视窗与交互元素像素尺寸；
 * 3. 【视觉状态机与对比度看门狗】：逐帧校验竞猜与揭晓态的滤镜、背光与光影反差。
 * ==============================================================================
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

// 导入核心算法模块用于参数贯通测试
const cubeCount = require('../games/cubeCount');
const math24 = require('../games/math24');
const shadowMatch = require('../games/shadowMatch');

const CDP_PORT = 9448;
const SERVER_URL = 'http://127.0.0.1:8080';
let chromeProc = null;
let serverProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkServerAlive(url) {
  return new Promise((resolve) => {
    const req = http.get(url, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
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

// -----------------------------------------------------------------------------
// 1. 全链路参数闭环看门狗 (Parameter Pipeline Watchdog)
// -----------------------------------------------------------------------------
function testParameterPipeline() {
  console.log('\n🔍 [看门狗 1/3] 执行全链路参数闭环贯通检验...');

  // 1.1 3D数方块：验证 standard 与 hard 的方块生成量具备显著阶梯级数学差异
  let stdCounts = [];
  let hardCounts = [];
  for (let i = 0; i < 60; i++) {
    const s = cubeCount.generateCubeGrid(2, 'standard');
    const h = cubeCount.generateCubeGrid(2, 'hard');
    stdCounts.push(s.totalCubes);
    hardCounts.push(h.totalCubes);
    assert.strictEqual(s.options.length, 4, '标准模式候选项必须为 4');
    assert.strictEqual(h.options.length, 4, '进阶模式候选项必须为 4');
    assert.ok(s.options.includes(s.totalCubes), '标准模式候选项必须包含正确答案');
    assert.ok(h.options.includes(h.totalCubes), '进阶模式候选项必须包含正确答案');
  }
  const avgStd = stdCounts.reduce((a, b) => a + b, 0) / stdCounts.length;
  const avgHard = hardCounts.reduce((a, b) => a + b, 0) / hardCounts.length;
  assert.ok(avgHard >= avgStd + 4, `进阶模式平均方块数(${avgHard.toFixed(1)})必须显著高于标准模式(${avgStd.toFixed(1)})`);
  console.log(`  ✓ 3D数方块复杂度参数联动正常 (标准: ${avgStd.toFixed(1)} 块 vs 进阶: ${avgHard.toFixed(1)} 块)`);

  // 1.2 影子猜物：防重池与全库跨分类生成闭环
  const used = [];
  for (let r = 1; r <= 5; r++) {
    const p = shadowMatch.generateShadowPuzzle(r, used);
    assert.ok(!used.includes(p.targetId), '同一局内抽出的谜题不得重复');
    assert.ok(p.targetEmoji && p.targetEmoji.length > 0, '目标 Emoji 不得为空');
    used.push(p.targetId);
  }
  console.log('  ✓ 影子猜物防重机制与多轮题目生成正常');

  // 1.3 决战24点：动态发牌解法保证
  for (let r = 1; r <= 3; r++) {
    const cards = math24.getRandom24Puzzle(r);
    assert.strictEqual(cards.length, 4, '发牌张数必须为 4');
    assert.ok(math24.solve24(cards), `发出的扑克牌 ${JSON.stringify(cards)} 必须具备严格 24 点解法`);
  }
  console.log('  ✓ 决战24点全动态发牌解法验证正常');

  console.log('  ✅ [看门狗 1/3] 参数全链路闭环测试 100% 通过！');
}

// -----------------------------------------------------------------------------
// 2. DOM 视觉尺寸与人机工程看门狗 (Visual & HCI Dimensions Watchdog)
// -----------------------------------------------------------------------------
async function testDomAndHciDimensions(wsSend) {
  console.log('\n📐 [看门狗 2/3] 执行真机 DOM 视觉尺寸与人体工学下限断言...');

  const metrics = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      // 挂载真实大厅游戏舞台结构
      const testRoot = document.createElement('div');
      testRoot.id = 'ux-watchdog-mount';
      testRoot.innerHTML = \`
        <!-- 影子猜物舞台 -->
        <div class="shadow-box-container" id="w-shadow-box">
          <div class="shadow-spotlight-beam" id="w-shadow-beam"></div>
          <div class="shadow-target-display">
            <span class="shadow-emoji" id="w-shadow-emoji">🐱</span>
          </div>
        </div>
        <!-- 轨道小火车地图与按钮 -->
        <div class="train-board-grid" id="w-train-grid">
          <div class="train-cell" id="w-train-cell">🛤️</div>
        </div>
        <div class="train-options-dock" id="w-train-dock">
          <button class="train-opt-btn" id="w-train-btn">直</button>
        </div>
        <!-- 折纸打孔预览与网格 -->
        <div class="hole-folded-preview" id="w-hole-prev">
          <div class="punch-indicator-dot" id="w-hole-dot"></div>
        </div>
        <div class="hole-mini-grid" id="w-hole-grid">
          <div class="hole-mini-cell has-hole" id="w-hole-cell"></div>
        </div>
        <!-- 西蒙节拍圆盘与按键 -->
        <div class="simon-disk-container" id="w-simon-disk">
          <button class="simon-btn simon-red" id="w-simon-btn"></button>
          <div class="simon-center-hub" id="w-simon-hub">3/3</div>
        </div>
        <!-- 偷吃怪餐盘与食物 -->
        <div class="disappear-plate-container" id="w-plate">
          <div class="disappear-food-item" id="w-food">🍣</div>
        </div>
      \`;
      document.body.appendChild(testRoot);

      const getR = id => document.getElementById(id).getBoundingClientRect();
      const getS = id => window.getComputedStyle(document.getElementById(id));

      const shadowBoxR = getR('w-shadow-box');
      const shadowEmojiS = getS('w-shadow-emoji');
      const trainGridR = getR('w-train-grid');
      const trainCellR = getR('w-train-cell');
      const trainBtnR = getR('w-train-btn');
      const holePrevR = getR('w-hole-prev');
      const holeGridR = getR('w-hole-grid');
      const holeCellR = getR('w-hole-cell');
      const simonDiskR = getR('w-simon-disk');
      const simonBtnR = getR('w-simon-btn');
      const plateR = getR('w-plate');
      const foodS = getS('w-food');

      return {
        shadowBox: { w: Math.round(shadowBoxR.width), h: Math.round(shadowBoxR.height) },
        shadowEmoji: { fontSize: shadowEmojiS.fontSize, filter: shadowEmojiS.filter },
        trainGrid: { w: Math.round(trainGridR.width), h: Math.round(trainGridR.height) },
        trainCell: { w: Math.round(trainCellR.width), h: Math.round(trainCellR.height) },
        trainBtn: { w: Math.round(trainBtnR.width), h: Math.round(trainBtnR.height) },
        holePrev: { w: Math.round(holePrevR.width), h: Math.round(holePrevR.height) },
        holeGrid: { w: Math.round(holeGridR.width), h: Math.round(holeGridR.height) },
        holeCell: { w: Math.round(holeCellR.width), h: Math.round(holeCellR.height) },
        simonDisk: { w: Math.round(simonDiskR.width), h: Math.round(simonDiskR.height) },
        simonBtn: { w: Math.round(simonBtnR.width), h: Math.round(simonBtnR.height) },
        plate: { w: Math.round(plateR.width), minH: Math.round(plateR.height) },
        foodEmoji: { fontSize: foodS.fontSize }
      };
    })()`,
    returnByValue: true
  });

  if (!metrics || !metrics.result || !metrics.result.value) {
    console.error('⚠️ [Watchdog 调试] Runtime.evaluate 返回空或异常:', JSON.stringify(metrics));
  }

  const m = metrics?.result?.value || {};

  // 2.1 影子猜物舞台：杜绝 180×180
  assert.ok(m.shadowBox.w >= 360, `影子舞台宽度需 >= 360px，实测 ${m.shadowBox.w}px`);
  assert.ok(m.shadowBox.h >= 200, `影子舞台高度需 >= 200px，实测 ${m.shadowBox.h}px`);
  console.log(`  ✓ 影子猜物大画幅达标: ${m.shadowBox.w}px × ${m.shadowBox.h}px (Emoji: ${m.shadowEmoji.fontSize})`);

  // 2.2 轨道小火车：杜绝 210×210
  assert.ok(m.trainGrid.w >= 270, `铁路网格需 >= 270px，实测 ${m.trainGrid.w}px`);
  assert.ok(m.trainCell.w >= 70, `单个轨道格需 >= 70px，实测 ${m.trainCell.w}px`);
  assert.ok(m.trainBtn.h >= 48, `选轨按钮需满足人机工程 >= 48px，实测 ${m.trainBtn.h}px`);
  console.log(`  ✓ 轨道小火车视窗与触控靶心达标: 网格 ${m.trainGrid.w}px, 单格 ${m.trainCell.w}px, 按钮高 ${m.trainBtn.h}px`);

  // 2.3 折纸打孔：杜绝 100×100 与 72×72
  assert.ok(m.holePrev.w >= 130, `折纸预览需 >= 130px，实测 ${m.holePrev.w}px`);
  assert.ok(m.holeGrid.w >= 100, `折纸选项网格需 >= 100px，实测 ${m.holeGrid.w}px`);
  assert.ok(m.holeCell.w >= 20, `单孔单元格需 >= 20px，实测 ${m.holeCell.w}px`);
  console.log(`  ✓ 折纸打孔大画幅达标: 预览 ${m.holePrev.w}px, 网格 ${m.holeGrid.w}px, 单格 ${m.holeCell.w}px`);

  // 2.4 西蒙节拍：杜绝 220×220
  assert.ok(m.simonDisk.w >= 270, `西蒙圆盘需 >= 270px，实测 ${m.simonDisk.w}px`);
  assert.ok(m.simonBtn.w >= 110, `按键扇形触控靶心需 >= 110px，实测 ${m.simonBtn.w}px`);
  console.log(`  ✓ 西蒙节拍圆盘触控达标: 圆盘 ${m.simonDisk.w}px, 单键宽 ${m.simonBtn.w}px`);

  // 2.5 偷吃怪餐盘
  assert.ok(m.plate.w >= 360, `美食餐盘需 >= 360px，实测 ${m.plate.w}px`);
  assert.ok(m.plate.minH >= 160, `餐盘最小高度需 >= 160px，实测 ${m.plate.minH}px`);
  console.log(`  ✓ 偷吃怪餐盘容量达标: ${m.plate.w}px × ${m.plate.minH}px (食物: ${m.foodEmoji.fontSize})`);

  console.log('  ✅ [看门狗 2/3] DOM 视觉与人机工程测试 100% 通过！');
}

// -----------------------------------------------------------------------------
// 3. 视觉状态机与对比度看门狗 (Visual State Contrast Watchdog)
// -----------------------------------------------------------------------------
async function testVisualContrastStateMachine(wsSend) {
  console.log('\n🎭 [看门狗 3/3] 执行视觉状态机与光影对比度断言...');

  // 阶段 1: 竞猜状态断言
  const guessResult = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      const emoji = document.getElementById('w-shadow-emoji');
      const box = document.getElementById('w-shadow-box');
      const beam = document.getElementById('w-shadow-beam');
      emoji.classList.remove('revealed');
      box.classList.remove('revealed');
      const guessFilter = window.getComputedStyle(emoji).filter;
      const beamOpacity = window.getComputedStyle(beam).opacity;
      const beamDisplay = window.getComputedStyle(beam).display;
      return {
        guessFilter,
        beamVisible: beamDisplay !== 'none' && parseFloat(beamOpacity) > 0,
        isPureBlackGuess: guessFilter.includes('brightness(0)')
      };
    })()`,
    returnByValue: true
  });

  const g = guessResult.result.value;
  assert.ok(g.isPureBlackGuess, `竞猜态 Emoji 必须为纯黑剪影 (brightness(0))，实测: ${g.guessFilter}`);
  assert.ok(g.beamVisible, '竞猜态背后必须存在明亮聚光漫反射光束，确保黑白鲜明反差');
  console.log(`  ✓ 竞猜状态: 黑色剪影 (filter: ${g.guessFilter}), 白金背光生效 (${g.beamVisible})`);

  // 触发进入阶段 2: 揭晓状态，并等待 transition 过渡帧渲染完毕 (0.45s)
  await wsSend('Runtime.evaluate', {
    expression: `(() => {
      const emoji = document.getElementById('w-shadow-emoji');
      const box = document.getElementById('w-shadow-box');
      emoji.classList.add('revealed');
      box.classList.add('revealed');
    })()`
  });

  await wait(500);

  const revealResult = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      const emoji = document.getElementById('w-shadow-emoji');
      const revealFilter = window.getComputedStyle(emoji).filter;
      return {
        revealFilter,
        isColorReveal: !revealFilter.includes('brightness(0)') && (revealFilter.includes('brightness(') || revealFilter === 'none')
      };
    })()`,
    returnByValue: true
  });

  const r = revealResult.result.value;
  assert.ok(r.isColorReveal, `揭晓态 Emoji 滤镜必须平滑恢复彩色原型，实测: ${r.revealFilter}`);
  console.log(`  ✓ 揭晓状态: 彩色还原 (filter: ${r.revealFilter})`);
  console.log('  ✅ [看门狗 3/4] 视觉状态机与光影对比度测试 100% 通过！');
}

// -----------------------------------------------------------------------------
// 4. 终局结算与颁奖台看门狗 (Podium & Game Over Watchdog)
// -----------------------------------------------------------------------------
async function testGameOverPodiumIntegrity(wsSend) {
  console.log('\n🏆 [看门狗 4/4] 执行终局结算颁奖台完整性断言 (杜绝空排行榜)...');

  const mockPayload = {
    scores: [
      { id: '1', name: '冠军玩家', avatar: '🥇', score: 280 },
      { id: '2', name: '亚军玩家', avatar: '🥈', score: 190 },
      { id: '3', name: '季军玩家', avatar: '🥉', score: 120 }
    ]
  };

  const result = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      // 模拟触发 shadow_game_over
      window.dispatchEvent(new CustomEvent('test_game_over'));
      // 调用公用 showGameOverModal 测试
      showGameOverModal({
        title: '测试终局结算',
        desc: '测试描述',
        podium: (${JSON.stringify(mockPayload)}).podium || (${JSON.stringify(mockPayload)}).scores || []
      });

      const body = document.getElementById('gameover-body');
      const cards = body ? body.querySelectorAll('.podium-card') : [];
      return {
        hasBody: !!body,
        cardCount: cards.length,
        firstWinner: cards[0]?.querySelector('.podium-name')?.textContent
      };
    })()`,
    returnByValue: true
  });

  const p = result.result.value;
  assert.ok(p.hasBody, '结算弹窗容器必须存在');
  assert.strictEqual(p.cardCount, 3, `颁奖台卡片必须完整渲染 3 名玩家，实测渲染了 ${p.cardCount} 张卡片`);
  assert.strictEqual(p.firstWinner, '冠军玩家', '榜首名称必须准确渲染');

  console.log(`  ✓ 结算弹窗卡片完整渲染: ${p.cardCount} 张 (冠军: ${p.firstWinner})`);
  console.log('  ✅ [看门狗 4/4] 终局结算颁奖台完整性测试 100% 通过！');
}

// -----------------------------------------------------------------------------
// 5. 全量游戏前端插件挂载与真实数据渲染消除占位符看门狗 (Plugin Mounting & Anti-Placeholder Watchdog)
// -----------------------------------------------------------------------------
async function testClientPluginsAndDomRendering(wsSend) {
  console.log('\n🧩 [看门狗 5/5] 执行全量游戏前端插件挂载与真实数据渲染消除占位符断言...');

  // 5.1 审计 21 款小游戏的前端插件与全局调度函数挂载契约
  const contractCheck = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      const requiredChecks = [
        { id: 'math-24', fn: 'renderMath24State', pluginKey: 'math-24' },
        { id: 'uno', fn: 'renderUnoState', pluginKey: 'uno' },
        { id: 'cube-count', fn: 'renderCubeCountState', pluginKey: 'cube-count' },
        { id: 'draw-guess', fn: 'renderDrawGuessState', pluginKey: 'draw-guess' },
        { id: 'undercover', fn: 'renderUndercoverState', pluginKey: 'undercover' },
        { id: 'avalon', fn: 'renderAvalonState', pluginKey: 'avalon' },
        { id: 'flash-counter', fn: 'renderFlashCounterState', pluginKey: 'flash-counter' },
        { id: 'bomb-roulette', fn: 'renderBombRouletteState', pluginKey: 'bomb-roulette' },
        { id: 'bulls-and-cows', fn: 'renderBullsAndCowsState', pluginKey: 'bulls-and-cows' },
        { id: 'word-bomb', fn: 'renderWordBombState', pluginKey: 'word-bomb' },
        { id: 'perfect-slice', fn: 'renderPerfectSliceState', pluginKey: 'perfect-slice' },
        { id: 'hold-five', fn: 'renderHoldFiveState', pluginKey: 'hold-five' },
        { id: 'simon-memory', fn: null, pluginKey: 'simon-memory' }
      ];

      return requiredChecks.map(c => {
        const hasPlugin = Boolean(window.PartyGames && window.PartyGames[c.pluginKey]);
        const hasFn = c.fn ? typeof window[c.fn] === 'function' : false;
        const hasPluginRender = Boolean(window.PartyGames && typeof window.PartyGames[c.pluginKey]?.renderState === 'function');
        return {
          id: c.id,
          ready: hasFn || hasPluginRender,
          detail: { hasPlugin, hasFn, hasPluginRender }
        };
      });
    })()`,
    returnByValue: true
  });

  const contracts = contractCheck?.result?.value || [];
  for (const c of contracts) {
    assert.ok(c.ready, `❌ 前端插件契约缺陷: 游戏 [${c.id}] 未在 window 挂载任何可调用的渲染函数 (PartyGames.renderState 或 window.render...)！`);
  }
  console.log(`  ✓ 全部 ${contracts.length} 款核心游戏插件挂载契约检查 100% 达标`);

  // 5.2 针对历史严重痛点《决战24点》：注入真实发牌状态，断言问号 '?' 必须被彻底消除，扑克数字与键盘键必须完整生成
  const m24RenderCheck = await wsSend('Runtime.evaluate', {
    expression: `(() => {
      const mockState = {
        game: 'math-24',
        round: 1,
        maxRounds: 3,
        timeLeft: 60,
        currentCards: [3, 8, 3, 8],
        players: []
      };

      // 触发真实渲染
      if (window.PartyGames && window.PartyGames['math-24']?.renderState) {
        window.PartyGames['math-24'].renderState(mockState);
      } else if (typeof window.renderMath24State === 'function') {
        window.renderMath24State(mockState);
      } else {
        return { error: '未找到 24 点渲染函数' };
      }

      const cardsRow = document.getElementById('m24-cards-row');
      const numBtns = document.getElementById('m24-num-buttons');
      const cardVals = Array.from(cardsRow ? cardsRow.querySelectorAll('.m24-card-val') : []).map(el => el.textContent.trim());
      const btnVals = Array.from(numBtns ? numBtns.querySelectorAll('.btn-m24-num') : []).map(el => el.textContent.trim());

      return {
        cardVals,
        btnVals,
        hasQuestionMark: cardVals.includes('?'),
        cardCount: cardVals.length,
        btnCount: btnVals.length
      };
    })()`,
    returnByValue: true
  });

  const m24 = m24RenderCheck?.result?.value || {};
  assert.ok(!m24.error, `24点真机渲染执行报错: ${m24.error}`);
  assert.strictEqual(m24.hasQuestionMark, false, '❌ 决战24点卡牌上仍残留初始问号模板 \"?\"，真实数字未注入渲染！');
  assert.strictEqual(m24.cardCount, 4, `24点卡牌必须渲染 4 张，实测 ${m24.cardCount} 张`);
  assert.deepStrictEqual(m24.cardVals, ['3', '8', '3', '8'], `24点卡牌面值必须精准为 [3, 8, 3, 8]，实测 ${JSON.stringify(m24.cardVals)}`);
  assert.deepStrictEqual(m24.btnVals, ['3', '8', '3', '8'], `24点数字按键必须完整生成 [3, 8, 3, 8]，实测 ${JSON.stringify(m24.btnVals)}`);
  console.log(`  ✓ 决战24点真机渲染闭环: 4张牌精准呈现 [${m24.cardVals.join(', ')}], 零残留问号模板, 动态键盘按键达标`);

  console.log('  ✅ [看门狗 5/5] 前端插件挂载与真实数据渲染消除占位符测试 100% 通过！');
}

// -----------------------------------------------------------------------------
// 主运行器
// -----------------------------------------------------------------------------
async function runWatchdog() {
  console.log('======================================================================');
  console.log('🛡️ 启动聚会大厅体验级看门狗自动化测试套件 (UX & Visual Watchdog)');
  console.log('======================================================================');

  // 第一步：参数贯通测试（纯逻辑级）
  testParameterPipeline();

  // 检查测试服务器是否在线，若未启动则自动唤起进程，并在测试结束后清理（防冷启动失败）
  const isServerOnline = await checkServerAlive(SERVER_URL);
  if (!isServerOnline) {
    serverProc = spawn(process.execPath, [path.join(__dirname, '../server.js')], { stdio: 'ignore' });
    await wait(1500);
  }

  // 第二步 & 第三步：真机 Chromium DOM 挂载测试
  const browserPath = findBrowserPath();
  if (!browserPath) {
    throw new Error('未探测到可用 Chromium 浏览器');
  }

  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=412,892',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  try {
    const target = await createTarget(SERVER_URL, CDP_PORT);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let msgId = 1;
    const pending = new Map();
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.id && pending.has(m.id)) pending.get(m.id)(m.result);
    });
    const wsSend = (method, params = {}) => new Promise(res => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await wsSend('Page.enable');
    await wsSend('Runtime.enable');
    
    // 智能等待页面加载完成（杜绝 document.body 为 null 的竞态条件）
    const startWait = Date.now();
    while (Date.now() - startWait < 6000) {
      const chk = await wsSend('Runtime.evaluate', {
        expression: 'Boolean(document && document.body && document.readyState === "complete")'
      });
      if (chk?.result?.value === true) break;
      await wait(100);
    }

    // 运行第二步、第三步、第四步与第五步
    await testDomAndHciDimensions(wsSend);
    await testVisualContrastStateMachine(wsSend);
    await testGameOverPodiumIntegrity(wsSend);
    await testClientPluginsAndDomRendering(wsSend);

    console.log('\n======================================================================');
    console.log('🎉 体验级看门狗套件 5/5 大核心指标全部验证通过！无死黑、无小框、全闭环、有排行、无假字！');
    console.log('======================================================================\n');

    ws.close();
  } finally {
    if (chromeProc) {
      chromeProc.kill();
    }
    if (serverProc) {
      serverProc.kill();
    }
    if (tmpUserDataDir) {
      try {
        fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

runWatchdog().catch(err => {
  console.error('\n❌ 看门狗报警拦截到缺陷:', err);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
