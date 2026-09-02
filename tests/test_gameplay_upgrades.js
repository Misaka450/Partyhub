const assert = require('assert');
const math24 = require('../games/math24');
const holePunch = require('../games/holePunch');
const trainRoute = require('../games/trainRoute');
const holdFive = require('../games/holdFive');
const wordBomb = require('../games/wordBomb');
const perfectSlice = require('../games/perfectSlice');

console.log('--- 开始针对 5 项游戏性重大改造进行单元与规则测试 ---');

// 1. 决战 24 点测试
console.log('\n[1/5] 测试《决战24点》无限动态发牌与严格判分...');
for (let round = 1; round <= 3; round++) {
  const puzzle = math24.getRandom24Puzzle(round);
  assert(Array.isArray(puzzle) && puzzle.length === 4, '发牌结构必须为 4 张卡牌');
  assert(math24.solve24(puzzle), `生成的卡牌必须保证严格有解: ${puzzle}`);
  const sol = math24.find24Solution(puzzle);
  assert(typeof sol === 'string' && sol.length > 0, `必须能够求出解法: ${sol}`);
}
// 校验严格 24 点判分
const validRes = math24.validateExpression('8 / (3 - 8 / 3)', [3, 8, 3, 8]);
assert(validRes.valid === true, '合法 24 点必须判定通过');
const invalidRes = math24.validateExpression('3 + 8 + 3 + 8', [3, 8, 3, 8]);
assert(invalidRes.valid === false, '计算非 24 点必须严格判定失败（拒绝保底分）');
console.log('✅ 《决战24点》测试全部 PASS');

// 2. 折纸打孔与火车轨道（时效递减与防蒙猜扣分）
console.log('\n[2/5] 测试《折纸打孔》与《火车轨道》时效递减分与答错扣分惩罚...');
// Mock room and player
function createMockRoom() {
  const room = {
    id: 'test_room',
    gameType: 'hole-punch',
    status: 'HOLE_ANSWER',
    roundStartTime: Date.now(),
    players: [
      { id: 's1', token: 'p1', name: '玩家1', score: 100 },
      { id: 's2', token: 'p2', name: '玩家2', score: 100 },
      { id: 's3', token: 'p3', name: '玩家3', score: 100 }
    ],
    playerAnswers: {},
    currentPuzzle: {
      correctOptionId: 'opt_correct'
    }
  };
  return room;
}
const mockIo = { to: () => ({ emit: () => {} }) };
const mockBroadcast = () => {};

// 2.1 快速正解
const r1 = createMockRoom();
r1.roundStartTime = Date.now() - 1500; // 1.5s (<= 3s)
holePunch.submitAnswer(r1, r1.players[0], 'opt_correct', mockIo, mockBroadcast);
assert.strictEqual(r1.playerAnswers['p1'].scoreGain, 100, '前 3 秒答对应获得满分 100 分');
assert.strictEqual(r1.players[0].score, 200, '总分应增加 100 分');

// 2.2 慢速正解
const r2 = createMockRoom();
r2.roundStartTime = Date.now() - 8000; // 8s (3s + 5s decay)
holePunch.submitAnswer(r2, r2.players[0], 'opt_correct', mockIo, mockBroadcast);
assert(r2.playerAnswers['p1'].scoreGain === 70, `8 秒答对应衰减为 70 分，实得: ${r2.playerAnswers['p1'].scoreGain}`);

// 2.3 答错扣分惩罚
const r3 = createMockRoom();
holePunch.submitAnswer(r3, r3.players[0], 'opt_wrong', mockIo, mockBroadcast);
assert.strictEqual(r3.playerAnswers['p1'].scoreGain, -50, '答错应受到 -50 分惩罚');
assert.strictEqual(r3.players[0].score, 50, '玩家总分应被扣除 50 分');

// 2.4 主动放弃不扣分
const r4 = createMockRoom();
holePunch.submitAnswer(r4, r4.players[0], 'pass', mockIo, mockBroadcast);
assert.strictEqual(r4.playerAnswers['p1'].scoreGain, 0, '主动放弃应得 0 分且不扣分');
assert.strictEqual(r4.players[0].score, 100, '玩家总分保持不变');

// 火车轨道一致性验证
const trRoom = { ...createMockRoom(), gameType: 'train-route', status: 'TRAIN_CONNECTING', currentPuzzle: { correctTrackId: 'track_A' } };
trainRoute.submitAnswer(trRoom, trRoom.players[0], 'track_wrong', mockIo, mockBroadcast);
assert.strictEqual(trRoom.playerAnswers['p1'].scoreGain, -50, '火车轨道答错同样应扣 50 分');
console.log('✅ 《折纸打孔》与《火车轨道》时效递减与防蒙猜扣分测试全部 PASS');

// 3. 盲压 5 秒（下注与干扰）
console.log('\n[3/5] 测试《盲压5秒》自信翻倍下注与干扰机制...');
const holdRoom = {
  gameType: 'hold-five',
  status: 'HOLD_PRESSING',
  round: 2,
  targetSeconds: 5.0,
  roundStartAt: Date.now() - 10000,
  players: [
    { id: 's1', token: 'p1', name: '下注成功者', score: 0 },
    { id: 's2', token: 'p2', name: '下注爆仓者', score: 0 },
    { id: 's3', token: 'p3', name: '普通玩家', score: 0 }
  ],
  playerHolds: {}
};

// 下注成功 (误差 0.05s)
holdFive.submitHoldTime(holdRoom, 'p1', { elapsedMs: 5050, isWager: true }, mockIo, mockBroadcast);
// 下注失败 (误差 0.5s)
holdFive.submitHoldTime(holdRoom, 'p2', { elapsedMs: 5500, isWager: true }, mockIo, mockBroadcast);
// 普通玩家 (误差 0.05s)
holdFive.submitHoldTime(holdRoom, 'p3', { elapsedMs: 5050, isWager: false }, mockIo, mockBroadcast);

// 结算
assert(holdRoom.players[0].score > holdRoom.players[2].score, '下注成功玩家得分必须大幅超过普通玩家');
assert.strictEqual(holdRoom.players[1].score, 0, '下注失败玩家得分必须清零');
console.log(`下注成功得分: ${holdRoom.players[0].score}, 普通玩家得分: ${holdRoom.players[2].score}, 爆仓玩家得分: ${holdRoom.players[1].score}`);
console.log('✅ 《盲压5秒》下注机制测试 PASS');

// 4. 词汇炸弹（限定模式、神速甩锅、成语反弹）
console.log('\n[4/5] 测试《文字炸弹》规则限定、甩锅加速与成语反弹...');
const wbRoom = {
  gameType: 'word-bomb',
  status: 'BOMB_TICKING',
  players: [
    { id: 's1', token: 'p1', name: '甲', score: 0 },
    { id: 's2', token: 'p2', name: '乙', score: 0 },
    { id: 's3', token: 'p3', name: '丙', score: 0 }
  ],
  playerLives: { p1: 2, p2: 2, p3: 2 },
  currentTurnToken: 'p1',
  currentKeyword: '天',
  ruleMode: 'START',
  usedWords: new Set(),
  baseTime: 8,
  timeLeft: 8,
  turnStartAt: Date.now()
};

// 4.1 首字限定校验
wordBomb.submitWord(wbRoom, 'p1', '春天', mockIo, mockBroadcast);
assert.strictEqual(wbRoom.currentTurnToken, 'p1', '未以【天】开头必须拦截并留在当前持弹人');

// 4.2 正确以【天】开头并极速作答
wbRoom.turnStartAt = Date.now() - 1000; // 1.0s 内完成
wordBomb.submitWord(wbRoom, 'p1', '天空', mockIo, mockBroadcast);
assert.strictEqual(wbRoom.currentTurnToken, 'p2', '答对后炸弹顺延给下一家');
assert(wbRoom.timeLeft <= 6.0, `2.2秒内极速答对必须施加 2 秒引信加速，下家引信缩短为 ${wbRoom.timeLeft}s`);

// 4.3 再次作答测试成语反弹
wbRoom.ruleMode = 'ANY'; // 非强制成语
wbRoom.currentKeyword = '天';
wbRoom.turnStartAt = Date.now() - 3000;
wbRoom.timeLeftPenalty = 0;
// 玩家 乙 打出四字成语【天衣无缝】
wordBomb.submitWord(wbRoom, 'p2', '天衣无缝', mockIo, mockBroadcast);
// 乙 顺延如果反向，应该回到 甲（p1）而不是顺向给 丙（p3）！
assert.strictEqual(wbRoom.currentTurnToken, 'p1', `成语反弹必须将炸弹原路送回上一家 (p1)，当前为: ${wbRoom.currentTurnToken}`);
console.log('✅ 《文字炸弹》限定模式、加速甩锅与成语反弹测试全部 PASS');

// 5. 切披萨（动态比例与避障检测）
console.log('\n[5/5] 测试《切披萨》动态比例悬赏与避障限制刀法...');
const sliceRoom = {
  gameType: 'perfect-slice',
  status: 'SLICE_CUTTING',
  round: 2,
  targetRatio: 30.0,
  players: [
    { id: 's1', token: 'p1', name: '切刀客1', score: 0 },
    { id: 's2', token: 'p2', name: '切刀客2', score: 0 }
  ],
  playerSlices: {},
  currentShape: {
    name: '测试圆形披萨',
    points: [
      { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }
    ],
    obstacles: [
      { id: 'obs_1', x: 0.5, y: 0.5, r: 0.05, name: '🌶️ 辣椒' }
    ]
  },
  roundStartTime: Date.now()
};

// 玩家1：横向穿过中心 (0.1, 0.5) -> (0.9, 0.5)，会切中中心 (0.5, 0.5) 的辣椒
perfectSlice.submitSlice(sliceRoom, 'p1', { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, mockIo, mockBroadcast);
assert.strictEqual(sliceRoom.playerSlices['p1'].hitObstacle, true, '穿过中心切线必须判定触碰障碍物');

// 玩家2：切出精确 30:70 (0.1, 0.38) -> (0.9, 0.38)，避开中心辣椒 (0.5, 0.5)
perfectSlice.submitSlice(sliceRoom, 'p2', { x: 0.1, y: 0.38 }, { x: 0.9, y: 0.38 }, mockIo, mockBroadcast);
assert.strictEqual(sliceRoom.playerSlices['p2'].hitObstacle, false, '未穿过中心切线必须判定避障成功');
assert(sliceRoom.playerSlices['p2'].baseScore > sliceRoom.playerSlices['p1'].baseScore, '避障成功的得分必须高于切中辣椒被扣分的玩家');
console.log('✅ 《切披萨》动态比例与避障检测测试全部 PASS');

console.log('\n🎉 所有 5 项游戏性改造功能单元测试 100% 通过！\n');
