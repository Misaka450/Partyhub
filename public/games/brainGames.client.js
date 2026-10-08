/**
 * brainGames.client.js
 * ============================================================================
 * 【脑力系列小游戏前端客户端模块集】（已剔除 轨道小火车 / 折纸打孔 / 找零大师 三款）
 * 1. 颜色与文字大陷阱 (stroop-trap)
 * 2. 聚光灯拼图 / 影子猜物 (shadow-match)
 * 3. 盲猜谁最接近 (number-guess)
 * 注：西蒙节拍记忆已抽离至独立文件 simonMemory.client.js
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

// ==========================================================================
// 脑力系列小游戏 前端交互与通信 (Brain Games Client Handlers)
// ==========================================================================

// ------------------------- 1. 颜色与文字大陷阱 -------------------------
const stroopInstructionBadge = document.getElementById('stroop-instruction-badge');
const stroopTextDisplay = document.getElementById('stroop-text-display');
const stroopOptionsGrid = document.getElementById('stroop-options-grid');
const stroopFeedbackBadge = document.getElementById('stroop-feedback-badge');

function renderStroopQuestion(data) {
  const isColor = data.targetMode === 'COLOR';
  if (stroopInstructionBadge) {
    const comboPrefix = (data.combo && data.combo > 1) ? `🔥 ${data.combo} 连击！ · ` : '';
    stroopInstructionBadge.textContent = isColor ? `${comboPrefix}🎯 请按【文字颜色】选择！` : `${comboPrefix}🎯 请按【文字内容】选择！`;
    stroopInstructionBadge.style.color = isColor ? '#EF4444' : '#3B82F6';
  }

  if (stroopTextDisplay) {
    stroopTextDisplay.textContent = data.displayText;
    stroopTextDisplay.style.color = data.displayColorHex;
  }

  if (stroopOptionsGrid) {
    stroopOptionsGrid.innerHTML = '';
    data.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brain-opt-btn';
      btn.textContent = opt.name;
      btn.style.borderLeftColor = opt.hex;
      btn.style.borderLeftWidth = '6px';
      btn.onclick = () => {
        socket.emit('stroop_submit_answer', { answerId: opt.id });
        playSound('card');
      };
      stroopOptionsGrid.appendChild(btn);
    });
  }
}

socket.on('stroop_new_question', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (stroopFeedbackBadge) stroopFeedbackBadge.classList.add('hidden');
  wordHintBox.textContent = `🔥 15秒连击狂飙！连续答对连击翻倍，答错清零！`;

  renderStroopQuestion(data);
  playSound('tick');
});

socket.on('stroop_next_subquestion', (data) => {
  renderStroopQuestion(data);
});

socket.on('stroop_answer_feedback', (data) => {
  if (!stroopFeedbackBadge) return;
  stroopFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    const comboText = data.combo > 1 ? ` (🔥 ${data.combo} 连击!)` : '';
    stroopFeedbackBadge.textContent = `✓ 答对！+${data.scoreGain}分${comboText}`;
    stroopFeedbackBadge.style.background = 'var(--success-subtle)';
    stroopFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    stroopFeedbackBadge.textContent = `✕ 答错！连击清零 (-20分)`;
    stroopFeedbackBadge.style.background = 'var(--danger-subtle)';
    stroopFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('stroop_round_result', (data) => {
  playSound('fanfare');
  let summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left">';
  data.results.forEach((p, idx) => {
    summaryHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
        <span>${idx === 0 ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b></span>
        <span style="font-weight:700;color:${p.scoreGain > 0 ? 'var(--success)' : 'var(--text-muted)'}">+${p.scoreGain}分 (最高🔥${p.maxCombo}连击 / 对${p.correctCount}错${p.wrongCount})</span>
      </div>
    `;
  });
  summaryHtml += '</div>';
  const topText = data.bestComboPlayer ? `🔥 最高连击王：【${escapeHtml(data.bestComboPlayer.name)}】(🔥${data.bestComboPlayer.maxCombo}连击)` : '15秒连击狂飙结算';
  showRevealModal(topText, '', 3500, summaryHtml);
});

// ------------------------- 3. 影子猜物 / 聚光灯拼图 -------------------------
const shadowEmojiItem = document.getElementById('shadow-emoji-item');
const shadowOptionsGrid = document.getElementById('shadow-options-grid');
const shadowFeedbackBadge = document.getElementById('shadow-feedback-badge');

socket.on('shadow_new_puzzle', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (shadowFeedbackBadge) shadowFeedbackBadge.classList.add('hidden');

  const shadowBox = document.getElementById('shadow-box-container');
  if (shadowBox) shadowBox.classList.remove('revealed');

  if (shadowEmojiItem) {
    shadowEmojiItem.textContent = data.targetEmoji;
    shadowEmojiItem.classList.remove('revealed');
  }

  if (shadowOptionsGrid) {
    shadowOptionsGrid.innerHTML = '';
    data.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brain-opt-btn';
      btn.textContent = `${opt.emoji ? opt.emoji + ' ' : ''}${opt.name}`;
      btn.onclick = () => {
        socket.emit('shadow_submit_answer', { answerId: opt.id });
        shadowOptionsGrid.querySelectorAll('button').forEach(b => b.disabled = true);
        playSound('card');
      };
      shadowOptionsGrid.appendChild(btn);
    });
  }
  playSound('tick');
});

socket.on('shadow_answer_feedback', (data) => {
  if (!shadowFeedbackBadge) return;
  shadowFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    shadowFeedbackBadge.textContent = `🔦 抢答成功！得分 +${data.scoreGain}`;
    shadowFeedbackBadge.style.background = 'var(--success-subtle)';
    shadowFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    shadowFeedbackBadge.textContent = `✕ 抢答错误，被剪影骗到了！`;
    shadowFeedbackBadge.style.background = 'var(--danger-subtle)';
    shadowFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('shadow_round_result', (data) => {
  playSound('fanfare');
  const shadowBox = document.getElementById('shadow-box-container');
  if (shadowBox) shadowBox.classList.add('revealed');
  if (shadowEmojiItem) shadowEmojiItem.classList.add('revealed');
  let summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left">';
  data.results.forEach((p, idx) => {
    summaryHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
        <span>${idx === 0 ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b></span>
        <span style="font-weight:700;color:${p.isCorrect ? 'var(--success)' : 'var(--text-muted)'}">${p.isCorrect ? `+${p.scoreGain}分` : '未得分'}</span>
      </div>
    `;
  });
  summaryHtml += '</div>';
  // showRevealModal 首参走 textContent，无需预转义，防止 & < 显示为实体字符（审计 L2）
  showRevealModal(`🔦 揭晓：【${data.targetEmoji} ${data.targetName}】`, '', 3500, summaryHtml);
});

// ------------------------- 5. 西蒙说 / 节拍记忆 (已抽离至 public/games/simonMemory.client.js) -------------------------

// ------------------------- 9. 盲猜谁最接近 -------------------------
const numberTriviaQ = document.getElementById('number-trivia-q');
const numberUnitTag = document.getElementById('number-unit-tag');
const numberGuessForm = document.getElementById('number-guess-form');
const numberGuessInput = document.getElementById('number-guess-input');
const btnNumberGuessSubmit = document.getElementById('btn-number-guess-submit');
const numberResultBoard = document.getElementById('number-result-board');

socket.on('number_new_trivia', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (numberResultBoard) numberResultBoard.classList.add('hidden');
  if (numberGuessInput) {
    numberGuessInput.value = '';
    numberGuessInput.disabled = false;
  }
  if (btnNumberGuessSubmit) btnNumberGuessSubmit.disabled = false;
  if (numberTriviaQ) numberTriviaQ.textContent = data.question;
  if (numberUnitTag) numberUnitTag.textContent = data.unit;
  playSound('tick');
});

numberGuessForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!numberGuessInput) return;
  const guess = numberGuessInput.value.trim();
  if (guess !== '') {
    socket.emit('number_submit_guess', { guess });
    numberGuessInput.disabled = true;
    if (btnNumberGuessSubmit) btnNumberGuessSubmit.disabled = true;
    showToast('已提交估算数值！等待揭晓真相', '🔢');
    playSound('card');
  }
});

socket.on('number_round_result', (data) => {
  playSound('fanfare');
  let rankHtml = `
    <div style="font-size:1.1rem;font-weight:800;color:var(--primary);margin-bottom:4px">真实答案：${data.truth} ${escapeHtml(data.unit)}</div>
    <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">${escapeHtml(data.funFact)}</div>
    <div style="font-size:0.75rem;color:#f59e0b;margin-bottom:8px">🎯 偏差对决：估值最接近真实答案者荣登榜首！</div>
    <div style="display:grid;gap:6px;text-align:left">
  `;
  data.rankings.forEach((p, idx) => {
    const isBust = p.isBust;
    const badge = isBust
      ? '<span style="color:#ef4444;font-weight:bold">💥 未填有效数值 (+0分)</span>'
      : `<span style="color:var(--success);font-weight:bold">${p.diff === 0 ? '🎯 精准绝杀 ' : ''}+${p.scoreGain}分</span>`;

    rankHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:${isBust ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isBust ? 'rgba(239,68,68,0.2)' : 'var(--border)'};border-radius:6px;font-size:0.82rem">
        <span>${idx === 0 && !isBust ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b> (猜: ${p.guess ?? '未答'})</span>
        <span>${badge}</span>
      </div>
    `;
  });
  rankHtml += '</div>';

  showRevealModal(`🔢 绝不爆牌真相大揭秘`, `${data.truth} ${data.unit}`, 4500, rankHtml);
});

// =====================【脑力系列 终局结算战报】=====================
socket.on('stroop_game_over', (data) => {
  showGameOverModal({
    title: '🧠 斯特鲁普陷阱 决出胜者！',
    desc: '思维反应超群，成功避开全部色彩错觉！',
    podium: data.podium || data.scores || []
  });
});

socket.on('shadow_game_over', (data) => {
  showGameOverModal({
    title: '🔦 影子猜物 决出胜者！',
    desc: '洞察入微，聚光灯下的最强大脑！',
    podium: data.podium || data.scores || []
  });
});

socket.on('number_game_over', (data) => {
  showGameOverModal({
    title: '🔢 盲猜估数 决出胜者！',
    desc: '直觉敏锐，最贴近真相的数据预言家！',
    podium: data.podium || data.scores || []
  });
});

})();
