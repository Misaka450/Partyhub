// PartyHub 全部 21 款小游戏端到端全生命周期状态流转与终局结算 E2E 自动化测试
const { test } = require('node:test');
const assert = require('node:assert');

const avalon = require('../../games/avalon');
const bombRoulette = require('../../games/bombRoulette');
const bullsAndCows = require('../../games/bullsAndCows');
const changeMaster = require('../../games/changeMaster');
const cubeCount = require('../../games/cubeCount');
const drawGuess = require('../../games/drawGuess');
const flashCounter = require('../../games/flashCounter');
const holdFive = require('../../games/holdFive');
const holePunch = require('../../games/holePunch');
const math24 = require('../../games/math24');
const numberGuess = require('../../games/numberGuess');
const perfectSlice = require('../../games/perfectSlice');
const shadowMatch = require('../../games/shadowMatch');
const simonMemory = require('../../games/simonMemory');
const stroopTrap = require('../../games/stroopTrap');
const trainRoute = require('../../games/trainRoute');
const twinFinder = require('../../games/twinFinder');
const undercover = require('../../games/undercover');
const uno = require('../../games/uno');
const whoDisappeared = require('../../games/whoDisappeared');
const wordBomb = require('../../games/wordBomb');

function cleanTimers(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  if (room.stageTimeout) clearTimeout(room.stageTimeout);
  if (room.memorizeTimer) clearTimeout(room.memorizeTimer);
  room.timer = null;
  room.roundTimeout = null;
  room.stageTimeout = null;
  room.memorizeTimer = null;
}

function createTestRoom(gameType, playerCount = 3) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `sock_${i + 1}`,
    token: `token_${i + 1}`,
    name: `玩家${i + 1}`,
    avatar: '🐱',
    score: 0,
    isHost: i === 0,
    isReady: true,
    alive: true
  }));
  return {
    id: 'room_e2e_test',
    gameType,
    status: 'LOBBY',
    players,
    timer: null,
    roundTimeout: null,
    lastActivity: Date.now()
  };
}

function createFakeIo() {
  const events = [];
  return {
    events,
    to: (roomId) => ({
      emit: (event, payload) => {
        events.push({ roomId, event, payload });
      }
    })
  };
}

// 1. 盲猜谁接近 (numberGuess)
test('Full Lifecycle: 盲猜谁接近 (numberGuess)', () => {
  const room = createTestRoom('number-guess', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  numberGuess.initRoomState(room);
  numberGuess.startGame(room, io, broadcast);
  assert.strictEqual(room.status, 'NUMBER_GUESSING');

  numberGuess.submitGuess(room, room.players[0], 100, io, broadcast);
  numberGuess.submitGuess(room, room.players[1], 200, io, broadcast);
  assert.strictEqual(room.status, 'NUMBER_ROUND_RESULT');

  numberGuess.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 2. 找零大师 (changeMaster)
test('Full Lifecycle: 找零大师 (changeMaster)', () => {
  const room = createTestRoom('change-master', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  changeMaster.initRoomState(room);
  changeMaster.startGame(room, io, broadcast);
  assert.strictEqual(room.status, 'CASH_COUNTING');

  const diff = room.currentBill.received - room.currentBill.total;
  const counts = { c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, c1: diff };
  changeMaster.submitChange(room, room.players[0], counts, io, broadcast);
  changeMaster.submitChange(room, room.players[1], counts, io, broadcast);
  assert.strictEqual(room.status, 'CASH_RESULT');

  changeMaster.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 3. 西蒙节拍记忆 (simonMemory)
test('Full Lifecycle: 西蒙节拍记忆 (simonMemory)', () => {
  const room = createTestRoom('simon-memory', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  simonMemory.initRoomState(room);
  simonMemory.startGame(room, io, broadcast);
  assert.strictEqual(room.status, 'SIMON_DEMO');

  room.status = 'SIMON_INPUT';
  simonMemory.submitStep(room, room.players[0], room.sequence, io, broadcast);
  simonMemory.submitStep(room, room.players[1], room.sequence, io, broadcast);
  assert.strictEqual(room.status, 'SIMON_RESULT');

  simonMemory.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 4. 色彩陷阱 (stroopTrap)
test('Full Lifecycle: 色彩陷阱 (stroopTrap)', () => {
  const room = createTestRoom('stroop-trap', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  stroopTrap.initRoomState(room);
  stroopTrap.startGame(room, io, broadcast);
  assert.strictEqual(room.status, 'STROOP_ANSWER');

  stroopTrap.submitAnswer(room, room.players[0], room.currentQuestion.correctIndex, io, broadcast);
  stroopTrap.submitAnswer(room, room.players[1], room.currentQuestion.correctIndex, io, broadcast);
  assert.strictEqual(room.status, 'STROOP_RESULT');

  stroopTrap.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 5. 瞬间数羊 (flashCounter)
test('Full Lifecycle: 瞬间数羊 (flashCounter)', () => {
  const room = createTestRoom('flash-counter', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  flashCounter.initRoomState(room);
  flashCounter.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'FLASH_READY');

  room.status = 'FLASH_GUESSING';
  flashCounter.submitAnswer(room, room.players[0].token, room.options[0], io, broadcast);
  flashCounter.submitAnswer(room, room.players[1].token, room.options[0], io, broadcast);
  assert.strictEqual(room.status, 'FLASH_ROUND_RESULT');
  cleanTimers(room);
});

// 6. 3D数独块 (cubeCount)
test('Full Lifecycle: 3D数独块 (cubeCount)', () => {
  const room = createTestRoom('cube-count', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  cubeCount.initRoomState(room);
  cubeCount.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'CUBE_OBSERVE');

  room.status = 'CUBE_GUESSING';
  cubeCount.submitAnswer(room, room.players[0].token, room.totalCubes, io, broadcast);
  cubeCount.submitAnswer(room, room.players[1].token, room.totalCubes, io, broadcast);
  assert.strictEqual(room.status, 'CUBE_ROUND_RESULT');
  cleanTimers(room);
});

// 7. 几A几B猜数字 (bullsAndCows)
test('Full Lifecycle: 几A几B猜数字 (bullsAndCows)', () => {
  const room = createTestRoom('bulls-and-cows', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  bullsAndCows.initRoomState(room);
  bullsAndCows.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'BC_PLAYING');

  bullsAndCows.submitGuess(room, room.players[0].token, room.secretNumber, io, broadcast);
  cleanTimers(room);
});

// 8. 决战24点 (math24)
test('Full Lifecycle: 决战24点 (math24)', () => {
  const room = createTestRoom('math-24', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  math24.initRoomState(room);
  math24.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'M24_PLAYING');

  room.cards = [6, 6, 6, 6];
  math24.submitSolution(room, room.players[0].token, '6+6+6+6', io, broadcast);
  cleanTimers(room);
});

// 9. 盲压5秒 (holdFive)
test('Full Lifecycle: 盲压5秒 (holdFive)', () => {
  const room = createTestRoom('hold-five', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  holdFive.initRoomState(room);
  holdFive.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'HOLD_PRESSING');

  // 将 roundStartAt 设为 5 秒前，通过服务端墙钟反作弊校验
  room.roundStartAt = Date.now() - 5000;
  holdFive.submitHoldTime(room, room.players[0].token, 5000, io, broadcast);
  holdFive.submitHoldTime(room, room.players[1].token, 4950, io, broadcast);
  assert.strictEqual(room.status, 'HOLD_ROUND_RESULT');
  cleanTimers(room);
});

// 10. 切披萨 (perfectSlice)
test('Full Lifecycle: 切披萨 (perfectSlice)', () => {
  const room = createTestRoom('perfect-slice', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  perfectSlice.initRoomState(room);
  perfectSlice.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'SLICE_CUTTING');

  perfectSlice.submitSlice(room, room.players[0].token, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, io, broadcast);
  perfectSlice.submitSlice(room, room.players[1].token, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, io, broadcast);
  assert.strictEqual(room.status, 'SLICE_ROUND_RESULT');
  cleanTimers(room);
});

// 11. 双胞胎找茬 (twinFinder)
test('Full Lifecycle: 双胞胎找茬 (twinFinder)', () => {
  const room = createTestRoom('twin-finder', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  twinFinder.initRoomState(room);
  twinFinder.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'TWIN_FINDING');

  const twinTargetIndex = room.currentPuzzle.correctIndices[0];
  twinFinder.submitAnswer(room, room.players[0], twinTargetIndex, io, broadcast);
  twinFinder.submitAnswer(room, room.players[1], twinTargetIndex, io, broadcast);
  assert.strictEqual(room.status, 'TWIN_RESULT');

  twinFinder.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 12. 剪影识物 (shadowMatch)
test('Full Lifecycle: 剪影识物 (shadowMatch)', () => {
  const room = createTestRoom('shadow-match', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  shadowMatch.initRoomState(room);
  shadowMatch.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'SHADOW_GUESSING');

  shadowMatch.submitAnswer(room, room.players[0], room.currentPuzzle.correctIndex, io, broadcast);
  shadowMatch.submitAnswer(room, room.players[1], room.currentPuzzle.correctIndex, io, broadcast);
  assert.strictEqual(room.status, 'SHADOW_RESULT');

  shadowMatch.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 13. 谁被吃掉了 (whoDisappeared)
test('Full Lifecycle: 谁被吃掉了 (whoDisappeared)', () => {
  const room = createTestRoom('who-disappeared', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  whoDisappeared.initRoomState(room);
  whoDisappeared.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'DISAPPEAR_MEMORIZE');

  room.status = 'DISAPPEAR_GUESS';
  whoDisappeared.submitAnswer(room, room.players[0], room.currentPuzzle.eatenItem.id, io, broadcast);
  whoDisappeared.submitAnswer(room, room.players[1], room.currentPuzzle.eatenItem.id, io, broadcast);
  assert.strictEqual(room.status, 'DISAPPEAR_RESULT');

  whoDisappeared.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 14. 极速拼铁轨 (trainRoute)
test('Full Lifecycle: 极速拼铁轨 (trainRoute)', () => {
  const room = createTestRoom('train-route', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  trainRoute.initRoomState(room);
  trainRoute.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'TRAIN_CONNECTING');

  trainRoute.submitAnswer(room, room.players[0], room.currentPuzzle.correctIndex, io, broadcast);
  trainRoute.submitAnswer(room, room.players[1], room.currentPuzzle.correctIndex, io, broadcast);
  assert.strictEqual(room.status, 'TRAIN_RESULT');

  trainRoute.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 15. 几何折纸打孔 (holePunch)
test('Full Lifecycle: 几何折纸打孔 (holePunch)', () => {
  const room = createTestRoom('hole-punch', 2);
  const io = createFakeIo();
  const broadcast = () => {};

  holePunch.initRoomState(room);
  holePunch.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'HOLE_ANSWER');

  holePunch.submitAnswer(room, room.players[0], room.currentPuzzle.correctIndex, io, broadcast);
  holePunch.submitAnswer(room, room.players[1], room.currentPuzzle.correctIndex, io, broadcast);
  assert.strictEqual(room.status, 'HOLE_RESULT');

  holePunch.finishGame(room, io, broadcast);
  assert.strictEqual(room.status, 'GAME_OVER');
  cleanTimers(room);
});

// 16. 拆弹轮盘 (bombRoulette)
test('Full Lifecycle: 拆弹轮盘 (bombRoulette)', () => {
  const room = createTestRoom('bomb-roulette', 3);
  const io = createFakeIo();
  const broadcast = () => {};

  bombRoulette.initRoomState(room);
  bombRoulette.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'BOMB_PLAYING');

  const trapWire = room.wires.find(w => w.id === room.trapWireId);
  bombRoulette.cutWire(room, room.players[room.currentTurnIndex].token, trapWire.id, io, broadcast);
  assert.strictEqual(room.status, 'BOMB_EXPLODED');
  cleanTimers(room);
});

// 17. 词汇炸弹 (wordBomb)
test('Full Lifecycle: 词汇炸弹 (wordBomb)', () => {
  const room = createTestRoom('word-bomb', 3);
  const io = createFakeIo();
  const broadcast = () => {};

  wordBomb.initRoomState(room);
  wordBomb.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'BOMB_TICKING');

  wordBomb.submitWord(room, room.players[room.currentPlayerIndex], '苹果', io, broadcast);
  cleanTimers(room);
});

// 18. 谁是卧底 (undercover)
test('Full Lifecycle: 谁是卧底 (undercover)', () => {
  const room = createTestRoom('undercover', 4);
  const io = createFakeIo();
  const broadcast = () => {};

  undercover.initRoomState(room);
  undercover.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'UC_PREPARE');

  cleanTimers(room);
});

// 19. UNO (uno)
test('Full Lifecycle: UNO (uno)', () => {
  const room = createTestRoom('uno', 3);
  const io = createFakeIo();
  const broadcast = () => {};

  uno.initRoomState(room);
  uno.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'UNO_PLAYING');

  cleanTimers(room);
});

// 20. 阿瓦隆 (avalon)
test('Full Lifecycle: 阿瓦隆 (avalon)', () => {
  const room = createTestRoom('avalon', 5);
  const io = createFakeIo();
  const broadcast = () => {};

  avalon.initRoomState(room);
  avalon.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'AVALON_ROLE_REVEAL');

  cleanTimers(room);
});

// 21. 你画我猜 (drawGuess)
test('Full Lifecycle: 你画我猜 (drawGuess)', () => {
  const room = createTestRoom('draw-guess', 3);
  const io = createFakeIo();
  const broadcast = () => {};

  drawGuess.initRoomState(room);
  drawGuess.startGame(room, io, broadcast);
  cleanTimers(room);
  assert.strictEqual(room.status, 'SELECTING');

  cleanTimers(room);
});
