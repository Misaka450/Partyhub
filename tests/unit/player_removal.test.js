// PartyHub 第二期审计修复的核心回归测试（Node.js 内置 node:test，零依赖）
// 覆盖：玩家移除回合指针修正（R2-02）、UNO 发牌钳制（R2-03）、词弹 token 化（R2-12）、
// 切披萨坐标钳制（R2-13）、盲压时间锚点（R2-14）、阿瓦隆人数守卫与重连身份（R2-08/33）、
// 画猜选词白名单（R2-34）
// 运行方式：npm test（package.json 中 test 脚本为 node --test tests/unit/）
const { test } = require('node:test');
const assert = require('node:assert');

const uno = require('../../games/uno');
const wordBomb = require('../../games/wordBomb');
const avalon = require('../../games/avalon');
const drawGuess = require('../../games/drawGuess');
const perfectSlice = require('../../games/perfectSlice');
const holdFive = require('../../games/holdFive');

// 测试用假 io：吞掉全部 emit，只验证引擎状态机
const fakeIo = { to: () => ({ emit: () => {} }) };
const fakeBroadcast = () => {};

function mkPlayer(name, i) {
  return {
    id: `sid_${i}`, token: `token_${name}`, name, avatar: '🐱',
    score: 0, isHost: false, isReady: false, alive: true, offlineTimer: null
  };
}

function mkRoom(players, gameType) {
  return { id: 'room_test', gameType, status: 'LOBBY', players, timer: null, roundTimeout: null, lastActivity: Date.now() };
}

// 测试结束后清理真实定时器（引擎的 startTurnTimer 会创建 setInterval）
function cleanupRoom(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
}

// ===================== UNO：玩家移除指针修正（R2-02）=====================
test('uno.onPlayerRemoved: 移除当前玩家之前的玩家，索引前移保持指向原玩家', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2), mkPlayer('D', 3), mkPlayer('E', 4)], 'uno');
  uno.initRoomState(room);
  room.status = 'UNO_PLAYING';
  room.currentTurnIndex = 2; // 当前是 C
  room.direction = 1;
  room.players.forEach(p => { p.hand = []; });

  room.players.splice(0, 1); // A 离场（在 C 之前）
  uno.onPlayerRemoved(room, 0, fakeIo, fakeBroadcast);

  assert.strictEqual(room.currentTurnIndex, 1); // 仍指向 C
  assert.strictEqual(room.players[room.currentTurnIndex].name, 'C');
  assert.ok(room.timer, '移除玩家后应重启回合计时器防止死锁');
  cleanupRoom(room);
});

test('uno.onPlayerRemoved: 移除的正是当前玩家（顺时针），回合顺延给下一位', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2), mkPlayer('D', 3)], 'uno');
  uno.initRoomState(room);
  room.status = 'UNO_PLAYING';
  room.currentTurnIndex = 2; // 当前是 C
  room.direction = 1;
  room.players.forEach(p => { p.hand = []; });

  room.players.splice(2, 1); // C 自己离场，原下一位 D 顶到索引 2
  uno.onPlayerRemoved(room, 2, fakeIo, fakeBroadcast);

  assert.strictEqual(room.players[room.currentTurnIndex].name, 'D');
  assert.ok(room.timer, '计时器应重启');
  cleanupRoom(room);
});

test('uno.onPlayerRemoved: 移除的正是当前玩家（逆时针），回合交给上一位', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2), mkPlayer('D', 3)], 'uno');
  uno.initRoomState(room);
  room.status = 'UNO_PLAYING';
  room.currentTurnIndex = 2; // 当前是 C
  room.direction = -1;
  room.players.forEach(p => { p.hand = []; });

  room.players.splice(2, 1); // C 离场，逆时针下一位是 B
  uno.onPlayerRemoved(room, 2, fakeIo, fakeBroadcast);

  assert.strictEqual(room.players[room.currentTurnIndex].name, 'B');
  cleanupRoom(room);
});

// ===================== UNO：发牌牌量钳制（R2-03）=====================
test('uno.startGame: 6人×20手牌的极端配置自动收缩，牌堆不耗尽', () => {
  const players = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => mkPlayer(n, i));
  const room = mkRoom(players, 'uno');
  uno.initRoomState(room);
  room.unoHandSize = 20; // 6×20=120 > 108 张，必须收缩

  uno.startGame(room, fakeIo, fakeBroadcast);

  try {
    // 收缩后每人 ≤ floor((108-8)/6)=16 张
    room.players.forEach(p => {
      assert.ok(p.hand.length > 0 && p.hand.length <= 16, `手牌数应被钳制到 1~16，实际 ${p.hand.length}`);
    });
    // 翻完底牌后牌堆仍有剩余
    assert.ok(room.deck.length > 0, '牌堆应留有剩余');
    // 底牌与当前颜色有效
    assert.ok(room.discardPile.length > 0);
    assert.ok(['red', 'yellow', 'green', 'blue'].includes(room.currentColor), `currentColor 应为标准色，实际 ${room.currentColor}`);
    assert.strictEqual(room.status, 'UNO_PLAYING');
  } finally {
    cleanupRoom(room);
  }
});

// ===================== UNO：喊话保护（R2-06）=====================
test('uno.playCard: 喊过 UNO 打出倒数第二张后标记保留（最后一张受保护）', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1)], 'uno');
  uno.initRoomState(room);
  room.status = 'UNO_PLAYING';
  room.currentTurnIndex = 0;
  room.direction = 1;
  room.discardPile = [{ id: 'c_0', color: 'red', value: '5', type: 'number', score: 5 }];
  room.currentColor = 'red';
  room.pendingDraw = 0;
  room.deck = [];

  const a = room.players[0];
  a.hand = [
    { id: 'c_1', color: 'red', value: '5', type: 'number', score: 5 },
    { id: 'c_2', color: 'red', value: '7', type: 'number', score: 7 }
  ];
  a.hasCalledUno = true; // 已喊 UNO

  uno.playCard(room, a.token, 'c_1', null, fakeIo, fakeBroadcast);

  // 打出 1 张剩 1 张：hasCalledUno 必须保留，catchUno 不应误罚
  assert.strictEqual(a.hand.length, 1);
  assert.strictEqual(a.hasCalledUno, true, '剩最后 1 张时喊话标记应保留（受保护）');
  cleanupRoom(room);
});

// ===================== 词汇炸弹：持弹人 token 化（R2-12）=====================
test('wordBomb: 持弹人用 token 追踪，玩家退出后不漂移', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2)], 'word-bomb');
  wordBomb.initRoomState(room);
  room.status = 'BOMB_TICKING';
  room.currentTurnToken = 'token_B';
  room.playerLives = { token_A: 2, token_B: 2, token_C: 2 };
  room.currentKeyword = '天';
  room.usedWords = new Set();
  room.baseTime = 8;

  // B 前面的 A 退出：原下标实现会把 currentTurnIndex 指错人，token 实现不受影响
  room.players.splice(0, 1);
  wordBomb.onPlayerRemoved(room, 0, fakeIo, fakeBroadcast);

  const current = room.players.find(p => p.token === room.currentTurnToken);
  assert.ok(current, '持弹人应仍可解析');
  assert.strictEqual(current.name, 'B', '持弹人仍应是 B（不被索引漂移影响）');
  cleanupRoom(room);
});

test('wordBomb: 持弹人本人退出，炸弹顺延给下一位', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2)], 'word-bomb');
  wordBomb.initRoomState(room);
  room.status = 'BOMB_TICKING';
  room.currentTurnToken = 'token_B'; // B 持弹
  room.playerLives = { token_A: 2, token_B: 2, token_C: 2 };
  room.currentKeyword = '天';
  room.baseTime = 8;

  room.players.splice(1, 1); // B（持弹人）退出
  wordBomb.onPlayerRemoved(room, 1, fakeIo, fakeBroadcast);

  assert.ok(['token_A', 'token_C'].includes(room.currentTurnToken), '炸弹应顺延给 A 或 C');
  cleanupRoom(room);
});

// ===================== 切披萨：坐标钳制（R2-13）=====================
test('perfectSlice.submitSlice: 越界切线坐标被钳制到 [0,1]', () => {
  const room = mkRoom([mkPlayer('A', 0)], 'perfect-slice');
  perfectSlice.initRoomState(room);
  room.status = 'SLICE_CUTTING';
  room.currentShape = { name: '测试三角形', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.8 }] };
  room.playerSlices = {};
  room.roundStartTime = Date.now();

  // 恶意提交 -1000 的越界坐标（原实现照单全收）
  perfectSlice.submitSlice(room, 'token_A', { x: -1000, y: 0.5 }, { x: 0.5, y: 0.5001 }, fakeIo, fakeBroadcast);

  const rec = room.playerSlices['token_A'];
  assert.ok(rec, '合法玩家提交应被接受（钳制而非拒绝）');
  assert.strictEqual(rec.p1.x, 0, '越界 x=-1000 应被钳制到 0');
  assert.ok(rec.p1.y >= 0 && rec.p1.y <= 1);
  assert.ok(rec.p2.x >= 0 && rec.p2.x <= 1);
  assert.ok(rec.p2.y >= 0 && rec.p2.y <= 1);
  cleanupRoom(room);
});

// ===================== 盲压挑战：服务端时间锚点（R2-14）=====================
test('holdFive.submitHoldTime: 虚报超过物理可能的时长被拒绝', () => {
  const room = mkRoom([mkPlayer('A', 0)], 'hold-five');
  holdFive.initRoomState(room);
  room.status = 'HOLD_PRESSING';
  room.playerHolds = {};
  room.targetSeconds = 5;
  // 轮次开始于 1 秒前：此时提交 elapsedMs=5000 物理上不可能（最多按了约 1 秒）
  room.roundStartAt = Date.now() - 1000;

  holdFive.submitHoldTime(room, 'token_A', 5000, fakeIo, fakeBroadcast);
  assert.strictEqual(room.playerHolds['token_A'], undefined, '开局瞬间伪造 5 秒应被锚点校验拒绝');

  // 合理时长（800ms < 已过 1 秒 + 1 秒容差）应被接受
  holdFive.submitHoldTime(room, 'token_A', 800, fakeIo, fakeBroadcast);
  assert.ok(room.playerHolds['token_A'], '物理可信的时长应被接受');
  cleanupRoom(room);
});

// ===================== 阿瓦隆：人数守卫与重连身份（R2-08 / R2-33）=====================
test('avalon.getSecretRoleFor: 能重建玩家的私密身份载荷', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1)], 'avalon');
  const merlin = room.players[0];
  merlin.avalonRole = 'merlin';
  merlin.avalonSide = 'good';
  const minion = room.players[1];
  minion.avalonRole = 'minion';
  minion.avalonSide = 'evil';

  const payload = avalon.getSecretRoleFor(room, merlin);
  assert.strictEqual(payload.role, 'merlin');
  assert.strictEqual(payload.roleName, '梅林');
  assert.strictEqual(payload.side, 'good');
  // 梅林应看到邪恶玩家
  assert.ok(payload.seenInfo.some(s => s.token === 'token_B'), '梅林视野应包含邪恶玩家 B');

  const evilPayload = avalon.getSecretRoleFor(room, minion);
  assert.strictEqual(evilPayload.role, 'minion');
  assert.strictEqual(evilPayload.side, 'evil');
});

test('avalon: 人数跌破 5 人时游戏提前结束而不是 TypeError 卡死', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1), mkPlayer('C', 2), mkPlayer('D', 3)], 'avalon');
  // endGame 会遍历全员角色生成揭示列表，需完整设置 avalonRole
  room.players.forEach(p => { p.avalonSide = 'good'; p.avalonRole = 'servant'; });
  room.status = 'AVALON_TEAM_PROPOSE';
  room.currentQuestIndex = 0;
  room.leaderIndex = 0;
  room.winner = null;
  room.winReason = '';

  // 4 人：QUEST_CONFIGS[4] 为 undefined，原实现 startTeamPropose 会抛 TypeError
  avalon.onPlayerRemoved(room, 0, fakeIo, fakeBroadcast);

  assert.strictEqual(room.status, 'GAME_OVER', '人数不足应提前结束游戏');
  assert.ok(room.winReason.includes('人数不足'), '应给出人数不足的结束原因');
  cleanupRoom(room);
});

// ===================== 你画我猜：选词白名单（R2-34）=====================
test('drawGuess.selectWord: 不在候选白名单内的词被拒绝', () => {
  const room = mkRoom([mkPlayer('A', 0), mkPlayer('B', 1)], 'draw-guess');
  drawGuess.initRoomState(room);
  room.status = 'SELECTING';
  room.wordOptions = ['苹果', '香蕉', '西瓜'];
  room.currentDrawerIndex = 0;

  // 画师客户端被篡改后提交任意词（原实现直接写入谜底）
  drawGuess.selectWord(room, room.players[0].id, '任意伪造的词', fakeIo, fakeBroadcast);
  assert.strictEqual(room.status, 'SELECTING', '白名单外的词应被拒绝，状态不变');
  assert.strictEqual(room.currentWord, '', '谜底不应被污染');

  // 非字符串（数字）同样拒绝
  drawGuess.selectWord(room, room.players[0].id, 123, fakeIo, fakeBroadcast);
  assert.strictEqual(room.status, 'SELECTING');
  cleanupRoom(room);
});
