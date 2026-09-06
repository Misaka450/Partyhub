/**
 * cubeCount.client.js
 * ============================================================================
 * 【3D 几何数方块 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 包含等轴测 (Isometric) 立体几何画板、深度排序算法 (Painter's Algorithm)、
 * 4选1快捷选项与观察/抢答状态流转，全部封装在此模块。
 * 对外挂载到 window.PartyGames['cube-count']。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let hasSubmittedCubeAnswer = false;
  let myCubeSubmittedVal = null;
  let currentCubeGrid = null;

  // DOM 元素引用
  let cubeCanvas = null;
  let cubeCtx = null;
  let cubeOptionsGrid = null;
  let cubeDirectForm = null;
  let cubeDirectInput = null;
  let cubeSubmitBtn = null;
  let cubePromptTitle = null;
  let cubePromptSub = null;
  let wordHintBox = null;
  let displayRoundTag = null;
  let displayRound = null;

  function ensureDomElements() {
    if (!cubeCanvas) cubeCanvas = document.getElementById('cube-canvas');
    if (!cubeCtx && cubeCanvas) cubeCtx = cubeCanvas.getContext('2d');
    if (!cubeOptionsGrid) cubeOptionsGrid = document.getElementById('cube-options-grid');
    if (!cubeDirectForm) cubeDirectForm = document.getElementById('cube-direct-form');
    if (!cubeDirectInput) cubeDirectInput = document.getElementById('cube-direct-input');
    if (!cubeSubmitBtn) cubeSubmitBtn = cubeDirectForm?.querySelector('button[type="submit"]');
    if (!cubePromptTitle) cubePromptTitle = document.getElementById('cube-prompt-title');
    if (!cubePromptSub) cubePromptSub = document.getElementById('cube-prompt-sub');
    if (!wordHintBox) wordHintBox = document.getElementById('word-hint-box');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function initCubeCanvasResolution() {
    ensureDomElements();
    return window.fitCanvasResolution ? window.fitCanvasResolution(cubeCanvas, cubeCtx, 360, 320, 600) : { w: 360, h: 320, dpr: 1 };
  }

  function setCubeObserveMode() {
    ensureDomElements();
    hasSubmittedCubeAnswer = false;
    myCubeSubmittedVal = null;
    if (cubeOptionsGrid) {
      cubeOptionsGrid.innerHTML = '<div class="cube-observe-hint">👀 观察阶段：请仔细默数方块，倒计时结束后开启抢答</div>';
    }
    if (cubeDirectInput) {
      cubeDirectInput.value = '';
      cubeDirectInput.disabled = true;
      cubeDirectInput.placeholder = '👀 观察中，稍后开启抢答...';
    }
    if (cubeSubmitBtn) {
      cubeSubmitBtn.disabled = true;
      cubeSubmitBtn.textContent = '👀 观察中...';
      cubeSubmitBtn.style.background = '';
    }
    if (cubePromptTitle) cubePromptTitle.textContent = '👀 仔细观察 3D 几何体结构并默数';
    if (cubePromptSub) cubePromptSub.textContent = '（包含内部隐藏支撑方块 · 倒计时结束后开始抢答）';
  }

  function setCubeGuessingMode(options, submittedOpt = null) {
    ensureDomElements();
    const isSubmitted = Boolean(submittedOpt || hasSubmittedCubeAnswer);
    const activeOpt = submittedOpt || myCubeSubmittedVal;

    if (cubePromptTitle) {
      cubePromptTitle.textContent = isSubmitted ? `✓ 已提交答案：【${activeOpt || ''}】` : '🧊 立方体总数是多少？';
    }
    if (cubePromptSub) {
      cubePromptSub.textContent = isSubmitted ? '（已锁定提交 · 每轮限答一次 · 等待结算...）' : '（包含内部支撑方块 · 仅限提交一次 · 抢答加分）';
    }

    if (!isSubmitted) {
      if (cubeDirectInput) {
        cubeDirectInput.value = '';
        cubeDirectInput.placeholder = '输入答案';
        cubeDirectInput.disabled = false;
      }
      if (cubeSubmitBtn) {
        cubeSubmitBtn.textContent = '提交答案';
        cubeSubmitBtn.style.background = '';
        cubeSubmitBtn.disabled = false;
      }
    }

    // 渲染 4 选 1 候选项按钮
    if (cubeOptionsGrid && options && options.length > 0) {
      cubeOptionsGrid.innerHTML = '';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-cube-option';
        btn.textContent = opt;
        if (isSubmitted) {
          btn.disabled = true;
          btn.style.pointerEvents = 'none';
          if (parseInt(opt) === parseInt(activeOpt)) {
            btn.style.opacity = '1';
            btn.style.borderColor = 'var(--success)';
            btn.style.background = 'var(--success-subtle)';
            btn.style.color = 'var(--success)';
          } else {
            btn.style.opacity = '0.35';
          }
        } else {
          btn.onclick = () => {
            if (hasSubmittedCubeAnswer) return;
            setCubeAnswerSubmitted(opt);
            const socket = window.socket;
            if (socket) socket.emit('cube_submit_answer', { option: opt });
            if (window.playSound) window.playSound('tick');
          };
        }
        cubeOptionsGrid.appendChild(btn);
      });
    }

    if (isSubmitted && activeOpt) {
      setCubeAnswerSubmitted(activeOpt);
    }
  }

  function setCubeAnswerSubmitted(opt) {
    ensureDomElements();
    hasSubmittedCubeAnswer = true;
    myCubeSubmittedVal = opt;
    if (cubeDirectInput) {
      cubeDirectInput.value = opt;
      cubeDirectInput.disabled = true;
    }
    if (cubeSubmitBtn) {
      cubeSubmitBtn.textContent = `✓ 已提交 (${opt})`;
      cubeSubmitBtn.style.background = 'var(--success)';
      cubeSubmitBtn.disabled = true;
    }
    if (cubeOptionsGrid) {
      cubeOptionsGrid.querySelectorAll('.btn-cube-option').forEach(b => {
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
    if (cubePromptTitle) cubePromptTitle.textContent = `✓ 已提交答案：【${opt}】`;
    if (cubePromptSub) cubePromptSub.textContent = '（已锁定提交 · 每轮限答一次 · 等待结算...）';
    if (wordHintBox) wordHintBox.textContent = `✓ 已提交答案 (${opt})，每轮限答一次，等待其他玩家结算...`;
  }

  // 3D 等轴测绘制引擎
  function drawIsometricCubes(c, grid, width, height, showHeightLabels = false) {
    c.clearRect(0, 0, width, height);
    if (!grid || grid.length === 0) return;

    const rows = grid.length;
    const cols = grid[0].length;
    const tileW = Math.min(68, Math.max(46, Math.floor(width / 4.4)));
    const tileH = Math.round(tileW * 0.52);
    const cubeH = Math.round(tileW * 0.56);

    const originX = width / 2;
    const originY = height / 2 + (rows * tileH) / 4 + 14;

    // 地台网格
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const gx = originX + (col - r) * (tileW / 2);
        const gy = originY + (col + r) * (tileH / 2);
        c.beginPath();
        c.moveTo(gx, gy);
        c.lineTo(gx + tileW / 2, gy + tileH / 2);
        c.lineTo(gx, gy + tileH);
        c.lineTo(gx - tileW / 2, gy + tileH / 2);
        c.closePath();
        c.fillStyle = 'rgba(255, 255, 255, 0.03)';
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        c.lineWidth = 1;
        c.stroke();
      }
    }

    // 深度排序
    const voxels = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const h = grid[r][col];
        for (let z = 0; z < h; z++) {
          voxels.push({ r, col, z, depth: (r + col) * 100 + z });
        }
      }
    }
    voxels.sort((a, b) => a.depth - b.depth);

    // 绘制立体方块
    voxels.forEach(v => {
      const x = originX + (v.col - v.r) * (tileW / 2);
      const y = originY + (v.col + v.r) * (tileH / 2) - v.z * cubeH;
      drawSingleModernVoxel(c, x, y, tileW, tileH, cubeH);
    });

    // 结算透视数字标签
    if (showHeightLabels) {
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          const h = grid[r][col];
          if (h > 0) {
            const x = originX + (col - r) * (tileW / 2);
            const topY = originY + (col + r) * (tileH / 2) - h * cubeH - 6;
            c.fillStyle = '#10B981';
            c.beginPath();
            c.arc(x, topY, 11, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = '#FFFFFF';
            c.lineWidth = 1.5;
            c.stroke();

            c.font = 'bold 11px Plus Jakarta Sans, sans-serif';
            c.fillStyle = '#FFFFFF';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(`${h}`, x, topY);
          }
        }
      }
    }
  }

  function drawSingleModernVoxel(c, x, y, w, h, ch) {
    // 顶面
    const topGrad = c.createLinearGradient(x, y - ch, x, y + h - ch);
    topGrad.addColorStop(0, '#93C5FD');
    topGrad.addColorStop(1, '#60A5FA');
    c.fillStyle = topGrad;
    c.beginPath();
    c.moveTo(x, y - ch);
    c.lineTo(x + w / 2, y + h / 2 - ch);
    c.lineTo(x, y + h - ch);
    c.lineTo(x - w / 2, y + h / 2 - ch);
    c.closePath();
    c.fill();
    c.strokeStyle = '#1E293B';
    c.lineWidth = 1.5;
    c.stroke();

    // 左侧面
    const leftGrad = c.createLinearGradient(x - w / 2, y, x, y + h);
    leftGrad.addColorStop(0, '#3B82F6');
    leftGrad.addColorStop(1, '#2563EB');
    c.fillStyle = leftGrad;
    c.beginPath();
    c.moveTo(x - w / 2, y + h / 2 - ch);
    c.lineTo(x, y + h - ch);
    c.lineTo(x, y + h);
    c.lineTo(x - w / 2, y + h / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // 右侧面
    const rightGrad = c.createLinearGradient(x, y, x + w / 2, y + h);
    rightGrad.addColorStop(0, '#2563EB');
    rightGrad.addColorStop(1, '#1D4ED8');
    c.fillStyle = rightGrad;
    c.beginPath();
    c.moveTo(x, y + h - ch);
    c.lineTo(x + w / 2, y + h / 2 - ch);
    c.lineTo(x + w / 2, y + h / 2);
    c.lineTo(x, y + h);
    c.closePath();
    c.fill();
    c.stroke();

    // 高光轮廓
    c.beginPath();
    c.moveTo(x - w / 2 + 2, y + h / 2 - ch);
    c.lineTo(x, y - ch + 2);
    c.lineTo(x + w / 2 - 2, y + h / 2 - ch);
    c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    c.lineWidth = 1;
    c.stroke();
  }

  function bindEvents(socket) {
    ensureDomElements();
    if (cubeDirectForm && !cubeDirectForm._eventsBound) {
      cubeDirectForm._eventsBound = true;
      cubeDirectForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (hasSubmittedCubeAnswer || cubeDirectInput?.disabled) return;
        const val = parseInt(cubeDirectInput?.value);
        if (!isNaN(val) && val > 0) {
          setCubeAnswerSubmitted(val);
          if (socket) socket.emit('cube_submit_answer', { option: val });
          if (window.playSound) window.playSound('tick');
        }
      });
    }

    if (!socket || socket._cubeBound) return;
    socket._cubeBound = true;

    socket.on('cube_start_observe', (data) => {
      setCubeObserveMode();
      currentCubeGrid = data.grid;
      const { w, h, dpr } = initCubeCanvasResolution();
      if (!cubeCanvas || !cubeCtx) return;
      cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawIsometricCubes(cubeCtx, data.grid, w, h, false);
      if (window.playSound) window.playSound('card');
    });

    socket.on('cube_question', (data) => {
      if (data.grid) currentCubeGrid = data.grid;
      const { w, h, dpr } = initCubeCanvasResolution();
      if (cubeCanvas && cubeCtx && currentCubeGrid) {
        cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawIsometricCubes(cubeCtx, currentCubeGrid, w, h, false);
      }
      setCubeGuessingMode(data.options);
      if (window.playSound) window.playSound('pop');
    });

    socket.on('cube_round_result', (data) => {
      if (window.playSound) window.playSound('fanfare');
      if (data.grid && cubeCanvas && cubeCtx) {
        const { w, h, dpr } = initCubeCanvasResolution();
        cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawIsometricCubes(cubeCtx, data.grid, w, h, true);
      }
      if (cubePromptTitle) cubePromptTitle.textContent = `🎯 正确方块总数：【${data.totalCubes} 个】`;
      if (cubePromptSub) cubePromptSub.textContent = '（绿色圆圈标明了各柱高度 · 正在结算战报）';
      if (window.showRevealModal) window.showRevealModal('🧊 正确方块总数：', `${data.totalCubes} 个`, 3500);
    });

    socket.on('cube_game_over', (data) => {
      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: '🧊 3D 几何数方块 空间总榜',
          desc: '空间想象力之王诞生！',
          podium: data.podium || []
        });
      }
    });
  }

  window.PartyGames['cube-count'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDomElements();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

      const myToken = window.myPlayerToken;
      const isMySubmitted = state.answeredTokens && (state.answeredTokens.includes(myToken) || (window.socket && state.answeredTokens.includes(window.socket.id)));

      if (state.status === 'CUBE_OBSERVE') {
        if (wordHintBox) wordHintBox.textContent = `👀 观察 3D 几何体结构并默数... 剩余 ${state.timeLeft}s`;
        if (!cubeOptionsGrid?.querySelector('.cube-observe-hint')) {
          setCubeObserveMode();
        }
      } else if (state.status === 'CUBE_GUESSING') {
        if (isMySubmitted || hasSubmittedCubeAnswer) {
          if (wordHintBox) wordHintBox.textContent = `✓ 已提交答案，每轮限答一次，等待结算... 剩余 ${state.timeLeft}s`;
        } else {
          if (wordHintBox) wordHintBox.textContent = `❓ 请选择立方体总数（限答一次）！剩余 ${state.timeLeft}s`;
        }
        if (state.options && state.options.length > 0 && (cubeOptionsGrid.children.length === 0 || cubeOptionsGrid.querySelector('.cube-observe-hint'))) {
          setCubeGuessingMode(state.options, (isMySubmitted || hasSubmittedCubeAnswer) ? (myCubeSubmittedVal || cubeDirectInput?.value) : null);
        }
      } else if (state.status === 'CUBE_ROUND_RESULT') {
        if (wordHintBox) wordHintBox.textContent = `🎯 结算中，准备进入下一轮...`;
      }

      if (currentCubeGrid) {
        const { w, h, dpr } = initCubeCanvasResolution();
        if (cubeCtx) {
          cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawIsometricCubes(cubeCtx, currentCubeGrid, w, h, state.status === 'CUBE_ROUND_RESULT');
        }
      }
    }
  };
})();
