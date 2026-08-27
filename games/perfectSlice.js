// 多边形几何与切割算法
function generateShape(round = 1) {
  // 根据轮次生成不同难度形状 (点坐标在 0.1 ~ 0.9 之间)
  if (round === 1) {
    // 圆形 / 近似圆形多边形 (16边形)
    const points = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 0.35 + (Math.random() - 0.5) * 0.05;
      points.push({ x: 0.5 + Math.cos(angle) * r, y: 0.5 + Math.sin(angle) * r });
    }
    return { name: '经典披萨 (圆形)', points };
  } else if (round === 2) {
    // 梯形 / 不规则三角形
    const shapes = [
      { name: '斜角梯形', points: [{ x: 0.2, y: 0.75 }, { x: 0.8, y: 0.75 }, { x: 0.65, y: 0.25 }, { x: 0.35, y: 0.25 }] },
      { name: '披萨切片', points: [{ x: 0.5, y: 0.2 }, { x: 0.85, y: 0.8 }, { x: 0.15, y: 0.8 }] },
      { name: '五角不规则盾牌', points: [{ x: 0.5, y: 0.15 }, { x: 0.85, y: 0.4 }, { x: 0.7, y: 0.8 }, { x: 0.3, y: 0.8 }, { x: 0.15, y: 0.4 }] }
    ];
    return shapes[Math.floor(Math.random() * shapes.length)];
  } else {
    // L 型 / 不规则凹凸多边形
    const shapes = [
      { name: 'L 型奶酪', points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }] },
      { name: '心形松饼', points: [{ x: 0.5, y: 0.3 }, { x: 0.65, y: 0.15 }, { x: 0.85, y: 0.3 }, { x: 0.85, y: 0.55 }, { x: 0.5, y: 0.85 }, { x: 0.15, y: 0.55 }, { x: 0.15, y: 0.3 }, { x: 0.35, y: 0.15 }] }
    ];
    return shapes[Math.floor(Math.random() * shapes.length)];
  }
}

// 鞋带公式计算多边形面积
function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

// 直线切割多边形 (Sutherland-Hodgman)
function slicePolygon(points, p1, p2) {
  // 直线方程: Ax + By + C = 0
  const A = p2.y - p1.y;
  const B = p1.x - p2.x;
  const C = p2.x * p1.y - p1.x * p2.y;
  const EPS = 1e-7;

  function dist(p) {
    return A * p.x + B * p.y + C;
  }

  function intersect(a, b) {
    const da = dist(a);
    const db = dist(b);
    const t = da / (da - db);
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y)
    };
  }

  const poly1 = [];
  const poly2 = [];
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

  const areaTotal = polygonArea(points);
  const area1 = polygonArea(poly1);
  const area2 = polygonArea(poly2);

  if (areaTotal === 0 || (area1 + area2) === 0) return { ratio1: 50, ratio2: 50, poly1, poly2 };

  const ratio1 = (area1 / (area1 + area2)) * 100;
  const ratio2 = 100 - ratio1;

  return {
    ratio1: Math.min(ratio1, ratio2),
    ratio2: Math.max(ratio1, ratio2),
    poly1,
    poly2
  };
}

function initRoomState(room) {
  room.gameType = 'perfect-slice';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentShape = null;
  room.playerSlices = {}; // token -> { p1, p2, ratio1, ratio2, diff, score, timeTaken }
  room.timeLeft = 12;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'perfect-slice') return;
  if (room.players.length < 1) {
    io.to(room.id).emit('system_message', '至少需要 1 名玩家开始游戏！');
    return;
  }

  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.round = 1;
  startRound(room, io, broadcastRoom);
}

function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'perfect-slice') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'SLICE_CUTTING';
  room.currentShape = generateShape(room.round);
  room.playerSlices = {};
  room.timeLeft = 12; // 12秒下刀时间
  room.roundStartTime = Date.now();

  broadcastRoom(room);
  io.to(room.id).emit('slice_start_round', {
    round: room.round,
    maxRounds: room.maxRounds,
    shape: room.currentShape,
    timeLeft: room.timeLeft
  });

  io.to(room.id).emit('system_message', `🍕 第 ${room.round}/${room.maxRounds} 轮：在屏幕上划一刀，将【${room.currentShape.name}】完美 50:50 二等分！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitSlice(room, playerToken, p1, p2, io, broadcastRoom) {
  if (room.status !== 'SLICE_CUTTING') return;
  if (room.playerSlices[playerToken]) return; // 已下刀

  // 校验切点坐标完整且是有限数字，防止缺字段崩溃或非数字绕过判定拿满分
  if (!p1 || !p2 ||
      typeof p1.x !== 'number' || !Number.isFinite(p1.x) ||
      typeof p1.y !== 'number' || !Number.isFinite(p1.y) ||
      typeof p2.x !== 'number' || !Number.isFinite(p2.x) ||
      typeof p2.y !== 'number' || !Number.isFinite(p2.y)) {
    return;
  }

  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (dist < 0.06) {
    const player = room.players.find(p => p.token === playerToken);
    if (player) io.to(player.id).emit('system_message', '⚠️ 下刀距离过短，请滑动划出一条完整切线！');
    return;
  }

  const timeTaken = Date.now() - (room.roundStartTime || Date.now());
  const { ratio1, ratio2, poly1, poly2 } = slicePolygon(room.currentShape.points, p1, p2);
  const cleanRatio1 = isNaN(ratio1) ? 50.0 : ratio1;
  const cleanRatio2 = isNaN(ratio2) ? 50.0 : ratio2;
  const diff = Math.abs(50.0 - cleanRatio1); // 误差 (越小越好)

  // 基础分 100 - (diff * 15)
  const baseScore = Math.max(0, Math.round(100 - diff * 15));

  room.playerSlices[playerToken] = {
    p1,
    p2,
    ratio1: parseFloat(cleanRatio1.toFixed(2)),
    ratio2: parseFloat(cleanRatio2.toFixed(2)),
    diff: parseFloat(diff.toFixed(2)),
    baseScore,
    timeTaken,
    poly1,
    poly2
  };

  // 给该玩家发送即时反馈
  const player = room.players.find(p => p.token === playerToken);
  if (player) {
    io.to(player.id).emit('slice_cut_result', {
      ratio1: room.playerSlices[playerToken].ratio1,
      ratio2: room.playerSlices[playerToken].ratio2,
      diff: room.playerSlices[playerToken].diff
    });
  }

  broadcastRoom(room);

  // 检查是否全员已切完
  const allSubmitted = room.players.every(p => room.playerSlices[p.token] !== undefined);
  if (allSubmitted) {
    clearInterval(room.timer);
    endRound(room, io, broadcastRoom);
  }
}

function endRound(room, io, broadcastRoom) {
  room.status = 'SLICE_ROUND_RESULT';
  clearInterval(room.timer);

  // 按误差从小到大排序，前三名加速度奖
  const sorted = Object.entries(room.playerSlices)
    .sort((a, b) => a[1].diff - b[1].diff || a[1].timeTaken - b[1].timeTaken);

  sorted.forEach(([token, sliceData], rank) => {
    const player = room.players.find(p => p.token === token);
    if (player) {
      const accuracyBonus = sliceData.diff <= 0.5 ? 50 : (sliceData.diff <= 1.5 ? 20 : 0);
      const totalEarned = sliceData.baseScore + accuracyBonus;
      player.score += totalEarned;
      sliceData.earnedScore = totalEarned;
    }
  });

  const summary = room.players.map(p => {
    const s = room.playerSlices[p.token];
    return {
      token: p.token,
      name: p.name,
      avatar: p.avatar,
      ratio: s ? `${s.ratio1}% : ${s.ratio2}%` : '未下刀',
      diff: s ? `误差 ±${s.diff}%` : '--',
      earnedScore: s ? s.earnedScore : 0
    };
  });

  io.to(room.id).emit('slice_round_summary', {
    shape: room.currentShape,
    summary,
    bestCutter: sorted[0] ? room.players.find(p => p.token === sorted[0][0])?.name : '无'
  });

  io.to(room.id).emit('system_message', `🎯 本轮最佳刀工：【${sorted[0] ? room.players.find(p => p.token === sorted[0][0])?.name : '无'}】（误差仅 ±${sorted[0] ? sorted[0][1].diff : '--'}%）！`);
  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'perfect-slice' || room.status !== 'SLICE_ROUND_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round++;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 4500);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('slice_game_over', {
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  return {
    gameType: 'perfect-slice',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    shape: room.currentShape,
    slicedTokens: Object.keys(room.playerSlices || {})
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitSlice
};
