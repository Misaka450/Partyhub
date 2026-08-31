const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const drawGuessEngine = require('./games/drawGuess');
const undercoverEngine = require('./games/undercover');
const avalonEngine = require('./games/avalon');
const unoEngine = require('./games/uno');
const flashCounterEngine = require('./games/flashCounter');
const bombRouletteEngine = require('./games/bombRoulette');
const bullsAndCowsEngine = require('./games/bullsAndCows');
const math24Engine = require('./games/math24');
const cubeCountEngine = require('./games/cubeCount');
const wordBombEngine = require('./games/wordBomb');
const perfectSliceEngine = require('./games/perfectSlice');
const holdFiveEngine = require('./games/holdFive');
const stroopTrapEngine = require('./games/stroopTrap');
const twinFinderEngine = require('./games/twinFinder');
const shadowMatchEngine = require('./games/shadowMatch');
const whoDisappearedEngine = require('./games/whoDisappeared');
const simonMemoryEngine = require('./games/simonMemory');
const trainRouteEngine = require('./games/trainRoute');
const holePunchEngine = require('./games/holePunch');
const changeMasterEngine = require('./games/changeMaster');
const numberGuessEngine = require('./games/numberGuess');

const app = express();

// ===== 安全增强中间件 =====
// 1. Helmet：自动配置 HTTP 安全响应头（防点击劫持、防嗅探、启用 HSTS 等）
app.use(helmet({
  contentSecurityPolicy: false, // 禁用默认严格 CSP 以兼容动态内联样式与 WebRTC 媒体流
  crossOriginEmbedderPolicy: false
}));

// 2. express-rate-limit：HTTP 请求防刷限流（15 分钟内最多 600 次请求，防御恶意扫描与 DoS）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: '请求过于频繁，请稍后再试！'
});
app.use(limiter);

const server = http.createServer(app);
// CORS：默认允许所有来源（聚会场景常通过分享链接/局域网 IP 直接访问）。
// 若部署到固定域名，可用环境变量 CORS_ORIGIN 收紧为逗号分隔的域名白名单。
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : '*';
const io = new Server(server, {
  cors: { origin: allowedOrigins }
});

const PORT = process.env.PORT || 8080;

// ===== 全局异常兜底：任何回调或游戏引擎抛出的未捕获异常只记录日志，不让整个 Node 进程崩溃 =====
process.on('uncaughtException', (err) => {
  console.error('⚠️ [未捕获异常] 已拦截，服务继续运行:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [未捕获的Promise拒绝] 已拦截:', reason);
});

// 安全调用游戏引擎：把引擎可能抛出的异常包住，避免单个异常直接压垮服务器进程
function safeEngineCall(engineFn, ...args) {
  try {
    return engineFn(...args);
  } catch (err) {
    console.error('⚠️ [游戏引擎调用异常]', err);
    return null;
  }
}

// 把任意数值夹到 [0, 1] 区间（画笔坐标等归一化字段专用），非法输入返回 0
function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * 获取 WebRTC 的 ICE/STUN/TURN 服务器配置
 * 默认包含 Google / Cloudflare 的公开免费 STUN 服务器；
 * 若在环境变量中配置了 TURN 服务器（例如部署在自己云服务器上的 coturn），则合并加入，
 * 解决移动端4G/5G或对称 NAT 复杂网络环境下两个玩家无法直接建立 P2P 语音连接的问题。
 */
function getIceServers() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:1337' }
  ];

  // 支持通过环境变量 TURN_URL 或 TURN_URLS（逗号分隔）配置自建或第三方 TURN 中继服务
  const turnUrls = process.env.TURN_URLS || process.env.TURN_URL;
  if (turnUrls) {
    const urls = turnUrls.split(',').map(u => u.trim()).filter(Boolean);
    const turnConfig = {
      urls: urls,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD || ''
    };
    iceServers.push(turnConfig);
  }

  return iceServers;
}

app.use(express.static(path.join(__dirname, 'public')));

// 提供 ICE/TURN 服务器配置接口，供前端语音模块随时拉取
app.get('/api/ice-servers', (req, res) => {
  res.json({ iceServers: getIceServers() });
});

const rooms = new Map();
const MAX_ROOMS = 100; // 全局最大房间数量上限，防止恶意刷房耗尽服务器内存

const GAME_ENGINES = {
  'draw-guess': drawGuessEngine,
  'undercover': undercoverEngine,
  'avalon': avalonEngine,
  'uno': unoEngine,
  'flash-counter': flashCounterEngine,
  'bomb-roulette': bombRouletteEngine,
  'bulls-and-cows': bullsAndCowsEngine,
  'math-24': math24Engine,
  'cube-count': cubeCountEngine,
  'word-bomb': wordBombEngine,
  'perfect-slice': perfectSliceEngine,
  'hold-five': holdFiveEngine,
  'stroop-trap': stroopTrapEngine,
  'twin-finder': twinFinderEngine,
  'shadow-match': shadowMatchEngine,
  'who-disappeared': whoDisappearedEngine,
  'simon-memory': simonMemoryEngine,
  'train-route': trainRouteEngine,
  'hole-punch': holePunchEngine,
  'change-master': changeMasterEngine,
  'number-guess': numberGuessEngine
};

function createRoom(roomId) {
  const room = {
    id: roomId,
    gameType: 'draw-guess',
    status: 'LOBBY',
    players: [], // { id, token, name, avatar, score, isHost, isReady, offlineTimer }
    timer: null,
    roundTimeout: null,
    lastActivity: Date.now()
  };
  safeEngineCall(drawGuessEngine.initRoomState, room);
  return room;
}

// 定期回收闲置僵尸房间（超过 2 小时无活跃或空房间）
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (room.players.length === 0 || (now - (room.lastActivity || now) > 7200000)) {
      clearInterval(room.timer);
      clearTimeout(room.roundTimeout);
      rooms.delete(id);
    }
  }
}, 600000);

// 玩家被移除后统一通知游戏引擎修正回合指针/重启定时器（审计 R2-02）。
// leave_room / kick_player / disconnect 超时三条移除路径都会调用，
// 防止 UNO、拆弹、词弹、阿瓦隆、你画我猜因索引漂移导致整房永久死锁。
function notifyPlayerRemoved(room, removedIndex) {
  if (!room || !room.players || room.players.length === 0) return;
  if (room.status === 'LOBBY' || room.status === 'GAME_OVER') return;
  const engine = GAME_ENGINES[room.gameType];
  if (engine && typeof engine.onPlayerRemoved === 'function') {
    safeEngineCall(engine.onPlayerRemoved, room, removedIndex, io, broadcastRoom);
  }
}

function broadcastRoom(room) {
  room.lastActivity = Date.now();
  // 注意：绝不序列化 avalonSide（阵营）等私密字段——room_state 会广播给全房间，
  // 任何玩家开 DevTools 即可看到，等价于全员作弊（审计 R2-01）
  // votesReceived 是卧底的公开得票数（前端票数徽章消费点），投票结束后属公开信息
  const safePlayers = room.players.map(p => ({
    id: p.id,
    token: p.token,
    name: p.name,
    avatar: p.avatar || '🐱',
    score: p.score || 0,
    isHost: p.isHost,
    isReady: p.isReady,
    alive: p.alive !== undefined ? p.alive : true,
    votesReceived: p.votesReceived || 0
  }));

  const engine = GAME_ENGINES[room.gameType] || drawGuessEngine;
  const publicState = safeEngineCall(engine.getPublicState, room) || {};

  io.to(room.id).emit('room_state', {
    roomId: room.id,
    gameType: room.gameType,
    status: room.status,
    players: safePlayers,
    ...publicState
  });
}

function resetToLobby(room) {
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
  room.status = 'LOBBY';
  room.players.forEach(p => {
    p.isReady = false;
    p.alive = true;
    p.score = 0;
  });
  const engine = GAME_ENGINES[room.gameType] || drawGuessEngine;
  safeEngineCall(engine.initRoomState, room);
  broadcastRoom(room);
  io.to(room.id).emit('system_message', '🏠 已返回等待大厅！');
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPlayerToken = null;

  socket.on('join_room', ({ roomId, playerName, avatar, playerToken }) => {
    // 输入校验：限制类型与长度，防止超长字符串滥用内存/带宽（昵称最长12字、房间号最长32字符）
    // 校验失败时回发 join_error，让登录界面能给出提示而不是毫无反应（审计 R2-17）
    if (typeof roomId !== 'string' || typeof playerName !== 'string') {
      socket.emit('join_error', { reason: '房间号或昵称格式不正确' });
      return;
    }
    roomId = roomId.trim().slice(0, 32);
    playerName = playerName.trim().slice(0, 12);
    if (!roomId || !playerName) {
      socket.emit('join_error', { reason: '房间号和昵称不能为空' });
      return;
    }
    if (typeof avatar !== 'string' || !avatar) avatar = '🐱';
    avatar = avatar.slice(0, 8);
    // token 必须是 64 字符以内的字符串，否则视为无效并重新生成
    if (typeof playerToken !== 'string' || !playerToken || playerToken.length > 64) {
      playerToken = `token_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    currentRoomId = roomId;
    currentPlayerToken = playerToken || socket.id;

    socket.join(roomId);

    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) {
        socket.emit('join_error', { reason: '当前服务器房间数已达上限（最多 500 间），请稍后再试！' });
        socket.leave(roomId);
        currentRoomId = null;
        return;
      }
      room = createRoom(roomId);
      rooms.set(roomId, room);
    }

    let isReconnecting = false;

    // 智能玩家席位认领与去重机制 (Smart Reconnect & Deduplication)
    // 1. 优先按客户端持久化 Token 匹配（用于断线重连认领自己的席位）
    let player = room.players.find(p => p.token === currentPlayerToken);
    // 安全防护：若该 token 对应的席位仍被一个在线活跃的 socket 占用（例如玩家开了
    // 多标签页，或有人盗用了 token 想顶替他人），禁止接管，改为按新玩家处理，
    // 防止会话劫持 / 身份冒充。
    if (player && player.id !== socket.id) {
      const occupiedSocket = io.sockets.sockets.get(player.id);
      if (occupiedSocket && occupiedSocket.connected && !player.offlineTimer) {
        player = null;
      }
    }

    // 2. 若 Token 未匹配（例如隐私模式、清除缓存或换了浏览器），检查房间内是否有同名玩家
    if (!player) {
      const sameNamePlayer = room.players.find(p => p.name === playerName);
      if (sameNamePlayer) {
        const oldSocket = io.sockets.sockets.get(sameNamePlayer.id);
        const isOldSocketDead = !oldSocket || !oldSocket.connected;

        if (sameNamePlayer.offlineTimer || isOldSocketDead) {
          // 原同名玩家已断开/处于保留期，直接继承该席位与房主身份
          player = sameNamePlayer;
          player.token = currentPlayerToken;
        }
      }
    }

    if (player) {
      isReconnecting = true;
      if (player.offlineTimer) {
        clearTimeout(player.offlineTimer);
        player.offlineTimer = null;
      }
      player.id = socket.id;
      player.name = playerName;
      player.avatar = avatar || player.avatar;
    } else {
      // 人数上限保护：防止恶意客户端无限创建连接挤爆房间
      if (room.players.length >= 20) {
        // 房满时回发 join_error 让登录界面弹出提示（system_message 渲染在不可见的游戏屏，登录页看不到，审计 R2-17）
        socket.emit('join_error', { reason: '房间人数已满（最多 20 人），无法加入！' });
        socket.leave(roomId);
        currentRoomId = null;
        return;
      }

      // 安全防护：token 已被房内其他席位占用时，为本连接换发全新 token，
      // 杜绝"同 token 重复席位"被用于冒充他人投票/出牌（会话劫持）
      if (room.players.some(p => p.token === currentPlayerToken)) {
        currentPlayerToken = `token_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      }

      // 检查是否有重名且真正活跃在线的玩家，若有则自动加上后缀 (如 bao (2)) 避免同名混淆
      let finalName = playerName;
      const existingNames = new Set(room.players.map(p => p.name));
      if (existingNames.has(finalName)) {
        let suffix = 2;
        while (existingNames.has(`${finalName} (${suffix})`)) {
          suffix++;
        }
        finalName = `${finalName} (${suffix})`;
      }

      const isFirst = room.players.length === 0;
      player = {
        id: socket.id,
        token: currentPlayerToken,
        name: finalName,
        avatar: avatar || '🐱',
        score: 0,
        isHost: isFirst,
        isReady: false,
        alive: true,
        offlineTimer: null
      };

      // UNO 进行中入房的新玩家补发空手牌，防止引擎访问 undefined 手牌崩溃（审计 R2-07）
      if (room.gameType === 'uno' && room.status === 'UNO_PLAYING') {
        player.hand = [];
        player.hasCalledUno = false;
      }
      // 词汇炸弹进行中入房的新玩家补发生命值，否则会被引擎当作"已死亡"永远轮不到（审计 R2-12）
      if (room.gameType === 'word-bomb' && room.status === 'BOMB_TICKING') {
        if (!room.playerLives) room.playerLives = {};
        if (!(player.token in room.playerLives)) {
          const lives = Math.min(5, Math.max(1, Number.isFinite(room.wbLives) && room.wbLives > 0 ? Math.round(room.wbLives) : 2));
          room.playerLives[player.token] = lives;
        }
      }

      room.players.push(player);
    }

    // 确保房间内必须有且仅有一个在线房主（若原房主离线处于保留期，且有在线玩家入场，自动将房主交由首个活跃在线玩家）
    const onlinePlayers = room.players.filter(p => !p.offlineTimer);
    const hasOnlineHost = onlinePlayers.some(p => p.isHost);
    if (!hasOnlineHost && onlinePlayers.length > 0) {
      room.players.forEach(p => p.isHost = false);
      onlinePlayers[0].isHost = true;
    }

    socket.emit('joined_successfully', {
      roomId: room.id,
      gameType: room.gameType,
      playerId: socket.id,
      playerToken: player.token,
      isHost: player.isHost,
      iceServers: getIceServers()
    });

    if (room.gameType === 'draw-guess' && room.drawHistory && room.drawHistory.length > 0) {
      socket.emit('sync_draw_history', room.drawHistory);
    }

    // 几A几B：断线重连时私发本人历史猜测记录（用于前端状态自愈），
    // 历史只发给本人，不再通过公共 room_state 泄露给其他玩家
    if (room.gameType === 'bulls-and-cows' && room.playerGuesses?.[player.token]?.length > 0) {
      const history = room.playerGuesses[player.token];
      const last = history[history.length - 1];
      socket.emit('bc_guess_result', { guess: last.guess, a: last.a, b: last.b, history });
    }

    // ===== 断线重连私密状态补发（审计 R2-33）=====
    // 谁是卧底：重连后私发本人身份与词语（开局只发一次，不补发会导致玩家看不到自己的词）
    if (room.gameType === 'undercover' && room.status !== 'LOBBY' && room.status !== 'GAME_OVER' && player.role) {
      socket.emit('uc_secret_role', { role: player.role, word: player.word || '' });
    }
    // 阿瓦隆：重连后私发本人角色（视野信息由引擎重建，梅林/刺客等关键身份不丢失）
    if (room.gameType === 'avalon' && room.status !== 'LOBBY' && room.status !== 'GAME_OVER' && player.avalonRole
        && typeof avalonEngine.getSecretRoleFor === 'function') {
      socket.emit('avalon_secret_role', avalonEngine.getSecretRoleFor(room, player));
    }
    // UNO：重连后私发本人手牌
    if (room.gameType === 'uno' && room.status === 'UNO_PLAYING' && player.hand) {
      socket.emit('uno_hand', {
        hand: player.hand,
        canCallUno: player.hand.length === 2
      });
    }

    broadcastRoom(room);
    if (!isReconnecting) {
      io.to(room.id).emit('system_message', `👋 【${player.name}】进入了房间`);
    }
  });

  
  // 跨应用唤醒即时同步 (Mobile Foreground Wake-up Sync)
  socket.on('ping_sync', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    // 500ms 频控：ping_sync 每次触发都是一次全房 room_state 广播，
    // 不限频会被恶意客户端当广播放大器刷流量（审计 R2-21）
    const nowSync = Date.now();
    if (socket.lastPingSyncAt && nowSync - socket.lastPingSyncAt < 500) return;
    socket.lastPingSyncAt = nowSync;
    broadcastRoom(room);
  });

// 房主切换游戏类型
  socket.on('switch_game', ({ gameType }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost) return;
    if (!GAME_ENGINES[gameType]) return;

    clearInterval(room.timer);
    room.timer = null;
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;

    room.gameType = gameType;
    const engine = GAME_ENGINES[gameType];
    safeEngineCall(engine.initRoomState, room);
    room.status = 'LOBBY';
    room.players.forEach(p => {
      p.isReady = false;
      p.alive = true;
    });

    const gameNames = {
      'draw-guess': '🎨 你画我猜',
      'undercover': '🕵️ 谁是卧底',
      'avalon': '👑 阿瓦隆',
      'uno': '🃏 UNO 优诺牌',
      'flash-counter': '🐑 瞬间数羊',
      'bomb-roulette': '💣 拆弹轮盘赌',
      'bulls-and-cows': '🔢 密码破解大师',
      'math-24': '🧮 决战 24 点',
      'cube-count': '🧊 瞬间几何数方块',
      'word-bomb': '💣 成语/词汇炸弹',
      'perfect-slice': '🍕 切披萨 50:50',
      'hold-five': '⏱️ 盲压挑战 (随机时间)'
    };

    io.to(room.id).emit('system_message', `🎮 房主将游戏切换为【${gameNames[gameType] || gameType}】！`);
    broadcastRoom(room);
  });

  // 允许房主修改的房间配置白名单（只允许游戏参数，防止注入游戏类型/状态/玩家等危险属性）
  const ALLOWED_SETTINGS = {
    maxRounds: 'number', roundTime: 'number', enableHints: 'boolean',
    spyCount: 'number', hasBlank: 'boolean', speakTime: 'number',
    usePercivalMorgana: 'boolean', useMordred: 'boolean', useOberon: 'boolean',
    speechMode: 'string', speechDuration: 'number',
    unoHandSize: 'number', unoStackRules: 'boolean',
    flashSpeed: 'string', bombWires: 'number', bombTime: 'number',
    bcRounds: 'number', bcTime: 'number', m24Time: 'number',
    cubeDiff: 'string', wbLives: 'number', wbTime: 'number',
    sliceTolerance: 'number', fixedTargetSeconds: 'number'
  };

  // 数值型设置的范围钳制表：超出范围自动收敛到边界，
  // 防止恶意/误设极端值（如 spyCount=-5 秒结局、fixedTargetSeconds=10000 卡死轮次）（审计 R2-32）
  const SETTING_RANGES = {
    maxRounds: [1, 20], roundTime: [10, 300], spyCount: [1, 4], speakTime: [10, 120],
    speechDuration: [10, 180], unoHandSize: [1, 20], bombWires: [2, 12], bombTime: [5, 60],
    bcRounds: [1, 10], bcTime: [30, 600], m24Time: [15, 300],
    wbLives: [1, 5], wbTime: [4, 30], sliceTolerance: [0.5, 10], fixedTargetSeconds: [1, 30]
  };

  // 房主更新房间配置参数（白名单过滤 + 类型校验）
  socket.on('update_room_settings', (settings) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost || room.status !== 'LOBBY') return;
    if (!settings || typeof settings !== 'object') return;

    // 只合并白名单字段，并对数值/类型做校验，防止客户端任意覆写 room 属性
    for (const [key, expectedType] of Object.entries(ALLOWED_SETTINGS)) {
      if (settings[key] === undefined) continue;
      if (expectedType === 'number') {
        const num = Number(settings[key]);
        if (!Number.isFinite(num)) continue;
        // 按范围表钳制，杜绝 0/负数/超大值绕过引擎防御
        const range = SETTING_RANGES[key];
        room[key] = range ? Math.min(range[1], Math.max(range[0], num)) : num;
      } else if (expectedType === 'boolean') {
        room[key] = !!settings[key];
      } else if (expectedType === 'string' && typeof settings[key] === 'string') {
        room[key] = settings[key].slice(0, 50);
      }
    }
    broadcastRoom(room);
  });

  // 玩家切换准备状态
  socket.on('toggle_ready', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || player.isHost) return;

    player.isReady = !player.isReady;
    broadcastRoom(room);
  });

  // 房主启动游戏
  socket.on('start_game', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost || room.status !== 'LOBBY') return;

    if (room.gameType === 'draw-guess') {
      room.currentDrawerIndex = 0;
      room.round = 1;
      safeEngineCall(drawGuessEngine.startTurn, room, io, broadcastRoom);
    } else if (GAME_ENGINES[room.gameType]) {
      safeEngineCall(GAME_ENGINES[room.gameType].startGame, room, io, broadcastRoom);
    }
  });

  // 返回大厅
  socket.on('back_to_lobby', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;

    // 房主或者游戏已结束(GAME_OVER)时，任何玩家均可触发全员返回大厅
    if (player.isHost || room.status === 'GAME_OVER' || room.status === 'LOBBY') {
      resetToLobby(room);
    }
  });

  // 聊天与猜词
  socket.on('send_chat', ({ text }) => {
    const room = rooms.get(currentRoomId);
    if (!room || !text || !text.trim()) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;

    const trimmed = text.trim();
    // 服务端消息长度与发送频率限制，防刷屏与带宽滥用
    if (trimmed.length > 200) return;
    const nowChatAt = Date.now();
    if (player.lastChatAt && nowChatAt - player.lastChatAt < 500) return;
    player.lastChatAt = nowChatAt;

    if (room.gameType === 'draw-guess' && room.status === 'DRAWING') {
      if (player.isDrawing) {
        if (room.currentWord && trimmed.toLowerCase().includes(room.currentWord.toLowerCase())) {
          socket.emit('system_message', '⚠️ 你是当前画师，不能在公屏聊天中透露或包含谜底！');
          return;
        }
      }
      const guessed = safeEngineCall(drawGuessEngine.handleGuess, room, player, trimmed, io, broadcastRoom);
      if (guessed) return;
    } else if (room.gameType === 'word-bomb' && room.status === 'BOMB_TICKING') {
      safeEngineCall(wordBombEngine.submitWord, room, player.token, trimmed, io, broadcastRoom);
      return;
    }

    io.to(room.id).emit('chat_message', {
      type: 'normal',
      avatar: player.avatar,
      sender: player.name,
      text: trimmed
    });
  });

  // 快捷表情与互动
  socket.on('send_reaction', ({ emoji }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;

    // 表情校验：限字符串且长度不超过 8，防止任意大 payload 借广播通道刷屏/放大带宽
    if (typeof emoji !== 'string' || !emoji || emoji.length > 8) return;

    io.to(room.id).emit('floating_reaction', {
      emoji,
      sender: player.name
    });
  });

  // 移交房主 / 踢人
  socket.on('transfer_host', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost) return;

    const target = room.players.find(p => p.token === targetToken);
    if (target && target.token !== player.token) {
      player.isHost = false;
      target.isHost = true;
      io.to(room.id).emit('system_message', `👑 房主权限已移交给【${target.name}】`);
      broadcastRoom(room);
    }
  });

  socket.on('kick_player', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost) return;

    const targetIndex = room.players.findIndex(p => p.token === targetToken);
    if (targetIndex >= 0 && room.players[targetIndex].token !== player.token) {
      const target = room.players[targetIndex];
      io.to(target.id).emit('kicked');
      io.to(room.id).emit('voice_peer_leave', { playerToken: target.token });
      // 先通知引擎修正回合指针（被踢者可能是当前回合玩家，审计 R2-02），再移出席位
      room.players.splice(targetIndex, 1);
      notifyPlayerRemoved(room, targetIndex);
      // 被踢者的 socket 也移出房间频道，防止其继续接收游戏广播/幽灵提交（审计 R2-40）
      const kickedSocket = io.sockets.sockets.get(target.id);
      if (kickedSocket) kickedSocket.leave(room.id);
      io.to(room.id).emit('system_message', `🚫 【${target.name}】被房主请出了房间`);
      broadcastRoom(room);
    }
  });

  // =====================【你画我猜】=====================
  socket.on('draw_stroke', (data) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'draw-guess' || room.status !== 'DRAWING') return;
    const currentDrawer = room.players[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.token !== currentPlayerToken) return;

    // 结构校验：只接受规定类型、数值范围与长度的笔画数据，
    // 防止恶意画师发送超大/畸形 payload 撑爆 drawHistory 内存或破坏其他端渲染
    if (!data || typeof data !== 'object') return;
    let clean = null;
    if (data.type === 'start') {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y)
          || typeof data.color !== 'string' || !Number.isFinite(data.size)) return;
      clean = {
        type: 'start',
        x: clamp01(data.x), y: clamp01(data.y),
        color: data.color.slice(0, 32),
        size: Math.min(100, Math.max(1, Number(data.size)))
      };
    } else if (data.type === 'line') {
      if (![data.x1, data.y1, data.x2, data.y2].every(Number.isFinite)
          || typeof data.color !== 'string' || !Number.isFinite(data.size)) return;
      clean = {
        type: 'line',
        x1: clamp01(data.x1), y1: clamp01(data.y1),
        x2: clamp01(data.x2), y2: clamp01(data.y2),
        color: data.color.slice(0, 32),
        size: Math.min(100, Math.max(1, Number(data.size)))
      };
    } else if (data.type === 'end') {
      clean = { type: 'end' };
    } else {
      return;
    }

    if (!room.drawHistory) room.drawHistory = [];
    room.drawHistory.push(clean);
    // 限定画布历史条数，防止恶意画师无限绘制撑爆服务端内存
    if (room.drawHistory.length > 3000) {
      room.drawHistory.splice(0, room.drawHistory.length - 3000);
    }
    socket.to(room.id).emit('draw_stroke', clean);
  });

  socket.on('clear_canvas', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'draw-guess' || room.status !== 'DRAWING') return;
    const currentDrawer = room.players[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.token !== currentPlayerToken) return;

    room.drawHistory = [];
    io.to(room.id).emit('clear_canvas');
  });

  socket.on('undo_canvas', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'draw-guess' || room.status !== 'DRAWING') return;
    const currentDrawer = room.players[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.token !== currentPlayerToken) return;

    if (room.drawHistory && room.drawHistory.length > 0) {
      for (let i = room.drawHistory.length - 1; i >= 0; i--) {
        if (room.drawHistory[i].type === 'start') {
          room.drawHistory.splice(i);
          break;
        }
      }
      io.to(room.id).emit('redraw_canvas', room.drawHistory);
    }
  });

  socket.on('select_word', ({ word }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'draw-guess' || room.status !== 'SELECTING') return;
    safeEngineCall(drawGuessEngine.selectWord, room, socket.id, word, io, broadcastRoom);
  });

  // =====================【谁是卧底】=====================
  socket.on('uc_finish_speech', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'undercover') return;
    safeEngineCall(undercoverEngine.finishCurrentSpeech, room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uc_cast_vote', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'undercover') return;
    safeEngineCall(undercoverEngine.castVote, room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【阿瓦隆】=====================
  socket.on('avalon_select_member', ({ memberToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.selectTeamMember, room, currentPlayerToken, memberToken, io, broadcastRoom);
  });

  socket.on('avalon_submit_team', ({ teamTokens }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.submitTeam, room, currentPlayerToken, teamTokens, io, broadcastRoom);
  });

  socket.on('avalon_finish_speech', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.finishCurrentSpeech, room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('avalon_team_vote', ({ approve }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.castTeamVote, room, currentPlayerToken, approve, io, broadcastRoom);
  });

  socket.on('avalon_quest_vote', ({ isSuccess }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.castQuestVote, room, currentPlayerToken, isSuccess, io, broadcastRoom);
  });

  socket.on('avalon_assassinate', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    safeEngineCall(avalonEngine.assassinatePlayer, room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【UNO】=====================
  socket.on('uno_play_card', ({ cardId, chosenColor }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    safeEngineCall(unoEngine.playCard, room, currentPlayerToken, cardId, chosenColor, io, broadcastRoom);
  });

  socket.on('uno_draw_card', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    safeEngineCall(unoEngine.drawCardAction, room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uno_pass_turn', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    safeEngineCall(unoEngine.passTurnAction, room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uno_call_uno', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    safeEngineCall(unoEngine.callUno, room, currentPlayerToken, io);
  });

  socket.on('uno_catch_uno', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    safeEngineCall(unoEngine.catchUno, room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【新游戏事件调度】=====================
  // 瞬间数羊
  socket.on('flash_submit_answer', ({ option }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'flash-counter') return;
    safeEngineCall(flashCounterEngine.submitAnswer, room, currentPlayerToken, option, io, broadcastRoom);
  });

  // 拆弹轮盘赌
  socket.on('bomb_cut_wire', ({ wireId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'bomb-roulette') return;
    safeEngineCall(bombRouletteEngine.cutWire, room, currentPlayerToken, wireId, io, broadcastRoom);
  });

  // 密码破解大师 (几A几B)
  socket.on('bc_submit_guess', ({ guess }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'bulls-and-cows') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    // 500ms 频控：每次猜测都会全量回传历史并全房广播，
    // 不限频可被恶意客户端用于 O(n²) 内存/带宽放大（审计 R2-11）
    const nowGuessAt = Date.now();
    if (player.lastGuessAt && nowGuessAt - player.lastGuessAt < 500) return;
    player.lastGuessAt = nowGuessAt;
    safeEngineCall(bullsAndCowsEngine.submitGuess, room, currentPlayerToken, guess, io, broadcastRoom);
  });

  // 决战 24 点
  socket.on('m24_submit_solution', ({ expression }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'math-24') return;
    safeEngineCall(math24Engine.submitSolution, room, currentPlayerToken, expression, io, broadcastRoom);
  });

  socket.on('m24_skip_puzzle', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'math-24') return;
    if (math24Engine.skipPuzzleAction) {
      safeEngineCall(math24Engine.skipPuzzleAction, room, currentPlayerToken, io, broadcastRoom);
    }
  });

  // 瞬间几何数方块
  socket.on('cube_submit_answer', ({ option }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'cube-count') return;
    safeEngineCall(cubeCountEngine.submitAnswer, room, currentPlayerToken, option, io, broadcastRoom);
  });

  // 成语/词汇炸弹
  socket.on('word_bomb_submit', ({ word }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'word-bomb') return;
    safeEngineCall(wordBombEngine.submitWord, room, currentPlayerToken, word, io, broadcastRoom);
  });

  // 切披萨 50:50
  socket.on('slice_cut_submit', ({ p1, p2 }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'perfect-slice') return;
    safeEngineCall(perfectSliceEngine.submitSlice, room, currentPlayerToken, p1, p2, io, broadcastRoom);
  });

  // 盲压 5 秒
  socket.on('hold_submit_time', ({ elapsedMs }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'hold-five') return;
    safeEngineCall(holdFiveEngine.submitHoldTime, room, currentPlayerToken, elapsedMs, io, broadcastRoom);
  });

  // 1. 颜色与文字大陷阱
  socket.on('stroop_submit_answer', ({ answerId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'stroop-trap') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(stroopTrapEngine.submitAnswer, room, player, answerId, io, broadcastRoom);
  });

  // 2. 谁是多胞胎 / 找不同
  socket.on('twin_submit_answer', ({ selectedIndex }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'twin-finder') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(twinFinderEngine.submitAnswer, room, player, selectedIndex, io, broadcastRoom);
  });

  // 3. 聚光灯拼图 / 影子猜物
  socket.on('shadow_submit_answer', ({ answerId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'shadow-match') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(shadowMatchEngine.submitAnswer, room, player, answerId, io, broadcastRoom);
  });

  // 4. 谁不见了 / 偷吃怪
  socket.on('disappear_submit_answer', ({ answerId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'who-disappeared') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(whoDisappearedEngine.submitAnswer, room, player, answerId, io, broadcastRoom);
  });

  // 5. 西蒙说 / 节拍记忆
  socket.on('simon_submit_step', ({ color }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'simon-memory') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(simonMemoryEngine.submitStep, room, player, color, io, broadcastRoom);
  });

  // 7. 轨道连连通 / 小火车快跑
  socket.on('train_submit_answer', ({ trackId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'train-route') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(trainRouteEngine.submitAnswer, room, player, trackId, io, broadcastRoom);
  });

  // 9. 折纸打孔展开图
  socket.on('hole_submit_answer', ({ optionId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'hole-punch') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(holePunchEngine.submitAnswer, room, player, optionId, io, broadcastRoom);
  });

  // 11. 找零钱大师
  socket.on('change_submit_counts', ({ counts }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'change-master') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(changeMasterEngine.submitChange, room, player, counts, io, broadcastRoom);
  });

  // 14. 盲猜数量 / 谁最接近
  socket.on('number_submit_guess', ({ guess }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'number-guess') return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player) return;
    safeEngineCall(numberGuessEngine.submitGuess, room, player, guess, io, broadcastRoom);
  });

  // =====================【实时语音 WebRTC 信令中继】=====================
  socket.on('voice_signal', ({ toToken, signal }) => {
    if (!currentRoomId || !currentPlayerToken || typeof toToken !== 'string' || !signal) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const targetPlayer = room.players.find(p => p.token === toToken);
    if (!targetPlayer) return;
    const targetSocket = io.sockets.sockets.get(targetPlayer.id);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('voice_signal', {
        fromToken: currentPlayerToken,
        signal
      });
    }
  });

  socket.on('voice_status', ({ isMuted, isSpeaking }) => {
    if (!currentRoomId || !currentPlayerToken) return;
    socket.to(currentRoomId).emit('voice_status_update', {
      playerToken: currentPlayerToken,
      isMuted: !!isMuted,
      isSpeaking: !!isSpeaking
    });
  });

  socket.on('voice_join_mesh', () => {
    if (!currentRoomId || !currentPlayerToken) return;
    socket.to(currentRoomId).emit('voice_peer_joined', {
      playerToken: currentPlayerToken
    });
  });

  // 玩家主动退出房间
  socket.on('leave_room', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    socket.to(currentRoomId).emit('voice_peer_leave', { playerToken: currentPlayerToken });
    socket.leave(currentRoomId);

    const idx = room.players.findIndex(p => p.token === currentPlayerToken);
    if (idx !== -1) {
      const removed = room.players.splice(idx, 1)[0];
      // 通知引擎修正回合指针（离场者可能是当前回合玩家，审计 R2-02）
      notifyPlayerRemoved(room, idx);
      if (removed.offlineTimer) {
        clearTimeout(removed.offlineTimer);
        removed.offlineTimer = null;
      }
      io.to(room.id).emit('system_message', `🚪 【${removed.name}】退出了房间`);

      if (removed.isHost && room.players.length > 0) {
        const nextHost = room.players.find(p => !p.offlineTimer) || room.players[0];
        nextHost.isHost = true;
        io.to(room.id).emit('system_message', `👑 【${nextHost.name}】成为了新房主`);
      }

      if (room.players.length === 0) {
        clearInterval(room.timer);
        room.timer = null;
        clearTimeout(room.roundTimeout);
        room.roundTimeout = null;
        rooms.delete(room.id);
      } else {
        broadcastRoom(room);
      }
    }

    currentRoomId = null;
  });

  // 断开连接处理
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const player = room.players.find(p => p.token === currentPlayerToken);
    if (player) {
      player.offlineTimer = setTimeout(() => {
        const idx = room.players.findIndex(p => p.token === player.token);
        if (idx !== -1) {
          const removed = room.players.splice(idx, 1)[0];
          io.to(room.id).emit('voice_peer_leave', { playerToken: removed.token });
          // 通知引擎修正回合指针（掉线超时被移除的玩家可能是当前回合玩家，审计 R2-02）
          notifyPlayerRemoved(room, idx);
          io.to(room.id).emit('system_message', `🚪 【${removed.name}】离开了房间`);

          if (removed.isHost && room.players.length > 0) {
            // 与 leave_room 保持一致：优先把房主移交给仍在保留期之外的首个在线玩家
            const nextHost = room.players.find(p => !p.offlineTimer) || room.players[0];
            nextHost.isHost = true;
            io.to(room.id).emit('system_message', `👑 【${nextHost.name}】成为了新房主`);
          }

          if (room.players.length === 0) {
            clearInterval(room.timer);
            room.timer = null;
            clearTimeout(room.roundTimeout);
            room.roundTimeout = null;
            rooms.delete(room.id);
          } else {
            broadcastRoom(room);
          }
        }
      }, 90000); // 宽限 90 秒，避免移动端切换到其他应用（如复制邀请、回微信）被移出房间或丢房主
    }
  });
});

// ===== 优雅关停（Graceful Shutdown）=====
// 收到 SIGTERM/SIGINT 退出信号时，清理定时器并通知客户端，避免硬杀导致异常
function gracefulShutdown(signal) {
  console.log(`\n🛑 收到 ${signal} 信号，正在优雅关闭服务...`);
  io.emit('system_message', '⚠️ 服务正在维护重启，请稍后重新进入！');
  for (const [, room] of rooms.entries()) {
    clearInterval(room.timer);
    clearTimeout(room.roundTimeout);
  }
  server.close(() => {
    console.log('✅ 服务已平稳关闭。');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 聚会游戏聚合大厅服务运行在 http://0.0.0.0:${PORT}`);
});
