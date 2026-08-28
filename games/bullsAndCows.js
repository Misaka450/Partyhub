const { shuffle } = require('./shuffle');

function generateSecretCode() {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  // Fisher-Yates 无偏洗牌，保证 4 位暗号的每种组合等概率出现
  return shuffle(digits).slice(0, 4).join('');
}

function evaluateGuess(secret, guess) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 4; i++) {
    if (guess[i] === secret[i]) {
      a++;
    } else if (secret.includes(guess[i])) {
      b++;
    }
  }
  return { a, b };
}

function initRoomState(room) {
  room.gameType = 'bulls-and-cows';
  room.status = 'LOBBY';
  room.secretCode = '';
  room.playerGuesses = {}; // token -> [{ guess, a, b, time }]
  room.winner = null;
  // 竞速总时长读取房间设置 bcTime（30~600 秒），房主未配置则默认 120 秒
  room.maxTime = Math.min(600, Math.max(30, Number.isFinite(room.bcTime) && room.bcTime > 0 ? Math.round(room.bcTime) : 120));
  room.timeLeft = room.maxTime;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  if (room.players.length < 1) {
    io.to(room.id).emit('system_message', '至少需要 1 名玩家开始游戏！');
    return;
  }

  room.secretCode = generateSecretCode();
  room.playerGuesses = {};
  room.players.forEach(p => {
    room.playerGuesses[p.token] = [];
  });
  room.winner = null;
  room.status = 'BC_PLAYING';
  room.timeLeft = room.maxTime;

  broadcastRoom(room);
  io.to(room.id).emit('bc_game_start');
  io.to(room.id).emit('system_message', '🔢 密码破解大师已启动！暗号为 4 位互不重复数字（0~9）。最快破解 4A0B 者胜！');

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endGame(room, null, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitGuess(room, playerToken, guessStr, io, broadcastRoom) {
  if (room.status !== 'BC_PLAYING') return;
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  // 防御：客户端可能发送缺字段/非字符串数据，直接忽略防止崩溃
  if (typeof guessStr !== 'string') return;

  const guess = guessStr.trim();
  if (guess.length !== 4 || !/^\d{4}$/.test(guess)) {
    return;
  }
  // 检查数字是否重复
  if (new Set(guess.split('')).size !== 4) {
    io.to(player.id).emit('system_message', '⚠️ 猜想的 4 位数字必须互不重复！');
    return;
  }

  const { a, b } = evaluateGuess(room.secretCode, guess);
  if (!room.playerGuesses[playerToken]) room.playerGuesses[playerToken] = [];

  const record = { guess, a, b, time: Date.now() };
  room.playerGuesses[playerToken].push(record);

  // 单独把最新反馈发给该玩家
  io.to(player.id).emit('bc_guess_result', {
    guess,
    a,
    b,
    history: room.playerGuesses[playerToken]
  });

  // 公共广播该玩家提交了第几次猜想（只报次数，不泄露猜测数字与 a/b 反馈，
  // 防止其他玩家蹭用他人结果加速破译）
  const attemptCount = room.playerGuesses[playerToken].length;
  io.to(room.id).emit('system_message', `🔍 【${player.name}】进行了第 ${attemptCount} 次破译！`);

  broadcastRoom(room);

  // 检查是否完全命中 4A0B
  if (a === 4) {
    clearInterval(room.timer);
    player.score += Math.max(100, 300 - (attemptCount - 1) * 20);
    room.winner = player;
    endGame(room, player, io, broadcastRoom);
  }
}

function endGame(room, winner, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const standings = room.players.map(p => ({
    name: p.name,
    avatar: p.avatar,
    token: p.token,
    attempts: (room.playerGuesses[p.token] || []).length,
    solved: winner && winner.token === p.token,
    score: p.score
  })).sort((a, b) => (a.solved ? -1 : 1) || (a.attempts - b.attempts));

  io.to(room.id).emit('bc_game_over', {
    secretCode: room.secretCode,
    winnerName: winner ? winner.name : '无人解出',
    winnerAvatar: winner ? winner.avatar : '🔒',
    standings
  });

  io.to(room.id).emit('system_message', `🎉 密码揭晓！正确密码是【${room.secretCode}】！${winner ? `破解王者为【${winner.name}】！` : '时间到，无人破解！'}`);
  broadcastRoom(room);
}

function getPublicState(room) {
  return {
    gameType: 'bulls-and-cows',
    status: room.status,
    timeLeft: room.timeLeft,
    // 注意：不广播 playerGuesses（各玩家猜测历史与 a/b 结果为私有信息，
    // 重连恢复通过 join_room 时私发 bc_guess_result 实现）
    playerAttemptCounts: room.players.map(p => ({
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      attempts: (room.playerGuesses[p.token] || []).length
    })),
    winner: room.winner ? { name: room.winner.name, avatar: room.winner.avatar } : null
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitGuess,
  evaluateGuess
};
