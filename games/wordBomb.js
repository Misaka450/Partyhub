const fs = require('fs');
const path = require('path');

const KEYWORDS = [
  '天', '地', '人', '心', '水', '火', '山', '风', '月', '日',
  '金', '生', '一', '百', '千', '万', '龙', '虎', '鸟', '花',
  '春', '有', '无', '不', '出', '入', '同', '意', '大', '小'
];

let validWordSet = new Set();
try {
  const dictPath = path.join(__dirname, '../data/dictionary.json');
  if (fs.existsSync(dictPath)) {
    const list = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    list.forEach(w => validWordSet.add(w.trim()));
  }
  const wordsPath = path.join(__dirname, '../words.json');
  if (fs.existsSync(wordsPath)) {
    const wObj = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
    Object.values(wObj).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(w => validWordSet.add(w.trim()));
    });
  }
} catch (e) {
  console.error('加载成语/词库失败', e);
}

function initRoomState(room) {
  room.gameType = 'word-bomb';
  room.status = 'LOBBY';
  room.currentTurnIndex = 0;
  room.currentKeyword = '天';
  room.usedWords = new Set();
  room.playerLives = {}; // token -> lives (default 2)
  room.baseTime = 8;
  room.timeLeft = 8;
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  if (room.players.length < 2) {
    io.to(room.id).emit('system_message', '成语/词汇炸弹至少需要 2 名玩家！');
    return;
  }

  room.usedWords = new Set();
  room.playerLives = {};
  room.players.forEach(p => {
    room.playerLives[p.token] = 2; // 每人 2 条命
  });

  room.currentTurnIndex = Math.floor(Math.random() * room.players.length);
  room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
  room.status = 'BOMB_TICKING';
  room.baseTime = 8;
  room.timeLeft = 8;
  room.winner = null;

  broadcastRoom(room);

  const current = room.players[room.currentTurnIndex];
  io.to(room.id).emit('system_message', `💣 词汇炸弹已点燃！条件：输入包含【${room.currentKeyword}】的词语/成语！当前持弹人：【${current.name}】！`);

  startTurnTimer(room, io, broadcastRoom);
}

function startTurnTimer(room, io, broadcastRoom) {
  clearInterval(room.timer);
  room.timeLeft = Math.max(4, room.baseTime);

  const current = room.players[room.currentTurnIndex];
  if (!current) return;

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      explodeBomb(room, current, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitWord(room, playerToken, wordInput, io, broadcastRoom) {
  if (room.status !== 'BOMB_TICKING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;

  // 防御：客户端可能发送缺字段/非字符串数据，直接忽略防止崩溃
  if (typeof wordInput !== 'string') return;

  const word = wordInput.trim();
  if (word.length < 2) {
    io.to(current.id).emit('system_message', '⚠️ 词语长度至少为 2 个字！');
    return;
  }

  if (!word.includes(room.currentKeyword)) {
    io.to(current.id).emit('system_message', `⚠️ 必须包含关键字【${room.currentKeyword}】！`);
    return;
  }

  if (room.usedWords.has(word)) {
    io.to(current.id).emit('system_message', `⚠️ 词语【${word}】已被使用过！`);
    return;
  }

  // 词库有效性校验（如开启词库检查）
  if (validWordSet.size > 0 && !validWordSet.has(word)) {
    // 允许 4 字成语/合法词，如果是乱打字符则拦截
    const isChineseOnly = /^[\u4e00-\u9fa5]{2,6}$/.test(word);
    if (!isChineseOnly) {
      io.to(current.id).emit('system_message', '⚠️ 请输入纯中文合法词语或成语！');
      return;
    }
  }

  // 成功通过！
  room.usedWords.add(word);
  current.score += 40;
  clearInterval(room.timer);

  io.to(room.id).emit('chat_message', {
    type: 'correct',
    avatar: current.avatar,
    sender: current.name,
    text: `💥 打出【${word}】传递炸弹！（+40 分）`
  });

  // 加快节奏并换题或换人
  room.baseTime = Math.max(4, room.baseTime - 0.2);
  if (Math.random() < 0.35) {
    room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    io.to(room.id).emit('system_message', `🔄 炸弹变异！新关键字变为：【${room.currentKeyword}】！`);
  }

  // 顺延到下一个活着的玩家
  advanceAliveTurn(room);
  broadcastRoom(room);
  startTurnTimer(room, io, broadcastRoom);
}

function advanceAliveTurn(room) {
  const count = room.players.length;
  if (count === 0) return; // 防御：玩家全部退出时避免取模得到 NaN
  for (let i = 1; i <= count; i++) {
    const nextIdx = (room.currentTurnIndex + i) % count;
    const p = room.players[nextIdx];
    if (room.playerLives[p.token] > 0) {
      room.currentTurnIndex = nextIdx;
      return;
    }
  }
}

function explodeBomb(room, victim, io, broadcastRoom) {
  room.status = 'BOMB_EXPLODED';
  clearInterval(room.timer);

  room.playerLives[victim.token] -= 1;
  const remainingLives = room.playerLives[victim.token];

  io.to(room.id).emit('system_message', `💥 BOOM！！！炸弹在【${victim.name}】手中爆炸！剩余生命值：${'❤️'.repeat(Math.max(0, remainingLives))}${remainingLives === 0 ? '（已淘汰）' : ''}`);

  broadcastRoom(room);

  // 检查幸存人数
  const alivePlayers = room.players.filter(p => room.playerLives[p.token] > 0);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'word-bomb' || room.status !== 'BOMB_EXPLODED') return;
    if (alivePlayers.length <= 1) {
      endGame(room, alivePlayers[0] || victim, io, broadcastRoom);
    } else {
      // 开启下一轮接力
      room.status = 'BOMB_TICKING';
      room.baseTime = 7.5;
      room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
      advanceAliveTurn(room);
      io.to(room.id).emit('system_message', `🔔 新炸弹点燃！关键字：【${room.currentKeyword}】！`);
      broadcastRoom(room);
      startTurnTimer(room, io, broadcastRoom);
    }
  }, 3500);
}

function endGame(room, winner, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  if (winner) winner.score += 200;

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('word_bomb_game_over', {
    winnerName: winner ? winner.name : '平局',
    winnerAvatar: winner ? winner.avatar : '👑',
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  const current = room.players[room.currentTurnIndex];
  return {
    gameType: 'word-bomb',
    status: room.status,
    timeLeft: room.timeLeft,
    currentKeyword: room.currentKeyword,
    currentTurnToken: current ? current.token : null,
    currentTurnName: current ? current.name : '',
    playerLives: room.playerLives || {}
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitWord
};
