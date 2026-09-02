const { shuffle } = require('./shuffle');

function generateCubeGrid(round = 1, cubeDiff = 'standard') {
  // 3x3 空间等轴测立方体柱状阵列
  const size = 3;
  const grid = [];
  let totalCubes = 0;

  // 根据房主配置的复杂度 (standard / hard) 和轮次动态计算
  // standard: 基础高度 1~3, 后续 1~4 层 (总数约 7~16)
  // hard: 进阶高度 2~4, 后续 2~5 层 (总数约 14~25，多层遮挡考验空间想象力)
  const isHard = cubeDiff === 'hard';
  const maxHeight = isHard ? Math.min(5, 3 + round) : Math.min(4, 2 + round);

  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      // 中心与后方柱子略高，前方柱子略低，形成层次分明的立体阶梯
      let baseProb = isHard ? 0.90 : 0.85;
      let h = 0;
      if (Math.random() < baseProb) {
        if (isHard && round >= 2 && Math.random() < 0.4) {
          h = Math.floor(Math.random() * (maxHeight - 2 + 1)) + 2;
        } else {
          h = Math.floor(Math.random() * maxHeight) + 1;
        }
      }
      row.push(h);
      totalCubes += h;
    }
    grid.push(row);
  }

  // 兜底保障：保证立方体数量充实且结构错落
  const minCubes = isHard ? 11 : 6;
  if (totalCubes < minCubes) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) grid[r][c] = 0;
    }
    if (isHard) {
      grid[0][0] = 4;
      grid[1][1] = 4;
      grid[2][2] = 3;
      totalCubes = 11;
    } else {
      grid[0][0] = 3;
      grid[1][1] = 2;
      grid[2][2] = 1;
      totalCubes = 6;
    }
  }

  // 生成 4 个相近选项
  const optionsSet = new Set([totalCubes]);
  const offsets = isHard ? [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6] : [-4, -3, -2, -1, 1, 2, 3, 4];
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
  room.cubeDiff = room.cubeDiff || 'standard';
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

  const diff = room.cubeDiff || 'standard';
  const { grid, totalCubes, options } = generateCubeGrid(room.round, diff);
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
  // 校验提交者真实在房
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  // 校验有效整数且在当前题目的选项列表内（严格防刷）
  const answerNum = Number(chosenOption);
  if (!Number.isInteger(answerNum)) return;
  if (room.options && room.options.length > 0 && !room.options.includes(answerNum)) return;

  const timeTaken = Date.now() - (room.guessStartTime || Date.now());
  const isCorrect = (answerNum === room.totalCubes);

  room.playerAnswers[playerToken] = {
    option: answerNum,
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

  // 正确者按用时排序奖励速度分；答错者扣 30 分防乱试
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

  // 答错扣分
  Object.entries(room.playerAnswers)
    .filter(([_, ans]) => !ans.isCorrect)
    .forEach(([token, ans]) => {
      const player = room.players.find(p => p.token === token);
      if (player) {
        player.score = Math.max(0, player.score - 30);
        ans.earnedScore = -30;
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
    // 题面网格放进公共状态：中途加入/断线重连的玩家可补渲染 3D 几何体，
    // 否则只能看到抢答按钮却面对空白画布（审计 R2-33）
    currentGrid: room.currentGrid || [],
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitAnswer,
  endRound,
  generateCubeGrid
};
