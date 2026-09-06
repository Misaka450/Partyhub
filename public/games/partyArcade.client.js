/**
 * partyArcade.client.js
 * ============================================================================
 * 【聚会对战小游戏集合 · 独立前端客户端模块】
 * 
 * 包含 4 款经典快节奏对战小游戏：
 * 1. 瞬间数小鸡/数动物 (flash-counter)
 * 2. 拆弹轮盘赌 (bomb-roulette)
 * 3. 几A几B 密码破解大师 (bulls-and-cows)
 * 4. 词汇炸弹 (word-bomb)
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

  // DOM 缓存
  const flashCanvas = document.getElementById('flash-canvas');
  const flashCtx = flashCanvas ? flashCanvas.getContext('2d') : null;
  const flashOverlayCard = document.getElementById('flash-overlay-card');
  const flashReadyBanner = document.getElementById('flash-ready-banner');
  const flashRunnersLayer = document.getElementById('flash-runners-layer');
  const readyCountdown = document.getElementById('ready-countdown');
  const readyTargetEmoji = document.getElementById('ready-target-emoji');
  const readyTargetName = document.getElementById('ready-target-name');
  const flashTargetEmoji = document.getElementById('flash-target-emoji');
  const flashTargetName = document.getElementById('flash-target-name');
  const flashOptionsGrid = document.getElementById('flash-options-grid');
  const flashDirectForm = document.getElementById('flash-direct-form');
  const flashDirectInput = document.getElementById('flash-direct-input');

  const bombTurnTip = document.getElementById('bomb-turn-tip');
  const wiresGrid = document.getElementById('wires-grid');

  const bcDigitsDisplay = document.getElementById('bc-digits-display');
  const bcLogList = document.getElementById('bc-log-list');
  const btnBcClear = document.getElementById('btn-bc-clear');
  const btnBcSubmit = document.getElementById('btn-bc-submit');
  let currentBcInput = '';

  const wbKeywordBadge = document.getElementById('wb-keyword-badge');
  const wbTurnStatus = document.getElementById('wb-turn-status');
  const wbLivesBar = document.getElementById('wb-lives-bar');
  const wbInputForm = document.getElementById('wb-input-form');
  const wbInput = document.getElementById('wb-input');

  const displayRoundTag = document.getElementById('display-round-tag');
  const displayRound = document.getElementById('display-round');
  const wordHintBox = document.getElementById('word-hint-box');

  // =====================【1. 瞬间数羊】=====================
  function initFlashCanvasResolution() {
    return window.fitCanvasResolution ? window.fitCanvasResolution(flashCanvas, flashCtx, 360, 260, 600) : { w: 360, h: 260, dpr: 1 };
  }

  function drawFlashTrackBackground(c, width, height) {
    const laneHeight = height / 5;
    for (let i = 0; i < 5; i++) {
      c.fillStyle = (i % 2 === 0) ? '#123927' : '#0c271b';
      c.fillRect(0, i * laneHeight, width, laneHeight);
      if (i > 0) {
        c.beginPath();
        c.moveTo(0, i * laneHeight);
        c.lineTo(width, i * laneHeight);
        c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        c.lineWidth = 1.5;
        c.setLineDash([8, 12]);
        c.stroke();
      }
    }
    c.setLineDash([]);
    c.fillStyle = 'rgba(255, 255, 255, 0.08)';
    c.fillRect(0, 0, 10, height);
    c.fillRect(width - 10, 0, 10, height);
  }

  function setFlashAnswerSubmitted(opt) {
    if (flashDirectInput) {
      flashDirectInput.value = opt;
      flashDirectInput.disabled = true;
    }
    const submitBtn = flashDirectForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = `✓ 已提交 (${opt})`;
      submitBtn.style.background = 'var(--success)';
      submitBtn.disabled = true;
    }
    if (flashOptionsGrid) {
      flashOptionsGrid.querySelectorAll('.btn-flash-option').forEach(b => {
        b.disabled = true;
        if (parseInt(b.textContent) === parseInt(opt)) {
          b.style.opacity = '1';
          b.style.borderColor = 'var(--success)';
          b.style.background = 'var(--success-subtle)';
          b.style.color = 'var(--success)';
        } else {
          b.style.opacity = '0.35';
        }
      });
    }
  }

  function resetFlashForm() {
    if (flashDirectInput) {
      flashDirectInput.value = '';
      flashDirectInput.disabled = false;
    }
    const submitBtn = flashDirectForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = '提交答案';
      submitBtn.style.background = '';
      submitBtn.disabled = false;
    }
    if (flashOptionsGrid) {
      flashOptionsGrid.querySelectorAll('.btn-flash-option').forEach(b => {
        b.disabled = false;
        b.style.opacity = '';
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
      });
    }
  }

  if (flashDirectForm && !flashDirectForm._eventsBound) {
    flashDirectForm._eventsBound = true;
    flashDirectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (flashDirectInput?.disabled) return;
      const val = parseInt(flashDirectInput?.value);
      if (!isNaN(val) && val > 0) {
        setFlashAnswerSubmitted(val);
        const ws = window.socket;
        if (ws) ws.emit('flash_submit_answer', { option: val });
        playSound('tick');
      }
    });
  }

  window.PartyGames['flash-counter'] = {
    renderState(state) {
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

      if (state.targetAnimal) {
        if (readyTargetEmoji) readyTargetEmoji.textContent = state.targetAnimal.emoji;
        if (readyTargetName) readyTargetName.textContent = state.targetAnimal.name;
        if (flashTargetEmoji) flashTargetEmoji.textContent = state.targetAnimal.emoji;
        if (flashTargetName) flashTargetName.textContent = state.targetAnimal.name;
      }

      if (state.status === 'FLASH_READY') {
        resetFlashForm();
        if (flashOverlayCard) flashOverlayCard.classList.add('hidden');
        if (wordHintBox) wordHintBox.textContent = `第 ${state.round} 轮：准备数【${state.targetAnimal ? state.targetAnimal.name : '动物'}】... 倒计时 ${state.timeLeft}s`;
        if (readyCountdown) readyCountdown.textContent = state.timeLeft;
        if (flashReadyBanner) flashReadyBanner.classList.remove('hidden');
        if (flashRunnersLayer) flashRunnersLayer.innerHTML = '';
        
        const { w, h, dpr } = initFlashCanvasResolution();
        if (flashCtx) {
          flashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          flashCtx.clearRect(0, 0, w, h);
          drawFlashTrackBackground(flashCtx, w, h);
        }
      } else if (state.status === 'FLASH_FLYING') {
        resetFlashForm();
        if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
        if (flashOverlayCard) flashOverlayCard.classList.add('hidden');
        if (wordHintBox) wordHintBox.textContent = `👀 正在飞奔穿过！全神贯注数【${state.targetAnimal ? state.targetAnimal.name : '目标动物'}】！`;
      } else if (state.status === 'FLASH_GUESSING') {
        if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
        if (flashRunnersLayer) flashRunnersLayer.innerHTML = '';
        if (flashOverlayCard) flashOverlayCard.classList.remove('hidden');
        if (wordHintBox) wordHintBox.textContent = `请抢答刚才跑过了几只【${state.targetAnimal ? state.targetAnimal.name : '目标'}】？剩余 ${state.timeLeft}s`;

        if (state.options && state.options.length > 0 && flashOptionsGrid && flashOptionsGrid.children.length === 0) {
          flashOptionsGrid.innerHTML = '';
          state.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-flash-option';
            btn.textContent = opt;
            btn.onclick = () => {
              if (flashDirectInput) flashDirectInput.value = opt;
              setFlashAnswerSubmitted(opt);
              const ws = window.socket;
              if (ws) ws.emit('flash_submit_answer', { option: opt });
              playSound('tick');
            };
            flashOptionsGrid.appendChild(btn);
          });
        }
      }
    }
  };

  // =====================【2. 拆弹轮盘赌】=====================
  window.PartyGames['bomb-roulette'] = {
    renderState(state) {
      if (displayRoundTag) displayRoundTag.classList.add('hidden');
      const myToken = window.myPlayerToken;
      const isMyTurn = (state.currentTurnToken === myToken);

      if (bombTurnTip) {
        bombTurnTip.textContent = isMyTurn ? '🔥 轮到你剪线！请选择一根引线！' : `⏳ 等待【${state.currentTurnName}】拆弹...`;
        bombTurnTip.style.color = isMyTurn ? '#EF4444' : '#FBBF24';
      }

      if (wiresGrid) {
        wiresGrid.innerHTML = '';
        state.wires.forEach(w => {
          const card = document.createElement('div');
          card.className = `wire-card ${w.isCut ? 'cut' : ''}`;
          card.style.borderColor = w.color;
          card.style.color = w.color;
          card.innerHTML = `<span>✂️ ${w.name}</span>`;

          if (!w.isCut && isMyTurn && state.status === 'BOMB_PLAYING') {
            card.onclick = () => {
              const ws = window.socket;
              if (ws) ws.emit('bomb_cut_wire', { wireId: w.id });
              playSound('card');
            };
          }
          wiresGrid.appendChild(card);
        });
      }
    }
  };

  // =====================【3. 几A几B 密码破解】=====================
  function updateBcDisplay() {
    if (!bcDigitsDisplay) return;
    const chars = currentBcInput.split('');
    while (chars.length < 4) chars.push('_');
    bcDigitsDisplay.textContent = chars.join(' ');
  }

  document.querySelectorAll('#stage-bulls-and-cows .btn-key').forEach(btn => {
    if (btn._bcBound) return;
    btn._bcBound = true;
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key !== undefined) {
        if (currentBcInput.length < 4 && !currentBcInput.includes(key)) {
          currentBcInput += key;
          updateBcDisplay();
          playSound('tick');
        }
      }
    });
  });

  if (btnBcClear && !btnBcClear._bcBound) {
    btnBcClear._bcBound = true;
    btnBcClear.addEventListener('click', () => {
      currentBcInput = '';
      updateBcDisplay();
    });
  }

  if (btnBcSubmit && !btnBcSubmit._bcBound) {
    btnBcSubmit._bcBound = true;
    btnBcSubmit.addEventListener('click', () => {
      if (currentBcInput.length === 4) {
        const ws = window.socket;
        if (ws) ws.emit('bc_submit_guess', { guess: currentBcInput });
        currentBcInput = '';
        updateBcDisplay();
        playSound('card');
      } else {
        showToast('请输入 4 位互不重复的数字！', '⚠️');
      }
    });
  }

  window.PartyGames['bulls-and-cows'] = {
    renderState(state) {
      if (displayRoundTag) displayRoundTag.classList.add('hidden');
      if (wordHintBox) wordHintBox.textContent = `密码破解竞速中... 剩余 ${state.timeLeft}s`;

      const myToken = window.myPlayerToken;
      if (state.playerGuesses && state.playerGuesses[myToken] && bcLogList) {
        const history = state.playerGuesses[myToken];
        if (history.length > 0 && bcLogList.querySelectorAll('.bc-log-item').length === 0) {
          bcLogList.innerHTML = '';
          history.forEach((h, idx) => {
            const item = document.createElement('div');
            item.className = 'bc-log-item';
            item.innerHTML = `
              <span>#${idx + 1} 猜想 <b class="bc-log-guess">${escapeHtml(h.guess)}</b></span>
              <span class="bc-log-feedback">${escapeHtml(String(h.a))}A ${escapeHtml(String(h.b))}B</span>
            `;
            bcLogList.appendChild(item);
          });
        }
      }
    }
  };

  // =====================【4. 词汇炸弹】=====================
  if (wbInputForm && !wbInputForm._wbBound) {
    wbInputForm._wbBound = true;
    wbInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!wbInput) return;
      const word = wbInput.value.trim();
      if (word) {
        const ws = window.socket;
        if (ws) ws.emit('word_bomb_submit', { word });
        wbInput.value = '';
        playSound('card');
      }
    });
  }

  window.PartyGames['word-bomb'] = {
    renderState(state) {
      if (displayRoundTag) displayRoundTag.classList.add('hidden');
      const myToken = window.myPlayerToken;
      const isMyTurn = (state.currentTurnToken === myToken);

      if (wbKeywordBadge) {
        if (state.ruleMode === 'START') {
          wbKeywordBadge.textContent = `${state.currentKeyword}... (首字)`;
        } else if (state.ruleMode === 'END') {
          wbKeywordBadge.textContent = `...${state.currentKeyword} (尾字)`;
        } else if (state.ruleMode === 'IDIOM') {
          wbKeywordBadge.textContent = `四字成语: ${state.currentKeyword}`;
        } else {
          wbKeywordBadge.textContent = state.currentKeyword || '天';
        }
      }

      if (wbTurnStatus) {
        wbTurnStatus.textContent = isMyTurn ? '🔥 炸弹在你手中！快输入符合条件的词语！' : `⏳ 持弹人：【${state.currentTurnName}】`;
        wbTurnStatus.style.color = isMyTurn ? '#EF4444' : '#FBBF24';
      }

      if (wordHintBox) {
        wordHintBox.textContent = `规则：${state.ruleDesc || ('包含【' + state.currentKeyword + '】')} · 倒计时 ${state.timeLeft}s`;
      }

      if (wbLivesBar) {
        const myLives = (state.playerLives && state.playerLives[myToken] !== undefined) ? state.playerLives[myToken] : 2;
        wbLivesBar.textContent = `我的生命值：${'❤️'.repeat(Math.max(0, myLives))}${myLives <= 0 ? ' 💀 已淘汰' : ''}`;
      }
    }
  };

  // =====================【通用 Socket 监听集成】=====================
  function attachSocketListeners(ws) {
    if (!ws || ws._partyArcadeBound) return;
    ws._partyArcadeBound = true;

    // Flash Counter
    ws.on('flash_round_ready', (data) => {
      resetFlashForm();
      if (flashOverlayCard) flashOverlayCard.classList.add('hidden');
      if (readyTargetEmoji && data.targetAnimal) readyTargetEmoji.textContent = data.targetAnimal.emoji;
      if (readyTargetName && data.targetAnimal) readyTargetName.textContent = data.targetAnimal.name;
      if (readyCountdown) readyCountdown.textContent = '3';
      if (flashReadyBanner) flashReadyBanner.classList.remove('hidden');
      if (flashRunnersLayer) flashRunnersLayer.innerHTML = '';

      const { w, h, dpr } = initFlashCanvasResolution();
      if (flashCtx) {
        flashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        flashCtx.clearRect(0, 0, w, h);
        drawFlashTrackBackground(flashCtx, w, h);
      }
      playSound('card');
    });

    ws.on('flash_start_flying', (data) => {
      resetFlashForm();
      if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
      if (flashOverlayCard) flashOverlayCard.classList.add('hidden');

      const { w, h, dpr } = initFlashCanvasResolution();
      if (flashCtx) {
        flashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        flashCtx.clearRect(0, 0, w, h);
        drawFlashTrackBackground(flashCtx, w, h);
      }

      const items = data.flyingItems || [];
      if (flashRunnersLayer) {
        flashRunnersLayer.innerHTML = '';
        const wrapperH = (flashCanvas && flashCanvas.clientHeight > 50) ? flashCanvas.clientHeight : (h || 320);
        const laneH = wrapperH / 5;
        const wrapperW = (flashCanvas && flashCanvas.clientWidth > 50) ? flashCanvas.clientWidth : (w || 600);
        const travelDist = Math.round(wrapperW + 140);

        items.forEach(item => {
          const el = document.createElement('div');
          el.className = 'flash-runner-item';
          const runDuration = 2.4 / (item.speed ? (item.speed / 0.38) : 1);
          const targetPixelY = Math.round((item.laneIndex + 0.5) * laneH);
          el.style.top = `${targetPixelY}px`;
          el.style.fontSize = `${item.size || 44}px`;
          el.style.setProperty('--runner-travel', `${travelDist}px`);
          el.style.animation = `runnerAcrossContainer ${runDuration.toFixed(2)}s linear ${item.delay.toFixed(2)}s forwards`;
          el.innerHTML = `
            <div class="flash-runner-hop">
              <span class="flash-runner-emoji">${item.emoji}</span>
              <span class="flash-runner-shadow"></span>
            </div>
          `;
          flashRunnersLayer.appendChild(el);
        });
      }
      playSound('card');
    });

    ws.on('flash_question', (data) => {
      resetFlashForm();
      if (data.questionType === 'COMPARE') {
        if (flashTargetEmoji) flashTargetEmoji.textContent = '⚖️';
        if (flashTargetName) flashTargetName.textContent = data.questionPrompt || '谁更多？';
      } else if (data.questionType === 'ABSENT') {
        if (flashTargetEmoji) flashTargetEmoji.textContent = '👻';
        if (flashTargetName) flashTargetName.textContent = data.questionPrompt || '哪种动物未出现？';
      } else {
        if (flashTargetEmoji) flashTargetEmoji.textContent = data.targetAnimal.emoji;
        if (flashTargetName) flashTargetName.textContent = data.targetAnimal.name;
      }
      if (flashOptionsGrid) {
        flashOptionsGrid.innerHTML = '';
        data.options.forEach(opt => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-flash-option';
          btn.textContent = opt;
          btn.onclick = () => {
            if (flashDirectInput) flashDirectInput.value = opt;
            setFlashAnswerSubmitted(opt);
            ws.emit('flash_submit_answer', { option: opt });
            playSound('tick');
          };
          flashOptionsGrid.appendChild(btn);
        });
      }
      if (flashOverlayCard) flashOverlayCard.classList.remove('hidden');
    });

    ws.on('flash_round_result', (data) => {
      playSound('fanfare');
      const ansDisplay = data.correctOption ? String(data.correctOption) : `${data.targetCount}`;
      const promptText = data.questionPrompt ? `🎯 正解：【${ansDisplay}】` : `🎯 正确数量：${data.targetCount} 只 ${data.targetAnimal ? data.targetAnimal.emoji : ''}`;
      showRevealModal(promptText, `${ansDisplay}`, 3500);
    });

    ws.on('flash_game_over', (data) => {
      showGameOverModal({
        title: '🏆 瞬间数羊 终局战报',
        desc: '动态视力巅峰王者诞生！',
        podium: data.podium || []
      });
    });

    // Bomb Roulette
    ws.on('wire_cut_safe', (data) => {
      playSound('pop');
      showToast(`✂️ ${data.playerName} 成功剪断 ${data.wire ? data.wire.name : '引线'}！+${data.earnedPoints || 50}分`, '🛡️');
    });

    ws.on('bomb_exploded', (data) => {
      playSound('boom');
      showRevealModal('💥 BOOM！！！炸弹引爆！', `💀 ${data.victimName}`, 4000);
    });

    ws.on('bomb_game_over', (data) => {
      showGameOverModal({
        title: '💣 拆弹轮盘 对决结束',
        desc: data.explodedPlayer ? `【${data.explodedPlayer.name}】触发了爆炸引线！` : '全员奇迹生还！',
        podium: data.podium || []
      });
    });

    // Bulls & Cows
    ws.on('bc_game_start', () => {
      currentBcInput = '';
      updateBcDisplay();
      if (bcLogList) bcLogList.innerHTML = '<div class="bc-empty-tip">请输入 4 位不重复数字</div>';
    });

    ws.on('bc_guess_result', (data) => {
      playSound(data.a === 4 ? 'correct' : 'tick');
      if (bcLogList) {
        bcLogList.innerHTML = '';
        data.history.forEach((h, idx) => {
          const item = document.createElement('div');
          item.className = 'bc-log-item';
          item.innerHTML = `
            <span>#${idx + 1} 猜想 <b class="bc-log-guess">${escapeHtml(h.guess)}</b></span>
            <span class="bc-log-feedback">${escapeHtml(String(h.a))}A ${escapeHtml(String(h.b))}B</span>
          `;
          bcLogList.appendChild(item);
        });
        bcLogList.scrollTop = bcLogList.scrollHeight;
      }
    });

    ws.on('bc_game_over', (data) => {
      const secretHtml = `
        <div style="background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:8px;margin-bottom:12px">
          <p style="margin:0">本局终极密码：<b style="color:#FBBF24;font-family:var(--font-mono);font-size:1.15rem">${escapeHtml(data.secretCode)}</b></p>
        </div>
      `;
      const podium = (data.standings || []).map(p => ({
        avatar: p.avatar,
        name: p.name,
        detail: p.solved ? `成功破解 (${p.attempts}次)` : `未解出 (${p.attempts}次)`,
        score: p.score || (p.solved ? 100 : 0)
      }));
      showGameOverModal({
        title: '🔢 密码破解揭晓！',
        desc: `解密王者：【${data.winnerName}】`,
        extraHtml: secretHtml,
        podium
      });
    });

    // Word Bomb
    ws.on('word_bomb_game_over', (data) => {
      showGameOverModal({
        title: '💥 词汇炸弹 决出胜者！',
        desc: `最终幸存王者：【${data.winnerName}】！`,
        podium: data.podium || []
      });
    });
  }

  // 为每个游戏挂上 init
  ['flash-counter', 'bomb-roulette', 'bulls-and-cows', 'word-bomb'].forEach(type => {
    window.PartyGames[type] = window.PartyGames[type] || {};
    window.PartyGames[type].init = attachSocketListeners;
  });
})();
