const { shuffle } = require('./shuffle');

const ANIMAL_TYPES = [
  { id: 'sheep', name: '绵羊', emoji: '🐑' },
  { id: 'chick', name: '小鸡', emoji: '🐥' },
  { id: 'duck', name: '小鸭', emoji: '🦆' },
  { id: 'rabbit', name: '小兔', emoji: '🐰' },
  { id: 'frog', name: '青蛙', emoji: '🐸' },
  { id: 'pig', name: '小猪', emoji: '🐷' },
  { id: 'cat', name: '小猫', emoji: '🐱' },
  { id: 'dog', name: '小狗', emoji: '🐶' },
  { id: 'penguin', name: '企鹅', emoji: '🐧' }
];

function initRoomState(room) {
  room.gameType = 'flash-counter';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.targetAnimal = null;
  room.targetCount = 0;
  room.options = [];
  room.flyingItems = [];
  room.playerAnswers = {}; // token -> { option, timeTaken, isCorrect }
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function generateRoundData(room) {
  const round = room.round || 1;
  // 动物种类数按轮次严格递增：第1轮2种，第2轮3种，第3轮4种...
  const totalSpecies = Math.min(ANIMAL_TYPES.length, round + 1);
  const shuffledAnimals = shuffle(ANIMAL_TYPES);

  const target = shuffledAnimals[0];
  const distractors = shuffledAnimals.slice(1, totalSpecies);

  // 目标动物数量梯度：第1轮 5-8 只，第2轮 7-10 只，第3轮 9-13 只
  const baseMin = 4 + round * 2;
  const baseMax = 6 + round * 3;
  const targetCount = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;

  const pool = [];
  // 放入目标动物
  for (let i = 0; i < targetCount; i++) {
    pool.push({ isTarget: true, emoji: target.emoji, name: target.name });
  }

  // 放入递增的干扰动物（每种干扰动物放 2~3 只）
  distractors.forEach(dist => {
    const distCount = Math.floor(Math.random() * 2) + 2; // 2~3 只
    for (let i = 0; i < distCount; i++) {
      pool.push({ isTarget: false, emoji: dist.emoji, name: dist.name });
    }
  });

  // 随机乱序池（Fisher-Yates 无偏洗牌）
  const orderedPool = shuffle(pool);

  // 5 条全屏独立跑道 (Y 轴等距分布：10%, 30%, 50%, 70%, 90%)
  const lanes = [0.10, 0.30, 0.50, 0.70, 0.90];
  const nextFreeTime = [0, 0, 0, 0, 0];
  const flyingItems = [];
  let waveBaseTime = 0.2;

  orderedPool.forEach((item, idx) => {
    // 寻找当前最空闲的跑道，杜绝同跑道拥挤重叠
    let minTrack = 0;
    for (let t = 1; t < 5; t++) {
      if (nextFreeTime[t] < nextFreeTime[minTrack]) minTrack = t;
    }

    const delay = Math.max(nextFreeTime[minTrack], waveBaseTime + (Math.random() * 0.35));
    // 奔跑耗时 2.4 ~ 2.8 秒横穿屏幕，平稳清晰
    const runDuration = 2.4 + (Math.random() * 0.4);
    const speed = 1 / runDuration;
    const laneY = lanes[minTrack];

    // 该跑道下一次入场必须间隔 1.3 秒以上，绝对不重叠
    nextFreeTime[minTrack] = delay + 1.3;
    waveBaseTime += 0.22;

    flyingItems.push({
      id: `animal_${idx}`,
      emoji: item.emoji,
      name: item.name,
      isTarget: item.isTarget,
      laneIndex: minTrack,
      laneY,
      speed,
      delay: parseFloat(delay.toFixed(2)),
      runDuration: parseFloat(runDuration.toFixed(2)),
      size: 44
    });
  });

  // 排序
  flyingItems.sort((a, b) => a.delay - b.delay);
  const maxEndTime = Math.max(...flyingItems.map(f => f.delay + f.runDuration));

  // 生成 4 个竞猜选项（含正确答案与相近的干扰项）
  const optionsSet = new Set([targetCount]);
  const offsets = [-3, -2, -1, 1, 2, 3, 4];
  for (const off of shuffle(offsets)) {
    const opt = targetCount + off;
    if (opt > 0) optionsSet.add(opt);
    if (optionsSet.size >= 4) break;
  }
  const options = Array.from(optionsSet).sort((a, b) => a - b);

  room.targetAnimal = target;
  room.targetCount = targetCount;
  room.options = options;
  room.flyingItems = flyingItems;
  room.speciesCount = totalSpecies;
  room.raceDuration = Math.ceil(maxEndTime * 1000) + 600; // 动画总耗时
  room.playerAnswers = {};
}

function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'flash-counter') return;
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

function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'flash-counter') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'FLASH_READY';
  room.timeLeft = 3;
  generateRoundData(room);

  broadcastRoom(room);
  io.to(room.id).emit('system_message', `👀 第 ${room.round}/${room.maxRounds} 轮：准备数【${room.targetAnimal.name}】！奔跑即将开始！`);
  io.to(room.id).emit('flash_round_ready', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetAnimal: room.targetAnimal
  });

  room.timer = setInterval(() => {
    if (room.gameType !== 'flash-counter') {
      clearInterval(room.timer);
      return;
    }
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startFlyingPhase(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function startFlyingPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'flash-counter') return;
  room.status = 'FLASH_FLYING';
  const durationMs = room.raceDuration || 7000;
  room.timeLeft = Math.ceil(durationMs / 1000);

  // 广播飞行动物列表给客户端渲染
  io.to(room.id).emit('flash_start_flying', {
    flyingItems: room.flyingItems,
    duration: durationMs
  });

  broadcastRoom(room);

  clearInterval(room.timer);
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'flash-counter' || room.status !== 'FLASH_FLYING') return;
    startGuessingPhase(room, io, broadcastRoom);
  }, durationMs + 200);
}

function startGuessingPhase(room, io, broadcastRoom) {
  if (room.gameType !== 'flash-counter') return;
  room.status = 'FLASH_GUESSING';
  room.timeLeft = 10;
  room.guessStartTime = Date.now();

  io.to(room.id).emit('flash_question', {
    targetAnimal: room.targetAnimal,
    options: room.options
  });

  io.to(room.id).emit('system_message', `❓ 刚才一共飞过了几只【${room.targetAnimal.emoji} ${room.targetAnimal.name}】？请抢答！`);
  broadcastRoom(room);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    if (room.gameType !== 'flash-counter') {
      clearInterval(room.timer);
      return;
    }
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitAnswer(room, playerToken, chosenOption, io, broadcastRoom) {
  if (room.status !== 'FLASH_GUESSING') return;
  if (room.playerAnswers[playerToken]) return; // 已作答
  // 校验提交者真实在房：防止被踢/已退出玩家的幽灵作答污染数据（审计 R2-40）
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  // 严格校验答案：必须是整数且在选项集内（parseInt 宽松解析会误判 '6abc' 类畸形值，审计 R2-41）
  const answerNum = Number(chosenOption);
  if (!Number.isInteger(answerNum) || !(room.options || []).includes(answerNum)) return;

  const timeTaken = Date.now() - (room.guessStartTime || Date.now());
  const isCorrect = (answerNum === room.targetCount);

  room.playerAnswers[playerToken] = {
    option: chosenOption,
    timeTaken,
    isCorrect
  };

  broadcastRoom(room);

  // 检查是否全员已作答
  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allAnswered = activePlayers.length > 0 && activePlayers.every(p => room.playerAnswers[p.token] !== undefined);
  if (allAnswered) {
    clearInterval(room.timer);
    endRound(room, io, broadcastRoom);
  }
}

function endRound(room, io, broadcastRoom) {
  if (room.gameType !== 'flash-counter') return;
  room.status = 'FLASH_ROUND_RESULT';
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  // 结算得分（正解 100 分，按答题速度额外奖励前三名 50/30/10 分）
  const correctAnswers = Object.entries(room.playerAnswers)
    .filter(([_, ans]) => ans.isCorrect)
    .sort((a, b) => a[1].timeTaken - b[1].timeTaken);

  correctAnswers.forEach(([token, ans], rank) => {
    const player = room.players.find(p => p.token === token);
    if (player) {
      const speedBonus = rank === 0 ? 50 : (rank === 1 ? 30 : 10);
      const points = 100 + speedBonus;
      player.score += points;
      ans.earnedScore = points;
    }
  });

  const answersSummary = room.players.map(p => {
    const ans = room.playerAnswers[p.token];
    return {
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      option: ans ? ans.option : '未作答',
      isCorrect: ans ? ans.isCorrect : false,
      timeTaken: ans ? (ans.timeTaken / 1000).toFixed(2) : '--',
      earnedScore: ans && ans.earnedScore ? ans.earnedScore : 0
    };
  });

  io.to(room.id).emit('flash_round_result', {
    targetAnimal: room.targetAnimal,
    targetCount: room.targetCount,
    answersSummary
  });

  io.to(room.id).emit('system_message', `🎯 正确答案是：【${room.targetCount}】只 ${room.targetAnimal.emoji}！`);
  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'flash-counter' || room.status !== 'FLASH_ROUND_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round++;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 4500);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('flash_game_over', {
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  return {
    gameType: 'flash-counter',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    targetAnimal: room.targetAnimal,
    options: room.options || [],
    // 飞行阶段把动物清单放进公共状态：中途加入/断线重连的玩家可补看动画（审计 R2-33）
    flyingItems: room.status === 'FLASH_FLYING' ? (room.flyingItems || []) : undefined,
    answeredTokens: Object.keys(room.playerAnswers || {})
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitAnswer
};
