// =========================================================================
// 脑力/聚会小游戏 单元测试套件 (Node.js 内置 node:test，零依赖)
// 已剔除 轨道小火车 / 折纸打孔 / 找零钱大师 三款游戏的单元用例
// =========================================================================

const { test } = require('node:test');
const assert = require('node:assert');

const stroopTrap = require('../../games/stroopTrap');
const shadowMatch = require('../../games/shadowMatch');
const simonMemory = require('../../games/simonMemory');
const numberGuess = require('../../games/numberGuess');

// ===================== 1. 颜色与文字大陷阱 =====================
test('stroopTrap.generateQuestion: 题目结构合法且具备 4 个互斥候选项', () => {
  for (let r = 1; r <= 3; r++) {
    const q = stroopTrap.generateQuestion(r);
    assert.ok(q.displayText, '必须包含 displayText');
    assert.ok(q.displayColorHex, '必须包含 displayColorHex');
    assert.ok(q.targetMode === 'COLOR' || q.targetMode === 'MEANING', 'targetMode 必须合法');
    assert.ok(q.targetId, '必须有 targetId');
    assert.strictEqual(q.options.length, 4, '候选项必须为 4 个');
    assert.ok(q.options.some(opt => opt.id === q.targetId), '候选项必须包含正确答案');
  }
});

test('stroopTrap.generateQuestion: 难度 colorBias 决定“看颜色/看字义”指令偏向，且 init 默认 normal', () => {
  // colorBias=1 => 永远“看颜色”(COLOR)；colorBias=0 => 永远“看字义”(MEANING)，确定性校验
  assert.strictEqual(stroopTrap.generateQuestion(1, 1).targetMode, 'COLOR', 'colorBias=1 时指令必须是看颜色');
  assert.strictEqual(stroopTrap.generateQuestion(1, 0).targetMode, 'MEANING', 'colorBias=0 时指令必须是看字义');

  // 默认难度档位归一到 normal
  const room = {};
  stroopTrap.initRoomState(room);
  assert.strictEqual(room.stroopDiff, 'normal', '未配置难度时应默认 normal');
});

// ===================== 2. 谁是多胞胎 / 找不同 =====================
// ===================== 3. 影子猜物 / 聚光灯拼图 =====================
test('shadowMatch.generateShadowPuzzle: 剪影谜题生成与候选项包含目标', () => {
  for (let r = 1; r <= 3; r++) {
    const puzzle = shadowMatch.generateShadowPuzzle(r);
    assert.ok(puzzle.targetId, '必须有目标 ID');
    assert.ok(puzzle.targetEmoji, '必须有目标 Emoji 剪影');
    assert.strictEqual(puzzle.options.length, 4, '必须有 4 个候选项');
    assert.ok(puzzle.options.some(o => o.id === puzzle.targetId), '候选项必须包含正确答案');
  }
});

// ===================== 4. 谁不见了 / 偷吃怪 =====================
// ===================== 5. 西蒙节拍记忆 =====================
test('simonMemory.generateSequence: 序列步数严格随轮次递增', () => {
  const seq1 = simonMemory.generateSequence(1);
  const seq2 = simonMemory.generateSequence(2);
  const seq3 = simonMemory.generateSequence(3);

  assert.strictEqual(seq1.length, 3, '第 1 轮为 3 步');
  assert.strictEqual(seq2.length, 4, '第 2 轮为 4 步');
  assert.strictEqual(seq3.length, 5, '第 3 轮为 5 步');

  const validColors = new Set(['red', 'green', 'blue', 'yellow']);
  seq1.forEach(c => assert.ok(validColors.has(c), '序列颜色必须合法'));
});

// ===================== 9. 盲猜谁最接近 =====================
test('numberGuess.evaluateGuesses: 偏差最小者排名第一且获得最高分', () => {
  const truth = 64; // 国际象棋格子
  const submissions = [
    { token: 'p1', name: '玩家A', guess: 60 },  // 差 4
    { token: 'p2', name: '玩家B', guess: 65 },  // 差 1 (最准)
    { token: 'p3', name: '玩家C', guess: 100 }, // 差 36
    { token: 'p4', name: '玩家D', guess: 'abc' } // 非法输入
  ];

  const results = numberGuess.evaluateGuesses(submissions, truth);
  assert.strictEqual(results[0].token, 'p2', '差 1 的玩家B应该排第 1 名');
  assert.strictEqual(results[0].scoreGain, 160, '第 1 名应该获得 160 分');
  assert.strictEqual(results[1].token, 'p1', '差 4 的玩家A应该排第 2 名');
  assert.strictEqual(results[1].scoreGain, 100, '第 2 名应该获得 100 分');
  assert.strictEqual(results[2].token, 'p3', '差 36 的玩家C应该排第 3 名');
  assert.strictEqual(results[2].scoreGain, 60, '第 3 名应该获得 60 分');
});
