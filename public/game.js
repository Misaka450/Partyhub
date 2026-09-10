const socket = io();

// =====================【维度一优化：统一游戏动作分流通信】=====================
// 💡 小白通俗解释：
// 以前前端向服务端发送游戏动作时，每次都要记几十个不同的 socket 事件名字；
// 现在封装统一的 sendGameAction(action, payload)，
// 既能发送结构化的 'game_action' 统一通道，又能同时兼容原有独立事件通道，双轨运行，零破坏。
function sendGameAction(action, payload = {}) {
  if (!socket) return;
  socket.emit('game_action', { action, payload });
  socket.emit(action, payload);
}

// =====================【安全存储工具】=====================
// 统一包裹 localStorage/sessionStorage：旧版 Safari 隐私模式 / 禁用存储时会抛
// QuotaExceededError，裸调用会导致整个脚本在加载早期中断（页面白屏）（审计 R2-18）
function safeSetItem(key, value, useSession = false) {
  try {
    (useSession ? sessionStorage : localStorage).setItem(key, value);
  } catch (e) { /* 存储被禁用时静默降级为不持久化 */ }
}
function safeGetItem(key, useSession = false) {
  try {
    return (useSession ? sessionStorage : localStorage).getItem(key);
  } catch (e) { return null; }
}
function safeRemoveItem(key, useSession = false) {
  try {
    (useSession ? sessionStorage : localStorage).removeItem(key);
  } catch (e) { /* 忽略 */ }
}

// 生成身份 token：优先使用浏览器加密安全随机（Math.random 可被预测）（审计 R2-49）
function generatePlayerToken() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    return `token_${crypto.randomUUID()}`;
  }
  if (window.crypto && crypto.getRandomValues) {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    return `token_${Date.now()}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `token_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// token 存取：sessionStorage（标签页隔离）优先 + localStorage 兜底。
// 双开标签页共享 localStorage 会互相覆盖 token 导致身份错乱（审计 R2-16）
function loadPlayerToken() {
  const sessionToken = safeGetItem('dg_player_token', true);
  if (sessionToken) return sessionToken;
  return safeGetItem('dg_player_token');
}
function savePlayerToken(token) {
  safeSetItem('dg_player_token', token, true); // 本标签页专属
  safeSetItem('dg_player_token', token);       // 兜底（sessionStorage 不可用时）
}
function clearPlayerToken() {
  safeRemoveItem('dg_player_token', true);
  safeRemoveItem('dg_player_token');
  clearReconnectSecret();
}

// 私密重连凭据 (Reconnect Secret)：服务端单播下发，不公开广播，防离线席位劫持（审计 H1）
function loadReconnectSecret() {
  const sessionSecret = safeGetItem('dg_reconnect_secret', true);
  if (sessionSecret) return sessionSecret;
  return safeGetItem('dg_reconnect_secret');
}
function saveReconnectSecret(secret) {
  safeSetItem('dg_reconnect_secret', secret, true);
  safeSetItem('dg_reconnect_secret', secret);
}
function clearReconnectSecret() {
  safeRemoveItem('dg_reconnect_secret', true);
  safeRemoveItem('dg_reconnect_secret');
}
let myReconnectSecret = loadReconnectSecret() || '';

// 主题管理 (深色 / 浅色模式)
let currentTheme = safeGetItem('party_theme') || 'light';

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  safeSetItem('party_theme', theme);
  
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

// 身份持久化（token 存取经统一工具函数：sessionStorage 标签页隔离 + localStorage 兜底）
let myPlayerToken = loadPlayerToken() || generatePlayerToken();
savePlayerToken(myPlayerToken);

let savedName = safeGetItem('dg_player_name') || ('玩家' + Math.floor(Math.random() * 900 + 100));
let savedAvatar = safeGetItem('dg_player_avatar') || '🐱';

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
const stageStroopTrap = document.getElementById('stage-stroop-trap');
const stageShadowMatch = document.getElementById('stage-shadow-match');
const stageSimonMemory = document.getElementById('stage-simon-memory');
const stageTrainRoute = document.getElementById('stage-train-route');
const stageHolePunch = document.getElementById('stage-hole-punch');
const stageChangeMaster = document.getElementById('stage-change-master');
const stageNumberGuess = document.getElementById('stage-number-guess');

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
const cubeOptionsGrid = document.getElementById('cube-options-grid');
const cubeDirectForm = document.getElementById('cube-direct-form');
const cubeDirectInput = document.getElementById('cube-direct-input');
const cubePromptTitle = document.getElementById('cube-prompt-title');
const cubePromptSub = document.getElementById('cube-prompt-sub');
const cubeSubmitBtn = document.getElementById('cube-submit-btn');

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
const ucSpeechTip = document.getElementById('uc-speech-tip');
const btnUcMicToggle = document.getElementById('btn-uc-mic-toggle');
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

// 实时语音回调绑定 (WebRTC 声浪与状态同步)
if (window.voiceManager) {
  window.voiceManager.onSpeakingChange = (token, isSpeaking, volume) => {
    // 1. 阿瓦隆麦序声浪可视化
    if (currentGameType === 'avalon' && currentRoomState && currentRoomState.status === 'AVALON_SPEECH') {
      if (currentRoomState.currentSpeakerToken === token) {
        const waveBars = document.querySelectorAll('#av-voice-waves span');
        waveBars.forEach((span, idx) => {
          if (isSpeaking) {
            const factor = [0.45, 0.85, 1.0, 0.7, 0.5][idx] || 0.6;
            const dynamicHeight = Math.max(20, Math.min(100, (volume * 1.3) * factor));
            span.style.height = `${dynamicHeight}%`;
            span.style.background = 'var(--primary)';
          } else {
            span.style.height = '20%';
            span.style.background = 'rgba(255,255,255,0.2)';
          }
        });
      }
    }

    // 2. 谁是卧底麦序声浪可视化
    if (currentGameType === 'undercover' && currentRoomState && currentRoomState.status === 'UC_SPEAKING') {
      if (currentRoomState.currentSpeakerToken === token) {
        const ucWaves = document.querySelectorAll('#uc-voice-waves span');
        ucWaves.forEach((span, idx) => {
          if (isSpeaking) {
            const factor = [0.45, 0.85, 1.0, 0.7, 0.5][idx] || 0.6;
            const dynamicHeight = Math.max(20, Math.min(100, (volume * 1.3) * factor));
            span.style.height = `${dynamicHeight}%`;
            span.style.background = 'var(--primary)';
          } else {
            span.style.height = '20%';
            span.style.background = 'rgba(255,255,255,0.2)';
          }
        });
        if (ucSpeechTip) {
          ucSpeechTip.textContent = isSpeaking ? '正在语音发言...' : '轮到发言中...';
          ucSpeechTip.style.color = isSpeaking ? 'var(--primary)' : 'var(--text-muted)';
        }
      }
    }

    // 3. 玩家席位卡片与侧边栏高亮动效
    document.querySelectorAll(`.p-card[data-token="${token}"], .av-p-card[data-token="${token}"], .uc-player-card[data-token="${token}"], .player-item[data-token="${token}"]`).forEach(el => {
      el.classList.toggle('is-speaking', isSpeaking);
    });
  };

  window.voiceManager.onStatusChange = (isMicEnabled, hasPermission) => {
    if (btnAvMicToggle && currentRoomState && currentRoomState.status === 'AVALON_SPEECH' && currentRoomState.currentSpeakerToken === myPlayerToken) {
      btnAvMicToggle.textContent = isMicEnabled ? '🔴 闭麦' : '🎤 开麦发言';
      btnAvMicToggle.className = isMicEnabled ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
    }
    if (btnUcMicToggle && currentRoomState && currentRoomState.status === 'UC_SPEAKING' && currentRoomState.currentSpeakerToken === myPlayerToken) {
      btnUcMicToggle.textContent = isMicEnabled ? '🔴 闭麦' : '🎤 开麦发言';
      btnUcMicToggle.className = isMicEnabled ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
    }
  };
}

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
  // 取消按钮同样给出音效反馈，避免用户以为"点了没反应"
  btnConfirmCancel.addEventListener('click', () => {
    playSound('tick');
    hideConfirmDialog();
  });
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
  
  // 结算动作区控制 (房主显示再来一局/换个游戏，非房主仅显示返回大厅)
  const hostActions = document.getElementById('gameover-host-actions');
  if (hostActions) {
    hostActions.classList.toggle('hidden', !isHost);
  }

  if (gameoverModal) gameoverModal.classList.add('active');
  triggerVibration('correct');
}

// =====================【高高清 DPR 响应式画布通用初始化】=====================
// 尺寸缓存：canvas.width 赋值即使数值相同也会清空画布并触发重新光栅化，
// 高频调用（如切披萨拖动）会造成布局抖动与掉帧，尺寸未变时跳过重设（审计 R2-19）
const canvasSizeCache = new WeakMap();

function fitCanvasResolution(canvas, ctx, defaultW = 360, defaultH = 320, maxW = 600) {
  if (!canvas) return { w: defaultW, h: defaultH, dpr: 1 };
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = (parent && parent.clientWidth > 50) ? parent.clientWidth : (window.innerWidth > 50 ? Math.min(window.innerWidth - 32, maxW) : defaultW);
  const h = (parent && parent.clientHeight > 50) ? parent.clientHeight : defaultH;
  const physW = Math.floor(w * dpr);
  const physH = Math.floor(h * dpr);
  const cached = canvasSizeCache.get(canvas);
  if (!cached || cached.w !== w || cached.h !== h || cached.dpr !== dpr) {
    canvas.width = physW;
    canvas.height = physH;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvasSizeCache.set(canvas, { w, h, dpr });
  }
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

// =====================【全局工具与前端小游戏插件插槽系统】=====================
// 💡 小白通俗解释：
// 挂载核心工具到 window，使得每个从 game.js 拆分出去的独立小游戏脚本都能安全调用它们，
// 绝不会因为分文件而发生未定义报错。
window.socket = socket;
window.escapeHtml = escapeHtml;
window.playSound = playSound;
window.showRevealModal = showRevealModal;
window.showGameOverModal = showGameOverModal;
window.fitCanvasResolution = fitCanvasResolution;
window.sendGameAction = sendGameAction;
window.initAudio = initAudio;
window.myPlayerToken = myPlayerToken;
window.PartyGames = window.PartyGames || {};

function initAllPartyGames() {
  if (!window.PartyGames) return;
  for (const [gameType, plugin] of Object.entries(window.PartyGames)) {
    if (plugin && typeof plugin.init === 'function') {
      try {
        plugin.init(socket);
      } catch (err) {
        console.error(`⚠️ [PartyGames] 初始化小游戏插件 ${gameType} 异常:`, err);
      }
    }
  }
}

// 页面加载或脚本就绪后立即执行一次插件初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllPartyGames);
} else {
  initAllPartyGames();
}

selectedAvatarEl.textContent = savedAvatar;
if (playerNameInput) {
  if (savedName) playerNameInput.value = savedName;
  playerNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      myPlayerName = val;
      safeSetItem('dg_player_name', val);
    }
  });
}

// URL 参数自动填充房间号
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  roomIdInput.value = urlParams.get('room');
}

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
    safeSetItem('dg_player_avatar', myAvatar);
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

let isVibrateEnabled = safeGetItem('partyhub_vibrate', 'true') !== 'false';
const btnToggleVibrate = document.getElementById('btn-toggle-vibrate');

function updateVibrateBtnState() {
  if (!btnToggleVibrate) return;
  btnToggleVibrate.classList.toggle('muted', !isVibrateEnabled);
  btnToggleVibrate.title = isVibrateEnabled ? '触觉震动开关 (已开启)' : '触觉震动开关 (已关闭)';
}
if (btnToggleVibrate) {
  updateVibrateBtnState();
  btnToggleVibrate.addEventListener('click', () => {
    isVibrateEnabled = !isVibrateEnabled;
    safeSetItem('partyhub_vibrate', isVibrateEnabled ? 'true' : 'false');
    updateVibrateBtnState();
    if (isVibrateEnabled) {
      triggerVibration('pop');
      showToast('触觉震动已开启 📳', '⚡');
    } else {
      showToast('触觉震动已关闭 📴', '🔇');
    }
  });
}

function triggerVibration(type = 'tick') {
  if (!isVibrateEnabled || !navigator.vibrate) return;
  try {
    if (type === 'tick') navigator.vibrate(12);
    else if (type === 'pop') navigator.vibrate(18);
    else if (type === 'urgent') navigator.vibrate(28);
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
  // 对 icon/text 做转义后再插入，防止 toast 通道被注入 HTML（XSS）
  toast.innerHTML = `<span>${escapeHtml(icon)}</span><span>${escapeHtml(text)}</span>`;
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
      safeSetItem('dg_player_name', rName);
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

// Deep Link 房间号智能识别与自动载入 (URL ?room=888 或 ?r=888)
try {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room') || urlParams.get('r');
  if (roomParam && roomIdInput) {
    roomIdInput.value = roomParam;
    setTimeout(() => {
      if (playerNameInput && !playerNameInput.value) {
        playerNameInput.focus();
      }
    }, 150);
  }
} catch (e) {}

// 房间专属二维码弹窗逻辑 (QRCode Modal)
const qrModal = document.getElementById('qr-modal');
const qrModalRoomId = document.getElementById('qr-modal-room-id');
const qrCodeCanvas = document.getElementById('qr-code-canvas');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const qrModalBackdrop = document.getElementById('qr-modal-backdrop');
const btnQrCopyLink = document.getElementById('btn-qr-copy-link');
const btnHeaderQr = document.getElementById('btn-header-qr');
const btnLobbyQr = document.getElementById('btn-lobby-qr');

function showQrModal() {
  if (!qrModal) return;
  const targetRoom = currentRoomId || roomIdInput?.value || '888';
  if (qrModalRoomId) qrModalRoomId.textContent = `#${targetRoom}`;
  const joinUrl = `${window.location.origin}/?room=${encodeURIComponent(targetRoom)}`;
  
  if (qrCodeCanvas && window.QRCode) {
    window.QRCode.toCanvas(qrCodeCanvas, joinUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#0F131C', light: '#FFFFFF' }
    }, (err) => {
      if (err) console.error('QRCode error:', err);
    });
  }
  qrModal.classList.add('active');
  playSound('pop');
  triggerVibration('pop');
}

btnHeaderQr?.addEventListener('click', showQrModal);
btnLobbyQr?.addEventListener('click', showQrModal);
btnCloseQrModal?.addEventListener('click', () => qrModal?.classList.remove('active'));
qrModalBackdrop?.addEventListener('click', () => qrModal?.classList.remove('active'));
btnQrCopyLink?.addEventListener('click', () => {
  const targetRoom = currentRoomId || roomIdInput?.value || '888';
  const joinUrl = `${window.location.origin}/?room=${encodeURIComponent(targetRoom)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(joinUrl).then(() => {
      showToast('房间链接已复制！发送给好友即可免输房号加入 📋', '✨');
      playSound('pop');
      triggerVibration('pop');
    }).catch(() => {
      showToast(`直达链接: ${joinUrl}`, '🔗');
    });
  } else {
    showToast(`直达链接: ${joinUrl}`, '🔗');
  }
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
  safeSetItem('dg_player_name', name);
  initAudio();

  // 防连点：点击后临时禁用，收到 joined_successfully / join_error 后恢复（审计 R2-17）
  btnJoin.disabled = true;
  setTimeout(() => { btnJoin.disabled = false; }, 5000);

  socket.emit('join_room', {
    roomId: room,
    playerName: myPlayerName,
    avatar: myAvatar,
    playerToken: myPlayerToken,
    reconnectSecret: myReconnectSecret
  });
});

// 加入失败（房间满/参数非法）：登录界面直接弹出提示并恢复按钮，
// 原实现只有 system_message（渲染在不可见的游戏屏），用户毫无反馈（审计 R2-17）
socket.on('join_error', (data) => {
  btnJoin.disabled = false;
  showToast(data?.reason || '加入房间失败，请稍后重试', '⚠️');
});

socket.on('joined_successfully', (data) => {
  btnJoin.disabled = false;
  currentRoomId = data.roomId;
  currentGameType = data.gameType || 'draw-guess';
  myPlayerId = data.playerId;
  isHost = !!data.isHost;

  // 动态同步服务端下发的 STUN/TURN 语音服务器配置
  if (data.iceServers && window.voiceManager) {
    window.voiceManager.setIceServers(data.iceServers);
  }

  // 以服务端下发的 token 为准并持久化（双写 sessionStorage + localStorage，标签页隔离，审计 R2-16）
  if (data.playerToken) {
    myPlayerToken = data.playerToken;
    savePlayerToken(myPlayerToken);
  }
  if (data.reconnectSecret) {
    myReconnectSecret = data.reconnectSecret;
    saveReconnectSecret(myReconnectSecret);
  }

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

  if (typeof initCanvas === 'function') initCanvas();
  updateGameStageView(currentGameType);
});

// 退出/被踢后统一清理本地房间状态：聊天记录、游戏私密角色、未读徽标、URL 房间参数
// （原实现只清 token，旧房间聊天与私密状态会带进新房间）（审计 R2-43）
function resetRoomLocalState() {
  currentRoomId = '';
  currentRoomState = null;
  myUndercoverRole = null;
  myAvalonRole = null;
  myUnoHand = [];
  if (window.voiceManager) {
    window.voiceManager.destroy();
  }
  if (typeof chatMessages !== 'undefined' && chatMessages) {
    chatMessages.innerHTML = '<div class="chat-system-msg">🎉 欢迎加入！和朋友输入相同房间号即可一起开黑～</div>';
  }
  unreadMessageCount = 0;
  if (typeof chatUnreadBadge !== 'undefined' && chatUnreadBadge) chatUnreadBadge.classList.add('hidden');
  // 清除 URL 中的房间直链参数，防止被踢后刷新又自动回到原房间
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url);
    }
  } catch (e) { /* 忽略 URL 操作异常 */ }
}

// 被房主请出房间：清理本地身份缓存（换新 token），回到登录界面，防止凭旧 token 反复闯房
socket.on('kicked', () => {
  resetRoomLocalState();
  clearPlayerToken();
  safeRemoveItem('dg_player_name');
  myPlayerToken = generatePlayerToken();
  savePlayerToken(myPlayerToken);
  gameScreen.classList.remove('active');
  loginScreen.classList.add('active');
  showToast('你已被房主请出房间', '🚫');
});

// 断线提示：原实现没有 disconnect 监听，服务重启/网络切换时界面静止无感知（审计 R2-48）
socket.on('disconnect', (reason) => {
  if (currentRoomId) {
    showToast('⚠️ 连接已断开，正在自动重连...', '📡');
  }
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
      playerToken: myPlayerToken,
      reconnectSecret: myReconnectSecret
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
        playerToken: myPlayerToken,
        reconnectSecret: myReconnectSecret
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
      playerToken: myPlayerToken,
      reconnectSecret: myReconnectSecret
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

// 移除 2.5 秒定时心跳（审计 H2）：
// 服务端 ping_sync 已改为单播回发，但 N 个客户端心跳仍会产生 N 次单播；
// 且 Socket.IO 底层自带 ping/pong 保活兜底 NAT 超时，无需业务层定时轮询。
// 前台唤醒/重连/获焦时的按需同步已由上方 visibilitychange/focus/pageshow 触发

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

// 游戏人数规格配置表
const GAME_CAPACITY = {
  'draw-guess': { min: 2, max: 12, name: '你画我猜' },
  'undercover': { min: 3, max: 12, name: '谁是卧底' },
  'avalon': { min: 5, max: 10, name: '阿瓦隆' },
  'uno': { min: 2, max: 8, name: 'UNO 优诺' },
  'flash-counter': { min: 2, max: 12, name: '瞬间数羊' },
  'bomb-roulette': { min: 2, max: 8, name: '拆弹轮盘' },
  'bulls-and-cows': { min: 1, max: 8, name: '几A几B' },
  'math-24': { min: 1, max: 8, name: '决战 24 点' },
  'cube-count': { min: 1, max: 8, name: '3D 数独块' },
  'word-bomb': { min: 2, max: 10, name: '词汇炸弹' },
  'perfect-slice': { min: 1, max: 8, name: '完美切分' },
  'hold-five': { min: 1, max: 8, name: '盲压挑战' },
  'stroop-trap': { min: 1, max: 8, name: '色彩陷阱' },
  'shadow-match': { min: 1, max: 8, name: '剪影匹配' },
  'simon-memory': { min: 1, max: 8, name: '节拍记忆' },
  'train-route': { min: 1, max: 8, name: '轨道拼装' },
  'hole-punch': { min: 1, max: 8, name: '折纸打孔' },
  'change-master': { min: 1, max: 8, name: '找零大师' },
  'number-guess': { min: 1, max: 12, name: '盲猜谁接近' }
};

function updateGameCapacityBadges(playerCount = 1) {
  document.querySelectorAll('.game-tile').forEach(tile => {
    const gType = tile.dataset.game;
    const cap = GAME_CAPACITY[gType];
    if (!cap) return;
    let badge = tile.querySelector('.tile-capacity-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tile-capacity-badge';
      const content = tile.querySelector('.tile-content');
      if (content) content.appendChild(badge);
    }
    if (playerCount < cap.min) {
      badge.className = 'tile-capacity-badge badge-capacity-warn';
      badge.textContent = `待入席 · 需${cap.min}人+ (差${cap.min - playerCount}人)`;
    } else {
      badge.className = 'tile-capacity-badge badge-capacity-ok';
      badge.textContent = `✓ 可立即开局 (${cap.min}-${cap.max}人)`;
    }
  });
}

// 房主「🎲 盲盒抽选」随机挑选小游戏
const btnRandomPickGame = document.getElementById('btn-random-pick-game');
if (btnRandomPickGame) {
  btnRandomPickGame.addEventListener('click', () => {
    if (!isHost) {
      showToast('只有房主可以进行游戏盲盒抽选 👑', '🎲');
      return;
    }
    const visibleTiles = Array.from(document.querySelectorAll('.game-tile:not(.tab-hidden)'));
    if (!visibleTiles.length) return;

    const pCount = currentRoomState?.players?.length || 1;
    const qualifiedTiles = visibleTiles.filter(t => {
      const cap = GAME_CAPACITY[t.dataset.game];
      return cap && pCount >= cap.min && pCount <= cap.max;
    });
    const candidates = qualifiedTiles.length ? qualifiedTiles : visibleTiles;

    btnRandomPickGame.disabled = true;
    let step = 0;
    const maxSteps = 10;
    const interval = setInterval(() => {
      visibleTiles.forEach(t => t.classList.remove('active'));
      const rIdx = Math.floor(Math.random() * candidates.length);
      candidates[rIdx].classList.add('active');
      playSound('tick');
      triggerVibration('tick');
      step++;
      if (step >= maxSteps) {
        clearInterval(interval);
        btnRandomPickGame.disabled = false;
        const finalTile = candidates[Math.floor(Math.random() * candidates.length)];
        const targetGame = finalTile.dataset.game;
        updateGameStageView(targetGame);
        if (!socket.connected) socket.connect();
        socket.emit('switch_game', { gameType: targetGame });
        finalTile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showToast(`🎲 盲盒抽选结果：【${GAME_CAPACITY[targetGame]?.name || targetGame}】！`, '🎉');
        playSound('win');
        triggerVibration('correct');
      }
    }, 90);
  });
}

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
        playerToken: myPlayerToken,
        reconnectSecret: myReconnectSecret
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
  'hold-five': '⏱️ 盲压挑战',
  'stroop-trap': '🎯 颜色大陷阱',
  'shadow-match': '🔦 影子猜物',
  'simon-memory': '🎶 西蒙节拍记忆',
  'train-route': '🚂 轨道小火车',
  'hole-punch': '📄 折纸打孔展开',
  'change-master': '💵 找零钱大师',
  'number-guess': '🔢 盲猜谁最接近'
};

function resetAllGameStages() {
  const allStages = [
    stageDrawGuess, stageUndercover, stageAvalon, stageUno,
    stageFlashCounter, stageBombRoulette, stageBullsAndCows,
    stageMath24, stageCubeCount, stageWordBomb, stagePerfectSlice, stageHoldFive,
    stageStroopTrap, stageShadowMatch,
    stageSimonMemory, stageTrainRoute, stageHolePunch, stageChangeMaster, stageNumberGuess
  ];
  allStages.forEach(s => s && s.classList.add('hidden'));
}

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
    'hold-five': { icon: '⏱️', title: '盲压挑战', desc: '每轮随机抽取 3~10 秒目标时间，无秒表提示，凭内心生物钟精准松手！' },
    'stroop-trap': { icon: '🎯', title: '颜色大陷阱', desc: '根据文字颜色或字义快速抢答，打破大脑斯特鲁普认知冲突！' },
    'shadow-match': { icon: '🔦', title: '影子猜物', desc: '聚光灯扫过黑暗剪影，在最模糊的阶段快速抢答真相！' },
    'simon-memory': { icon: '🎶', title: '西蒙节拍记忆', desc: '观察四色光点闪烁节拍，按顺序完美复现全部音符！' },
    'train-route': { icon: '🚂', title: '轨道小火车', desc: '选择关键轨道拼图碎片，让小火车顺利通向终点站！' },
    'hole-punch': { icon: '📄', title: '折纸打孔展开', desc: '折叠打孔后展开，脑内镜像还原真实的孔洞分布图！' },
    'change-master': { icon: '💵', title: '找零钱大师', desc: '根据商品售价与实付金额，极速凑齐分毫不差的找零！' },
    'number-guess': { icon: '🔢', title: '盲猜谁最接近', desc: '趣味常识估算问答，谁的猜想最接近真相谁得分最高！' }
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
    stageMath24, stageCubeCount, stageWordBomb, stagePerfectSlice, stageHoldFive,
    stageStroopTrap, stageShadowMatch,
    stageSimonMemory, stageTrainRoute, stageHolePunch, stageChangeMaster, stageNumberGuess
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
    'hold-five': stageHoldFive,
    'stroop-trap': stageStroopTrap,
    'shadow-match': stageShadowMatch,
    'simon-memory': stageSimonMemory,
    'train-route': stageTrainRoute,
    'hole-punch': stageHolePunch,
    'change-master': stageChangeMaster,
    'number-guess': stageNumberGuess
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
  'hf-rounds', 'hf-target',
  'st-rounds', 'sm-rounds',
  'simon-rounds', 'tr-rounds', 'hp-rounds', 'cm-rounds', 'ng-rounds'
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
  else if (currentGameType === 'stroop-trap') maxRounds = parseInt(document.getElementById('st-rounds')?.value || 3);
  else if (currentGameType === 'shadow-match') maxRounds = parseInt(document.getElementById('sm-rounds')?.value || 3);
  else if (currentGameType === 'simon-memory') maxRounds = parseInt(document.getElementById('simon-rounds')?.value || 3);
  else if (currentGameType === 'train-route') maxRounds = parseInt(document.getElementById('tr-rounds')?.value || 3);
  else if (currentGameType === 'hole-punch') maxRounds = parseInt(document.getElementById('hp-rounds')?.value || 3);
  else if (currentGameType === 'change-master') maxRounds = parseInt(document.getElementById('cm-rounds')?.value || 3);
  else if (currentGameType === 'number-guess') maxRounds = parseInt(document.getElementById('ng-rounds')?.value || 3);

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
    stroopDiff: document.getElementById('st-diff')?.value || 'normal',
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

// 简单防抖：300ms 内重复点击直接忽略。
// 双击"准备"会让服务端翻转两次回到原值（UI 与服务端短暂不一致），双击"开局"重复下发设置（审计 R2-47）
function debounceClick(fn, waitMs = 300) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall < waitMs) return;
    lastCall = now;
    fn(...args);
  };
}

btnStartGame.addEventListener('click', debounceClick(() => {
  if (isHost) {
    // 本地人数下限前置断言（审计 L10）：0ms 立即反馈，消除人数不足时"按钮无反应/假死"错觉
    const cap = GAME_CAPACITY[currentGameType];
    const curPlayerCount = currentRoomState?.players?.length || 1;
    if (cap && curPlayerCount < cap.min) {
      showToast(`人数不足！【${cap.name}】至少需要 ${cap.min} 人（当前仅 ${curPlayerCount} 人）`, '⚠️');
      triggerVibration('error');
      playSound('error');
      return;
    }
    if (!socket.connected) socket.connect();
    socket.emit('update_room_settings', collectCurrentRoomSettings());
    socket.emit('start_game');
  }
}));

btnToggleReady.addEventListener('click', debounceClick(() => {
  socket.emit('toggle_ready');
}));

btnBackLobby?.addEventListener('click', () => {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  socket.emit('back_to_lobby');
  playSound('tick');
  triggerVibration('tick');
});

// 结算弹窗房主快捷动作
const btnGameoverRematch = document.getElementById('btn-gameover-rematch');
const btnGameoverRandom = document.getElementById('btn-gameover-random');

btnGameoverRematch?.addEventListener('click', debounceClick(() => {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  if (isHost) {
    if (!socket.connected) socket.connect();
    socket.emit('update_room_settings', collectCurrentRoomSettings());
    socket.emit('start_game');
    showToast('正在再来一局... 🔄', '🚀');
    playSound('start');
    triggerVibration('pop');
  } else {
    socket.emit('back_to_lobby');
  }
}));

btnGameoverRandom?.addEventListener('click', () => {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  if (isHost) {
    const allGames = Object.keys(GAME_CAPACITY);
    const pCount = currentRoomState?.players?.length || 1;
    const valid = allGames.filter(g => pCount >= GAME_CAPACITY[g].min && g !== currentGameType);
    const nextGame = valid.length ? valid[Math.floor(Math.random() * valid.length)] : allGames[Math.floor(Math.random() * allGames.length)];
    updateGameStageView(nextGame);
    if (!socket.connected) socket.connect();
    socket.emit('switch_game', { gameType: nextGame });
    socket.emit('back_to_lobby');
    showToast(`🎲 换个游戏：【${GAME_CAPACITY[nextGame]?.name || nextGame}】！`, '✨');
    playSound('card');
    triggerVibration('pop');
  } else {
    socket.emit('back_to_lobby');
  }
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
        // 统一清理本地房间状态（聊天/私密角色/未读徽标/URL 参数）（审计 R2-43）
        resetRoomLocalState();
        gameScreen.classList.remove('active');
        loginScreen.classList.add('active');
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
function handleRoomState(state) {
  const prevStatus = currentRoomState?.status;
  currentRoomState = state;
  currentGameType = state.gameType || 'draw-guess';
  // 初始化语音引擎：注意字段是 roomId（服务端 room_state 广播的字段名），
  // 误用 state.id 会让语音模块永远不初始化（审计 C1）
  if (window.voiceManager && state.roomId && myPlayerToken) {
    window.voiceManager.init(socket, myPlayerToken, state.roomId);
  }
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
    stageMath24, stageCubeCount, stageWordBomb, stagePerfectSlice, stageHoldFive,
    stageStroopTrap, stageShadowMatch,
    stageSimonMemory, stageTrainRoute, stageHolePunch, stageChangeMaster, stageNumberGuess
  ];

  if (state.status === 'LOBBY') {
    document.querySelector('.sub-status-bar')?.classList.add('hidden');
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
    document.querySelector('.sub-status-bar')?.classList.remove('hidden');
    // 游戏中：自动关闭所有残留弹窗（包括上一局结算弹窗），确保全体玩家无遮挡同步进入新一局
    if (state.status !== 'GAME_OVER') {
      document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
    // 若从 GAME_OVER 直接开启新的一局（再来一局），全量重置客户端各游戏舞台
    if (prevStatus === 'GAME_OVER' && state.status !== 'GAME_OVER') {
      resetAllGameStages();
    }
    lobbyCard.classList.add('hidden');
    timerBox?.classList.remove('hidden');
    displayRoundTag?.classList.remove('hidden');
    if (state.timeLeft !== undefined && displayTime) {
      displayTime.textContent = state.timeLeft;
      if (state.timeLeft <= 5 && state.timeLeft > 0) {
        timerBox?.classList.remove('warning');
        timerBox?.classList.add('urgent');
      } else if (state.timeLeft <= 10 && state.timeLeft > 0) {
        timerBox?.classList.remove('urgent');
        timerBox?.classList.add('warning');
      } else {
        timerBox?.classList.remove('warning', 'urgent');
      }
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
      'hold-five': stageHoldFive,
      'stroop-trap': stageStroopTrap,
      'shadow-match': stageShadowMatch,
      'simon-memory': stageSimonMemory,
      'train-route': stageTrainRoute,
      'hole-punch': stageHolePunch,
      'change-master': stageChangeMaster,
      'number-guess': stageNumberGuess
    };
    if (stageMap[currentGameType]) stageMap[currentGameType].classList.remove('hidden');
  }

  // 渲染侧边栏玩家列表
  renderPlayerList(state.players);

  // 调度各游戏具体渲染（优先走已拆分的独立小游戏插件，未拆分的平滑走原有渲染函数）
  if (window.PartyGames && window.PartyGames[currentGameType]?.renderState) {
    window.PartyGames[currentGameType].renderState(state);
  } else if (currentGameType === 'draw-guess') renderDrawGuessState(state);
  else if (currentGameType === 'undercover') renderUndercoverState(state);
  else if (currentGameType === 'avalon') renderAvalonState(state);
  else if (currentGameType === 'uno') renderUnoState(state);
  else if (currentGameType === 'flash-counter') renderFlashCounterState(state);
  else if (currentGameType === 'bomb-roulette') renderBombRouletteState(state);
  else if (currentGameType === 'bulls-and-cows') renderBullsAndCowsState(state);
  else if (currentGameType === 'math-24') renderMath24State(state);
  else if (currentGameType === 'cube-count') renderCubeCountState(state);
  else if (currentGameType === 'word-bomb') renderWordBombState(state);
  else if (currentGameType === 'perfect-slice' && typeof renderPerfectSliceState === 'function') renderPerfectSliceState(state);
  else if (currentGameType === 'hold-five' && typeof renderHoldFiveState === 'function') renderHoldFiveState(state);
}
socket.on('room_state', handleRoomState);

function renderPlayerList(players) {
  if (!players) return;
  if (playerList) playerList.innerHTML = '';
  const heroRoomId = document.getElementById('hero-room-id');
  const heroPlayerBadge = document.getElementById('hero-player-badge');
  const lobbySeatsGrid = document.getElementById('lobby-seats-grid');

  if (heroRoomId && currentRoomId) heroRoomId.textContent = currentRoomId;
  if (heroPlayerBadge) heroPlayerBadge.textContent = `${players.length} 人已入席`;
  updateGameCapacityBadges(players.length);

  const metricPlayerCount = document.getElementById('metric-player-count');
  const metricRoomNum = document.getElementById('metric-room-num');
  const guidanceBannerText = document.getElementById('guidance-banner-text');
  const metricPrivilegeLabel = document.getElementById('metric-privilege-label');
  const metricPrivilegeIcon = document.getElementById('metric-privilege-icon');
  if (metricPlayerCount) metricPlayerCount.textContent = players.length;
  if (metricRoomNum && currentRoomId) metricRoomNum.textContent = '#' + currentRoomId;
  if (guidanceBannerText) {
    guidanceBannerText.textContent = isHost 
      ? '请挑选游戏，并邀请好友入席开始对局'
      : '房主正在挑选游戏与房间规则，请稍候...';
  }
  if (metricPrivilegeLabel) metricPrivilegeLabel.textContent = isHost ? '房主特权' : '房间成员';
  if (metricPrivilegeIcon) metricPrivilegeIcon.textContent = isHost ? '👑' : '✨';

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

// =====================【你画我猜/谁是卧底/阿瓦隆  已抽离至独立插件】=====================

// =====================【UNO 渲染  模块已抽离至 public/games/uno.client.js】=====================

// =====================【数羊/拆弹/几A几B/词汇炸弹/脑力系列结算  已抽离至独立插件】=====================

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isIMEComposing) return; // 拦截输入法选字未完成提交
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('send_chat', { text });
    chatInput.value = '';
  }
});

const MAX_CHAT_MESSAGES = 1000;
function appendChatMessage(msgEl) {
  chatMessages.appendChild(msgEl);
  // 消息上限控制：限制最多保留 1000 条，超出时裁剪头部最早节点，防止长会话挂机 DOM 无限膨胀（审计 M5）
  while (chatMessages.children.length > MAX_CHAT_MESSAGES) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

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
  appendChatMessage(msgEl);

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
  appendChatMessage(msgEl);

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
    if (t <= 5 && t > 0) {
      timerBox.classList.remove('warning');
      timerBox.classList.add('urgent');
    } else if (t <= 10 && t > 0) {
      timerBox.classList.remove('urgent');
      timerBox.classList.add('warning');
    } else {
      timerBox.classList.remove('warning', 'urgent');
    }
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

// =====================【切披萨 50:50  模块已抽离至 public/games/perfectSlice.client.js】=====================

// =====================【盲压 随机时间挑战  模块已抽离至 public/games/holdFive.client.js】=====================

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

// ==========================================================================
// 17. 9款全新脑力小游戏已整体解耦并抽离至 public/games/brainGames.client.js
// ==========================================================================
