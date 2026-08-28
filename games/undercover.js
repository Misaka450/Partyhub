const fs = require('fs');
const path = require('path');
const { shuffle } = require('./shuffle');

let wordPairs = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, '../words_undercover.json'), 'utf8');
  wordPairs = JSON.parse(raw);
} catch (e) {
  wordPairs = [
    { civ: "牛奶", spy: "豆浆", cat: "food" },
    { civ: "微信", spy: "QQ", cat: "daily" },
    { civ: "小狗", spy: "小猫", cat: "animal" },
    { civ: "孙悟空", spy: "猪八戒", cat: "pop" },
    { civ: "降落伞", spy: "潜水艇", cat: "funny" }
  ];
}

function initRoomState(room) {
  room.gameType = 'undercover';
  room.status = 'LOBBY';
  room.spyCount = room.spyCount || 1;
  room.hasBlank = !!room.hasBlank;
  room.speakTime = room.speakTime || 45;
  room.categories = room.categories || ['food', 'daily', 'animal', 'pop', 'funny'];
  room.customPairs = room.customPairs || [];
  
  room.civWord = '';
  room.spyWord = '';
  room.currentPair = null;
  room.speechOrder = []; // player tokens/ids
  room.currentSpeakerIndex = 0;
  room.votes = {}; // voterToken -> targetToken
  room.pkPlayers = [];
  room.eliminatedPlayers = [];
  room.round = 1;
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function getPairPool(room) {
  let pool = [];
  const selectedCats = room.categories || ['food', 'daily', 'animal', 'pop', 'funny'];
  selectedCats.forEach(cat => {
    pool.push(...wordPairs.filter(p => p.cat === cat));
  });
  if (room.customPairs && room.customPairs.length > 0) {
    pool.push(...room.customPairs);
  }
  if (pool.length === 0) {
    pool = [...wordPairs];
  }
  return pool;
}

function startGame(room, io, broadcastRoom) {
  const totalPlayers = room.players.length;
  if (totalPlayers < 3) {
    io.to(room.id).emit('system_message', '谁是卧底至少需要 3 名玩家！');
    return;
  }

  // 自动校验卧底数（含下限防御：spyCount 至少为 1，防止 0/负数导致"无卧底秒结局"，审计 R2-32）
  let maxSpies = Math.max(1, Math.floor((totalPlayers - 1) / 2));
  if (room.hasBlank && maxSpies > 1 && totalPlayers < 6) {
    maxSpies = 1;
  }
  room.spyCount = Math.max(1, Math.min(room.spyCount || 1, maxSpies));

  // 选词对
  const pool = getPairPool(room);
  const pair = pool[Math.floor(Math.random() * pool.length)];
  // 随机分配谁是平民词谁是卧底词
  const swap = Math.random() > 0.5;
  room.civWord = swap ? pair.spy : pair.civ;
  room.spyWord = swap ? pair.civ : pair.spy;
  room.currentPair = pair;

  // 分配身份（Fisher-Yates 无偏洗牌，保证卧底/白板落位概率均匀）
  const shuffledPlayers = shuffle(room.players);
  
  let spiesAssigned = 0;
  let blankAssigned = 0;

  shuffledPlayers.forEach((p, idx) => {
    p.alive = true;
    p.hasSpoken = false;
    p.voteTarget = null;
    p.votesReceived = 0;
    
    if (spiesAssigned < room.spyCount) {
      p.role = 'undercover';
      p.word = room.spyWord;
      spiesAssigned++;
    } else if (room.hasBlank && blankAssigned < 1) {
      p.role = 'blank';
      p.word = '';
      blankAssigned++;
    } else {
      p.role = 'civilian';
      p.word = room.civWord;
    }
  });

  room.round = 1;
  room.winner = null;
  room.eliminatedPlayers = [];
  room.pkPlayers = [];
  room.status = 'UC_PREPARE'; // 准备查看底牌
  room.timeLeft = 8;

  broadcastRoom(room);

  // 单独给每个玩家发送私密身份
  room.players.forEach(p => {
    io.to(p.id).emit('uc_secret_role', {
      role: p.role,
      word: p.word
    });
  });

  io.to(room.id).emit('system_message', '🕵️ 身份与词语已下发！请点击查看你的底牌，防偷窥！');

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startSpeakingPhase(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function startSpeakingPhase(room, io, broadcastRoom, customOrder = null) {
  room.status = 'UC_SPEAKING';
  const alivePlayers = room.players.filter(p => p.alive);
  
  if (customOrder && customOrder.length > 0) {
    room.speechOrder = customOrder;
  } else {
    // 随机麦序（Fisher-Yates 无偏洗牌）
    room.speechOrder = shuffle(alivePlayers).map(p => p.token);
  }

  room.currentSpeakerIndex = 0;
  room.players.forEach(p => p.hasSpoken = false);

  nextSpeaker(room, io, broadcastRoom);
}

function nextSpeaker(room, io, broadcastRoom) {
  if (room.currentSpeakerIndex >= room.speechOrder.length) {
    // 全员发言完毕，进入投票阶段
    startVotingPhase(room, io, broadcastRoom);
    return;
  }

  const currentSpeakerToken = room.speechOrder[room.currentSpeakerIndex];
  const speaker = room.players.find(p => p.token === currentSpeakerToken);

  if (!speaker || !speaker.alive) {
    room.currentSpeakerIndex++;
    nextSpeaker(room, io, broadcastRoom);
    return;
  }

  room.timeLeft = room.speakTime || 45;
  broadcastRoom(room);

  io.to(room.id).emit('uc_speaker_turn', {
    speakerToken: speaker.token,
    speakerName: speaker.name,
    speakerAvatar: speaker.avatar,
    index: room.currentSpeakerIndex + 1,
    total: room.speechOrder.length
  });

  io.to(room.id).emit('system_message', `🎤 轮到【${speaker.name}】发言描述！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      finishCurrentSpeech(room, speaker.token, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function finishCurrentSpeech(room, speakerToken, io, broadcastRoom) {
  const currentSpeakerToken = room.speechOrder[room.currentSpeakerIndex];
  // 只有当前发言者本人才可结束发言（&& 是笔误，应为 ||，否则任一玩家可推进流程）
  if (speakerToken !== currentSpeakerToken || room.status !== 'UC_SPEAKING') return;

  const speaker = room.players.find(p => p.token === speakerToken);
  if (speaker) speaker.hasSpoken = true;

  clearInterval(room.timer);
  room.currentSpeakerIndex++;
  nextSpeaker(room, io, broadcastRoom);
}

function startVotingPhase(room, io, broadcastRoom) {
  room.status = 'UC_VOTING';
  room.timeLeft = 30;
  room.votes = {};
  room.players.forEach(p => {
    p.voteTarget = null;
    p.votesReceived = 0;
  });

  broadcastRoom(room);
  io.to(room.id).emit('system_message', '🗳️ 全员发言完毕，请投出你怀疑是卧底的玩家！');

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      tallyVotes(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function castVote(room, voterToken, targetToken, io, broadcastRoom) {
  if (room.status !== 'UC_VOTING') return;
  const voter = room.players.find(p => p.token === voterToken);
  if (!voter || !voter.alive) return;

  // 只能投给仍存活的候选玩家（或投弃权 ABSTAIN），防止废票/无效票被静默吞掉污染计票
  if (targetToken !== 'ABSTAIN') {
    const target = room.players.find(p => p.token === targetToken);
    if (!target || !target.alive) return;
  }

  room.votes[voterToken] = targetToken; // targetToken 可以是玩家token 或 'ABSTAIN'
  voter.voteTarget = targetToken;

  broadcastRoom(room);

  // 检查是否所有存活玩家都已投票
  const alivePlayers = room.players.filter(p => p.alive);
  const allVoted = alivePlayers.every(p => room.votes[p.token] !== undefined);

  if (allVoted) {
    clearInterval(room.timer);
    tallyVotes(room, io, broadcastRoom);
  }
}

function tallyVotes(room, io, broadcastRoom) {
  room.status = 'UC_VOTE_RESULT';
  clearInterval(room.timer);

  // 统计得票数
  const voteCounts = {};
  room.players.forEach(p => {
    p.votesReceived = 0;
    voteCounts[p.token] = 0;
  });

  Object.entries(room.votes).forEach(([voterToken, targetToken]) => {
    if (targetToken && targetToken !== 'ABSTAIN' && voteCounts[targetToken] !== undefined) {
      voteCounts[targetToken]++;
    }
  });

  room.players.forEach(p => {
    p.votesReceived = voteCounts[p.token] || 0;
  });

  // 找最高得票者（仅限存活玩家或PK玩家）
  const candidatePool = room.pkPlayers.length > 0
    ? room.players.filter(p => room.pkPlayers.includes(p.token) && p.alive)
    : room.players.filter(p => p.alive);

  let maxVotes = 0;
  let topCandidates = [];

  candidatePool.forEach(p => {
    const v = p.votesReceived;
    if (v > maxVotes) {
      maxVotes = v;
      topCandidates = [p];
    } else if (v === maxVotes && v > 0) {
      topCandidates.push(p);
    }
  });

  const voteDetails = room.players.filter(p => p.alive).map(p => ({
    token: p.token,
    name: p.name,
    avatar: p.avatar,
    votes: p.votesReceived,
    votedFor: room.votes[p.token]
  }));

  io.to(room.id).emit('uc_vote_result', {
    voteDetails,
    maxVotes,
    topCandidates: topCandidates.map(p => ({ token: p.token, name: p.name }))
  });

  // 判断是否平票
  if (topCandidates.length > 1 && maxVotes > 0) {
    if (room.pkPlayers.length === 0) {
      // 首次平票 -> 进入 PK 阶段
      room.pkPlayers = topCandidates.map(p => p.token);
      io.to(room.id).emit('system_message', `⚖️ 出现平票！【${topCandidates.map(p => p.name).join('、')}】进入 PK 发言阶段！`);
      clearTimeout(room.roundTimeout);
      room.roundTimeout = setTimeout(() => {
        if (room.gameType !== 'undercover' || room.status !== 'UC_VOTE_RESULT') return;
        startSpeakingPhase(room, io, broadcastRoom, room.pkPlayers);
      }, 3500);
      return;
    } else {
      // 再次平票 -> 本轮无人出局，直接下一轮
      room.pkPlayers = [];
      io.to(room.id).emit('system_message', '⚖️ 再次平票！本轮无人出局，直接进入下一轮发言！');
      clearTimeout(room.roundTimeout);
      room.roundTimeout = setTimeout(() => {
        if (room.gameType !== 'undercover' || room.status !== 'UC_VOTE_RESULT') return;
        room.round++;
        startSpeakingPhase(room, io, broadcastRoom);
      }, 4000);
      return;
    }
  }

  room.pkPlayers = [];

  if (topCandidates.length === 1 && maxVotes > 0) {
    const eliminated = topCandidates[0];
    eliminated.alive = false;
    room.eliminatedPlayers.push({
      token: eliminated.token,
      name: eliminated.name,
      avatar: eliminated.avatar,
      role: eliminated.role,
      round: room.round
    });

    const roleName = eliminated.role === 'undercover' ? '🕵️ 卧底' : (eliminated.role === 'blank' ? '⚪ 白板' : '🧑‍🌾 平民');
    io.to(room.id).emit('uc_player_eliminated', {
      token: eliminated.token,
      name: eliminated.name,
      role: eliminated.role,
      roleName
    });
    io.to(room.id).emit('system_message', `🚨 【${eliminated.name}】被投票出局！其实真实身份是：【${roleName}】！`);
  } else {
    io.to(room.id).emit('system_message', '🍃 全员弃票，本轮无人出局！');
  }

  broadcastRoom(room);

  // 胜利判定
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'undercover' || room.status !== 'UC_VOTE_RESULT') return;
    checkWinCondition(room, io, broadcastRoom);
  }, 4000);
}

function checkWinCondition(room, io, broadcastRoom) {
  const alivePlayers = room.players.filter(p => p.alive);
  const aliveSpies = alivePlayers.filter(p => p.role === 'undercover');
  const aliveCivs = alivePlayers.filter(p => p.role === 'civilian');
  const aliveBlanks = alivePlayers.filter(p => p.role === 'blank');

  let gameOver = false;
  let winReason = '';
  let winningTeam = '';

  if (aliveSpies.length === 0) {
    // 卧底全灭
    gameOver = true;
    winningTeam = 'civilians';
    winReason = '🎉 所有卧底已被全部找出，平民阵营大获全胜！';
  } else if (aliveSpies.length >= (aliveCivs.length + aliveBlanks.length)) {
    // 卧底人数 >= 好人+白板
    gameOver = true;
    winningTeam = 'undercovers';
    winReason = '😈 卧底人数已占优，卧底阵营取得最终胜利！';
  } else if (alivePlayers.length <= 2 && aliveBlanks.length > 0) {
    // 白板存活至决胜
    gameOver = true;
    winningTeam = 'blank';
    winReason = '⚪ 白板玩家成功隐藏并活到最后，获得绝地胜利！';
  }

  if (gameOver) {
    room.status = 'GAME_OVER';
    room.winner = winningTeam;
    clearInterval(room.timer);

    // 奖励积分
    room.players.forEach(p => {
      if (winningTeam === 'civilians' && p.role === 'civilian') p.score += 150;
      if (winningTeam === 'undercovers' && p.role === 'undercover') p.score += 200;
      if (winningTeam === 'blank' && p.role === 'blank') p.score += 250;
      if (p.alive) p.score += 50; // 存活加分
    });

    const allRoles = room.players.map(p => ({
      name: p.name,
      avatar: p.avatar,
      role: p.role,
      word: p.word,
      alive: p.alive
    }));

    io.to(room.id).emit('uc_game_over', {
      winningTeam,
      winReason,
      civWord: room.civWord,
      spyWord: room.spyWord,
      allRoles
    });

    broadcastRoom(room);
  } else {
    // 继续下一轮
    room.round++;
    io.to(room.id).emit('system_message', `🔔 进入第 ${room.round} 轮发言！`);
    startSpeakingPhase(room, io, broadcastRoom);
  }
}

function getPublicState(room) {
  const currentSpeakerToken = (room.speechOrder && room.speechOrder[room.currentSpeakerIndex]) || null;
  const currentSpeaker = room.players.find(p => p.token === currentSpeakerToken);

  return {
    gameType: 'undercover',
    status: room.status,
    round: room.round,
    timeLeft: room.timeLeft,
    spyCount: room.spyCount,
    hasBlank: room.hasBlank,
    speakTime: room.speakTime,
    currentSpeakerToken: currentSpeaker ? currentSpeaker.token : null,
    currentSpeakerName: currentSpeaker ? currentSpeaker.name : '',
    speechOrder: room.speechOrder || [],
    eliminatedPlayers: room.eliminatedPlayers || [],
    pkPlayers: room.pkPlayers || [],
    winner: room.winner
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  finishCurrentSpeech,
  castVote
};
