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
 * @param {number} colorBias 指令偏向：取值 0~1，越大越倾向“看文字颜色”（越难），默认 0.5 随机
 */
function generateQuestion(round = 1, colorBias = 0.5) {
  const shuffled = shuffle(COLOR_PALETTE);
  const textItem = shuffled[0]; // 文字内容
  const colorItem = shuffled[1]; // 文字颜色（确保文字与颜色产生认知冲突）

  // 轮次越高，文字颜色陷阱越容易随机切换指令
  // 指令：'COLOR' (看颜色) 或 'MEANING' (看字义)
  const isColorTarget = Math.random() < colorBias;
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
  room.stroopDiff = room.stroopDiff || 'normal';
  room.playerQuestions = {}; // token -> current question
  room.playerStats = {}; // token -> { combo, maxCombo, correctCount, wrongCount, totalScoreGain }
  room.timeLeft = 15;
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

  room.playerQuestions = {};
  room.playerStats = {};
  room.status = 'STROOP_ANSWER';

  // 难度档位配置（easy / normal / hard）：
  //  - easy   20 秒/回合并偏向“看字义”（低冲突）
  //  - normal 15 秒/回合随机指令（默认）
  //  - hard   10 秒/回合并偏向“看颜色”（高冲突，斯楚鲁普效应最强）
  const diff = room.stroopDiff || 'normal';
  const STROOP_TIME = { easy: 20, normal: 15, hard: 10 };
  const STROOP_COLOR_BIAS = { easy: 0.35, normal: 0.5, hard: 0.8 };
  room.stroopTimeLimit = STROOP_TIME[diff] ?? 15;
  room.stroopColorBias = STROOP_COLOR_BIAS[diff] ?? 0.5;
  room.timeLeft = room.stroopTimeLimit;
  room.roundStartTime = Date.now();

  room.players.forEach(p => {
    const q = generateQuestion(room.round, room.stroopColorBias);
    room.playerQuestions[p.token] = q;
    room.playerStats[p.token] = {
      combo: 0,
      maxCombo: 0,
      correctCount: 0,
      wrongCount: 0,
      totalScoreGain: 0
    };
    io.to(p.id).emit('stroop_new_question', {
      round: room.round,
      maxRounds: room.maxRounds,
      displayText: q.displayText,
      displayColorHex: q.displayColorHex,
      targetMode: q.targetMode,
      options: q.options,
      combo: 0,
      timeLimit: room.stroopTimeLimit
    });
  });

  broadcastRoom(room);
  io.to(room.id).emit('system_message', `🔥 第 ${room.round}/${room.maxRounds} 轮：【${room.stroopTimeLimit}秒连击狂飙】启动！连续答对连击翻倍，答错清零！`);

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
 * 玩家提交选择：即时结算连击并立刻派发下一道题目
 */
function submitAnswer(room, player, answerId, io, broadcastRoom) {
  if (room.gameType !== 'stroop-trap' || room.status !== 'STROOP_ANSWER') return;
  const currentQ = room.playerQuestions[player.token];
  if (!currentQ) return;

  const stats = room.playerStats[player.token] || {
    combo: 0,
    maxCombo: 0,
    correctCount: 0,
    wrongCount: 0,
    totalScoreGain: 0
  };

  const isCorrect = answerId === currentQ.targetId;
  let scoreGain = 0;

  if (isCorrect) {
    stats.combo += 1;
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
    stats.correctCount += 1;
    // 连击加成：基础 25 分 + 连击数 * 10
    scoreGain = 25 + stats.combo * 10;
    player.score = (player.score || 0) + scoreGain;
    stats.totalScoreGain += scoreGain;
  } else {
    // 答错清空连击并扣除 20 分惩罚
    stats.combo = 0;
    stats.wrongCount += 1;
    scoreGain = -20;
    player.score = Math.max(0, (player.score || 0) - 20);
    stats.totalScoreGain -= 20;
  }

  room.playerStats[player.token] = stats;

  // 生成下一题并推送给该玩家
  const nextQ = generateQuestion(room.round, room.stroopColorBias);
  room.playerQuestions[player.token] = nextQ;

  io.to(player.id).emit('stroop_answer_feedback', {
    isCorrect,
    scoreGain,
    combo: stats.combo,
    correctAnswerId: currentQ.targetId,
    correctAnswerName: currentQ.targetName
  });

  io.to(player.id).emit('stroop_next_subquestion', {
    displayText: nextQ.displayText,
    displayColorHex: nextQ.displayColorHex,
    targetMode: nextQ.targetMode,
    options: nextQ.options,
    combo: stats.combo
  });
}

/**
 * 结算本轮 15 秒连击战报
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'stroop-trap') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'STROOP_RESULT';

  const roundResults = room.players.map(p => {
    const stats = room.playerStats[p.token] || {
      combo: 0,
      maxCombo: 0,
      correctCount: 0,
      wrongCount: 0,
      totalScoreGain: 0
    };
    return {
      playerId: p.id,
      playerToken: p.token,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      maxCombo: stats.maxCombo,
      correctCount: stats.correctCount,
      wrongCount: stats.wrongCount,
      scoreGain: stats.totalScoreGain
    };
  }).sort((a, b) => b.scoreGain - a.scoreGain);

  const bestComboPlayer = [...roundResults].sort((a, b) => b.maxCombo - a.maxCombo)[0];

  io.to(room.id).emit('stroop_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    bestComboPlayer: bestComboPlayer ? { name: bestComboPlayer.name, maxCombo: bestComboPlayer.maxCombo } : null,
    results: roundResults
  });

  broadcastRoom(room);

  // 3.5秒后进入下一轮或结束游戏
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'stroop-trap' || room.status !== 'STROOP_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startRound(room, io, broadcastRoom);
    } else {
      finishGame(room, io, broadcastRoom);
    }
  }, 4000);
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
