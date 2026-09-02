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
  const totalSpecies = Math.min(ANIMAL_TYPES.length, round + 2);
  const shuffledAnimals = shuffle(ANIMAL_TYPES);

  // 区分出场动物与未出场动物
  const presentSpecies = shuffledAnimals.slice(0, totalSpecies);
  const absentSpecies = shuffledAnimals.slice(totalSpecies);

  const animalCounts = {};
  presentSpecies.forEach(a => { animalCounts[a.id] = 0; });

  const target = presentSpecies[0];
  const distractors = presentSpecies.slice(1);

  // 目标动物数量
  const baseMin = 4 + round * 2;
  const baseMax = 6 + round * 3;
  const targetCount = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;

  const pool = [];
  for (let i = 0; i < targetCount; i++) {
    pool.push({ isTarget: true, id: target.id, emoji: target.emoji, name: target.name });
    animalCounts[target.id]++;
  }

  // 放入干扰动物
  distractors.forEach(dist => {
    const distCount = Math.floor(Math.random() * 3) + 2; // 2~4 只
    for (let i = 0; i < distCount; i++) {
      pool.push({ isTarget: false, id: dist.id, emoji: dist.emoji, name: dist.name });
      animalCounts[dist.id]++;
    }
  });

  const orderedPool = shuffle(pool);

  // 跑道计算
  const lanes = [0.10, 0.30, 0.50, 0.70, 0.90];
  const nextFreeTime = [0, 0, 0, 0, 0];
  const flyingItems = [];
  let waveBaseTime = 0.2;

  orderedPool.forEach((item, idx) => {
    let minTrack = 0;
    for (let t = 1; t < 5; t++) {
      if (nextFreeTime[t] < nextFreeTime[minTrack]) minTrack = t;
    }
    const delay = Math.max(nextFreeTime[minTrack], waveBaseTime + (Math.random() * 0.35));
    const runDuration = 2.4 + (Math.random() * 0.4);
    const speed = 1 / runDuration;
    const laneY = lanes[minTrack];

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

  flyingItems.sort((a, b) => a.delay - b.delay);
  const maxEndTime = Math.max(...flyingItems.map(f => f.delay + f.runDuration));

  // 决定本轮题型：COUNT (常规计数)、COMPARE (数量多寡对比)、ABSENT (未出场幽灵动物)
  let questionType = 'COUNT';
  let questionPrompt = '';
  let correctOption = null;
  let options = [];

  if (round === 2 && Math.random() < 0.6) {
    questionType = 'COMPARE';
  } else if (round >= 3) {
    const rType = Math.random();
    if (rType < 0.45) questionType = 'COMPARE';
    else if (rType < 0.85 && absentSpecies.length > 0) questionType = 'ABSENT';
    else questionType = 'COUNT';
  }

  if (questionType === 'COMPARE') {
    const a1 = presentSpecies[0];
    const a2 = presentSpecies[1];
    const c1 = animalCounts[a1.id];
    const c2 = animalCounts[a2.id];
    questionPrompt = `【${a1.emoji}${a1.name}】与【${a2.emoji}${a2.name}】谁出现得更多？`;
    if (c1 > c2) correctOption = `${a1.emoji} ${a1.name}多`;
    else if (c2 > c1) correctOption = `${a2.emoji} ${a2.name}多`;
    else correctOption = '🤝 一样多';
    options = [`${a1.emoji} ${a1.name}多`, `${a2.emoji} ${a2.name}多`, '🤝 一样多'];
  } else if (questionType === 'ABSENT') {
    const ghost = absentSpecies[Math.floor(Math.random() * absentSpecies.length)];
    const seenPicks = shuffle(presentSpecies).slice(0, 3);
    questionPrompt = `刚才奔跑中，哪种动物【完全没有出现】？`;
    correctOption = `${ghost.emoji} ${ghost.name}`;
    options = shuffle([correctOption, ...seenPicks.map(p => `${p.emoji} ${p.name}`)]);
  } else {
    // 常规计数
    questionPrompt = `刚才一共飞过了几只【${target.emoji} ${target.name}】？`;
    correctOption = targetCount;
    const optionsSet = new Set([targetCount]);
    const offsets = [-3, -2, -1, 1, 2, 3, 4];
    for (const off of shuffle(offsets)) {
      const opt = targetCount + off;
      if (opt > 0) optionsSet.add(opt);
      if (optionsSet.size >= 4) break;
    }
    options = Array.from(optionsSet).sort((a, b) => a - b);
  }

  room.questionType = questionType;
  room.questionPrompt = questionPrompt;
  room.correctOption = correctOption;
  room.targetAnimal = target;
  room.targetCount = targetCount;
  room.options = options;
  room.flyingItems = flyingItems;
  room.speciesCount = totalSpecies;
  room.raceDuration = Math.ceil(maxEndTime * 1000) + 600;
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
  const readyTip = room.questionType === 'COMPARE'
    ? '【突袭对比题】请留心观察各动物的出现多寡！'
    : (room.questionType === 'ABSENT' ? '【突袭幽灵题】请仔细辨认有哪些动物登场！' : `准备数【${room.targetAnimal.name}】！`);
  io.to(room.id).emit('system_message', `👀 第 ${room.round}/${room.maxRounds} 轮：${readyTip}奔跑即将开始！`);
  io.to(room.id).emit('flash_round_ready', {
    round: room.round,
    maxRounds: room.maxRounds,
    questionType: room.questionType,
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
    questionType: room.questionType,
    questionPrompt: room.questionPrompt,
    targetAnimal: room.targetAnimal,
    options: room.options
  });

  io.to(room.id).emit('system_message', `❓ ${room.questionPrompt} 请抢答！`);
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
  // 校验提交者真实在房
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  // 校验答案：支持数字或字符选项
  const isOptionValid = (room.options || []).some(opt => String(opt) === String(chosenOption));
  if (!isOptionValid) return;

  const timeTaken = Date.now() - (room.guessStartTime || Date.now());
  const isCorrect = String(chosenOption) === String(room.correctOption);

  room.playerAnswers[playerToken] = {
    option: chosenOption,
    timeTaken,
    isCorrect
  };

  broadcastRoom(room);

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

  // 答错扣 30 分
  Object.entries(room.playerAnswers)
    .filter(([_, ans]) => !ans.isCorrect)
    .forEach(([token, ans]) => {
      const player = room.players.find(p => p.token === token);
      if (player) {
        player.score = Math.max(0, player.score - 30);
        ans.earnedScore = -30;
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
    questionType: room.questionType,
    questionPrompt: room.questionPrompt,
    correctOption: room.correctOption,
    targetAnimal: room.targetAnimal,
    targetCount: room.targetCount,
    answersSummary
  });

  io.to(room.id).emit('system_message', `🎯 正确答案是：【${room.correctOption}】！`);
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
  submitAnswer,
  generateRoundData
};
