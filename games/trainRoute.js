// ===================================================
// 游戏：轨道连连通 / 小火车快跑 (Train Route)
// 玩法机制：空间连通与路径规划！
// 3x3 的轨道网格中，小火车需要从【起点 S】驶向【终点 G】。
// 轨道中途缺失了 1 块关键轨道片（标为 ❓）。
// 玩家在 4 种轨道拼图（直轨、弯轨、十字轨）中选出正确的那一块！
// ===================================================

const { shuffle } = require('./shuffle');

// 轨道类型定义与端口连通定义 (top, right, bottom, left)
const TRACK_TYPES = [
  { id: 'straight-h', name: '横直轨', icon: '═', ports: { left: true, right: true } },
  { id: 'straight-v', name: '竖直轨', icon: '║', ports: { top: true, bottom: true } },
  { id: 'curve-rd', name: '右下弯', icon: '╔', ports: { right: true, bottom: true } },
  { id: 'curve-ld', name: '左下弯', icon: '╗', ports: { left: true, bottom: true } },
  { id: 'curve-ru', name: '右上弯', icon: '╚', ports: { right: true, top: true } },
  { id: 'curve-lu', name: '左上弯', icon: '╝', ports: { left: true, top: true } }
];

// 预置几组趣味且连贯的 3x3 轨道蓝图与关键缺失位
const ROUTE_PRESETS = [
  // 蓝图 1：S(0,0)从左入 -> (0,0)═ -> (0,1)╗ -> (1,1)║ -> (2,1)╚ -> (2,2)═ -> G(2,2)右出
  // 缺失位 (1,1) 竖直轨
  {
    start: { r: 0, c: 0, from: 'left' },
    goal: { r: 2, c: 2, to: 'right' },
    missingPos: { r: 1, c: 1 },
    correctTrackId: 'straight-v',
    grid: [
      ['straight-h', 'curve-ld', 'empty'],
      ['empty', 'missing', 'empty'],
      ['empty', 'curve-ru', 'straight-h']
    ]
  },
  // 蓝图 2：S(0,0)上入 -> (0,0)║ -> (1,0)╚ -> (1,1)═ -> (1,2)╗ -> (2,2)║ -> G下出
  // 缺失位 (1,0) 右上弯
  {
    start: { r: 0, c: 0, from: 'top' },
    goal: { r: 2, c: 2, to: 'bottom' },
    missingPos: { r: 1, c: 0 },
    correctTrackId: 'curve-ru',
    grid: [
      ['straight-v', 'empty', 'empty'],
      ['missing', 'straight-h', 'curve-ld'],
      ['empty', 'empty', 'straight-v']
    ]
  },
  // 蓝图 3：S(0,0)左入 -> (0,0)╔ -> (1,0)║ -> (2,0)╚ -> (2,1)═ -> (2,2)╝ -> (1,2)║ -> (0,2)╗ -> G右出
  // 缺失位 (2,0) 右上弯
  {
    start: { r: 0, c: 0, from: 'left' },
    goal: { r: 0, c: 2, to: 'right' },
    missingPos: { r: 2, c: 0 },
    correctTrackId: 'curve-ru',
    grid: [
      ['curve-rd', 'empty', 'curve-ld'],
      ['straight-v', 'empty', 'straight-v'],
      ['missing', 'straight-h', 'curve-lu']
    ]
  },
  // 蓝图 4：S(0,1)上入 -> (0,1)║ -> (1,1)╔ -> (1,2)╗ -> (2,2)╚ -> (2,1)═ -> G左出
  // 缺失位 (1,2) 左下弯
  {
    start: { r: 0, c: 1, from: 'top' },
    goal: { r: 2, c: 1, to: 'left' },
    missingPos: { r: 1, c: 2 },
    correctTrackId: 'curve-ld',
    grid: [
      ['empty', 'straight-v', 'empty'],
      ['empty', 'curve-rd', 'missing'],
      ['empty', 'straight-h', 'curve-lu']
    ]
  },
  // 蓝图 5：S(0,0)左入 -> (0,0)═ -> (0,1)═ -> (0,2)╗ -> (1,2)║ -> (2,2)╝ -> G左出
  // 缺失位 (0,1) 横直轨
  {
    start: { r: 0, c: 0, from: 'left' },
    goal: { r: 2, c: 2, to: 'left' },
    missingPos: { r: 0, c: 1 },
    correctTrackId: 'straight-h',
    grid: [
      ['straight-h', 'missing', 'curve-ld'],
      ['empty', 'empty', 'straight-v'],
      ['empty', 'empty', 'curve-lu']
    ]
  }
];

/**
 * 纯函数：生成一道轨道题目
 * @param {number} round 当前轮次
 */
function generateTrackPuzzle(round = 1) {
  const preset = ROUTE_PRESETS[(round - 1 + Math.floor(Math.random() * ROUTE_PRESETS.length)) % ROUTE_PRESETS.length];
  const correctTrack = TRACK_TYPES.find(t => t.id === preset.correctTrackId);

  // 构造 4 个候选项
  const distractors = TRACK_TYPES.filter(t => t.id !== preset.correctTrackId);
  const shuffledDistractors = shuffle(distractors).slice(0, 3);
  const options = shuffle([correctTrack, ...shuffledDistractors]).map(t => ({
    id: t.id,
    name: t.name,
    icon: t.icon
  }));

  return {
    grid: preset.grid,
    start: preset.start,
    goal: preset.goal,
    missingPos: preset.missingPos,
    correctTrackId: preset.correctTrackId,
    correctTrackName: correctTrack.name,
    options
  };
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'train-route';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentPuzzle = null;
  room.playerAnswers = {};
  room.timeLeft = 8;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'train-route') return;
  if (room.players.length < 1) {
    io.to(room.id).emit('system_message', '至少需要 1 名玩家开始游戏！');
    return;
  }

  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.round = 1;
  startRound(room, io, broadcastRoom);
}

/**
 * 开始新的一轮
 */
function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'train-route') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateTrackPuzzle(room.round);
  room.currentPuzzle = puzzle;
  room.playerAnswers = {};
  room.status = 'TRAIN_CONNECTING';
  room.timeLeft = 8; // 8秒抢答
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('train_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    grid: puzzle.grid,
    start: puzzle.start,
    goal: puzzle.goal,
    missingPos: puzzle.missingPos,
    options: puzzle.options,
    timeLimit: 8
  });

  io.to(room.id).emit('system_message', `🚂 第 ${room.round}/${room.maxRounds} 轮：选择正确轨道块，帮助小火车开向终点！`);

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      endRound(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

/**
 * 玩家提交选择
 */
function submitAnswer(room, player, trackId, io, broadcastRoom) {
  if (room.gameType !== 'train-route' || room.status !== 'TRAIN_CONNECTING') return;
  if (!room.currentPuzzle) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = trackId === room.currentPuzzle.correctTrackId;

  let scoreGain = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((8 - timeUsed) * 8));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    trackId,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('train_answer_feedback', {
    isCorrect,
    scoreGain,
    correctTrackId: room.currentPuzzle.correctTrackId
  });

  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allAnswered = activePlayers.every(p => !!room.playerAnswers[p.token]);
  if (allAnswered) {
    clearInterval(room.timer);
    room.timer = null;
    endRound(room, io, broadcastRoom);
  }
}

/**
 * 结算本轮
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'train-route') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'TRAIN_RESULT';

  const roundResults = room.players.map(p => {
    const ans = room.playerAnswers[p.token];
    return {
      playerId: p.id,
      playerToken: p.token,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      answered: !!ans,
      isCorrect: ans ? ans.isCorrect : false,
      timeUsed: ans ? ans.timeUsed : null,
      scoreGain: ans ? ans.scoreGain : 0,
      trackId: ans ? ans.trackId : null
    };
  });

  io.to(room.id).emit('train_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    correctTrackId: room.currentPuzzle ? room.currentPuzzle.correctTrackId : null,
    correctTrackName: room.currentPuzzle ? room.currentPuzzle.correctTrackName : '',
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'train-route' || room.status !== 'TRAIN_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startRound(room, io, broadcastRoom);
    } else {
      finishGame(room, io, broadcastRoom);
    }
  }, 3500);
}

/**
 * 游戏结束
 */
function finishGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  const sorted = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const winner = sorted[0] || null;

  io.to(room.id).emit('train_game_over', {
    podium: sorted.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

/**
 * 离线保护
 */
function onPlayerRemoved(room, player, io, broadcastRoom) {
  if (room.gameType !== 'train-route') return;
  if (room.status === 'TRAIN_CONNECTING') {
    const activePlayers = room.players.filter(p => !p.offlineTimer);
    if (activePlayers.length === 0) {
      clearInterval(room.timer);
      clearTimeout(room.roundTimeout);
      initRoomState(room);
      return;
    }
    const allAnswered = activePlayers.every(p => !!room.playerAnswers[p.token]);
    if (allAnswered) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    }
  }
}


function getPublicState(room) {
  return {};
}

module.exports = {
  getPublicState,
  generateTrackPuzzle,
  initRoomState,
  startGame,
  startRound,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
