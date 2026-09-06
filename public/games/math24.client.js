/**
 * math24.client.js
 * ============================================================================
 * 【决战 24 点  独立前端客户端模块】
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

// =====================【决战 24 点 渲染】=====================
const cardSuits = ['♠', '♥', '♣', '♦'];

// 安全算式求值器（递归下降解析，仅支持 + - * / 与括号）：
// 与服务端 math24.js 的 Shunting-yard 同等安全级别，绝不使用 eval/Function，
// 从前端预览层面也杜绝任何表达式注入风险。非法/不完整算式直接抛错。
function safeEvalExpression(expr) {
  let i = 0;
  function parseExpr() {
    let v = parseTerm();
    while (i < expr.length && (expr[i] === '+' || expr[i] === '-')) {
      const op = expr[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (i < expr.length && (expr[i] === '*' || expr[i] === '/')) {
      const op = expr[i++];
      const r = parseFactor();
      if (op === '/' && r === 0) throw new Error('不能除以 0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parseFactor() {
    if (expr[i] === '(') {
      i++;
      const v = parseExpr();
      if (expr[i] !== ')') throw new Error('括号不匹配');
      i++;
      return v;
    }
    if (expr[i] === '-') { i++; return -parseFactor(); }
    let j = i;
    while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
    if (j === i) throw new Error('表达式无效');
    const v = parseFloat(expr.slice(i, j));
    i = j;
    return v;
  }
  const v = parseExpr();
  if (i < expr.length) throw new Error('表达式无效');
  return v;
}

function updateM24EvalPreview() {
  const evalEl = document.getElementById('m24-eval-preview');
  if (!evalEl) return;
  if (!currentM24Formula || currentM24Formula.trim() === '') {
    evalEl.textContent = '当前计算结果：--';
    evalEl.className = 'm24-eval-preview';
    return;
  }
  try {
    // 只保留数字与四则运算/括号字符后交给安全求值器（替代原先的 Function 构造器）
    const sanitized = currentM24Formula.replace(/[^0-9+\-*/()]/g, '');
    const res = safeEvalExpression(sanitized);
    if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
      const rounded = Math.round(res * 1000) / 1000;
      evalEl.textContent = `当前计算结果 = ${rounded} ${Math.abs(rounded - 24) < 0.001 ? '🎯 (正好为 24 !)' : ''}`;
      evalEl.className = Math.abs(rounded - 24) < 0.001 ? 'm24-eval-preview match-24' : 'm24-eval-preview';
    } else {
      evalEl.textContent = '当前计算结果：算式输入中...';
      evalEl.className = 'm24-eval-preview';
    }
  } catch (e) {
    evalEl.textContent = '当前计算结果：算式未完整';
    evalEl.className = 'm24-eval-preview';
  }
}

let lastM24Round = 0;
function renderMath24State(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;
  wordHintBox.textContent = `用给定的 4 张牌算 24 点！剩余 ${state.timeLeft}s`;

  if (state.currentCards && (state.round !== lastM24Round || JSON.stringify(state.currentCards) !== JSON.stringify(currentM24Cards))) {
    lastM24Round = state.round;
    currentM24Cards = [...state.currentCards];
    currentM24Formula = '';
    usedM24CardIndices = new Set();
    renderM24Cards();
  }
}

function renderM24Cards() {
  m24CardsRow.innerHTML = '';
  m24NumButtons.innerHTML = '';
  m24FormulaText.textContent = currentM24Formula || '使用下方按键拼凑 24 点算式...';
  updateM24EvalPreview();

  currentM24Cards.forEach((num, idx) => {
    const isUsed = usedM24CardIndices.has(idx);
    const suit = cardSuits[idx % 4];
    const isRed = suit === '♥' || suit === '♦';

    // 1. 精美扑克卡牌（纯展示看板）
    const cardEl = document.createElement('div');
    cardEl.className = `m24-card ${isUsed ? 'used' : ''}`;
    cardEl.innerHTML = `
      <span class="m24-card-suit" style="color: ${isRed ? '#EF4444' : '#64748B'}">${suit}</span>
      <span class="m24-card-val" style="color: ${isRed ? '#EF4444' : 'inherit'}">${num}</span>
    `;
    m24CardsRow.appendChild(cardEl);

    // 2. 对应下方快捷数字键
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-m24-num ${isUsed ? 'used' : ''}`;
    btn.textContent = num;
    btn.onclick = () => {
      if (!usedM24CardIndices.has(idx)) {
        usedM24CardIndices.add(idx);
        currentM24Formula += num;
        renderM24Cards();
        playSound('tick');
      }
    };
    m24NumButtons.appendChild(btn);
  });
}

document.querySelectorAll('.btn-m24-op[data-op]').forEach(btn => {
  btn.addEventListener('click', () => {
    const op = btn.dataset.op;
    currentM24Formula += op;
    m24FormulaText.textContent = currentM24Formula;
    updateM24EvalPreview();
    playSound('tick');
  });
});

btnM24Del?.addEventListener('click', () => {
  if (currentM24Formula.length > 0) {
    currentM24Formula = currentM24Formula.slice(0, -1);
    usedM24CardIndices.clear();
    // 重新计算使用了哪些卡牌
    let tempFormula = currentM24Formula;
    currentM24Cards.forEach((num, idx) => {
      const strNum = num.toString();
      if (tempFormula.includes(strNum)) {
        usedM24CardIndices.add(idx);
        tempFormula = tempFormula.replace(strNum, '');
      }
    });
    renderM24Cards();
    playSound('tick');
  }
});

btnM24Clear?.addEventListener('click', () => {
  currentM24Formula = '';
  usedM24CardIndices.clear();
  renderM24Cards();
  playSound('tick');
});

btnM24Submit?.addEventListener('click', () => {
  if (!currentM24Formula) return;
  socket.emit('m24_submit_solution', { expression: currentM24Formula });
  playSound('card');
});

socket.on('m24_submit_error', (data) => {
  playSound('error');
  showToast(`算式未通过：${data.reason}`, '⚠️');
});

socket.on('m24_round_ended', (data) => {
  playSound('fanfare');
  let reason = '🧮 决战 24 点 结算';
  let detailHtml = '';
  if (data.isTimeout || !data.winnerName || data.winnerName === '无人解出') {
    reason = '⏰ 时间到！本轮无人解出';
    detailHtml = `
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px">参考答案</div>
      <div style="font-size:1.5rem;font-weight:800;color:var(--accent-core);font-family:var(--font-mono)">${escapeHtml(data.solution || data.expression)} = 24</div>
    `;
  } else {
    reason = `🧮 【${escapeHtml(data.winnerName)}】神速解出！`;
    detailHtml = `<div style="font-size:1.5rem;font-weight:800;color:var(--accent-core);font-family:var(--font-mono)">${escapeHtml(data.expression)} = 24</div>`;
    if (data.solution && data.solution !== data.expression) {
      detailHtml += `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">其他参考解法：${escapeHtml(data.solution)} = 24</div>`;
    }
  }
  showRevealModal(reason, '', 4500, detailHtml);
});

socket.on('m24_game_over', (data) => {
  showGameOverModal({
    title: '🧮 决战 24 点 终局战报',
    desc: '心算王者诞生！',
    podium: data.podium || []
  });
});


})();
