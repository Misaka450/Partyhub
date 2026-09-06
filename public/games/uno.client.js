/**
 * uno.client.js
 * ============================================================================
 * 【UNO 优诺牌  独立前端客户端模块】
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};
  const socket = window.socket;
  const playSound = (sound) => window.playSound && window.playSound(sound);
  const showRevealModal = (...args) => window.showRevealModal && window.showRevealModal(...args);
  const showGameOverModal = (...args) => window.showGameOverModal && window.showGameOverModal(...args);
  const showToast = (...args) => window.showToast && window.showToast(...args);
  const escapeHtml = (s) => window.escapeHtml ? window.escapeHtml(s) : s;

// =====================【UNO 渲染】=====================
socket.on('uno_hand', (data) => {
  myUnoHand = data.hand || [];
  renderUnoHand();
  btnUnoCall.classList.toggle('hidden', !data.canCallUno);
  playSound('card');
});

function renderUnoHand() {
  unoHandContainer.innerHTML = '';
  const topCard = currentRoomState ? currentRoomState.topCard : null;
  const currentColor = currentRoomState ? currentRoomState.currentColor : null;
  const pendingDraw = currentRoomState ? currentRoomState.pendingDraw : 0;
  const isMyTurn = currentRoomState && currentRoomState.currentTurnToken === myPlayerToken;

  myUnoHand.forEach(card => {
    const cardEl = document.createElement('div');
    const playable = isMyTurn && checkUnoPlayable(card, topCard, currentColor, pendingDraw);
    cardEl.className = `uno-card uno-hand-card ${card.color} ${playable ? 'playable' : ''}`;
    
    const valMap = { skip: '🚫', reverse: '🔄', draw2: '+2', wild: '🌈', wild4: '+4' };
    cardEl.innerHTML = `<span class="card-val">${valMap[card.value] || card.value}</span>`;

    cardEl.onclick = () => {
      if (!isMyTurn || !playable) return;
      if (card.color === 'wild') {
        pendingWildCardId = card.id;
        unoColorModal.classList.add('active');
      } else {
        socket.emit('uno_play_card', { cardId: card.id });
        playSound('card');
      }
    };
    unoHandContainer.appendChild(cardEl);
  });
}

function checkUnoPlayable(card, topCard, currentColor, pendingDraw) {
  if (!topCard) return true;
  if (pendingDraw > 0) {
    if (topCard.value === 'draw2' && card.value === 'draw2') return true;
    if (topCard.value === 'wild4' && card.value === 'wild4') return true;
    return false;
  }
  if (card.color === 'wild' || card.type === 'wild' || card.type === 'wild4') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

document.querySelectorAll('.btn-color-pick').forEach(btn => {
  btn.addEventListener('click', () => {
    const chosenColor = btn.dataset.color;
    if (pendingWildCardId) {
      socket.emit('uno_play_card', { cardId: pendingWildCardId, chosenColor });
      pendingWildCardId = null;
      unoColorModal.classList.remove('active');
      playSound('card');
    }
  });
});

btnUnoDraw.addEventListener('click', () => {
  if (currentRoomState && currentRoomState.currentTurnToken === myPlayerToken) {
    socket.emit('uno_draw_card');
    playSound('card');
  }
});

btnUnoPass.addEventListener('click', () => {
  socket.emit('uno_pass_turn');
});

btnUnoCall.addEventListener('click', () => {
  socket.emit('uno_call_uno');
  playSound('fanfare');
});

function renderUnoState(state) {
  displayRoundTag.classList.add('hidden');
  const isMyTurn = (state.currentTurnToken === myPlayerToken);

  unoTurnLabel.textContent = isMyTurn ? '🔥 轮到你出牌！' : `⏳ 等待【${state.currentTurnName}】出牌...`;
  unoTurnLabel.style.color = isMyTurn ? '#34D399' : '#60A5FA';
  btnUnoPass.classList.toggle('hidden', !isMyTurn || !state.hasDrawnThisTurn);

  // 渲染底牌与颜色
  if (state.topCard) {
    const valMap = { skip: '🚫', reverse: '🔄', draw2: '+2', wild: '🌈', wild4: '+4' };
    unoTopCard.className = `uno-card current-top-card ${state.topCard.color}`;
    unoTopCard.innerHTML = `<span class="card-val">${valMap[state.topCard.value] || state.topCard.value}</span>`;
    
    const colorLabels = { red: '🔴 红色', yellow: '🟡 黄色', green: '🟢 绿色', blue: '🔵 蓝色' };
    unoColorIndicator.textContent = colorLabels[state.currentColor] || '🌈 变色';
  }

  // 渲染对手手牌条
  unoOpponentsStrip.innerHTML = '';
  state.playerCardCounts.forEach(p => {
    if (p.token !== myPlayerToken) {
      const chip = document.createElement('div');
      chip.className = `uno-opp-chip ${p.token === state.currentTurnToken ? 'is-turn' : ''}`;
      chip.innerHTML = `
        <span>${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</span>
        <span class="uno-card-badge">${p.cardCount}张</span>
      `;
      // 点击抓未喊UNO
      if (p.cardCount === 1 && !p.hasCalledUno) {
        chip.title = '点击举报未喊 UNO!';
        chip.onclick = () => socket.emit('uno_catch_uno', { targetToken: p.token });
      }
      unoOpponentsStrip.appendChild(chip);
    }
  });

  renderUnoHand();
}

socket.on('uno_game_over', (data) => {
  const podium = (data.standings || []).map(p => ({
    avatar: p.avatar,
    name: p.name,
    detail: p.remainingCards === 0 ? '优胜' : `剩 ${p.remainingCards} 张`,
    score: p.score !== undefined ? p.score : (p.remainingCards === 0 ? data.earnedScore : 0)
  }));

  showGameOverModal({
    // title/desc 走 textContent 渲染（不解析 HTML），无需预转义——预转义反而会把 < & 显示成实体字符（审计 R2-44）
    title: `🃏 【${data.winnerName}】赢得 UNO 胜局！`,
    desc: `获得积分 +${data.earnedScore} 分！`,
    podium
  });
});


})();
