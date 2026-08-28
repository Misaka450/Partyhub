const { shuffle } = require('./shuffle');

function generateCubeGrid(round = 1) {
  // 3x3 空间等轴测立方体柱状阵列
  const size = 3;
  const grid = [];
  let totalCubes = 0;

  // 难度随轮次递增：第1轮高度 1~3 (总数 7~11), 第2轮高度 1~4 (总数 10~15), 第3轮高度 1~5 (总数 13~20)
  const maxHeight = Math.min(4, 2 + round);

  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      // 中心与后方柱子略高，前方柱子略低，形成层次分明的立体阶梯
      let baseProb = 0.85;
      let h = 0;
      if (Math.random() < baseProb) {
        h = Math.floor(Math.random() * maxHeight) + 1;
      }
      row.push(h);
      totalCubes += h;
    }
    grid.push(row);
  }

  // 兜底保障：至少有 6 个方块且不全平
  if (totalCubes < 6) {
    grid[0][0] = 3;
    grid[1][1] = 2;
    grid[2][2] = 1;
    totalCubes = 6;
  }

  // 生成 4 个相近选项
  const optionsSet = new Set([totalCubes]);
  const offsets = [-4, -3, -2, -1, 1, 2, 3, 4];
  // Fisher-Yates 无偏洗牌打乱干扰项顺序
  for (const off of shuffle(offsets)) {
    const opt = totalCubes + off;
    if (opt > 0) optionsSet.add(opt);
    if (optionsSet.size >= 4) break;
  }
  const options = Array.from(optionsSet).sort((a, b) => a - b);

  return { grid, totalCubes, options };
}

function initRoomState(room) {
  room.gameType = 'cube-count';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentGrid = [];
  room.totalCubes = 0;
  room.options = [];
  room.playerAnswers = {};
  room.timeLeft = 6;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'cube-count') return;
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

function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'cube-count') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const { grid, totalCubes, options } = generateCubeGrid(room.round);
  room.currentGrid = grid;
  room.totalCubes = totalCubes;
  room.options = options;
  room.playerAnswers = {};
  room.status = 'CUBE_OBSERVE';
  room.timeLeft = 6; // 6秒观察时间

  broadcastRoom(room);
  io.to(room.id).emit('cube_start_observe', {
    grid: room.currentGrid,
    observeTime: 6,
    round: room.round,
    maxRounds: room.maxRounds
  });

  io.to(room.id).emit('system_message', `🧊 第 ${room.round}/${room.maxRounds} 轮：仔细观察 3D 几何体，数出立方体总数（包含内部支撑方块）！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startGuessPhase(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function startGuessPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'cube-count') return;
  room.status = 'CUBE_GUESSING';
  room.timeLeft = 10;
  room.guessStartTime = Date.now();

  io.to(room.id).emit('cube_question', {
    options: room.options,
    grid: room.currentGrid
  });

  io.to(room.id).emit('system_message', '❓ 抢答开始！请选择该 3D 模型包含的小立方体总数！');
  broadcastRoom(room);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    if (room.gameType !== 'cube-count') {
      clearInterval(room.timer);
      return;
    }
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitAnswer(room, playerToken, chosenOption, io, broadcastRoom) {
  if (room.status !== 'CUBE_GUESSING') return;
  if (room.playerAnswers[playerToken]) return;

  const timeTaken = Date.now() - (room.guessStartTime || Date.now());
  const isCorrect = (parseInt(chosenOption) === room.totalCubes);

  room.playerAnswers[playerToken] = {
    option: chosenOption,
    timeTaken,
    isCorrect
  };

  broadcastRoom(room);

  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allAnswered = activePlayers.length > 0 && activePlayers.every(p => room.playerAnswers[p.token] !== undefined);
  if (allAnswered) {
    clearInterval(room.timer);
    endRound(room, io, broadcastRoom);
  }
}

function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'cube-count') return;
  room.status = 'CUBE_ROUND_RESULT';
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const correctAnswers = Object.entries(room.playerAnswers)
    .filter(([_, ans]) => ans.isCorrect)
    .sort((a, b) => a[1].timeTaken - b[1].timeTaken);

  correctAnswers.forEach(([token, ans], rank) => {
    const player = room.players.find(p => p.token === token);
    if (player) {
      const speedBonus = rank === 0 ? 50 : (rank === 1 ? 30 : 10);
      const points = 100 + speedBonus;
      player.score += points;
      ans.earnedScore = points;
    }
  });

  const answersSummary = room.players.map(p => {
    const ans = room.playerAnswers[p.token];
    return {
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      option: ans ? ans.option : '未作答',
      isCorrect: ans ? ans.isCorrect : false,
      timeTaken: ans ? (ans.timeTaken / 1000).toFixed(2) : '--',
      earnedScore: ans && ans.earnedScore ? ans.earnedScore : 0
    };
  });

  io.to(room.id).emit('cube_round_result', {
    totalCubes: room.totalCubes,
    grid: room.currentGrid,
    answersSummary
  });

  io.to(room.id).emit('system_message', `🎯 正确答案：该几何体共包含【${room.totalCubes}】个立方体！`);
  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'cube-count' || room.status !== 'CUBE_ROUND_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round++;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 4500);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('cube_game_over', {
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  return {
    gameType: 'cube-count',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    options: room.options || [],
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitAnswer
};
