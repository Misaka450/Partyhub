// =========================================================================
// 🍕 《切披萨 50:50 / 完美二等分》核心游戏引擎与高阶程序化几何生成系统
// =========================================================================

// 工具：数组随机抽取
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 归一化并居中：将任意生成的多边形点集缩放至 targetSize 并居中平移到 (0.5, 0.5)
// 保证所有顶点严格落在 [0.12, 0.88] 视口安全区内
function normalizeAndCenter(points, targetSize = 0.64) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const w = maxX - minX;
  const h = maxY - minY;
  const curSize = Math.max(w, h) || 1;
  const scale = targetSize / curSize;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return points.map(p => ({
    x: parseFloat((0.5 + (p.x - cx) * scale).toFixed(4)),
    y: parseFloat((0.5 + (p.y - cy) * scale).toFixed(4))
  }));
}

// 多边形旋转变换
function rotatePoints(points, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  }));
}

// =========================================================================
// 🍕 参数化意式经典与特色披萨形状生成器（每次微扰动与旋转均随机）
// =========================================================================

// 1. 经典手抛意式圆披萨 (带手工面团微扰动与起伏黑焦边)
function makeClassicCircle() {
  const N = 26;
  const points = [];
  const rippleFreq = 8 + Math.floor(Math.random() * 4);
  const rippleAmp = 0.008 + Math.random() * 0.015;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.35 + (Math.random() - 0.5) * 0.025 + Math.sin(rippleFreq * th) * rippleAmp;
    points.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
  }
  const names = ['经典手抛意式圆披萨', '那不勒斯老面石烤披萨', '经典玛格丽塔薄底披萨'];
  return { name: pick(names), points: normalizeAndCenter(points, 0.65) };
}

// 2. 托斯卡纳长条椭圆薄饼 (Longboard Oval)
function makeOvalLongboard() {
  const N = 28;
  const points = [];
  const stretch = 1.35 + (Math.random() - 0.5) * 0.2;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.32 + (Math.random() - 0.5) * 0.02 + Math.sin(10 * th) * 0.008;
    points.push({ x: Math.cos(th) * r * stretch, y: Math.sin(th) * r });
  }
  const rot = Math.random() * Math.PI;
  const names = ['托斯卡纳长条椭圆薄饼', '罗马长盘手揉披萨', '西西里橄榄木烤长饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.68) };
}

// 3. 罗马方型厚底披萨 (al Taglio，带倒圆角与手工凹凸)
function makeRomanQuad() {
  const points = [];
  const w = 0.34 + (Math.random() - 0.5) * 0.06;
  const h = 0.28 + (Math.random() - 0.5) * 0.06;
  const cornerR = 0.06;
  const stepsPerCorner = 4;
  const corners = [
    { cx: w - cornerR, cy: h - cornerR, startA: 0 },
    { cx: -w + cornerR, cy: h - cornerR, startA: Math.PI * 0.5 },
    { cx: -w + cornerR, cy: -h + cornerR, startA: Math.PI },
    { cx: w - cornerR, cy: -h + cornerR, startA: Math.PI * 1.5 }
  ];
  corners.forEach(c => {
    for (let i = 0; i <= stepsPerCorner; i++) {
      const a = c.startA + (i / stepsPerCorner) * (Math.PI * 0.5);
      const r = cornerR + (Math.random() - 0.5) * 0.008;
      points.push({ x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r });
    }
  });
  const rot = (Math.random() - 0.5) * 0.6;
  const names = ['罗马方型厚底披萨 (al Taglio)', '佛卡夏方形烤盘厚饼', '意式方块金黄脆饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 4. 纽约巨无霸三角切片 (NY Slice)
function makeNYSlice() {
  const points = [];
  const N_crust = 14;
  const spreadAngle = 1.15 + (Math.random() - 0.5) * 0.15;
  for (let i = 0; i <= N_crust; i++) {
    const a = -spreadAngle / 2 + (i / N_crust) * spreadAngle + Math.PI * 0.5;
    const r = 0.40 + (Math.random() - 0.5) * 0.015;
    points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  points.push({ x: 0, y: -0.25 });
  const rot = Math.random() * Math.PI * 2;
  const names = ['纽约巨无霸三角切片', '曼哈顿工匠折角切片', '布鲁克林经典大角披萨'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.68) };
}

// 5. 金黄那不勒斯半月披萨饺 (Calzone)
function makeCalzone() {
  const points = [];
  const N_arc = 18;
  for (let i = 0; i <= N_arc; i++) {
    const th = (i / N_arc) * Math.PI;
    const r = 0.35 + Math.sin(th) * 0.05 + (Math.random() - 0.5) * 0.015;
    points.push({ x: Math.cos(th) * r * 1.15, y: Math.sin(th) * r });
  }
  const N_crimp = 10;
  for (let i = 1; i < N_crimp; i++) {
    const t = i / N_crimp;
    const x = (1 - t) * (-0.35 * 1.15) + t * (0.35 * 1.15);
    const y = Math.sin(t * Math.PI * 4) * 0.02 - 0.02;
    points.push({ x, y });
  }
  const rot = Math.random() * Math.PI * 2;
  const names = ['金黄那不勒斯半月披萨饺 (Calzone)', '托斯卡纳折叠月牙披萨', '意式传统烤馅半月饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.66) };
}

// 6. 星形花冠披萨 (Stella di Napoli)
function makeStarCrust() {
  const points = [];
  const tips = Math.random() < 0.5 ? 5 : 6;
  const N = tips * 6;
  const rOuter = 0.36;
  const rInner = 0.22 + (Math.random() - 0.5) * 0.02;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const wave = (Math.cos(tips * th) + 1) / 2;
    const r = rInner + (rOuter - rInner) * Math.pow(wave, 1.35) + (Math.random() - 0.5) * 0.01;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const rot = Math.random() * Math.PI * 2;
  return { name: `${tips}角花冠星形披萨 (Stella di Napoli)`, points: normalizeAndCenter(rotatePoints(points, rot), 0.66) };
}

// 7. 情人节爱心玛格丽塔 (Sweetheart Heart)
function makeSweetheart() {
  const points = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push({ x: x * 0.02, y: -y * 0.02 });
  }
  const rot = (Math.random() - 0.5) * 0.35;
  const names = ['情人节心形玛格丽塔', '甜蜜爱心意式薄饼', '双心芝士手抛披萨'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 8. 幸运四叶草脆皮披萨 (Lucky Clover)
function makeLuckyClover() {
  const points = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.25 + 0.10 * Math.abs(Math.cos(2 * th)) + (Math.random() - 0.5) * 0.01;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const rot = Math.random() * Math.PI * 2;
  const names = ['幸运四叶草脆皮披萨', '翡翠四叶草意式烤饼', '四瓣花形那不勒斯饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 9. 萌趣小熊芝士厚饼 (Teddy Bear / Cat Ears)
function makeTeddyEars() {
  const points = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    let r = 0.30;
    const ear1Dist = Math.abs(th - Math.PI * 0.3);
    const ear2Dist = Math.abs(th - Math.PI * 0.7);
    if (ear1Dist < 0.35) r += Math.cos((ear1Dist / 0.35) * Math.PI * 0.5) * 0.09;
    if (ear2Dist < 0.35) r += Math.cos((ear2Dist / 0.35) * Math.PI * 0.5) * 0.09;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const rot = (Math.random() - 0.5) * 0.35;
  const names = ['萌趣小熊芝士厚饼', '猫咪耳朵手作披萨', '童趣双耳小熊烤饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 10. 西西里金枪小鱼披萨 (Little Fish)
function makeLittleFish() {
  const points = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    let r = 0.28;
    const tailDist = Math.abs(th - Math.PI);
    if (tailDist < 0.55) {
      r += Math.cos((tailDist / 0.55) * Math.PI * 0.5) * 0.12;
    }
    points.push({ x: Math.cos(th) * r * 1.35, y: Math.sin(th) * r });
  }
  const rot = Math.random() * Math.PI * 2;
  const names = ['西西里金枪小鱼披萨', '海洋之星金鳟薄饼', '地中海小飞鱼脆饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.68) };
}

// 11. 盛夏向日葵多花瓣披萨 (Sunflower / Daisy)
function makeSunflower() {
  const points = [];
  const petals = 8 + Math.floor(Math.random() * 3);
  const N = petals * 4;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.28 + 0.06 * Math.sin(petals * th) + (Math.random() - 0.5) * 0.01;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const rot = Math.random() * Math.PI * 2;
  const names = ['盛夏向日葵多花瓣披萨', '太阳神花冠意式薄饼', '金秋雏菊芝士花饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 12. 中世纪骑士盾牌披萨 (Medieval Shield)
function makeKnightShield() {
  const points = [];
  const N_top = 10;
  for (let i = 0; i <= N_top; i++) {
    const t = i / N_top;
    const x = -0.32 + t * 0.64;
    const y = 0.32 - Math.sin(t * Math.PI) * 0.04;
    points.push({ x, y });
  }
  const N_side = 14;
  for (let i = 1; i <= N_side; i++) {
    const t = i / N_side;
    const a = t * Math.PI * 0.5;
    const x = 0.32 * Math.cos(a);
    const y = 0.32 - 0.66 * Math.sin(a);
    points.push({ x, y });
  }
  for (let i = N_side - 1; i >= 1; i--) {
    const t = i / N_side;
    const a = t * Math.PI * 0.5;
    const x = -0.32 * Math.cos(a);
    const y = 0.32 - 0.66 * Math.sin(a);
    points.push({ x, y });
  }
  const rot = (Math.random() - 0.5) * 0.4;
  const names = ['中世纪骑士盾牌披萨', '圣殿骑士图腾薄饼', '王者荣耀盾形厚底饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.66) };
}

// 13. 威尼斯菱形脆皮佛卡夏 (Diamond Focaccia)
function makeDiamondFocaccia() {
  const points = [];
  const w = 0.38 + (Math.random() - 0.5) * 0.06;
  const h = 0.28 + (Math.random() - 0.5) * 0.06;
  const N_side = 7;
  const vertices = [{ x: 0, y: h }, { x: -w, y: 0 }, { x: 0, y: -h }, { x: w, y: 0 }];
  for (let v = 0; v < 4; v++) {
    const v1 = vertices[v];
    const v2 = vertices[(v + 1) % 4];
    for (let i = 0; i < N_side; i++) {
      const t = i / N_side;
      const x = (1 - t) * v1.x + t * v2.x + (Math.random() - 0.5) * 0.01;
      const y = (1 - t) * v1.y + t * v2.y + (Math.random() - 0.5) * 0.01;
      points.push({ x, y });
    }
  }
  const rot = Math.random() * Math.PI * 2;
  const names = ['威尼斯菱形脆皮佛卡夏', '钻石切面意式薄饼', '米兰菱格石烤披萨'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.66) };
}

// 14. 窑烤六边形蜂巢厚饼 (Hexagon Crust)
function makeHexagonCrust() {
  const points = [];
  const N_side = 5;
  const R = 0.34;
  for (let side = 0; side < 6; side++) {
    const a1 = (side / 6) * Math.PI * 2;
    const a2 = ((side + 1) / 6) * Math.PI * 2;
    const p1 = { x: Math.cos(a1) * R, y: Math.sin(a1) * R };
    const p2 = { x: Math.cos(a2) * R, y: Math.sin(a2) * R };
    for (let i = 0; i < N_side; i++) {
      const t = i / N_side;
      const x = (1 - t) * p1.x + t * p2.x + (Math.random() - 0.5) * 0.012;
      const y = (1 - t) * p1.y + t * p2.y + (Math.random() - 0.5) * 0.012;
      points.push({ x, y });
    }
  }
  const rot = Math.random() * Math.PI;
  const names = ['窑烤六边形蜂巢厚饼', '六方石砌意式披萨', '几何六棱工匠大饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 15. 松软白云奶酪泡泡饼 (Cloud Puff)
function makeCloudPuff() {
  const points = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.28 + 0.05 * Math.sin(5 * th) + 0.03 * Math.cos(3 * th) + (Math.random() - 0.5) * 0.01;
    points.push({ x: Math.cos(th) * r * 1.15, y: Math.sin(th) * r * 0.9 });
  }
  const rot = (Math.random() - 0.5) * 0.4;
  const names = ['松软白云奶酪泡泡饼', '云朵舒芙蕾厚底披萨', '天际浮云芝士烤饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// 16. 佛罗伦萨雪梨脆饼 (Pear/Gourd Shape)
function makePearGourd() {
  const points = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const factor = 1 + 0.28 * Math.sin(th);
    const r = 0.27 * factor + (Math.random() - 0.5) * 0.01;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const rot = (Math.random() - 0.5) * 0.5;
  const names = ['佛罗伦萨雪梨脆饼', '葫芦吉祥手揉披萨', '双球宝葫芦意式薄饼'];
  return { name: pick(names), points: normalizeAndCenter(rotatePoints(points, rot), 0.65) };
}

// =========================================================================
// ♾️ 纯数学多阶傅里叶复合谐波无限随机形态生成器 (Harmonic Procedural Blob)
// =========================================================================
function makeRandomHarmonic(difficulty = 1) {
  const k1 = 2 + Math.floor(Math.random() * (2 + Math.min(difficulty, 3) * 2));
  const k2 = 3 + Math.floor(Math.random() * (3 + Math.min(difficulty, 3) * 2));
  const a1 = 0.04 + Math.random() * (0.05 + difficulty * 0.025);
  const a2 = 0.02 + Math.random() * (0.04 + difficulty * 0.02);
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  const N = 36;
  const points = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 0.28 + a1 * Math.cos(k1 * th + p1) + a2 * Math.sin(k2 * th + p2) + Math.sin(16 * th) * 0.008;
    points.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const prefixes = ['窑炉手工', '老面发酵', '工匠手抛', '柴火石烤', '托斯卡纳', '米兰风味', '熔岩脆皮', '那不勒斯'];
  const shapeTerms = {
    2: '双耳扁圆', 3: '三棱三叶', 4: '四角十字', 5: '五芒海星', 6: '六棱雪花', 7: '异形波浪', 8: '多芒八角'
  };
  const suffixes = ['披萨', '佛卡夏', '薄脆面饼', '芝士烤饼'];
  const pfx = pick(prefixes);
  const term = shapeTerms[k1] || '奇趣多维';
  const sfx = pick(suffixes);
  const name = `${pfx} · ${term}${sfx}`;
  return { name, points: normalizeAndCenter(points, 0.65) };
}

// 完整生成器按轮次分级池
const ROUND1_GENERATORS = [
  makeClassicCircle, makeOvalLongboard, makeRomanQuad, makeCalzone,
  makeNYSlice, makeLuckyClover, makeDiamondFocaccia, () => makeRandomHarmonic(1)
];

const ROUND2_GENERATORS = [
  makeStarCrust, makeSweetheart, makeSunflower, makeKnightShield,
  makeHexagonCrust, makeTeddyEars, makeLittleFish, makePearGourd, () => makeRandomHarmonic(2)
];

const ALL_GENERATORS = [
  makeClassicCircle, makeOvalLongboard, makeRomanQuad, makeNYSlice, makeCalzone,
  makeStarCrust, makeSweetheart, makeLuckyClover, makeTeddyEars, makeLittleFish,
  makeSunflower, makeKnightShield, makeDiamondFocaccia, makeHexagonCrust,
  makeCloudPuff, makePearGourd,
  () => makeRandomHarmonic(2), () => makeRandomHarmonic(3)
];

// 多边形几何形状主生成入口
function generateShape(round = 1, usedNames = []) {
  let pool = ALL_GENERATORS;
  if (round === 1) pool = ROUND1_GENERATORS;
  else if (round === 2) pool = ROUND2_GENERATORS;

  // 优先选取未在本场游戏中出现过的形状生成器，避免连续重复
  const candidateFns = pool.slice();
  for (let attempt = 0; attempt < 8; attempt++) {
    const fn = pick(candidateFns);
    const shape = fn();
    if (!usedNames.includes(shape.name)) {
      return shape;
    }
  }

  // 兜底：直接纯算法无限多谐波生成
  return makeRandomHarmonic(Math.min(round, 3));
}

// =========================================================================
// 📐 几何计算与多边形切割算法
// =========================================================================

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

// =========================================================================
// 🎮 游戏生命周期与网络信令逻辑
// =========================================================================

function initRoomState(room) {
  room.gameType = 'perfect-slice';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentShape = null;
  room.usedShapeNames = [];
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
  room.usedShapeNames = [];
  startRound(room, io, broadcastRoom);
}

function pointInPolygon(point, vs) {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(p, v, w) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'perfect-slice') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'SLICE_CUTTING';
  room.usedShapeNames = room.usedShapeNames || [];
  room.currentShape = generateShape(room.round, room.usedShapeNames);
  room.usedShapeNames.push(room.currentShape.name);
  room.playerSlices = {};
  room.timeLeft = 12; // 12秒下刀时间
  room.roundStartTime = Date.now();

  // 1. 动态比例悬赏：第1轮50:50，第2轮30:70或40:60，第3轮多变悬赏
  let targetRatio = 50.0;
  if (room.round === 2) {
    targetRatio = Math.random() < 0.5 ? 30.0 : 40.0;
  } else if (room.round >= 3) {
    const CANDIDATES = [20.0, 25.0, 30.0, 33.3, 40.0, 50.0];
    targetRatio = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];
  }
  room.targetRatio = targetRatio;
  room.currentShape.targetRatio = targetRatio;

  // 2. 避障刀法限制：第2轮以上生成 1~2 颗辣椒障碍
  const obstacles = [];
  if (room.round >= 2 || Math.random() < 0.4) {
    for (let attempt = 0; attempt < 35; attempt++) {
      const ox = 0.5 + (Math.random() - 0.5) * 0.42;
      const oy = 0.5 + (Math.random() - 0.5) * 0.42;
      if (pointInPolygon({ x: ox, y: oy }, room.currentShape.points)) {
        obstacles.push({
          id: 'obs_' + obstacles.length,
          x: parseFloat(ox.toFixed(3)),
          y: parseFloat(oy.toFixed(3)),
          r: 0.045,
          name: '🌶️ 辣椒'
        });
        if (obstacles.length >= (room.round >= 3 ? 2 : 1)) break;
      }
    }
  }
  room.currentShape.obstacles = obstacles;

  broadcastRoom(room);
  io.to(room.id).emit('slice_start_round', {
    round: room.round,
    maxRounds: room.maxRounds,
    shape: room.currentShape,
    targetRatio: room.targetRatio,
    timeLeft: room.timeLeft
  });

  const ratioPrompt = targetRatio === 50.0
    ? '【50 : 50】二等分'
    : `【${targetRatio} : ${(100 - targetRatio).toFixed(1)}】悬赏比例`;
  const obsPrompt = obstacles.length > 0 ? ` ⚠️ 切线不可触碰【${obstacles.length} 颗🌶️辣椒】！` : '';
  io.to(room.id).emit('system_message', `🍕 第 ${room.round}/${room.maxRounds} 轮：在屏幕上划一刀，将【${room.currentShape.name}】切出 ${ratioPrompt}！${obsPrompt}`);

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
  // 校验提交者真实在房：防止被踢/已退出玩家的幽灵提交污染数据（审计 R2-40）
  const submitter = room.players.find(p => p.token === playerToken);
  if (!submitter) return;

  // 校验切点坐标完整且是有限数字，防止缺字段崩溃或非数字绕过判定拿满分
  if (!p1 || !p2 ||
      typeof p1.x !== 'number' || !Number.isFinite(p1.x) ||
      typeof p1.y !== 'number' || !Number.isFinite(p1.y) ||
      typeof p2.x !== 'number' || !Number.isFinite(p2.x) ||
      typeof p2.y !== 'number' || !Number.isFinite(p2.y)) {
    return;
  }

  // 坐标范围钳制：切线端点应落在 [0,1] 归一化画布内。（审计 R2-13）
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const cleanP1 = { x: clamp01(p1.x), y: clamp01(p1.y) };
  const cleanP2 = { x: clamp01(p2.x), y: clamp01(p2.y) };

  const dist = Math.hypot(cleanP2.x - cleanP1.x, cleanP2.y - cleanP1.y);
  if (dist < 0.06) {
    io.to(submitter.id).emit('system_message', '⚠️ 下刀距离过短，请滑动划出一条完整切线！');
    return;
  }

  const timeTaken = Date.now() - (room.roundStartTime || Date.now());
  const { ratio1, ratio2, poly1, poly2 } = slicePolygon(room.currentShape.points, cleanP1, cleanP2);
  const cleanRatio1 = isNaN(ratio1) ? 50.0 : ratio1;
  const cleanRatio2 = isNaN(ratio2) ? 50.0 : ratio2;

  const targetRatio = room.targetRatio || 50.0;
  // 计算两块中任一块匹配目标比例的最小绝对误差
  const diff = Math.min(
    Math.abs(cleanRatio1 - targetRatio),
    Math.abs(cleanRatio2 - targetRatio)
  );

  // 避障检测：判断切线是否穿过了辣椒障碍
  let hitObstacle = false;
  if (room.currentShape.obstacles && room.currentShape.obstacles.length > 0) {
    for (const obs of room.currentShape.obstacles) {
      const d = distToSegment({ x: obs.x, y: obs.y }, cleanP1, cleanP2);
      if (d < obs.r) {
        hitObstacle = true;
        break;
      }
    }
  }

  // 基础分 100 - (diff * 15)，切中障碍扣 50 分惩罚
  let baseScore = Math.max(0, Math.round(100 - diff * 15));
  if (hitObstacle) {
    baseScore = Math.max(0, baseScore - 50);
  }

  room.playerSlices[playerToken] = {
    p1: cleanP1,
    p2: cleanP2,
    ratio1: parseFloat(cleanRatio1.toFixed(2)),
    ratio2: parseFloat(cleanRatio2.toFixed(2)),
    targetRatio,
    diff: parseFloat(diff.toFixed(2)),
    hitObstacle,
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
      targetRatio,
      diff: room.playerSlices[playerToken].diff,
      hitObstacle
    });
    if (hitObstacle) {
      io.to(player.id).emit('system_message', '⚠️ 刀刃切到了【🌶️ 辣椒】！避障失败扣除 50 分！');
    }
  }

  broadcastRoom(room);

  // 检查是否全员已切完
  const activePlayers = room.players.filter(p => !p.offlineTimer);
  const allSubmitted = activePlayers.length > 0 && activePlayers.every(p => room.playerSlices[p.token] !== undefined);
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

  sorted.forEach(([token, sliceData]) => {
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
  startRound,
  submitSlice,
  endRound,
  endGame,
  generateShape,
  slicePolygon,
  polygonArea
};
