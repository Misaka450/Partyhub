const socket = io();

// 主题管理 (深色 / 浅色模式)
let currentTheme = localStorage.getItem('party_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('party_theme', theme);
  
  const loginThemeBtn = document.getElementById('btn-login-theme');
  if (loginThemeBtn) {
    const label = loginThemeBtn.querySelector('.theme-label');
    if (label) label.textContent = theme === 'light' ? '深色' : '浅色';
  }
  
  const roomThemeBtn = document.getElementById('btn-toggle-theme');
  if (roomThemeBtn) {
    roomThemeBtn.title = theme === 'light' ? '切换为深色模式' : '切换为浅色模式';
    roomThemeBtn.innerHTML = theme === 'light' 
      ? '<svg class="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg class="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }
}

function toggleTheme() {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}

// 立即应用主题
applyTheme(currentTheme);

// 全局安全转义与输入法状态
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let isIMEComposing = false;
document.addEventListener('compositionstart', () => { isIMEComposing = true; });
document.addEventListener('compositionend', () => { isIMEComposing = false; });

// 身份持久化
let myPlayerToken = localStorage.getItem('dg_player_token') || `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('dg_player_token', myPlayerToken);

let savedName = localStorage.getItem('dg_player_name') || ('玩家' + Math.floor(Math.random() * 900 + 100));
let savedAvatar = localStorage.getItem('dg_player_avatar') || '🐱';

// 全局状态
let myPlayerId = '';
let myPlayerName = savedName;
let myAvatar = savedAvatar;
let isHost = false;
let isReady = false;
let currentRoomId = '';
let currentGameType = 'draw-guess';
let currentRoomState = null;
let soundEnabled = true;

// 画板状态
let currentColor = '#000000';
let currentSize = 6;
let isDrawing = false;
let isMyTurnToDraw = false;
let lastX = 0;
let lastY = 0;

// 各游戏私密状态
let myUndercoverRole = null; // { role, word }
let myAvalonRole = null;     // { role, roleName, side, desc, seenInfo }
let myUnoHand = [];          // [card]
let pendingWildCardId = null;

// DOM 元素缓存
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const btnJoin = document.getElementById('btn-join');

const selectedAvatarEl = document.getElementById('selected-avatar');
const avatarPicker = document.getElementById('avatar-picker');

const displayRoomId = document.getElementById('display-room-id');
const displayGameTag = document.getElementById('display-game-tag');
const displayRound = document.getElementById('display-round');
const displayRoundTag = document.getElementById('display-round-tag');
const displayTime = document.getElementById('display-time');
const timerBox = document.getElementById('timer-box');
const displayPlayerCount = document.getElementById('display-player-count');
const wordHintBox = document.getElementById('word-hint-box');
const categoryBadge = document.getElementById('category-badge');
const btnShare = document.getElementById('btn-share');
const btnLobbyShare = document.getElementById('btn-lobby-share');
const btnToggleSound = document.getElementById('btn-toggle-sound');

// 抽屉
const playerSidebar = document.getElementById('player-sidebar');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const btnTogglePlayers = document.getElementById('btn-toggle-players');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');

// 统一大厅控制
const lobbyCard = document.getElementById('lobby-card');
const lobbyCount = document.getElementById('lobby-count');
const hostGameSelectBox = document.getElementById('host-game-select-box');
const guestGameDisplay = document.getElementById('guest-game-display');
const hostSettingsContainer = document.getElementById('host-settings-container');
const btnStartGame = document.getElementById('btn-start-game');
const btnToggleReady = document.getElementById('btn-toggle-ready');

// 舞台容器
const stageDrawGuess = document.getElementById('stage-draw-guess');
const stageUndercover = document.getElementById('stage-undercover');
const stageAvalon = document.getElementById('stage-avalon');
const stageUno = document.getElementById('stage-uno');
const stageFlashCounter = document.getElementById('stage-flash-counter');
const stageBombRoulette = document.getElementById('stage-bomb-roulette');
const stageBullsAndCows = document.getElementById('stage-bulls-and-cows');
const stageMath24 = document.getElementById('stage-math-24');
const stageCubeCount = document.getElementById('stage-cube-count');
const stageWordBomb = document.getElementById('stage-word-bomb');
const stagePerfectSlice = document.getElementById('stage-perfect-slice');
const stageHoldFive = document.getElementById('stage-hold-five');

// 盲压 5.00秒 DOM
const btnHoldTrigger = document.getElementById('btn-hold-trigger');
const holdText = document.getElementById('hold-text');
const holdResultBox = document.getElementById('hold-result-box');
const holdScoreTime = document.getElementById('hold-score-time');
const holdScoreDiff = document.getElementById('hold-score-diff');
let holdPressStartTime = null;
let isHoldingButton = false;
let hasSubmittedHold = false;

// 切披萨 50:50 DOM
const sliceCanvas = document.getElementById('slice-canvas');
const sliceCtx = sliceCanvas ? sliceCanvas.getContext('2d') : null;
const sliceCutPrompt = document.getElementById('slice-cut-prompt');
const sliceResultBadge = document.getElementById('slice-result-badge');
const sliceRatioText = document.getElementById('slice-ratio-text');
const sliceDiffText = document.getElementById('slice-diff-text');
let currentSliceShape = null;
let isSlicing = false;
let sliceStartPos = null;
let sliceCurrentPos = null;
let hasSubmittedSlice = false;

// 瞬间数动物 DOM
const flashCanvas = document.getElementById('flash-canvas');
const flashCtx = flashCanvas ? flashCanvas.getContext('2d') : null;
const flashRunnersLayer = document.getElementById('flash-runners-layer');
const flashReadyBanner = document.getElementById('flash-ready-banner');
const readyTargetEmoji = document.getElementById('ready-target-emoji');
const readyTargetName = document.getElementById('ready-target-name');
const readyCountdown = document.getElementById('ready-countdown');
const flashOverlayCard = document.getElementById('flash-overlay-card');
const flashTargetEmoji = document.getElementById('flash-target-emoji');
const flashTargetName = document.getElementById('flash-target-name');
const flashOptionsGrid = document.getElementById('flash-options-grid');
const flashDirectForm = document.getElementById('flash-direct-form');
const flashDirectInput = document.getElementById('flash-direct-input');

// 拆弹轮盘赌 DOM
const bombCenterGraphic = document.getElementById('bomb-center-graphic');
const bombTurnTip = document.getElementById('bomb-turn-tip');
const wiresGrid = document.getElementById('wires-grid');

// 几A几B DOM
const bcLogList = document.getElementById('bc-log-list');
const bcDigitsDisplay = document.getElementById('bc-digits-display');
const btnBcClear = document.getElementById('btn-bc-clear');
const btnBcSubmit = document.getElementById('btn-bc-submit');
let currentBcInput = '';

// 决战 24 点 DOM
const m24CardsRow = document.getElementById('m24-cards-row');
const m24FormulaText = document.getElementById('m24-formula-text');
const m24NumButtons = document.getElementById('m24-num-buttons');
const btnM24Del = document.getElementById('btn-m24-del');
const btnM24Clear = document.getElementById('btn-m24-clear');
const btnM24Submit = document.getElementById('btn-m24-submit');
let currentM24Formula = '';
let currentM24Cards = [];
let usedM24CardIndices = new Set();

// 3D 几何数方块 DOM
const cubeCanvas = document.getElementById('cube-canvas');
const cubeCtx = cubeCanvas ? cubeCanvas.getContext('2d') : null;
const cubeOverlayCard = document.getElementById('cube-overlay-card');
const cubeOptionsGrid = document.getElementById('cube-options-grid');
const cubeDirectForm = document.getElementById('cube-direct-form');
const cubeDirectInput = document.getElementById('cube-direct-input');

// 绑定 24 点跳过按钮
const btnM24Skip = document.getElementById('btn-m24-skip');
if (btnM24Skip) {
  btnM24Skip.addEventListener('click', () => {
    socket.emit('m24_skip_puzzle');
    playSound('tick');
  });
}

// 移动端 Visual Viewport 软键盘适配
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const diff = window.innerHeight - window.visualViewport.height;
    if (diff > 120) {
      // 软键盘弹起，避免遮挡
      document.body.classList.add('keyboard-open');
    } else {
      document.body.classList.remove('keyboard-open');
    }
  });
}
const wbBombIcon = document.getElementById('wb-bomb-icon');
const wbKeywordBadge = document.getElementById('wb-keyword-badge');
const wbTurnStatus = document.getElementById('wb-turn-status');
const wbLivesBar = document.getElementById('wb-lives-bar');
const wbInputForm = document.getElementById('wb-input-form');
const wbInput = document.getElementById('wb-input');

// 你画我猜 DOM
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
const drawingToolbar = document.getElementById('drawing-toolbar');
const drawTurnBanner = document.getElementById('draw-turn-banner');
const drawStatusText = document.getElementById('draw-status-text');
const drawRoleIcon = document.getElementById('draw-role-icon');
const drawWordBadge = document.getElementById('draw-word-badge');

// 谁是卧底 DOM
const ucSecretCard = document.getElementById('uc-secret-card');
const ucRoleLabel = document.getElementById('uc-role-label');
const ucWordText = document.getElementById('uc-word-text');
const ucSpeakerSpotlight = document.getElementById('uc-speaker-spotlight');
const ucSpeakerAvatar = document.getElementById('uc-speaker-avatar');
const ucSpeakerName = document.getElementById('uc-speaker-name');
const btnFinishSpeech = document.getElementById('btn-finish-speech');
const ucPlayerGrid = document.getElementById('uc-player-grid');
const ucStageDesc = document.getElementById('uc-stage-desc');

// 阿瓦隆 DOM
const avRoleBadge = document.getElementById('av-role-badge');
const avSideBadge = document.getElementById('av-side-badge');
const avRoleDesc = document.getElementById('av-role-desc');
const avSeenContainer = document.getElementById('av-seen-container');
const avalonQuestTrack = document.getElementById('avalon-quest-track');
const avRejectDots = document.getElementById('av-reject-dots');
const avBoardStatus = document.getElementById('av-board-status');
const btnSubmitTeam = document.getElementById('btn-submit-team');
const avPlayerCardsGrid = document.getElementById('av-player-cards-grid');
const avSpeechPanel = document.getElementById('av-speech-panel');
const avSpeakerAvatar = document.getElementById('av-speaker-avatar');
const avSpeakerName = document.getElementById('av-speaker-name');
const avSpeakerTag = document.getElementById('av-speaker-tag');
const avSpeechTip = document.getElementById('av-speech-tip');
const btnAvMicToggle = document.getElementById('btn-av-mic-toggle');
const btnAvFinishSpeech = document.getElementById('btn-av-finish-speech');

// UNO DOM
const unoOpponentsStrip = document.getElementById('uno-opponents-strip');
const unoTopCard = document.getElementById('uno-top-card');
const unoColorIndicator = document.getElementById('uno-color-indicator');
const unoHandContainer = document.getElementById('uno-hand-container');
const unoTurnLabel = document.getElementById('uno-turn-label');
const btnUnoPass = document.getElementById('btn-uno-pass');
const btnUnoCall = document.getElementById('btn-uno-call');
const btnUnoDraw = document.getElementById('btn-uno-draw');

// 聊天与互动
const chatSection = document.getElementById('chat-section');
const chatHeaderBar = document.getElementById('chat-header-bar');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const chatToggleIcon = document.getElementById('chat-toggle-icon');
const chatToggleText = document.getElementById('chat-toggle-text');
const chatUnreadBadge = document.getElementById('chat-unread-badge');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const reactionContainer = document.getElementById('reaction-container');
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');

let isChatCollapsed = window.innerWidth < 768;
let unreadMessageCount = 0;

function toggleChat(force) {
  if (typeof force === 'boolean') {
    isChatCollapsed = force;
  } else {
    isChatCollapsed = !isChatCollapsed;
  }
  chatSection.classList.toggle('collapsed', isChatCollapsed);
  if (chatToggleText) chatToggleText.textContent = isChatCollapsed ? '展开' : '收起';

  if (!isChatCollapsed) {
    unreadMessageCount = 0;
    chatUnreadBadge.classList.add('hidden');
  }

  // 延时重置画板适配
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 280);
}

// 移动端初始化聊天折叠状态
if (isChatCollapsed) {
  toggleChat(true);
}

btnToggleChat?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleChat();
});

chatHeaderBar?.addEventListener('click', () => {
  toggleChat();
});

// 弹窗
const wordModal = document.getElementById('word-modal');
const wordOptionsContainer = document.getElementById('word-options');
const modalTimer = document.getElementById('modal-timer');
const revealModal = document.getElementById('reveal-modal');
const revealReason = document.getElementById('reveal-reason');
const revealWord = document.getElementById('reveal-word');
const avalonVoteModal = document.getElementById('avalon-vote-modal');
const avalonQuestModal = document.getElementById('avalon-quest-modal');
const avalonAssassinModal = document.getElementById('avalon-assassin-modal');
const assassinTargetList = document.getElementById('assassin-target-list');
const unoColorModal = document.getElementById('uno-color-modal');
const gameoverModal = document.getElementById('gameover-modal');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverDesc = document.getElementById('gameover-desc');
const gameoverBody = document.getElementById('gameover-body');
const btnBackLobby = document.getElementById('btn-back-lobby');
const btnHeaderLobby = document.getElementById('btn-header-lobby');

// 自定义精致确认弹窗系统
const confirmModal = document.getElementById('confirm-modal');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalDesc = document.getElementById('confirm-modal-desc');
const confirmModalIcon = document.getElementById('confirm-modal-icon');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');

let onConfirmCallback = null;

function showConfirmDialog({
  title = '确认操作',
  desc = '确定要执行此操作吗？',
  confirmText = '确定',
  cancelText = '取消',
  isDanger = false,
  onConfirm = null
} = {}) {
  if (!confirmModal) return;
  if (confirmModalTitle) confirmModalTitle.textContent = title;
  if (confirmModalDesc) confirmModalDesc.textContent = desc;
  if (btnConfirmOk) {
    btnConfirmOk.textContent = confirmText;
    btnConfirmOk.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
  }
  if (btnConfirmCancel) btnConfirmCancel.textContent = cancelText;
  if (confirmModalIcon) {
    confirmModalIcon.classList.toggle('danger', isDanger);
  }
  onConfirmCallback = onConfirm;
  confirmModal.classList.add('active');
  playSound('tick');
}

function hideConfirmDialog() {
  if (confirmModal) confirmModal.classList.remove('active');
  onConfirmCallback = null;
}

if (btnConfirmCancel) {
  btnConfirmCancel.addEventListener('click', hideConfirmDialog);
}

if (btnConfirmOk) {
  btnConfirmOk.addEventListener('click', () => {
    const cb = onConfirmCallback;
    hideConfirmDialog();
    if (cb) cb();
  });
}

// 统一公布答案弹窗
let revealTimeoutId = null;
function showRevealModal(reason, word, durationMs = 3500, detailHtml = '') {
  if (revealTimeoutId) {
    clearTimeout(revealTimeoutId);
    revealTimeoutId = null;
  }
  if (revealReason) revealReason.textContent = reason || '回合结束';
  if (revealWord) {
    if (detailHtml) {
      revealWord.innerHTML = detailHtml;
    } else {
      revealWord.textContent = word || '--';
    }
  }
  if (revealModal) {
    revealModal.classList.add('active');
    revealTimeoutId = setTimeout(() => {
      revealModal.classList.remove('active');
      revealTimeoutId = null;
    }, durationMs);
  }
}

// 统一对局结算弹窗 (战报排行榜 / Podium)
function showGameOverModal({
  title = '游戏结束',
  desc = '',
  podium = [],
  extraHtml = '',
  sound = 'fanfare',
  confetti = true
} = {}) {
  if (sound) playSound(sound);
  if (confetti) launchConfetti();

  if (gameoverTitle) gameoverTitle.textContent = title;
  if (gameoverDesc) gameoverDesc.textContent = desc;

  let html = '';
  if (extraHtml) {
    html += extraHtml;
  }

  if (podium && podium.length > 0) {
    html += '<div class="podium-list">';
    podium.forEach((p, idx) => {
      const rankIcons = ['🥇', '🥈', '🥉'];
      const rankBadge = rankIcons[idx] || `${idx + 1}`;
      const isTop1 = idx === 0;
      html += `
        <div class="podium-card ${isTop1 ? 'podium-top1' : ''}">
          <div class="podium-card-left">
            <span class="podium-rank">${rankBadge}</span>
            <span class="podium-avatar">${escapeHtml(p.avatar || '🐱')}</span>
            <span class="podium-name">${escapeHtml(p.name)}</span>
            ${p.detail ? `<span class="podium-detail">${escapeHtml(p.detail)}</span>` : ''}
          </div>
          <div class="podium-score">${p.score !== undefined ? `${p.score} 分` : ''}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  if (gameoverBody) gameoverBody.innerHTML = html;
  if (gameoverModal) gameoverModal.classList.add('active');
}

// =====================【高高清 DPR 响应式画布通用初始化】=====================
function fitCanvasResolution(canvas, ctx, defaultW = 360, defaultH = 320, maxW = 600) {
  if (!canvas) return { w: defaultW, h: defaultH, dpr: 1 };
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = (parent && parent.clientWidth > 50) ? parent.clientWidth : (window.innerWidth > 50 ? Math.min(window.innerWidth - 32, maxW) : defaultW);
  const h = (parent && parent.clientHeight > 50) ? parent.clientHeight : defaultH;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return { w, h, dpr };
}

// =====================【单选/填空表单交互通用抽象】=====================
function setFormAnswerSubmitted({ inputEl, formEl, optionButtonsSelector, submittedVal }) {
  if (inputEl) {
    inputEl.value = submittedVal;
    inputEl.disabled = true;
  }
  const submitBtn = formEl?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = `✓ 已提交 (${submittedVal})`;
    submitBtn.style.background = 'var(--success)';
    submitBtn.disabled = true;
  }
  if (optionButtonsSelector) {
    document.querySelectorAll(optionButtonsSelector).forEach(b => {
      b.disabled = true;
      if (parseInt(b.textContent) === parseInt(submittedVal)) {
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

function resetFormAnswerState({ inputEl, formEl, optionButtonsSelector, submitDefaultText = '提交答案' }) {
  if (inputEl) {
    inputEl.value = '';
    inputEl.disabled = false;
  }
  const submitBtn = formEl?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = submitDefaultText;
    submitBtn.style.background = '';
    submitBtn.disabled = false;
  }
  if (optionButtonsSelector) {
    document.querySelectorAll(optionButtonsSelector).forEach(b => {
      b.disabled = false;
      b.style.opacity = '';
      b.style.borderColor = '';
      b.style.background = '';
      b.style.color = '';
    });
  }
}
selectedAvatarEl.textContent = savedAvatar;
if (playerNameInput) {
  if (savedName) playerNameInput.value = savedName;
  playerNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      myPlayerName = val;
      localStorage.setItem('dg_player_name', val);
    }
  });
}

// URL 参数自动填充房间号
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  roomIdInput.value = urlParams.get('room');
}

// 头像选择
selectedAvatarEl.addEventListener('click', () => {
  avatarPicker.classList.toggle('hidden');
});

document.querySelectorAll('.avatar-item').forEach(item => {
  item.addEventListener('click', () => {
    myAvatar = item.dataset.avatar;
    selectedAvatarEl.textContent = myAvatar;
    localStorage.setItem('dg_player_avatar', myAvatar);
    avatarPicker.classList.add('hidden');
  });
});


// 头像弹窗管理
const avatarModal = document.getElementById('avatar-modal');
const avatarTrigger = document.getElementById('avatar-trigger');
const btnCloseAvatarModal = document.getElementById('btn-close-avatar-modal');
const avatarModalBackdrop = document.getElementById('avatar-modal-backdrop');
const btnAvatarRandom = document.getElementById('btn-avatar-random');
const btnAvatarConfirm = document.getElementById('btn-avatar-confirm');
let tempSelectedAvatar = myAvatar;

function openAvatarModal() {
  if (!avatarModal) return;
  tempSelectedAvatar = myAvatar;
  document.querySelectorAll('.avatar-option-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.avatar === myAvatar);
  });
  avatarModal.classList.add('active');
  playSound('pop');
}

function closeAvatarModal() {
  if (avatarModal) avatarModal.classList.remove('active');
}

if (avatarTrigger) {
  avatarTrigger.addEventListener('click', openAvatarModal);
}
if (btnCloseAvatarModal) {
  btnCloseAvatarModal.addEventListener('click', closeAvatarModal);
}
if (avatarModalBackdrop) {
  avatarModalBackdrop.addEventListener('click', closeAvatarModal);
}

document.querySelectorAll('.avatar-option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tempSelectedAvatar = btn.dataset.avatar;
    document.querySelectorAll('.avatar-option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    playSound('tick');
    triggerVibration('tick');
  });
});

if (btnAvatarRandom) {
  btnAvatarRandom.addEventListener('click', () => {
    const allBtns = Array.from(document.querySelectorAll('.avatar-option-btn'));
    if (allBtns.length > 0) {
      const rBtn = allBtns[Math.floor(Math.random() * allBtns.length)];
      tempSelectedAvatar = rBtn.dataset.avatar;
      allBtns.forEach(b => b.classList.remove('active'));
      rBtn.classList.add('active');
      playSound('card');
      triggerVibration('pop');
    }
  });
}

if (btnAvatarConfirm) {
  btnAvatarConfirm.addEventListener('click', () => {
    myAvatar = tempSelectedAvatar;
    if (selectedAvatarEl) selectedAvatarEl.textContent = myAvatar;
    localStorage.setItem('dg_player_avatar', myAvatar);
    closeAvatarModal();
    showToast(`头像已更换为 ${myAvatar} ✨`, '🎨');
    playSound('correct');
    triggerVibration('pop');
  });
}

// 音效与触觉反馈系统 (Web Audio API + Haptic Vibration)
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}
document.addEventListener('touchstart', initAudio, { once: true, passive: true });
document.addEventListener('click', initAudio, { once: true, passive: true });

function triggerVibration(type = 'tick') {
  if (!navigator.vibrate) return;
  try {
    if (type === 'tick') navigator.vibrate(12);
    else if (type === 'pop') navigator.vibrate(18);
    else if (type === 'correct') navigator.vibrate([35, 50, 35]);
    else if (type === 'boom') navigator.vibrate([100, 40, 220]);
    else if (type === 'error') navigator.vibrate([60, 40, 60]);
  } catch (e) {}
}

function showToast(text, icon = '✨') {
  let container = document.getElementById('app-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-toast-container';
    container.className = 'app-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.innerHTML = `<span>${icon}</span><span>${text}</span>`;
  container.appendChild(toast);
  playSound('pop');
  triggerVibration('pop');
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    initAudio();
    const now = audioCtx.currentTime;

    if (type === 'correct') {
      triggerVibration('correct');
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'tick') {
      triggerVibration('tick');
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'pop') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'error') {
      triggerVibration('error');
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'boom') {
      triggerVibration('boom');
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'whoosh') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'card') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'fanfare') {
      triggerVibration('correct');
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.3);
        o.start(now + i * 0.12);
        o.stop(now + i * 0.12 + 0.3);
      });
    }
  } catch (e) {}
}

const btnLoginTheme = document.getElementById('btn-login-theme');
if (btnLoginTheme) {
  btnLoginTheme.addEventListener('click', toggleTheme);
}
const btnToggleTheme = document.getElementById('btn-toggle-theme');
if (btnToggleTheme) {
  btnToggleTheme.addEventListener('click', toggleTheme);
}

btnToggleSound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  btnToggleSound.textContent = soundEnabled ? '🔊' : '🔇';
});


// 随机名字与随机房间号工具
const FUN_NAMES = [
  '极速柯基', '神刀小侠', '快乐小羊', '智慧担当', '吃瓜群众',
  '超级马趴', '派对之星', '算术天才', '拆弹专家', '卧底克星',
  '星际漫步', '神奇海螺', '全能选手', '魔法学徒', '闪电兔'
];

const btnRandomName = document.getElementById('btn-random-name');
if (btnRandomName) {
  btnRandomName.addEventListener('click', () => {
    const rName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    if (playerNameInput) {
      playerNameInput.value = rName;
      myPlayerName = rName;
      localStorage.setItem('dg_player_name', rName);
      playSound('tick');
      triggerVibration('pop');
    }
  });
}

const btnRandomRoom = document.getElementById('btn-random-room');
if (btnRandomRoom) {
  btnRandomRoom.addEventListener('click', () => {
    const rRoom = String(Math.floor(Math.random() * 900 + 100));
    if (roomIdInput) {
      roomIdInput.value = rRoom;
      playSound('tick');
      triggerVibration('pop');
    }
  });
}

document.querySelectorAll('.quick-room-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const r = btn.dataset.room;
    if (roomIdInput && r) {
      roomIdInput.value = r;
      playSound('tick');
      triggerVibration('tick');
    }
  });
});

// 登录加入房间
btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const room = roomIdInput.value.trim();
  if (!name || !room) {
    showToast('请输入昵称和房间号！', '⚠️');
    return;
  }
  myPlayerName = name;
  localStorage.setItem('dg_player_name', name);
  initAudio();

  socket.emit('join_room', {
    roomId: room,
    playerName: myPlayerName,
    avatar: myAvatar,
    playerToken: myPlayerToken
  });
});

socket.on('joined_successfully', (data) => {
  currentRoomId = data.roomId;
  currentGameType = data.gameType || 'draw-guess';
  myPlayerId = data.playerId;
  isHost = !!data.isHost;

  loginScreen.classList.remove('active');
  gameScreen.classList.add('active');
  displayRoomId.textContent = currentRoomId;

  const heroRoomId = document.getElementById('hero-room-id');
  if (heroRoomId) heroRoomId.textContent = currentRoomId;

  if (isHost) {
    if (btnStartGame) {
      btnStartGame.classList.remove('hidden');
      btnStartGame.style.display = 'inline-flex';
    }
    if (btnToggleReady) {
      btnToggleReady.classList.add('hidden');
      btnToggleReady.style.display = 'none';
    }
  } else {
    if (btnStartGame) {
      btnStartGame.classList.add('hidden');
      btnStartGame.style.display = 'none';
    }
    if (btnToggleReady) {
      btnToggleReady.classList.remove('hidden');
      btnToggleReady.style.display = 'inline-flex';
    }
  }

  initCanvas();
  updateGameStageView(currentGameType);
});

// 跨应用切换/网络唤醒自动无感极速重连与防假死机制 (Mobile Wakeup Watchdog)
let lastWakeupCheck = Date.now();
let wakeSyncTimeout = null;

function tryAutoReconnect(force = false) {
  if (!currentRoomId || !myPlayerName) return;

  const now = Date.now();
  // 检查是否发生跨应用挂起（如果当前时间与上次相差超过 3 秒，说明被系统挂起过）
  const wasSuspended = (now - lastWakeupCheck > 3000);
  lastWakeupCheck = now;

  if (force || wasSuspended || !socket.connected) {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_room', {
      roomId: currentRoomId,
      playerName: myPlayerName,
      avatar: myAvatar,
      playerToken: myPlayerToken
    });
    socket.emit('ping_sync');
  } else {
    socket.emit('ping_sync');
  }

  // 设定唤醒防假死计时器：若 1 秒内无响应，强制重置底层连接
  clearTimeout(wakeSyncTimeout);
  wakeSyncTimeout = setTimeout(() => {
    if (!socket.connected) {
      socket.disconnect().connect();
      socket.emit('join_room', {
        roomId: currentRoomId,
        playerName: myPlayerName,
        avatar: myAvatar,
        playerToken: myPlayerToken
      });
    }
  }, 1000);
}

socket.on('connect', () => {
  if (currentRoomId && myPlayerName) {
    socket.emit('join_room', {
      roomId: currentRoomId,
      playerName: myPlayerName,
      avatar: myAvatar,
      playerToken: myPlayerToken
    });
  }
});

socket.on('reconnect', () => {
  tryAutoReconnect(true);
});

// 多事件矩阵监听：前台唤醒、焦点回到浏览器、页面恢复显示
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tryAutoReconnect(true);
  }
});

window.addEventListener('focus', () => {
  tryAutoReconnect(true);
});

window.addEventListener('pageshow', () => {
  tryAutoReconnect(true);
});

// 每 2.5 秒心跳保活，避免移动端 NAT 超时丢包
setInterval(() => {
  lastWakeupCheck = Date.now();
  if (currentRoomId && socket.connected) {
    socket.emit('ping_sync');
  }
}, 2500);

// 游戏分类 Tab 切换过滤
document.querySelectorAll('.cat-pill, .category-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.cat-pill, .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const cat = tab.dataset.category || 'all';
    document.querySelectorAll('.game-tile, .game-mode-card').forEach(card => {
      if (cat === 'all' || card.dataset.cat === cat) {
        card.classList.remove('tab-hidden');
      } else {
        card.classList.add('tab-hidden');
      }
    });
    playSound('tick');
    triggerVibration('tick');
  });
});

// 模式切换与配置监听 (0ms 极速乐观响应 + 可靠网络同步)
document.querySelectorAll('.game-tile, .game-mode-card').forEach(card => {
  card.addEventListener('click', () => {
    if (!isHost) {
      showToast('只有房主可以切换游戏模式', '👑');
      return;
    }
    const targetGame = card.dataset.game;
    if (!targetGame) return;

    // 1. 0ms 立即本地乐观更新 UI 高亮与配置面板，给用户即时反馈
    updateGameStageView(targetGame);
    playSound('card');
    triggerVibration('tick');

    // 2. 确保网络连通并同步给全房间玩家
    if (!socket.connected) {
      socket.connect();
      socket.emit('join_room', {
        roomId: currentRoomId,
        playerName: myPlayerName,
        avatar: myAvatar,
        playerToken: myPlayerToken
      });
    }
    socket.emit('switch_game', { gameType: targetGame });
  });
});

const GLOBAL_GAME_NAMES = {
  'draw-guess': '🎨 你画我猜',
  'undercover': '🕵️ 谁是卧底',
  'avalon': '👑 阿瓦隆',
  'uno': '🃏 UNO 优诺牌',
  'flash-counter': '🐑 瞬间数羊',
  'bomb-roulette': '💣 拆弹轮盘',
  'bulls-and-cows': '🔢 几A几B',
  'math-24': '🧮 决战 24 点',
  'cube-count': '🧊 3D 数方块',
  'word-bomb': '💥 词汇炸弹',
  'perfect-slice': '🍕 切披萨 50:50',
  'hold-five': '⏱️ 盲压挑战'
};

function updateGameStageView(gameType) {
  currentGameType = gameType;

  // 更新模式高亮
  document.querySelectorAll('.game-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.game === gameType);
  });

  const gameNames = GLOBAL_GAME_NAMES;

  const gameRules = {
    'draw-guess': { icon: '🎨', title: '你画我猜', desc: '画师作画不可写字，全员抢答，越快猜中得分越高！' },
    'undercover': { icon: '🕵️', title: '谁是卧底', desc: '平民与卧底各执暗词，轮流发言并公投放逐卧底。' },
    'avalon': { icon: '👑', title: '阿瓦隆', desc: '正邪阵营圣杯远征隐匿对抗，邪恶刺客可刺杀梅林逆转。' },
    'uno': { icon: '🃏', title: 'UNO 优诺牌', desc: '匹配同色/同数字出牌，最后1张必须喊UNO，先出完者胜！' },
    'flash-counter': { icon: '🐑', title: '瞬间数羊', desc: '物体1秒疾速飞掠，考验瞬间动态视力与手速！' },
    'bomb-roulette': { icon: '💣', title: '拆弹轮盘', desc: '多根引线中仅1根引爆，轮流剪线避开雷管生死博弈！' },
    'bulls-and-cows': { icon: '🔢', title: '几A几B', desc: '破译4位不重复数字，依据几A几B反馈最少步数破译。' },
    'math-24': { icon: '🧮', title: '决战 24 点', desc: '4张扑克牌使用加减乘除与括号拼凑出 24 点！' },
    'cube-count': { icon: '🧊', title: '3D 数方块', desc: '3D空间立体方块堆叠，计算包含隐藏支撑块在内的总数。' },
    'word-bomb': { icon: '💥', title: '词汇炸弹', desc: '引信倒计时！输入含指定字的词语传弹，引爆扣除生命！' },
    'perfect-slice': { icon: '🍕', title: '切披萨 50:50', desc: '一刀切开不规则图形，面积越接近 50:50 得分越高！' },
    'hold-five': { icon: '⏱️', title: '盲压挑战', desc: '每轮随机抽取 3~10 秒目标时间，无秒表提示，凭内心生物钟精准松手！' }
  };

  if (currentRoomState && currentRoomState.status !== 'LOBBY') {
    displayGameTag.textContent = gameNames[gameType] || '聚会游戏';
  } else {
    displayGameTag.textContent = '🎮 选游戏大厅';
  }

  // 更新非房主横幅展示
  const ruleInfo = gameRules[gameType] || { icon: '🎮', title: '聚会游戏', desc: '房主配置中...' };
  const guestIcon = document.getElementById('guest-banner-icon');
  const guestTitle = document.getElementById('guest-banner-title');
  const guestDesc = document.getElementById('guest-banner-desc');
  if (guestIcon) guestIcon.textContent = ruleInfo.icon;
  if (guestTitle) guestTitle.textContent = ruleInfo.title;
  if (guestDesc) guestDesc.textContent = ruleInfo.desc;

  // 切换设置子面板
  document.querySelectorAll('.game-settings-subpanel').forEach(p => p.classList.add('hidden'));
  const subpanel = document.getElementById(`settings-${gameType}`);
  if (subpanel) subpanel.classList.remove('hidden');

  // 切换舞台可视性
  const allStages = [
    stageDrawGuess, stageUndercover, stageAvalon, stageUno,
    stageFlashCounter, stageBombRoulette, stageBullsAndCows,
    stageMath24, stageCubeCount, stageWordBomb, stagePerfectSlice, stageHoldFive
  ];
  allStages.forEach(s => s && s.classList.add('hidden'));

  const stageMap = {
    'draw-guess': stageDrawGuess,
    'undercover': stageUndercover,
    'avalon': stageAvalon,
    'uno': stageUno,
    'flash-counter': stageFlashCounter,
    'bomb-roulette': stageBombRoulette,
    'bulls-and-cows': stageBullsAndCows,
    'math-24': stageMath24,
    'cube-count': stageCubeCount,
    'word-bomb': stageWordBomb,
    'perfect-slice': stagePerfectSlice,
    'hold-five': stageHoldFive
  };
  // 只有在非大厅阶段才展示游戏舞台
  if (currentRoomState && currentRoomState.status !== 'LOBBY') {
    if (stageMap[gameType]) stageMap[gameType].classList.remove('hidden');
  }
}

// 房主全游戏配置变更广播监听
const settingElementIds = [
  'dg-rounds', 'dg-time', 'dg-hints',
  'uc-spy-count', 'uc-blank', 'uc-time',
  'av-percival', 'av-mordred', 'av-oberon', 'av-speech-mode', 'av-speech-duration',
  'uno-hand-size', 'uno-stack-rules',
  'fc-rounds', 'fc-speed',
  'br-wires', 'br-time',
  'bc-rounds', 'bc-time',
  'm24-rounds', 'm24-time',
  'cc-rounds', 'cc-diff',
  'wb-lives', 'wb-time',
  'ps-rounds', 'ps-tolerance',
  'hf-rounds', 'hf-target'
];

function collectCurrentRoomSettings() {
  let maxRounds = 3;
  if (currentGameType === 'draw-guess') maxRounds = parseInt(document.getElementById('dg-rounds')?.value || 3);
  else if (currentGameType === 'flash-counter') maxRounds = parseInt(document.getElementById('fc-rounds')?.value || 3);
  else if (currentGameType === 'math-24') maxRounds = parseInt(document.getElementById('m24-rounds')?.value || 3);
  else if (currentGameType === 'cube-count') maxRounds = parseInt(document.getElementById('cc-rounds')?.value || 3);
  else if (currentGameType === 'perfect-slice') maxRounds = parseInt(document.getElementById('ps-rounds')?.value || 3);
  else if (currentGameType === 'hold-five') maxRounds = parseInt(document.getElementById('hf-rounds')?.value || 3);
  else if (currentGameType === 'bulls-and-cows') maxRounds = parseInt(document.getElementById('bc-rounds')?.value || 8);

  return {
    maxRounds,
    // 你画我猜
    roundTime: parseInt(document.getElementById('dg-time')?.value || 60),
    enableHints: document.getElementById('dg-hints')?.value === 'true',
    // 谁是卧底
    spyCount: parseInt(document.getElementById('uc-spy-count')?.value || 1),
    hasBlank: document.getElementById('uc-blank')?.value === 'true',
    speakTime: parseInt(document.getElementById('uc-time')?.value || 45),
    // 阿瓦隆
    usePercivalMorgana: document.getElementById('av-percival')?.checked,
    useMordred: document.getElementById('av-mordred')?.checked,
    useOberon: document.getElementById('av-oberon')?.checked,
    speechMode: document.getElementById('av-speech-mode')?.value || 'online',
    speechDuration: parseInt(document.getElementById('av-speech-duration')?.value || 60),
    // 其他游戏参数
    unoHandSize: parseInt(document.getElementById('uno-hand-size')?.value || 7),
    unoStackRules: document.getElementById('uno-stack-rules')?.value === 'true',
    flashSpeed: document.getElementById('fc-speed')?.value || 'normal',
    bombWires: parseInt(document.getElementById('br-wires')?.value || 6),
    bombTime: parseInt(document.getElementById('br-time')?.value || 15),
    bcRounds: parseInt(document.getElementById('bc-rounds')?.value || 8),
    bcTime: parseInt(document.getElementById('bc-time')?.value || 45),
    m24Time: parseInt(document.getElementById('m24-time')?.value || 45),
    cubeDiff: document.getElementById('cc-diff')?.value || 'standard',
    wbLives: parseInt(document.getElementById('wb-lives')?.value || 3),
    wbTime: parseInt(document.getElementById('wb-time')?.value || 10),
    sliceTolerance: parseFloat(document.getElementById('ps-tolerance')?.value || 2.0),
    fixedTargetSeconds: document.getElementById('hf-target')?.value === 'random' ? null : parseFloat(document.getElementById('hf-target')?.value || 5.000)
  };
}

settingElementIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      if (!isHost) return;
      socket.emit('update_room_settings', collectCurrentRoomSettings());
    });
  }
});

btnStartGame.addEventListener('click', () => {
  if (isHost) {
    if (!socket.connected) socket.connect();
    socket.emit('update_room_settings', collectCurrentRoomSettings());
    socket.emit('start_game');
  }
});

btnToggleReady.addEventListener('click', () => {
  socket.emit('toggle_ready');
});

btnBackLobby?.addEventListener('click', () => {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  socket.emit('back_to_lobby');
});


// 退出房间处理
const btnLeaveRoom = document.getElementById('btn-leave-room');
if (btnLeaveRoom) {
  btnLeaveRoom.addEventListener('click', () => {
    showConfirmDialog({
      title: '退出房间',
      desc: '确定要退出当前房间并返回大厅主页吗？',
      confirmText: '确认退出',
      cancelText: '取消',
      isDanger: true,
      onConfirm: () => {
        socket.emit('leave_room');
        currentRoomId = '';
        currentRoomState = null;
        gameScreen.classList.remove('active');
        loginScreen.classList.add('active');
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
        showToast('已退出房间 🚪', '👋');
        playSound('tick');
      }
    });
  });
}

btnHeaderLobby?.addEventListener('click', () => {
  if (currentRoomState && currentRoomState.status !== 'LOBBY') {
    showConfirmDialog({
      title: '返回房间大厅',
      desc: '当前游戏正在进行中，返回大厅将立即中断本局游戏，确定要返回吗？',
      confirmText: '确认返回',
      cancelText: '继续游戏',
      isDanger: true,
      onConfirm: () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        socket.emit('back_to_lobby');
        playSound('tick');
      }
    });
  } else {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    socket.emit('back_to_lobby');
  }
});

// 抽屉管理
btnTogglePlayers.addEventListener('click', () => {
  playerSidebar.classList.add('open');
  drawerBackdrop.classList.add('open');
});

function closeDrawer() {
  playerSidebar.classList.remove('open');
  drawerBackdrop.classList.remove('open');
}

btnCloseDrawer.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

// 剪贴板兼容性复制兜底
function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.width = '2em';
  textArea.style.height = '2em';
  textArea.style.padding = '0';
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';
  textArea.style.opacity = '0';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let successful = false;
  try {
    successful = document.execCommand('copy');
  } catch (err) {
    successful = false;
  }
  document.body.removeChild(textArea);
  return successful;
}

// 分享邀请
function copyInviteLink() {
  const room = currentRoomId || (roomIdInput ? roomIdInput.value.trim() : '');
  if (!room) {
    showToast('暂无房间号', '⚠️');
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('邀请链接已复制！好友点击即可直接进房', '🔗');
    }).catch(() => {
      fallbackCopyTextToClipboard(url);
      showToast('邀请链接已复制！好友点击即可直接进房', '🔗');
    });
  } else {
    fallbackCopyTextToClipboard(url);
    showToast('邀请链接已复制！好友点击即可直接进房', '🔗');
  }
}
if (btnShare) btnShare.addEventListener('click', copyInviteLink);
if (btnLobbyShare) btnLobbyShare.addEventListener('click', copyInviteLink);
const btnHeroShare = document.getElementById('btn-hero-share');
if (btnHeroShare) btnHeroShare.addEventListener('click', copyInviteLink);

// 核心状态同步处理
socket.on('room_state', (state) => {
  currentRoomState = state;
  currentGameType = state.gameType || 'draw-guess';
  updateGameStageView(currentGameType);

  const me = state.players.find(p => p.token === myPlayerToken || p.id === socket.id);
  if (me) isHost = me.isHost;

  displayPlayerCount.textContent = state.players.length;
  playerCount.textContent = state.players.length;
  lobbyCount.textContent = state.players.length;

  // 大厅与游戏状态切换
  const allStages = [
    stageDrawGuess, stageUndercover, stageAvalon, stageUno,
    stageFlashCounter, stageBombRoulette, stageBullsAndCows,
    stageMath24, stageCubeCount, stageWordBomb, stagePerfectSlice, stageHoldFive
  ];

  if (state.status === 'LOBBY') {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    lobbyCard.classList.remove('hidden');
    allStages.forEach(s => s && s.classList.add('hidden'));
    timerBox?.classList.add('hidden');
    displayRoundTag?.classList.add('hidden');
    btnHeaderLobby?.classList.add('hidden');
    displayGameTag.textContent = '🎮 选游戏大厅';
    const currentGameTitle = (GLOBAL_GAME_NAMES[currentGameType] || '聚会游戏').replace(/^[^一-龥A-Za-z0-9]+/, '');
    wordHintBox.textContent = isHost ? '👑 你是房主：请在下方卡带中挑选游戏，点击【开始游戏】' : `⏳ 房主当前选择：【${currentGameTitle}】· 等待开局`;
    categoryBadge.classList.add('hidden');

    // 12 款游戏实体卡带展柜与参数面板：全员（房主与队员）永久可见！
    hostGameSelectBox.classList.remove('hidden');
    hostSettingsContainer.classList.remove('hidden');
    guestGameDisplay.classList.add('hidden');

    if (isHost) {
      if (btnStartGame) {
        btnStartGame.classList.remove('hidden');
        btnStartGame.style.display = 'inline-flex';
      }
      if (btnToggleReady) {
        btnToggleReady.classList.add('hidden');
        btnToggleReady.style.display = 'none';
      }
    } else {
      if (btnStartGame) {
        btnStartGame.classList.add('hidden');
        btnStartGame.style.display = 'none';
      }
      if (btnToggleReady) {
        btnToggleReady.classList.remove('hidden');
        btnToggleReady.style.display = 'inline-flex';
        btnToggleReady.innerHTML = me?.isReady ? '<span class="btn-glyph">✓</span><span>已就绪 (取消)</span>' : '<span class="btn-glyph">⚡</span><span>准备就绪</span>';
        btnToggleReady.className = me?.isReady ? 'btn-dock-main btn-arcade-start' : 'btn-dock-main btn-arcade-ready';
      }
    }
    resetAllGameStages();
  } else {
    lobbyCard.classList.add('hidden');
    timerBox?.classList.remove('hidden');
    displayRoundTag?.classList.remove('hidden');
    if (state.timeLeft !== undefined && displayTime) {
      displayTime.textContent = state.timeLeft;
      if (state.timeLeft <= 10) timerBox?.classList.add('warning');
      else timerBox?.classList.remove('warning');
    }
    if (isHost) btnHeaderLobby?.classList.remove('hidden');
    else btnHeaderLobby?.classList.add('hidden');
    allStages.forEach(s => s && s.classList.add('hidden'));
    const stageMap = {
      'draw-guess': stageDrawGuess,
      'undercover': stageUndercover,
      'avalon': stageAvalon,
      'uno': stageUno,
      'flash-counter': stageFlashCounter,
      'bomb-roulette': stageBombRoulette,
      'bulls-and-cows': stageBullsAndCows,
      'math-24': stageMath24,
      'cube-count': stageCubeCount,
      'word-bomb': stageWordBomb,
      'perfect-slice': stagePerfectSlice,
      'hold-five': stageHoldFive
    };
    if (stageMap[currentGameType]) stageMap[currentGameType].classList.remove('hidden');
  }

  // 渲染侧边栏玩家列表
  renderPlayerList(state.players);

  // 调度各游戏具体渲染
  if (currentGameType === 'draw-guess') renderDrawGuessState(state);
  else if (currentGameType === 'undercover') renderUndercoverState(state);
  else if (currentGameType === 'avalon') renderAvalonState(state);
  else if (currentGameType === 'uno') renderUnoState(state);
  else if (currentGameType === 'flash-counter') renderFlashCounterState(state);
  else if (currentGameType === 'bomb-roulette') renderBombRouletteState(state);
  else if (currentGameType === 'bulls-and-cows') renderBullsAndCowsState(state);
  else if (currentGameType === 'math-24') renderMath24State(state);
  else if (currentGameType === 'cube-count') renderCubeCountState(state);
  else if (currentGameType === 'word-bomb') renderWordBombState(state);
  else if (currentGameType === 'perfect-slice') renderPerfectSliceState(state);
  else if (currentGameType === 'hold-five') renderHoldFiveState(state);
});

function renderPlayerList(players) {
  if (!players) return;
  if (playerList) playerList.innerHTML = '';
  const heroRoomId = document.getElementById('hero-room-id');
  const heroPlayerBadge = document.getElementById('hero-player-badge');
  const lobbySeatsGrid = document.getElementById('lobby-seats-grid');

  if (heroRoomId && currentRoomId) heroRoomId.textContent = currentRoomId;
  if (heroPlayerBadge) heroPlayerBadge.textContent = `${players.length} 人已入席`;

  if (lobbySeatsGrid) {
    lobbySeatsGrid.innerHTML = '';
    players.forEach(p => {
      const isMe = (p.token === myPlayerToken || p.id === socket.id);
      const seat = document.createElement('div');
      seat.className = `player-seat-card ${isMe ? 'is-me' : ''} ${p.isHost ? 'is-host' : ''}`;
      const avatarChar = p.avatar || '🐱';
      const nameStr = p.name || '玩家';
      seat.innerHTML = `
        <div class="seat-avatar-wrapper">
          <span class="seat-avatar">${escapeHtml(avatarChar)}</span>
          ${p.isHost ? '<span class="seat-crown-badge">👑</span>' : ''}
        </div>
        <div class="seat-info">
          <div class="seat-name">${escapeHtml(nameStr)} ${isMe ? '<span class="me-pill">我</span>' : ''}</div>
          <div class="seat-status">
            ${p.isHost ? '<span class="badge-seat-host">房主</span>' : (p.isReady ? '<span class="badge-seat-ready">✓ 已就绪</span>' : '<span class="badge-seat-wait">等待中</span>')}
          </div>
        </div>
      `;
      lobbySeatsGrid.appendChild(seat);
    });

    // 补充空席位邀请卡片 (至少保持 4 个槽位或至多 8 个)
    const totalSlots = Math.max(4, Math.min(8, players.length + 1));
    const emptyCount = totalSlots - players.length;
    for (let i = 0; i < emptyCount; i++) {
      const emptySeat = document.createElement('div');
      emptySeat.className = 'player-seat-card seat-empty-card';
      emptySeat.innerHTML = `
        <div class="seat-empty-icon">+</div>
        <div class="seat-empty-label">邀请好友</div>
      `;
      emptySeat.addEventListener('click', copyInviteLink);
      lobbySeatsGrid.appendChild(emptySeat);
    }
  }

  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-item';
    const isMe = p.token === myPlayerToken;

    li.innerHTML = `
      <div class="player-item-left">
        <span class="p-avatar">${escapeHtml(p.avatar)}</span>
        <div>
          <div class="p-name">${escapeHtml(p.name)} ${isMe ? '(我)' : ''} ${p.isHost ? '👑' : ''}</div>
          <div class="p-score">${p.score || 0} 分 · ${p.alive ? '🟢 存活' : '🔴 出局'}</div>
        </div>
      </div>
      <div class="player-item-right">
        ${isHost && !isMe ? `
          <button class="btn btn-xs btn-outline btn-transfer" data-token="${escapeHtml(p.token)}">移交</button>
          <button class="btn btn-xs btn-danger btn-kick" data-token="${escapeHtml(p.token)}">请出</button>
        ` : (p.isReady ? '✅' : '')}
      </div>
    `;
    playerList.appendChild(li);
  });
  
  if (isHost) {
    document.querySelectorAll('.btn-transfer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetToken = btn.dataset.token;
        const targetPlayer = players.find(p => p.token === targetToken);
        showConfirmDialog({
          title: '移交房主权限',
          desc: `确定将房主 👑 权限移交给【${targetPlayer ? targetPlayer.name : '该玩家'}】吗？`,
          confirmText: '确认移交',
          cancelText: '取消',
          isDanger: false,
          onConfirm: () => {
            socket.emit('transfer_host', { targetToken });
            playSound('tick');
          }
        });
      });
    });
    document.querySelectorAll('.btn-kick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetToken = btn.dataset.token;
        const targetPlayer = players.find(p => p.token === targetToken);
        showConfirmDialog({
          title: '请出房间',
          desc: `确定要将【${targetPlayer ? targetPlayer.name : '该玩家'}】请出房间吗？`,
          confirmText: '确认请出',
          cancelText: '取消',
          isDanger: true,
          onConfirm: () => {
            socket.emit('kick_player', { targetToken });
            playSound('tick');
          }
        });
      });
    });
  }
}

// =====================【你画我猜 渲染】=====================
const drawGuessBar = document.getElementById('draw-guess-bar');
const drawGuessForm = document.getElementById('draw-guess-form');
const drawGuessInput = document.getElementById('draw-guess-input');

if (drawGuessForm) {
  drawGuessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isIMEComposing) return; // 拦截输入法候选未完成提交
    const val = drawGuessInput ? drawGuessInput.value.trim() : '';
    if (val) {
      socket.emit('send_chat', { text: val });
      if (drawGuessInput) {
        drawGuessInput.value = '';
        drawGuessInput.focus();
      }
      playSound('tick');
    }
  });
}

function renderDrawGuessState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `${state.round}/${state.maxRounds}`;

  isMyTurnToDraw = (state.drawerToken === myPlayerToken || state.drawerId === socket.id);
  
  // 画板尺寸自适应校准
  resizeCanvas();

  if (state.status === 'DRAWING') {
    drawingToolbar.classList.toggle('hidden', !isMyTurnToDraw);
    drawGuessBar?.classList.toggle('hidden', isMyTurnToDraw);

    if (isMyTurnToDraw) {
      drawTurnBanner.classList.add('is-drawer');
      drawRoleIcon.textContent = '🎨';
      drawStatusText.textContent = '轮到你作画！题目：';
      drawWordBadge.textContent = state.currentWord || '选中词';
      drawWordBadge.classList.remove('hidden');
      wordHintBox.textContent = `题目：${state.currentWord || '选中词'} (分类: ${state.wordCategory || '常用'})`;
    } else {
      drawTurnBanner.classList.remove('is-drawer');
      drawRoleIcon.textContent = '👀';
      drawStatusText.textContent = `【${state.drawerName || '玩家'}】正在作画...`;
      drawWordBadge.classList.add('hidden');
      wordHintBox.textContent = state.wordHint || '猜猜看...';
    }

    if (state.wordCategory) {
      categoryBadge.textContent = state.wordCategory;
      categoryBadge.classList.remove('hidden');
    }
  } else if (state.status === 'SELECTING') {
    drawingToolbar.classList.add('hidden');
    drawGuessBar?.classList.add('hidden');
    drawTurnBanner.classList.remove('is-drawer');
    drawRoleIcon.textContent = '⏳';
    drawStatusText.textContent = isMyTurnToDraw ? '请在弹窗中选择作画词语...' : `【${state.drawerName || '玩家'}】正在选题...`;
    drawWordBadge.classList.add('hidden');
    wordHintBox.textContent = '选题中...';
  } else {
    drawingToolbar.classList.add('hidden');
    drawGuessBar?.classList.add('hidden');
    drawTurnBanner.classList.remove('is-drawer');
    drawRoleIcon.textContent = '🏠';
    drawStatusText.textContent = '等待房主开始...';
    drawWordBadge.classList.add('hidden');
  }
}

function resizeCanvas() {
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
    if (currentRoomState && currentRoomState.drawHistory) {
      redrawCanvasHistory(currentRoomState.drawHistory);
    }
  }
}

function initCanvas() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function getPos(e) {
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
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x1 * w, y1 * h);
  ctx.lineTo(x2 * w, y2 * h);
  ctx.stroke();
}

function handleStart(e) {
  if (!isMyTurnToDraw) return;
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
  socket.emit('draw_stroke', { type: 'start', x: lastX, y: lastY, color: currentColor, size: currentSize });
}

function handleMove(e) {
  if (!isDrawing || !isMyTurnToDraw) return;
  e.preventDefault();
  const pos = getPos(e);
  drawLine(lastX, lastY, pos.x, pos.y, currentColor, currentSize);
  socket.emit('draw_stroke', { type: 'line', x1: lastX, y1: lastY, x2: pos.x, y2: pos.y, color: currentColor, size: currentSize });
  lastX = pos.x;
  lastY = pos.y;
}

function handleEnd(e) {
  if (!isDrawing || !isMyTurnToDraw) return;
  isDrawing = false;
  socket.emit('draw_stroke', { type: 'end' });
}

canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);
canvas.addEventListener('touchstart', handleStart, { passive: false });
canvas.addEventListener('touchmove', handleMove, { passive: false });
window.addEventListener('touchend', handleEnd);

// 工具栏交互
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    document.getElementById('btn-eraser')?.classList.remove('active');
    dot.classList.add('active');
    currentColor = dot.dataset.color;
  });
});

document.querySelectorAll('.brush-sizes .btn-tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.brush-sizes .btn-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = parseInt(btn.dataset.size);
  });
});

document.getElementById('btn-eraser')?.addEventListener('click', () => {
  currentColor = '#FFFFFF';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  document.getElementById('btn-eraser')?.classList.add('active');
});

document.getElementById('btn-undo')?.addEventListener('click', () => { socket.emit('undo_canvas'); });
document.getElementById('btn-clear')?.addEventListener('click', () => { socket.emit('clear_canvas'); });

socket.on('draw_stroke', (data) => {
  if (data.type === 'line') drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size);
});

socket.on('clear_canvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('redraw_canvas', (history) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let lx = 0, ly = 0;
  history.forEach(stroke => {
    if (stroke.type === 'start') { lx = stroke.x; ly = stroke.y; }
    else if (stroke.type === 'line') {
      drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
      lx = stroke.x2; ly = stroke.y2;
    }
  });
});

socket.on('sync_draw_history', (history) => {
  history.forEach(stroke => {
    if (stroke.type === 'line') drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
  });
});

socket.on('select_word_options', (data) => {
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

socket.on('your_turn_to_draw', (data) => {
  wordModal.classList.remove('active');
  playSound('fanfare');
});

socket.on('round_ended', (data) => {
  showRevealModal(data.reason || '本轮结束！', data.word || '--', 3500);
});

// =====================【谁是卧底 渲染】=====================
ucSecretCard.addEventListener('click', () => {
  ucSecretCard.classList.toggle('masked');
});

socket.on('uc_secret_role', (data) => {
  myUndercoverRole = data;
  ucWordText.textContent = data.role === 'blank' ? '⚪ 你是白板 (无词)' : data.word;
  ucRoleLabel.textContent = data.role === 'blank' ? '你的身份' : '我的私密词语';
  ucSecretCard.classList.add('masked');
  playSound('card');
});

btnFinishSpeech.addEventListener('click', () => {
  socket.emit('uc_finish_speech');
});

function renderUndercoverState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round} 轮`;

  const isMySpeechTurn = (state.currentSpeakerToken === myPlayerToken && state.status === 'UC_SPEAKING');
  btnFinishSpeech.classList.toggle('hidden', !isMySpeechTurn);

  if (state.currentSpeakerName) {
    ucSpeakerName.textContent = state.currentSpeakerName;
    ucSpeakerAvatar.textContent = state.players.find(p => p.token === state.currentSpeakerToken)?.avatar || '🎤';
  }

  ucStageDesc.textContent = state.status === 'UC_SPEAKING' ? '🎤 玩家轮流发言中' : (state.status === 'UC_VOTING' ? '🗳️ 请点击卡片投出卧底' : '📊 结算中');

  // 渲染玩家卡片网格
  ucPlayerGrid.innerHTML = '';
  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = `uc-player-card ${p.token === state.currentSpeakerToken ? 'is-speaking' : ''} ${!p.alive ? 'is-dead' : ''}`;
    
    card.innerHTML = `
      <div style="font-size:1.6rem">${p.avatar}</div>
      <b style="font-size:0.85rem;display:block;margin-top:2px">${p.name}</b>
      <small style="font-size:0.7rem;color:#94A3B8">${p.alive ? '存活' : '已出局'}</small>
      ${p.votesReceived > 0 ? `<span class="uc-vote-badge">${p.votesReceived}票</span>` : ''}
    `;

    if (state.status === 'UC_VOTING' && p.alive && p.token !== myPlayerToken) {
      card.onclick = () => {
        document.querySelectorAll('.uc-player-card').forEach(c => c.classList.remove('selected-vote'));
        card.classList.add('selected-vote');
        socket.emit('uc_cast_vote', { targetToken: p.token });
        playSound('tick');
      };
    }
    ucPlayerGrid.appendChild(card);
  });
}

socket.on('uc_speaker_turn', (data) => {
  playSound('tick');
});

socket.on('uc_game_over', (data) => {
  const isCivWin = data.winningTeam === 'civilians';
  const isSpyWin = data.winningTeam === 'undercovers';
  const title = isCivWin ? '🎉 平民阵营胜利！' : (isSpyWin ? '😈 卧底阵营胜利！' : '⚪ 白板绝地胜利！');

  const extraHtml = `
    <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:12px">
      <p style="margin:0">平民词：<b style="color:#60A5FA">${escapeHtml(data.civWord)}</b> | 卧底词：<b style="color:#F87171">${escapeHtml(data.spyWord)}</b></p>
    </div>
  `;

  const podium = (data.allRoles || []).map(p => {
    const roleTag = p.role === 'undercover' ? '🕵️ 卧底' : (p.role === 'blank' ? '⚪ 白板' : '🧑‍🌾 平民');
    return {
      avatar: p.avatar,
      name: p.name,
      detail: `(${roleTag}) · ${p.word || '无词'}`,
      score: p.score || 0
    };
  });

  showGameOverModal({
    title,
    desc: data.winReason || '',
    extraHtml,
    podium
  });
});

// =====================【阿瓦隆 渲染】=====================
socket.on('avalon_secret_role', (data) => {
  myAvalonRole = data;
  avRoleBadge.textContent = data.roleName;
  avSideBadge.textContent = data.side === 'good' ? '正义阵营 🛡️' : '邪恶阵营 😈';
  avSideBadge.style.color = data.side === 'good' ? '#60A5FA' : '#EF4444';
  avRoleDesc.textContent = data.desc;

  avSeenContainer.innerHTML = '';
  if (data.seenInfo && data.seenInfo.length > 0) {
    data.seenInfo.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'seen-chip';
      chip.textContent = `${item.avatar} ${item.name} (${item.tag})`;
      avSeenContainer.appendChild(chip);
    });
  } else {
    avSeenContainer.innerHTML = '<small style="color:#94A3B8;font-size:0.75rem">闭眼无特殊感知</small>';
  }
  playSound('card');
});

function renderAvalonState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `任务 ${state.currentQuestIndex + 1}/5`;

  // 渲染圣杯轨道
  const nodes = avalonQuestTrack.querySelectorAll('.quest-node');
  nodes.forEach((node, i) => {
    node.className = 'quest-node';
    if (i === state.currentQuestIndex) node.classList.add('active-quest');
    const hist = state.questHistory[i];
    if (hist) {
      node.classList.add(hist.success ? 'good-win' : 'evil-win');
      node.querySelector('.grail-icon').textContent = hist.success ? '🛡️' : '💀';
    }
  });

  // 渲染流产红点
  const dots = avRejectDots.querySelectorAll('.dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < state.rejectTrack);
  });

  const isLeader = (state.leaderToken === myPlayerToken);
  btnSubmitTeam.classList.toggle('hidden', !isLeader || state.status !== 'AVALON_TEAM_PROPOSE');
  
  // 麦序发言区域控制
  if (state.status === 'AVALON_SPEECH') {
    avSpeechPanel.classList.remove('hidden');
    avSpeakerAvatar.textContent = state.currentSpeakerAvatar || '🐱';
    avSpeakerName.textContent = state.currentSpeakerName || '某位玩家';
    avSpeakerTag.textContent = `麦序 ${state.speakerIndex + 1}/${state.speakerTotal || state.players.length} · ⏱ ${state.timeLeft}s`;

    const isCurrentSpeaker = (state.currentSpeakerToken === myPlayerToken);
    btnAvFinishSpeech.classList.toggle('hidden', !isCurrentSpeaker);
    if (isCurrentSpeaker) {
      avSpeechTip.textContent = '🎤 轮到你发言！阐述你的推论或分析，发言完毕点击【结束发言】';
      avSpeechTip.style.color = '#60A5FA';
    } else {
      avSpeechTip.textContent = `👂 正在倾听【${state.currentSpeakerName}】发言... (${state.timeLeft}s)`;
      avSpeechTip.style.color = '#94A3B8';
    }
    avBoardStatus.textContent = `🎙️ 全员轮流发言中 (当前麦序: ${state.currentSpeakerName})`;
  } else {
    avSpeechPanel.classList.add('hidden');
  }

  if (state.status === 'AVALON_ASSASSIN') {
    const isEvilOrAssassin = myAvalonRole && (myAvalonRole.role === 'assassin' || myAvalonRole.side === 'evil');
    avBoardStatus.textContent = isEvilOrAssassin ? '🗡️ 刺客行动！请指认并刺杀梅林！' : '🗡️ 刺客正在进行绝命刺杀梅林...';
    if (isEvilOrAssassin) {
      avalonAssassinModal.classList.add('active');
      assassinTargetList.innerHTML = '';
      state.players.forEach(p => {
        if (p.token === myPlayerToken) return;
        const item = document.createElement('div');
        item.className = 'assassin-target-item';
        item.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.4rem">${p.avatar}</span>
            <span style="font-weight:700;font-size:0.9rem">${p.name}</span>
          </div>
          <button class="btn btn-sm btn-danger">刺杀此人</button>
        `;
        item.querySelector('button').onclick = () => {
          socket.emit('avalon_assassinate', { targetToken: p.token });
          avalonAssassinModal.classList.remove('active');
        };
        assassinTargetList.appendChild(item);
      });
    } else {
      avalonAssassinModal.classList.remove('active');
    }
  } else if (state.status !== 'AVALON_SPEECH') {
    avalonAssassinModal.classList.remove('active');
    if (state.status === 'AVALON_ROLE_REVEAL') {
      avBoardStatus.textContent = '🔮 夜幕降临，感知阵营中...';
    } else {
      avBoardStatus.textContent = isLeader ? `👑 你是队长！请选择 ${state.requiredTeamCount} 名队员` : `👑 队长【${state.leaderName}】挑选队员中 (${state.selectedTeam.length}/${state.requiredTeamCount})`;
    }
  }

  // 渲染组队卡片
  avPlayerCardsGrid.innerHTML = '';
  state.players.forEach(p => {
    const card = document.createElement('div');
    const isSelected = state.selectedTeam.includes(p.token);
    const isSpeaker = (state.status === 'AVALON_SPEECH' && p.token === state.currentSpeakerToken);
    card.className = `av-p-card ${p.token === state.leaderToken ? 'is-leader' : ''} ${isSelected ? 'is-selected' : ''} ${isSpeaker ? 'is-speaker' : ''}`;
    
    let badgeText = '';
    if (p.token === state.leaderToken) badgeText = '👑队长';
    if (isSelected) badgeText = '⚔️已选';
    if (isSpeaker) badgeText = '🎤发言中';

    card.innerHTML = `
      <div style="font-size:1.5rem">${p.avatar}</div>
      <div style="font-size:0.8rem;font-weight:bold">${p.name}</div>
      <small style="font-size:0.7rem;color:${isSpeaker ? '#60A5FA' : '#94A3B8'}">${badgeText}</small>
    `;

    if (isLeader && state.status === 'AVALON_TEAM_PROPOSE') {
      card.onclick = () => {
        socket.emit('avalon_select_member', { memberToken: p.token });
        playSound('tick');
      };
    }
    avPlayerCardsGrid.appendChild(card);
  });

  // 组队表决弹窗控制
  if (state.status === 'AVALON_TEAM_VOTE' && !state.votedTokens.includes(myPlayerToken)) {
    avalonVoteModal.classList.add('active');
  } else {
    avalonVoteModal.classList.remove('active');
  }

  // 任务暗投弹窗控制
  if (state.status === 'AVALON_QUEST_VOTE' && state.selectedTeam.includes(myPlayerToken) && !(state.questVotedTokens || []).includes(myPlayerToken)) {
    avalonQuestModal.classList.add('active');
    // 如果是好人，禁用破坏按钮
    const isGood = myAvalonRole && myAvalonRole.side === 'good';
    document.getElementById('btn-quest-fail').disabled = isGood;
    document.getElementById('btn-quest-fail').style.opacity = isGood ? '0.3' : '1';
  } else {
    avalonQuestModal.classList.remove('active');
  }
}

btnSubmitTeam.addEventListener('click', () => {
  if (currentRoomState && currentRoomState.selectedTeam) {
    socket.emit('avalon_submit_team', { teamTokens: currentRoomState.selectedTeam });
  }
});

btnAvFinishSpeech?.addEventListener('click', () => {
  socket.emit('avalon_finish_speech');
  playSound('pop');
});

let isAvMicOn = false;
btnAvMicToggle?.addEventListener('click', () => {
  isAvMicOn = !isAvMicOn;
  btnAvMicToggle.textContent = isAvMicOn ? '🔴 闭麦' : '🎤 开麦';
  btnAvMicToggle.className = isAvMicOn ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-secondary';
  showToast(isAvMicOn ? '麦克风已开启' : '麦克风已静音', isAvMicOn ? '🎤' : '🔇');
});

document.getElementById('btn-team-approve')?.addEventListener('click', () => {
  socket.emit('avalon_team_vote', { approve: true });
  avalonVoteModal.classList.remove('active');
});

document.getElementById('btn-team-reject')?.addEventListener('click', () => {
  socket.emit('avalon_team_vote', { approve: false });
  avalonVoteModal.classList.remove('active');
});

document.getElementById('btn-quest-success')?.addEventListener('click', () => {
  socket.emit('avalon_quest_vote', { isSuccess: true });
  avalonQuestModal.classList.remove('active');
});

document.getElementById('btn-quest-fail')?.addEventListener('click', () => {
  socket.emit('avalon_quest_vote', { isSuccess: false });
  avalonQuestModal.classList.remove('active');
});

socket.on('avalon_game_over', (data) => {
  const isGoodWin = data.winner === 'good';
  const podium = (data.allRoles || []).map(p => ({
    avatar: p.avatar,
    name: p.name,
    detail: `(${escapeHtml(p.roleName)})`,
    score: p.side === 'good' ? (isGoodWin ? 100 : 0) : (!isGoodWin ? 100 : 0)
  }));

  showGameOverModal({
    title: isGoodWin ? '🛡️ 正义阵营胜利！' : '👿 邪恶阵营胜利！',
    desc: data.winReason || '',
    podium
  });
});

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
        <span>${p.avatar} ${p.name}</span>
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
    title: `🃏 【${escapeHtml(data.winnerName)}】赢得 UNO 胜局！`,
    desc: `获得积分 +${data.earnedScore} 分！`,
    podium
  });
});

// =====================【瞬间数小鸡/数动物 奔跑渲染引擎 (DOM + Canvas 双重保险)】=====================
let flashAnimationId = null;

function initFlashCanvasResolution() {
  return fitCanvasResolution(flashCanvas, flashCtx, 360, 260, 600);
}

function drawFlashTrackBackground(c, width, height) {
  const laneHeight = height / 5;
  for (let i = 0; i < 5; i++) {
    // 5 条清爽草坪独立跑道（交替深浅，视觉层次分明）
    c.fillStyle = (i % 2 === 0) ? '#123927' : '#0c271b';
    c.fillRect(0, i * laneHeight, width, laneHeight);

    // 跑道分割白虚线
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

  // 起跑线与终点线指示 (左右两端)
  c.fillStyle = 'rgba(255, 255, 255, 0.08)';
  c.fillRect(0, 0, 10, height);
  c.fillRect(width - 10, 0, 10, height);
}

function renderFlashCounterState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

  if (state.targetAnimal) {
    if (readyTargetEmoji) readyTargetEmoji.textContent = state.targetAnimal.emoji;
    if (readyTargetName) readyTargetName.textContent = state.targetAnimal.name;
    if (flashTargetEmoji) flashTargetEmoji.textContent = state.targetAnimal.emoji;
    if (flashTargetName) flashTargetName.textContent = state.targetAnimal.name;
  }

  if (state.status === 'FLASH_READY') {
    resetFlashForm();
    flashOverlayCard.classList.add('hidden');
    wordHintBox.textContent = `第 ${state.round} 轮：准备数【${state.targetAnimal ? state.targetAnimal.name : '动物'}】... 倒计时 ${state.timeLeft}s`;
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
    flashOverlayCard.classList.add('hidden');
    wordHintBox.textContent = `👀 正在飞奔穿过！全神贯注数【${state.targetAnimal ? state.targetAnimal.name : '目标动物'}】！`;
  } else if (state.status === 'FLASH_GUESSING') {
    if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
    if (flashRunnersLayer) flashRunnersLayer.innerHTML = '';
    flashOverlayCard.classList.remove('hidden');
    wordHintBox.textContent = `请抢答刚才跑过了几只【${state.targetAnimal ? state.targetAnimal.name : '目标'}】？剩余 ${state.timeLeft}s`;

    if (state.options && state.options.length > 0 && flashOptionsGrid.children.length === 0) {
      flashOptionsGrid.innerHTML = '';
      state.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-flash-option';
        btn.textContent = opt;
        btn.onclick = () => {
          if (flashDirectInput) flashDirectInput.value = opt;
          setFlashAnswerSubmitted(opt);
          socket.emit('flash_submit_answer', { option: opt });
          playSound('tick');
        };
        flashOptionsGrid.appendChild(btn);
      });
    }
  }
}

socket.on('flash_round_ready', (data) => {
  resetFlashForm();
  flashOverlayCard.classList.add('hidden');
  if (flashAnimationId) cancelAnimationFrame(flashAnimationId);
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

socket.on('flash_start_flying', (data) => {
  resetFlashForm();
  if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
  flashOverlayCard.classList.add('hidden');

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

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'flash-runner-item';
      // 动画持续时间（横穿屏幕平稳用时约 2.3 ~ 2.7 秒）
      const runDuration = 2.4 / (item.speed ? (item.speed / 0.38) : 1);
      // 跑道中心精准像素对齐
      const targetPixelY = Math.round((item.laneIndex + 0.5) * laneH);
      el.style.top = `${targetPixelY}px`;
      el.style.fontSize = `${item.size || 44}px`;
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

socket.on('flash_question', (data) => {
  resetFlashForm();
  flashTargetEmoji.textContent = data.targetAnimal.emoji;
  flashTargetName.textContent = data.targetAnimal.name;
  flashOptionsGrid.innerHTML = '';

  data.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-flash-option';
    btn.textContent = opt;
    btn.onclick = () => {
      if (flashDirectInput) flashDirectInput.value = opt;
      setFlashAnswerSubmitted(opt);
      socket.emit('flash_submit_answer', { option: opt });
      playSound('tick');
    };
    flashOptionsGrid.appendChild(btn);
  });
  flashOverlayCard.classList.remove('hidden');
});

socket.on('flash_round_result', (data) => {
  playSound('fanfare');
  showRevealModal(`🎯 正确数量：${data.targetCount} 只 ${data.targetAnimal ? data.targetAnimal.emoji : ''}`, `${data.targetCount}`, 3500);
});

socket.on('flash_game_over', (data) => {
  showGameOverModal({
    title: '🏆 瞬间数羊 终局战报',
    desc: '动态视力巅峰王者诞生！',
    podium: data.podium || []
  });
});

// =====================【拆弹轮盘赌 渲染】=====================
function renderBombRouletteState(state) {
  displayRoundTag.classList.add('hidden');
  const isMyTurn = (state.currentTurnToken === myPlayerToken);

  bombTurnTip.textContent = isMyTurn ? '🔥 轮到你剪线！请选择一根引线！' : `⏳ 等待【${state.currentTurnName}】拆弹...`;
  bombTurnTip.style.color = isMyTurn ? '#EF4444' : '#FBBF24';

  wiresGrid.innerHTML = '';
  state.wires.forEach(w => {
    const card = document.createElement('div');
    card.className = `wire-card ${w.isCut ? 'cut' : ''}`;
    card.style.borderColor = w.color;
    card.style.color = w.color;
    card.innerHTML = `<span>✂️ ${w.name}</span>`;

    if (!w.isCut && isMyTurn && state.status === 'BOMB_PLAYING') {
      card.onclick = () => {
        socket.emit('bomb_cut_wire', { wireId: w.id });
        playSound('card');
      };
    }
    wiresGrid.appendChild(card);
  });
}

socket.on('wire_cut_safe', (data) => {
  playSound('pop');
  showToast(`✂️ ${data.playerName} 成功剪断 ${data.wire ? data.wire.name : '引线'}！+${data.earnedPoints || 50}分`, '🛡️');
});

socket.on('bomb_exploded', (data) => {
  playSound('boom');
  launchConfetti();
  showRevealModal('💥 BOOM！！！炸弹引爆！', `💀 ${escapeHtml(data.victimName)}`, 4000);
});

socket.on('bomb_game_over', (data) => {
  showGameOverModal({
    title: '💣 拆弹轮盘 对决结束',
    desc: data.explodedPlayer ? `【${escapeHtml(data.explodedPlayer.name)}】触发了爆炸引线！` : '全员奇迹生还！',
    podium: data.podium || []
  });
});

// =====================【几A几B 密码破解 渲染】=====================
function renderBullsAndCowsState(state) {
  displayRoundTag.classList.add('hidden');
  wordHintBox.textContent = `密码破解竞速中... 剩余 ${state.timeLeft}s`;

  // 状态自愈：如果本地无记录但服务端有历史，则自动还原
  if (state.playerGuesses && state.playerGuesses[myPlayerToken] && bcLogList) {
    const history = state.playerGuesses[myPlayerToken];
    if (history.length > 0 && bcLogList.querySelectorAll('.bc-log-item').length === 0) {
      bcLogList.innerHTML = '';
      history.forEach((h, idx) => {
        const item = document.createElement('div');
        item.className = 'bc-log-item';
        item.innerHTML = `
          <span>#${idx + 1} 猜想 <b class="bc-log-guess">${h.guess}</b></span>
          <span class="bc-log-feedback">${h.a}A ${h.b}B</span>
        `;
        bcLogList.appendChild(item);
      });
    }
  }
}

function resetAllGameStages() {
  // 1. 几A几B
  currentBcInput = '';
  updateBcDisplay();
  if (bcLogList) {
    bcLogList.innerHTML = '<div class="bc-empty-tip">请输入 4 位不重复数字</div>';
  }

  // 2. 决战24点
  currentM24Formula = '';
  usedM24CardIndices.clear();
  if (m24CardsRow) m24CardsRow.innerHTML = '';
  if (m24NumButtons) m24NumButtons.innerHTML = '';
  if (m24FormulaText) m24FormulaText.textContent = '使用下方按键拼凑 24 点算式...';
  const evalEl = document.getElementById('m24-eval-preview');
  if (evalEl) {
    evalEl.textContent = '当前计算结果：--';
    evalEl.className = 'm24-eval-preview';
  }

  // 3. 3D数方块
  resetCubeForm();
  currentCubeGrid = null;
  if (cubeCanvas && cubeCtx) {
    cubeCtx.clearRect(0, 0, cubeCanvas.width, cubeCanvas.height);
  }

  // 4. 瞬间数小鸡
  resetFlashForm();
  if (flashAnimationId) cancelAnimationFrame(flashAnimationId);
  if (flashOverlayCard) flashOverlayCard.classList.add('hidden');
  if (flashReadyBanner) flashReadyBanner.classList.add('hidden');
  if (flashRunnersLayer) flashRunnersLayer.innerHTML = '';
  if (flashCanvas && flashCtx) {
    flashCtx.clearRect(0, 0, flashCanvas.width, flashCanvas.height);
  }

  // 5. 词汇炸弹
  if (wbInput) wbInput.value = '';

  // 6. 切披萨
  hasSubmittedSlice = false;
  isSlicing = false;
  currentSliceSplitState = null;
  if (sliceAnimFrame) cancelAnimationFrame(sliceAnimFrame);
  if (sliceResultBadge) sliceResultBadge.classList.add('hidden');

  // 7. 盲压挑战
  hasSubmittedHold = false;
  isHoldingButton = false;
  holdPressStartTime = null;
  if (holdResultBox) holdResultBox.classList.add('hidden');
  if (btnHoldTrigger) {
    btnHoldTrigger.classList.remove('pressing');
    btnHoldTrigger.classList.remove('hidden');
  }
  if (holdText) holdText.textContent = '按住开始计时';

  // 8. 你画我猜
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

socket.on('bc_game_start', () => {
  currentBcInput = '';
  updateBcDisplay();
  if (bcLogList) {
    bcLogList.innerHTML = '<div class="bc-empty-tip">请输入 4 位不重复数字</div>';
  }
});
document.querySelectorAll('#stage-bulls-and-cows .btn-key').forEach(btn => {
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

btnBcClear?.addEventListener('click', () => {
  currentBcInput = '';
  updateBcDisplay();
});

btnBcSubmit?.addEventListener('click', () => {
  if (currentBcInput.length === 4) {
    socket.emit('bc_submit_guess', { guess: currentBcInput });
    currentBcInput = '';
    updateBcDisplay();
    playSound('card');
  } else {
    showToast('请输入 4 位互不重复的数字！', '⚠️');
  }
});

function updateBcDisplay() {
  const chars = currentBcInput.split('');
  while (chars.length < 4) chars.push('_');
  bcDigitsDisplay.textContent = chars.join(' ');
}

socket.on('bc_guess_result', (data) => {
  playSound(data.a === 4 ? 'correct' : 'tick');
  bcLogList.innerHTML = '';
  data.history.forEach((h, idx) => {
    const item = document.createElement('div');
    item.className = 'bc-log-item';
    item.innerHTML = `
      <span>#${idx + 1} 猜想 <b class="bc-log-guess">${h.guess}</b></span>
      <span class="bc-log-feedback">${h.a}A ${h.b}B</span>
    `;
    bcLogList.appendChild(item);
  });
  bcLogList.scrollTop = bcLogList.scrollHeight;
});

socket.on('bc_game_over', (data) => {
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
    desc: `解密王者：【${escapeHtml(data.winnerName)}】`,
    extraHtml: secretHtml,
    podium
  });
});

// =====================【决战 24 点 渲染】=====================
const cardSuits = ['♠', '♥', '♣', '♦'];

function updateM24EvalPreview() {
  const evalEl = document.getElementById('m24-eval-preview');
  if (!evalEl) return;
  if (!currentM24Formula || currentM24Formula.trim() === '') {
    evalEl.textContent = '当前计算结果：--';
    evalEl.className = 'm24-eval-preview';
    return;
  }
  try {
    // 安全求值算式
    const sanitized = currentM24Formula.replace(/[^0-9+\-*/()]/g, '');
    const res = Function(`"use strict"; return (${sanitized})`)();
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

function renderMath24State(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;
  wordHintBox.textContent = `用给定的 4 张牌算 24 点！剩余 ${state.timeLeft}s`;

  if (state.currentCards && JSON.stringify(state.currentCards) !== JSON.stringify(currentM24Cards)) {
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

// =====================【3D 几何数方块 渲染】=====================
function setCubeAnswerSubmitted(opt) {
  setFormAnswerSubmitted({
    inputEl: cubeDirectInput,
    formEl: cubeDirectForm,
    optionButtonsSelector: '.btn-cube-option',
    submittedVal: opt
  });
}

function resetCubeForm() {
  resetFormAnswerState({
    inputEl: cubeDirectInput,
    formEl: cubeDirectForm,
    optionButtonsSelector: '.btn-cube-option',
    submitDefaultText: '提交答案'
  });
}

// =====================【3D 几何数方块 渲染引擎 (Depth-Sorted & Modern Isometric)】=====================
let currentCubeGrid = null;

function initCubeCanvasResolution() {
  return fitCanvasResolution(cubeCanvas, cubeCtx, 360, 320, 600);
}

function renderCubeCountState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

  if (state.status === 'CUBE_OBSERVE') {
    wordHintBox.textContent = `👀 观察 3D 几何体结构并默数... 剩余 ${state.timeLeft}s`;
  } else if (state.status === 'CUBE_GUESSING') {
    wordHintBox.textContent = `❓ 请选择或输入立方体总数！剩余 ${state.timeLeft}s`;
    // 状态自愈：如果尚未渲染选项按钮则即时渲染
    if (state.options && state.options.length > 0 && cubeOptionsGrid.children.length === 0) {
      cubeOptionsGrid.innerHTML = '';
      state.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-cube-option';
        btn.textContent = opt;
        btn.onclick = () => {
          if (cubeDirectInput) cubeDirectInput.value = opt;
          setCubeAnswerSubmitted(opt);
          socket.emit('cube_submit_answer', { option: opt });
          playSound('tick');
        };
        cubeOptionsGrid.appendChild(btn);
      });
    }
  }

  // 保持当前 3D 几何体持续渲染
  if (currentCubeGrid) {
    const { w, h, dpr } = initCubeCanvasResolution();
    if (cubeCtx) {
      cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawIsometricCubes(cubeCtx, currentCubeGrid, w, h);
    }
  }
}

socket.on('cube_start_observe', (data) => {
  resetCubeForm();
  currentCubeGrid = data.grid;
  const { w, h, dpr } = initCubeCanvasResolution();
  if (!cubeCanvas || !cubeCtx) return;
  cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawIsometricCubes(cubeCtx, data.grid, w, h);
  playSound('card');
});

socket.on('cube_question', (data) => {
  resetCubeForm();
  if (data.grid) currentCubeGrid = data.grid;
  const { w, h, dpr } = initCubeCanvasResolution();
  if (cubeCanvas && cubeCtx && currentCubeGrid) {
    cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIsometricCubes(cubeCtx, currentCubeGrid, w, h);
  }

  cubeOptionsGrid.innerHTML = '';
  data.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-cube-option';
    btn.textContent = opt;
    btn.onclick = () => {
      if (cubeDirectInput) cubeDirectInput.value = opt;
      setCubeAnswerSubmitted(opt);
      socket.emit('cube_submit_answer', { option: opt });
      playSound('tick');
    };
    cubeOptionsGrid.appendChild(btn);
  });
});

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

  // 1. 绘制 3x3 空间等轴测地台网格（Base Grid Platform）
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

  // 2. 收集所有立方体并进行严格 Painter's Algorithm 深度排序
  const voxels = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const h = grid[r][col];
      for (let z = 0; z < h; z++) {
        voxels.push({ r, col, z, depth: (r + col) * 100 + z });
      }
    }
  }

  // 升序排列：最深处先画，最前方最后画，完美遮挡无穿模
  voxels.sort((a, b) => a.depth - b.depth);

  // 3. 逐个绘制立体感强烈的立方体
  voxels.forEach(v => {
    const x = originX + (v.col - v.r) * (tileW / 2);
    const y = originY + (v.col + v.r) * (tileH / 2) - v.z * cubeH;
    drawSingleModernVoxel(c, x, y, tileW, tileH, cubeH);
  });

  // 4. 结算阶段透视标记：标出每列方块高度
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
  // 1. 顶面 (Top Face - 亮蓝高光渐变)
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

  // 2. 左侧面 (Left Face - 中调蓝)
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

  // 3. 右侧面 (Right Face - 阴影深蓝)
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

  // 4. 顶面内高光轮廓
  c.beginPath();
  c.moveTo(x - w / 2 + 2, y + h / 2 - ch);
  c.lineTo(x, y - ch + 2);
  c.lineTo(x + w / 2 - 2, y + h / 2 - ch);
  c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  c.lineWidth = 1;
  c.stroke();
}

if (cubeDirectForm) {
  cubeDirectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseInt(cubeDirectInput?.value);
    if (!isNaN(val) && val > 0) {
      setCubeAnswerSubmitted(val);
      socket.emit('cube_submit_answer', { option: val });
      playSound('tick');
    }
  });
}

function setFlashAnswerSubmitted(opt) {
  setFormAnswerSubmitted({
    inputEl: flashDirectInput,
    formEl: flashDirectForm,
    optionButtonsSelector: '.btn-flash-option',
    submittedVal: opt
  });
}

function resetFlashForm() {
  resetFormAnswerState({
    inputEl: flashDirectInput,
    formEl: flashDirectForm,
    optionButtonsSelector: '.btn-flash-option',
    submitDefaultText: '提交答案'
  });
}

if (flashDirectForm) {
  flashDirectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseInt(flashDirectInput?.value);
    if (!isNaN(val) && val > 0) {
      setFlashAnswerSubmitted(val);
      socket.emit('flash_submit_answer', { option: val });
      playSound('tick');
    }
  });
}

socket.on('cube_round_result', (data) => {
  playSound('fanfare');
  if (data.grid && cubeCanvas && cubeCtx) {
    const { w, h, dpr } = initCubeCanvasResolution();
    cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIsometricCubes(cubeCtx, data.grid, w, h, true);
  }
  showRevealModal('🧊 正确方块总数：', `${data.totalCubes} 个`, 3500);
});

socket.on('cube_game_over', (data) => {
  showGameOverModal({
    title: '🧊 3D 几何数方块 空间总榜',
    desc: '空间想象力之王诞生！',
    podium: data.podium || []
  });
});

// =====================【词汇炸弹 渲染】=====================
function renderWordBombState(state) {
  displayRoundTag.classList.add('hidden');
  const isMyTurn = (state.currentTurnToken === myPlayerToken);

  wbKeywordBadge.textContent = state.currentKeyword || '天';
  wbTurnStatus.textContent = isMyTurn ? '🔥 炸弹在你手中！快输入符合条件的词语！' : `⏳ 持弹人：【${state.currentTurnName}】`;
  wbTurnStatus.style.color = isMyTurn ? '#EF4444' : '#FBBF24';
  wordHintBox.textContent = `必须包含【${state.currentKeyword}】· 倒计时 ${state.timeLeft}s`;

  // 渲染生命值
  const myLives = (state.playerLives && state.playerLives[myPlayerToken] !== undefined) ? state.playerLives[myPlayerToken] : 2;
  wbLivesBar.textContent = `我的生命值：${'❤️'.repeat(Math.max(0, myLives))}${myLives <= 0 ? ' 💀 已淘汰' : ''}`;
}

wbInputForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isIMEComposing) return; // 拦截输入法选字未完成提交
  const word = wbInput.value.trim();
  if (word) {
    socket.emit('word_bomb_submit', { word });
    wbInput.value = '';
    playSound('card');
  }
});

socket.on('word_bomb_game_over', (data) => {
  showGameOverModal({
    title: '💥 词汇炸弹 决出胜者！',
    desc: `最终幸存王者：【${escapeHtml(data.winnerName)}】！`,
    podium: data.podium || []
  });
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isIMEComposing) return; // 拦截输入法选字未完成提交
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('send_chat', { text });
    chatInput.value = '';
  }
});

socket.on('chat_message', (data) => {
  const msgEl = document.createElement('div');
  const safeAvatar = escapeHtml(data.avatar);
  const safeSender = escapeHtml(data.sender);
  const safeText = escapeHtml(data.text);

  if (data.type === 'correct') {
    msgEl.className = 'msg-item msg-correct';
    msgEl.innerHTML = `${safeAvatar} <b>${safeSender}</b>：${safeText}`;
    playSound('correct');
    launchConfetti();
  } else {
    msgEl.className = 'msg-item';
    msgEl.innerHTML = `<span class="msg-sender">${safeAvatar} ${safeSender}:</span> ${safeText}`;
  }
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (isChatCollapsed) {
    unreadMessageCount++;
    chatUnreadBadge.textContent = `${unreadMessageCount} 条新消息`;
    chatUnreadBadge.classList.remove('hidden');
  }
});

socket.on('system_message', (text) => {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg-item msg-system';
  msgEl.textContent = `📢 ${text}`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (isChatCollapsed) {
    unreadMessageCount++;
    chatUnreadBadge.textContent = `${unreadMessageCount} 条新消息`;
    chatUnreadBadge.classList.remove('hidden');
  }
});

socket.on('timer_tick', (data) => {
  const t = data.timeLeft !== undefined ? data.timeLeft : 0;
  if (displayTime) displayTime.textContent = t;
  if (modalTimer) modalTimer.textContent = t;

  if (timerBox) {
    if (t <= 10 && t > 0) timerBox.classList.add('warning');
    else timerBox.classList.remove('warning');
  }

  // 同步刷新次级提示状态栏中的倒计时数字
  if (wordHintBox && wordHintBox.textContent) {
    wordHintBox.textContent = wordHintBox.textContent.replace(/(?:剩余|倒计时)\s*\d+s/g, (match) => {
      return match.startsWith('倒计时') ? `倒计时 ${t}s` : `剩余 ${t}s`;
    });
  }

  if (t <= 5 && t > 0) playSound('tick');
});

// 表情特效
document.querySelectorAll('.btn-reaction').forEach(btn => {
  btn.addEventListener('click', () => {
    socket.emit('send_reaction', { emoji: btn.dataset.emoji });
  });
});

socket.on('floating_reaction', (data) => {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = data.emoji;
  el.style.left = `${Math.random() * 70 + 15}%`;
  el.style.bottom = '80px';
  reactionContainer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
});

// =====================【切披萨 50:50 高级物理食物渲染引擎】=====================
let sliceAnimFrame = null;
let currentSliceSplitState = null;

function initSliceCanvasResolution() {
  const { w, h } = fitCanvasResolution(sliceCanvas, null, 360, 360, 500);
  if (sliceCtx) {
    const dpr = window.devicePixelRatio || 1;
    sliceCtx.setTransform(1, 0, 0, 1, 0, 0);
    sliceCtx.scale(dpr, dpr);
  }
  return { w, h };
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getShapeSeed(shape) {
  if (!shape || !shape.points) return 123456;
  let str = (shape.name || '') + shape.points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

function isPointInsidePoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function computePolygonCentroid(pts) {
  let cx = 0, cy = 0, signedArea = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const x0 = pts[i].x, y0 = pts[i].y;
    const x1 = pts[(i + 1) % n].x, y1 = pts[(i + 1) % n].y;
    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-5) {
    let sx = 0, sy = 0;
    pts.forEach(p => { sx += p.x; sy += p.y; });
    return { x: sx / n, y: sy / n };
  }
  cx = cx / (6 * signedArea);
  cy = cy / (6 * signedArea);
  return { x: cx, y: cy };
}

function robustSlicePolygon(points, p1, p2) {
  const A = p2.y - p1.y;
  const B = p1.x - p2.x;
  const C = p2.x * p1.y - p1.x * p2.y;
  const EPS = 1e-7;

  function dist(p) { return A * p.x + B * p.y + C; }
  function intersect(a, b) {
    const da = dist(a);
    const db = dist(b);
    const t = da / (da - db);
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y)
    };
  }

  const poly1 = [], poly2 = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = dist(cur);
    const d2 = dist(next);

    if (d1 >= -EPS) poly1.push(cur);
    if (d1 <= EPS) poly2.push(cur);

    if ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) {
      const pt = intersect(cur, next);
      poly1.push(pt);
      poly2.push(pt);
    }
  }
  return { poly1, poly2 };
}

function drawArtisanPizzaPiece(c, pts, width, height, seed, offsetX = 0, offsetY = 0, isSplit = false) {
  if (!pts || pts.length < 3) return;
  const rand = mulberry32(seed);

  c.save();
  c.translate(offsetX, offsetY);

  // 1. 披萨饼底底层暗部阴影
  c.beginPath();
  c.moveTo(pts[0].x * width, pts[0].y * height);
  for (let i = 1; i < pts.length; i++) {
    c.lineTo(pts[i].x * width, pts[i].y * height);
  }
  c.closePath();

  c.save();
  c.shadowColor = 'rgba(0, 0, 0, 0.45)';
  c.shadowBlur = 20;
  c.shadowOffsetY = 10;
  c.fillStyle = '#451a03';
  c.fill();
  c.restore();

  // 2. 烘烤金黄酥脆外皮 (Artisan Baked Crust Base)
  const centroid = computePolygonCentroid(pts);
  const cx = centroid.x * width;
  const cy = centroid.y * height;

  const crustGrad = c.createRadialGradient(cx, cy, 15, cx, cy, Math.max(width, height) * 0.45);
  crustGrad.addColorStop(0, '#d97706');
  crustGrad.addColorStop(0.65, '#b45309');
  crustGrad.addColorStop(1, '#78350f');

  c.fillStyle = crustGrad;
  c.fill();

  // 3. 芝士与番茄红酱层 (Melty Mozzarella & Rich Marinara Layer)
  c.beginPath();
  pts.forEach((p, idx) => {
    const px = p.x * width;
    const py = p.y * height;
    const shrink = isSplit ? 0.90 : 0.86;
    const ix = cx + (px - cx) * shrink;
    const iy = cy + (py - cy) * shrink;
    if (idx === 0) c.moveTo(ix, iy);
    else c.lineTo(ix, iy);
  });
  c.closePath();

  const cheeseGrad = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.35);
  cheeseGrad.addColorStop(0, '#fef08a');
  cheeseGrad.addColorStop(0.55, '#fde047');
  cheeseGrad.addColorStop(0.85, '#f59e0b');
  cheeseGrad.addColorStop(1, '#ea580c');

  c.fillStyle = cheeseGrad;
  c.fill();

  // 4. 饼边烘焙豹纹黑焦斑 (Artisanal Char Leopard Spots)
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const segLen = Math.hypot((p2.x - p1.x) * width, (p2.y - p1.y) * height);
    const spotCount = Math.max(1, Math.floor(segLen / 26));

    for (let k = 0; k < spotCount; k++) {
      const t = (k + 0.5 + (rand() - 0.5) * 0.4) / spotCount;
      const spotX = (p1.x + (p2.x - p1.x) * t) * width;
      const spotY = (p1.y + (p2.y - p1.y) * t) * height;
      const spotR = 2.5 + rand() * 4.5;

      c.beginPath();
      c.arc(spotX + (rand() - 0.5) * 4, spotY + (rand() - 0.5) * 4, spotR, 0, Math.PI * 2);
      c.fillStyle = `rgba(${25 + Math.floor(rand() * 20)}, ${12 + Math.floor(rand() * 10)}, 4, ${0.7 + rand() * 0.25})`;
      c.fill();
    }
  }

  // 5. 内部意式高阶食材 (Gourmet Toppings)
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  pts.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const step = 0.085;
  for (let gx = minX + 0.04; gx <= maxX - 0.04; gx += step) {
    for (let gy = minY + 0.04; gy <= maxY - 0.04; gy += step) {
      const samplePt = {
        x: gx + (rand() - 0.5) * 0.04,
        y: gy + (rand() - 0.5) * 0.04
      };

      if (isPointInsidePoly(samplePt, pts)) {
        const topX = samplePt.x * width;
        const topY = samplePt.y * height;
        const roll = rand();

        if (roll < 0.30) {
          // 🍕 意式辣肉肠 (Salami Pepperoni)
          const rad = 13 + rand() * 5;
          c.save();
          c.translate(topX, topY);
          c.rotate(rand() * Math.PI * 2);

          c.shadowColor = 'rgba(0, 0, 0, 0.35)';
          c.shadowBlur = 4;
          c.shadowOffsetY = 2;

          c.beginPath();
          c.arc(0, 0, rad, 0, Math.PI * 2);
          c.fillStyle = '#7f1d1d';
          c.fill();

          c.shadowColor = 'transparent';
          c.beginPath();
          c.arc(0, 0, rad * 0.88, 0, Math.PI * 2);
          const pepGrad = c.createRadialGradient(0, 0, 2, 0, 0, rad * 0.88);
          pepGrad.addColorStop(0, '#dc2626');
          pepGrad.addColorStop(1, '#991b1b');
          c.fillStyle = pepGrad;
          c.fill();

          c.fillStyle = 'rgba(254, 202, 202, 0.75)';
          for (let f = 0; f < 5; f++) {
            const fa = rand() * Math.PI * 2;
            const fr = rand() * (rad * 0.55);
            c.beginPath();
            c.arc(Math.cos(fa) * fr, Math.sin(fa) * fr, 1.2 + rand() * 0.8, 0, Math.PI * 2);
            c.fill();
          }

          c.beginPath();
          c.arc(-rad * 0.2, -rad * 0.2, rad * 0.5, -0.8, 1.2);
          c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          c.lineWidth = 1.5;
          c.stroke();

          c.restore();
        } else if (roll < 0.50) {
          // 🌿 鲜罗勒嫩叶 (Sweet Basil)
          const leafLen = 13 + rand() * 5;
          c.save();
          c.translate(topX, topY);
          c.rotate(rand() * Math.PI * 2);

          c.shadowColor = 'rgba(0, 0, 0, 0.25)';
          c.shadowBlur = 3;
          c.shadowOffsetY = 1;

          c.beginPath();
          c.ellipse(0, 0, leafLen, leafLen * 0.45, 0, 0, Math.PI * 2);
          const leafGrad = c.createLinearGradient(-leafLen, 0, leafLen, 0);
          leafGrad.addColorStop(0, '#15803d');
          leafGrad.addColorStop(1, '#22c55e');
          c.fillStyle = leafGrad;
          c.fill();

          c.shadowColor = 'transparent';
          c.beginPath();
          c.moveTo(-leafLen * 0.8, 0);
          c.lineTo(leafLen * 0.8, 0);
          c.strokeStyle = 'rgba(254, 240, 138, 0.45)';
          c.lineWidth = 1;
          c.stroke();

          c.restore();
        } else if (roll < 0.68) {
          // 🫒 黑橄榄切片 (Black Olive Ring)
          const oliveR = 7 + rand() * 3;
          c.save();
          c.translate(topX, topY);

          c.shadowColor = 'rgba(0, 0, 0, 0.3)';
          c.shadowBlur = 3;
          c.shadowOffsetY = 1;

          c.beginPath();
          c.arc(0, 0, oliveR, 0, Math.PI * 2);
          c.arc(0, 0, oliveR * 0.45, 0, Math.PI * 2, true);
          c.fillStyle = '#1e1b4b';
          c.fill();

          c.shadowColor = 'transparent';
          c.beginPath();
          c.arc(-oliveR * 0.4, -oliveR * 0.4, 1.2, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255, 255, 255, 0.6)';
          c.fill();

          c.restore();
        } else if (roll < 0.82) {
          // 🍅 樱桃番茄片 (Cherry Tomato)
          const tomR = 9 + rand() * 3;
          c.save();
          c.translate(topX, topY);

          c.beginPath();
          c.arc(0, 0, tomR, 0, Math.PI * 2);
          c.fillStyle = '#dc2626';
          c.fill();

          c.beginPath();
          c.arc(0, 0, tomR * 0.7, 0, Math.PI * 2);
          c.fillStyle = '#ef4444';
          c.fill();

          c.fillStyle = '#fef08a';
          c.beginPath();
          c.arc(-tomR * 0.25, 0, 1.2, 0, Math.PI * 2);
          c.arc(tomR * 0.25, 0, 1.2, 0, Math.PI * 2);
          c.fill();

          c.restore();
        }

        // 🧂 现磨黑胡椒碎
        for (let p = 0; p < 3; p++) {
          const px = topX + (rand() - 0.5) * 22;
          const py = topY + (rand() - 0.5) * 22;
          c.beginPath();
          c.arc(px, py, 0.8 + rand() * 0.6, 0, Math.PI * 2);
          c.fillStyle = 'rgba(28, 25, 23, 0.75)';
          c.fill();
        }
      }
    }
  }

  // 6. 切口断面高光
  if (isSplit) {
    c.strokeStyle = 'rgba(254, 240, 138, 0.75)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(pts[0].x * width, pts[0].y * height);
    for (let i = 1; i < pts.length; i++) {
      c.lineTo(pts[i].x * width, pts[i].y * height);
    }
    c.closePath();
    c.stroke();
  }

  c.restore();
}

function drawLaserBlade(c, p1, p2, width, height) {
  const x1 = p1.x * width, y1 = p1.y * height;
  const x2 = p2.x * width, y2 = p2.y * height;

  c.save();
  
  // 激光光晕 (Cyan Outer Glow)
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  c.lineWidth = 10;
  c.lineCap = 'round';
  c.stroke();

  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = '#38bdf8';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.stroke();

  // 刀芯纯白高亮
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  c.stroke();

  // 端点瞄准环 (Reticle endpoints)
  [ {x: x1, y: y1}, {x: x2, y: y2} ].forEach(pt => {
    c.beginPath();
    c.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.shadowColor = '#38bdf8';
    c.shadowBlur = 10;
    c.fill();

    c.beginPath();
    c.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    c.lineWidth = 1.5;
    c.stroke();
  });

  c.restore();
}

function drawSlicePlateBackground(c, width, height) {
  // 深邃石板托盘背底
  const pad = 12;
  const r = 20;
  c.save();
  c.beginPath();
  c.roundRect(pad, pad, width - pad * 2, height - pad * 2, r);
  const slateGrad = c.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width / 2);
  slateGrad.addColorStop(0, '#1a1f2b');
  slateGrad.addColorStop(1, '#0e121a');
  c.fillStyle = slateGrad;
  c.fill();

  c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  c.lineWidth = 1;
  c.stroke();

  // 中心辅助精微准星与圆环
  c.beginPath();
  c.arc(width / 2, height / 2, Math.min(width, height) * 0.38, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  c.lineWidth = 1;
  c.setLineDash([4, 8]);
  c.stroke();
  c.setLineDash([]);

  c.restore();
}

function drawSliceShape(c, shape, width, height, cutLine = null) {
  c.clearRect(0, 0, width, height);
  drawSlicePlateBackground(c, width, height);

  if (!shape || !shape.points) return;
  const seed = getShapeSeed(shape);

  if (currentSliceSplitState && currentSliceSplitState.active) {
    // 渲染切开分离状态
    const { poly1, poly2, nx, ny, ratio1, ratio2, offsetProgress } = currentSliceSplitState;
    const maxOffset = 14;
    const currentOffset = maxOffset * offsetProgress;

    // 块1
    drawArtisanPizzaPiece(c, poly1, width, height, seed, -nx * currentOffset, -ny * currentOffset, true);
    // 块2
    drawArtisanPizzaPiece(c, poly2, width, height, seed + 999, nx * currentOffset, ny * currentOffset, true);

    // 绘制两半中央的磨砂面积胶囊
    if (offsetProgress > 0.3) {
      const alpha = Math.min(1, (offsetProgress - 0.3) * 1.8);
      const c1 = computePolygonCentroid(poly1);
      const c2 = computePolygonCentroid(poly2);
      
      drawPercentageBadge(c, c1.x * width - nx * currentOffset, c1.y * height - ny * currentOffset, ratio1, alpha);
      drawPercentageBadge(c, c2.x * width + nx * currentOffset, c2.y * height + ny * currentOffset, ratio2, alpha);
    }
  } else {
    // 完整披萨
    drawArtisanPizzaPiece(c, shape.points, width, height, seed, 0, 0, false);
  }

  // 划线中预览
  if (cutLine) {
    drawLaserBlade(c, { x: cutLine.x1, y: cutLine.y1 }, { x: cutLine.x2, y: cutLine.y2 }, width, height);
  }
}

function drawPercentageBadge(c, x, y, percent, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  const text = `${percent.toFixed(1)}%`;
  c.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const tm = c.measureText(text);
  const bw = tm.width + 16;
  const bh = 22;

  // 药丸背景
  c.beginPath();
  c.roundRect(x - bw / 2, y - bh / 2, bw, bh, 11);
  c.fillStyle = 'rgba(15, 23, 42, 0.85)';
  c.shadowColor = 'rgba(0, 0, 0, 0.4)';
  c.shadowBlur = 8;
  c.shadowOffsetY = 2;
  c.fill();

  c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  c.lineWidth = 1;
  c.stroke();

  // 文字
  c.fillStyle = '#38bdf8';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y);

  c.restore();
}

function startSliceSplitAnimation(p1, p2, ratio1 = 50, ratio2 = 50) {
  if (!currentSliceShape || !currentSliceShape.points) return;
  const { poly1, poly2 } = robustSlicePolygon(currentSliceShape.points, p1, p2);
  if (!poly1 || !poly2 || poly1.length < 3 || poly2.length < 3) return;

  // 计算切割法线单位向量
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  if (sliceAnimFrame) cancelAnimationFrame(sliceAnimFrame);

  const startTime = performance.now();
  const duration = 450; // 450ms 分离动画

  currentSliceSplitState = {
    active: true,
    poly1,
    poly2,
    nx,
    ny,
    ratio1: Math.min(ratio1, ratio2),
    ratio2: Math.max(ratio1, ratio2),
    offsetProgress: 0
  };

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    // easeOutCubic
    const ease = 1 - Math.pow(1 - t, 3);
    currentSliceSplitState.offsetProgress = ease;

    const { w, h } = initSliceCanvasResolution();
    drawSliceShape(sliceCtx, currentSliceShape, w, h);

    if (t < 1) {
      sliceAnimFrame = requestAnimationFrame(animate);
    }
  }

  sliceAnimFrame = requestAnimationFrame(animate);
}

function renderPerfectSliceState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

  if (state.status === 'SLICE_CUTTING') {
    wordHintBox.textContent = `在屏幕上划一刀，将披萨二等分！剩余 ${state.timeLeft}s`;
    if (!hasSubmittedSlice) {
      sliceCutPrompt.classList.remove('hidden');
    }
  } else {
    sliceCutPrompt.classList.add('hidden');
  }
}

socket.on('slice_start_round', (data) => {
  if (!sliceCanvas || !sliceCtx) return;
  if (sliceAnimFrame) cancelAnimationFrame(sliceAnimFrame);
  currentSliceSplitState = null;
  currentSliceShape = data.shape;
  hasSubmittedSlice = false;
  sliceResultBadge.classList.add('hidden');
  sliceCutPrompt.classList.remove('hidden');

  const { w, h } = initSliceCanvasResolution();
  drawSliceShape(sliceCtx, currentSliceShape, w, h);
  playSound('card');
});

// 切割画线触控交互
function getSlicePos(e) {
  const rect = sliceCanvas.getBoundingClientRect();
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

sliceCanvas?.addEventListener('mousedown', (e) => {
  if (hasSubmittedSlice || !currentSliceShape) return;
  isSlicing = true;
  sliceStartPos = getSlicePos(e);
  sliceCurrentPos = sliceStartPos;
});

sliceCanvas?.addEventListener('mousemove', (e) => {
  if (!isSlicing || hasSubmittedSlice) return;
  sliceCurrentPos = getSlicePos(e);
  const { w, h } = initSliceCanvasResolution();
  drawSliceShape(sliceCtx, currentSliceShape, w, h, {
    x1: sliceStartPos.x, y1: sliceStartPos.y,
    x2: sliceCurrentPos.x, y2: sliceCurrentPos.y
  });
});

window.addEventListener('mouseup', (e) => {
  if (!isSlicing || hasSubmittedSlice) return;
  isSlicing = false;
  if (sliceStartPos && sliceCurrentPos) {
    const dist = Math.hypot(sliceCurrentPos.x - sliceStartPos.x, sliceCurrentPos.y - sliceStartPos.y);
    if (dist > 0.1) {
      hasSubmittedSlice = true;
      sliceCutPrompt.classList.add('hidden');
      socket.emit('slice_cut_submit', {
        p1: sliceStartPos,
        p2: sliceCurrentPos
      });
      playSound('card');
      startSliceSplitAnimation(sliceStartPos, sliceCurrentPos, 50, 50);
    }
  }
});

// 移动端 Touch 事件
sliceCanvas?.addEventListener('touchstart', (e) => {
  if (hasSubmittedSlice || !currentSliceShape) return;
  e.preventDefault();
  isSlicing = true;
  sliceStartPos = getSlicePos(e);
  sliceCurrentPos = sliceStartPos;
}, { passive: false });

sliceCanvas?.addEventListener('touchmove', (e) => {
  if (!isSlicing || hasSubmittedSlice) return;
  e.preventDefault();
  sliceCurrentPos = getSlicePos(e);
  const { w, h } = initSliceCanvasResolution();
  drawSliceShape(sliceCtx, currentSliceShape, w, h, {
    x1: sliceStartPos.x, y1: sliceStartPos.y,
    x2: sliceCurrentPos.x, y2: sliceCurrentPos.y
  });
}, { passive: false });

sliceCanvas?.addEventListener('touchend', (e) => {
  if (!isSlicing || hasSubmittedSlice) return;
  isSlicing = false;
  if (sliceStartPos && sliceCurrentPos) {
    const dist = Math.hypot(sliceCurrentPos.x - sliceStartPos.x, sliceCurrentPos.y - sliceStartPos.y);
    if (dist > 0.1) {
      hasSubmittedSlice = true;
      sliceCutPrompt.classList.add('hidden');
      socket.emit('slice_cut_submit', {
        p1: sliceStartPos,
        p2: sliceCurrentPos
      });
      playSound('card');
      startSliceSplitAnimation(sliceStartPos, sliceCurrentPos, 50, 50);
    }
  }
});

socket.on('slice_cut_result', (data) => {
  playSound('tick');
  if (sliceRatioText) sliceRatioText.textContent = `${data.ratio1}% : ${data.ratio2}%`;
  if (sliceDiffText) {
    sliceDiffText.textContent = `误差 ±${data.diff}%`;
    if (data.diff < 1.0) {
      sliceDiffText.style.background = 'rgba(16, 185, 129, 0.2)';
      sliceDiffText.style.borderColor = '#10b981';
      sliceDiffText.style.color = '#34d399';
    } else if (data.diff < 3.0) {
      sliceDiffText.style.background = 'rgba(56, 189, 248, 0.2)';
      sliceDiffText.style.borderColor = '#38bdf8';
      sliceDiffText.style.color = '#38bdf8';
    } else {
      sliceDiffText.style.background = 'rgba(245, 158, 11, 0.2)';
      sliceDiffText.style.borderColor = '#f59e0b';
      sliceDiffText.style.color = '#fbbf24';
    }
  }
  
  const barLeft = document.getElementById('slice-bar-left');
  const barRight = document.getElementById('slice-bar-right');
  if (barLeft && barRight) {
    barLeft.style.width = `${data.ratio1}%`;
    barRight.style.width = `${data.ratio2}%`;
  }
  
  if (currentSliceSplitState && currentSliceSplitState.active) {
    currentSliceSplitState.ratio1 = data.ratio1;
    currentSliceSplitState.ratio2 = data.ratio2;
  }
  
  sliceResultBadge.classList.remove('hidden');
});

socket.on('slice_round_summary', (data) => {
  playSound('fanfare');
  let summaryHtml = '';
  if (data.summary && data.summary.length > 0) {
    summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left;max-height:220px;overflow-y:auto">';
    data.summary.forEach((p, idx) => {
      summaryHtml += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
          <span>${idx === 0 ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b></span>
          <span style="font-weight:700;color:var(--accent-core)">${p.ratio} <small style="color:var(--text-muted);font-weight:normal">(${p.diff})</small></span>
        </div>
      `;
    });
    summaryHtml += '</div>';
  }
  showRevealModal(`🍕 本轮刀工榜首：【${escapeHtml(data.bestCutter)}】`, '50.0% : 50.0%', 4500, summaryHtml);
});

socket.on('slice_game_over', (data) => {
  showGameOverModal({
    title: '🍕 切披萨 50:50 颁奖台',
    desc: '人肉激光切割大师诞生！',
    podium: data.podium || []
  });
});

// =====================【盲压 随机时间挑战 渲染】=====================
function renderHoldFiveState(state) {
  displayRoundTag.classList.remove('hidden');
  displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

  const targetSec = state.targetSeconds ? `${state.targetSeconds}.000` : '5.000';
  const targetTitle = document.getElementById('hold-target-title');
  if (targetTitle) {
    targetTitle.textContent = `🎯 目标时间：${targetSec} 秒`;
  }

  if (state.status === 'HOLD_PRESSING') {
    timerBox?.classList.add('hidden'); // 盲压阶段隐藏顶部倒计时秒数防作弊
    wordHintBox.textContent = `🎯 凭内心节奏按住大按钮，在正好 ${targetSec} 秒时精准松开！`;
    if (!hasSubmittedHold) {
      btnHoldTrigger.classList.remove('hidden');
      holdText.textContent = '按住开始计时';
    }
  } else {
    timerBox?.classList.remove('hidden');
  }
}

socket.on('hold_start_round', (data) => {
  hasSubmittedHold = false;
  isHoldingButton = false;
  holdPressStartTime = null;
  holdResultBox.classList.add('hidden');
  btnHoldTrigger.classList.remove('pressing');
  holdText.textContent = '按住开始计时';

  const targetSec = data.targetSeconds ? `${data.targetSeconds}.000` : '5.000';
  const targetTitle = document.getElementById('hold-target-title');
  if (targetTitle) {
    targetTitle.textContent = `🎯 目标时间：${targetSec} 秒`;
  }
  wordHintBox.textContent = `按住大按钮，在正好 ${targetSec} 秒时松手！剩余 ${data.timeLeft}s`;

  playSound('card');
});

function handleHoldStart(e) {
  if (hasSubmittedHold) return;
  e.preventDefault();
  initAudio();
  isHoldingButton = true;
  holdPressStartTime = performance.now();
  btnHoldTrigger.classList.add('pressing');
  holdText.textContent = '计时中...松开提交';
  playSound('tick');
}

function handleHoldEnd(e) {
  if (!isHoldingButton || hasSubmittedHold) return;
  isHoldingButton = false;
  btnHoldTrigger.classList.remove('pressing');

  if (holdPressStartTime) {
    const elapsedMs = Math.round(performance.now() - holdPressStartTime);
    hasSubmittedHold = true;
    holdText.textContent = '已提交！等待结算...';
    socket.emit('hold_submit_time', { elapsedMs });
    playSound('card');
  }
}

btnHoldTrigger?.addEventListener('mousedown', handleHoldStart);
window.addEventListener('mouseup', handleHoldEnd);

btnHoldTrigger?.addEventListener('touchstart', handleHoldStart, { passive: false });
window.addEventListener('touchend', handleHoldEnd);

socket.on('hold_submit_feedback', (data) => {
  playSound('tick');
  holdScoreTime.textContent = `${data.seconds.toFixed(3)}s`;
  holdScoreDiff.textContent = `误差 ±${data.diff.toFixed(3)}s`;
  holdResultBox.classList.remove('hidden');
});

socket.on('hold_round_summary', (data) => {
  playSound('fanfare');
  let summaryHtml = '';
  if (data.summary && data.summary.length > 0) {
    summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left;max-height:220px;overflow-y:auto">';
    data.summary.forEach((p, idx) => {
      summaryHtml += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
          <span>${idx === 0 ? '👑 ' : ''}${escapeHtml(p.avatar)} <b>${escapeHtml(p.name)}</b></span>
          <span style="font-weight:700;color:var(--accent-core)">${p.seconds} <small style="color:var(--text-muted);font-weight:normal">(${p.diff})</small></span>
        </div>
      `;
    });
    summaryHtml += '</div>';
  }
  showRevealModal(`⏱️ 本轮时间领主：【${escapeHtml(data.bestHolder)}】`, '5.000s', 4500, summaryHtml);
});

socket.on('hold_game_over', (data) => {
  showGameOverModal({
    title: '⏱️ 盲压挑战 荣耀颁奖台',
    desc: '神级生物钟领主诞生！',
    podium: data.podium || []
  });
});

// 烟花粒子动效
function launchConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  const particles = [];
  const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.7) * 14,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1
    });
  }

  let frame = 0;
  function animate() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.alpha -= 0.015;
      confettiCtx.fillStyle = p.color;
      confettiCtx.globalAlpha = Math.max(0, p.alpha);
      confettiCtx.fillRect(p.x, p.y, p.size, p.size);
    });

    frame++;
    if (frame < 65) requestAnimationFrame(animate);
    else confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
  animate();
}
