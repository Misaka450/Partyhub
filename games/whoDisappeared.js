// ===================================================
// 游戏：谁不见了 / 偷吃怪 (Who Disappeared?)
// 玩法机制：短时工作记忆考验！
// 阶段 1 (3秒记忆)：桌上摆放 5~8 个美味食物/物品。
// 阶段 2 (抢答)：幕布落下又升起，偷吃怪偷偷吃掉/移除了其中 1 个！
// 玩家需要从选项中快速认出“哪个东西不见了”。
// ===================================================

const { shuffle } = require('./shuffle');

// 丰盛的食物与物品池
const DELICACIES = [
  { id: 'burger', name: '汉堡', emoji: '🍔' },
  { id: 'fries', name: '薯条', emoji: '🍟' },
  { id: 'pizza', name: '披萨', emoji: '🍕' },
  { id: 'hotdog', name: '热狗', emoji: '🌭' },
  { id: 'donut', name: '甜甜圈', emoji: '🍩' },
  { id: 'cookie', name: '曲奇饼', emoji: '🍪' },
  { id: 'cake', name: '蛋糕', emoji: '🍰' },
  { id: 'icecream', name: '冰淇淋', emoji: '🍦' },
  { id: 'apple', name: '红苹果', emoji: '🍎' },
  { id: 'watermelon', name: '西瓜', emoji: '🍉' },
  { id: 'banana', name: '香蕉', emoji: '🍌' },
  { id: 'strawberry', name: '草莓', emoji: '🍓' },
  { id: 'sushi', name: '寿司', emoji: '🍣' },
  { id: 'ramen', name: '拉面', emoji: '🍜' },
  { id: 'taco', name: '塔可', emoji: '🌮' }
];

/**
 * 纯函数：生成一道记忆与消失题目
 * @param {number} round 当前轮次
 */
function generateDisappearPuzzle(round = 1) {
  // 难度梯度：物品数量随轮次增加（第1轮5个，第2轮6个，第3轮7个）
  const count = Math.min(8, 4 + round);
  const shuffledPool = shuffle(DELICACIES);
  const initialItems = shuffledPool.slice(0, count);

  // 随机选 1 个被吃掉的目标
  const targetIndex = Math.floor(Math.random() * initialItems.length);
  const eatenItem = initialItems[targetIndex];

  // 剩余的物品列表（乱序展示，增加难度）
  const remainingItems = shuffle(initialItems.filter((_, idx) => idx !== targetIndex));

  // 构造 4 个选项（包含被吃掉的那个 + 3个不在初始盘子里的干扰项）
  const unusedItems = shuffledPool.slice(count);
  const distractors = unusedItems.slice(0, 3);
  const options = shuffle([eatenItem, ...distractors]).map(item => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji
  }));

  return {
    initialItems,
    eatenItem,
    remainingItems,
    options
  };
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'who-disappeared';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentPuzzle = null;
  room.playerAnswers = {};
  room.timeLeft = 3;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
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
 * 开始新的一轮（先进入 3 秒观察记忆阶段）
 */
function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateDisappearPuzzle(room.round);
  room.currentPuzzle = puzzle;
  room.playerAnswers = {};
  room.status = 'DISAPPEAR_MEMORIZE';
  room.timeLeft = 3; // 3秒记忆时间

  broadcastRoom(room);

  io.to(room.id).emit('disappear_start_memorize', {
    round: room.round,
    maxRounds: room.maxRounds,
    initialItems: puzzle.initialItems,
    memorizeTime: 3
  });

  io.to(room.id).emit('system_message', `👀 第 ${room.round}/${room.maxRounds} 轮：请记住餐盘上的所有食物（3秒倒计时）！`);

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      // 进入抢答阶段
      startGuessPhase(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

/**
 * 记忆结束，偷吃怪出现并开启抢答
 */
function startGuessPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  room.status = 'DISAPPEAR_GUESS';
  room.timeLeft = 6; // 6秒抢答
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('disappear_start_guess', {
    round: room.round,
    maxRounds: room.maxRounds,
    remainingItems: room.currentPuzzle.remainingItems,
    options: room.currentPuzzle.options,
    timeLimit: 6
  });

  io.to(room.id).emit('system_message', `👾 嗷呜一口！有个食物不见了，快选出是哪一个！`);

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
  if (room.gameType !== 'who-disappeared' || room.status !== 'DISAPPEAR_GUESS') return;
  if (!room.currentPuzzle) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = answerId === room.currentPuzzle.eatenItem.id;

  let scoreGain = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((6 - timeUsed) * 10));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    answerId,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('disappear_answer_feedback', {
    isCorrect,
    scoreGain,
    correctAnswerId: room.currentPuzzle.eatenItem.id
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
  if (room.gameType !== 'who-disappeared') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'DISAPPEAR_RESULT';

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

  io.to(room.id).emit('disappear_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    eatenItem: room.currentPuzzle ? room.currentPuzzle.eatenItem : null,
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'who-disappeared' || room.status !== 'DISAPPEAR_RESULT') return;
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

  io.to(room.id).emit('disappear_game_over', {
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
  if (room.gameType !== 'who-disappeared') return;
  if (room.status === 'DISAPPEAR_GUESS') {
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
  generateDisappearPuzzle,
  initRoomState,
  startGame,
  startRound,
  startGuessPhase,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
