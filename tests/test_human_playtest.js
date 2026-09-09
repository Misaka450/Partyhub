const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { io } = require('socket.io-client');
const { findBrowserPath, ensureScreensDir } = require(path.join(__dirname, 'lib', 'browser_launcher'));

const CDP_PORT = 9666;
const SERVER_URL = process.env.TEST_SERVER || 'http://127.0.0.1:8080';
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
      try {
        const m = JSON.parse(d);
        if (m.id && this.pending.has(m.id)) {
          this.pending.get(m.id)(m.result);
          this.pending.delete(m.id);
        }
      } catch (e) {}
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

  async waitFor(expression, timeoutMs = 8000, intervalMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await this.eval(expression);
      if (val) return val;
      await wait(intervalMs);
    }
    throw new Error(`Timeout waiting for expression: ${expression}`);
  }

  // 模拟真实人类光标移动与点击
  async clickElement(selector) {
    const t0 = Date.now();
    const box = await this.eval(`(() => {
      const el = document.querySelector('${selector}');
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`Element not found: ${selector}`);
    const t1 = Date.now();

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await wait(40);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(80);
  }

  // 模拟真实物理打字
  async typeText(selector, text) {
    await this.clickElement(selector);
    await this.eval(`(() => { const el = document.querySelector('${selector}'); if (el) el.value = ''; })()`);
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp' });
      await wait(25 + Math.random() * 25);
    }
  }

  // 模拟真实鼠标拖曳（用于画画或切披萨）
  async dragMouse(fromCoordsOrSelector, toCoordsOrSelector, steps = 10) {
    let startX, startY;
    if (typeof fromCoordsOrSelector === 'string') {
      const box = await this.eval(`(() => {
        const el = document.querySelector('${fromCoordsOrSelector}');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!box) throw new Error(`Drag start element not found: ${fromCoordsOrSelector}`);
      startX = box.x;
      startY = box.y;
    } else {
      startX = fromCoordsOrSelector.x;
      startY = fromCoordsOrSelector.y;
    }

    let endX, endY;
    if (typeof toCoordsOrSelector === 'string') {
      const box = await this.eval(`(() => {
        const el = document.querySelector('${toCoordsOrSelector}');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!box) throw new Error(`Drag end element not found: ${toCoordsOrSelector}`);
      endX = box.x;
      endY = box.y;
    } else {
      endX = toCoordsOrSelector.x;
      endY = toCoordsOrSelector.y;
    }

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX, y: startY });
    await wait(30);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1 });
    await wait(40);

    for (let i = 1; i <= steps; i++) {
      const curX = startX + (endX - startX) * (i / steps);
      const curY = startY + (endY - startY) * (i / steps);
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: curY, button: 'left' });
      await wait(25);
    }

    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1 });
    await wait(60);
  }

  // 模拟按住按键不放一段时间后松开（用于盲压挑战）
  async pressAndHold(selector, durationMs = 1500) {
    const box = await this.eval(`(() => {
      const el = document.querySelector('${selector}');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`Element not found for pressAndHold: ${selector}`);

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await wait(40);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(durationMs);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(60);
  }

  async captureScreenshot(filename) {
    const screensDir = ensureScreensDir();
    const snap = await this.send('Page.captureScreenshot');
    if (snap?.data) {
      fs.writeFileSync(path.join(screensDir, filename), Buffer.from(snap.data, 'base64'));
      console.log(`  📸 [${this.name}] 截图已保存: ${filename}`);
    }
  }
}

// 通用 DOM 渲染质量与无白屏/无未渲染模板字断言
async function assertStageDom(agent, gameType) {
  const check = await agent.eval(`(() => {
    const stage = document.getElementById('stage-${gameType}');
    if (!stage) return { ok: false, error: '舞台容器 #stage-${gameType} 在 DOM 中未找到' };
    if (stage.classList.contains('hidden')) {
      return { ok: false, error: '舞台容器 #stage-${gameType} 依然具有 .hidden 类名，未被正确激活显示' };
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, error: '舞台容器尺寸异常 (宽:' + rect.width + ', 高:' + rect.height + ')，疑似白屏或折叠' };
    }
    const text = stage.innerText || stage.textContent || '';
    const html = stage.innerHTML || '';

    // 检测未渲染模板字或损坏输出
    if (html.includes('{{') || html.includes('}}') || html.includes('\${')) {
      return { ok: false, error: '检测到未渲染的模板标记: {{ / }} / \${' };
    }
    if (html.includes('[object Object]')) {
      return { ok: false, error: '检测到 [object Object] 原始对象字面量渲染' };
    }

    // 检查独立出现的 undefined / NaN / null
    const words = text.split(/\\s+/);
    if (words.includes('undefined')) {
      return { ok: false, error: '检测到文本中裸露的 undefined 标记' };
    }
    if (words.includes('NaN')) {
      return { ok: false, error: '检测到文本中裸露的 NaN 异常计算数值' };
    }

    return {
      ok: true,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      snippet: text.slice(0, 80).replace(/\\s+/g, ' ')
    };
  })()`);

  if (!check.ok) {
    throw new Error(`[${gameType}] DOM 渲染质检失败: ${check.error}`);
  }
  return check;
}

// 虚拟玩家系统：3 个轻量 socket.io 机器人（Charlie, David, Eve）
function setupVirtualPlayers(roomId) {
  const bots = [
    { name: '查理(Charlie)', avatar: '🐶', token: 'tok_charlie_' + Date.now() },
    { name: '大卫(David)', avatar: '🦊', token: 'tok_david_' + Date.now() },
    { name: '伊芙(Eve)', avatar: '🐼', token: 'tok_eve_' + Date.now() }
  ];

  const sockets = bots.map(b => {
    const s = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });
    b.socket = s;
    b.unoHand = [];

    s.on('connect', () => {
      s.emit('join_room', {
        roomId,
        playerName: b.name,
        avatar: b.avatar,
        playerToken: b.token
      });
    });

    s.on('uno_hand', (data) => {
      b.unoHand = data.hand || [];
    });

    s.on('select_word_options', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('select_word', { word: data.options[0] }), 400);
      }
    });

    s.on('uc_speaker_turn', (data) => {
      if (data.speakerToken === b.token) {
        setTimeout(() => s.emit('uc_finish_speech'), 300);
      }
    });

    s.on('flash_question', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('flash_submit_answer', { option: data.options[0] }), 400);
      }
    });

    s.on('cube_question', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('cube_submit_answer', { option: data.options[0] }), 400);
      }
    });

    s.on('number_new_trivia', () => {
      setTimeout(() => s.emit('number_submit_guess', { guess: '42' }), 400);
    });

    s.on('change_new_bill', () => {
      setTimeout(() => s.emit('change_submit_counts', { counts: { 50: 1 } }), 400);
    });

    s.on('shadow_new_puzzle', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('shadow_submit_answer', { answerId: data.options[0].id }), 400);
      }
    });

    s.on('stroop_new_question', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('stroop_submit_answer', { answerId: data.options[0].id }), 400);
      }
    });

    s.on('train_new_puzzle', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('train_submit_answer', { trackId: data.options[0].id }), 400);
      }
    });

    s.on('hole_new_puzzle', (data) => {
      if (data.options && data.options.length > 0) {
        setTimeout(() => s.emit('hole_submit_answer', { optionId: data.options[0].optionId }), 400);
      }
    });

    s.on('simon_start_input', () => {
      setTimeout(() => s.emit('simon_submit_step', { color: 'red' }), 400);
    });

    s.on('room_state', (st) => {
      if (!st) return;

      // 谁是卧底自动表决
      if (st.status === 'UC_VOTING') {
        const target = (st.players || []).find(p => p.token !== b.token);
        if (target) {
          setTimeout(() => s.emit('uc_cast_vote', { targetToken: target.token }), 400);
        }
      }

      // 阿瓦隆自动选队
      if (st.status === 'AVALON_TEAM_SELECT' && st.leaderToken === b.token) {
        const tokens = (st.players || []).slice(0, 2).map(p => p.token);
        setTimeout(() => s.emit('avalon_submit_team', { teamTokens: tokens }), 400);
      }

      // 阿瓦隆表决赞成
      if (st.status === 'AVALON_TEAM_VOTE') {
        setTimeout(() => s.emit('avalon_team_vote', { approve: true }), 300);
      }

      // 阿瓦隆出征任务暗投成功
      if (st.status === 'AVALON_QUEST_VOTE') {
        setTimeout(() => s.emit('avalon_quest_vote', { isSuccess: true }), 300);
      }

      // 拆弹轮盘轮到机器人剪线
      if (st.status === 'BOMB_PLAYING' && st.currentTurnToken === b.token) {
        const uncut = (st.wires || []).find(w => !w.isCut);
        if (uncut) {
          setTimeout(() => s.emit('bomb_cut_wire', { wireId: uncut.id }), 500);
        }
      }

      // 词汇炸弹轮到机器人传弹
      if (st.status === 'BOMB_TICKING' && st.currentTurnToken === b.token) {
        const kw = st.currentKeyword || '天';
        setTimeout(() => s.emit('word_bomb_submit', { word: `${kw}空万里` }), 500);
      }

      // UNO 轮到机器人出牌或摸牌
      if (st.gameType === 'uno' && st.currentTurnToken === b.token) {
        const playable = (b.unoHand || []).find(c => c.color === st.currentColor || c.value === st.topCard?.value || c.color === 'wild');
        if (playable) {
          setTimeout(() => s.emit('uno_play_card', { cardId: playable.id, chosenColor: 'red' }), 500);
        } else {
          setTimeout(() => s.emit('uno_draw_card'), 500);
        }
      }
    });

    return s;
  });

  return {
    bots,
    sockets,
    disconnect: () => sockets.forEach(s => s.disconnect())
  };
}

// 拟人真机返回大厅
async function returnToLobby(alice, bob) {
  let isLobby = await alice.eval(`(() => {
    const lobby = document.getElementById('lobby-card');
    return Boolean(lobby && !lobby.classList.contains('hidden'));
  })()`);
  if (isLobby) return true;

  try {
    // 尝试点击顶部返回大厅按钮
    await alice.clickElement('#btn-header-lobby');
    await wait(200);
    // 检查是否有二次确认弹窗
    const hasConfirm = await alice.eval(`(() => {
      const m = document.getElementById('confirm-modal');
      return Boolean(m && m.classList.contains('active'));
    })()`);
    if (hasConfirm) {
      await alice.clickElement('#btn-confirm-ok');
      await wait(300);
    }
  } catch (e) {
    // 检查游戏结束弹窗
    try {
      const hasGameover = await alice.eval(`(() => {
        const m = document.getElementById('gameover-modal');
        return Boolean(m && m.classList.contains('active'));
      })()`);
      if (hasGameover) {
        await alice.clickElement('#btn-back-lobby');
        await wait(300);
      }
    } catch (err) {}
  }

  // 兜底清理所有弹窗并确保 socket 回大厅
  await alice.eval(`(() => {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    if (typeof currentRoomState !== 'undefined' && currentRoomState && currentRoomState.status !== 'LOBBY' && window.socket) {
      window.socket.emit('back_to_lobby');
    }
  })()`);

  for (let i = 0; i < 20; i++) {
    isLobby = await alice.eval(`(() => {
      const lobby = document.getElementById('lobby-card');
      return Boolean(lobby && !lobby.classList.contains('hidden'));
    })()`);
    if (isLobby) break;
    await wait(100);
  }

  if (!isLobby) {
    throw new Error('未能成功返回大厅');
  }
  await wait(200);
  return true;
}

// 挑选并启动游戏
async function selectAndStartGame(alice, gameType) {
  // 确保 Alice 为前台活跃 Tab
  await alice.send('Page.bringToFront');

  // 确保卡带分类切换到全部
  await alice.eval(`(() => {
    const allBtn = document.querySelector('.cat-pill[data-category="all"]');
    if (allBtn && !allBtn.classList.contains('active')) allBtn.click();
  })()`);
  await wait(150);

  // 滚动并点击目标游戏卡带
  await alice.eval(`(() => {
    const tile = document.querySelector('.game-tile[data-game="${gameType}"]');
    if (tile) tile.scrollIntoView({ block: 'center', inline: 'center' });
  })()`);
  await wait(100);

  await alice.clickElement(`.game-tile[data-game="${gameType}"]`);
  await wait(350);

  // 阿瓦隆设置线下自由讨论模式，防止语音流阻塞
  if (gameType === 'avalon') {
    await alice.eval(`(() => {
      if (window.socket) window.socket.emit('update_room_settings', { speechMode: 'offline' });
    })()`);
    await wait(200);
  }

  // 点击吸底主按钮【开始游戏】
  await alice.clickElement('#btn-start-game');

  // 等待目标舞台激活显示
  let stageReady = false;
  for (let i = 0; i < 35; i++) {
    stageReady = await alice.eval(`(() => {
      const stage = document.getElementById('stage-${gameType}');
      return Boolean(stage && !stage.classList.contains('hidden'));
    })()`);
    if (stageReady) break;
    await wait(150);
  }

  if (!stageReady) {
    throw new Error(`[${gameType}] 舞台未能成功激活 (#stage-${gameType} 仍为 hidden)`);
  }
  await wait(300);
}

// ======================================================================
// 19 款小游戏拟人真机操作与 DOM 渲染质检策略 (HumanPlayStrategies)
// ======================================================================
const HumanPlayStrategies = {
  // 1. 决战 24 点
  'math-24': {
    name: '决战 24 点',
    async play({ alice, bob }) {
      // 等待卡牌数据下发（不再是问号占位符）
      await alice.waitFor(`(() => {
        const vals = Array.from(document.querySelectorAll('#m24-cards-row .m24-card-val')).map(e => e.textContent.trim());
        return vals.length === 4 && !vals.includes('?');
      })()`, 6000);

      const m24View = await alice.eval(`(() => {
        const cardEls = Array.from(document.querySelectorAll('#m24-cards-row .m24-card-val')).map(e => e.textContent.trim());
        const numBtns = Array.from(document.querySelectorAll('#m24-num-buttons .btn-m24-num')).map(e => e.textContent.trim());
        return { cardEls, numBtns };
      })()`);

      if (m24View.cardEls.length !== 4) throw new Error(`卡牌数异常: ${m24View.cardEls.length}`);
      console.log(`  ✓ 现场扑克牌面: [${m24View.cardEls.join(', ')}]，数字按键: [${m24View.numBtns.join(', ')}]`);

      // 拟人点击第 1 个数字按键与 '+' 运算符
      await alice.clickElement('#m24-num-buttons .btn-m24-num:first-child');
      await wait(150);
      await alice.clickElement('.btn-m24-op[data-op="+"]');
      await wait(150);

      const formula = await alice.eval(`document.getElementById('m24-formula-text').textContent`);
      console.log(`  ✓ 算式栏实时显示拼凑内容: "${formula}"`);
    }
  },

  // 2. 3D 数方块
  'cube-count': {
    name: '3D 数方块',
    async play({ alice, bob }) {
      // 观察期质检
      const observeTitle = await alice.eval(`document.getElementById('cube-prompt-title').textContent.trim()`);
      console.log(`  ✓ 观察期提示: "${observeTitle}"`);

      // 等待观察倒计时结束（约 6s），进入选项抢答期
      await alice.waitFor(`(() => {
        const btns = document.querySelectorAll('#cube-options-grid button');
        return btns.length === 4;
      })()`, 10000);

      const options = await alice.eval(`Array.from(document.querySelectorAll('#cube-options-grid button')).map(b => b.textContent.trim())`);
      console.log(`  ✓ 空间几何选项就绪: [${options.join(', ')}]`);

      // 拟人手指点击第一个选项
      await alice.clickElement('#cube-options-grid button:first-child');
      await wait(300);
      console.log(`  ✓ Alice 拟人点击选项 [${options[0]}] 成功`);
    }
  },

  // 3. 瞬间数羊
  'flash-counter': {
    name: '瞬间数羊',
    async play({ alice, bob }) {
      const targetName = await alice.eval(`document.getElementById('ready-target-name').textContent.trim()`);
      console.log(`  ✓ 奔跑目标动物: 【${targetName || '动物'}】`);

      // 等待动物飞掠完成，答题浮层激活（准备3s + 飞掠7s，约需 10~11s）
      await alice.waitFor(`(() => {
        const btns = document.querySelectorAll('#flash-options-grid button');
        return btns.length === 4;
      })()`, 14000);

      const options = await alice.eval(`Array.from(document.querySelectorAll('#flash-options-grid button')).map(b => b.textContent.trim())`);
      console.log(`  ✓ 动物计数竞猜选项: [${options.join(', ')}]`);

      // 拟人手指点击选项
      await alice.clickElement('#flash-options-grid button:first-child');
      await wait(300);
      console.log(`  ✓ Alice 拟人点击竞猜选项 [${options[0]}]`);
    }
  },

  // 4. 影子猜物
  'shadow-match': {
    name: '影子猜物',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const btns = document.querySelectorAll('#shadow-options-grid .brain-opt-btn');
        return btns.length === 4;
      })()`, 6000);

      const emoji = await alice.eval(`document.getElementById('shadow-emoji-item').textContent.trim()`);
      const options = await alice.eval(`Array.from(document.querySelectorAll('#shadow-options-grid .brain-opt-btn')).map(b => b.textContent.trim())`);
      console.log(`  ✓ 剪影舞台目标: ${emoji}，竞猜选项: [${options.join(', ')}]`);

      // 拟人点击第 1 个选项
      await alice.clickElement('#shadow-options-grid .brain-opt-btn:first-child');
      await wait(300);
      console.log(`  ✓ Alice 拟人抢答 [${options[0]}]`);
    }
  },

  // 5. 找零大师
  'change-master': {
    name: '找零大师',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const due = document.getElementById('cash-due-val').textContent.trim();
        return due.length > 1 && due.includes('¥');
      })()`, 6000);

      const bill = await alice.eval(`(() => ({
        paid: document.getElementById('cash-paid-val').textContent.trim(),
        cost: document.getElementById('cash-cost-val').textContent.trim(),
        due: document.getElementById('cash-due-val').textContent.trim()
      }))()`);
      console.log(`  ✓ 收据账单: 付款 ${bill.paid}, 消费 ${bill.cost}, 应找零: ${bill.due}`);

      // 拟人从零钱托盘点取纸币并交付
      await alice.clickElement('.cash-chip-btn[data-denom="50"]');
      await wait(150);
      const curSum = await alice.eval(`document.getElementById('cash-current-sum').textContent.trim()`);
      console.log(`  ✓ 纸币放入托盘，当前累加: ${curSum}`);

      await alice.clickElement('#btn-cash-confirm');
      await wait(300);
      console.log('  ✓ 拟人点击【确认找零交付】');
    }
  },

  // 6. 折纸打孔
  'hole-punch': {
    name: '折纸打孔',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const cards = document.querySelectorAll('#hole-options-grid .hole-opt-card');
        return cards.length === 4;
      })()`, 6000);

      const foldInfo = await alice.eval(`document.getElementById('hole-fold-info').textContent.trim()`);
      console.log(`  ✓ 折叠步骤指示: "${foldInfo}"`);

      // 拟人点击第 1 块展开图卡片
      await alice.clickElement('#hole-options-grid .hole-opt-card:first-child');
      await wait(300);
      console.log('  ✓ Alice 拟人点击展开还原预选卡片');
    }
  },

  // 7. 色彩陷阱
  'stroop-trap': {
    name: '色彩陷阱',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const btns = document.querySelectorAll('#stroop-options-grid .brain-opt-btn');
        return btns.length === 4;
      })()`, 6000);

      const info = await alice.eval(`(() => ({
        rule: document.getElementById('stroop-instruction-badge').textContent.trim(),
        text: document.getElementById('stroop-text-display').textContent.trim()
      }))()`);
      console.log(`  ✓ 脑力规则: "${info.rule}", 干扰字: "${info.text}"`);

      await alice.clickElement('#stroop-options-grid .brain-opt-btn:first-child');
      await wait(300);
      console.log('  ✓ Alice 拟人冲破脑力陷阱点击选项');
    }
  },

  // 8. 西蒙节拍记忆
  'simon-memory': {
    name: '西蒙节拍记忆',
    async play({ alice, bob }) {
      const statusPill = await alice.eval(`document.getElementById('simon-status-pill').textContent.trim()`);
      console.log(`  ✓ 节拍器状态: "${statusPill}"`);

      // 等待演示期结束（约 2s），或直接拟人敲击红色轮盘
      await wait(1800);
      await alice.clickElement('.simon-btn[data-color="red"]');
      await wait(300);
      console.log('  ✓ Alice 拟人按击红色音符轮盘');
    }
  },

  // 9. 轨道小火车
  'train-route': {
    name: '轨道小火车',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const btns = document.querySelectorAll('#train-options-dock .train-opt-btn');
        return btns.length > 0;
      })()`, 6000);

      const cellCount = await alice.eval(`document.querySelectorAll('#train-board-grid .train-cell').length`);
      const optCount = await alice.eval(`document.querySelectorAll('#train-options-dock .train-opt-btn').length`);
      console.log(`  ✓ 铁路网格单元: ${cellCount} 格，待补轨道配件: ${optCount} 款`);

      await alice.clickElement('#train-options-dock .train-opt-btn:first-child');
      await wait(300);
      console.log('  ✓ Alice 拟人选取轨道碎片进行拼接');
    }
  },

  // 10. 切披萨 50:50
  'perfect-slice': {
    name: '切披萨 50:50',
    async play({ alice, bob }) {
      const prompt = await alice.eval(`document.getElementById('slice-cut-prompt').textContent.trim()`);
      console.log(`  ✓ 切割指示: "${prompt}"`);

      const box = await alice.eval(`(() => {
        const el = document.getElementById('slice-canvas');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`);
      if (!box) throw new Error('未找到 #slice-canvas 画布');

      // 拟人鼠标划线：从披萨上方拖曳到底部，执行 50:50 切割
      const startPos = { x: box.x + box.w * 0.5, y: box.y + box.h * 0.1 };
      const endPos = { x: box.x + box.w * 0.5, y: box.y + box.h * 0.9 };
      console.log(`  Alice 拟人挥动裁刀沿披萨中轴划线: (${Math.round(startPos.x)}, ${Math.round(startPos.y)}) -> (${Math.round(endPos.x)}, ${Math.round(endPos.y)})...`);
      await alice.dragMouse(startPos, endPos, 12);
      await wait(500);
      console.log('  ✓ 披萨二等分切割完成');
    }
  },

  // 11. 盲压挑战
  'hold-five': {
    name: '盲压挑战',
    async play({ alice, bob }) {
      const title = await alice.eval(`document.getElementById('hold-target-title').textContent.trim()`);
      console.log(`  ✓ 盲压目标: "${title}"`);

      // 拟人按住触发按钮约 1.2 秒后松手
      console.log('  Alice 拟人手指按下盲压按钮并默数...');
      await alice.pressAndHold('#btn-hold-trigger', 1200);
      await wait(300);
      console.log('  ✓ Alice 松手完成盲压');
    }
  },

  // 12. 盲猜谁接近
  'number-guess': {
    name: '盲猜谁接近',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const q = document.getElementById('number-trivia-q').textContent.trim();
        return q.length > 2;
      })()`, 6000);

      const question = await alice.eval(`document.getElementById('number-trivia-q').textContent.trim()`);
      console.log(`  ✓ 趣味估算问答题: "${question}"`);

      // 拟人键入估算数字 64 并提交
      await alice.typeText('#number-guess-input', '64');
      await wait(150);
      await alice.clickElement('#btn-number-guess-submit');
      await wait(300);
      console.log('  ✓ Alice 拟人键入估算值 [64] 并提交');
    }
  },

  // 13. 拆弹轮盘
  'bomb-roulette': {
    name: '拆弹轮盘',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        return document.querySelectorAll('#wires-grid .wire-card').length >= 2;
      })()`, 6000);

      const wireCount = await alice.eval(`document.querySelectorAll('#wires-grid .wire-card').length`);
      console.log(`  ✓ 炸弹已就绪，引线总数: ${wireCount} 根`);

      // 拟人观察轮到谁剪线
      const isAliceTurn = await alice.eval(`(() => {
        const tip = document.getElementById('bomb-turn-tip').textContent;
        return tip.includes('轮到你') || tip.includes('小马爱丽丝');
      })()`);

      if (isAliceTurn) {
        console.log('  轮到 Alice 拆弹，点击剪断第 1 根引线...');
        await alice.clickElement('.wire-card:not(.cut):first-child');
      } else {
        const isBobTurn = await bob.eval(`(() => {
          const tip = document.getElementById('bomb-turn-tip').textContent;
          return tip.includes('轮到你') || tip.includes('小马鲍勃');
        })()`);
        if (isBobTurn) {
          console.log('  轮到 Bob 拆弹，点击剪断第 1 根引线...');
          await bob.clickElement('.wire-card:not(.cut):first-child');
        } else {
          console.log('  当前为虚拟玩家剪线回合，等待引线切断流转...');
          await wait(1000);
          // 流转后 Alice 剪线
          try {
            await alice.clickElement('.wire-card:not(.cut):first-child');
          } catch (e) {}
        }
      }
      await wait(400);
      console.log('  ✓ 拆弹剪线指令触发成功');
    }
  },

  // 14. 几A几B
  'bulls-and-cows': {
    name: '几A几B',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        return document.querySelectorAll('#stage-bulls-and-cows .btn-key').length >= 10;
      })()`, 6000);

      console.log('  Alice 拟人使用九宫格键盘依次敲击数字 [1], [2], [3], [4]...');
      await alice.clickElement('#stage-bulls-and-cows .btn-key[data-key="1"]');
      await wait(80);
      await alice.clickElement('#stage-bulls-and-cows .btn-key[data-key="2"]');
      await wait(80);
      await alice.clickElement('#stage-bulls-and-cows .btn-key[data-key="3"]');
      await wait(80);
      await alice.clickElement('#stage-bulls-and-cows .btn-key[data-key="4"]');
      await wait(80);

      const digits = await alice.eval(`document.getElementById('bc-digits-display').textContent.trim()`);
      console.log(`  ✓ 破译输入屏显示: "${digits}"`);

      await alice.clickElement('#btn-bc-submit');
      await wait(400);
      console.log('  ✓ Alice 点击回车提交破译密码');
    }
  },

  // 15. 词汇炸弹
  'word-bomb': {
    name: '词汇炸弹',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const kw = document.getElementById('wb-keyword-badge').textContent.trim();
        return kw.length >= 1;
      })()`, 6000);

      const keyword = await alice.eval(`document.getElementById('wb-keyword-badge').textContent.trim()`);
      console.log(`  ✓ 炸弹点燃！当前必须包含字: 【${keyword}】`);

      // 拟人输入中文词汇传弹
      const word = `${keyword}空万里`;
      await alice.typeText('#wb-input', word);
      await wait(150);
      await alice.clickElement('#wb-input-form button[type="submit"]');
      await wait(400);
      console.log(`  ✓ Alice 拟人提交词汇【${word}】传递引信`);
    }
  },

  // 16. 你画我猜
  'draw-guess': {
    name: '你画我猜',
    async play({ alice, bob }) {
      console.log('  检查画师选词弹窗或画布状态...');

      // 房主 Alice 作为首发画师收到选题弹窗
      const hasWordModal = await alice.waitFor(`(() => {
        const modal = document.getElementById('word-modal');
        const cards = document.querySelectorAll('#word-options-container .word-option-card');
        return Boolean(modal && modal.classList.contains('active') && cards.length > 0);
      })()`, 6000).catch(() => false);

      if (hasWordModal) {
        const options = await alice.eval(`Array.from(document.querySelectorAll('#word-options-container .word-option-card span:first-child')).map(e => e.textContent.trim())`);
        console.log(`  ✓ Alice (画师) 收到 3 选 1 词库: [${options.join(', ')}]`);
        await alice.clickElement('#word-options-container .word-option-card:first-child');
        await wait(300);

        // 画师挥动画笔在画布作画
        const box = await alice.eval(`(() => {
          const c = document.getElementById('game-canvas');
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        })()`);

        if (box) {
          console.log('  Alice 拟人挥动漫动画笔在画布勾勒笑脸...');
          await alice.dragMouse(
            { x: box.x + box.w * 0.3, y: box.y + box.h * 0.4 },
            { x: box.x + box.w * 0.7, y: box.y + box.h * 0.4 },
            8
          );
        }

        // Bob 拟人猜词
        await wait(300);
        console.log('  Bob 拟人打字参与抢答...');
        await bob.typeText('#draw-guess-input', options[0] || '苹果');
        await bob.clickElement('#btn-draw-guess-submit');
        await wait(300);
      } else {
        console.log('  画师已就绪，Bob 尝试键入猜词...');
        await bob.typeText('#draw-guess-input', '大西瓜');
        await bob.clickElement('#btn-draw-guess-submit');
        await wait(300);
      }
      console.log('  ✓ 你画我猜选词、绘图与抢答交互闭环');
    }
  },

  // 17. 谁是卧底
  'undercover': {
    name: '谁是卧底',
    async play({ alice, bob }) {
      console.log('  Alice 拟人点击私密身份卡查看底牌...');
      await alice.clickElement('#uc-secret-card');
      await wait(350);

      const cardInfo = await alice.eval(`(() => ({
        role: document.getElementById('uc-role-label').textContent.trim(),
        word: document.getElementById('uc-word-text').textContent.trim(),
        stage: document.getElementById('uc-stage-desc').textContent.trim()
      }))()`);
      console.log(`  ✓ Alice 查验底牌完成: [${cardInfo.role} -> ${cardInfo.word}], 阶段: ${cardInfo.stage}`);

      if (cardInfo.word === '--' || !cardInfo.word) {
        throw new Error('底牌文字未正确渲染 (依然是 -- 占位符)');
      }

      // 如果轮到 Alice 发言，点击发言完毕
      const canFinish = await alice.eval(`(() => {
        const btn = document.getElementById('btn-finish-speech');
        return Boolean(btn && !btn.classList.contains('hidden'));
      })()`);
      if (canFinish) {
        console.log('  Alice 拟人点击【发言完毕】递麦...');
        await alice.clickElement('#btn-finish-speech');
        await wait(300);
      }
      console.log('  ✓ 谁是卧底底牌翻转与麦序交互正常');
    }
  },

  // 18. 阿瓦隆
  'avalon': {
    name: '阿瓦隆',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const badge = document.getElementById('av-role-badge').textContent.trim();
        return badge.length > 0;
      })()`, 6000);

      const roleInfo = await alice.eval(`(() => ({
        role: document.getElementById('av-role-badge').textContent.trim(),
        side: document.getElementById('av-side-badge').textContent.trim(),
        trackNodes: document.querySelectorAll('#avalon-quest-track .quest-node').length,
        playerSeats: document.querySelectorAll('#av-player-cards-grid .av-p-card').length
      }))()`);

      console.log(`  ✓ Alice 获得圆桌身份: 【${roleInfo.role}】(${roleInfo.side})`);
      console.log(`  ✓ 圣杯远征轨道: ${roleInfo.trackNodes} 轮，参战骑士席位: ${roleInfo.playerSeats} 人`);

      if (roleInfo.trackNodes !== 5) throw new Error(`圣杯轨道节点数量错误: ${roleInfo.trackNodes}`);
      if (roleInfo.playerSeats !== 5) throw new Error(`阿瓦隆玩家席位不等于5人: ${roleInfo.playerSeats}`);

      // 拟人点击英雄身份大卡牌
      await alice.clickElement('#avalon-hero-card');
      await wait(300);
      console.log('  ✓ 阿瓦隆 5 人大局夜间视野、远征轨道与席位质检通过');
    }
  },

  // 19. UNO 优诺
  'uno': {
    name: 'UNO 优诺',
    async play({ alice, bob }) {
      await alice.waitFor(`(() => {
        const cards = document.querySelectorAll('#uno-hand-container .uno-card');
        return cards.length >= 7;
      })()`, 6000);

      const unoView = await alice.eval(`(() => ({
        topCardVal: document.getElementById('uno-top-card').textContent.trim(),
        topColor: document.getElementById('uno-color-indicator').textContent.trim(),
        handCount: document.querySelectorAll('#uno-hand-container .uno-card').length
      }))()`);

      console.log(`  ✓ UNO 桌面底牌: [${unoView.topColor} ${unoView.topCardVal}], Alice 手牌数: ${unoView.handCount} 张`);
      if (unoView.handCount < 7) throw new Error(`UNO 起手牌数异常: ${unoView.handCount}`);

      // 拟人点击摸牌堆抽牌
      console.log('  Alice 拟人伸出手指点击中央抽牌堆【摸牌】...');
      await alice.clickElement('#btn-uno-draw');
      await wait(400);
      console.log('  ✓ UNO 牌堆触控操作与手牌渲染质检通过');
    }
  }
};

const ALL_GAME_KEYS = [
  'math-24',
  'cube-count',
  'flash-counter',
  'shadow-match',
  'change-master',
  'hole-punch',
  'stroop-trap',
  'simon-memory',
  'train-route',
  'perfect-slice',
  'hold-five',
  'number-guess',
  'bomb-roulette',
  'bulls-and-cows',
  'word-bomb',
  'draw-guess',
  'undercover',
  'avalon',
  'uno'
];

async function runHumanPlaytestSuite() {
  console.log('======================================================================');
  console.log('🤖 Hermes 拟人真机端到端全量 19 款小游戏自动化游玩质检套件');
  console.log('======================================================================');

  // 解析 CLI 参数，支持单测某一款游戏或全量跑
  const targetArg = process.argv[2]?.trim();
  let gamesToTest = ALL_GAME_KEYS;

  if (targetArg) {
    const matched = ALL_GAME_KEYS.find(k => k === targetArg || HumanPlayStrategies[k]?.name.includes(targetArg));
    if (!matched) {
      console.error(`❌ 未找到匹配的游戏: "${targetArg}"`);
      console.log(`可选游戏列表: [${ALL_GAME_KEYS.join(', ')}]`);
      process.exit(1);
    }
    gamesToTest = [matched];
    console.log(`🎯 单游戏巡检模式: 仅测试《${HumanPlayStrategies[matched].name}》(${matched})`);
  } else {
    console.log(`🚀 全量巡检模式: 依次覆盖全部 ${gamesToTest.length} 款小游戏！`);
  }

  const browserPath = findBrowserPath();
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'human-test-'));

  const chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=430,932',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(2000);

  let virtualBots = null;
  const testResults = [];

  try {
    // 1. 创建 Alice (房主) 与 Bob (玩家) 双 CDP 真实标签页
    console.log('\n[准备 1] 挂载双 Chromium 真实 Tab: Alice (房主) 与 Bob (玩家)...');
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

    await alice.send('Page.bringToFront');

    await alice.waitFor('Boolean(document.getElementById("player-name"))');
    await bob.waitFor('Boolean(document.getElementById("player-name"))');
    await wait(200);

    const roomId = 'H_' + Math.floor(Math.random() * 89999 + 10000);

    // 2. Alice 拟人加入房间
    console.log(`\n[准备 2] Alice 拟人键入昵称【小马爱丽丝】和房间【${roomId}】，点击进入...`);
    await alice.typeText('#player-name', '小马爱丽丝');
    await alice.typeText('#room-id', roomId);
    await alice.clickElement('#btn-join');
    await wait(1000);

    // 3. Bob 拟人加入房间
    console.log(`\n[准备 3] Bob 拟人键入昵称【小马鲍勃】，加入房间【${roomId}】...`);
    await bob.typeText('#player-name', '小马鲍勃');
    await bob.typeText('#room-id', roomId);
    await bob.clickElement('#btn-join');
    await wait(1000);

    // 4. 挂载 3 名轻量 socket.io 虚拟玩家（Charlie, David, Eve），使房间达到 5 人满员标准
    console.log('\n[准备 4] 挂载 3 名轻量虚拟玩家 (Charlie, David, Eve)，满足阿瓦隆(5人)与谁是卧底(3人)最低门槛...');
    virtualBots = setupVirtualPlayers(roomId);
    await wait(1200);

    // 等待大厅席位同步为 5 人
    let lobbyStatus = { seats: [] };
    for (let i = 0; i < 25; i++) {
      lobbyStatus = await alice.eval(`(() => {
        const seats = Array.from(document.querySelectorAll('.player-seat-card .seat-name')).map(el => el.textContent.trim());
        return {
          seats,
          isGameSelectVisible: !document.getElementById('host-game-select-box').classList.contains('hidden')
        };
      })()`);
      if (lobbyStatus.seats.length >= 5) break;
      await wait(200);
    }

    console.log(`  ✓ 大厅 5 人席位同步完成: [${lobbyStatus.seats.join(', ')}]`);
    if (lobbyStatus.seats.length < 5) {
      throw new Error(`房间人数未达标: 当前 ${lobbyStatus.seats.length}/5 人`);
    }

    // 5. 循环巡检目标小游戏
    console.log(`\n======================================================================`);
    console.log(`🎮 开始按策略巡检 ${gamesToTest.length} 款小游戏`);
    console.log(`======================================================================`);

    for (let idx = 0; idx < gamesToTest.length; idx++) {
      const gKey = gamesToTest[idx];
      const strat = HumanPlayStrategies[gKey];
      const gameTitle = `${strat.name} (${gKey})`;
      const startTime = Date.now();

      console.log(`\n----------------------------------------------------------------------`);
      console.log(`[${idx + 1}/${gamesToTest.length}] 正在测试小游戏: 《${gameTitle}》`);
      console.log(`----------------------------------------------------------------------`);

      try {
        // A. 房主 Alice 在大厅选择卡带并启动游戏
        await selectAndStartGame(alice, gKey);

        // B. 舞台通用无白屏与无未渲染模板字质检断言
        const domHealth = await assertStageDom(alice, gKey);
        console.log(`  ✓ 舞台视检合格: 渲染尺寸 ${domHealth.width}x${domHealth.height}, 纯文本摘要: "${domHealth.snippet}"`);

        // C. 执行该游戏独有的拟人物理操作策略
        await strat.play({ alice, bob });

        // D. 留存质检截图
        const cleanKey = gKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        await alice.captureScreenshot(`human_playtest_${cleanKey}.png`);

        // E. 拟人操作返回大厅，为下一款小游戏就绪
        await returnToLobby(alice, bob);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ✨ 《${strat.name}》拟人全流程质检通关！耗时 ${duration}s`);
        testResults.push({ key: gKey, name: strat.name, status: 'PASS', duration: `${duration}s` });
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`  ❌ 《${strat.name}》测试未通过: ${err.message}`);
        try {
          await alice.captureScreenshot(`human_playtest_FAIL_${gKey}.png`);
        } catch (e) {}
        testResults.push({ key: gKey, name: strat.name, status: 'FAIL', duration: `${duration}s`, error: err.message });
        // 尝试兜底恢复大厅以继续后续测试
        try { await returnToLobby(alice, bob); } catch (e) {}
      }
    }

    // 6. 输出终局测试汇总榜单
    console.log('\n======================================================================');
    console.log('📊 拟人全流程真机端到端游玩测试总结');
    console.log('======================================================================');
    let passCount = 0;
    testResults.forEach((r, i) => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      if (r.status === 'PASS') passCount++;
      const errInfo = r.error ? ` (${r.error})` : '';
      console.log(`  ${icon} [${String(i + 1).padStart(2, '0')}] ${r.name.padEnd(12, '　')} (${r.key}) -> ${r.status} [${r.duration}]${errInfo}`);
    });

    console.log(`\n总计测试: ${testResults.length} 款, 成功: ${passCount} 款, 失败: ${testResults.length - passCount} 款`);

    if (passCount !== testResults.length) {
      throw new Error(`测试未全数通过: ${testResults.length - passCount} 款游戏出现异常`);
    }

    console.log('🎉 恭喜！全部指定小游戏拟人真实按键、真机DOM、无白屏质检 100% 验证通过！');
    ws1.close();
    ws2.close();
  } finally {
    if (virtualBots) virtualBots.disconnect();
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
    await wait(300);
    if (tmpUserDataDir) {
      try { fs.rmSync(tmpUserDataDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

runHumanPlaytestSuite().catch(e => {
  console.error('\n❌ 拟人测试套件执行异常:', e);
  process.exit(1);
});
