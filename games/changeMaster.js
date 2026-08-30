// ===================================================
// 游戏：找零钱大师 (Change Master)
// 玩法机制：快速心算与面额凑整！
// 顾客购买商品消费 ¥X，支付了 ¥Y，需要找零 ¥(Y - X)。
// 玩家在界面上点击 ¥50, ¥20, ¥10, ¥5, ¥1 钞票和硬币，
// 快速凑出分毫不差的找零总额，速度最快者获胜！
// ===================================================

const DENOMINATIONS = [50, 20, 10, 5, 1];

/**
 * 纯函数：生成一道找零钱题目
 * @param {number} round 当前轮次
 */
function generateBill(round = 1) {
  // 难度随轮次递增：
  // 第1轮：100 元内，找零为 5 的倍数或较简单
  // 第2~3轮：任意个位数找零
  let paid = 100;
  if (round >= 3 && Math.random() < 0.4) {
    paid = 200;
  } else if (round === 1) {
    paid = 50;
  }

  // 消费金额生成
  const minCost = 3;
  const maxCost = paid - 2;
  const cost = Math.floor(Math.random() * (maxCost - minCost + 1)) + minCost;
  const changeDue = paid - cost;

  return {
    paid,
    cost,
    changeDue,
    denominations: DENOMINATIONS
  };
}

/**
 * 验证玩家提交的纸币组合总额是否正确
 * @param {Object} counts 面额键值对，例如 { 50: 1, 10: 1, 1: 3 }
 * @param {number} changeDue 目标找零金额
 */
function validateChange(counts = {}, changeDue) {
  let total = 0;
  for (const denom of DENOMINATIONS) {
    const qty = Number(counts[denom]) || 0;
    if (qty > 0) {
      total += denom * qty;
    }
  }
  return {
    total,
    isValid: total === changeDue
  };
}

/**
 * 初始化房间状态
 */
function initRoomState(room) {
  room.gameType = 'change-master';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentBill = null;
  room.playerAnswers = {};
  room.timeLeft = 10;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

/**
 * 开始游戏
 */
function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'change-master') return;
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
  if (room.gameType !== 'change-master') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  const bill = generateBill(room.round);
  room.currentBill = bill;
  room.playerAnswers = {};
  room.status = 'CASH_COUNTING';
  room.timeLeft = 10; // 10秒快速找零
  room.roundStartTime = Date.now();

  broadcastRoom(room);

  io.to(room.id).emit('change_new_bill', {
    round: room.round,
    maxRounds: room.maxRounds,
    paid: bill.paid,
    cost: bill.cost,
    changeDue: bill.changeDue,
    denominations: bill.denominations,
    timeLimit: 10
  });

  io.to(room.id).emit('system_message', `💵 第 ${room.round}/${room.maxRounds} 轮：顾客付款 ¥${bill.paid}，商品总计 ¥${bill.cost}，请迅速找零 ¥${bill.changeDue}！`);

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
 * 玩家提交找零方案
 */
function submitChange(room, player, counts, io, broadcastRoom) {
  if (room.gameType !== 'change-master' || room.status !== 'CASH_COUNTING') return;
  if (!room.currentBill) return;
  if (room.playerAnswers[player.token]) return;

  const timeUsed = (Date.now() - room.roundStartTime) / 1000;
  const { total, isValid } = validateChange(counts, room.currentBill.changeDue);

  let scoreGain = 0;
  if (isValid) {
    const speedBonus = Math.max(0, Math.round((10 - timeUsed) * 8));
    scoreGain = 100 + speedBonus;
    player.score = (player.score || 0) + scoreGain;
  }

  room.playerAnswers[player.token] = {
    counts,
    total,
    isValid,
    timeUsed: parseFloat(timeUsed.toFixed(2)),
    scoreGain
  };

  io.to(player.id).emit('change_answer_feedback', {
    isValid,
    total,
    expectedChange: room.currentBill.changeDue,
    scoreGain
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
  if (room.gameType !== 'change-master') return;
  clearInterval(room.timer);
  room.timer = null;

  room.status = 'CASH_RESULT';

  const roundResults = room.players.map(p => {
    const ans = room.playerAnswers[p.token];
    return {
      playerId: p.id,
      playerToken: p.token,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      answered: !!ans,
      isValid: ans ? ans.isValid : false,
      totalSubmitted: ans ? ans.total : 0,
      timeUsed: ans ? ans.timeUsed : null,
      scoreGain: ans ? ans.scoreGain : 0
    };
  });

  io.to(room.id).emit('change_round_result', {
    round: room.round,
    maxRounds: room.maxRounds,
    paid: room.currentBill ? room.currentBill.paid : 0,
    cost: room.currentBill ? room.currentBill.cost : 0,
    changeDue: room.currentBill ? room.currentBill.changeDue : 0,
    results: roundResults
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'change-master' || room.status !== 'CHANGE_RESULT') return;
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

  io.to(room.id).emit('change_game_over', {
    podium: sorted.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

/**
 * 离线保护
 */
function onPlayerRemoved(room, player, io, broadcastRoom) {
  if (room.gameType !== 'change-master') return;
  if (room.status === 'CASH_COUNTING') {
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

module.exports = {
  generateBill,
  validateChange,
  initRoomState,
  startGame,
  startRound,
  submitChange,
  endRound,
  finishGame,
  onPlayerRemoved
};
