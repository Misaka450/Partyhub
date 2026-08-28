const { shuffle } = require('./shuffle');

function initRoomState(room) {
  room.gameType = 'bomb-roulette';
  room.status = 'LOBBY';
  room.wires = []; // [{ id: 'w1', color: '#EF4444', name: '红线', isTrap: false, isCut: false, cutBy: null }]
  room.currentTurnIndex = 0;
  room.trapWireId = null;
  room.explodedPlayer = null;
  room.winner = null;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

const WIRE_COLORS = [
  { color: '#EF4444', name: '🔴 红线' },
  { color: '#3B82F6', name: '🔵 蓝线' },
  { color: '#22C55E', name: '🟢 绿线' },
  { color: '#FBBF24', name: '🟡 黄线' },
  { color: '#8B5CF6', name: '🟣 紫线' },
  { color: '#EC4899', name: '🌸 粉线' },
  { color: '#06B6D4', name: '🐬 青线' },
  { color: '#F97316', name: '🟠 橙线' },
  { color: '#F8FAFC', name: '⚪ 白线' },
  { color: '#64748B', name: '🔘 灰线' },
  { color: '#78350F', name: '🟤 棕线' },
  { color: '#10B981', name: '🍀 翠线' }
];

function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'bomb-roulette') return;
  const playerCount = room.players.length;
  if (playerCount < 2) {
    io.to(room.id).emit('system_message', '拆弹轮盘赌至少需要 2 名玩家！');
    return;
  }

  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  // 引线数读取房间设置 bombWires（2~12 根），未配置则按人数默认（每人 2 根，6~12 根）
  const wireCount = Math.min(12, Math.max(2, Number.isFinite(room.bombWires) && room.bombWires > 0
    ? Math.round(room.bombWires)
    : Math.min(12, Math.max(6, playerCount * 2))));
  const selectedColors = shuffle(WIRE_COLORS).slice(0, wireCount);

  // 随机挑 1 根作为引爆线
  const trapIndex = Math.floor(Math.random() * wireCount);

  room.wires = selectedColors.map((w, idx) => ({
    id: `wire_${idx}`,
    color: w.color,
    name: w.name,
    isTrap: idx === trapIndex,
    isCut: false,
    cutBy: null
  }));

  room.trapWireId = room.wires[trapIndex].id;
  room.currentTurnIndex = Math.floor(Math.random() * playerCount);
  room.explodedPlayer = null;
  room.winner = null;
  room.status = 'BOMB_PLAYING';
  // 每回合倒计时读取房间设置 bombTime（5~60 秒），未配置则默认 15 秒
  room.timeLeft = Math.min(60, Math.max(5, Number.isFinite(room.bombTime) && room.bombTime > 0 ? Math.round(room.bombTime) : 15));

  broadcastRoom(room);

  const current = room.players[room.currentTurnIndex];
  io.to(room.id).emit('system_message', `💣 炸弹已就绪！共 ${wireCount} 根引线，其中仅有 1 根是爆炸引线！首位拆弹勇士：【${current.name}】！`);

  startTurnTimer(room, io, broadcastRoom);
}

function startTurnTimer(room, io, broadcastRoom) {
  clearInterval(room.timer);
  // 与开局保持一致：读取房间设置 bombTime（5~60 秒）
  room.timeLeft = Math.min(60, Math.max(5, Number.isFinite(room.bombTime) && room.bombTime > 0 ? Math.round(room.bombTime) : 15));

  const current = room.players[room.currentTurnIndex];
  if (!current) return;

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      // 超时随机剪一根剩余引线
      const availableWires = room.wires.filter(w => !w.isCut);
      if (availableWires.length > 0) {
        const randomWire = availableWires[Math.floor(Math.random() * availableWires.length)];
        cutWire(room, current.token, randomWire.id, io, broadcastRoom);
      }
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function cutWire(room, playerToken, wireId, io, broadcastRoom) {
  if (room.status !== 'BOMB_PLAYING') return;
  const current = room.players[room.currentTurnIndex];
  if (!current || current.token !== playerToken) return;

  const wire = room.wires.find(w => w.id === wireId);
  if (!wire || wire.isCut) return;

  wire.isCut = true;
  wire.cutBy = current.name;
  clearInterval(room.timer);

  if (wire.isTrap) {
    // 💥 踩中爆炸！
    room.explodedPlayer = current;
    room.status = 'BOMB_EXPLODED';
    
    // 其余所有幸存玩家平分积分
    const survivors = room.players.filter(p => p.token !== current.token);
    survivors.forEach(p => {
      p.score += 150;
    });

    io.to(room.id).emit('bomb_exploded', {
      wire,
      victimName: current.name,
      victimAvatar: current.avatar,
      survivors: survivors.map(p => ({ name: p.name, avatar: p.avatar }))
    });

    io.to(room.id).emit('system_message', `💥 BOOM！！！【${current.name}】剪断了【${wire.name}】，炸弹瞬间引爆！`);
    broadcastRoom(room);

    clearTimeout(room.roundTimeout);
    room.roundTimeout = setTimeout(() => {
      if (room.gameType !== 'bomb-roulette' || room.status !== 'BOMB_EXPLODED') return;
      endGame(room, io, broadcastRoom);
    }, 4500);
  } else {
    // 😅 安全剪断！高风险递增加分
    const cutOrder = room.wires.filter(w => w.isCut).length;
    const earnedPoints = 30 + cutOrder * 20;
    current.score += earnedPoints;
    io.to(room.id).emit('wire_cut_safe', {
      wire,
      playerName: current.name,
      avatar: current.avatar,
      earnedPoints
    });

    io.to(room.id).emit('system_message', `✂️ 咔嚓！【${current.name}】剪断了【${wire.name}】—— 安全！获得 +${earnedPoints} 分（第 ${cutOrder} 刀高风险加成）！`);

    // 检查是否只剩爆炸线（全员安全拆除其他所有线）
    const remainingSafeWires = room.wires.filter(w => !w.isCut && !w.isTrap);
    if (remainingSafeWires.length === 0) {
      // 全员排雷成功，大获全胜！
      room.status = 'BOMB_ALL_SAFE';
      io.to(room.id).emit('system_message', '🎉 奇迹！所有安全引线已被全部剪除，炸弹成功拆解，全员生还！');
      broadcastRoom(room);
      clearTimeout(room.roundTimeout);
      room.roundTimeout = setTimeout(() => {
        if (room.gameType !== 'bomb-roulette' || room.status !== 'BOMB_ALL_SAFE') return;
        endGame(room, io, broadcastRoom);
      }, 3500);
      return;
    }

    // 顺位轮到下一位
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
    broadcastRoom(room);
    startTurnTimer(room, io, broadcastRoom);
  }
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('bomb_game_over', {
    explodedPlayer: room.explodedPlayer ? { name: room.explodedPlayer.name, avatar: room.explodedPlayer.avatar } : null,
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  const current = room.players[room.currentTurnIndex];
  return {
    gameType: 'bomb-roulette',
    status: room.status,
    timeLeft: room.timeLeft,
    currentTurnToken: current ? current.token : null,
    currentTurnName: current ? current.name : '',
    wires: room.wires.map(w => ({
      id: w.id,
      color: w.color,
      name: w.name,
      isCut: w.isCut,
      cutBy: w.cutBy
    })),
    explodedPlayer: room.explodedPlayer ? { name: room.explodedPlayer.name, avatar: room.explodedPlayer.avatar } : null
  };
}

// 玩家被移除后的善后钩子：修正回合指针并重启定时器（审计 R2-02）。
// server.js 在 leave_room / kick / 掉线超时移除玩家后会调用本函数
function onPlayerRemoved(room, removedIndex, io, broadcastRoom) {
  if (room.status !== 'BOMB_PLAYING') return;
  const count = room.players.length;
  if (count === 0) return;

  const old = room.currentTurnIndex;
  if (removedIndex === old) {
    // 被移除者正是当前拆弹者：splice 后同索引已指向原下一位，回合自然顺延
  } else if (removedIndex < old) {
    // 被移除者在当前玩家之前：数组整体前移，索引同步减一
    room.currentTurnIndex = old - 1;
  }
  if (room.currentTurnIndex < 0 || room.currentTurnIndex >= count) {
    room.currentTurnIndex = ((room.currentTurnIndex % count) + count) % count;
  }

  // 旧计时器闭包持有已离场玩家的 token（超时随机剪线校验会失配导致死锁），必须换新计时器
  clearInterval(room.timer);
  broadcastRoom(room);
  startTurnTimer(room, io, broadcastRoom);
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  cutWire,
  onPlayerRemoved
};
