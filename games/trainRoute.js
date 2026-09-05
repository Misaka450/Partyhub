// ===================================================
// 游戏：轨道连连通 / 小火车快跑 (Train Route)
// 玩法机制：空间连通与程序化迷宫路径规划！
// 3x3 空间铁轨网络，由自规避随机漫步（Self-Avoiding Walk）算法生成，
// 随机挖空关键节点并确保【全场有且仅有 1 块碎片】可形成唯一通车解！
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

const OPPOSITE_PORT = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
};

const DELTAS = {
  top: { dr: -1, dc: 0 },
  bottom: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 }
};

function getTrackIdByPorts(p1, p2) {
  const track = TRACK_TYPES.find(t => t.ports[p1] && t.ports[p2]);
  return track ? track.id : null;
}

// 验证在给定 grid 下，列车能否自 start 入口到达 goal 出口
function canReachGoal(grid, start, goal) {
  let currR = start.r;
  let currC = start.c;
  let enterFrom = start.from;

  const visited = new Set();
  const maxSteps = 16;
  let steps = 0;

  while (steps++ < maxSteps) {
    if (currR < 0 || currR >= 3 || currC < 0 || currC >= 3) return false;
    const key = `${currR},${currC}`;
    if (visited.has(key)) return false; // 防止死循环
    visited.add(key);

    const trackId = grid[currR][currC];
    if (!trackId || trackId === 'empty' || trackId === 'missing') return false;
    const track = TRACK_TYPES.find(t => t.id === trackId);
    if (!track) return false;

    if (!track.ports[enterFrom]) return false;

    const exitPort = Object.keys(track.ports).find(p => p !== enterFrom);
    if (!exitPort) return false;

    if (currR === goal.r && currC === goal.c && exitPort === goal.to) {
      return true;
    }

    const delta = DELTAS[exitPort];
    currR += delta.dr;
    currC += delta.dc;
    enterFrom = OPPOSITE_PORT[exitPort];
  }

  return false;
}

// 经典兜底蓝图（仅在算法超时兜底使用）
const BACKUP_PRESETS = [
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
  }
];

/**
 * 核心算法：自规避随机漫步迷宫轨道程序化生成系统
 * @param {number} round 当前轮次
 */
function generateTrackPuzzle(round = 1) {
  const minSteps = round === 1 ? 4 : 5;
  const maxSteps = round === 1 ? 5 : 7;

  for (let attempt = 0; attempt < 100; attempt++) {
    const borderStarts = [
      { r: 0, c: 0, from: 'left' },
      { r: 0, c: 0, from: 'top' },
      { r: 0, c: 1, from: 'top' },
      { r: 0, c: 2, from: 'top' },
      { r: 0, c: 2, from: 'right' },
      { r: 1, c: 0, from: 'left' },
      { r: 2, c: 0, from: 'left' },
      { r: 2, c: 0, from: 'bottom' },
      { r: 2, c: 1, from: 'bottom' },
      { r: 2, c: 2, from: 'bottom' },
      { r: 2, c: 2, from: 'right' }
    ];
    const start = borderStarts[Math.floor(Math.random() * borderStarts.length)];

    const path = [{ r: start.r, c: start.c, enterPort: start.from }];
    const visited = new Set([`${start.r},${start.c}`]);

    function dfs(currR, currC, inPort) {
      if (path.length >= minSteps) {
        const possibleExits = [];
        if (currR === 0 && inPort !== 'top') possibleExits.push('top');
        if (currR === 2 && inPort !== 'bottom') possibleExits.push('bottom');
        if (currC === 0 && inPort !== 'left') possibleExits.push('left');
        if (currC === 2 && inPort !== 'right') possibleExits.push('right');

        if (possibleExits.length > 0 && (path.length >= minSteps || Math.random() < 0.35)) {
          const exitPort = possibleExits[Math.floor(Math.random() * possibleExits.length)];
          path[path.length - 1].exitPort = exitPort;
          return { goal: { r: currR, c: currC, to: exitPort }, path };
        }
      }

      if (path.length >= maxSteps) return null;

      const dirs = shuffle(['top', 'bottom', 'left', 'right']);
      for (const dir of dirs) {
        if (dir === inPort) continue;
        const delta = DELTAS[dir];
        const nr = currR + delta.dr;
        const nc = currC + delta.dc;
        if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3 && !visited.has(`${nr},${nc}`)) {
          path[path.length - 1].exitPort = dir;
          visited.add(`${nr},${nc}`);
          const nextInPort = OPPOSITE_PORT[dir];
          path.push({ r: nr, c: nc, enterPort: nextInPort });
          const res = dfs(nr, nc, nextInPort);
          if (res) return res;
          visited.delete(`${nr},${nc}`);
          path.pop();
        }
      }
      return null;
    }

    const walkResult = dfs(start.r, start.c, start.from);
    if (!walkResult) continue;

    const fullPath = walkResult.path;
    const goal = walkResult.goal;

    const grid = [
      ['empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty']
    ];

    for (const step of fullPath) {
      const trackId = getTrackIdByPorts(step.enterPort, step.exitPort);
      if (!trackId) continue;
      grid[step.r][step.c] = trackId;
    }

    if (!canReachGoal(grid, start, goal)) continue;

    // 随机选择一个关键挖空位，确保只有 1 块轨道能连通
    const candidateIndices = shuffle([...Array(fullPath.length).keys()]);
    let validMissingFound = false;
    let missingPos = null;
    let correctTrackId = null;

    for (const idx of candidateIndices) {
      const step = fullPath[idx];
      const origTrackId = grid[step.r][step.c];

      let workingTracks = [];
      for (const t of TRACK_TYPES) {
        grid[step.r][step.c] = t.id;
        if (canReachGoal(grid, start, goal)) {
          workingTracks.push(t.id);
        }
      }
      grid[step.r][step.c] = origTrackId;

      if (workingTracks.length === 1 && workingTracks[0] === origTrackId) {
        validMissingFound = true;
        missingPos = { r: step.r, c: step.c };
        correctTrackId = origTrackId;
        break;
      }
    }

    if (!validMissingFound) continue;

    grid[missingPos.r][missingPos.c] = 'missing';

    const correctTrack = TRACK_TYPES.find(t => t.id === correctTrackId);
    const distractors = shuffle(TRACK_TYPES.filter(t => t.id !== correctTrackId)).slice(0, 3);
    const options = shuffle([correctTrack, ...distractors]).map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon
    }));

    return {
      grid,
      start,
      goal,
      missingPos,
      correctTrackId,
      correctTrackName: correctTrack.name,
      options
    };
  }

  // 极罕见算法超时降级兜底
  const preset = BACKUP_PRESETS[Math.floor(Math.random() * BACKUP_PRESETS.length)];
  const correctTrack = TRACK_TYPES.find(t => t.id === preset.correctTrackId);
  const distractors = shuffle(TRACK_TYPES.filter(t => t.id !== preset.correctTrackId)).slice(0, 3);
  const options = shuffle([correctTrack, ...distractors]).map(t => ({
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
  room.timeLeft = 8;
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
 * 提交轨道选择答案
 */
function submitAnswer(room, player, trackId, io, broadcastRoom) {
  if (room.gameType !== 'train-route' || room.status !== 'TRAIN_CONNECTING') return;
  if (room.playerAnswers[player.token]) return;

  const puzzle = room.currentPuzzle;
  if (!puzzle) return;

  const isPass = trackId === 'pass' || trackId === 'skip';
  const isCorrect = !isPass && trackId === puzzle.correctTrackId;
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
    trackId,
    timeUsed
  };

  io.to(player.id).emit('train_answer_feedback', {
    isCorrect,
    scoreGain,
    correctTrackId: puzzle.correctTrackId,
    correctTrackName: puzzle.correctTrackName
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
  if (room.gameType !== 'train-route') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'TRAIN_RESULT';
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

  io.to(room.id).emit('train_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    correctTrackId: puzzle.correctTrackId,
    correctTrackName: puzzle.correctTrackName,
    missingPos: puzzle.missingPos,
    results
  });

  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'train-route' || (room.status !== 'TRAIN_RESULT' && room.status !== 'TRAIN_ROUND_RESULT')) return;
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
  if (room.gameType !== 'train-route') return;
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

  io.to(room.id).emit('train_game_over', {
    podium,
    scores: ranked.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  io.to(room.id).emit('system_message', `🏆 轨道小火车全赛程结束！恭喜 ${ranked[0]?.name || '胜者'} 夺冠！`);
}

function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  if (room.gameType !== 'train-route') return;
  if (!room.playerAnswers) return;
  // 清理离场玩家的答案记录，防止残留导致全员作答提早误判（审计 M4）
  const currentTokens = new Set(room.players.map(p => p.token));
  for (const token of Object.keys(room.playerAnswers)) {
    if (!currentTokens.has(token)) {
      delete room.playerAnswers[token];
    }
  }
  if (room.status === 'TRAIN_CONNECTING') {
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
    gameType: 'train-route',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    grid: p ? p.grid : null,
    start: p ? p.start : null,
    goal: p ? p.goal : null,
    missingPos: p ? p.missingPos : null,
    options: p ? p.options : [],
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  getPublicState,
  TRACK_TYPES,
  generateTrackPuzzle,
  initRoomState,
  startGame,
  submitAnswer,
  finishGame: endGame,
  onPlayerRemoved
};
