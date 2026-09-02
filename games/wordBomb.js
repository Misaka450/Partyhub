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

function pickRuleMode() {
  const r = Math.random();
  if (r < 0.45) return 'ANY';
  if (r < 0.65) return 'START';
  if (r < 0.85) return 'END';
  return 'IDIOM';
}

function getRuleDesc(keyword, ruleMode) {
  if (ruleMode === 'START') return `必须以【${keyword}】开头！`;
  if (ruleMode === 'END') return `必须以【${keyword}】结尾！`;
  if (ruleMode === 'IDIOM') return `必须是包含【${keyword}】的四字成语！`;
  return `包含【${keyword}】的词语或成语！`;
}

function initRoomState(room) {
  room.gameType = 'word-bomb';
  room.status = 'LOBBY';
  // 持弹人改用 token 记录（数组下标会因玩家退出/被踢而漂移指向错误玩家，审计 R2-12）
  room.currentTurnToken = null;
  room.currentKeyword = '天';
  room.ruleMode = 'ANY';
  room.usedWords = new Set();
  room.playerLives = {}; // token -> lives (default 2)
  room.baseTime = 8;
  room.wbBaseTimeConfig = 8; // 开局时保存的原始引信配置，续爆时复用（审计 R2-38）
  room.timeLeft = 8;
  room.timeLeftPenalty = 0;
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

// 按 token 查找当前持弹人（token 不会因数组变动而失效）
function findCurrentPlayer(room) {
  if (!room.currentTurnToken) return null;
  return room.players.find(p => p.token === room.currentTurnToken) || null;
}

function startGame(room, io, broadcastRoom) {
  // 与其他引擎对齐：校验游戏类型，防止误调用（审计 R2-42）
  if (room.gameType !== 'word-bomb') return;
  if (room.players.length < 2) {
    io.to(room.id).emit('system_message', '成语/词汇炸弹至少需要 2 名玩家！');
    return;
  }

  room.usedWords = new Set();
  room.playerLives = {};
  // 生命值读取房间设置 wbLives（1~5 条），未配置则默认 2 条
  const lives = Math.min(5, Math.max(1, Number.isFinite(room.wbLives) && room.wbLives > 0 ? Math.round(room.wbLives) : 2));
  room.players.forEach(p => {
    room.playerLives[p.token] = lives;
  });

  // 持弹人随机起步（token 记录，退出不漂移，审计 R2-12）
  const starter = room.players[Math.floor(Math.random() * room.players.length)];
  room.currentTurnToken = starter.token;
  room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
  room.ruleMode = pickRuleMode();
  room.timeLeftPenalty = 0;
  room.status = 'BOMB_TICKING';
  // 基础引信时长读取房间设置 wbTime（4~30 秒），未配置则默认 8 秒
  room.baseTime = Math.min(30, Math.max(4, Number.isFinite(room.wbTime) && room.wbTime > 0 ? room.wbTime : 8));
  // 保存原始配置：爆炸后的新炸弹按房主配置重置，而不是硬编码 7.5 秒（审计 R2-38）
  room.wbBaseTimeConfig = room.baseTime;
  room.timeLeft = room.baseTime;
  room.winner = null;

  broadcastRoom(room);

  io.to(room.id).emit('system_message', `💣 词汇炸弹已点燃！规则：【${getRuleDesc(room.currentKeyword, room.ruleMode)}】当前持弹人：【${starter.name}】！`);

  startTurnTimer(room, io, broadcastRoom);
}

function startTurnTimer(room, io, broadcastRoom) {
  clearInterval(room.timer);
  room.timeLeft = Math.max(3, room.baseTime - (room.timeLeftPenalty || 0));
  room.timeLeftPenalty = 0; // 消耗惩罚
  room.turnStartAt = Date.now();

  const current = findCurrentPlayer(room);
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
  const current = findCurrentPlayer(room);
  if (!current || current.token !== playerToken) return;

  // 防御：客户端可能发送缺字段/非字符串数据，直接忽略防止崩溃
  if (typeof wordInput !== 'string') return;

  const word = wordInput.trim();
  if (word.length < 2) {
    io.to(current.id).emit('system_message', '⚠️ 词语长度至少为 2 个字！');
    return;
  }
  // 长度上限防御：防止超长字符串进入聊天广播与词库比对
  if (word.length > 12) {
    io.to(current.id).emit('system_message', '⚠️ 词语长度不能超过 12 个字！');
    return;
  }

  if (!word.includes(room.currentKeyword)) {
    io.to(current.id).emit('system_message', `⚠️ 必须包含关键字【${room.currentKeyword}】！`);
    return;
  }

  // 规则限定模式校验（首字/尾字/成语）
  if (room.ruleMode === 'START' && !word.startsWith(room.currentKeyword)) {
    io.to(current.id).emit('system_message', `⚠️ 本轮规则限制：必须以【${room.currentKeyword}】开头！`);
    return;
  }
  if (room.ruleMode === 'END' && !word.endsWith(room.currentKeyword)) {
    io.to(current.id).emit('system_message', `⚠️ 本轮规则限制：必须以【${room.currentKeyword}】结尾！`);
    return;
  }
  if (room.ruleMode === 'IDIOM' && word.length !== 4) {
    io.to(current.id).emit('system_message', `⚠️ 本轮规则限制：必须是包含【${room.currentKeyword}】的四字成语！`);
    return;
  }

  if (room.usedWords.has(word)) {
    io.to(current.id).emit('system_message', `⚠️ 词语【${word}】已被使用过！`);
    return;
  }

  // 词库有效性校验：词库为空（加载失败）时同样执行纯中文兜底校验
  if (!validWordSet.has(word)) {
    const isChineseOnly = /^[\u4e00-\u9fa5]{2,6}$/.test(word);
    if (!isChineseOnly) {
      io.to(current.id).emit('system_message', '⚠️ 请输入纯中文合法词语或成语！');
      return;
    }
  }

  const timeUsed = (Date.now() - (room.turnStartAt || Date.now())) / 1000;

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

  // 1. 神速作答加速甩锅：2.2 秒内答出，下家引信缩短 2 秒
  if (timeUsed <= 2.2) {
    room.timeLeftPenalty = 2.0;
    io.to(room.id).emit('system_message', `⚡ 【${current.name}】仅用时 ${timeUsed.toFixed(1)}s 神速答出！触发炸弹加速，下家引信扣减 2 秒！`);
  }

  // 2. 自发成语反弹：非强制成语模式下打出四字成语，炸弹方向反转
  let isReversed = false;
  if (word.length === 4 && room.ruleMode !== 'IDIOM') {
    isReversed = true;
    io.to(room.id).emit('system_message', `🔄 【${current.name}】打出高阶成语【${word}】！触发炸弹方向反转，原路反弹！`);
  }

  // 加快节奏并换题或换人
  room.baseTime = Math.max(4, room.baseTime - 0.2);
  if (Math.random() < 0.35) {
    room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    room.ruleMode = pickRuleMode();
    io.to(room.id).emit('system_message', `🔄 炸弹变异！新规则：【${getRuleDesc(room.currentKeyword, room.ruleMode)}】！`);
  }

  // 顺延到下一个活着的玩家
  advanceAliveTurn(room, isReversed);
  broadcastRoom(room);
  startTurnTimer(room, io, broadcastRoom);
}

// 顺延持弹人：按座位顺位找下一个活着的玩家，支持反向传递（反转炸弹）
function advanceAliveTurn(room, reverse = false) {
  const count = room.players.length;
  if (count === 0) return;
  const curIdx = room.players.findIndex(p => p.token === room.currentTurnToken);
  const start = curIdx >= 0 ? curIdx : -1;
  const step = reverse ? -1 : 1;
  for (let i = 1; i <= count; i++) {
    const p = room.players[(start + i * step + count * 10) % count];
    const lives = room.playerLives[p.token];
    if (lives === undefined || lives > 0) {
      room.currentTurnToken = p.token;
      return;
    }
  }
}

function explodeBomb(room, victim, io, broadcastRoom) {
  room.status = 'BOMB_EXPLODED';
  clearInterval(room.timer);

  // 防御：victim 可能已被移出房间（生命值条目不存在），按 0 处理
  room.playerLives[victim.token] = (room.playerLives[victim.token] || 0) - 1;
  const remainingLives = room.playerLives[victim.token];

  io.to(room.id).emit('system_message', `💥 BOOM！！！炸弹在【${victim.name}】手中爆炸！剩余生命值：${'❤️'.repeat(Math.max(0, remainingLives))}${remainingLives <= 0 ? '（已淘汰）' : ''}`);

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'word-bomb' || room.status !== 'BOMB_EXPLODED') return;
    // 幸存者在回调内实时计算（闭包快照会因 3.5 秒等待期内的玩家进出而失真，审计 R2-36）
    const alivePlayers = room.players.filter(p => (room.playerLives[p.token] || 0) > 0);
    if (alivePlayers.length <= 1) {
      // 0 幸存者时传 null 判平局，绝不让"刚爆炸的淘汰者"被判为胜者（审计 R2-36）
      endGame(room, alivePlayers[0] || null, io, broadcastRoom);
    } else {
      // 开启下一轮接力：引信按房主配置重置，而非硬编码 7.5（审计 R2-38）
      room.status = 'BOMB_TICKING';
      room.baseTime = room.wbBaseTimeConfig || 8;
      room.currentKeyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
      advanceAliveTurn(room);
      io.to(room.id).emit('system_message', `🔔 新炸弹点燃！关键字：【${room.currentKeyword}】！`);
      broadcastRoom(room);
      startTurnTimer(room, io, broadcastRoom);
    }
  }, 3500);
}

// 玩家被移除后的善后钩子：清理生命值并把炸弹交给下一位（审计 R2-02 / R2-12）。
// server.js 在 leave_room / kick / 掉线超时移除玩家后会调用本函数
function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  // 删除移除者的生命值条目，防止残留数据
  // （removedIndex 仅用于统一签名，本引擎持弹人按 token 追踪不受索引影响）
  if (room.status !== 'BOMB_TICKING') return;
  const count = room.players.length;
  if (count === 0) return;

  // 被移除的正是持弹人：炸弹顺延给下一个活着的玩家
  const current = findCurrentPlayer(room);
  if (!current) {
    advanceAliveTurn(room);
    const next = findCurrentPlayer(room);
    if (!next) return; // 无存活玩家，等待房间回收
    io.to(room.id).emit('system_message', `💣 持弹人离场，炸弹顺延给【${next.name}】！`);
  }

  // 旧计时器闭包持有已离场玩家（爆炸结算会找错人），必须换新计时器
  clearInterval(room.timer);
  broadcastRoom(room);
  startTurnTimer(room, io, broadcastRoom);
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
  const current = findCurrentPlayer(room);
  return {
    gameType: 'word-bomb',
    status: room.status,
    timeLeft: room.timeLeft,
    currentKeyword: room.currentKeyword,
    ruleMode: room.ruleMode || 'ANY',
    ruleDesc: getRuleDesc(room.currentKeyword, room.ruleMode || 'ANY'),
    currentTurnToken: current ? current.token : null,
    currentTurnName: current ? current.name : '',
    playerLives: room.playerLives || {}
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitWord,
  onPlayerRemoved
};
