const { shuffle } = require('./shuffle');

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

  // 用 Fisher-Yates 无偏洗牌，保证发牌公平
  return shuffle(deck);
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
  room.winner = null;

  // 发牌数读取房间设置 unoHandSize（1~20 张），房主未配置则默认 7 张
  let handSize = Math.min(20, Math.max(1, Number.isFinite(room.unoHandSize) ? Math.round(room.unoHandSize) : 7));

  // 牌量保护：108 张牌必须够全员发牌并留出底牌+缓冲，
  // 不够时自动收缩每人手牌数，防止 6人×20张 把牌堆抽空导致翻底牌崩溃死局（审计 R2-03）
  const maxFeasible = Math.floor((room.deck.length - 8) / count);
  if (handSize > maxFeasible) handSize = Math.max(1, maxFeasible);

  // 每人发牌
  room.players.forEach(p => {
    p.hand = room.deck.splice(0, handSize);
    p.hasCalledUno = false;
  });

  // 翻第一张底牌：从牌堆尾部定位第一张非万能牌取出。
  // 相比 while 循环反复洗牌，此写法无死循环风险（审计 R2-03）
  let firstIdx = room.deck.length - 1;
  while (firstIdx >= 0 && room.deck[firstIdx].color === 'wild') firstIdx--;
  if (firstIdx < 0) {
    // 极端防御：牌堆全是万能牌（概率≈1e-12）时取任意一张作底牌并随机指定颜色，保证开局可推进
    firstIdx = room.deck.length - 1;
    room.currentColor = ['red', 'yellow', 'green', 'blue'][Math.floor(Math.random() * 4)];
  }
  const firstCard = room.deck.splice(firstIdx, 1)[0];
  if (firstCard.color !== 'wild') {
    room.currentColor = firstCard.color;
  }

  room.discardPile.push(firstCard);
  // currentColor 已在上方处理（wild 底牌时为随机指定色，此处不覆盖）
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

// 启动回合倒计时。opts.keepDrawState=true 时保留"本回合已摸牌"状态（摸牌后重启计时用），
// opts.timeLeft 可指定秒数（默认 30）
function startTurnTimer(room, io, broadcastRoom, opts = {}) {
  clearInterval(room.timer);
  room.timeLeft = opts.timeLeft !== undefined ? opts.timeLeft : 30;
  if (!opts.keepDrawState) {
    room.hasDrawnThisTurn = false;
    room.drawnCardId = null;
  }

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

// 玩家被移除后的善后钩子：修正回合指针并重启定时器（审计 R2-02）。
// server.js 在 leave_room / kick / 掉线超时移除玩家后会调用本函数
function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  if (room.status !== 'UNO_PLAYING') return;
  const count = room.players.length;
  if (count === 0) return;

  const old = room.currentTurnIndex;
  if (removedIndex === old) {
    // 被移除者正是当前出牌者：回合顺延给下家。
    // 顺时针（direction=1）时 splice 后同索引已指向原下一位；
    // 逆时针（direction=-1）时下一位在原索引-1
    if (room.direction === -1) room.currentTurnIndex = (old - 1 + count) % count;
  } else if (removedIndex < old) {
    // 被移除者在当前玩家之前：数组整体前移，索引同步减一保持指向原玩家
    room.currentTurnIndex = old - 1;
  }
  // removedIndex > old：指针仍指向原当前玩家，无需修正
  if (room.currentTurnIndex < 0 || room.currentTurnIndex >= count) {
    room.currentTurnIndex = ((room.currentTurnIndex % count) + count) % count;
  }

  // 旧计时器闭包持有已离场玩家的 token（超时校验会失配），必须换新计时器让回合继续流转
  clearInterval(room.timer);
  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
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
  // 防御：中途加入且未初始化手牌的玩家（审计 R2-07）
  if (!current.hand) return;

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

  // 出牌后清空 UNO 喊话标记：仅在未进入"最后 1 张"状态时重置。
  // 玩家喊 UNO 后打出倒数第二张（剩 1 张）时标记保留，最后一张牌受保护不被"抓 UNO"（审计 R2-06）
  if (current.hand.length !== 1) current.hasCalledUno = false;

  // 处理颜色
  if (card.color === 'wild') {
    // 万能牌变色只接受四种标准颜色，防止客户端注入非法颜色破坏状态
    const validColors = ['red', 'yellow', 'green', 'blue'];
    room.currentColor = validColors.includes(chosenColor) ? chosenColor : 'red';
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
  if (nextPlayer && room.pendingDraw > 0) {
    const topCard = room.discardPile[room.discardPile.length - 1];
    const canDefend = (nextPlayer.hand || []).some(c => isPlayable(c, topCard, room.currentColor, room.pendingDraw));
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
  // 防御：中途加入且未初始化手牌的玩家（审计 R2-07）
  if (!player.hand) player.hand = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      // 牌堆抽空，将弃牌堆（除最上一张）洗回牌堆
      const top = room.discardPile.pop();
      room.deck = shuffle(room.discardPile);
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

  clearInterval(room.timer);

  // 罚牌规则：场上存在未结算的累计罚抽（+2/+4 叠加）时，
  // 摸牌必须一次吃满全部罚牌并结束回合，防止"摸1张过牌"把罚牌转嫁给下家
  if (room.pendingDraw > 0) {
    const penalty = room.pendingDraw;
    drawCardsForPlayer(room, current, penalty);
    room.pendingDraw = 0;
    io.to(room.id).emit('system_message', `💥 【${current.name}】吃下 ${penalty} 张罚牌并跳过回合！`);
    advanceTurn(room, 1);
    broadcastRoom(room);
    sendPrivateHands(room, io);
    startTurnTimer(room, io, broadcastRoom);
    return;
  }

  drawCardsForPlayer(room, current, 1);
  const drawnCard = current.hand[current.hand.length - 1];
  room.hasDrawnThisTurn = true;
  room.drawnCardId = drawnCard ? drawnCard.id : null;

  io.to(room.id).emit('system_message', `📥 【${current.name}】摸了 1 张牌`);

  broadcastRoom(room);
  sendPrivateHands(room, io);

  // 摸牌后重启回合计时器（保留已摸牌状态、给较短 15 秒）：摸牌并未结束回合（还可出牌/过牌），
  // 不重启的话玩家挂机/掉线将导致全房永久死锁（审计 R2-05）
  startTurnTimer(room, io, broadcastRoom, { keepDrawState: true, timeLeft: 15 });
}

function passTurnAction(room, playerToken, io, broadcastRoom) {
  if (room.status !== 'UNO_PLAYING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;
  if (!room.hasDrawnThisTurn) return; // 必须先摸牌才能过牌
  // 场上有未结算罚牌时不允许直接过牌，必须先吃满罚牌（见 drawCardAction）
  if (room.pendingDraw > 0) return;

  clearInterval(room.timer);
  advanceTurn(room, 1);
  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
}

function autoPlayOrPass(room, playerToken, io, broadcastRoom) {
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;

  clearInterval(room.timer);

  // 超时处理：场上有未结算罚牌则吃满罚牌，否则摸 1 张过牌
  if (room.pendingDraw > 0) {
    const penalty = room.pendingDraw;
    drawCardsForPlayer(room, current, penalty);
    room.pendingDraw = 0;
    io.to(room.id).emit('system_message', `⏰ 【${current.name}】超时，吃下 ${penalty} 张罚牌！`);
  } else {
    drawCardsForPlayer(room, current, 1);
  }

  advanceTurn(room, 1);
  broadcastRoom(room);
  sendPrivateHands(room, io);
  startTurnTimer(room, io, broadcastRoom);
}

function callUno(room, playerToken, io) {
  // 状态校验：大厅阶段手牌未初始化，直接访问会 TypeError（审计 R2-27）
  if (room.status !== 'UNO_PLAYING') return;
  const player = room.players.find(p => p.token === playerToken);
  if (!player || !player.hand) return;

  // 仅当手牌恰好剩 2 张时喊 UNO 才有效（出掉 1 张即剩最后 1 张）
  if (player.hand.length === 2) {
    player.hasCalledUno = true;
    io.to(room.id).emit('uno_called', {
      playerToken: player.token,
      playerName: player.name,
      avatar: player.avatar
    });
    io.to(room.id).emit('system_message', `🔥 【${player.name}】大喊了【UNO！】手牌即将打完！`);
  }
}

function catchUno(room, catcherToken, targetToken, io, broadcastRoom) {
  // 状态与存在性校验：catcher 可能是伪造 token / 已退出玩家，LOBBY 阶段也无罚牌语义（审计 R2-26）
  if (room.status !== 'UNO_PLAYING') return;
  const catcher = room.players.find(p => p.token === catcherToken);
  const target = room.players.find(p => p.token === targetToken);
  if (!catcher || !target || !target.hand) return;

  if (target.hand.length === 1 && !target.hasCalledUno) {
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
      (p.hand || []).forEach(c => {
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
  catchUno,
  isPlayable,
  onPlayerRemoved
};
