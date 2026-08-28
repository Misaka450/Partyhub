function initRoomState(room) {
  room.gameType = 'hold-five';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.targetSeconds = 5.0;
  room.playerHolds = {}; // token -> { timeHeld, diff, score }
  room.timeLeft = 15;
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

  room.round = 1;
  startRound(room, io, broadcastRoom);
}

function startRound(room, io, broadcastRoom) {
  room.status = 'HOLD_PRESSING';
  room.playerHolds = {};
  
  // 随机 3 到 10 之间的整数秒 (3, 4, 5, 6, 7, 8, 9, 10)
  if (room.fixedTargetSeconds && room.fixedTargetSeconds > 0) {
    room.targetSeconds = parseFloat(room.fixedTargetSeconds);
  } else {
    room.targetSeconds = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
  }

  // 限时为 目标时间 + 5 秒缓冲 (至少 12 秒)
  room.timeLeft = Math.max(12, Math.ceil(room.targetSeconds + 5));

  broadcastRoom(room);
  io.to(room.id).emit('hold_start_round', {
    round: room.round,
    maxRounds: room.maxRounds,
    targetSeconds: room.targetSeconds,
    timeLeft: room.timeLeft
  });

  io.to(room.id).emit('system_message', `⏱️ 第 ${room.round}/${room.maxRounds} 轮：本轮目标时间为【${room.targetSeconds}.000 秒】！按住大按钮凭直觉精准松开！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitHoldTime(room, playerToken, elapsedMs, io, broadcastRoom) {
  if (room.status !== 'HOLD_PRESSING') return;
  if (room.playerHolds[playerToken]) return;

  // 校验时间数值合理：必须是大于 0 的有限数字且不超过 60 秒，防止 NaN/伪造值污染成绩
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > 60000) return;

  const seconds = elapsedMs / 1000;
  const diff = Math.abs(seconds - room.targetSeconds);
  const baseScore = Math.max(0, Math.round(100 - diff * 35));

  room.playerHolds[playerToken] = {
    seconds: parseFloat(seconds.toFixed(3)),
    diff: parseFloat(diff.toFixed(3)),
    baseScore
  };

  const player = room.players.find(p => p.token === playerToken);
  if (player) {
    io.to(player.id).emit('hold_submit_feedback', {
      seconds: room.playerHolds[playerToken].seconds,
      diff: room.playerHolds[playerToken].diff,
      targetSeconds: room.targetSeconds
    });
  }

  broadcastRoom(room);

  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allSubmitted = activePlayers.length > 0 && activePlayers.every(p => room.playerHolds[p.token] !== undefined);
  if (allSubmitted) {
    clearInterval(room.timer);
    endRound(room, io, broadcastRoom);
  }
}

function endRound(room, io, broadcastRoom) {
  room.status = 'HOLD_ROUND_RESULT';
  clearInterval(room.timer);

  const sorted = Object.entries(room.playerHolds)
    .sort((a, b) => a[1].diff - b[1].diff);

  sorted.forEach(([token, holdData], rank) => {
    const player = room.players.find(p => p.token === token);
    if (player) {
      const precisionBonus = holdData.diff <= 0.05 ? 60 : (holdData.diff <= 0.15 ? 30 : (holdData.diff <= 0.3 ? 10 : 0));
      const totalEarned = holdData.baseScore + precisionBonus;
      player.score += totalEarned;
      holdData.earnedScore = totalEarned;
    }
  });

  const summary = room.players.map(p => {
    const h = room.playerHolds[p.token];
    return {
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      seconds: h ? `${h.seconds.toFixed(3)}s` : '超时未按',
      diff: h ? `误差 ±${h.diff.toFixed(3)}s` : '--',
      earnedScore: h ? h.earnedScore : 0
    };
  });

  io.to(room.id).emit('hold_round_summary', {
    targetSeconds: room.targetSeconds,
    summary,
    bestHolder: sorted[0] ? room.players.find(p => p.token === sorted[0][0])?.name : '无'
  });

  io.to(room.id).emit('system_message', `🎯 本轮目标【${room.targetSeconds}.000s】最佳领主：【${sorted[0] ? room.players.find(p => p.token === sorted[0][0])?.name : '无'}】（误差仅 ±${sorted[0] ? sorted[0][1].diff : '--'}s）！`);
  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'hold-five' || room.status !== 'HOLD_ROUND_RESULT') return;
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
  io.to(room.id).emit('hold_game_over', {
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
    gameType: 'hold-five',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    targetSeconds: room.targetSeconds,
    heldTokens: Object.keys(room.playerHolds || {}),
    answeredTokens: Object.keys(room.playerHolds || {})
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitHoldTime
};
