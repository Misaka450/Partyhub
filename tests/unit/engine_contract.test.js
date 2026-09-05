// PartyHub 21 款游戏引擎统一规范与防作弊契约测试 (Node.js 内置 node:test)
// 覆盖审计建议：
// 1. 全量引擎 onPlayerRemoved 统一签名、异常防护与作答清理契约
// 2. 全量引擎 getPublicState 导出、非空与私密数据防泄露读包断言
// 3. 全量引擎 initRoomState 状态初始化规范
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ALL_ENGINES = {
  'draw-guess': require('../../games/drawGuess'),
  'undercover': require('../../games/undercover'),
  'avalon': require('../../games/avalon'),
  'uno': require('../../games/uno'),
  'flash-counter': require('../../games/flashCounter'),
  'bomb-roulette': require('../../games/bombRoulette'),
  'bulls-and-cows': require('../../games/bullsAndCows'),
  'math-24': require('../../games/math24'),
  'cube-count': require('../../games/cubeCount'),
  'word-bomb': require('../../games/wordBomb'),
  'perfect-slice': require('../../games/perfectSlice'),
  'hold-five': require('../../games/holdFive'),
  'stroop-trap': require('../../games/stroopTrap'),
  'twin-finder': require('../../games/twinFinder'),
  'shadow-match': require('../../games/shadowMatch'),
  'who-disappeared': require('../../games/whoDisappeared'),
  'simon-memory': require('../../games/simonMemory'),
  'train-route': require('../../games/trainRoute'),
  'hole-punch': require('../../games/holePunch'),
  'change-master': require('../../games/changeMaster'),
  'number-guess': require('../../games/numberGuess')
};

const mockIo = {
  to: () => ({ emit: () => {} }),
  emit: () => {}
};
const mockBroadcast = () => {};

function makeMockPlayer(name, idx) {
  return {
    id: `sock_${idx}`,
    token: `token_${name}`,
    name,
    avatar: '🐱',
    score: 0,
    isHost: idx === 0,
    isReady: true,
    alive: true,
    offlineTimer: null
  };
}

function makeMockRoom(gameType) {
  return {
    id: `ROOM_${gameType}`,
    gameType,
    status: 'LOBBY',
    players: [
      makeMockPlayer('P1', 0),
      makeMockPlayer('P2', 1),
      makeMockPlayer('P3', 2),
      makeMockPlayer('P4', 3),
      makeMockPlayer('P5', 4)
    ],
    timer: null,
    roundTimeout: null,
    lastActivity: Date.now()
  };
}

function cleanupRoom(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
}

test('引擎规范契约 1: 全部 21 款小游戏均导出标准的 initRoomState、getPublicState 契约函数', () => {
  for (const [name, engine] of Object.entries(ALL_ENGINES)) {
    assert.strictEqual(typeof engine.initRoomState, 'function', `【${name}】必须导出 initRoomState 函数`);
    assert.strictEqual(typeof engine.getPublicState, 'function', `【${name}】必须导出 getPublicState 函数`);
  }
});

test('引擎规范契约 2: 全部 21 款小游戏在 initRoomState 后 getPublicState 均返回合法非空对象', () => {
  for (const [name, engine] of Object.entries(ALL_ENGINES)) {
    const room = makeMockRoom(name);
    engine.initRoomState(room);
    assert.strictEqual(room.status, 'LOBBY', `【${name}】初始状态应为 LOBBY`);
    assert.strictEqual(room.timer, null, `【${name}】初始 timer 必须为空`);
    assert.strictEqual(room.roundTimeout, null, `【${name}】初始 roundTimeout 必须为空`);

    const pubState = engine.getPublicState(room);
    assert.ok(pubState && typeof pubState === 'object', `【${name}】getPublicState 必须返回对象`);
    cleanupRoom(room);
  }
});

test('引擎规范契约 3: onPlayerRemoved 统一传 (room, removedIndex) 签名且不发生抛错崩溃', () => {
  for (const [name, engine] of Object.entries(ALL_ENGINES)) {
    if (typeof engine.onPlayerRemoved !== 'function') continue;

    const room = makeMockRoom(name);
    engine.initRoomState(room);

    // 注入模拟作答记录（针对含 playerAnswers 的引擎）
    if (!room.playerAnswers) room.playerAnswers = {};
    room.playerAnswers['token_P1'] = { answer: 1 };
    room.playerAnswers['token_P2'] = { answer: 2 };

    // 模拟从索引 0 移除 P1
    room.players.splice(0, 1);

    assert.doesNotThrow(() => {
      engine.onPlayerRemoved(room, 0, mockIo, mockBroadcast);
    }, `【${name}】调用 onPlayerRemoved 不得抛出任何异常`);

    // 针对作答类引擎断言：已移除的 P1 答案记录必须已被清理（审计 M4 防回归）
    if (['hole-punch', 'shadow-match', 'train-route', 'who-disappeared'].includes(name)) {
      assert.strictEqual(room.playerAnswers['token_P1'], undefined, `【${name}】离场玩家 token_P1 的答案记录必须被清理`);
    }

    cleanupRoom(room);
  }
});

test('防作弊安全读包契约: 关键私密数据绝对不在 getPublicState 广播中向全房间泄露', () => {
  // 1. flash-counter: isTarget 不得出现在 flyingItems 中
  {
    const room = makeMockRoom('flash-counter');
    ALL_ENGINES['flash-counter'].initRoomState(room);
    ALL_ENGINES['flash-counter'].generateRoundData(room);
    room.status = 'FLASH_FLYING';
    const pub = ALL_ENGINES['flash-counter'].getPublicState(room);
    assert.ok(Array.isArray(pub.flyingItems), 'FLASH_FLYING 阶段应包含 flyingItems 供断线重连补看');
    const leaked = pub.flyingItems.some(item => 'isTarget' in item);
    assert.strictEqual(leaked, false, 'flyingItems 下发前必须剔除 isTarget 答案标记 (审计 C3)');
    cleanupRoom(room);
  }

  // 2. twin-finder: 角色特征中绝对不得包含 id='twin_1' 等答案标记，且不泄露 correctIndices
  {
    const room = makeMockRoom('twin-finder');
    ALL_ENGINES['twin-finder'].initRoomState(room);
    const puzzle = ALL_ENGINES['twin-finder'].generatePuzzle(1, 'normal');
    room.currentPuzzle = puzzle;
    room.status = 'TWIN_FINDING';
    const pub = ALL_ENGINES['twin-finder'].getPublicState(room);
    assert.strictEqual(pub.correctIndices, undefined, '公共状态不得携带 correctIndices 答案');
    const idLeaked = (pub.characters || []).some(c => 'id' in c);
    assert.strictEqual(idLeaked, false, '公共状态下发角色特征必须剥离 id 标记 (审计 C2)');
    cleanupRoom(room);
  }

  // 3. number-guess: 真实答案 truth 绝不进入公共状态
  {
    const room = makeMockRoom('number-guess');
    ALL_ENGINES['number-guess'].initRoomState(room);
    room.currentTrivia = { question: '地球赤道周长', unit: '公里', truth: 40075 };
    room.status = 'NUMBER_GUESSING';
    const pub = ALL_ENGINES['number-guess'].getPublicState(room);
    assert.strictEqual(pub.truth, undefined, '估数题公共状态严禁包含正确数值 truth');
    assert.ok(pub.question, '公共状态应包含题干');
    cleanupRoom(room);
  }

  // 4. simon-memory: 正确节拍序列 currentSequence 绝不进入公共状态
  {
    const room = makeMockRoom('simon-memory');
    ALL_ENGINES['simon-memory'].initRoomState(room);
    room.currentSequence = ['red', 'green', 'blue', 'yellow'];
    room.status = 'SIMON_INPUT';
    const pub = ALL_ENGINES['simon-memory'].getPublicState(room);
    assert.strictEqual(pub.currentSequence, undefined, '西蒙节拍公共状态严禁包含正确序列 currentSequence');
    assert.strictEqual(pub.totalSteps, 4, '应只包含总步数供前端展示进度');
    cleanupRoom(room);
  }

  // 5. undercover: 卧底身份词与角色绝不在公共状态广播
  {
    const room = makeMockRoom('undercover');
    ALL_ENGINES['undercover'].initRoomState(room);
    room.status = 'UC_SPEAKING';
    room.civWord = '平民词';
    room.spyWord = '卧底词';
    const pub = ALL_ENGINES['undercover'].getPublicState(room);
    assert.strictEqual(pub.civWord, undefined, '谁是卧底公共状态不得泄露 civWord');
    assert.strictEqual(pub.spyWord, undefined, '谁是卧底公共状态不得泄露 spyWord');
    cleanupRoom(room);
  }

  // 6. avalon: 梅林/莫甘娜/刺客等阵营与角色绝不在公共状态广播
  {
    const room = makeMockRoom('avalon');
    ALL_ENGINES['avalon'].initRoomState(room);
    room.status = 'AVALON_TEAM_VOTE';
    const pub = ALL_ENGINES['avalon'].getPublicState(room);
    assert.strictEqual(pub.allRoles, undefined, '阿瓦隆未终局时公共状态不得广播 allRoles');
    cleanupRoom(room);
  }
});
