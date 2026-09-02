// ===================================================
// 游戏：西蒙说 / 节拍记忆 (Simon Memory)
// 玩法机制：经典电子脑力游戏 Simon！
// 系统首先依次闪烁 4 色方盘中的色块序列（第1轮3步，第2轮4步，第3轮5步...）。
// 玩家在手机/键盘上完整复现该序列，按错立即失败，全部正确且最快者得最高分！
// ===================================================

const SIMON_COLORS = ['red', 'green', 'blue', 'yellow'];

/**
 * 纯函数：生成指定步数的随机西蒙序列
 * @param {number} round 当前轮次
 */
function generateSequence(round = 1) {
  const steps = 2 + round; // 第1轮3步，第2轮4步，第3轮5步
  const sequence = [];
  for (let i = 0; i < steps; i++) {
    const randomColor = SIMON_COLORS[Math.floor(Math.random() * SIMON_COLORS.length)];
    sequence.push(randomColor);
  }
  return sequence;
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'simon-memory';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentSequence = [];
  room.playerInputs = {}; // token -> { inputs: [], isFailed: false, isCompleted: false, timeUsed: 0, scoreGain: 0 }
  room.timeLeft = 10;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'simon-memory') return;
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
 * 开始新的一轮（先播放序列演示）
 */
function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'simon-memory') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const sequence = generateSequence(room.round);
  room.currentSequence = sequence;
  room.playerInputs = {};
  room.status = 'SIMON_DEMO';

  // 逆向西蒙模式：第 2 轮起 60% 概率触发倒序输入！
  room.isReverse = (room.round >= 2 && Math.random() < 0.65);

  // 计算演示所需时间：每个动作 0.6 秒 + 0.5秒缓冲
  const demoDuration = Math.ceil(sequence.length * 0.7 + 0.8);
  room.timeLeft = demoDuration;

  broadcastRoom(room);

  io.to(room.id).emit('simon_start_demo', {
    round: room.round,
    maxRounds: room.maxRounds,
    sequence,
    isReverse: room.isReverse,
    demoDuration
  });

  const reverseAlert = room.isReverse ? ' 🔄【高难度：稍后需完全倒序输入！】' : '';
  io.to(room.id).emit('system_message', `🎶 第 ${room.round}/${room.maxRounds} 轮：仔细看并记住闪烁序列（共 ${sequence.length} 步）！${reverseAlert}`);

  // 演示结束后自动开启输入阶段
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    startInputPhase(room, io, broadcastRoom);
  }, demoDuration * 1000);
}

/**
 * 演示结束，开启玩家输入阶段
 */
function startInputPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'simon-memory') return;
  room.status = 'SIMON_INPUT';
  const inputTimeLimit = Math.max(6, room.currentSequence.length * 2);
  room.timeLeft = inputTimeLimit;
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('simon_start_input', {
    round: room.round,
    maxRounds: room.maxRounds,
    totalSteps: room.currentSequence.length,
    isReverse: room.isReverse,
    timeLimit: inputTimeLimit
  });

  const modePrompt = room.isReverse ? '🔄【注意：必须按倒序从后往前点击！】' : '🕹️ 开始！请按照刚刚的顺序复现序列！';
  io.to(room.id).emit('system_message', modePrompt);

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
 * 玩家按下一个颜色按钮（按步实时校验）
 */
function submitStep(room, player, color, io, broadcastRoom) {
  if (room.gameType !== 'simon-memory' || room.status !== 'SIMON_INPUT') return;
  if (!room.currentSequence || room.currentSequence.length === 0) return;

  if (!room.playerInputs[player.token]) {
    room.playerInputs[player.token] = {
      inputs: [],
      isFailed: false,
      isCompleted: false,
      timeUsed: 0,
      scoreGain: 0
    };
  }

  const pState = room.playerInputs[player.token];
  if (pState.isFailed || pState.isCompleted) return;

  const currentStepIdx = pState.inputs.length;
  const expectedSequence = room.isReverse ? [...room.currentSequence].reverse() : room.currentSequence;
  const expectedColor = expectedSequence[currentStepIdx];

  pState.inputs.push(color);

  if (color !== expectedColor) {
    // 按错了，立即淘汰并扣 25 分
    pState.isFailed = true;
    pState.scoreGain = -25;
    player.score = Math.max(0, (player.score || 0) - 25);
    io.to(player.id).emit('simon_step_feedback', {
      stepIndex: currentStepIdx,
      isCorrect: false,
      isCompleted: false,
      isFailed: true,
      isReverse: room.isReverse,
      expectedColor
    });
  } else {
    // 按对了
    const isCompleted = pState.inputs.length === expectedSequence.length;
    if (isCompleted) {
      pState.isCompleted = true;
      const timeUsed = (Date.now() - room.roundStartTime) / 1000;
      pState.timeUsed = parseFloat(timeUsed.toFixed(2));
      const speedBonus = Math.max(0, Math.round((room.timeLeft) * 8));
      const reverseBonus = room.isReverse ? 50 : 0;
      const scoreGain = 100 + speedBonus + reverseBonus;
      pState.scoreGain = scoreGain;
      player.score = (player.score || 0) + scoreGain;
    }

    io.to(player.id).emit('simon_step_feedback', {
      stepIndex: currentStepIdx,
      isCorrect: true,
      isCompleted,
      isFailed: false,
      isReverse: room.isReverse,
      scoreGain: pState.scoreGain
    });
  }

  // 检查是否所有活跃玩家都已完成或失败
  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allFinished = activePlayers.every(p => {
    const s = room.playerInputs[p.token];
    return s && (s.isCompleted || s.isFailed);
  });

  if (allFinished) {
    clearInterval(room.timer);
    room.timer = null;
    endRound(room, io, broadcastRoom);
  }
}

/**
 * 结算本轮
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'simon-memory') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);

  room.status = 'SIMON_RESULT';

  const roundResults = room.players.map(p => {
    const s = room.playerInputs[p.token];
    return {
      playerId: p.id,
      playerToken: p.token,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      isCompleted: s ? s.isCompleted : false,
      isFailed: s ? s.isFailed : true,
      completedSteps: s ? s.inputs.length : 0,
      timeUsed: s ? s.timeUsed : null,
      scoreGain: s ? s.scoreGain : 0
    };
  });

  io.to(room.id).emit('simon_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    sequence: room.currentSequence,
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'simon-memory' || room.status !== 'SIMON_RESULT') return;
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

  io.to(room.id).emit('simon_game_over', {
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
  if (room.gameType !== 'simon-memory') return;
  if (room.status === 'SIMON_INPUT') {
    const activePlayers = room.players.filter(p => !p.offlineTimer);
    if (activePlayers.length === 0) {
      clearInterval(room.timer);
      clearTimeout(room.roundTimeout);
      initRoomState(room);
      return;
    }
    const allFinished = activePlayers.every(p => {
      const s = room.playerInputs[p.token];
      return s && (s.isCompleted || s.isFailed);
    });
    if (allFinished) {
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
  generateSequence,
  initRoomState,
  startGame,
  startRound,
  startInputPhase,
  submitStep,
  endRound,
  finishGame,
  onPlayerRemoved
};
