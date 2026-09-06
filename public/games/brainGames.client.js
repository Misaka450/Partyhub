/**
 * brainGames.client.js
 * ============================================================================
 * 【9款全新脑力系列小游戏  独立前端客户端模块集】
 * 1. 颜色与文字大陷阱 (stroop-trap)
 * 2. 谁是多胞胎 / 找不同 (twin-finder)
 * 3. 聚光灯拼图 / 影子猜物 (shadow-match)
 * 4. 谁不见了 / 偷吃怪 (who-disappeared)
 * 6. 轨道连连通 / 小火车快跑 (train-route)
 * 7. 几何折纸打孔展开 (hole-punch)
 * 8. 找零钱大师 (change-master)
 * 9. 盲猜谁最接近 (number-guess)
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
// 17. 9款全新脑力系列小游戏 前端交互与通信 (Brain Games Client Handlers)
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

// ------------------------- 2. 谁是多胞胎 / 找不同 -------------------------
const twinPromptBanner = document.getElementById('twin-prompt-banner');
const twinCardsGrid = document.getElementById('twin-cards-grid');
const twinFeedbackBadge = document.getElementById('twin-feedback-badge');

socket.on('twin_new_puzzle', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (twinPromptBanner) twinPromptBanner.textContent = data.prompt;
  if (twinFeedbackBadge) twinFeedbackBadge.classList.add('hidden');

  if (twinCardsGrid) {
    twinCardsGrid.innerHTML = '';
    data.characters.forEach((char, idx) => {
      const card = document.createElement('div');
      card.className = 'twin-char-card';
      card.style.backgroundColor = char.bgColor;
      card.innerHTML = `
        <div class="twin-avatar-face">${char.head}</div>
        <div class="twin-props-row">
          <span>${char.accessory}</span>
          <span>${char.handItem}</span>
        </div>
      `;
      card.onclick = () => {
        socket.emit('twin_submit_answer', { selectedIndex: idx });
        card.classList.add('selected');
        twinCardsGrid.querySelectorAll('.twin-char-card').forEach(c => c.style.pointerEvents = 'none');
        playSound('card');
      };
      twinCardsGrid.appendChild(card);
    });
  }
  playSound('tick');
});

socket.on('twin_answer_feedback', (data) => {
  if (!twinFeedbackBadge) return;
  twinFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    twinFeedbackBadge.textContent = `👀 火眼金睛！猜对了 (+${data.scoreGain}分)`;
    twinFeedbackBadge.style.background = 'var(--success-subtle)';
    twinFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    twinFeedbackBadge.textContent = `✕ 没看准，差一点点！`;
    twinFeedbackBadge.style.background = 'var(--danger-subtle)';
    twinFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('twin_round_result', (data) => {
  playSound('fanfare');
  if (twinCardsGrid && data.correctIndices) {
    const cards = twinCardsGrid.querySelectorAll('.twin-char-card');
    data.correctIndices.forEach(idx => {
      if (cards[idx]) cards[idx].classList.add('correct');
    });
  }
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
  showRevealModal(`🔍 答案揭晓！`, '', 3500, summaryHtml);
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
      btn.textContent = `${opt.emoji} ${opt.name}`;
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

// ------------------------- 4. 谁不见了 / 偷吃怪 -------------------------
const disappearPlate = document.getElementById('disappear-plate');
const disappearOptionsGrid = document.getElementById('disappear-options-grid');
const disappearStatusTag = document.getElementById('disappear-status-tag');
const disappearFeedbackBadge = document.getElementById('disappear-feedback-badge');

function handleDisappearMemory(data) {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (disappearFeedbackBadge) disappearFeedbackBadge.classList.add('hidden');
  if (disappearOptionsGrid) disappearOptionsGrid.classList.add('hidden');

  if (disappearStatusTag) disappearStatusTag.textContent = '👀 记忆阶段：仔细记住餐盘上的所有美食！';

  const items = data.items || data.initialItems || [];
  if (disappearPlate) {
    disappearPlate.innerHTML = '';
    items.forEach(item => {
      const food = document.createElement('div');
      food.className = 'disappear-food-item';
      food.textContent = item.emoji;
      food.title = item.name;
      disappearPlate.appendChild(food);
    });
  }
  playSound('tick');
}

socket.on('disappear_memory_start', handleDisappearMemory);
socket.on('disappear_start_memorize', handleDisappearMemory);

function handleDisappearGuess(data) {
  if (disappearStatusTag) disappearStatusTag.textContent = '👾 嗷呜！哪个食物被偷吃了？快选！';
  playSound('pop');

  const remaining = data.remainingItems || data.items || [];
  if (disappearPlate) {
    disappearPlate.innerHTML = '';
    remaining.forEach(item => {
      const food = document.createElement('div');
      food.className = 'disappear-food-item';
      food.textContent = item.emoji;
      food.title = item.name;
      disappearPlate.appendChild(food);
    });
  }

  if (disappearOptionsGrid) {
    disappearOptionsGrid.classList.remove('hidden');
    disappearOptionsGrid.innerHTML = '';
    (data.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brain-opt-btn';
      btn.textContent = `${opt.emoji} ${opt.name}`;
      btn.onclick = () => {
        socket.emit('disappear_submit_answer', { answerId: opt.id });
        disappearOptionsGrid.querySelectorAll('button').forEach(b => b.disabled = true);
        playSound('card');
      };
      disappearOptionsGrid.appendChild(btn);
    });
  }
}

socket.on('disappear_guess_start', handleDisappearGuess);
socket.on('disappear_start_guess', handleDisappearGuess);

socket.on('disappear_answer_feedback', (data) => {
  if (!disappearFeedbackBadge) return;
  disappearFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    disappearFeedbackBadge.textContent = `✓ 记忆超群！猜中了 (+${data.scoreGain}分)`;
    disappearFeedbackBadge.style.background = 'var(--success-subtle)';
    disappearFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    disappearFeedbackBadge.textContent = `✕ 记串味啦！不是这个`;
    disappearFeedbackBadge.style.background = 'var(--danger-subtle)';
    disappearFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('disappear_round_result', (data) => {
  playSound('fanfare');
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
  // showRevealModal 首参走 textContent，无需预转义（审计 L2）
  showRevealModal(`👾 消失的美食是：【${data.eatenItem?.emoji || ''} ${data.eatenItem?.name || ''}】`, '', 3500, summaryHtml);
});

// ------------------------- 5. 西蒙说 / 节拍记忆 (已抽离至 public/games/simonMemory.client.js) -------------------------

// ------------------------- 6. 轨道小火车 -------------------------
const trainBoardGrid = document.getElementById('train-board-grid');
const trainOptionsDock = document.getElementById('train-options-dock');
const trainFeedbackBadge = document.getElementById('train-feedback-badge');

const TRACK_ICONS = {
  'straight-h': '═',
  'straight-v': '║',
  'curve-rd': '╔',
  'curve-ld': '╗',
  'curve-ru': '╚',
  'curve-lu': '╝',
  'empty': '',
  'missing': '❓'
};

socket.on('train_new_puzzle', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (trainFeedbackBadge) trainFeedbackBadge.classList.add('hidden');

  if (trainBoardGrid) {
    trainBoardGrid.innerHTML = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = document.createElement('div');
        const trackType = data.grid[r][c];
        const isMissing = r === data.missingPos.r && c === data.missingPos.c;
        cell.className = `train-cell ${isMissing ? 'missing-spot' : ''}`;
        cell.textContent = isMissing ? '❓' : (TRACK_ICONS[trackType] || '');
        trainBoardGrid.appendChild(cell);
      }
    }
  }

  if (trainOptionsDock) {
    trainOptionsDock.innerHTML = '';
    data.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'train-opt-btn';
      btn.innerHTML = `<span>${opt.icon}</span><small style="font-size:0.68rem;color:var(--text-muted)">${opt.name}</small>`;
      btn.onclick = () => {
        socket.emit('train_submit_answer', { trackId: opt.id });
        trainOptionsDock.querySelectorAll('button').forEach(b => b.disabled = true);
        playSound('card');
      };
      trainOptionsDock.appendChild(btn);
    });
  }
  playSound('tick');
});

socket.on('train_answer_feedback', (data) => {
  if (!trainFeedbackBadge) return;
  trainFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    trainFeedbackBadge.textContent = `🚂 线路畅通！小火车顺利发车 (+${data.scoreGain}分)`;
    trainFeedbackBadge.style.background = 'var(--success-subtle)';
    trainFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    trainFeedbackBadge.textContent = `✕ 轨道接错，小火车出轨啦！`;
    trainFeedbackBadge.style.background = 'var(--danger-subtle)';
    trainFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('train_round_result', (data) => {
  playSound('fanfare');
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
  // showRevealModal 首参走 textContent，无需预转义（审计 L2）
  showRevealModal(`🚂 正确轨道块：【${data.correctTrackName}】`, '', 3500, summaryHtml);
});

// ------------------------- 7. 折纸打孔展开 -------------------------
const holeFoldInfo = document.getElementById('hole-fold-info');
const holeFoldedPreview = document.getElementById('hole-folded-preview');
const holeOptionsGrid = document.getElementById('hole-options-grid');
const holeFeedbackBadge = document.getElementById('hole-feedback-badge');

socket.on('hole_new_puzzle', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (holeFeedbackBadge) holeFeedbackBadge.classList.add('hidden');
  if (holeFoldInfo) holeFoldInfo.textContent = data.foldDescription;

  if (holeFoldedPreview && data.punchPos) {
    const dot = holeFoldedPreview.querySelector('.punch-indicator-dot');
    if (dot) {
      dot.style.top = `${(data.punchPos.r + 0.5) * 25}%`;
      dot.style.left = `${(data.punchPos.c + 0.5) * 25}%`;
    }
  }

  if (holeOptionsGrid) {
    holeOptionsGrid.innerHTML = '';
    data.options.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'hole-opt-card';
      const miniGrid = document.createElement('div');
      miniGrid.className = 'hole-mini-grid';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const cell = document.createElement('div');
          cell.className = `hole-mini-cell ${opt.grid[r][c] ? 'has-hole' : ''}`;
          miniGrid.appendChild(cell);
        }
      }
      card.appendChild(miniGrid);
      card.onclick = () => {
        socket.emit('hole_submit_answer', { optionId: opt.optionId });
        holeOptionsGrid.querySelectorAll('.hole-opt-card').forEach(c => c.style.pointerEvents = 'none');
        playSound('card');
      };
      holeOptionsGrid.appendChild(card);
    });
  }
  playSound('tick');
});

socket.on('hole_answer_feedback', (data) => {
  if (!holeFeedbackBadge) return;
  holeFeedbackBadge.classList.remove('hidden');
  if (data.isCorrect) {
    holeFeedbackBadge.textContent = `📄 空间镜像大师！完全正确 (+${data.scoreGain}分)`;
    holeFeedbackBadge.style.background = 'var(--success-subtle)';
    holeFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    holeFeedbackBadge.textContent = `✕ 镜像脑补错位啦！`;
    holeFeedbackBadge.style.background = 'var(--danger-subtle)';
    holeFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('hole_round_result', (data) => {
  playSound('fanfare');
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
  showRevealModal(`📄 折纸展开图 结算`, '', 3500, summaryHtml);
});

// ------------------------- 8. 找零钱大师 -------------------------
const cashPaidVal = document.getElementById('cash-paid-val');
const cashCostVal = document.getElementById('cash-cost-val');
const cashDueVal = document.getElementById('cash-due-val');
const cashCurrentSum = document.getElementById('cash-current-sum');
const btnCashReset = document.getElementById('btn-cash-reset');
const btnCashConfirm = document.getElementById('btn-cash-confirm');
const cashFeedbackBadge = document.getElementById('cash-feedback-badge');

let selectedCashCounts = {};
let currentSelectedTotal = 0;

function updateCashDisplay() {
  currentSelectedTotal = 0;
  for (const [denom, count] of Object.entries(selectedCashCounts)) {
    currentSelectedTotal += Number(denom) * count;
  }
  if (cashCurrentSum) {
    cashCurrentSum.textContent = `¥${currentSelectedTotal}`;
  }
}

socket.on('change_new_bill', (data) => {
  displayRoundTag?.classList.remove('hidden');
  if (displayRound) displayRound.textContent = `第 ${data.round}/${data.maxRounds} 轮`;
  if (cashFeedbackBadge) cashFeedbackBadge.classList.add('hidden');
  if (cashPaidVal) cashPaidVal.textContent = `¥${data.paid}`;
  if (cashCostVal) cashCostVal.textContent = `¥${data.cost}`;
  if (cashDueVal) cashDueVal.textContent = `¥${data.changeDue}`;

  // 零钱危机：处理缺货面额
  document.querySelectorAll('.cash-chip-btn[data-denom]').forEach(btn => {
    const denom = Number(btn.dataset.denom);
    if (data.depletedDenom && denom === data.depletedDenom) {
      btn.disabled = true;
      btn.style.opacity = '0.35';
      btn.style.filter = 'grayscale(1)';
      btn.style.pointerEvents = 'none';
      btn.setAttribute('title', '¥' + denom + ' 纸币已找完！');
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.filter = 'none';
      btn.style.pointerEvents = '';
      btn.removeAttribute('title');
    }
  });

  const crisisNotice = data.depletedDenom ? ` · ⚠️¥${data.depletedDenom}已找完！` : '';
  wordHintBox.textContent = `请以最少张数凑齐 ¥${data.changeDue}${crisisNotice}！最少需 ${data.minSheets || 1} 张`;

  selectedCashCounts = {};
  updateCashDisplay();
  playSound('tick');
});

document.querySelectorAll('.cash-chip-btn[data-denom]').forEach(btn => {
  btn.addEventListener('click', () => {
    const denom = Number(btn.dataset.denom);
    selectedCashCounts[denom] = (selectedCashCounts[denom] || 0) + 1;
    updateCashDisplay();
    playSound('tick');
  });
});

btnCashReset?.addEventListener('click', () => {
  selectedCashCounts = {};
  updateCashDisplay();
  playSound('card');
});

btnCashConfirm?.addEventListener('click', () => {
  socket.emit('change_submit_counts', { counts: selectedCashCounts });
  playSound('card');
});

socket.on('change_answer_feedback', (data) => {
  if (!cashFeedbackBadge) return;
  cashFeedbackBadge.classList.remove('hidden');
  if (data.isValid) {
    if (data.isOptimal) {
      cashFeedbackBadge.textContent = `💵 完美贪心！最少 ${data.sheetCount} 张分毫不差！(+${data.scoreGain}分)`;
    } else {
      cashFeedbackBadge.textContent = `💵 找零正确，但多用了 ${data.sheetCount - data.minSheets} 张纸币 (+${data.scoreGain}分)`;
    }
    cashFeedbackBadge.style.background = 'var(--success-subtle)';
    cashFeedbackBadge.style.color = 'var(--success)';
    playSound('pop');
  } else {
    if (data.usedDepleted) {
      cashFeedbackBadge.textContent = `✕ 使用了已用完的面额！(-30分)`;
    } else {
      cashFeedbackBadge.textContent = `✕ 找零有误（交付 ¥${data.total}，应找 ¥${data.expectedChange}）(-30分)`;
    }
    cashFeedbackBadge.style.background = 'var(--danger-subtle)';
    cashFeedbackBadge.style.color = 'var(--danger)';
    playSound('error');
  }
});

socket.on('change_round_result', (data) => {
  playSound('fanfare');
  let summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left">';
  data.results.forEach((p, idx) => {
    summaryHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
        <span>${idx === 0 ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b></span>
        <span style="font-weight:700;color:${p.isValid ? 'var(--success)' : 'var(--text-muted)'}">${p.isValid ? `+${p.scoreGain}分 (${p.timeUsed}s)` : '金额不符'}</span>
      </div>
    `;
  });
  summaryHtml += '</div>';
  showRevealModal(`💵 找零应为：¥${data.changeDue}`, '', 3500, summaryHtml);
});

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

})();
