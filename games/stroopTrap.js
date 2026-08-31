// ===================================================
// 游戏：颜色与文字大陷阱 (Stroop Color Trap)
// 玩法机制：利用经典的斯特鲁普效应（Stroop Effect）。
// 屏幕上会出现带有颜色的文字（例如：用红颜色写的“蓝”字）。
// 题目要求玩家按【文字字面意思】或【文字显示颜色】进行快速选择。
// ===================================================

const { shuffle } = require('./shuffle');

// 基础颜色调色盘（名称、文字、CSS色值）
const COLOR_PALETTE = [
  { id: 'red', name: '红', hex: '#EF4444' },
  { id: 'green', name: '绿', hex: '#10B981' },
  { id: 'blue', name: '蓝', hex: '#3B82F6' },
  { id: 'yellow', name: '黄', hex: '#F59E0B' },
  { id: 'purple', name: '紫', hex: '#8B5CF6' },
  { id: 'orange', name: '橙', hex: '#F97316' }
];

/**
 * 纯函数：生成一轮题目数据（便于单元测试与逻辑复用）
 * @param {number} round 当前轮次
 */
function generateQuestion(round = 1) {
  const shuffled = shuffle(COLOR_PALETTE);
  const textItem = shuffled[0]; // 文字内容
  const colorItem = shuffled[1]; // 文字颜色（确保文字与颜色产生认知冲突）

  // 轮次越高，文字颜色陷阱越容易随机切换指令
  // 指令：'COLOR' (看颜色) 或 'MEANING' (看字义)
  const isColorTarget = Math.random() < 0.5;
  const targetMode = isColorTarget ? 'COLOR' : 'MEANING';
  const targetAnswer = isColorTarget ? colorItem : textItem;

  // 生成 4 个候选项供玩家选择
  const candidatePool = [targetAnswer];
  const remaining = COLOR_PALETTE.filter(c => c.id !== targetAnswer.id);
  const randomOthers = shuffle(remaining).slice(0, 3);
  const options = shuffle([...candidatePool, ...randomOthers]).map(c => ({
    id: c.id,
    name: c.name,
    hex: c.hex
  }));

  return {
    displayText: textItem.name,
    displayColorHex: colorItem.hex,
    targetMode, // 'COLOR' -> 按文字颜色选 | 'MEANING' -> 按文字内容选
    targetId: targetAnswer.id,
    targetName: targetAnswer.name,
    options
  };
}

/**
 * 初始化房间内该游戏的状态数据
 */
function initRoomState(room) {
  room.gameType = 'stroop-trap';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentQuestion = null;
  room.playerAnswers = {}; // token -> { answerId, isCorrect, timeUsed, score }
  room.timeLeft = 5;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'stroop-trap') return;
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
  if (room.gameType !== 'stroop-trap') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const question = generateQuestion(room.round);
  room.currentQuestion = question;
  room.playerAnswers = {};
  room.status = 'STROOP_ANSWER';
  room.timeLeft = 5; // 每轮 5 秒限时抢答
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('stroop_new_question', {
    round: room.round,
    maxRounds: room.maxRounds,
    displayText: question.displayText,
    displayColorHex: question.displayColorHex,
    targetMode: question.targetMode,
    options: question.options,
    timeLimit: 5
  });

  const promptMode = question.targetMode === 'COLOR' ? '【文字颜色】' : '【文字内容】';
  io.to(room.id).emit('system_message', `⚡ 第 ${room.round}/${room.maxRounds} 轮：请根据 ${promptMode} 快速选出正确颜色！`);

  // 倒计时定时器
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
function submitAnswer(room, player, answerId, io, broadcastRoom) {
  if (room.gameType !== 'stroop-trap' || room.status !== 'STROOP_ANSWER') return;
  if (!room.currentQuestion) return;
  if (room.playerAnswers[player.token]) return; // 已作答不能重复作答

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = answerId === room.currentQuestion.targetId;

  // 计分规则：答对获得 100 基础分 + 速度加分（最高50分）；答错不给分
  let scoreGain = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((5 - timeUsed) * 10));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    answerId,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  // 通知本人答题结果
  io.to(player.id).emit('stroop_answer_feedback', {
    isCorrect,
    scoreGain,
    correctAnswerId: room.currentQuestion.targetId
  });

  // 如果所有活跃玩家都已作答，直接提前结束本轮
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
  if (room.gameType !== 'stroop-trap') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'STROOP_RESULT';

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
      scoreGain: ans ? ans.scoreGain : 0
    };
  });

  io.to(room.id).emit('stroop_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    correctTargetId: room.currentQuestion ? room.currentQuestion.targetId : null,
    correctTargetName: room.currentQuestion ? room.currentQuestion.targetName : null,
    results: roundResults
  });

  broadcastRoom(room);

  // 3秒后进入下一轮或结束游戏
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'stroop-trap' || room.status !== 'STROOP_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startRound(room, io, broadcastRoom);
    } else {
      finishGame(room, io, broadcastRoom);
    }
  }, 3500);
}

/**
 * 游戏全部轮次结束
 */
function finishGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  const sorted = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const winner = sorted[0] || null;

  io.to(room.id).emit('stroop_game_over', {
    podium: sorted.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

/**
 * 玩家离场事件钩子（断线保护）
 */
function onPlayerRemoved(room, player, io, broadcastRoom) {
  if (room.gameType !== 'stroop-trap') return;
  if (room.status === 'STROOP_ANSWER') {
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
  generateQuestion,
  initRoomState,
  startGame,
  startRound,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
