// ===================================================
// 游戏：盲猜数量 / 谁最接近 (Number Guess / Who is Closest)
// 玩法机制：趣味数字盲猜与常识估算！
// 屏幕给出一道奇妙的估算问题（如：“蓝鲸舌头的重量大约相当于多少头成年大象？”）。
// 所有玩家输入一个数字进行盲猜。
// 揭晓真实答案后，谁的估算值与真相最接近，谁就能斩获高分！
// ===================================================

const { shuffle } = require('./shuffle');

// 精选聚会常识与趣味数值估算题库
const TRIVIA_QUESTIONS = [
  {
    question: '国际象棋的标准棋盘上一共有多少个小方格？',
    answer: 64,
    unit: '个',
    funFact: '8x8 的棋盘，一共 64 个黑白交替的格子。'
  },
  {
    question: '成年人的身体骨骼总数一共有多少块？',
    answer: 206,
    unit: '块',
    funFact: '婴儿出生时约有305块骨头，成年后融合成206块。'
  },
  {
    question: '一分钟包含多少秒？',
    answer: 60,
    unit: '秒',
    funFact: '最基础的时间单位！'
  },
  {
    question: '地球绕太阳公转一周大约需要多少天（取整数）？',
    answer: 365,
    unit: '天',
    funFact: '平年为365天，每四年有一个闰年366天。'
  },
  {
    question: '标准钢琴上一共有多少个黑白琴键？',
    answer: 88,
    unit: '个',
    funFact: '包含52个白键和36个黑键。'
  },
  {
    question: '长颈鹿的脖子虽然很长，但里面的颈椎骨数量和人类一样，请问一共有几块？',
    answer: 7,
    unit: '块',
    funFact: '几乎所有哺乳动物（包括人类、长颈鹿、老鼠）的颈椎骨都只有7块！'
  },
  {
    question: '人体正常体温大约是多少摄氏度（取整数）？',
    answer: 37,
    unit: '℃',
    funFact: '健康成年人的平均腋下/口腔体温约在36.5~37.2℃之间。'
  },
  {
    question: '一副标准扑克牌（不含大小王）共有多少张？',
    answer: 52,
    unit: '张',
    funFact: '4种花色，每种花色13张，共52张。'
  },
  {
    question: '一只成年猫咪通常有几根胡须（左右两侧总和）？',
    answer: 24,
    unit: '根',
    funFact: '猫咪左右脸颊通常各有12根胡须，用来感知空间宽度。'
  },
  {
    question: '一小时有多少秒？',
    answer: 3600,
    unit: '秒',
    funFact: '60分钟乘以60秒等于3600秒。'
  },
  {
    question: '一打鸡蛋一共有多少个？',
    answer: 12,
    unit: '个',
    funFact: '英文单位 Dozen（打）代表 12。'
  }
];

/**
 * 纯函数：随机挑选一道题目
 * @param {number} round 当前轮次
 */
function pickTrivia(round = 1) {
  const shuffled = shuffle(TRIVIA_QUESTIONS);
  const q = shuffled[(round - 1) % shuffled.length];
  return {
    question: q.question,
    answer: q.answer,
    unit: q.unit,
    funFact: q.funFact
  };
}

/**
 * 纯函数：计算所有猜测与真实答案的排名得分
 * @param {Array} submissions [{ token, name, guess }]
 * @param {number} truth 真实答案
 */
function evaluateGuesses(submissions, truth) {
  const evaluated = submissions.map(sub => {
    const guessNum = Number(sub.guess);
    const diff = Number.isFinite(guessNum) ? Math.abs(guessNum - truth) : Infinity;
    return {
      ...sub,
      guessNum: Number.isFinite(guessNum) ? guessNum : null,
      diff
    };
  });

  // 按偏差绝对值从小到大排序
  evaluated.sort((a, b) => a.diff - b.diff);

  // 奖励阶梯：第1名 150分，第2名 100分，第3名 60分，其余参与者若有答题给 30 分
  evaluated.forEach((item, rank) => {
    if (item.diff === Infinity) {
      item.scoreGain = 0;
    } else if (rank === 0) {
      item.scoreGain = 150;
    } else if (rank === 1) {
      item.scoreGain = 100;
    } else if (rank === 2) {
      item.scoreGain = 60;
    } else {
      item.scoreGain = 30;
    }
  });

  return evaluated;
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'number-guess';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentTrivia = null;
  room.playerGuesses = {}; // token -> guessNum
  room.timeLeft = 12;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'number-guess') return;
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
  if (room.gameType !== 'number-guess') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const trivia = pickTrivia(room.round);
  room.currentTrivia = trivia;
  room.playerGuesses = {};
  room.status = 'NUMBER_GUESSING';
  room.timeLeft = 12; // 12秒输入数字
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('number_new_trivia', {
    round: room.round,
    maxRounds: room.maxRounds,
    question: trivia.question,
    unit: trivia.unit,
    timeLimit: 12
  });

  io.to(room.id).emit('system_message', `🔢 第 ${room.round}/${room.maxRounds} 轮：${trivia.question}（输入你估算的数字）`);

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
 * 玩家提交盲猜数值
 */
function submitGuess(room, player, guessValue, io, broadcastRoom) {
  if (room.gameType !== 'number-guess' || room.status !== 'NUMBER_GUESSING') return;
  if (!room.currentTrivia) return;
  if (room.playerGuesses[player.token] !== undefined) return;

  const num = Number(guessValue);
  if (!Number.isFinite(num)) return;

  room.playerGuesses[player.token] = num;

  io.to(player.id).emit('number_guess_submitted', {
    guess: num
  });

  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allAnswered = activePlayers.every(p => room.playerGuesses[p.token] !== undefined);
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
  if (room.gameType !== 'number-guess') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'NUMBER_RESULT';

  const truth = room.currentTrivia ? room.currentTrivia.answer : 0;
  const submissions = room.players.map(p => ({
    playerId: p.id,
    playerToken: p.token,
    name: p.name,
    avatar: p.avatar,
    guess: room.playerGuesses[p.token]
  }));

  const evaluated = evaluateGuesses(submissions, truth);

  // 累加玩家总积分
  evaluated.forEach(item => {
    const p = room.players.find(pl => pl.token === item.playerToken);
    if (p && item.scoreGain > 0) {
      p.score = (p.score || 0) + item.scoreGain;
    }
  });

  io.to(room.id).emit('number_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    question: room.currentTrivia ? room.currentTrivia.question : '',
    truth: truth,
    unit: room.currentTrivia ? room.currentTrivia.unit : '',
    funFact: room.currentTrivia ? room.currentTrivia.funFact : '',
    rankings: evaluated.map(e => ({
      name: e.name,
      avatar: e.avatar,
      guess: e.guessNum,
      diff: e.diff === Infinity ? null : e.diff,
      scoreGain: e.scoreGain
    }))
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
  }, 4500);
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
  if (room.gameType !== 'number-guess') return;
  if (room.status === 'NUMBER_GUESSING') {
    const activePlayers = room.players.filter(p => !p.offlineTimer);
    if (activePlayers.length === 0) {
      clearInterval(room.timer);
      clearTimeout(room.roundTimeout);
      initRoomState(room);
      return;
    }
    const allAnswered = activePlayers.every(p => room.playerGuesses[p.token] !== undefined);
    if (allAnswered) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    }
  }
}

module.exports = {
  pickTrivia,
  evaluateGuesses,
  initRoomState,
  startGame,
  startRound,
  submitGuess,
  endRound,
  finishGame,
  onPlayerRemoved
};
