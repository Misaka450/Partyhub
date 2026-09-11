const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeDelta,
  applyDelta,
  initFsmMetadata,
  setDeterministicPhase,
  checkActionAllowed,
  createPlayerView
} = require('../../fsmEngine');

test('FSM Delta 计算与还原: computeDelta 只捕获真实变更，忽略内部字段', () => {
  const oldState = {
    roomId: '1234',
    status: 'PLAYING',
    round: 1,
    scores: { a: 10, b: 20 },
    _internalTimer: 999
  };

  const newState = {
    roomId: '1234',
    status: 'PLAYING',
    round: 2, // 改变
    scores: { a: 10, b: 30 }, // 改变
    _internalTimer: 888 // 内部属性被忽略
  };

  const delta = computeDelta(oldState, newState);
  assert.ok(delta, '应该检测到有状态变化');
  assert.equal(delta.round, 2);
  assert.deepEqual(delta.scores, { a: 10, b: 30 });
  assert.equal(delta.roomId, undefined, '未变字段不应该在 delta 中');
  assert.equal(delta._internalTimer, undefined, '_ 开头属性应被忽略');

  // 测试还原
  const patched = applyDelta(oldState, delta);
  assert.equal(patched.round, 2);
  assert.equal(patched.scores.b, 30);
});

test('FSM 动作防重放与流水号自增 (Action Mutex)', () => {
  const room = { id: 'TEST_ROOM' };
  initFsmMetadata(room);

  assert.equal(room.actionSeq, 0);

  // 第一次触发：合法通过，序号 +1
  const allowed1 = checkActionAllowed(room, 'token_alice', 'uno_play_card', 50);
  assert.equal(allowed1, true);
  assert.equal(room.actionSeq, 1);

  // 1ms 内同一玩家再次触发相同动作：被防抖拦截，序号不增加
  const allowed2 = checkActionAllowed(room, 'token_alice', 'uno_play_card', 50);
  assert.equal(allowed2, false);
  assert.equal(room.actionSeq, 1);

  // 另一玩家不同动作：合法通过
  const allowedBob = checkActionAllowed(room, 'token_bob', 'uno_draw_card', 50);
  assert.equal(allowedBob, true);
  assert.equal(room.actionSeq, 2);
});

test('FSM 确定性时钟同步: 正确注入权威时间戳并在超时后触发单次看门狗', async () => {
  const room = { id: 'CLOCK_ROOM' };
  let timeoutTriggered = false;

  const timer = setDeterministicPhase(room, 0.05, () => {
    timeoutTriggered = true;
  });

  assert.ok(room.phaseStartedAt > 0, '必须写入起始时间戳');
  assert.equal(room.phaseDuration, 0.05, '持续时长必须严格对齐');
  assert.ok(timer, '必须返回定时器句柄');

  // 等待超时
  await new Promise(r => setTimeout(r, 70));
  assert.equal(timeoutTriggered, true, '看门狗必须在指定时长后精确执行');
  assert.equal(room.timer, null, '触发后定时器句柄必须清空防悬挂');
});

test('FSM 安全视口投影 (PlayerView): 严格隔离 UNO / 卧底 / 阿瓦隆 私密状态', () => {
  // 1. UNO 手牌隔离
  const unoState = {
    gameType: 'uno',
    status: 'PLAYING',
    hands: {
      player_a: ['R1', 'B2'],
      player_b: ['G3', 'Y4', 'WILD']
    }
  };

  const playerAView = createPlayerView(unoState, 'player_a');
  assert.deepEqual(playerAView.hands.player_a, ['R1', 'B2'], '自己手牌完整可见');
  assert.equal(playerAView.hands.player_b, 3, '他人手牌只脱敏为张数，严禁偷窥牌面');

  // 2. 谁是卧底私密词汇
  const ucState = {
    gameType: 'undercover',
    status: 'SPEAKING',
    civilianWord: '牛奶',
    undercoverWord: '豆浆'
  };
  const ucView = createPlayerView(ucState, 'player_any');
  assert.equal(ucView.civilianWord, undefined, '游戏中严禁泄露词语');
  assert.equal(ucView.undercoverWord, undefined, '游戏中严禁泄露卧底词');

  // 3. 卧底游戏结束后公开
  const ucEndState = {
    gameType: 'undercover',
    status: 'GAME_OVER',
    civilianWord: '牛奶',
    undercoverWord: '豆浆'
  };
  const ucEndView = createPlayerView(ucEndState, 'player_any');
  assert.equal(ucEndView.civilianWord, '牛奶');
  assert.equal(ucEndView.undercoverWord, '豆浆');
});
