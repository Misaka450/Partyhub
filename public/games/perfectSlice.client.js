/**
 * perfectSlice.client.js
 * ============================================================================
 * 【切披萨 50:50 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 原本切披萨游戏的画线、披萨图案生成、碰撞检测和动画共有 760 多行，
 * 全部挤在 game.js 里面，导致整个项目的主脚本像滚雪球一样越来越庞大。
 * 
 * 现在我们通过【前端插件规范】将它抽离出来：
 * 1. 它拥有完全独立的作用域，里面的变量（比如 sliceAnimFrame 等）绝不会和其他游戏打架；
 * 2. 对外注册到 window.PartyGames['perfect-slice']；
 * 3. 当房间切换到切披萨时，主控只需一行代码调用它的 renderState 即可！
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  // 切割与动画局部状态（封装在模块内部，不污染全局）
  let sliceAnimFrame = null;
  let currentSliceSplitState = null;
  let currentSliceShape = null;
  let hasSubmittedSlice = false;
  let isSlicing = false;
  let sliceStartPos = null;
  let sliceCurrentPos = null;

  // DOM 元素引用缓存
  let sliceCanvas = null;
  let sliceCtx = null;
  let sliceCutPrompt = null;
  let sliceResultBadge = null;
  let sliceRatioText = null;
  let sliceDiffText = null;
  let wordHintBox = null;
  let displayRoundTag = null;
  let displayRound = null;

  // 初始化 DOM 引用
  function ensureDomElements() {
    if (!sliceCanvas) sliceCanvas = document.getElementById('slice-canvas');
    if (!sliceCtx && sliceCanvas) sliceCtx = sliceCanvas.getContext('2d');
    if (!sliceCutPrompt) sliceCutPrompt = document.getElementById('slice-cut-prompt');
    if (!sliceResultBadge) sliceResultBadge = document.getElementById('slice-result-badge');
    if (!sliceRatioText) sliceRatioText = document.getElementById('slice-ratio-text');
    if (!sliceDiffText) sliceDiffText = document.getElementById('slice-diff-text');
    if (!wordHintBox) wordHintBox = document.getElementById('word-hint-box');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function initSliceCanvasResolution() {
    ensureDomElements();
    const { w, h } = window.fitCanvasResolution ? window.fitCanvasResolution(sliceCanvas, null, 360, 360, 500) : { w: 360, h: 360 };
    if (sliceCtx) {
      const dpr = window.devicePixelRatio || 1;
      sliceCtx.setTransform(1, 0, 0, 1, 0, 0);
      sliceCtx.scale(dpr, dpr);
    }
    return { w, h };
  }

  // 伪随机生成器，根据披萨多边形特征产生固定种子（确保每一局各玩家看到的食物纹理完全一致）
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

    // 2. 烘烤金黄酥脆外皮
    const centroid = computePolygonCentroid(pts);
    const cx = centroid.x * width;
    const cy = centroid.y * height;
    const crustGrad = c.createRadialGradient(cx, cy, 15, cx, cy, Math.max(width, height) * 0.45);
    crustGrad.addColorStop(0, '#d97706');
    crustGrad.addColorStop(0.65, '#b45309');
    crustGrad.addColorStop(1, '#78350f');

    c.fillStyle = crustGrad;
    c.fill();

    // 3. 芝士与番茄红酱层
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

    // 4. 饼边烘焙豹纹黑焦斑
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
            // 意式辣肉肠
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
            // 鲜罗勒嫩叶
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
            // 黑橄榄切片
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
            // 樱桃番茄片
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

          // 现磨黑胡椒碎
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

    // 端点瞄准环
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

      drawArtisanPizzaPiece(c, poly1, width, height, seed, -nx * currentOffset, -ny * currentOffset, true);
      drawArtisanPizzaPiece(c, poly2, width, height, seed + 999, nx * currentOffset, ny * currentOffset, true);

      if (offsetProgress > 0.3) {
        const alpha = Math.min(1, (offsetProgress - 0.3) * 1.8);
        const c1 = computePolygonCentroid(poly1);
        const c2 = computePolygonCentroid(poly2);
        
        drawPercentageBadge(c, c1.x * width - nx * currentOffset, c1.y * height - ny * currentOffset, ratio1, alpha);
        drawPercentageBadge(c, c2.x * width + nx * currentOffset, c2.y * height + ny * currentOffset, ratio2, alpha);
      }
    } else {
      drawArtisanPizzaPiece(c, shape.points, width, height, seed, 0, 0, false);

      if (shape.obstacles && shape.obstacles.length > 0) {
        shape.obstacles.forEach(obs => {
          const ox = obs.x * width;
          const oy = obs.y * height;
          const or = obs.r * Math.min(width, height);

          c.save();
          c.beginPath();
          c.arc(ox, oy, or * 1.2, 0, Math.PI * 2);
          c.fillStyle = 'rgba(239, 68, 68, 0.25)';
          c.fill();
          c.strokeStyle = '#ef4444';
          c.lineWidth = 1.5;
          c.setLineDash([3, 3]);
          c.stroke();

          c.font = `${Math.round(or * 1.6)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('🌶️', ox, oy);
          c.restore();
        });
      }
    }

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

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    if (sliceAnimFrame) cancelAnimationFrame(sliceAnimFrame);

    const startTime = performance.now();
    const duration = 450;

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

  function getSlicePos(e) {
    ensureDomElements();
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

  // 绑定触控与鼠标切割交互
  function bindTouchEvents() {
    ensureDomElements();
    if (!sliceCanvas || sliceCanvas._eventsBound) return;
    sliceCanvas._eventsBound = true;

    sliceCanvas.addEventListener('mousedown', (e) => {
      if (hasSubmittedSlice || !currentSliceShape) return;
      isSlicing = true;
      sliceStartPos = getSlicePos(e);
      sliceCurrentPos = sliceStartPos;
    });

    sliceCanvas.addEventListener('mousemove', (e) => {
      if (!isSlicing || hasSubmittedSlice) return;
      sliceCurrentPos = getSlicePos(e);
      const { w, h } = initSliceCanvasResolution();
      drawSliceShape(sliceCtx, currentSliceShape, w, h, {
        x1: sliceStartPos.x, y1: sliceStartPos.y,
        x2: sliceCurrentPos.x, y2: sliceCurrentPos.y
      });
    });

    window.addEventListener('mouseup', () => {
      if (!isSlicing || hasSubmittedSlice) return;
      isSlicing = false;
      if (sliceStartPos && sliceCurrentPos) {
        const dist = Math.hypot(sliceCurrentPos.x - sliceStartPos.x, sliceCurrentPos.y - sliceStartPos.y);
        if (dist > 0.1) {
          hasSubmittedSlice = true;
          if (sliceCutPrompt) sliceCutPrompt.classList.add('hidden');
          const socket = window.socket;
          if (socket) {
            socket.emit('slice_cut_submit', {
              p1: sliceStartPos,
              p2: sliceCurrentPos
            });
          }
          if (window.playSound) window.playSound('card');
          startSliceSplitAnimation(sliceStartPos, sliceCurrentPos, 50, 50);
        }
      }
    });

    sliceCanvas.addEventListener('touchstart', (e) => {
      if (hasSubmittedSlice || !currentSliceShape) return;
      e.preventDefault();
      isSlicing = true;
      sliceStartPos = getSlicePos(e);
      sliceCurrentPos = sliceStartPos;
    }, { passive: false });

    sliceCanvas.addEventListener('touchmove', (e) => {
      if (!isSlicing || hasSubmittedSlice) return;
      e.preventDefault();
      sliceCurrentPos = getSlicePos(e);
      const { w, h } = initSliceCanvasResolution();
      drawSliceShape(sliceCtx, currentSliceShape, w, h, {
        x1: sliceStartPos.x, y1: sliceStartPos.y,
        x2: sliceCurrentPos.x, y2: sliceCurrentPos.y
      });
    }, { passive: false });

    sliceCanvas.addEventListener('touchend', () => {
      if (!isSlicing || hasSubmittedSlice) return;
      isSlicing = false;
      if (sliceStartPos && sliceCurrentPos) {
        const dist = Math.hypot(sliceCurrentPos.x - sliceStartPos.x, sliceCurrentPos.y - sliceStartPos.y);
        if (dist > 0.1) {
          hasSubmittedSlice = true;
          if (sliceCutPrompt) sliceCutPrompt.classList.add('hidden');
          const socket = window.socket;
          if (socket) {
            socket.emit('slice_cut_submit', {
              p1: sliceStartPos,
              p2: sliceCurrentPos
            });
          }
          if (window.playSound) window.playSound('card');
          startSliceSplitAnimation(sliceStartPos, sliceCurrentPos, 50, 50);
        }
      }
    });
  }

  // 绑定来自服务端的切披萨专属事件
  function bindSocketEvents(socket) {
    if (!socket || socket._sliceBound) return;
    socket._sliceBound = true;

    socket.on('slice_start_round', (data) => {
      ensureDomElements();
      if (!sliceCanvas || !sliceCtx) return;
      if (sliceAnimFrame) cancelAnimationFrame(sliceAnimFrame);
      currentSliceSplitState = null;
      currentSliceShape = data.shape;
      hasSubmittedSlice = false;
      if (sliceResultBadge) sliceResultBadge.classList.add('hidden');
      if (sliceCutPrompt) sliceCutPrompt.classList.remove('hidden');

      const targetRatio = data.targetRatio || 50.0;
      const ratioPrompt = targetRatio === 50.0 ? '50:50 二等分' : `${targetRatio}:${(100 - targetRatio).toFixed(1)} 悬赏`;
      const obsPrompt = data.shape?.obstacles?.length ? ' · ⚠️避开🌶️' : '';
      if (wordHintBox) wordHintBox.textContent = `将【${data.shape.name}】切出【${ratioPrompt}】${obsPrompt}！剩余 ${data.timeLeft}s`;
      if (sliceCutPrompt) sliceCutPrompt.textContent = `划一刀切出 ${ratioPrompt}${obsPrompt}`;

      const { w, h } = initSliceCanvasResolution();
      drawSliceShape(sliceCtx, currentSliceShape, w, h);
      if (window.playSound) window.playSound('card');
    });

    socket.on('slice_cut_result', (data) => {
      ensureDomElements();
      if (window.playSound) window.playSound('tick');
      if (sliceRatioText) sliceRatioText.textContent = `${data.ratio1}% : ${data.ratio2}%`;
      if (sliceDiffText) {
        if (data.hitObstacle) {
          sliceDiffText.textContent = `💥 切中辣椒 (-50) · 误差 ±${data.diff}%`;
          sliceDiffText.style.background = 'rgba(239, 68, 68, 0.25)';
          sliceDiffText.style.borderColor = '#ef4444';
          sliceDiffText.style.color = '#f87171';
        } else {
          const target = data.targetRatio || 50;
          sliceDiffText.textContent = `目标 ${target}% · 误差 ±${data.diff}%`;
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
      
      if (sliceResultBadge) sliceResultBadge.classList.remove('hidden');
    });

    socket.on('slice_round_summary', (data) => {
      ensureDomElements();
      if (window.playSound) window.playSound('fanfare');
      let summaryHtml = '';
      if (data.summary && data.summary.length > 0) {
        summaryHtml = '<div style="display:grid;gap:6px;margin-top:6px;text-align:left;max-height:220px;overflow-y:auto">';
        data.summary.forEach((p, idx) => {
          const esc = window.escapeHtml || (s => s);
          summaryHtml += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
              <span>${idx === 0 ? '👑 ' : ''}${esc(p.avatar)} <b>${esc(p.name)}</b></span>
              <span style="font-weight:700;color:var(--accent-core)">${p.ratio} <small style="color:var(--text-muted);font-weight:normal">(${p.diff})</small></span>
            </div>
          `;
        });
        summaryHtml += '</div>';
      }
      if (window.showRevealModal) {
        window.showRevealModal(`🍕 本轮刀工榜首：【${data.bestCutter}】`, '50.0% : 50.0%', 4500, summaryHtml);
      }
    });

    socket.on('slice_game_over', (data) => {
      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: '🍕 切披萨 50:50 颁奖台',
          desc: '人肉激光切割大师诞生！',
          podium: data.podium || []
        });
      }
    });
  }

  // =====================【对外公开的游戏插件接口】=====================
  window.PartyGames['perfect-slice'] = {
    // 游戏初始化（绑定事件）
    init(socket) {
      bindTouchEvents();
      if (socket) bindSocketEvents(socket);
    },

    // 房间状态更新时渲染
    renderState(state) {
      ensureDomElements();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round}/${state.maxRounds} 轮`;

      if (state.status === 'SLICE_CUTTING') {
        if (wordHintBox) wordHintBox.textContent = `在屏幕上划一刀，将披萨二等分！剩余 ${state.timeLeft}s`;
        if (!hasSubmittedSlice && sliceCutPrompt) {
          sliceCutPrompt.classList.remove('hidden');
        }
      } else {
        if (sliceCutPrompt) sliceCutPrompt.classList.add('hidden');
      }
    }
  };
})();
