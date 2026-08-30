// ===================================================
// 游戏：折纸打孔展开图 (Hole Punch Folding)
// 玩法机制：空间折叠与镜像还原！
// 一张正方形纸张（4x4 网格），经历折叠（如向右折、向下折）后在特定位置打孔。
// 问：完全展开后，纸张上的所有孔洞位置应该呈什么图案？
// ===================================================

const { shuffle } = require('./shuffle');

/**
 * 纯函数：生成一道折纸打孔题目与选项
 * @param {number} round 当前轮次
 */
function generateFoldingPuzzle(round = 1) {
  // 折叠步骤描述
  // 步骤 1：折叠方式 1（'RIGHT': 从左向右折; 'DOWN': 从上向下折）
  // 步骤 2：折叠方式 2
  const foldTypes = ['RIGHT_THEN_DOWN', 'DOWN_THEN_RIGHT', 'FOLD_RIGHT', 'FOLD_DOWN'];
  const foldType = round === 1 
    ? (Math.random() < 0.5 ? 'FOLD_RIGHT' : 'FOLD_DOWN') 
    : foldTypes[Math.floor(Math.random() * foldTypes.length)];

  let foldDescription = '';
  // 4x4 网格矩阵初始化（0 代表无孔，1 代表有孔）
  const correctGrid = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ];

  // 打孔点（在最终折叠后的有效象限中打 1 个孔）
  let holeR = 0;
  let holeC = 0;

  if (foldType === 'FOLD_RIGHT') {
    foldDescription = '1️⃣ 从左向右对折一次';
    holeR = Math.floor(Math.random() * 4);
    holeC = 2 + Math.floor(Math.random() * 2); // 右半边 [2..3]
    // 展开：水平镜像 (3 - holeC)
    correctGrid[holeR][holeC] = 1;
    correctGrid[holeR][3 - holeC] = 1;
  } else if (foldType === 'FOLD_DOWN') {
    foldDescription = '1️⃣ 从上向下对折一次';
    holeR = 2 + Math.floor(Math.random() * 2); // 下半边 [2..3]
    holeC = Math.floor(Math.random() * 4);
    // 展开：垂直镜像 (3 - holeR)
    correctGrid[holeR][holeC] = 1;
    correctGrid[3 - holeR][holeC] = 1;
  } else if (foldType === 'RIGHT_THEN_DOWN') {
    foldDescription = '1️⃣ 从左向右对折 ➔ 2️⃣ 从上向下对折';
    holeR = 2 + Math.floor(Math.random() * 2); // 下半边
    holeC = 2 + Math.floor(Math.random() * 2); // 右半边
    // 4 点全对称展开
    correctGrid[holeR][holeC] = 1;
    correctGrid[holeR][3 - holeC] = 1;
    correctGrid[3 - holeR][holeC] = 1;
    correctGrid[3 - holeR][3 - holeC] = 1;
  } else {
    // DOWN_THEN_RIGHT
    foldDescription = '1️⃣ 从上向下对折 ➔ 2️⃣ 从左向右对折';
    holeR = 2 + Math.floor(Math.random() * 2);
    holeC = 2 + Math.floor(Math.random() * 2);
    correctGrid[holeR][holeC] = 1;
    correctGrid[holeR][3 - holeC] = 1;
    correctGrid[3 - holeR][holeC] = 1;
    correctGrid[3 - holeR][3 - holeC] = 1;
  }

  // 辅助函数：克隆网格
  const cloneGrid = (g) => g.map(row => [...row]);

  // 生成 3 个干扰网格
  // 干扰项 1：点位平移
  const dist1 = cloneGrid(correctGrid);
  dist1[0][0] = dist1[0][0] ? 0 : 1;
  dist1[3][3] = dist1[3][3] ? 0 : 1;

  // 干扰项 2：中心对称错误
  const dist2 = [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0]
  ];

  // 干扰项 3：缺少对称镜像点
  const dist3 = cloneGrid(correctGrid);
  dist3[holeR][holeC] = 1;
  if (foldType.includes('RIGHT')) dist3[holeR][3 - holeC] = 0;

  // 构造候选项
  const candidates = [
    { id: 'correct', grid: correctGrid },
    { id: 'dist_1', grid: dist1 },
    { id: 'dist_2', grid: dist2 },
    { id: 'dist_3', grid: dist3 }
  ];

  const shuffledOptions = shuffle(candidates).map((opt, idx) => ({
    optionId: `opt_${idx}`,
    grid: opt.grid,
    isCorrect: opt.id === 'correct'
  }));

  const correctOption = shuffledOptions.find(o => o.isCorrect);

  return {
    foldType,
    foldDescription,
    punchPos: { r: holeR, c: holeC },
    correctOptionId: correctOption.optionId,
    options: shuffledOptions.map(o => ({ optionId: o.optionId, grid: o.grid }))
  };
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'hole-punch';
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
  if (room.gameType !== 'hole-punch') return;
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
  if (room.gameType !== 'hole-punch') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateFoldingPuzzle(room.round);
  room.currentPuzzle = puzzle;
  room.playerAnswers = {};
  room.status = 'HOLE_ANSWER';
  room.timeLeft = 8; // 8秒抢答
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('hole_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    foldDescription: puzzle.foldDescription,
    punchPos: puzzle.punchPos,
    options: puzzle.options,
    timeLimit: 8
  });

  io.to(room.id).emit('system_message', `📄 第 ${room.round}/${room.maxRounds} 轮：${puzzle.foldDescription}，选出展开后的正确孔洞图案！`);

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
function submitAnswer(room, player, optionId, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch' || room.status !== 'HOLE_ANSWER') return;
  if (!room.currentPuzzle) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = optionId === room.currentPuzzle.correctOptionId;

  let scoreGain = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((8 - timeUsed) * 8));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    optionId,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('hole_answer_feedback', {
    isCorrect,
    scoreGain,
    correctOptionId: room.currentPuzzle.correctOptionId
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
  if (room.gameType !== 'hole-punch') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'HOLE_RESULT';

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
      optionId: ans ? ans.optionId : null
    };
  });

  io.to(room.id).emit('hole_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    correctOptionId: room.currentPuzzle ? room.currentPuzzle.correctOptionId : null,
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
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

  io.to(room.id).emit('game_over', {
    winner: winner ? { name: winner.name, avatar: winner.avatar, score: winner.score } : null,
    leaderboard: sorted.map(p => ({ name: p.name, avatar: p.avatar, score: p.score }))
  });

  broadcastRoom(room);
}

/**
 * 离线保护
 */
function onPlayerRemoved(room, player, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch') return;
  if (room.status === 'HOLE_ANSWER') {
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

module.exports = {
  generateFoldingPuzzle,
  initRoomState,
  startGame,
  startRound,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
