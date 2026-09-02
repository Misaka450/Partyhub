// ===================================================
// 游戏：谁是多胞胎 / 找不同 (Twin Finder / Odd One Out)
// 玩法机制：屏幕上生成 6~8 个特征拼装的可爱小角色，
// 随机出现两种题型：
// 1. 【双胞胎 (TWINS)】：所有角色中只有 2 个完全一模一样，找出这对双胞胎！
// 2. 【找不同 (ODD_ONE)】：几乎所有角色都相同，只有 1 只有细微区别，找出它！
// ===================================================

const { shuffle } = require('./shuffle');

// 角色各部件属性池
const HEADS = ['🐱', '🐶', '🐰', '🐼', '🦊', '🐸', '🐵', '🐷'];
const BG_COLORS = ['#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#EDE9FE', '#FCE7F3'];
const ACCESSORIES = ['👓', '👑', '🎀', '⭐', '🎩', '🎧'];
const HAND_ITEMS = ['🍎', '🍦', '🎈', '🎸', '🕹️', '🍭'];

/**
 * 随机生成一个单一角色特征
 */
function createRandomChar() {
  return {
    head: HEADS[Math.floor(Math.random() * HEADS.length)],
    bgColor: BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)],
    accessory: ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)],
    handItem: HAND_ITEMS[Math.floor(Math.random() * HAND_ITEMS.length)]
  };
}

/**
 * 判断两个角色是否属性完全相同
 */
function isSameChar(a, b) {
  return a.head === b.head &&
         a.bgColor === b.bgColor &&
         a.accessory === b.accessory &&
         a.handItem === b.handItem;
}

/**
 * 纯函数：生成一道找不同或双胞胎的题目
 * @param {number} round 当前轮次
 * @param {string} diff 难度档位：easy / normal / hard，决定角色总数
 */
function generatePuzzle(round = 1, diff = 'normal') {
  // 难度对应角色数量（base 起始 + 轮次递增，cap 封顶）：
  // easy=最多6个 / normal=当前默认最多9个 / hard=最多10个（干扰多更难分辨）
  const CONF = {
    easy: { base: 4, cap: 6 },
    normal: { base: 5, cap: 9 },
    hard: { base: 7, cap: 10 }
  };
  const conf = CONF[diff] || CONF.normal;
  const totalCount = Math.min(conf.cap, conf.base + round);
  const mode = Math.random() < 0.5 ? 'TWINS' : 'ODD_ONE';
  const list = [];
  let correctIndices = [];

  if (mode === 'TWINS') {
    // 双胞胎模式：先生成一个基准角色 A
    const twinChar = createRandomChar();
    list.push({ ...twinChar, id: 'twin_1' });
    list.push({ ...twinChar, id: 'twin_2' });

    // 生成其余完全不相同的干扰角色
    while (list.length < totalCount) {
      const dist = createRandomChar();
      // 避免干扰角色与双胞胎或已有干扰项意外重合
      const conflict = list.some(item => isSameChar(item, dist));
      if (!conflict) {
        list.push({ ...dist, id: `dist_${list.length}` });
      }
    }

    // 洗牌后记录双胞胎的位置下标
    const shuffledList = shuffle(list);
    correctIndices = [];
    shuffledList.forEach((char, idx) => {
      if (char.id === 'twin_1' || char.id === 'twin_2') {
        correctIndices.push(idx);
      }
    });

    return {
      mode: 'TWINS',
      prompt: '👀 找出图中长得【完全一模一样】的双胞胎！',
      characters: shuffledList.map((c, idx) => ({ ...c, index: idx })),
      correctIndices // 数组，长度为 2
    };
  } else {
    // 找不同模式：多数一样，唯独 1 个不同
    const baseChar = createRandomChar();
    // 生成一个只有 1 项特征不同的角色
    const oddChar = { ...baseChar };
    const mutateField = ['head', 'bgColor', 'accessory', 'handItem'][Math.floor(Math.random() * 4)];
    if (mutateField === 'head') {
      oddChar.head = HEADS.find(h => h !== baseChar.head) || '🦁';
    } else if (mutateField === 'bgColor') {
      oddChar.bgColor = BG_COLORS.find(c => c !== baseChar.bgColor) || '#FFF';
    } else if (mutateField === 'accessory') {
      oddChar.accessory = ACCESSORIES.find(a => a !== baseChar.accessory) || '⚡';
    } else {
      oddChar.handItem = HAND_ITEMS.find(i => i !== baseChar.handItem) || '⭐';
    }

    list.push({ ...oddChar, id: 'odd_target' });
    for (let i = 1; i < totalCount; i++) {
      list.push({ ...baseChar, id: `common_${i}` });
    }

    const shuffledList = shuffle(list);
    const targetIdx = shuffledList.findIndex(c => c.id === 'odd_target');

    return {
      mode: 'ODD_ONE',
      prompt: '🔍 找出图中【唯一与众不同】的那一只！',
      characters: shuffledList.map((c, idx) => ({ ...c, index: idx })),
      correctIndices: [targetIdx]
    };
  }
}

/**
 * 初始化房间内该游戏的状态数据
 */
function initRoomState(room) {
  room.gameType = 'twin-finder';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.twinDiff = room.twinDiff || 'normal';
  room.currentPuzzle = null;
  room.playerAnswers = {}; // token -> { selectedIndices, isCorrect, timeUsed, score }
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
  if (room.gameType !== 'twin-finder') return;
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
  if (room.gameType !== 'twin-finder') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const puzzle = generatePuzzle(room.round, room.twinDiff || 'normal');
  room.currentPuzzle = puzzle;
  room.playerAnswers = {};
  room.status = 'TWIN_FINDING';
  room.timeLeft = 8; // 每轮 8 秒
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('twin_new_puzzle', {
    round: room.round,
    maxRounds: room.maxRounds,
    mode: puzzle.mode,
    prompt: puzzle.prompt,
    characters: puzzle.characters,
    timeLimit: 8
  });

  io.to(room.id).emit('system_message', `🎯 第 ${room.round}/${room.maxRounds} 轮：${puzzle.prompt}`);

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
 * 玩家提交答案（点击卡片索引）
 */
function submitAnswer(room, player, selectedIndex, io, broadcastRoom) {
  if (room.gameType !== 'twin-finder' || room.status !== 'TWIN_FINDING') return;
  if (!room.currentPuzzle) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const isCorrect = room.currentPuzzle.correctIndices.includes(selectedIndex);

  let scoreGain = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((8 - timeUsed) * 8));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    selectedIndex,
    isCorrect,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('twin_answer_feedback', {
    isCorrect,
    scoreGain,
    correctIndices: room.currentPuzzle.correctIndices
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
  if (room.gameType !== 'twin-finder') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'TWIN_RESULT';

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
      selectedIndex: ans ? ans.selectedIndex : null
    };
  });

  io.to(room.id).emit('twin_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    mode: room.currentPuzzle ? room.currentPuzzle.mode : null,
    correctIndices: room.currentPuzzle ? room.currentPuzzle.correctIndices : [],
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'twin-finder' || room.status !== 'TWIN_RESULT') return;
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

  io.to(room.id).emit('twin_game_over', {
    podium: sorted.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

/**
 * 玩家断线保护
 */
function onPlayerRemoved(room, player, io, broadcastRoom) {
  if (room.gameType !== 'twin-finder') return;
  if (room.status === 'TWIN_FINDING') {
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
  generatePuzzle,
  initRoomState,
  startGame,
  startRound,
  submitAnswer,
  endRound,
  finishGame,
  onPlayerRemoved
};
