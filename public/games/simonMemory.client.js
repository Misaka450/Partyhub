/**
 * simonMemory.client.js
 * ============================================================================
 * 【西蒙节拍记忆 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 包含四色发光轮盘节拍播放、正向/逆向顺序复现作答、步数计数与反馈判定。
 * 对外挂载到 window.PartyGames['simon-memory']。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let simonInputActive = false;
  let currentSimonStep = 0;

  // DOM 缓存
  let simonStatusPill = null;
  let simonStepCounter = null;
  let simonFeedbackBadge = null;
  let displayRoundTag = null;
  let displayRound = null;

  function ensureDomElements() {
    if (!simonStatusPill) simonStatusPill = document.getElementById('simon-status-pill');
    if (!simonStepCounter) simonStepCounter = document.getElementById('simon-step-counter');
    if (!simonFeedbackBadge) simonFeedbackBadge = document.getElementById('simon-feedback-badge');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function flashSimonColor(color, duration = 400) {
    const btn = document.querySelector(`.simon-${color}`);
    if (btn) {
      btn.classList.add('active');
      if (window.playSound) window.playSound('tick');
      setTimeout(() => btn.classList.remove('active'), duration);
    }
  }

  function bindEvents(socket) {
    ensureDomElements();
    document.querySelectorAll('.simon-btn[data-color]').forEach(btn => {
      if (btn._simonBound) return;
      btn._simonBound = true;
      btn.addEventListener('click', () => {
        if (!simonInputActive) return;
        const color = btn.dataset.color;
        flashSimonColor(color, 200);
        const ws = window.socket;
        if (ws) ws.emit('simon_submit_step', { color });
      });
    });

    if (!socket || socket._simonBound) return;
    socket._simonBound = true;

    socket.on('simon_start_demo', (data) => {
      ensureDomElements();
      displayRoundTag?.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
      if (simonFeedbackBadge) simonFeedbackBadge.classList.add('hidden');
      simonInputActive = false;
      if (simonStatusPill) simonStatusPill.textContent = `🎶 观看发光节拍（共 ${data.sequence.length} 步）...`;
      if (simonStepCounter) simonStepCounter.textContent = `0/${data.sequence.length}`;

      data.sequence.forEach((color, idx) => {
        setTimeout(() => {
          flashSimonColor(color, 450);
        }, (idx + 1) * 650);
      });
    });

    socket.on('simon_start_input', (data) => {
      ensureDomElements();
      simonInputActive = true;
      currentSimonStep = 0;
      if (simonStatusPill) {
        if (data.isReverse) {
          simonStatusPill.textContent = `🔄 逆向挑战：请完全【倒序】从后往前点击！`;
          simonStatusPill.style.color = '#f59e0b';
        } else {
          simonStatusPill.textContent = `🕹️ 开始按顺序点击复现！`;
          simonStatusPill.style.color = '';
        }
      }
      if (window.playSound) window.playSound('pop');
    });

    socket.on('simon_step_feedback', (data) => {
      ensureDomElements();
      if (simonStepCounter) simonStepCounter.textContent = `${data.stepIndex + 1}`;
      if (!simonFeedbackBadge) return;

      if (data.isFailed) {
        simonInputActive = false;
        simonFeedbackBadge.classList.remove('hidden');
        simonFeedbackBadge.textContent = '✕ 节拍按错，本轮淘汰！';
        simonFeedbackBadge.style.background = 'var(--danger-subtle)';
        simonFeedbackBadge.style.color = 'var(--danger)';
        if (window.playSound) window.playSound('error');
      } else if (data.isCompleted) {
        simonInputActive = false;
        simonFeedbackBadge.classList.remove('hidden');
        simonFeedbackBadge.textContent = `🎉 完美复现全部节拍！(+${data.scoreGain}分)`;
        simonFeedbackBadge.style.background = 'var(--success-subtle)';
        simonFeedbackBadge.style.color = 'var(--success)';
        if (window.playSound) window.playSound('fanfare');
      }
    });

    socket.on('simon_round_result', (data) => {
      ensureDomElements();
      if (window.playSound) window.playSound('fanfare');
      let summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left">';
      data.results.forEach((p, idx) => {
        const esc = window.escapeHtml || (s => s);
        summaryHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
            <span>${idx === 0 ? '👑 ' : ''}${esc(p.avatar)} <b>${esc(p.name)}</b></span>
            <span style="font-weight:700;color:${p.isCompleted ? 'var(--success)' : 'var(--text-muted)'}">${p.isCompleted ? `+${p.scoreGain}分` : `完成${p.completedSteps}步`}</span>
          </div>
        `;
      });
      summaryHtml += '</div>';
      if (window.showRevealModal) window.showRevealModal(`🎶 西蒙节拍结算`, '', 3500, summaryHtml);
    });

    socket.on('simon_game_over', (data) => {
      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: '🎶 西蒙节拍记忆 终极榜单',
          desc: '绝对音准记忆大师！',
          podium: data.podium || []
        });
      }
    });
  }

  window.PartyGames['simon-memory'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDomElements();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;
    }
  };
})();
