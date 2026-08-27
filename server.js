const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

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
  'hold-five': holdFiveEngine
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
  drawGuessEngine.initRoomState(room);
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

function broadcastRoom(room) {
  room.lastActivity = Date.now();
  const safePlayers = room.players.map(p => ({
    id: p.id,
    token: p.token,
    name: p.name,
    avatar: p.avatar || '🐱',
    score: p.score || 0,
    isHost: p.isHost,
    isReady: p.isReady,
    alive: p.alive !== undefined ? p.alive : true,
    avalonSide: p.avalonSide || null
  }));

  const engine = GAME_ENGINES[room.gameType] || drawGuessEngine;
  const publicState = engine.getPublicState(room);

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
  });
  const engine = GAME_ENGINES[room.gameType] || drawGuessEngine;
  engine.initRoomState(room);
  broadcastRoom(room);
  io.to(room.id).emit('system_message', '🏠 已返回等待大厅！');
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPlayerToken = null;

  socket.on('join_room', ({ roomId, playerName, avatar, playerToken }) => {
    if (!roomId || !playerName) return;

    currentRoomId = roomId;
    currentPlayerToken = playerToken || socket.id;

    socket.join(roomId);

    let room = rooms.get(roomId);
    if (!room) {
      room = createRoom(roomId);
      rooms.set(roomId, room);
    }

    let isReconnecting = false;

    // 智能玩家席位认领与去重机制 (Smart Reconnect & Deduplication)
    // 1. 优先按客户端持久化 Token 匹配
    let player = room.players.find(p => p.token === currentPlayerToken);

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
      isHost: player.isHost
    });

    if (room.gameType === 'draw-guess' && room.drawHistory && room.drawHistory.length > 0) {
      socket.emit('sync_draw_history', room.drawHistory);
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
    if (room) broadcastRoom(room);
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
    engine.initRoomState(room);
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

  // 房主更新房间配置参数
  socket.on('update_room_settings', (settings) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.token === currentPlayerToken);
    if (!player || !player.isHost || room.status !== 'LOBBY') return;

    Object.assign(room, settings);
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
      drawGuessEngine.startTurn(room, io, broadcastRoom);
    } else if (GAME_ENGINES[room.gameType]) {
      GAME_ENGINES[room.gameType].startGame(room, io, broadcastRoom);
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

    if (room.gameType === 'draw-guess' && room.status === 'DRAWING') {
      if (player.isDrawing) {
        if (room.currentWord && trimmed.toLowerCase().includes(room.currentWord.toLowerCase())) {
          socket.emit('system_message', '⚠️ 你是当前画师，不能在公屏聊天中透露或包含谜底！');
          return;
        }
      }
      const guessed = drawGuessEngine.handleGuess(room, player, trimmed, io, broadcastRoom);
      if (guessed) return;
    } else if (room.gameType === 'word-bomb' && room.status === 'BOMB_TICKING') {
      wordBombEngine.submitWord(room, player.token, trimmed, io, broadcastRoom);
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
      room.players.splice(targetIndex, 1);
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

    if (!room.drawHistory) room.drawHistory = [];
    room.drawHistory.push(data);
    socket.to(room.id).emit('draw_stroke', data);
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
    drawGuessEngine.selectWord(room, socket.id, word, io, broadcastRoom);
  });

  // =====================【谁是卧底】=====================
  socket.on('uc_finish_speech', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'undercover') return;
    undercoverEngine.finishCurrentSpeech(room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uc_cast_vote', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'undercover') return;
    undercoverEngine.castVote(room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【阿瓦隆】=====================
  socket.on('avalon_select_member', ({ memberToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.selectTeamMember(room, currentPlayerToken, memberToken, io, broadcastRoom);
  });

  socket.on('avalon_submit_team', ({ teamTokens }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.submitTeam(room, currentPlayerToken, teamTokens, io, broadcastRoom);
  });

  socket.on('avalon_finish_speech', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.finishCurrentSpeech(room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('avalon_team_vote', ({ approve }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.castTeamVote(room, currentPlayerToken, approve, io, broadcastRoom);
  });

  socket.on('avalon_quest_vote', ({ isSuccess }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.castQuestVote(room, currentPlayerToken, isSuccess, io, broadcastRoom);
  });

  socket.on('avalon_assassinate', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'avalon') return;
    avalonEngine.assassinatePlayer(room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【UNO】=====================
  socket.on('uno_play_card', ({ cardId, chosenColor }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    unoEngine.playCard(room, currentPlayerToken, cardId, chosenColor, io, broadcastRoom);
  });

  socket.on('uno_draw_card', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    unoEngine.drawCardAction(room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uno_pass_turn', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    unoEngine.passTurnAction(room, currentPlayerToken, io, broadcastRoom);
  });

  socket.on('uno_call_uno', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    unoEngine.callUno(room, currentPlayerToken, io);
  });

  socket.on('uno_catch_uno', ({ targetToken }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'uno') return;
    unoEngine.catchUno(room, currentPlayerToken, targetToken, io, broadcastRoom);
  });

  // =====================【新游戏事件调度】=====================
  // 瞬间数羊
  socket.on('flash_submit_answer', ({ option }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'flash-counter') return;
    flashCounterEngine.submitAnswer(room, currentPlayerToken, option, io, broadcastRoom);
  });

  // 拆弹轮盘赌
  socket.on('bomb_cut_wire', ({ wireId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'bomb-roulette') return;
    bombRouletteEngine.cutWire(room, currentPlayerToken, wireId, io, broadcastRoom);
  });

  // 密码破解大师 (几A几B)
  socket.on('bc_submit_guess', ({ guess }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'bulls-and-cows') return;
    bullsAndCowsEngine.submitGuess(room, currentPlayerToken, guess, io, broadcastRoom);
  });

  // 决战 24 点
  socket.on('m24_submit_solution', ({ expression }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'math-24') return;
    math24Engine.submitSolution(room, currentPlayerToken, expression, io, broadcastRoom);
  });

  socket.on('m24_skip_puzzle', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'math-24') return;
    if (math24Engine.skipPuzzleAction) {
      math24Engine.skipPuzzleAction(room, currentPlayerToken, io, broadcastRoom);
    }
  });

  // 瞬间几何数方块
  socket.on('cube_submit_answer', ({ option }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'cube-count') return;
    cubeCountEngine.submitAnswer(room, currentPlayerToken, option, io, broadcastRoom);
  });

  // 成语/词汇炸弹
  socket.on('word_bomb_submit', ({ word }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'word-bomb') return;
    wordBombEngine.submitWord(room, currentPlayerToken, word, io, broadcastRoom);
  });

  // 切披萨 50:50
  socket.on('slice_cut_submit', ({ p1, p2 }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'perfect-slice') return;
    perfectSliceEngine.submitSlice(room, currentPlayerToken, p1, p2, io, broadcastRoom);
  });

  // 盲压 5 秒
  socket.on('hold_submit_time', ({ elapsedMs }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.gameType !== 'hold-five') return;
    holdFiveEngine.submitHoldTime(room, currentPlayerToken, elapsedMs, io, broadcastRoom);
  });

  // 玩家主动退出房间
  socket.on('leave_room', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    socket.leave(currentRoomId);

    const idx = room.players.findIndex(p => p.token === currentPlayerToken);
    if (idx !== -1) {
      const removed = room.players.splice(idx, 1)[0];
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
          io.to(room.id).emit('system_message', `🚪 【${removed.name}】离开了房间`);

          if (removed.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
            io.to(room.id).emit('system_message', `👑 【${room.players[0].name}】成为了新房主`);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 聚会游戏聚合大厅服务运行在 http://0.0.0.0:${PORT}`);
});
