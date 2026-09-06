/**
 * drawGuess.client.js
 * ============================================================================
 * 【你画我猜 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 包含在线画板、画笔粗细/颜色选择、橡皮擦、历史回退、远程笔画 rAF 合帧渲染、
 * 3选1选题弹窗与聊天猜词提交逻辑。
 * 对外注册至 window.PartyGames['draw-guess']。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let isMyTurnToDraw = false;
  let isDrawing = false;
  let currentColor = '#000000';
  let currentSize = 5;
  let lastX = 0;
  let lastY = 0;
  const remoteStrokeQueue = [];
  let remoteStrokeRafId = null;
  let canvasResizeListenerBound = false;

  // DOM 缓存
  let canvasContainer = null;
  let canvas = null;
  let ctx = null;
  let drawGuessBar = null;
  let drawGuessForm = null;
  let drawGuessInput = null;
  let drawingToolbar = null;
  let drawTurnBanner = null;
  let drawRoleIcon = null;
  let drawStatusText = null;
  let drawWordBadge = null;
  let wordHintBox = null;
  let categoryBadge = null;
  let wordModal = null;
  let wordOptionsContainer = null;
  let displayRoundTag = null;
  let displayRound = null;

  function ensureDom() {
    if (!canvasContainer) canvasContainer = document.getElementById('canvas-container');
    if (!canvas) canvas = document.getElementById('paint-canvas');
    if (!ctx && canvas) ctx = canvas.getContext('2d');
    if (!drawGuessBar) drawGuessBar = document.getElementById('draw-guess-bar');
    if (!drawGuessForm) drawGuessForm = document.getElementById('draw-guess-form');
    if (!drawGuessInput) drawGuessInput = document.getElementById('draw-guess-input');
    if (!drawingToolbar) drawingToolbar = document.getElementById('drawing-toolbar');
    if (!drawTurnBanner) drawTurnBanner = document.getElementById('draw-turn-banner');
    if (!drawRoleIcon) drawRoleIcon = document.getElementById('draw-role-icon');
    if (!drawStatusText) drawStatusText = document.getElementById('draw-status-text');
    if (!drawWordBadge) drawWordBadge = document.getElementById('draw-word-badge');
    if (!wordHintBox) wordHintBox = document.getElementById('word-hint-box');
    if (!categoryBadge) categoryBadge = document.getElementById('category-badge');
    if (!wordModal) wordModal = document.getElementById('word-modal');
    if (!wordOptionsContainer) wordOptionsContainer = document.getElementById('word-options-container');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function resizeCanvas() {
    ensureDom();
    if (!canvasContainer || !canvas || !ctx) return;
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 0 ? rect.width : (canvasContainer.clientWidth > 0 ? canvasContainer.clientWidth : 500);
    const h = rect.height > 0 ? rect.height : (canvasContainer.clientHeight > 0 ? canvasContainer.clientHeight : 350);

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (window.currentRoomState && window.currentRoomState.drawHistory) {
        redrawCanvasHistory(window.currentRoomState.drawHistory);
      }
    }
  }

  function getPos(e) {
    ensureDom();
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX, clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  }

  function drawLine(x1, y1, x2, y2, color, size) {
    ensureDom();
    if (!ctx || !canvasContainer) return;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(x1 * w, y1 * h);
    ctx.lineTo(x2 * w, y2 * h);
    ctx.stroke();
  }

  function redrawCanvasHistory(history) {
    ensureDom();
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let lx = 0, ly = 0;
    history.forEach(stroke => {
      if (stroke.type === 'start') { lx = stroke.x; ly = stroke.y; }
      else if (stroke.type === 'line') {
        drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
        lx = stroke.x2; ly = stroke.y2;
      }
    });
  }

  function handleStart(e) {
    if (!isMyTurnToDraw) return;
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    const socket = window.socket;
    if (socket) socket.emit('draw_stroke', { type: 'start', x: lastX, y: lastY, color: currentColor, size: currentSize });
  }

  function handleMove(e) {
    if (!isDrawing || !isMyTurnToDraw) return;
    e.preventDefault();
    const pos = getPos(e);
    if (Math.hypot(pos.x - lastX, pos.y - lastY) < 0.001) return;

    drawLine(lastX, lastY, pos.x, pos.y, currentColor, currentSize);
    const socket = window.socket;
    if (socket) socket.emit('draw_stroke', { type: 'line', x1: lastX, y1: lastY, x2: pos.x, y2: pos.y, color: currentColor, size: currentSize });
    lastX = pos.x;
    lastY = pos.y;
  }

  function handleEnd(e) {
    if (!isDrawing || !isMyTurnToDraw) return;
    isDrawing = false;
    const socket = window.socket;
    if (socket) socket.emit('draw_stroke', { type: 'end' });
  }

  function processRemoteStrokes() {
    remoteStrokeRafId = null;
    while (remoteStrokeQueue.length > 0) {
      const data = remoteStrokeQueue.shift();
      if (data.type === 'line') {
        drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size);
      }
    }
  }

  function bindEvents(socket) {
    ensureDom();

    if (drawGuessForm && !drawGuessForm._eventsBound) {
      drawGuessForm._eventsBound = true;
      drawGuessForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = drawGuessInput ? drawGuessInput.value.trim() : '';
        if (val) {
          if (socket) socket.emit('send_chat', { text: val });
          if (drawGuessInput) {
            drawGuessInput.value = '';
            drawGuessInput.focus();
          }
          if (window.playSound) window.playSound('tick');
        }
      });
    }

    if (canvas && !canvas._eventsBound) {
      canvas._eventsBound = true;
      canvas.addEventListener('mousedown', handleStart);
      canvas.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      canvas.addEventListener('touchstart', handleStart, { passive: false });
      canvas.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);

      if (!canvasResizeListenerBound) {
        canvasResizeListenerBound = true;
        window.addEventListener('resize', resizeCanvas);
      }
    }

    document.querySelectorAll('.color-dot').forEach(dot => {
      if (dot._dgBound) return;
      dot._dgBound = true;
      dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        document.getElementById('btn-eraser')?.classList.remove('active');
        dot.classList.add('active');
        currentColor = dot.dataset.color;
      });
    });

    document.querySelectorAll('.brush-sizes .btn-tool').forEach(btn => {
      if (btn._dgBound) return;
      btn._dgBound = true;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.brush-sizes .btn-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSize = parseInt(btn.dataset.size);
      });
    });

    const btnEraser = document.getElementById('btn-eraser');
    if (btnEraser && !btnEraser._dgBound) {
      btnEraser._dgBound = true;
      btnEraser.addEventListener('click', () => {
        currentColor = '#FFFFFF';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        btnEraser.classList.add('active');
      });
    }

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo && !btnUndo._dgBound) {
      btnUndo._dgBound = true;
      btnUndo.addEventListener('click', () => { if (socket) socket.emit('undo_canvas'); });
    }

    const btnClear = document.getElementById('btn-clear');
    if (btnClear && !btnClear._dgBound) {
      btnClear._dgBound = true;
      btnClear.addEventListener('click', () => { if (socket) socket.emit('clear_canvas'); });
    }

    if (!socket || socket._dgBound) return;
    socket._dgBound = true;

    socket.on('draw_stroke', (data) => {
      remoteStrokeQueue.push(data);
      if (!remoteStrokeRafId) {
        remoteStrokeRafId = requestAnimationFrame(processRemoteStrokes);
      }
    });

    socket.on('clear_canvas', () => {
      remoteStrokeQueue.length = 0;
      if (remoteStrokeRafId) {
        cancelAnimationFrame(remoteStrokeRafId);
        remoteStrokeRafId = null;
      }
      ensureDom();
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on('redraw_canvas', (history) => {
      redrawCanvasHistory(history);
    });

    socket.on('sync_draw_history', (history) => {
      history.forEach(stroke => {
        if (stroke.type === 'line') drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
      });
    });

    socket.on('select_word_options', (data) => {
      ensureDom();
      if (!wordOptionsContainer || !wordModal) return;
      wordOptionsContainer.innerHTML = '';
      data.options.forEach(word => {
        const card = document.createElement('div');
        card.className = 'word-option-card';
        card.innerHTML = `
          <span>${word}</span>
          <span class="word-len">${word.length}个字</span>
        `;
        card.onclick = () => {
          socket.emit('select_word', { word });
          wordModal.classList.remove('active');
        };
        wordOptionsContainer.appendChild(card);
      });
      wordModal.classList.add('active');
    });

    socket.on('your_turn_to_draw', () => {
      ensureDom();
      if (wordModal) wordModal.classList.remove('active');
      if (window.playSound) window.playSound('fanfare');
    });

    socket.on('round_ended', (data) => {
      if (window.showRevealModal) {
        window.showRevealModal(data.reason || '本轮结束！', data.word || '--', 3500);
      }
    });

    socket.on('dg_game_over', (data) => {
      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: '🎨 你画我猜 最终排名',
          desc: '灵魂画手与猜词达人榜单',
          podium: data.podium || []
        });
      }
    });
  }

  window.PartyGames['draw-guess'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDom();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `${state.round}/${state.maxRounds}`;

      const myToken = window.myPlayerToken;
      const socketId = window.socket ? window.socket.id : null;
      isMyTurnToDraw = (state.drawerToken === myToken || state.drawerId === socketId);

      resizeCanvas();

      if (state.status === 'DRAWING') {
        if (drawingToolbar) drawingToolbar.classList.toggle('hidden', !isMyTurnToDraw);
        if (drawGuessBar) drawGuessBar.classList.toggle('hidden', isMyTurnToDraw);

        if (isMyTurnToDraw) {
          if (drawTurnBanner) drawTurnBanner.classList.add('is-drawer');
          if (drawRoleIcon) drawRoleIcon.textContent = '🎨';
          if (drawStatusText) drawStatusText.textContent = '轮到你作画！题目：';
          if (drawWordBadge) {
            drawWordBadge.textContent = state.currentWord || '选中词';
            drawWordBadge.classList.remove('hidden');
          }
          if (wordHintBox) wordHintBox.textContent = `题目：${state.currentWord || '选中词'} (分类: ${state.wordCategory || '常用'})`;
        } else {
          if (drawTurnBanner) drawTurnBanner.classList.remove('is-drawer');
          if (drawRoleIcon) drawRoleIcon.textContent = '👀';
          if (drawStatusText) drawStatusText.textContent = `【${state.drawerName || '玩家'}】正在作画...`;
          if (drawWordBadge) drawWordBadge.classList.add('hidden');
          if (wordHintBox) wordHintBox.textContent = state.wordHint || '猜猜看...';
        }

        if (state.wordCategory && categoryBadge) {
          categoryBadge.textContent = state.wordCategory;
          categoryBadge.classList.remove('hidden');
        }
      } else if (state.status === 'SELECTING') {
        if (drawingToolbar) drawingToolbar.classList.add('hidden');
        if (drawGuessBar) drawGuessBar.classList.add('hidden');
        if (drawTurnBanner) drawTurnBanner.classList.remove('is-drawer');
        if (drawRoleIcon) drawRoleIcon.textContent = '⏳';
        if (drawStatusText) drawStatusText.textContent = isMyTurnToDraw ? '请在弹窗中选择作画词语...' : `【${state.drawerName || '玩家'}】正在选题...`;
        if (drawWordBadge) drawWordBadge.classList.add('hidden');
      } else {
        if (drawingToolbar) drawingToolbar.classList.add('hidden');
        if (drawGuessBar) drawGuessBar.classList.add('hidden');
        if (drawTurnBanner) drawTurnBanner.classList.remove('is-drawer');
        if (drawRoleIcon) drawRoleIcon.textContent = '🏠';
        if (drawStatusText) drawStatusText.textContent = '等待房主开始...';
        if (drawWordBadge) drawWordBadge.classList.add('hidden');
      }
    }
  };
})();
