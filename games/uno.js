function generateDeck() {
  const deck = [];
  const colors = ['red', 'yellow', 'green', 'blue'];
  let id = 1;

  colors.forEach(color => {
    // 0: 1 card
    deck.push({ id: `c_${id++}`, color, value: '0', type: 'number', score: 0 });
    // 1-9: 2 cards each
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `c_${id++}`, color, value: `${i}`, type: 'number', score: i });
      deck.push({ id: `c_${id++}`, color, value: `${i}`, type: 'number', score: i });
    }
    // Action cards: 2 each
    for (let k = 0; k < 2; k++) {
      deck.push({ id: `c_${id++}`, color, value: 'skip', type: 'skip', score: 20 });
      deck.push({ id: `c_${id++}`, color, value: 'reverse', type: 'reverse', score: 20 });
      deck.push({ id: `c_${id++}`, color, value: 'draw2', type: 'draw2', score: 20 });
    }
  });

  // Wild cards: 4 each
  for (let k = 0; k < 4; k++) {
    deck.push({ id: `c_${id++}`, color: 'wild', value: 'wild', type: 'wild', score: 50 });
    deck.push({ id: `c_${id++}`, color: 'wild', value: 'wild4', type: 'wild4', score: 50 });
  }

  return deck.sort(() => 0.5 - Math.random());
}

function initRoomState(room) {
  room.gameType = 'uno';
  room.status = 'LOBBY';
  room.deck = [];
  room.discardPile = [];
  room.currentColor = null;
  room.currentTurnIndex = 0;
  room.direction = 1; // 1 = clockwise, -1 = counter-clockwise
  room.pendingDraw = 0; // accumulated +2 / +4 penalty
  room.hasDrawnThisTurn = false;
  room.drawnCardId = null;
  room.unoCallers = new Set(); // tokens who called UNO
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  const count = room.players.length;
  if (count < 2 || count > 8) {
    io.to(room.id).emit('system_message', 'UNO 支持 2 ~ 8 名玩家！');
    return;
  }

  room.deck = generateDeck();
  room.discardPile = [];
  room.direction = 1;
  room.pendingDraw = 0;
  room.hasDrawnThisTurn = false;
  room.drawnCardId = null;
  room.unoCallers = new Set();
  room.winner = null;

  // 每人发 7 张牌
  room.players.forEach(p => {
    p.hand = room.deck.splice(0, 7);
    p.hasCalledUno = false;
  });

  // 翻第一张底牌（非万能牌）
  let firstCard = room.deck.pop();
  while (firstCard.color === 'wild') {
    room.deck.unshift(firstCard);
    room.deck.sort(() => 0.5 - Math.random());
    firstCard = room.deck.pop();
  }

  room.discardPile.push(firstCard);
  room.currentColor = firstCard.color;
  room.currentTurnIndex = Math.floor(Math.random() * room.players.length);
  room.status = 'UNO_PLAYING';
  room.timeLeft = 30;

  broadcastRoom(room);
  sendPrivateHands(room, io);

  const current = room.players[room.currentTurnIndex];
  io.to(room.id).emit('system_message', `🃏 UNO 开局！底牌为【${cardLabel(firstCard)}】，首位出牌玩家：【${current.name}】！`);

  startTurnTimer(room, io, broadcastRoom);
}

function cardLabel(card) {
  const colorNames = { red: '🔴红', yellow: '🟡黄', green: '🟢绿', blue: '🔵蓝', wild: '🌈' };
  const valNames = {
    skip: '🚫禁止', reverse: '🔄转向', draw2: '+2',
    wild: '🌈变色', wild4: '🌈+4'
  };
  return `${colorNames[card.color] || ''} ${valNames[card.value] || card.value}`;
}

function sendPrivateHands(room, io) {
  room.players.forEach(p => {
    io.to(p.id).emit('uno_hand', {
      hand: p.hand || [],
      canCallUno: p.hand && p.hand.length === 2
    });
  });
}

function startTurnTimer(room, io, broadcastRoom) {
  clearInterval(room.timer);
  room.timeLeft = 30;
  room.hasDrawnThisTurn = false;
  room.drawnCardId = null;

  const current = room.players[room.currentTurnIndex];
  if (!current) return;

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      // 超时自动摸牌并过牌
      autoPlayOrPass(room, current.token, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function isPlayable(card, topCard, currentColor, pendingDraw = 0) {
  if (pendingDraw > 0) {
    // 正在累加罚牌时只能垫 +2 或 +4
    if (topCard.value === 'draw2' && card.value === 'draw2') return true;
    if (topCard.value === 'wild4' && card.value === 'wild4') return true;
    return false;
  }

  // 万能牌随时可出
  if (card.color === 'wild' || card.type === 'wild' || card.type === 'wild4') return true;

  // 匹配颜色
  if (card.color === currentColor) return true;

  // 匹配数字或符号
  if (card.value === topCard.value) return true;

  return false;
}

function playCard(room, playerToken, cardId, chosenColor, io, broadcastRoom) {
  if (room.status !== 'UNO_PLAYING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;

  const cardIdx = current.hand.findIndex(c => c.id === cardId);
  if (cardIdx < 0) return;

  const card = current.hand[cardIdx];
  const topCard = room.discardPile[room.discardPile.length - 1];

  if (!isPlayable(card, topCard, room.currentColor, room.pendingDraw)) {
    return;
  }

  // 成功出牌
  current.hand.splice(cardIdx, 1);
  room.discardPile.push(card);

  // 处理颜色
  if (card.color === 'wild') {
    room.currentColor = chosenColor || 'red';
  } else {
    room.currentColor = card.color;
  }

  io.to(room.id).emit('uno_card_played', {
    playerToken: current.token,
    playerName: current.name,
    avatar: current.avatar,
    card,
    currentColor: room.currentColor,
    remainingCards: current.hand.length
  });

  // 检查是否获胜
  if (current.hand.length === 0) {
    clearInterval(room.timer);
    endUnoGame(room, current, io, broadcastRoom);
    return;
  }

  // 处理功能牌效果
  handleCardEffect(room, card, io, broadcastRoom);
}

function handleCardEffect(room, card, io, broadcastRoom) {
  const playerCount = room.players.length;

  if (card.value === 'reverse') {
    if (playerCount === 2) {
      // 2人局转向相当于禁止
      io.to(room.id).emit('system_message', '🔄 转向牌发动（2人局跳过对手）！');
    } else {
      room.direction *= -1;
      io.to(room.id).emit('system_message', `🔄 转向牌发动！出牌顺序变为【${room.direction === 1 ? '顺时针' : '逆时针'}】！`);
      advanceTurn(room, 1);
    }
  } else if (card.value === 'skip') {
    io.to(room.id).emit('system_message', '🚫 禁止牌发动！下一位玩家被跳过！');
    advanceTurn(room, 2);
  } else if (card.value === 'draw2') {
    room.pendingDraw += 2;
    io.to(room.id).emit('system_message', `💥 +2 牌发动！累计罚抽 ${room.pendingDraw} 张！`);
    advanceTurn(room, 1);
  } else if (card.value === 'wild4') {
    room.pendingDraw += 4;
    io.to(room.id).emit('system_message', `💥 变色+4牌发动！颜色变为【${room.currentColor}】，累计罚抽 ${room.pendingDraw} 张！`);
    advanceTurn(room, 1);
  } else if (card.value === 'wild') {
    io.to(room.id).emit('system_message', `🌈 变色牌发动！指定颜色为【${room.currentColor}】！`);
    advanceTurn(room, 1);
  } else {
    advanceTurn(room, 1);
  }

  // 检查下一位玩家如果面临 pendingDraw 且无牌可防，自动吃罚牌
  const nextPlayer = room.players[room.currentTurnIndex];
  if (room.pendingDraw > 0) {
    const topCard = room.discardPile[room.discardPile.length - 1];
    const canDefend = nextPlayer.hand.some(c => isPlayable(c, topCard, room.currentColor, room.pendingDraw));
    if (!canDefend) {
      // 无法垫牌，直接吃罚抽并跳过回合
      drawCardsForPlayer(room, nextPlayer, room.pendingDraw);
      io.to(room.id).emit('system_message', `😢 【${nextPlayer.name}】无法接牌，罚抽 ${room.pendingDraw} 张并跳过回合！`);
      room.pendingDraw = 0;
      advanceTurn(room, 1);
    }
  }

  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
}

function advanceTurn(room, steps = 1) {
  const count = room.players.length;
  room.currentTurnIndex = (room.currentTurnIndex + (room.direction * steps) + count * 10) % count;
}

function drawCardsForPlayer(room, player, count) {
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      // 牌堆抽空，将弃牌堆（除最上一张）洗回牌堆
      const top = room.discardPile.pop();
      room.deck = room.discardPile.sort(() => 0.5 - Math.random());
      room.discardPile = [top];
    }
    if (room.deck.length > 0) {
      player.hand.push(room.deck.pop());
    }
  }
}

function drawCardAction(room, playerToken, io, broadcastRoom) {
  if (room.status !== 'UNO_PLAYING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;
  if (room.hasDrawnThisTurn) return;

  drawCardsForPlayer(room, current, 1);
  const drawnCard = current.hand[current.hand.length - 1];
  room.hasDrawnThisTurn = true;
  room.drawnCardId = drawnCard ? drawnCard.id : null;

  io.to(room.id).emit('system_message', `📥 【${current.name}】摸了 1 张牌`);

  broadcastRoom(room);
  sendPrivateHands(room, io);
}

function passTurnAction(room, playerToken, io, broadcastRoom) {
  if (room.status !== 'UNO_PLAYING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;
  if (!room.hasDrawnThisTurn) return; // 必须先摸牌才能过牌

  clearInterval(room.timer);
  advanceTurn(room, 1);
  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
}

function autoPlayOrPass(room, playerToken, io, broadcastRoom) {
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;

  // 自动摸一张牌并过牌
  drawCardsForPlayer(room, current, 1);
  advanceTurn(room, 1);
  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
}

function callUno(room, playerToken, io) {
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  if (player.hand.length <= 2) {
    player.hasCalledUno = true;
    io.to(room.id).emit('uno_called', {
      playerToken: player.token,
      playerName: player.name,
      avatar: player.avatar
    });
    io.to(room.id).emit('system_message', `🔥 【${player.name}】大喊了一局【UNO！】只剩最后 1 张手牌！`);
  }
}

function catchUno(room, catcherToken, targetToken, io, broadcastRoom) {
  const catcher = room.players.find(p => p.token === catcherToken);
  const target = room.players.find(p => p.token === targetToken);

  if (target && target.hand.length === 1 && !target.hasCalledUno) {
    drawCardsForPlayer(room, target, 2);
    io.to(room.id).emit('system_message', `🚨 【${catcher.name}】抓住了没喊 UNO 的【${target.name}】！【${target.name}】被罚摸 2 张牌！`);
    broadcastRoom(room);
    sendPrivateHands(room, io);
  }
}

function endUnoGame(room, winner, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  room.winner = winner.token;
  clearInterval(room.timer);

  // 计算积分
  let earnedScore = 0;
  room.players.forEach(p => {
    if (p.token !== winner.token) {
      p.hand.forEach(c => {
        earnedScore += c.score || 0;
      });
    }
  });
  winner.score += Math.max(100, earnedScore);

  const standings = [...room.players].sort((a, b) => (a.hand ? a.hand.length : 0) - (b.hand ? b.hand.length : 0));

  io.to(room.id).emit('uno_game_over', {
    winnerToken: winner.token,
    winnerName: winner.name,
    winnerAvatar: winner.avatar,
    earnedScore,
    standings: standings.map(p => ({
      name: p.name,
      avatar: p.avatar,
      remainingCards: p.hand ? p.hand.length : 0,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  const current = room.players[room.currentTurnIndex];
  const topCard = room.discardPile && room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null;

  return {
    gameType: 'uno',
    status: room.status,
    timeLeft: room.timeLeft,
    currentTurnToken: current ? current.token : null,
    currentTurnName: current ? current.name : '',
    topCard,
    currentColor: room.currentColor,
    direction: room.direction,
    pendingDraw: room.pendingDraw,
    hasDrawnThisTurn: room.hasDrawnThisTurn,
    playerCardCounts: room.players.map(p => ({
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      cardCount: p.hand ? p.hand.length : 0,
      hasCalledUno: p.hasCalledUno
    })),
    winner: room.winner
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  playCard,
  drawCardAction,
  passTurnAction,
  callUno,
  catchUno
};
