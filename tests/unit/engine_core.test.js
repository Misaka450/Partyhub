// PartyHub 核心引擎单元测试（Node.js 内置 node:test，零依赖）
// 运行方式：npm test  （package.json 中 test 脚本为 node --test tests/unit/）
const { test } = require('node:test');
const assert = require('node:assert');

const { shuffle } = require('../../games/shuffle');
const math24 = require('../../games/math24');
const uno = require('../../games/uno');
const bullsAndCows = require('../../games/bullsAndCows');

// ===================== shuffle 公共洗牌工具 =====================
test('shuffle: 打乱后元素集合与长度保持不变', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(src);
  assert.strictEqual(out.length, src.length);
  assert.deepStrictEqual([...out].sort((a, b) => a - b), src);
});

test('shuffle: 不修改原数组', () => {
  const src = [1, 2, 3];
  const snapshot = [...src];
  shuffle(src);
  assert.deepStrictEqual(src, snapshot);
});

// ===================== math24: 安全求值器（Shunting-yard） =====================
test('safeEvaluate: 基础四则运算与优先级', () => {
  assert.strictEqual(math24.safeEvaluate('2+3*4'), 14);
  assert.strictEqual(math24.safeEvaluate('(2+3)*4'), 20);
  assert.strictEqual(math24.safeEvaluate('10/4'), 2.5);
  assert.strictEqual(math24.safeEvaluate('8/3/3*8'), 64 / 9);
});

test('safeEvaluate: 非法表达式应抛错（除零/括号不匹配/非法字符）', () => {
  assert.throws(() => math24.safeEvaluate('5/0'));
  assert.throws(() => math24.safeEvaluate('(2+3'));
  assert.throws(() => math24.safeEvaluate('alert(1)'));
});

test('validateExpression: 正确解出 24 点', () => {
  const r = math24.validateExpression('(3+5)*(9-6)', [3, 5, 9, 6]);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(Math.abs(r.result - 24) < 1e-5, true);
});

test('validateExpression: 结果不是 24 应拒绝', () => {
  const r = math24.validateExpression('3+5*9-6', [3, 5, 9, 6]);
  assert.strictEqual(r.valid, false);
});

test('validateExpression: 数字与给定牌不符应拒绝', () => {
  const r = math24.validateExpression('5+5+5+5', [1, 2, 3, 4]);
  assert.strictEqual(r.valid, false);
});

test('validateExpression: 非法字符应拒绝', () => {
  const r = math24.validateExpression('alert(1)', [1]);
  assert.strictEqual(r.valid, false);
});

// ===================== uno: 出牌合法性 =====================
test('isPlayable: 颜色/数字/万能牌匹配规则', () => {
  const top = { color: 'blue', value: '5', type: 'number' };
  assert.strictEqual(uno.isPlayable({ color: 'blue', value: '7', type: 'number' }, top, 'blue', 0), true);
  assert.strictEqual(uno.isPlayable({ color: 'red', value: '5', type: 'number' }, top, 'blue', 0), true);
  assert.strictEqual(uno.isPlayable({ color: 'red', value: '8', type: 'number' }, top, 'blue', 0), false);
  assert.strictEqual(uno.isPlayable({ color: 'wild', value: 'wild', type: 'wild' }, top, 'blue', 0), true);
});

test('isPlayable: 罚牌叠加期间只能垫 +2/+4', () => {
  const top2 = { color: 'red', value: 'draw2', type: 'draw2' };
  const top4 = { color: 'wild', value: 'wild4', type: 'wild4' };
  assert.strictEqual(uno.isPlayable({ color: 'red', value: 'draw2', type: 'draw2' }, top2, 'red', 2), true);
  assert.strictEqual(uno.isPlayable({ color: 'red', value: '5', type: 'number' }, top2, 'red', 2), false);
  assert.strictEqual(uno.isPlayable({ color: 'wild', value: 'wild4', type: 'wild4' }, top4, 'blue', 4), true);
  assert.strictEqual(uno.isPlayable({ color: 'red', value: 'draw2', type: 'draw2' }, top4, 'blue', 4), false);
});

// ===================== bullsAndCows: a/b 判定 =====================
test('evaluateGuess: 标准几A几B判定', () => {
  assert.deepStrictEqual(bullsAndCows.evaluateGuess('1234', '1324'), { a: 2, b: 2 });
  assert.deepStrictEqual(bullsAndCows.evaluateGuess('1234', '1234'), { a: 4, b: 0 });
  assert.deepStrictEqual(bullsAndCows.evaluateGuess('1234', '5678'), { a: 0, b: 0 });
  assert.deepStrictEqual(bullsAndCows.evaluateGuess('9876', '6789'), { a: 0, b: 4 });
});
