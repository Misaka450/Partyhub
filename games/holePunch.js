// ===================================================
// 游戏：折纸打孔展开图 (Hole Punch Folding)
// 玩法机制：高阶空间折叠与几何镜像变换系统！
// 一张正方形纸张（4x4 网格），经历单向对折、双向直角对折、45° 对角线对折或多重折叠，
// 在折叠后有效区域打孔，由逆序矩阵反射变换精确计算展开后的孔洞拓扑网格！
// ===================================================

const { shuffle } = require('./shuffle');

// 基础单步空间折叠变换定义
const FOLD_OPERATIONS = {
  FOLD_RIGHT: {
    desc: '从左向右对折',
    region: (r, c) => c >= 2,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        res.push({ r: p.r, c: 3 - p.c });
      }
      return res;
    }
  },
  FOLD_LEFT: {
    desc: '从右向左对折',
    region: (r, c) => c <= 1,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        res.push({ r: p.r, c: 3 - p.c });
      }
      return res;
    }
  },
  FOLD_DOWN: {
    desc: '从上向下对折',
    region: (r, c) => r >= 2,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        res.push({ r: 3 - p.r, c: p.c });
      }
      return res;
    }
  },
  FOLD_UP: {
    desc: '从下向上对折',
    region: (r, c) => r <= 1,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        res.push({ r: 3 - p.r, c: p.c });
      }
      return res;
    }
  },
  DIAG_MAIN_UPPER: {
    desc: '沿主对角线对折 (左下折入右上)',
    region: (r, c) => c >= r,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        if (p.r !== p.c) res.push({ r: p.c, c: p.r });
      }
      return res;
    }
  },
  DIAG_ANTI_LOWER: {
    desc: '沿反对角线对折 (左上折入右下)',
    region: (r, c) => (r + c) >= 3,
    unfold: (pts) => {
      const res = [];
      for (const p of pts) {
        res.push(p);
        const mirrorR = 3 - p.c;
        const mirrorC = 3 - p.r;
        if (mirrorR !== p.r || mirrorC !== p.c) {
          res.push({ r: mirrorR, c: mirrorC });
        }
      }
      return res;
    }
  }
};

function gridToString(grid) {
  return grid.map(row => row.join('')).join('\n');
}

function cloneGrid(g) {
  return g.map(row => [...row]);
}

function rotate90(grid) {
  const res = [
    [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]
  ];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      res[c][3 - r] = grid[r][c];
    }
  }
  return res;
}

/**
 * 纯函数：程序化生成一道折纸打孔题目与选项
 * @param {number} round 当前轮次
 */
function generateFoldingPuzzle(round = 1) {
  const FOLD_RECIPES = [
    // 轮次 1：单次直对折
    { steps: ['FOLD_RIGHT'], name: '1️⃣ 从左向右对折一次' },
    { steps: ['FOLD_DOWN'], name: '1️⃣ 从上向下对折一次' },
    { steps: ['FOLD_LEFT'], name: '1️⃣ 从右向左对折一次' },
    { steps: ['FOLD_UP'], name: '1️⃣ 从下向上对折一次' },
    // 轮次 2：双向直角对折
    { steps: ['FOLD_RIGHT', 'FOLD_DOWN'], name: '1️⃣ 从左向右对折 ➔ 2️⃣ 从上向下对折' },
    { steps: ['FOLD_DOWN', 'FOLD_RIGHT'], name: '1️⃣ 从上向下对折 ➔ 2️⃣ 从左向右对折' },
    { steps: ['FOLD_LEFT', 'FOLD_DOWN'], name: '1️⃣ 从右向左对折 ➔ 2️⃣ 从上向下对折' },
    { steps: ['FOLD_RIGHT', 'FOLD_UP'], name: '1️⃣ 从左向右对折 ➔ 2️⃣ 从下向上对折' },
    // 轮次 3 及更高：对角线折叠与复合折叠
    { steps: ['DIAG_MAIN_UPPER'], name: '1️⃣ 沿主对角线对折 (左下折入右上)' },
    { steps: ['DIAG_ANTI_LOWER'], name: '1️⃣ 沿反对角线对折 (左上折入右下)' },
    { steps: ['FOLD_RIGHT', 'DIAG_ANTI_LOWER'], name: '1️⃣ 从左向右对折 ➔ 2️⃣ 沿角对折' }
  ];

  let recipe;
  if (round === 1) {
    recipe = FOLD_RECIPES[Math.floor(Math.random() * 4)];
  } else if (round === 2) {
    recipe = FOLD_RECIPES[4 + Math.floor(Math.random() * 4)];
  } else {
    recipe = FOLD_RECIPES[Math.floor(Math.random() * FOLD_RECIPES.length)];
  }

  // 寻找折叠完成后的有效重叠区域
  const validCells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let ok = true;
      for (const stepKey of recipe.steps) {
        if (!FOLD_OPERATIONS[stepKey].region(r, c)) {
          ok = false;
          break;
        }
      }
      if (ok) validCells.push({ r, c });
    }
  }

  const punchPos = validCells[Math.floor(Math.random() * validCells.length)] || { r: 2, c: 2 };

  // 展开计算（反向逆序 unfold）
  let currentPoints = [{ r: punchPos.r, c: punchPos.c }];
  for (let i = recipe.steps.length - 1; i >= 0; i--) {
    const op = FOLD_OPERATIONS[recipe.steps[i]];
    currentPoints = op.unfold(currentPoints);
  }

  // 生成正解网格
  const correctGrid = [
    [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]
  ];
  for (const p of currentPoints) {
    if (p.r >= 0 && p.r < 4 && p.c >= 0 && p.c < 4) {
      correctGrid[p.r][p.c] = 1;
    }
  }

  // 构造智能高迷惑性干扰项
  const distractors = [];
  const correctStr = gridToString(correctGrid);
  const usedStrings = new Set([correctStr]);

  // 干扰项 1：旋转 90 度
  const rot1 = rotate90(correctGrid);
  const rot1Str = gridToString(rot1);
  if (!usedStrings.has(rot1Str)) {
    distractors.push(rot1);
    usedStrings.add(rot1Str);
  }

  // 干扰项 2：对角线或行列互换（误判折叠轴）
  const transposed = [
    [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]
  ];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      transposed[r][c] = correctGrid[c][r];
    }
  }
  const transStr = gridToString(transposed);
  if (!usedStrings.has(transStr)) {
    distractors.push(transposed);
    usedStrings.add(transStr);
  }

  // 干扰项 3：遗漏部分展开镜像（少孔）
  const missingHoles = cloneGrid(correctGrid);
  missingHoles[punchPos.r][punchPos.c] = 1;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (missingHoles[r][c] && Math.random() < 0.5) {
        missingHoles[r][c] = 0;
      }
    }
  }
  missingHoles[punchPos.r][punchPos.c] = 1;
  const missStr = gridToString(missingHoles);
  if (!usedStrings.has(missStr)) {
    distractors.push(missingHoles);
    usedStrings.add(missStr);
  }

  // 兜底补齐 3 个唯一干扰项
  while (distractors.length < 3) {
    const fake = cloneGrid(correctGrid);
    const randR = Math.floor(Math.random() * 4);
    const randC = Math.floor(Math.random() * 4);
    fake[randR][randC] = fake[randR][randC] ? 0 : 1;
    const fakeStr = gridToString(fake);
    if (!usedStrings.has(fakeStr)) {
      distractors.push(fake);
      usedStrings.add(fakeStr);
    }
  }

  const candidates = [
    { id: 'correct', grid: correctGrid, isCorrect: true },
    ...distractors.slice(0, 3).map((g, idx) => ({ id: `dist_${idx}`, grid: g, isCorrect: false }))
  ];

  const shuffledOptions = shuffle(candidates).map((opt, idx) => ({
    optionId: `opt_${idx}`,
    grid: opt.grid,
    isCorrect: opt.isCorrect
  }));

  const correctOption = shuffledOptions.find(o => o.isCorrect);

  return {
    foldType: recipe.steps.join('_'),
    foldDescription: recipe.name,
    punchPos,
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
  room.timeLeft = 8;
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('hole_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    foldType: puzzle.foldType,
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
 * 提交孔洞选择答案
 */
function submitAnswer(room, player, optionId, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch' || room.status !== 'HOLE_ANSWER') return;
  if (room.playerAnswers[player.token]) return;

  const puzzle = room.currentPuzzle;
  if (!puzzle) return;

  const isPass = optionId === 'pass' || optionId === 'skip';
  const isCorrect = !isPass && optionId === puzzle.correctOptionId;
  const timeUsed = Math.max(0, (Date.now() - room.roundStartTime) / 1000);
  let scoreGain = 0;

  if (isCorrect) {
    // 时效递减分：前 3 秒满分 100 分，之后每秒衰减 6 分，保底 20 分
    scoreGain = Math.max(20, Math.round(100 - Math.max(0, timeUsed - 3) * 6));
    player.score += scoreGain;
  } else if (!isPass) {
    // 防蒙猜惩罚：答错扣 50 分，最低扣至 0
    scoreGain = -50;
    player.score = Math.max(0, player.score - 50);
  } else {
    // 主动放弃不扣分
    scoreGain = 0;
  }

  room.playerAnswers[player.token] = {
    playerId: player.id,
    playerName: player.name,
    isCorrect,
    scoreGain,
    optionId,
    timeUsed
  };

  io.to(player.id).emit('hole_answer_feedback', {
    isCorrect,
    scoreGain,
    correctOptionId: puzzle.correctOptionId
  });

  const activePlayers = room.players.filter(p => p.alive !== false);
  const answerCount = Object.keys(room.playerAnswers).length;
  if (answerCount >= activePlayers.length) {
    clearInterval(room.timer);
    room.timer = null;
    endRound(room, io, broadcastRoom);
  }
}

/**
 * 结束本轮并展示结果
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'HOLE_RESULT';
  const puzzle = room.currentPuzzle;

  const results = room.players.map(p => {
    const ans = room.playerAnswers[p.token];
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isCorrect: !!ans?.isCorrect,
      scoreGain: ans?.scoreGain || 0,
      totalScore: p.score
    };
  }).sort((a, b) => b.scoreGain - a.scoreGain);

  broadcastRoom(room);

  io.to(room.id).emit('hole_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    correctOptionId: puzzle.correctOptionId,
    results
  });

  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'hole-punch' || (room.status !== 'HOLE_RESULT' && room.status !== 'HOLE_ROUND_RESULT')) return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 3500);
}

/**
 * 游戏终局
 */
function endGame(room, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'GAME_OVER';
  const ranked = [...room.players].sort((a, b) => b.score - a.score);

  broadcastRoom(room);

  const podium = ranked.slice(0, 3).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score
  }));

  io.to(room.id).emit('hole_game_over', {
    podium,
    scores: ranked.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  io.to(room.id).emit('system_message', `🏆 折纸打孔全赛程结束！恭喜 ${ranked[0]?.name || '胜者'} 夺得空间几何大师！`);
}

function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  if (room.gameType !== 'hole-punch') return;
  if (!room.playerAnswers) return;
  // 清理离场玩家的答案记录，防止残留导致全员作答提早误判（审计 M4）
  const currentTokens = new Set(room.players.map(p => p.token));
  for (const token of Object.keys(room.playerAnswers)) {
    if (!currentTokens.has(token)) {
      delete room.playerAnswers[token];
    }
  }
  if (room.status === 'HOLE_ANSWER') {
    const activePlayers = room.players.filter(p => !p.offlineTimer && p.alive !== false);
    if (activePlayers.length === 0) {
      clearInterval(room.timer);
      clearTimeout(room.roundTimeout);
      initRoomState(room);
      return;
    }
    const answerCount = Object.keys(room.playerAnswers).length;
    if (answerCount >= activePlayers.length) {
      clearInterval(room.timer);
      room.timer = null;
      endRound(room, io, broadcastRoom);
    }
  }
}

function getPublicState(room) {
  const p = room.currentPuzzle;
  return {
    gameType: 'hole-punch',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    foldType: p ? p.foldType : null,
    foldDescription: p ? p.foldDescription : null,
    punchPos: p ? p.punchPos : null,
    options: p ? p.options : [],
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  getPublicState,
  generateFoldingPuzzle,
  initRoomState,
  startGame,
  submitAnswer,
  finishGame: endGame,
  onPlayerRemoved
};
