// =========================================================================
// 9款全新脑力/聚会小游戏 单元测试套件 (Node.js 内置 node:test，零依赖)
// =========================================================================

const { test } = require('node:test');
const assert = require('node:assert');

const stroopTrap = require('../../games/stroopTrap');
const twinFinder = require('../../games/twinFinder');
const shadowMatch = require('../../games/shadowMatch');
const whoDisappeared = require('../../games/whoDisappeared');
const simonMemory = require('../../games/simonMemory');
const trainRoute = require('../../games/trainRoute');
const holePunch = require('../../games/holePunch');
const changeMaster = require('../../games/changeMaster');
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

// ===================== 2. 谁是多胞胎 / 找不同 =====================
test('twinFinder.generatePuzzle: 双胞胎模式下两只目标角色属性严格一致', () => {
  for (let r = 1; r <= 5; r++) {
    const p = twinFinder.generatePuzzle(r);
    assert.ok(p.characters.length >= 6, '角色列表至少 6 个');
    if (p.mode === 'TWINS') {
      assert.strictEqual(p.correctIndices.length, 2, '双胞胎答案必须为 2 个下标');
      const c1 = p.characters[p.correctIndices[0]];
      const c2 = p.characters[p.correctIndices[1]];
      assert.strictEqual(c1.head, c2.head, '头部特征必须一致');
      assert.strictEqual(c1.bgColor, c2.bgColor, '背景颜色必须一致');
      assert.strictEqual(c1.accessory, c2.accessory, '装饰配件必须一致');
      assert.strictEqual(c1.handItem, c2.handItem, '手持物品必须一致');
    } else if (p.mode === 'ODD_ONE') {
      assert.strictEqual(p.correctIndices.length, 1, '找不同答案必须为 1 个下标');
    }
  }
});

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
test('whoDisappeared.generateDisappearPuzzle: 初始盘包含目标，剩余盘剔除目标', () => {
  for (let r = 1; r <= 3; r++) {
    const puzzle = whoDisappeared.generateDisappearPuzzle(r);
    assert.ok(puzzle.initialItems.length >= 5, '初始餐盘食物数量 >= 5');
    assert.strictEqual(puzzle.remainingItems.length, puzzle.initialItems.length - 1, '剩余数量恰好少 1 个');
    assert.ok(puzzle.initialItems.some(i => i.id === puzzle.eatenItem.id), '被吃掉的食物必在初始盘');
    assert.ok(!puzzle.remainingItems.some(i => i.id === puzzle.eatenItem.id), '被吃掉的食物不能在剩余盘');
    assert.strictEqual(puzzle.options.length, 4, '候选项为 4 个');
    assert.ok(puzzle.options.some(o => o.id === puzzle.eatenItem.id), '候选项包含被吃掉的目标');
  }
});

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

// ===================== 6. 轨道小火车 =====================
test('trainRoute.generateTrackPuzzle: 缺失关键位置且候选项包含解法', () => {
  for (let r = 1; r <= 4; r++) {
    const p = trainRoute.generateTrackPuzzle(r);
    assert.strictEqual(p.grid.length, 3);
    assert.strictEqual(p.grid[0].length, 3);
    const { r: mr, c: mc } = p.missingPos;
    assert.strictEqual(p.grid[mr][mc], 'missing', '缺失格子必须标记为 missing');
    assert.strictEqual(p.options.length, 4, '必须有 4 个轨道候选项');
    assert.ok(p.options.some(o => o.id === p.correctTrackId), '候选项必须包含正确轨道');
  }
});

// ===================== 7. 折纸打孔展开图 =====================
test('holePunch.generateFoldingPuzzle: 展开网格具备精确几何镜像对称性', () => {
  for (let r = 1; r <= 4; r++) {
    const p = holePunch.generateFoldingPuzzle(r);
    const opt = p.options.find(o => o.optionId === p.correctOptionId);
    assert.ok(opt, '必须包含正确展开项');
    const g = opt.grid;
    assert.strictEqual(g.length, 4);
    assert.strictEqual(g[0].length, 4);

    // 打孔点处必须为 1
    assert.strictEqual(g[p.punchPos.r][p.punchPos.c], 1, '打孔原始点必须有孔');

    if (p.foldType === 'FOLD_RIGHT') {
      // 水平对称：c 与 (3 - c) 处的孔洞必须完全一致
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          assert.strictEqual(g[row][col], g[row][3 - col], '水平对折后左右必须镜像对称');
        }
      }
    } else if (p.foldType === 'FOLD_DOWN') {
      // 垂直对称：row 与 (3 - row) 处的孔洞必须完全一致
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          assert.strictEqual(g[row][col], g[3 - row][col], '垂直对折后上下必须镜像对称');
        }
      }
    }
  }
});

// ===================== 8. 找零钱大师 =====================
test('changeMaster.generateBill & validateChange: 账单算术守恒与纸币硬币组合校验', () => {
  for (let r = 1; r <= 3; r++) {
    const bill = changeMaster.generateBill(r);
    assert.strictEqual(bill.paid - bill.cost, bill.changeDue, '找零金额必须等于 实付 - 消费');

    // 验证找零校验函数：正例
    const validPlan = { 50: 0, 20: 0, 10: 0, 5: 0, 1: bill.changeDue };
    assert.strictEqual(changeMaster.validateChange(validPlan, bill.changeDue).isValid, true);

    // 验证找零校验函数：反例（多找 1 元）
    const invalidPlan = { ...validPlan, 1: bill.changeDue + 1 };
    assert.strictEqual(changeMaster.validateChange(invalidPlan, bill.changeDue).isValid, false);
  }
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
