const { shuffle } = require('./shuffle');

const QUEST_CONFIGS = {
  5: { good: 3, evil: 2, quests: [2, 3, 2, 3, 3], failsRequired: [1, 1, 1, 1, 1] },
  6: { good: 4, evil: 2, quests: [2, 3, 4, 3, 4], failsRequired: [1, 1, 1, 1, 1] },
  7: { good: 4, evil: 3, quests: [2, 3, 3, 4, 4], failsRequired: [1, 1, 1, 2, 1] },
  8: { good: 5, evil: 3, quests: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] },
  9: { good: 6, evil: 3, quests: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] },
  10: { good: 6, evil: 4, quests: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] }
};

const ROLE_INFO = {
  merlin: { name: '梅林', side: 'good', desc: '知晓所有邪恶玩家（莫德雷德除外），但需隐藏自己防被刺杀' },
  percival: { name: '派西维尔', side: 'good', desc: '能看到两人（梅林与莫甘娜），但分不清真假' },
  servant: { name: '亚瑟忠臣', side: 'good', desc: '正义阵营基石，用逻辑与投票保卫亚瑟王' },
  assassin: { name: '刺客', side: 'evil', desc: '邪恶主力，若好人完成三局任务，可指认并刺杀梅林逆转' },
  morgana: { name: '莫甘娜', side: 'evil', desc: '假扮梅林，在派西维尔眼里呈现为梅林候选人' },
  mordred: { name: '莫德雷德', side: 'evil', desc: '邪恶大首领，在梅林眼中隐身显示为普通人' },
  oberon: { name: '奥伯伦', side: 'evil', desc: '孤狼邪恶角色，看不到同伙，同伙也看不到他' },
  minion: { name: '莫德雷德爪牙', side: 'evil', desc: '邪恶阵营成员，与同伙配合阻碍任务' }
};

function initRoomState(room) {
  room.gameType = 'avalon';
  room.status = 'LOBBY';
  room.usePercivalMorgana = true;
  room.useMordred = false;
  room.useOberon = false;
  if (room.speechMode === undefined) room.speechMode = 'online';
  if (room.speechDuration === undefined) room.speechDuration = 60;
  room.speechOrder = [];
  room.currentSpeakerIndex = 0;
  
  room.questHistory = []; // [{ round: 1, team: [], votes: {}, questCards: [], success: true, failsCount: 0 }]
  room.currentQuestIndex = 0; // 0..4
  room.rejectTrack = 0; // 0..5 (5 -> evil wins)
  room.leaderIndex = 0;
  room.selectedTeam = []; // player tokens
  room.teamVotes = {}; // token -> boolean (true=approve, false=reject)
  room.questVotes = {}; // token -> boolean (true=success, false=fail)
  room.assassinTarget = null;
  room.winner = null;
  room.winReason = '';
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  const count = room.players.length;
  if (count < 5 || count > 10) {
    io.to(room.id).emit('system_message', '阿瓦隆支持 5 ~ 10 名玩家！当前人数不符。');
    return;
  }

  const config = QUEST_CONFIGS[count];
  const goodCount = config.good;
  const evilCount = config.evil;

  // 分配角色
  let goodRoles = ['merlin'];
  if (room.usePercivalMorgana && goodCount >= 2) {
    goodRoles.push('percival');
  }
  while (goodRoles.length < goodCount) {
    goodRoles.push('servant');
  }

  let evilRoles = ['assassin'];
  if (room.usePercivalMorgana && evilCount >= 2) {
    evilRoles.push('morgana');
  }
  if (room.useMordred && evilRoles.length < evilCount) {
    evilRoles.push('mordred');
  }
  if (room.useOberon && evilRoles.length < evilCount) {
    evilRoles.push('oberon');
  }
  while (evilRoles.length < evilCount) {
    evilRoles.push('minion');
  }

  // Fisher-Yates 无偏洗牌：保证角色与玩家的配对完全均匀
  const allRoles = shuffle([...goodRoles, ...evilRoles]);
  const shuffledPlayers = shuffle(room.players);

  shuffledPlayers.forEach((p, i) => {
    p.avalonRole = allRoles[i];
    p.avalonSide = ROLE_INFO[p.avalonRole].side;
  });

  room.questHistory = [null, null, null, null, null];
  room.currentQuestIndex = 0;
  room.rejectTrack = 0;
  room.leaderIndex = Math.floor(Math.random() * room.players.length);
  room.selectedTeam = [];
  room.teamVotes = {};
  room.questVotes = {};
  room.assassinTarget = null;
  room.winner = null;
  room.winReason = '';
  room.status = 'AVALON_ROLE_REVEAL';
  room.timeLeft = 10;

  broadcastRoom(room);

  // 下发专属夜晚视野
  room.players.forEach(player => {
    const role = player.avalonRole;
    let seenInfo = [];

    if (role === 'merlin') {
      // 梅林看到所有坏人（莫德雷德除外）
      const evilSeen = room.players
        .filter(p => p.avalonSide === 'evil' && p.avalonRole !== 'mordred')
        .map(p => ({ token: p.token, name: p.name, avatar: p.avatar, tag: '邪恶阵营' }));
      seenInfo = evilSeen;
    } else if (role === 'percival') {
      // 派西维尔看到梅林和莫甘娜（分不清）
      const candidates = shuffle(room.players.filter(p => p.avalonRole === 'merlin' || p.avalonRole === 'morgana'))
        .map(p => ({ token: p.token, name: p.name, avatar: p.avatar, tag: '梅林候选人' }));
      seenInfo = candidates;
    } else if (player.avalonSide === 'evil' && role !== 'oberon') {
      // 坏人互看（奥伯伦除外）
      const evilTeammates = room.players
        .filter(p => p.avalonSide === 'evil' && p.avalonRole !== 'oberon' && p.token !== player.token)
        .map(p => ({ token: p.token, name: p.name, avatar: p.avatar, tag: `${ROLE_INFO[p.avalonRole].name}` }));
      seenInfo = evilTeammates;
    }

    io.to(player.id).emit('avalon_secret_role', {
      role: player.avalonRole,
      roleName: ROLE_INFO[player.avalonRole].name,
      side: player.avalonSide,
      desc: ROLE_INFO[player.avalonRole].desc,
      seenInfo
    });
  });

  io.to(room.id).emit('system_message', '👑 命运石板已镌刻！各位亚瑟骑士与邪恶爪牙已睁眼感知身份！');

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startTeamPropose(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function startTeamPropose(room, io, broadcastRoom) {
  room.status = 'AVALON_TEAM_PROPOSE';
  room.selectedTeam = [];
  room.teamVotes = {};
  room.questVotes = {};

  const leader = room.players[room.leaderIndex];
  const count = room.players.length;
  const config = QUEST_CONFIGS[count];
  const requiredCount = config.quests[room.currentQuestIndex];

  room.timeLeft = 60;
  broadcastRoom(room);

  io.to(room.id).emit('system_message', `👑 队长【${leader.name}】正在挑选 ${requiredCount} 名远征队员（任务 ${room.currentQuestIndex + 1}/5，流产追踪 ${room.rejectTrack}/5）`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      // 队长超时自动随机凑齐队伍提交
      if (room.selectedTeam.length < requiredCount) {
        const remaining = room.players.map(p => p.token).filter(t => !room.selectedTeam.includes(t));
        while (room.selectedTeam.length < requiredCount && remaining.length > 0) {
          room.selectedTeam.push(remaining.shift());
        }
      }
      submitTeam(room, leader.token, room.selectedTeam, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function selectTeamMember(room, leaderToken, memberToken, io, broadcastRoom) {
  const leader = room.players[room.leaderIndex];
  if (!leader || leader.token !== leaderToken || room.status !== 'AVALON_TEAM_PROPOSE') return;

  const count = room.players.length;
  const requiredCount = QUEST_CONFIGS[count].quests[room.currentQuestIndex];

  const idx = room.selectedTeam.indexOf(memberToken);
  if (idx >= 0) {
    room.selectedTeam.splice(idx, 1);
  } else {
    if (room.selectedTeam.length < requiredCount) {
      room.selectedTeam.push(memberToken);
    }
  }
  broadcastRoom(room);
}

function submitTeam(room, leaderToken, teamTokens, io, broadcastRoom) {
  const leader = room.players[room.leaderIndex];
  if (!leader || leader.token !== leaderToken || room.status !== 'AVALON_TEAM_PROPOSE') return;

  const count = room.players.length;
  const requiredCount = QUEST_CONFIGS[count].quests[room.currentQuestIndex];

  if (!Array.isArray(teamTokens) || teamTokens.length !== requiredCount) return;
  // 校验队员 token 都真实存在且不重复，防止伪造/重复成员操纵任务结果
  const uniqueTokens = new Set(teamTokens);
  if (uniqueTokens.size !== requiredCount) return;
  for (const t of uniqueTokens) {
    if (!room.players.some(p => p.token === t)) return;
  }

  room.selectedTeam = teamTokens;
  const teamNames = room.players.filter(p => room.selectedTeam.includes(p.token)).map(p => p.name).join('、');

  if (room.speechMode === 'offline') {
    // 线下自由模式：直接开启表决
    startTeamVotePhase(room, io, broadcastRoom);
  } else {
    // 线上麦序模式：按顺时针轮流发言，队长最后总结发言
    const numPlayers = room.players.length;
    const order = [];
    for (let i = 1; i <= numPlayers; i++) {
      const idx = (room.leaderIndex + i) % numPlayers;
      order.push(room.players[idx].token);
    }
    room.speechOrder = order;
    room.currentSpeakerIndex = 0;
    io.to(room.id).emit('system_message', `⚔️ 队长提议队伍【${teamNames}】！进入全员轮流麦序发言阶段！`);
    startSpeakerTurn(room, io, broadcastRoom);
  }
}

function startSpeakerTurn(room, io, broadcastRoom) {
  if (room.currentSpeakerIndex >= room.speechOrder.length) {
    startTeamVotePhase(room, io, broadcastRoom);
    return;
  }

  const currentSpeakerToken = room.speechOrder[room.currentSpeakerIndex];
  const speaker = room.players.find(p => p.token === currentSpeakerToken);
  if (!speaker) {
    room.currentSpeakerIndex += 1;
    startSpeakerTurn(room, io, broadcastRoom);
    return;
  }

  room.status = 'AVALON_SPEECH';
  room.timeLeft = room.speechDuration || 60;
  broadcastRoom(room);

  io.to(room.id).emit('system_message', `🎤 轮到【${speaker.name}】发言（麦序 ${room.currentSpeakerIndex + 1}/${room.speechOrder.length}，限时 ${room.timeLeft}s）！`);

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
  if (room.status !== 'AVALON_SPEECH') return;
  const currentSpeakerToken = room.speechOrder[room.currentSpeakerIndex];
  if (speakerToken !== currentSpeakerToken) return;

  clearInterval(room.timer);
  room.currentSpeakerIndex += 1;

  if (room.currentSpeakerIndex < room.speechOrder.length) {
    startSpeakerTurn(room, io, broadcastRoom);
  } else {
    io.to(room.id).emit('system_message', '🎙️ 全员发言完毕！进入组队公投表决阶段！');
    startTeamVotePhase(room, io, broadcastRoom);
  }
}

function startTeamVotePhase(room, io, broadcastRoom) {
  room.status = 'AVALON_TEAM_VOTE';
  room.teamVotes = {};
  room.timeLeft = 30;
  broadcastRoom(room);

  const teamNames = room.players.filter(p => room.selectedTeam.includes(p.token)).map(p => p.name).join('、');
  io.to(room.id).emit('system_message', `⚔️ 请全员投票表决是否赞成队伍【${teamNames}】出发！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      tallyTeamVotes(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function castTeamVote(room, voterToken, approve, io, broadcastRoom) {
  if (room.status !== 'AVALON_TEAM_VOTE') return;
  const voter = room.players.find(p => p.token === voterToken);
  if (!voter) return;

  room.teamVotes[voterToken] = !!approve;
  broadcastRoom(room);

  if (Object.keys(room.teamVotes).length >= room.players.length) {
    clearInterval(room.timer);
    tallyTeamVotes(room, io, broadcastRoom);
  }
}

function tallyTeamVotes(room, io, broadcastRoom) {
  room.status = 'AVALON_TEAM_VOTE_RESULT';
  clearInterval(room.timer);

  let approves = 0;
  let rejects = 0;

  const voteDetails = room.players.map(p => {
    // 说明：未在限时内投票的玩家默认视为“反对”（超时按反对处理），符合阿瓦隆桌游常见节奏
    const v = room.teamVotes[p.token] !== undefined ? room.teamVotes[p.token] : false;
    if (v) approves++; else rejects++;
    return { token: p.token, name: p.name, avatar: p.avatar, approve: v };
  });

  const passed = approves > rejects;

  io.to(room.id).emit('avalon_team_vote_result', {
    passed,
    approves,
    rejects,
    voteDetails
  });

  if (passed) {
    room.rejectTrack = 0;
    io.to(room.id).emit('system_message', `🛡️ 组队表决通过（赞成 ${approves} : 反对 ${rejects}）！远征队正式启程！`);
    broadcastRoom(room);

    clearTimeout(room.roundTimeout);
    room.roundTimeout = setTimeout(() => {
      if (room.gameType !== 'avalon' || room.status !== 'AVALON_TEAM_VOTE_RESULT') return;
      startQuestPhase(room, io, broadcastRoom);
    }, 4000);
  } else {
    room.rejectTrack += 1;
    io.to(room.id).emit('system_message', `❌ 组队表决未通过（赞成 ${approves} : 反对 ${rejects}）！流产追踪 +1 (${room.rejectTrack}/5)`);
    broadcastRoom(room);

    if (room.rejectTrack >= 5) {
      clearTimeout(room.roundTimeout);
      room.roundTimeout = setTimeout(() => {
        if (room.gameType !== 'avalon' || room.status !== 'AVALON_TEAM_VOTE_RESULT') return;
        room.winner = 'evil';
        room.winReason = '👿 连续 5 次组队失败流产，邪恶阵营直接接管王国！';
        endGame(room, io, broadcastRoom);
      }, 3500);
      return;
    }

    clearTimeout(room.roundTimeout);
    room.roundTimeout = setTimeout(() => {
      if (room.gameType !== 'avalon' || room.status !== 'AVALON_TEAM_VOTE_RESULT') return;
      room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
      startTeamPropose(room, io, broadcastRoom);
    }, 4000);
  }
}

function startQuestPhase(room, io, broadcastRoom) {
  room.status = 'AVALON_QUEST_VOTE';
  room.questVotes = {};
  room.timeLeft = 25;

  broadcastRoom(room);

  io.to(room.id).emit('system_message', '🗡️ 远征队员请暗中提交任务执行卡（好人只能投成功，坏人可投成功或失败）！');

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      tallyQuestVotes(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function castQuestVote(room, memberToken, isSuccess, io, broadcastRoom) {
  if (room.status !== 'AVALON_QUEST_VOTE') return;
  if (!room.selectedTeam.includes(memberToken)) return;

  const player = room.players.find(p => p.token === memberToken);
  if (!player) return;

  // 正义阵营只能投成功
  let finalVote = isSuccess;
  if (player.avalonSide === 'good') {
    finalVote = true;
  }

  room.questVotes[memberToken] = finalVote;
  broadcastRoom(room);

  if (Object.keys(room.questVotes).length >= room.selectedTeam.length) {
    clearInterval(room.timer);
    tallyQuestVotes(room, io, broadcastRoom);
  }
}

function tallyQuestVotes(room, io, broadcastRoom) {
  room.status = 'AVALON_QUEST_RESULT';
  clearInterval(room.timer);

  const count = room.players.length;
  const config = QUEST_CONFIGS[count];
  const requiredFails = config.failsRequired[room.currentQuestIndex];

  let failsCount = 0;
  let successCount = 0;

  room.selectedTeam.forEach(t => {
    const v = room.questVotes[t] !== undefined ? room.questVotes[t] : true;
    if (!v) failsCount++; else successCount++;
  });

  const cards = [];
  for (let i = 0; i < successCount; i++) cards.push('SUCCESS');
  for (let i = 0; i < failsCount; i++) cards.push('FAIL');
  // 打乱牌序保证匿名（Fisher-Yates 无偏洗牌）
  const shuffledCards = shuffle(cards);

  const questPassed = failsCount < requiredFails;

  room.questHistory[room.currentQuestIndex] = {
    round: room.currentQuestIndex + 1,
    success: questPassed,
    successCount,
    failsCount,
    shuffledCards,
    requiredFails,
    team: [...room.selectedTeam]
  };

  io.to(room.id).emit('avalon_quest_result', {
    questIndex: room.currentQuestIndex,
    questPassed,
    successCount,
    failsCount,
    shuffledCards,
    requiredFails
  });

  if (questPassed) {
    io.to(room.id).emit('system_message', `🏆 任务 ${room.currentQuestIndex + 1} 成功！正义阵营点亮蓝圣杯！（${failsCount} 张失败卡）`);
  } else {
    io.to(room.id).emit('system_message', `💥 任务 ${room.currentQuestIndex + 1} 失败！邪恶阵营点亮红圣杯！（${failsCount} 张失败卡，需要 ${requiredFails} 张）`);
  }

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'avalon' || room.status !== 'AVALON_QUEST_RESULT') return;
    checkAvalonWin(room, io, broadcastRoom);
  }, 4500);
}

function checkAvalonWin(room, io, broadcastRoom) {
  let goodWins = 0;
  let evilWins = 0;

  room.questHistory.forEach(q => {
    if (q) {
      if (q.success) goodWins++; else evilWins++;
    }
  });

  if (evilWins >= 3) {
    room.winner = 'evil';
    room.winReason = '😈 邪恶阵营成功破坏 3 个远征任务，取得压倒性胜利！';
    endGame(room, io, broadcastRoom);
    return;
  }

  if (goodWins >= 3) {
    // 好人集齐 3 个蓝圣杯，进入刺杀阶段！
    startAssassinPhase(room, io, broadcastRoom);
    return;
  }

  // 继续下一轮任务
  room.currentQuestIndex += 1;
  room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
  startTeamPropose(room, io, broadcastRoom);
}

function startAssassinPhase(room, io, broadcastRoom) {
  room.status = 'AVALON_ASSASSIN';
  room.timeLeft = 45;

  const assassin = room.players.find(p => p.avalonRole === 'assassin') || room.players.find(p => p.avalonSide === 'evil');

  broadcastRoom(room);
  io.to(room.id).emit('system_message', `🗡️ 好人已达成 3 胜！刺客【${assassin ? assassin.name : '邪恶代表'}】正在进行绝命刺杀！找出真正的梅林即可逆转获胜！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      // 刺客超时：实时重新查找刺客（阶段开始时的快照可能已因掉线被移出房间），
      // 找不到任何邪恶玩家则直接判好人胜，避免刺杀阶段永久卡死
      const liveAssassin = room.players.find(p => p.avalonRole === 'assassin')
        || room.players.find(p => p.avalonSide === 'evil');
      const goodPlayers = room.players.filter(p => p.avalonSide === 'good');
      if (goodPlayers.length === 0 || !liveAssassin) {
        room.winner = 'good';
        room.winReason = '🕊️ 刺客缺席，正义阵营获得最终胜利！';
        endGame(room, io, broadcastRoom);
        return;
      }
      const target = goodPlayers[Math.floor(Math.random() * goodPlayers.length)];
      assassinatePlayer(room, liveAssassin.token, target.token, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function assassinatePlayer(room, assassinToken, targetToken, io, broadcastRoom) {
  if (room.status !== 'AVALON_ASSASSIN') return;

  // 只有刺客本人才能发起刺杀，防止任意客户端篡改结局
  const assassinPlayer = room.players.find(p => p.avalonRole === 'assassin')
    || room.players.find(p => p.avalonSide === 'evil');
  if (!assassinPlayer || assassinPlayer.token !== assassinToken) return;

  const target = room.players.find(p => p.token === targetToken);
  if (!target || target.avalonSide !== 'good') return;

  room.assassinTarget = targetToken;
  clearInterval(room.timer);

  const isMerlin = target.avalonRole === 'merlin';

  if (isMerlin) {
    room.winner = 'evil';
    room.winReason = `🗡️ 刺客成功刺杀梅林【${target.name}】！邪恶阵营逆风翻盘！`;
  } else {
    room.winner = 'good';
    room.winReason = `🛡️ 刺客未能命中梅林（刺杀了【${target.name} - ${ROLE_INFO[target.avalonRole].name}】）！正义阵营获得最终胜利！`;
  }

  endGame(room, io, broadcastRoom);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  // 积分奖励
  room.players.forEach(p => {
    if (p.avalonSide === room.winner) {
      p.score += 200;
    }
  });

  const allRoles = room.players.map(p => ({
    name: p.name,
    avatar: p.avatar,
    token: p.token,
    role: p.avalonRole,
    roleName: ROLE_INFO[p.avalonRole].name,
    side: p.avalonSide,
    desc: ROLE_INFO[p.avalonRole].desc
  }));

  io.to(room.id).emit('avalon_game_over', {
    winner: room.winner,
    winReason: room.winReason,
    allRoles
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  const leader = room.players[room.leaderIndex];
  const count = room.players.length;
  const config = QUEST_CONFIGS[count] || { quests: [2, 3, 2, 3, 3], failsRequired: [1, 1, 1, 1, 1] };

  const currentSpeakerToken = (room.speechOrder && room.speechOrder[room.currentSpeakerIndex]) || null;
  const currentSpeaker = room.players.find(p => p.token === currentSpeakerToken);

  return {
    gameType: 'avalon',
    status: room.status,
    round: room.currentQuestIndex + 1,
    timeLeft: room.timeLeft,
    leaderToken: leader ? leader.token : null,
    leaderName: leader ? leader.name : '',
    speechMode: room.speechMode || 'online',
    speechDuration: room.speechDuration || 60,
    currentSpeakerToken,
    currentSpeakerName: currentSpeaker ? currentSpeaker.name : '',
    currentSpeakerAvatar: currentSpeaker ? currentSpeaker.avatar : '🐱',
    speakerIndex: room.currentSpeakerIndex || 0,
    speakerTotal: (room.speechOrder && room.speechOrder.length) || 0,
    speechOrder: room.speechOrder || [],
    rejectTrack: room.rejectTrack,
    currentQuestIndex: room.currentQuestIndex,
    requiredTeamCount: config.quests[room.currentQuestIndex] || 2,
    failsRequired: config.failsRequired[room.currentQuestIndex] || 1,
    selectedTeam: room.selectedTeam || [],
    questHistory: room.questHistory || [null, null, null, null, null],
    votedTokens: Object.keys(room.teamVotes || {}),
    questVotedTokens: Object.keys(room.questVotes || {}),
    questVotedCount: Object.keys(room.questVotes || {}).length,
    winner: room.winner,
    winReason: room.winReason
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  selectTeamMember,
  submitTeam,
  finishCurrentSpeech,
  castTeamVote,
  castQuestVote,
  assassinatePlayer
};
