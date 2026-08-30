// ===================================================
// 游戏：聚光灯拼图 / 影子猜物 (Spotlight / Shadow Match)
// 玩法机制：屏幕中央展示一个被黑色剪影与聚光灯遮罩的神秘物品。
// 聚光灯由小到大缓慢扫过物品轮廓，玩家在 4 个选项中抢答。
// 越早在轮廓不明显时答对，得分越高！
// ===================================================

const { shuffle } = require('./shuffle');

// 聚会趣味物品库
const ITEM_COLLECTION = [
  { id: 'cat', name: '猫咪', emoji: '🐱', hint: '毛茸茸的宠物' },
  { id: 'elephant', name: '大象', emoji: '🐘', hint: '长长鼻子的陆地巨兽' },
  { id: 'guitar', name: '吉他', emoji: '🎸', hint: '六根弦的乐器' },
  { id: 'car', name: '小汽车', emoji: '🚗', hint: '代步交通工具' },
  { id: 'rocket', name: '火箭', emoji: '🚀', hint: '飞向太空' },
  { id: 'pizza', name: '披萨', emoji: '🍕', hint: '圆形带奶酪的美食' },
  { id: 'dinosaur', name: '霸王龙', emoji: '🦖', hint: '远古霸主' },
  { id: 'crown', name: '皇冠', emoji: '👑', hint: '王者象征' },
  { id: 'bicycle', name: '自行车', emoji: '🚲', hint: '两轮骑行工具' },
  { id: 'airplane', name: '飞机', emoji: '✈️', hint: '天空中飞行的客机' },
  { id: 'crab', name: '螃蟹', emoji: '🦀', hint: '横着走的甲壳动物' },
  { id: 'camera', name: '照相机', emoji: '📷', hint: '定格瞬间的设备' },
  { id: 'trophy', name: '冠军奖杯', emoji: '🏆', hint: '胜利的荣耀' },
  { id: 'umbrella', name: '雨伞', emoji: '☂️', hint: '雨天遮风挡雨' },
  { id: 'panda', name: '大熊猫', emoji: '🐼', hint: '国宝黑白团子' },
  { id: 'whale', name: '鲸鱼', emoji: '🐳', hint: '海洋中的庞然大物' }
];

/**
 * 纯函数：生成一道影子谜题
 * @param {number} round 当前轮次
 */
function generateShadowPuzzle(round = 1) {
  const shuffled = shuffle(ITEM_COLLECTION);
  const target = shuffled[0];
  const distractors = shuffled.slice(1, 4);

  // 4 个候选项
  const options = shuffle([target, ...distractors]).map(item => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji
  }));

  return {
    targetId: target.id,
    targetName: target.name,
    targetEmoji: target.emoji,
    hint: target.hint,
    options
  };
}

/**
 * 初始化房间内该游戏的状态数据
 */
function initRoomState(room) {
  room.gameType = 'shadow-match';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentPuzzle = null;
  room.playerAnswers = {}; // token -> { answerId, isCorrect, timeUsed, scoreGain }
  room.timeLeft = 7;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match') return;
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
  if (room.gameType !== 'shadow-match') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateShadowPuzzle(room.round);
  room.currentPuzzle = puzzle;
  room.playerAnswers = {};
  room.status = 'SHADOW_GUESSING';
  room.timeLeft = 7; // 7秒观察与抢答
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  // 给前端推送影子与选项（剪影的 emoji 在前端显示为纯黑/剪影状态，随时间揭晓）
  io.to(room.id).emit('shadow_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetEmoji: puzzle.targetEmoji,
    options: puzzle.options,
    timeLimit: 7
  });

  io.to(room.id).emit('system_message', `🔦 第 ${room.round}/${room.maxRounds} 轮：聚光灯正在扫过剪影，看谁能最快认出TA！`);

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
 * 玩家抢答
 */
function submitAnswer(room, player, answerId, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match' || room.status !== 'SHADOW_GUESSING') return;
  if (!room.currentPuzzle) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = answerId === room.currentPuzzle.targetId;

  let scoreGain = 0;
  if (isCorrect) {
    // 越早猜中加分越多：7秒内，每提前1秒+15分
    const speedBonus = Math.max(0, Math.round((7 - timeUsed) * 15));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    answerId,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('shadow_answer_feedback', {
    isCorrect,
    scoreGain,
    correctAnswerId: room.currentPuzzle.targetId
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
  if (room.gameType !== 'shadow-match') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'SHADOW_RESULT';

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
      answerId: ans ? ans.answerId : null
    };
  });

  io.to(room.id).emit('shadow_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetName: room.currentPuzzle ? room.currentPuzzle.targetName : '',
    targetEmoji: room.currentPuzzle ? room.currentPuzzle.targetEmoji : '',
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
  if (room.gameType !== 'shadow-match') return;
  if (room.status === 'SHADOW_GUESSING') {
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
  generateShadowPuzzle,
  initRoomState,
  startGame,
  startRound,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
