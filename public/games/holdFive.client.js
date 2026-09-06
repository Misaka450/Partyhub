/**
 * holdFive.client.js
 * ============================================================================
 * 【盲压5秒 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 将盲压挑战的内心节拍计时、干扰弹幕、长按震动反馈与战报逻辑完全打包在此。
 * 对外挂载到 window.PartyGames['hold-five']，零代码污染。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let hasSubmittedHold = false;
  let isHoldingButton = false;
  let holdPressStartTime = null;
  let currentHoldIsChaos = false;
  let holdChaosInterval = null;

  // DOM 缓存
  let btnHoldTrigger = null;
  let holdText = null;
  let holdResultBox = null;
  let holdScoreTime = null;
  let holdScoreDiff = null;
  let wordHintBox = null;
  let displayRoundTag = null;
  let displayRound = null;
  let timerBox = null;

  function ensureDomElements() {
    if (!btnHoldTrigger) btnHoldTrigger = document.getElementById('btn-hold-trigger');
    if (!holdText) holdText = document.getElementById('hold-text');
    if (!holdResultBox) holdResultBox = document.getElementById('hold-result-box');
    if (!holdScoreTime) holdScoreTime = document.getElementById('hold-score-time');
    if (!holdScoreDiff) holdScoreDiff = document.getElementById('hold-score-diff');
    if (!wordHintBox) wordHintBox = document.getElementById('word-hint-box');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
    if (!timerBox) timerBox = document.getElementById('timer-box');
  }

  function handleHoldStart(e) {
    if (hasSubmittedHold) return;
    if (e && e.cancelable) e.preventDefault();
    if (window.initAudio) window.initAudio();
    isHoldingButton = true;
    holdPressStartTime = performance.now();
    ensureDomElements();
    if (btnHoldTrigger) btnHoldTrigger.classList.add('pressing');
    if (holdText) holdText.textContent = '计时中...松开提交';
    if (window.playSound) window.playSound('tick');

    // 障眼法声光干扰：按压期间冷不丁闪烁假数字打乱节拍
    const chaosOverlay = document.getElementById('hold-chaos-overlay');
    if (currentHoldIsChaos && chaosOverlay) {
      if (holdChaosInterval) clearInterval(holdChaosInterval);
      const fakeAlerts = ['4.8s!', '5.0s!', '3.2s!', '⚡哔!', '6.1s!', '快了!', '4.99s!'];
      holdChaosInterval = setInterval(() => {
        if (!isHoldingButton) {
          clearInterval(holdChaosInterval);
          return;
        }
        if (Math.random() < 0.6) {
          chaosOverlay.textContent = fakeAlerts[Math.floor(Math.random() * fakeAlerts.length)];
          chaosOverlay.classList.remove('hidden');
          setTimeout(() => { chaosOverlay?.classList.add('hidden'); }, 350);
        }
      }, 700);
    }
  }

  function handleHoldEnd(e) {
    if (!isHoldingButton || hasSubmittedHold) return;
    if (e && e.cancelable) e.preventDefault();
    isHoldingButton = false;
    if (holdChaosInterval) clearInterval(holdChaosInterval);
    const chaosOverlay = document.getElementById('hold-chaos-overlay');
    if (chaosOverlay) chaosOverlay.classList.add('hidden');

    ensureDomElements();
    if (btnHoldTrigger) {
      btnHoldTrigger.classList.remove('pressing');
      btnHoldTrigger.style.pointerEvents = 'none';
    }

    if (holdPressStartTime) {
      const elapsedMs = Math.round(performance.now() - holdPressStartTime);
      holdPressStartTime = null;
      hasSubmittedHold = true;
      if (holdText) holdText.textContent = '已提交！等待结算...';
      const wagerToggle = document.getElementById('hold-wager-toggle');
      const isWager = Boolean(wagerToggle && wagerToggle.checked);
      const socket = window.socket;
      if (socket) {
        socket.emit('hold_submit_time', { elapsedMs, isWager });
      }
      if (window.playSound) window.playSound('card');
    }
  }

  function bindEvents(socket) {
    ensureDomElements();
    if (btnHoldTrigger && !btnHoldTrigger._eventsBound) {
      btnHoldTrigger._eventsBound = true;
      btnHoldTrigger.addEventListener('mousedown', handleHoldStart);
      window.addEventListener('mouseup', handleHoldEnd);

      btnHoldTrigger.addEventListener('touchstart', handleHoldStart, { passive: false });
      window.addEventListener('touchend', handleHoldEnd, { passive: false });
      window.addEventListener('touchcancel', handleHoldEnd);
    }

    if (!socket || socket._holdBound) return;
    socket._holdBound = true;

    socket.on('hold_start_round', (data) => {
      ensureDomElements();
      hasSubmittedHold = false;
      isHoldingButton = false;
      holdPressStartTime = null;
      currentHoldIsChaos = Boolean(data.isChaosMode);
      if (holdChaosInterval) clearInterval(holdChaosInterval);
      const chaosOverlay = document.getElementById('hold-chaos-overlay');
      if (chaosOverlay) {
        chaosOverlay.classList.add('hidden');
        chaosOverlay.textContent = '';
      }

      if (holdResultBox) holdResultBox.classList.add('hidden');
      if (btnHoldTrigger) {
        btnHoldTrigger.classList.remove('pressing');
        btnHoldTrigger.style.pointerEvents = '';
      }
      if (holdText) holdText.textContent = '按住开始计时';

      const targetSec = data.targetSeconds ? `${data.targetSeconds}.000` : '5.000';
      const targetTitle = document.getElementById('hold-target-title');
      if (targetTitle) {
        targetTitle.textContent = `🎯 目标时间：${targetSec} 秒${currentHoldIsChaos ? ' ⚡[干扰模式]' : ''}`;
      }
      if (wordHintBox) wordHintBox.textContent = `按住大按钮，在正好 ${targetSec} 秒时松手！剩余 ${data.timeLeft}s`;

      if (window.playSound) window.playSound('card');
    });

    socket.on('hold_submit_feedback', (data) => {
      ensureDomElements();
      if (window.playSound) window.playSound('tick');
      if (holdScoreTime) holdScoreTime.textContent = `${data.seconds.toFixed(3)}s`;
      if (holdScoreDiff) holdScoreDiff.textContent = `误差 ±${data.diff.toFixed(3)}s`;
      if (holdResultBox) holdResultBox.classList.remove('hidden');
    });

    socket.on('hold_round_summary', (data) => {
      ensureDomElements();
      if (window.playSound) window.playSound('fanfare');
      let summaryHtml = '';
      if (data.summary && data.summary.length > 0) {
        summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left;max-height:220px;overflow-y:auto">';
        data.summary.forEach((p, idx) => {
          const esc = window.escapeHtml || (s => s);
          summaryHtml += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
              <span>${idx === 0 ? '👑 ' : ''}${esc(p.avatar)} <b>${esc(p.name)}</b></span>
              <span style="font-weight:700;color:var(--accent-core)">${p.seconds} <small style="color:var(--text-muted);font-weight:normal">(${p.diff})</small></span>
            </div>
          `;
        });
        summaryHtml += '</div>';
      }
      if (window.showRevealModal) {
        window.showRevealModal(`⏱️ 本轮时间领主：【${data.bestHolder}】`, '5.000s', 4500, summaryHtml);
      }
    });

    socket.on('hold_game_over', (data) => {
      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: '⏱️ 盲压挑战 荣耀颁奖台',
          desc: '神级生物钟领主诞生！',
          podium: data.podium || []
        });
      }
    });
  }

  window.PartyGames['hold-five'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDomElements();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

      const targetSec = state.targetSeconds ? `${state.targetSeconds}.000` : '5.000';
      const targetTitle = document.getElementById('hold-target-title');
      if (targetTitle) {
        targetTitle.textContent = `🎯 目标时间：${targetSec} 秒`;
      }

      const myToken = window.myPlayerToken;
      const isMySubmitted = hasSubmittedHold || (state.heldTokens && state.heldTokens.includes(myToken)) || (state.answeredTokens && state.answeredTokens.includes(myToken));

      if (state.status === 'HOLD_PRESSING') {
        timerBox?.classList.add('hidden'); // 盲压阶段隐藏顶部倒计时秒数防作弊
        if (wordHintBox) wordHintBox.textContent = `🎯 凭内心节奏按住大按钮，在正好 ${targetSec} 秒时精准松开！`;
        if (btnHoldTrigger) {
          btnHoldTrigger.classList.remove('hidden');
          if (isMySubmitted) {
            btnHoldTrigger.classList.remove('pressing');
            btnHoldTrigger.style.pointerEvents = 'none';
            if (holdText) holdText.textContent = '已提交！等待结算...';
          } else if (isHoldingButton) {
            btnHoldTrigger.classList.add('pressing');
            btnHoldTrigger.style.pointerEvents = '';
            if (holdText) holdText.textContent = '计时中...松开提交';
          } else {
            btnHoldTrigger.classList.remove('pressing');
            btnHoldTrigger.style.pointerEvents = '';
            if (holdText) holdText.textContent = '按住开始计时';
          }
        }
      } else {
        timerBox?.classList.remove('hidden');
        if (btnHoldTrigger) {
          btnHoldTrigger.classList.remove('pressing');
          btnHoldTrigger.style.pointerEvents = 'none';
        }
        if (state.status === 'HOLD_ROUND_RESULT' && isMySubmitted && holdText) {
          holdText.textContent = '已结算！';
        }
      }
    }
  };
})();
