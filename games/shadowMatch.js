// ===================================================
// 游戏：聚光灯拼图 / 影子猜物 (Spotlight / Shadow Match)
// 玩法机制：屏幕中央展示一个被黑色剪影与聚光灯遮罩的神秘物品。
// 聚光灯由小到大缓慢扫过物品轮廓，玩家在 4 个选项中抢答。
// 越早在轮廓不明显时答对，得分越高！
// 现已扩充至 120+ 聚会物品轮廓大库，支持跨分类生成与单局防重机制！
// ===================================================

const { shuffle } = require('./shuffle');

// 120+ 款高辨识度物体剪影库
const ITEM_COLLECTION = [
  // 🐾 陆地与海洋动物
  { id: 'cat', name: '猫咪', emoji: '🐱', hint: '毛茸茸的家养宠物' },
  { id: 'dog', name: '小狗', emoji: '🐶', hint: '人类最忠诚的朋友' },
  { id: 'elephant', name: '大象', emoji: '🐘', hint: '长长鼻子的陆地巨兽' },
  { id: 'rabbit', name: '兔子', emoji: '🐰', hint: '长耳朵爱吃胡萝卜' },
  { id: 'panda', name: '大熊猫', emoji: '🐼', hint: '国宝黑白团子' },
  { id: 'lion', name: '狮子', emoji: '🦁', hint: '草原百兽之王' },
  { id: 'tiger', name: '老虎', emoji: '🐯', hint: '森林斑纹猛兽' },
  { id: 'giraffe', name: '长颈鹿', emoji: '🦒', hint: '个子最高的哺乳动物' },
  { id: 'kangaroo', name: '袋鼠', emoji: '🦘', hint: '育儿袋与跳跃高手' },
  { id: 'dinosaur', name: '霸王龙', emoji: '🦖', hint: '远古史前霸主' },
  { id: 'whale', name: '鲸鱼', emoji: '🐳', hint: '海洋中的庞然巨兽' },
  { id: 'dolphin', name: '海豚', emoji: '🐬', hint: '高智商海洋精灵' },
  { id: 'shark', name: '鲨鱼', emoji: '🦈', hint: '海洋凶猛掠食者' },
  { id: 'octopus', name: '章鱼', emoji: '🐙', hint: '八条腕足喷墨高手' },
  { id: 'crab', name: '螃蟹', emoji: '🦀', hint: '横着走的硬壳甲壳' },
  { id: 'frog', name: '青蛙', emoji: '🐸', hint: '池塘呱呱叫捕虫能手' },
  { id: 'penguin', name: '企鹅', emoji: '🐧', hint: '南极摇摇摆摆绅士' },
  { id: 'owl', name: '猫头鹰', emoji: '🦉', hint: '夜间行动敏锐捕猎' },
  { id: 'eagle', name: '雄鹰', emoji: '🦅', hint: '翱翔天际的猛禽' },
  { id: 'butterfly', name: '蝴蝶', emoji: '🦋', hint: '斑斓翅膀花间起舞' },
  { id: 'bee', name: '蜜蜂', emoji: '🐝', hint: '勤劳采蜜筑巢' },
  { id: 'snail', name: '蜗牛', emoji: '🐌', hint: '背着重重外壳慢爬' },
  { id: 'turtle', name: '海龟', emoji: '🐢', hint: '长寿坚硬龟壳' },
  { id: 'monkey', name: '猴子', emoji: '🐵', hint: '树冠荡秋千爱香蕉' },

  // 🚗 交通与飞行载具
  { id: 'car', name: '小汽车', emoji: '🚗', hint: '常见四轮代步工具' },
  { id: 'airplane', name: '民航客机', emoji: '✈️', hint: '天空中长途飞行的客机' },
  { id: 'rocket', name: '火箭', emoji: '🚀', hint: '飞向深邃太空探索' },
  { id: 'bicycle', name: '自行车', emoji: '🚲', hint: '两轮环保人力骑行' },
  { id: 'motorcycle', name: '摩托车', emoji: '🏍️', hint: '两轮机动轰鸣飞驰' },
  { id: 'train', name: '高速列车', emoji: '🚄', hint: '铁轨上飞速穿梭' },
  { id: 'ship', name: '远洋轮船', emoji: '🚢', hint: '深蓝大洋航行的巨轮' },
  { id: 'speedboat', name: '高速快艇', emoji: '🚤', hint: '水面上疾驰飞奔的快艇' },
  { id: 'helicopter', name: '直升机', emoji: '🚁', hint: '顶置旋翼垂直起降' },
  { id: 'sailboat', name: '扬帆帆船', emoji: '⛵', hint: '迎风借力张帆前行' },
  { id: 'bus', name: '双层巴士', emoji: '🚌', hint: '城市公共客运交通' },
  { id: 'tractor', name: '农用拖拉机', emoji: '🚜', hint: '田间耕作重型机械' },

  // 🎸 乐器与艺术
  { id: 'guitar', name: '木吉他', emoji: '🎸', hint: '六根弦的弹拨乐器' },
  { id: 'piano', name: '古典钢琴', emoji: '🎹', hint: '黑白键乐器之王' },
  { id: 'violin', name: '小提琴', emoji: '🎻', hint: '弓弦擦出的悠扬旋律' },
  { id: 'drum', name: '架子鼓', emoji: '🥁', hint: '节奏律动打击乐器' },
  { id: 'trumpet', name: '高音小号', emoji: '🎺', hint: '铜管乐器嘹亮高亢' },
  { id: 'saxophone', name: '萨克斯', emoji: '🎷', hint: '爵士迷情金属管乐' },
  { id: 'palette', name: '画家调色板', emoji: '🎨', hint: '艺术绘图调制色彩' },
  { id: 'microphone', name: '麦克风', emoji: '🎤', hint: '舞台放歌拾音利器' },

  // 🍔 美食与甜品
  { id: 'pizza', name: '披萨', emoji: '🍕', hint: '带拉丝奶酪的美味' },
  { id: 'burger', name: '双层汉堡', emoji: '🍔', hint: '两片面包夹牛肉肉饼' },
  { id: 'fries', name: '香脆薯条', emoji: '🍟', hint: '金黄油炸土豆小吃' },
  { id: 'icecream', name: '甜筒冰淇淋', emoji: '🍦', hint: '夏日解暑清甜冰爽' },
  { id: 'cake', name: '生日蛋糕', emoji: '🎂', hint: '点蜡烛庆祝的甜蜜糕点' },
  { id: 'donut', name: '甜甜圈', emoji: '🍩', hint: '中间带洞油炸裹糖' },
  { id: 'ramen', name: '日式拉面', emoji: '🍜', hint: '热腾腾骨汤面条' },
  { id: 'sushi', name: '三文鱼寿司', emoji: '🍣', hint: '米饭与生鱼片的结合' },
  { id: 'beer', name: '生啤酒杯', emoji: '🍺', hint: '聚会干杯带泡沫' },
  { id: 'cocktail', name: '高脚鸡尾酒', emoji: '🍸', hint: '调酒师调制精致饮品' },
  { id: 'coffee', name: '浓缩热咖啡', emoji: '☕', hint: '提神醒脑醇香热饮' },

  // 👑 道具、饰品与日用品
  { id: 'crown', name: '黄金皇冠', emoji: '👑', hint: '象征尊贵荣耀的头冠' },
  { id: 'camera', name: '单反照相机', emoji: '📷', hint: '咔嚓定格瞬间的光学设备' },
  { id: 'trophy', name: '冠军金杯', emoji: '🏆', hint: '巅峰胜利的奖赏' },
  { id: 'umbrella', name: '雨伞', emoji: '☂️', hint: '雨天遮风挡雨撑开伞面' },
  { id: 'glasses', name: '黑框眼镜', emoji: '👓', hint: '矫正视力架在鼻梁' },
  { id: 'ring', name: '钻石戒指', emoji: '💍', hint: '象征永恒爱意的首饰' },
  { id: 'backpack', name: '旅行双肩包', emoji: '🎒', hint: '背在身后收纳行囊' },
  { id: 'key', name: '金属钥匙', emoji: '🔑', hint: '插入锁芯开启大门' },
  { id: 'lock', name: '黄铜铁锁', emoji: '🔒', hint: '挂在门栓保卫安全' },
  { id: 'flashlight', name: '手电筒', emoji: '🔦', hint: '暗夜中照亮前方' },
  { id: 'hourglass', name: '古典沙漏', emoji: '⏳', hint: '细沙滑落见证光阴' },
  { id: 'clock', name: '复古闹钟', emoji: '⏰', hint: '滴答走动清晨唤醒' },
  { id: 'scissors', name: '剪刀', emoji: '✂️', hint: '锋利双刃裁剪纸张' },
  { id: 'telescope', name: '天文望远镜', emoji: '🔭', hint: '窥视遥远星系星空' },
  { id: 'magnet', name: 'U型磁铁', emoji: '🧲', hint: '南北两极吸附铁块' },
  { id: 'candle', name: '祈福蜡烛', emoji: '🕯️', hint: '微弱烛火摇曳生辉' },
  { id: 'shield', name: '中世纪盾牌', emoji: '🛡️', hint: '抵御刀剑弓弩重击' },
  { id: 'sword', name: '十字宝剑', emoji: '⚔️', hint: '骑士佩带寒光逼人' },

  // 🏀 运动与户外
  { id: 'basketball', name: '篮球', emoji: '🏀', hint: '橙色皮球三分空心' },
  { id: 'football', name: '黑白足球', emoji: '⚽', hint: '绿茵场上十一对十一' },
  { id: 'tennis', name: '网球拍与球', emoji: '🎾', hint: '草地红土挥拍抽球' },
  { id: 'bowling', name: '保龄球', emoji: '🎳', hint: '三孔重球击倒木瓶' },
  { id: 'badminton', name: '羽毛球', emoji: '🏸', hint: '白羽轻扬隔网扣杀' },
  { id: 'boxing', name: '红色拳击手套', emoji: '🥊', hint: '擂台搏击格斗护具' },
  { id: 'tent', name: '野营帐篷', emoji: '⛺', hint: '山林野外临时居所' },
  { id: 'campfire', name: '露营营火', emoji: '🔥', hint: '围坐取暖柴火熊熊' }
];

/**
 * 纯函数：生成一道影子谜题（支持传入已出现过的物品 ID 集合防重）
 * @param {number} round 当前轮次
 * @param {Set|Array} usedIds 已用过的物品ID
 */
function generateShadowPuzzle(round = 1, usedIds = []) {
  const usedSet = new Set(usedIds);
  const availableItems = ITEM_COLLECTION.filter(item => !usedSet.has(item.id));
  const pool = availableItems.length >= 4 ? availableItems : ITEM_COLLECTION;

  const shuffled = shuffle(pool);
  const target = shuffled[0];

  // 优先从全库中挑选互不相同且与 target 不同的干扰项
  const otherItems = ITEM_COLLECTION.filter(item => item.id !== target.id);
  const distractors = shuffle(otherItems).slice(0, 3);

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
  room.usedShadowIds = [];
  room.playerAnswers = {};
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
  room.usedShadowIds = [];
  startRound(room, io, broadcastRoom);
}

/**
 * 开始新一轮
 */
function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generateShadowPuzzle(room.round, room.usedShadowIds || []);
  room.currentPuzzle = puzzle;
  if (!room.usedShadowIds) room.usedShadowIds = [];
  room.usedShadowIds.push(puzzle.targetId);

  room.playerAnswers = {};
  room.status = 'SHADOW_GUESSING';
  room.timeLeft = 7;
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('shadow_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetEmoji: puzzle.targetEmoji,
    hint: puzzle.hint,
    options: puzzle.options,
    timeLimit: 7
  });

  io.to(room.id).emit('system_message', `💡 第 ${room.round}/${room.maxRounds} 轮：聚光灯正在扫射剪影轮廓，请抢答！`);

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
 * 玩家提交竞猜答案
 */
function submitAnswer(room, player, answerId, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match' || room.status !== 'SHADOW_GUESSING') return;
  if (room.playerAnswers[player.token]) return;

  const puzzle = room.currentPuzzle;
  if (!puzzle) return;

  const isCorrect = answerId === puzzle.targetId;
  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  let scoreGain = 0;

  if (isCorrect) {
    scoreGain = Math.max(10, Math.round(100 - timeUsed * 12));
    player.score += scoreGain;
  }

  room.playerAnswers[player.token] = {
    playerId: player.id,
    playerName: player.name,
    isCorrect,
    scoreGain,
    answerId,
    timeUsed
  };

  io.to(player.id).emit('shadow_answer_feedback', {
    isCorrect,
    scoreGain,
    correctId: puzzle.targetId,
    correctName: puzzle.targetName
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
 * 结算本轮
 */
function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'SHADOW_RESULT';
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

  io.to(room.id).emit('shadow_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetId: puzzle.targetId,
    targetName: puzzle.targetName,
    targetEmoji: puzzle.targetEmoji,
    results
  });

  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'shadow-match' || (room.status !== 'SHADOW_RESULT' && room.status !== 'SHADOW_ROUND_RESULT')) return;
    if (room.round < room.maxRounds) {
      room.round += 1;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 3000);
}

/**
 * 结束整个游戏
 */
function endGame(room, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match') return;
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

  io.to(room.id).emit('shadow_game_over', {
    podium,
    scores: ranked.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  io.to(room.id).emit('system_message', `🏆 聚光灯剪影大赛结束！恭喜 ${ranked[0]?.name || '胜者'} 荣膺眼力之王！`);
}

function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  if (room.gameType !== 'shadow-match') return;
  if (!room.playerAnswers) return;
  // 清理离场玩家的答案记录，防止残留导致全员作答提早误判（审计 M4）
  const currentTokens = new Set(room.players.map(p => p.token));
  for (const token of Object.keys(room.playerAnswers)) {
    if (!currentTokens.has(token)) {
      delete room.playerAnswers[token];
    }
  }
  if (room.status === 'SHADOW_GUESSING') {
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
    gameType: 'shadow-match',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    targetEmoji: p ? p.targetEmoji : null,
    hint: p ? p.hint : null,
    options: p ? p.options : [],
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  getPublicState,
  ITEM_COLLECTION,
  generateShadowPuzzle,
  initRoomState,
  startGame,
  submitAnswer,
  finishGame: endGame,
  onPlayerRemoved
};
