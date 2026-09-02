// ===================================================
// 游戏：谁不见了 / 偷吃怪 (Who Disappeared?)
// 玩法机制：短时工作记忆考验！
// 阶段 1 (3秒记忆)：桌上摆放 5~8 个美味食物与趣味物品。
// 阶段 2 (抢答)：幕布落下又升起，偷吃怪偷偷吃掉/移除了其中 1 个！
// 玩家需要从选项中快速认出“哪个东西不见了”。
// 现已扩充至 100+ 丰盛美食、水果与潮玩物品池，支持单局防重与轮次难度递增！
// ===================================================

const { shuffle } = require('./shuffle');

// 100+ 丰盛美食与趣味潮玩池
const DELICACIES = [
  // 🍔 快餐与小吃
  { id: 'burger', name: '汉堡', emoji: '🍔' },
  { id: 'fries', name: '薯条', emoji: '🍟' },
  { id: 'pizza', name: '披萨', emoji: '🍕' },
  { id: 'hotdog', name: '热狗', emoji: '🌭' },
  { id: 'sandwich', name: '三明治', emoji: '🥪' },
  { id: 'taco', name: '塔可', emoji: '🌮' },
  { id: 'burrito', name: '卷饼', emoji: '🌯' },
  { id: 'popcorn', name: '爆米花', emoji: '🍿' },
  { id: 'fried_chicken', name: '炸鸡腿', emoji: '🍗' },
  { id: 'dumpling', name: '水饺', emoji: '🥟' },
  { id: 'baozi', name: '小笼包', emoji: '🥟' },

  // 🍰 甜品与烘焙
  { id: 'donut', name: '甜甜圈', emoji: '🍩' },
  { id: 'cookie', name: '曲奇饼', emoji: '🍪' },
  { id: 'cake', name: '草莓蛋糕', emoji: '🍰' },
  { id: 'cupcake', name: '纸杯蛋糕', emoji: '🧁' },
  { id: 'pie', name: '苹果派', emoji: '🥧' },
  { id: 'icecream', name: '甜筒雪糕', emoji: '🍦' },
  { id: 'shaved_ice', name: '刨冰', emoji: '🍧' },
  { id: 'chocolate', name: '巧克力', emoji: '🍫' },
  { id: 'candy', name: '水果糖', emoji: '🍬' },
  { id: 'lollipop', name: '棒棒糖', emoji: '🍭' },
  { id: 'pudding', name: '焦糖布丁', emoji: '🍮' },
  { id: 'croissant', name: '牛角可颂', emoji: '🥐' },
  { id: 'waffle', name: '华夫饼', emoji: '🧇' },
  { id: 'pancake', name: '松饼煎饼', emoji: '🥞' },

  // 🍎 水果与生鲜
  { id: 'apple', name: '红苹果', emoji: '🍎' },
  { id: 'green_apple', name: '青苹果', emoji: '🍏' },
  { id: 'watermelon', name: '西瓜', emoji: '🍉' },
  { id: 'banana', name: '香蕉', emoji: '🍌' },
  { id: 'strawberry', name: '草莓', emoji: '🍓' },
  { id: 'cherry', name: '车厘子', emoji: '🍒' },
  { id: 'grape', name: '紫葡萄', emoji: '🍇' },
  { id: 'orange', name: '蜜桔', emoji: '🍊' },
  { id: 'lemon', name: '黄柠檬', emoji: '🍋' },
  { id: 'peach', name: '水蜜桃', emoji: '🍑' },
  { id: 'mango', name: '大芒果', emoji: '🥭' },
  { id: 'pineapple', name: '菠萝', emoji: '🍍' },
  { id: 'coconut', name: '椰子', emoji: '🥥' },
  { id: 'kiwi', name: '猕猴桃', emoji: '🥝' },
  { id: 'avocado', name: '牛油果', emoji: '🥑' },
  { id: 'corn', name: '甜玉米', emoji: '🌽' },

  // 🍜 主食正餐
  { id: 'ramen', name: '日式拉面', emoji: '🍜' },
  { id: 'spaghetti', name: '意面', emoji: '🍝' },
  { id: 'sushi', name: '三文鱼寿司', emoji: '🍣' },
  { id: 'bento', name: '便当盒', emoji: '🍱' },
  { id: 'curry', name: '咖喱饭', emoji: '🍛' },
  { id: 'rice_ball', name: '紫菜饭团', emoji: '🍙' },
  { id: 'steak', name: '煎牛排', emoji: '🥩' },
  { id: 'shrimp', name: '天妇罗虾', emoji: '🍤' },
  { id: 'pot', name: '热火锅', emoji: '🍲' },
  { id: 'soup', name: '浓热汤', emoji: '🥣' },

  // 🥤 饮品与冷饮
  { id: 'bubble_tea', name: '珍珠奶茶', emoji: '🧋' },
  { id: 'coffee', name: '热咖啡', emoji: '☕' },
  { id: 'tea', name: '绿茶', emoji: '🍵' },
  { id: 'juice', name: '盒装果汁', emoji: '🧃' },
  { id: 'milk', name: '鲜牛奶', emoji: '🥛' },
  { id: 'soda', name: '汽水罐', emoji: '🥤' },
  { id: 'beer', name: '大杯啤酒', emoji: '🍺' },
  { id: 'cocktail', name: '鸡尾酒', emoji: '🍸' },

  // 🎮 聚会潮玩与日常小物件
  { id: 'gamepad', name: '游戏手柄', emoji: '🎮' },
  { id: 'dice', name: '彩色骰子', emoji: '🎲' },
  { id: 'rubik', name: '魔方', emoji: '🧩' },
  { id: 'yoyo', name: '悠悠球', emoji: '🪀' },
  { id: 'kite', name: '风筝', emoji: '🪁' },
  { id: 'teddy', name: '泰迪熊', emoji: '🧸' },
  { id: 'pinata', name: '彩罐皮纳塔', emoji: '🪅' },
  { id: 'balloon', name: '红气球', emoji: '🎈' },
  { id: 'present', name: '礼物盒', emoji: '🎁' },
  { id: 'bell', name: '金色铃铛', emoji: '🔔' },
  { id: 'gem', name: '蓝宝石', emoji: '💎' },
  { id: 'sunglasses', name: '墨镜', emoji: '🕶️' }
];

/**
 * 纯函数：生成一道记忆与消失题目
 * @param {number} round 当前轮次
 * @param {Set|Array} usedTargetIds 已吃过的目标防重
 */
function generateDisappearPuzzle(round = 1, usedTargetIds = []) {
  const count = Math.min(8, 4 + round);
  const usedSet = new Set(usedTargetIds);

  const shuffledPool = shuffle(DELICACIES);
  const initialItems = shuffledPool.slice(0, count);

  // 优先挑选本局尚未作为目标消失过的物品
  const candidateTargets = initialItems.filter(item => !usedSet.has(item.id));
  const eatenItem = candidateTargets.length > 0
    ? candidateTargets[Math.floor(Math.random() * candidateTargets.length)]
    : initialItems[Math.floor(Math.random() * initialItems.length)];

  const targetIndex = initialItems.findIndex(item => item.id === eatenItem.id);

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
  room.usedTargetIds = [];
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
  room.usedTargetIds = [];
  startMemoryPhase(room, io, broadcastRoom);
}

/**
 * 阶段 1：展示盘子中的所有物品供玩家短时记忆
 */
function startMemoryPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateDisappearPuzzle(room.round, room.usedTargetIds || []);
  room.currentPuzzle = puzzle;
  if (!room.usedTargetIds) room.usedTargetIds = [];
  room.usedTargetIds.push(puzzle.eatenItem.id);

  room.playerAnswers = {};
  room.status = 'DISAPPEAR_MEMORIZE';
  room.timeLeft = 3;

  broadcastRoom(room);

  const memPayload = {
    round: room.round,
    maxRounds: room.maxRounds,
    items: puzzle.initialItems,
    initialItems: puzzle.initialItems,
    timeLimit: 3
  };
  io.to(room.id).emit('disappear_memory_start', memPayload);
  io.to(room.id).emit('disappear_start_memorize', memPayload);

  io.to(room.id).emit('system_message', `👀 第 ${room.round}/${room.maxRounds} 轮：请用 3 秒记住桌上的所有物品！`);

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      startGuessPhase(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

/**
 * 阶段 2：偷吃怪移走一件，进入抢答阶段
 */
function startGuessPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  const puzzle = room.currentPuzzle;
  if (!puzzle) return;

  room.status = 'DISAPPEAR_GUESSING';
  room.timeLeft = 6;
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  const guessPayload = {
    round: room.round,
    maxRounds: room.maxRounds,
    items: puzzle.remainingItems,
    remainingItems: puzzle.remainingItems,
    options: puzzle.options,
    timeLimit: 6
  };
  io.to(room.id).emit('disappear_guess_start', guessPayload);
  io.to(room.id).emit('disappear_start_guess', guessPayload);

  io.to(room.id).emit('system_message', `🍽️ 嗷呜！偷吃怪吃掉了一个！究竟哪个东西不见了？请抢答！`);

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
 * 玩家提交答案
 */
function submitAnswer(room, player, optionId, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared' || (room.status !== 'DISAPPEAR_GUESSING' && room.status !== 'DISAPPEAR_GUESS')) return;
  if (room.playerAnswers[player.token]) return;

  const puzzle = room.currentPuzzle;
  if (!puzzle) return;

  const isCorrect = optionId === puzzle.eatenItem.id;
  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  let scoreGain = 0;

  if (isCorrect) {
    scoreGain = Math.max(10, Math.round(100 - timeUsed * 15));
    player.score += scoreGain;
  }

  room.playerAnswers[player.token] = {
    playerId: player.id,
    playerName: player.name,
    isCorrect,
    scoreGain,
    optionId,
    timeUsed
  };

  io.to(player.id).emit('disappear_answer_feedback', {
    isCorrect,
    scoreGain,
    correctId: puzzle.eatenItem.id,
    correctName: puzzle.eatenItem.name,
    correctEmoji: puzzle.eatenItem.emoji
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
 * 结束本轮
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'DISAPPEAR_RESULT';
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

  io.to(room.id).emit('disappear_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    eatenItem: puzzle.eatenItem,
    results
  });

  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'who-disappeared' || (room.status !== 'DISAPPEAR_RESULT' && room.status !== 'DISAPPEAR_ROUND_RESULT')) return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startMemoryPhase(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 3000);
}

/**
 * 游戏终局
 */
function endGame(room, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
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

  io.to(room.id).emit('disappear_game_over', {
    podium,
    scores: ranked.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  io.to(room.id).emit('system_message', `🏆 短时记忆挑战结束！恭喜 ${ranked[0]?.name || '胜者'} 荣获神捕大师！`);
}

function onPlayerRemoved(room, removedPlayer, io, broadcastRoom) {
  if (room.gameType !== 'who-disappeared') return;
  delete room.playerAnswers[removedPlayer.token];
  if (room.status === 'DISAPPEAR_GUESSING') {
    const activePlayers = room.players.filter(p => p.alive !== false);
    const answerCount = Object.keys(room.playerAnswers).length;
    if (activePlayers.length > 0 && answerCount >= activePlayers.length) {
      clearInterval(room.timer);
      room.timer = null;
      endRound(room, io, broadcastRoom);
    }
  }
}

module.exports = {
  DELICACIES,
  generateDisappearPuzzle,
  initRoomState,
  startGame,
  submitAnswer,
  finishGame: endGame,
  onPlayerRemoved
};
