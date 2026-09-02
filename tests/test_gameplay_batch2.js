const assert = require('assert');
const changeMaster = require('../games/changeMaster');
const stroopTrap = require('../games/stroopTrap');
const simonMemory = require('../games/simonMemory');
const cubeCount = require('../games/cubeCount');
const numberGuess = require('../games/numberGuess');
const flashCounter = require('../games/flashCounter');

console.log('=== 开始第二批 6 款游戏性重大升级验证 ===\n');

const mockIo = { to: () => ({ emit: () => {} }) };
const mockBroadcast = () => {};

// 1. 测试《零钱大师》
console.log('[1/6] 验证《零钱大师》最少张数与零钱危机...');
// 1.1 贪心最少张数
const bill1 = { paid: 100, cost: 65, changeDue: 35, minSheets: 3 }; // 20 + 10 + 5 = 3 张
const rChange1 = {
  gameType: 'change-master',
  status: 'CASH_COUNTING',
  roundStartTime: Date.now() - 2000,
  currentBill: bill1,
  players: [
    { id: 's1', token: 'p1', name: '最优玩家', score: 0 },
    { id: 's2', token: 'p2', name: '多用纸币玩家', score: 0 }
  ],
  playerAnswers: {}
};
// 玩家1：20 + 10 + 5 (3张，最优)
changeMaster.submitChange(rChange1, rChange1.players[0], { 20: 1, 10: 1, 5: 1 }, mockIo, mockBroadcast);
assert(rChange1.playerAnswers['p1'].isOptimal === true, '应该判定为最优贪心');

// 玩家2：5*7 = 35 (7张，多用 4 张)
changeMaster.submitChange(rChange1, rChange1.players[1], { 5: 7 }, mockIo, mockBroadcast);
assert(rChange1.playerAnswers['p2'].isOptimal === false, '应该判定为非最优');
assert(rChange1.players[0].score > rChange1.players[1].score, '最优解玩家得分应高于多用纸币玩家');

// 1.2 缺货面额
const billCrisis = { paid: 100, cost: 80, changeDue: 20, depletedDenom: 20, minSheets: 2 }; // 20元缺货，只能 10+10
const rChange2 = {
  gameType: 'change-master',
  status: 'CASH_COUNTING',
  roundStartTime: Date.now() - 2000,
  currentBill: billCrisis,
  players: [{ id: 's1', token: 'p1', name: '违规玩家', score: 100 }],
  playerAnswers: {}
};
changeMaster.submitChange(rChange2, rChange2.players[0], { 20: 1 }, mockIo, mockBroadcast);
assert.strictEqual(rChange2.playerAnswers['p1'].isValid, false, '使用缺货面额必须判定无效');
assert.strictEqual(rChange2.players[0].score, 70, '使用缺货面额应扣除 30 分');
console.log('✅ 《零钱大师》最少张数与零钱危机测试 PASS');

// 2. 测试《斯特鲁普陷阱》
console.log('\n[2/6] 验证《斯特鲁普陷阱》15秒连击狂飙与即时换题...');
const rStroop = {
  gameType: 'stroop-trap',
  status: 'STROOP_ANSWER',
  round: 1,
  maxRounds: 3,
  players: [{ id: 's1', token: 'p1', name: '连击王', score: 0 }],
  playerQuestions: {},
  playerStats: {}
};
stroopTrap.startGame(rStroop, mockIo, mockBroadcast);
const firstQ = rStroop.playerQuestions['p1'];
assert(firstQ && firstQ.targetId, '开局必须为玩家分配题目');

// 连续答对 3 次
stroopTrap.submitAnswer(rStroop, rStroop.players[0], firstQ.targetId, mockIo, mockBroadcast);
assert.strictEqual(rStroop.playerStats['p1'].combo, 1, '第1次答对 combo 应为 1');
const secondQ = rStroop.playerQuestions['p1'];
assert(secondQ, '答对后必须立刻生成第2题');

stroopTrap.submitAnswer(rStroop, rStroop.players[0], secondQ.targetId, mockIo, mockBroadcast);
assert.strictEqual(rStroop.playerStats['p1'].combo, 2, '第2次答对 combo 应为 2');

// 故意答错第 3 题
const thirdQ = rStroop.playerQuestions['p1'];
stroopTrap.submitAnswer(rStroop, rStroop.players[0], 'wrong_answer_id', mockIo, mockBroadcast);
assert.strictEqual(rStroop.playerStats['p1'].combo, 0, '答错后 combo 必须清零');
assert.strictEqual(rStroop.playerStats['p1'].maxCombo, 2, 'maxCombo 应保持为历史最高 2');
console.log('✅ 《斯特鲁普陷阱》15秒连击狂飙测试 PASS');

// 3. 测试《西蒙记忆》
console.log('\n[3/6] 验证《西蒙记忆》逆向倒序复现与加分...');
const rSimon = {
  gameType: 'simon-memory',
  status: 'SIMON_INPUT',
  round: 2,
  isReverse: true, // 强制逆向模式
  currentSequence: ['red', 'green', 'blue'],
  roundStartTime: Date.now() - 2000,
  timeLeft: 8,
  players: [
    { id: 's1', token: 'p1', name: '逆向高手', score: 0 },
    { id: 's2', token: 'p2', name: '失误玩家', score: 100 }
  ],
  playerInputs: {}
};
// 正常顺序是 red, green, blue。逆向必须输入 blue, green, red！
simonMemory.submitStep(rSimon, rSimon.players[0], 'blue', mockIo, mockBroadcast);
simonMemory.submitStep(rSimon, rSimon.players[0], 'green', mockIo, mockBroadcast);
simonMemory.submitStep(rSimon, rSimon.players[0], 'red', mockIo, mockBroadcast);
assert.strictEqual(rSimon.playerInputs['p1'].isCompleted, true, '逆向输入 blue->green->red 必须判定完成');
assert(rSimon.playerInputs['p1'].scoreGain >= 150, '逆向完成应获得 100 基础分 + 逆向 50 奖励 + 速度分');

// 失误玩家按了正序 red
simonMemory.submitStep(rSimon, rSimon.players[1], 'red', mockIo, mockBroadcast);
assert.strictEqual(rSimon.playerInputs['p2'].isFailed, true, '逆向模式输入正序第一步必须立即判定失败');
assert.strictEqual(rSimon.players[1].score, 75, '失败扣除 25 分');
console.log('✅ 《西蒙记忆》逆向倒序机制测试 PASS');

// 4. 测试《方块计数》
console.log('\n[4/6] 验证《方块计数》直接数字输入与扣分...');
const rCube = {
  gameType: 'cube-count',
  status: 'CUBE_GUESSING',
  totalCubes: 14,
  guessStartTime: Date.now() - 3000,
  players: [
    { id: 's1', token: 'p1', name: '精确数方块', score: 0 },
    { id: 's2', token: 'p2', name: '数错玩家', score: 100 }
  ],
  playerAnswers: {}
};
cubeCount.submitAnswer(rCube, 'p1', 14, mockIo, mockBroadcast);
cubeCount.submitAnswer(rCube, 'p2', 12, mockIo, mockBroadcast);
// 全员提交后 submitAnswer 已自动触发 endRound 提前结算
assert(rCube.playerAnswers['p1'].isCorrect === true, '数字 14 判定正确');
assert(rCube.playerAnswers['p2'].isCorrect === false, '数字 12 判定错误');
assert.strictEqual(rCube.players[1].score, 70, '答错扣除 30 分');
console.log('✅ 《方块计数》直接数字输入测试 PASS');

// 5. 测试《猜大小/谁最接近》
console.log('\n[5/6] 验证《猜大小/谁最接近》绝不爆牌规则 (The Price is Right)...');
const truth = 100;
const subs = [
  { token: 'p1', name: '精确', guess: '100' },
  { token: 'p2', name: '接近未爆', guess: '95' },
  { token: 'p3', name: '保守', guess: '80' },
  { token: 'p4', name: '爆牌一族', guess: '101' },
  { token: 'p5', name: '大爆特爆', guess: '150' }
];
const ev = numberGuess.evaluateGuesses(subs, truth);
assert.strictEqual(ev.find(p => p.token === 'p1').isBust, false);
assert.strictEqual(ev.find(p => p.token === 'p1').scoreGain, 260, '完全猜中且未爆牌得 160 + 100 绝杀分');
assert.strictEqual(ev.find(p => p.token === 'p2').scoreGain, 100, '第2接近得 100 分');
assert.strictEqual(ev.find(p => p.token === 'p3').scoreGain, 60, '第3接近得 60 分');
assert.strictEqual(ev.find(p => p.token === 'p4').isBust, true, '猜 101 大于 100 必须爆牌');
assert.strictEqual(ev.find(p => p.token === 'p4').scoreGain, 0, '爆牌玩家得 0 分');
assert.strictEqual(ev.find(p => p.token === 'p5').isBust, true, '猜 150 必须爆牌且得 0 分');
console.log('✅ 《猜大小》绝不爆牌规则测试 PASS');

// 6. 测试《闪烁计数》
console.log('\n[6/6] 验证《闪烁计数》多动物突袭对比与幽灵题...');
const rFlash = { round: 2 };
flashCounter.generateRoundData(rFlash);
assert(rFlash.options && rFlash.options.length >= 3, '必须生成合法选项列表');
assert(rFlash.questionPrompt && rFlash.questionPrompt.length > 0, '必须生成题干文本');
assert(rFlash.correctOption !== undefined, '必须存在明确的正解');
console.log(`题型: ${rFlash.questionType}, 题干: "${rFlash.questionPrompt}", 选项:`, rFlash.options, `正解: "${rFlash.correctOption}"`);
console.log('✅ 《闪烁计数》多动物突袭题型生成测试 PASS');

console.log('\n🎉 第二批 6 款游戏性规则改造单元测试全部通过！\n');
