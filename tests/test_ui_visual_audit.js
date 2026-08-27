/**
 * PartyHub 全游戏 UI 视觉自动化审计套件（无头浏览器 / CDP）
 * ------------------------------------------------------------------
 * 目标：系统检测 12 款聚会游戏 + 登录页 + 大厅 的视觉呈现问题，覆盖：
 *   1. 布局错乱 / 元素错位（水平溢出、元素越界、舞台高度塌陷、元素重叠）
 *   2. 字体显示异常（文字被裁切、字号过小）
 *   3. 颜色渲染错误（文字/背景对比度不足、文字不可见）
 *   4. 响应式设计失效（多断点下布局异常）
 *   5. 交互元素功能异常（按钮过小、pointer-events 失效）
 *   6. JS 运行时错误（控制台异常）
 * 输出：tests/ui_audit_screens/*.png 截图 + tests/ui_audit_report.md / .json 报告
 *
 * 仅依赖 Node 内置模块 + 项目已安装的 ws。通过 Chrome DevTools Protocol 驱动
 * 本机无头 Edge / Chrome，无需额外安装 Playwright/Puppeteer。
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ============ 配置 ============
const APP_URL = 'http://127.0.0.1:8080';
const OUT_DIR = path.join(__dirname, 'ui_audit_screens');
const REPORT_MD = path.join(__dirname, 'ui_audit_report.md');
const REPORT_JSON = path.join(__dirname, 'ui_audit_report.json');

// 浏览器候选（本机实际存在的 Chromium 内核发行版）
const BROWSERS = [
  { name: 'Edge', exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', port: 9610, full: true },
  { name: 'Chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9611, full: false },
];

// 测试分辨率矩阵（设备像素）
const RESOLUTIONS = [
  { key: 'mobile_s', label: '手机竖屏 360x780', w: 360, h: 780, mobile: true },
  { key: 'mobile', label: '手机竖屏 390x844', w: 390, h: 844, mobile: true },
  { key: 'tablet', label: '平板 768x1024', w: 768, h: 1024, mobile: false },
  { key: 'laptop', label: '笔记本 1280x800', w: 1280, h: 800, mobile: false },
  { key: 'desktop', label: '桌面 1920x1080', w: 1920, h: 1080, mobile: false },
];
// 非 full 模式浏览器只跑代表性断点，控制总时长
const RES_SUBSET_KEYS = ['mobile', 'desktop'];

// 12 款游戏（与 server.js / index.html 的 gameType 对齐）
const GAMES = [
  { type: 'draw-guess', name: '你画我猜' },
  { type: 'undercover', name: '谁是卧底' },
  { type: 'avalon', name: '阿瓦隆' },
  { type: 'uno', name: 'UNO 优诺牌' },
  { type: 'flash-counter', name: '瞬间数羊' },
  { type: 'bomb-roulette', name: '拆弹轮盘赌' },
  { type: 'bulls-and-cows', name: '几A几B' },
  { type: 'math-24', name: '决战24点' },
  { type: 'cube-count', name: '3D数方块' },
  { type: 'word-bomb', name: '词汇炸弹' },
  { type: 'perfect-slice', name: '切披萨' },
  { type: 'hold-five', name: '盲压挑战' },
];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ 浏览器端检测逻辑 ============
// 该函数会被 toString() 后注入页面执行，返回 { issues, metrics }
function __uiAuditInPage() {
  const issues = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const push = (o) => { if (issues.length < 80) issues.push(o); };

  const INTER = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/;
  const isInteractive = (el) =>
    INTER.test(el.tagName) || el.classList.contains('btn') ||
    el.getAttribute('role') === 'button' || el.classList.contains('game-tile') ||
    el.classList.contains('avatar-option-btn');

  const isVisible = (el) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (parseFloat(st.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return true;
  };

  // 仅取元素自身直接文本（不含子元素文本），避免误判容器
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) t += n.textContent;
    }
    return t.trim();
  };

  const parseColor = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.8) return c;
      n = n.parentElement;
    }
    const body = parseColor(getComputedStyle(document.body).backgroundColor);
    return body && body.a > 0.8 ? body : { r: 255, g: 255, b: 255, a: 1 };
  };

  // 1) 水平滚动 / 横向溢出
  if (doc.scrollWidth > doc.clientWidth + 2) {
    push({ type: 'layout', severity: 'high', msg: '页面出现横向滚动条，内容溢出视口宽度',
      detail: 'scrollWidth=' + doc.scrollWidth + ' clientWidth=' + doc.clientWidth });
  }

  // 2) 舞台容器高度塌陷（游戏界面堆叠到底部的根因）
  document.querySelectorAll('.game-stage-container:not(.hidden)').forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.height < 120) {
      push({ type: 'layout', severity: 'critical', msg: '游戏舞台容器高度塌陷',
        detail: '#' + s.id + ' 高度仅 ' + Math.round(r.height) + 'px' });
    }
  });

  // 3) 遍历可见元素做通用检测
  const all = Array.from(document.querySelectorAll('body *')).slice(0, 1500);
  for (const el of all) {
    if (!isVisible(el)) continue;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const txt = ownText(el);
    const tag = el.tagName.toLowerCase();
    const idcls = (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

    // 3a 元素水平越界
    if (st.position !== 'fixed' && (r.right > vw + 3 || r.left < -3)) {
      if (txt || isInteractive(el)) {
        push({ type: 'layout', severity: 'high', msg: '元素超出视口水平边界（错位/溢出）',
          detail: '<' + tag + idcls + '> left=' + Math.round(r.left) + ' right=' + Math.round(r.right) + ' vw=' + vw });
      }
    }

    // 3b 文字被裁切（overflow hidden 且无 ellipsis）
    if (txt && (st.overflow === 'hidden' || st.overflowX === 'hidden' || st.overflow === 'clip')) {
      if (el.scrollWidth > el.clientWidth + 2 && st.textOverflow !== 'ellipsis') {
        push({ type: 'font', severity: 'medium', msg: '文字溢出容器被裁切且无省略号',
          detail: '<' + tag + idcls + '> 文本"' + txt.slice(0, 12) + '" scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth });
      }
    }

    // 3c 字号过小
    if (txt) {
      const fs = parseFloat(st.fontSize);
      if (fs < 9) push({ type: 'font', severity: 'high', msg: '字号过小难以阅读', detail: '<' + tag + idcls + '> ' + fs + 'px' });
      else if (fs < 10) push({ type: 'font', severity: 'medium', msg: '字号偏小', detail: '<' + tag + idcls + '> ' + fs + 'px' });
    }

    // 3d 文字/背景对比度
    if (txt) {
      const fg = parseColor(st.color);
      if (fg && fg.a > 0.5) {
        const cr = ratio(fg, bgOf(el));
        if (cr < 2.1) push({ type: 'color', severity: 'critical', msg: '文字与背景几乎同色，不可见',
          detail: '<' + tag + idcls + '> 对比度 ' + cr.toFixed(2) + ' 文本"' + txt.slice(0, 10) + '"' });
        else if (cr < 3) push({ type: 'color', severity: 'high', msg: '对比度不足(WCAG AA 以下)',
          detail: '<' + tag + idcls + '> 对比度 ' + cr.toFixed(2) });
        else if (cr < 4.5) push({ type: 'color', severity: 'medium', msg: '小字对比度偏低',
          detail: '<' + tag + idcls + '> 对比度 ' + cr.toFixed(2) });
      }
    }

    // 3e 交互元素尺寸过小 / 不可点击
    if (isInteractive(el)) {
      if (r.width < 24 || r.height < 22) {
        push({ type: 'interaction', severity: 'medium', msg: '可点击元素尺寸过小',
          detail: '<' + tag + idcls + '> ' + Math.round(r.width) + 'x' + Math.round(r.height) });
      }
      if (st.pointerEvents === 'none') {
        push({ type: 'interaction', severity: 'high', msg: '交互元素 pointer-events:none 无法点击',
          detail: '<' + tag + idcls + '>' });
      }
    }
  }

  // 4) 交互元素大面积重叠（数量可控时）
  const inter = Array.from(document.querySelectorAll('button, a, input, [role=button], .btn, .game-tile'))
    .filter(isVisible);
  if (inter.length <= 80) {
    for (let i = 0; i < inter.length; i++) {
      for (let j = i + 1; j < inter.length; j++) {
        const a = inter[i], b = inter[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const ox = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
        const oy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
        const ov = ox * oy;
        const minA = Math.min(ra.width * ra.height, rb.width * rb.height);
        if (minA > 0 && ov / minA > 0.6) {
          push({ type: 'layout', severity: 'medium', msg: '两个可点击元素大面积重叠',
            detail: a.tagName + (a.id ? '#' + a.id : '') + ' 与 ' + b.tagName + (b.id ? '#' + b.id : '') });
        }
      }
    }
  }

  // 5) canvas / img 渲染异常
  document.querySelectorAll('canvas').forEach((c) => {
    if (c.width === 0 || c.height === 0)
      push({ type: 'layout', severity: 'high', msg: 'Canvas 尺寸为 0 无法渲染', detail: '#' + (c.id || '') });
  });
  document.querySelectorAll('img').forEach((im) => {
    if (im.complete && im.naturalWidth === 0)
      push({ type: 'color', severity: 'medium', msg: '图片加载失败', detail: im.src.slice(0, 60) });
  });

  const stage = document.querySelector('.game-stage-container:not(.hidden)');
  return {
    issues,
    metrics: {
      vw, vh,
      scrollW: doc.scrollWidth, clientW: doc.clientWidth, bodyH: doc.scrollHeight,
      stageH: stage ? Math.round(stage.getBoundingClientRect().height) : null,
      ua: navigator.userAgent,
    },
  };
}

// ============ CDP 客户端 ============
class Tab {
  constructor(wsUrl, name) {
    this.name = name;
    this.ws = null;
    this.wsUrl = wsUrl;
    this.msgId = 1;
    this.pending = new Map();
    this.errors = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.id && this.pending.has(m.id)) {
          const { resolve: r, reject: rj } = this.pending.get(m.id);
          this.pending.delete(m.id);
          if (m.error) rj(new Error(JSON.stringify(m.error))); else r(m.result);
        }
        // 收集运行时异常与控制台错误
        if (m.method === 'Runtime.exceptionThrown') {
          const ex = m.params.exceptionDetails;
          this.errors.push('JS异常: ' + (ex.exception && ex.exception.description ? ex.exception.description.split('\n')[0] : ex.text));
        }
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
          this.errors.push('控制台错误: ' + m.params.entry.text.slice(0, 160));
        }
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const to = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); }, 30000);
      this.pending.set(id, { resolve: (v) => { clearTimeout(to); resolve(v); }, reject: (e) => { clearTimeout(to); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async enable() { await this.send('Page.enable'); await this.send('Runtime.enable'); await this.send('Log.enable'); }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('eval异常: ' + (res.exceptionDetails.text || JSON.stringify(res.exceptionDetails).slice(0, 200)));
    return res.result ? res.result.value : null;
  }
  async setMetrics(w, h, mobile) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  }
  async clearMetrics() { try { await this.send('Emulation.clearDeviceMetricsOverride'); } catch (e) {} }
  async screenshot(file, fullPage) {
    const params = { format: 'png' };
    if (fullPage) params.captureBeyondViewport = true;
    const res = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }
  close() { if (this.ws) { try { this.ws.close(); } catch (e) {} } }
}

function httpJson(method, port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method }, (res) => {
      let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } });
    });
    req.on('error', reject); req.end();
  });
}
async function createTarget(port, url) {
  return httpJson('PUT', port, '/json/new?' + encodeURIComponent(url));
}
async function closeTarget(port, id) {
  try { await httpJson('GET', port, '/json/close/' + id); } catch (e) {}
}
async function launchBrowser(exe, port) {
  const udd = path.join(__dirname, '.profile_' + port);
  const proc = spawn(exe, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--disable-extensions', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + udd, 'about:blank',
  ], { stdio: 'ignore' });
  // 等待调试端口就绪
  for (let i = 0; i < 40; i++) {
    try { const v = await httpJson('GET', port, '/json/version'); if (v && v.webSocketDebuggerUrl) return proc; } catch (e) {}
    await sleep(500);
  }
  throw new Error('浏览器调试端口未就绪: ' + exe);
}

// ============ 审计场景 ============
async function auditScenario(tab, meta, results) {
  let out = { issues: [], metrics: null };
  try { out = await tab.eval('(' + __uiAuditInPage.toString() + ')()'); }
  catch (e) { out.issues = [{ type: 'error', severity: 'critical', msg: '审计脚本执行失败', detail: e.message }]; }
  const errs = tab.errors.slice(0, 8);
  tab.errors = [];
  const shot = path.join(OUT_DIR, meta.file + '.png');
  try { await tab.screenshot(shot, meta.fullPage || false); } catch (e) {}
  results.push({
    browser: meta.browser, resolution: meta.resolution, scenario: meta.scenario,
    game: meta.game || null, issues: out.issues, jsErrors: errs,
    metrics: out.metrics, screenshot: path.relative(path.join(__dirname, '..'), shot).replace(/\\/g, '/'),
  });
  const n = out.issues.length + errs.length;
  console.log('  [' + meta.browser + '/' + meta.resolution + '] ' + meta.scenario + (meta.game ? '/' + meta.game : '') + ' -> ' + (n === 0 ? '✓ 无问题' : '⚠ ' + n + ' 个问题'));
}

// 打开一个新 target 并连接为 Tab，等待页面就绪条件
async function openTab(b, waitForExpr) {
  const target = await createTarget(b.port, APP_URL);
  const tab = new Tab(target.webSocketDebuggerUrl, target.id);
  tab.targetId = target.id;
  await tab.connect();
  await tab.enable();
  await tab.eval(waitForExpr);
  return tab;
}

// 等待页面全局变量就绪的注入表达式
// 注意：socket / currentRoomState 是脚本顶层 const/let 绑定，并非 window 属性，
// 因此必须用 typeof 探测裸标识符，不能用 window.socket（否则永远取不到值）。
const WAIT_DOM = "(function(){return new Promise(function(res){var i=setInterval(function(){if(document.getElementById('player-name') && typeof socket!=='undefined' && socket){clearInterval(i);res(1)}},200);});})()";
const WAIT_SOCKET = "(function(){return new Promise(function(res){var i=setInterval(function(){if(typeof socket!=='undefined' && socket){clearInterval(i);res(1)}},200);});})()";

// 单个分辨率下的完整审计会话（登录页 + 大厅 + 12 款游戏）
async function runResolution(b, res, results) {
  console.log('\n--- [' + b.name + '] 分辨率 ' + res.label + ' ---');
  const openTabs = [];
  try {
    // A. 登录页（未加入房间的独立首屏）
    const login = await openTab(b, WAIT_DOM);
    openTabs.push(login);
    await login.setMetrics(res.w, res.h, res.mobile);
    await sleep(700);
    await auditScenario(login, { browser: b.name, resolution: res.key, scenario: '登录页', file: b.name + '_' + res.key + '_login', fullPage: true }, results);

    // B. 5 人房间：满足所有游戏最低开局人数（卧底≥3、拆弹/词汇/画猜≥2、阿瓦隆/UNO=5）
    const roomId = 'UI_' + b.name + '_' + res.key + '_' + Math.floor(Math.random() * 9000 + 1000);
    const names = ['房主小马', '玩家小明', '玩家小红', '玩家小华', '玩家小刚'];
    const avatars = ['🐱', '🐶', '🦊', '🐼', '🐨'];

    const host = await openTab(b, WAIT_DOM);
    openTabs.push(host);
    await host.setMetrics(res.w, res.h, res.mobile);
    await host.eval("(function(){ myPlayerToken='tk_host_" + roomId + "'; document.getElementById('player-name').value='" + names[0] + "'; document.getElementById('room-id').value='" + roomId + "'; socket.emit('join_room',{roomId:'" + roomId + "',playerName:'" + names[0] + "',avatar:'" + avatars[0] + "',playerToken:myPlayerToken}); return 1;})()");
    await sleep(800);

    for (let i = 1; i < 5; i++) {
      const gt = await openTab(b, WAIT_SOCKET);
      openTabs.push(gt);
      await gt.setMetrics(res.w, res.h, res.mobile);
      await gt.eval("(function(){ myPlayerToken='tk_" + i + "_" + roomId + "'; socket.emit('join_room',{roomId:'" + roomId + "',playerName:'" + names[i] + "',avatar:'" + avatars[i] + "',playerToken:myPlayerToken}); return 1;})()");
      await sleep(300);
    }
    // 等待 5 人齐（currentRoomState 为顶层 let，用裸标识符探测；超时不致命，仅记录）
    await host.eval("(function(){return new Promise(function(res){var s=Date.now();var i=setInterval(function(){if(typeof currentRoomState!=='undefined'&&currentRoomState&&currentRoomState.players&&currentRoomState.players.length>=5){clearInterval(i);res('ok')}if(Date.now()-s>12000){clearInterval(i);res('timeout')}},300);});})()").then((v) => { if (v === 'timeout') console.log('  ⚠ 5人集结超时，继续审计'); });
    await sleep(600);
    await auditScenario(host, { browser: b.name, resolution: res.key, scenario: '游戏大厅', file: b.name + '_' + res.key + '_lobby', fullPage: true }, results);

    // C. 逐款游戏开局审计（房主视角舞台）
    for (const g of GAMES) {
      await host.eval("(function(){socket.emit('back_to_lobby');return 1;})()");
      await sleep(500);
      await host.eval("(function(){socket.emit('switch_game',{gameType:'" + g.type + "'});return 1;})()");
      await sleep(600);
      await host.eval("(function(){socket.emit('start_game');return 1;})()");
      await sleep(1100);
      await auditScenario(host, { browser: b.name, resolution: res.key, scenario: '游戏舞台', game: g.name + '(' + g.type + ')', file: b.name + '_' + res.key + '_' + g.type }, results);
    }
  } finally {
    // 关闭本分辨率所有 tab 与 target，避免状态串扰
    for (const t of openTabs) {
      t.close();
      if (t.targetId) await closeTarget(b.port, t.targetId);
    }
  }
}

async function runBrowser(b, results) {
  console.log('\n==========================================');
  console.log('🌐 启动 ' + b.name + ' 无头浏览器 (CDP 端口 ' + b.port + ')');
  console.log('==========================================');
  let proc;
  try { proc = await launchBrowser(b.exe, b.port); }
  catch (e) { console.error('无法启动 ' + b.name + ': ' + e.message); return; }

  const resolutions = b.full ? RESOLUTIONS : RESOLUTIONS.filter((r) => RES_SUBSET_KEYS.includes(r.key));
  try {
    for (const res of resolutions) {
      try { await runResolution(b, res, results); }
      catch (err) {
        console.error('  ❌ [' + b.name + '/' + res.key + '] 会话失败: ' + err.message);
        results.push({ browser: b.name, resolution: res.key, scenario: '会话级失败', game: null, issues: [{ type: 'error', severity: 'critical', msg: '该分辨率会话整体失败', detail: err.message }], jsErrors: [], metrics: null, screenshot: null });
      }
    }
  } finally {
    proc.kill();
    await sleep(800);
    try { fs.rmSync(path.join(__dirname, '.profile_' + b.port), { recursive: true, force: true }); } catch (e) {}
  }
}

async function main() {
  console.log('PartyHub UI 视觉自动化审计 启动');
  const results = [];
  for (const b of BROWSERS) {
    if (!fs.existsSync(b.exe)) { console.log('跳过 ' + b.name + '（未找到可执行文件）'); continue; }
    await runBrowser(b, results);
  }
  writeReport(results);
  console.log('\n完成。报告: ' + REPORT_MD);
}

function writeReport(results) {
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const allIssues = [];
  results.forEach((r) => {
    r.issues.forEach((i) => allIssues.push({ ...i, browser: r.browser, resolution: r.resolution, scenario: r.scenario, game: r.game, screenshot: r.screenshot }));
    r.jsErrors.forEach((e) => allIssues.push({ type: 'error', severity: 'critical', msg: 'JS运行时错误', detail: e, browser: r.browser, resolution: r.resolution, scenario: r.scenario, game: r.game, screenshot: r.screenshot }));
  });
  allIssues.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));

  const bySev = { critical: 0, high: 0, medium: 0, low: 0 };
  allIssues.forEach((i) => { bySev[i.severity] = (bySev[i.severity] || 0) + 1; });

  let md = '# PartyHub UI 视觉自动化测试报告\n\n';
  md += '- 生成时间: ' + new Date().toLocaleString('zh-CN') + '\n';
  md += '- 被测地址: ' + APP_URL + '\n';
  md += '- 浏览器: ' + BROWSERS.map((b) => b.name + (b.full ? '(全量5断点)' : '(抽样2断点)')).join(', ') + '\n';
  md += '- 分辨率: ' + RESOLUTIONS.map((r) => r.label).join(' | ') + '\n';
  md += '- 场景: 登录页 + 游戏大厅 + 12 款游戏舞台\n';
  md += '- 审计截图数: ' + results.length + '\n\n';
  md += '## 问题统计\n\n';
  md += '| 严重程度 | 数量 |\n|---|---|\n';
  md += '| 🔴 Critical | ' + bySev.critical + ' |\n| 🟠 High | ' + bySev.high + ' |\n| 🟡 Medium | ' + bySev.medium + ' |\n| ⚪ Low | ' + bySev.low + ' |\n\n';
  md += '## 问题明细\n\n';
  if (allIssues.length === 0) {
    md += '✅ 未检测到视觉问题。\n';
  } else {
    md += '| # | 严重度 | 类型 | 浏览器 | 分辨率 | 场景/游戏 | 问题 | 详情 | 截图 |\n|---|---|---|---|---|---|---|---|---|\n';
    allIssues.slice(0, 400).forEach((i, idx) => {
      md += '| ' + (idx + 1) + ' | ' + i.severity + ' | ' + i.type + ' | ' + i.browser + ' | ' + i.resolution + ' | ' + (i.game || i.scenario) + ' | ' + i.msg + ' | ' + (i.detail || '').replace(/\|/g, '/').slice(0, 120) + ' | ' + i.screenshot + ' |\n';
    });
  }
  md += '\n## 复现步骤（通用）\n\n';
  md += '1. 启动服务: `npm start`（监听 8080）\n';
  md += '2. 打开测试脚本生成的截图目录 `tests/ui_audit_screens/`，文件名格式 `<浏览器>_<分辨率>_<场景>.png`\n';
  md += '3. 在浏览器开发者工具中将视口设为对应分辨率，访问 http://localhost:8080，加入房间 `UIAUDIT_xxx`，房主切换到对应游戏并开局，即可复现截图中的布局/对比度问题\n';
  md += '\n## 环境限制说明\n\n';
  md += '- 本机可用无头浏览器为 Edge 与 Chrome，二者均为 Chromium/Blink 内核；未安装 Firefox(Gecko) 与 Safari(WebKit)，故无法覆盖非 Blink 内核渲染差异。\n';
  md += '- 字体渲染依赖本机已装字体（Segoe UI / 微软雅黑 / Segoe UI Emoji），headless 下 emoji 与中文显示与真机移动端可能存在细微差异，建议对 high/critical 截图做人工复核。\n';

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), summary: bySev, results }, null, 2), 'utf8');
  console.log('\n===== 汇总 =====');
  console.log('Critical: ' + bySev.critical + '  High: ' + bySev.high + '  Medium: ' + bySev.medium + '  Low: ' + bySev.low);
}

main().catch((e) => { console.error(e); process.exit(1); });
