/**
 * ==============================================================================
 * 🔍 PartyHub 全站 UI 走查审计脚本 (多视口 × 双主题 × 对比度 × 点击目标)
 * ------------------------------------------------------------------------------
 * 用途：对登录页 / 大厅 / 游戏舞台进行截图取证 + 程序化体检，输出 JSON 问题清单。
 * 运行：node tests/ui_audit.js  （需先启动 npm start，端口 8080）
 * 产物：tests/screens/ui-audit/*.jpg + 控制台 JSON 报告
 * ==============================================================================
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

const CDP_PORT_BASE = 9460;
const SERVER_URL = 'http://127.0.0.1:8080';
const OUT_DIR = path.join(__dirname, 'screens', 'ui-audit');

// ---------- 基础工具 ----------
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// 创建一个 CDP 页面目标并返回连接封装
async function openPage(browserProc, port, url) {
  const target = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: `/json/new?${encodeURIComponent(url)}`, method: 'PUT'
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
  await wait(500);
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let idSeq = 0; const pending = new Map(); const events = [];
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++idSeq;
    pending.set(id, (msg) => msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    target, ws, send, events,
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300));
      return r.result && r.result.value;
    },
    async screenshot(name, quality = 82) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality });
      fs.writeFileSync(path.join(OUT_DIR, name + '.jpg'), Buffer.from(r.data, 'base64'));
      console.log('    📸 ' + name + '.jpg');
    },
    async setViewport(w, h, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    },
    async goto(u) {
      await send('Page.navigate', { url: u });
      // 等待页面加载稳定
      for (let i = 0; i < 20; i++) {
        await wait(300);
        try { if (await page.eval('document.readyState')) break; } catch (e) { /* 忽略 */ }
      }
      await wait(600);
    },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
  return page;
}

// 启动一个独立浏览器实例（独立 user-data-dir 实现身份隔离）
async function launchBrowser(port) {
  const browserPath = findBrowserPath();
  if (!browserPath) throw new Error('未探测到可用 Chromium/Edge 浏览器');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-audit-profile-'));
  const proc = spawn(browserPath, [
    '--headless', `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`, '--no-sandbox', '--disable-gpu',
    '--window-size=1500,1000', 'about:blank'
  ], { stdio: 'ignore' });
  await wait(1500);
  return proc;
}

// ---------- 页面内体检函数（字符串形式注入执行） ----------
const CHECK_HELPERS = `
// ---------- WCAG 对比度计算 ----------
function __relLum(r, g, b) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function __parseRgb(s) {
  const m = s.match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const p = m[1].split(',').map(x => parseFloat(x));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function __bgOf(el) {
  let cur = el;
  while (cur && cur !== document.documentElement) {
    const cs = getComputedStyle(cur);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return { gradient: true };
    const bg = __parseRgb(cs.backgroundColor);
    if (bg && bg.a > 0.85) return bg;
    cur = cur.parentElement;
  }
  return __parseRgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
}
function __contrast(fg, bg) {
  const l1 = __relLum(fg.r, fg.g, fg.b), l2 = __relLum(bg.r, bg.g, bg.b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// 对一组选择器做对比度体检，返回 {sel, ratio, fontSize, weight, gradientBg} 列表
function __auditContrast(selectors) {
  const out = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      const cs = getComputedStyle(el);
      const fg = __parseRgb(cs.color);
      if (!fg) return;
      const bg = __bgOf(el);
      const ratio = bg.gradient ? null : __contrast(fg, bg);
      out.push({ sel, text: el.textContent.trim().slice(0, 14), ratio: ratio === null ? null : Math.round(ratio * 100) / 100, fs: cs.fontSize, fw: cs.fontWeight, gradientBg: !!bg.gradient });
    });
  }
  return out;
}
// 检查可见按钮点击目标尺寸（WCAG 2.5.8 最小 24px，推荐 44px）
function __auditTapTargets() {
  const out = { fail: [], warn: [] };
  document.querySelectorAll('button, .btn, [role=button], .game-tile, .cat-pill').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const item = { cls: (el.className || el.tagName).toString().slice(0, 42), text: el.textContent.trim().slice(0, 10), w: Math.round(r.width), h: Math.round(r.height) };
    if (Math.min(r.width, r.height) < 24) out.fail.push(item);
    else if (Math.min(r.width, r.height) < 40) out.warn.push(item);
  });
  return out;
}
// 检查文本截断（scrollWidth 超出）
function __auditTruncation(selectors) {
  const out = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      if (el.offsetWidth === 0) return;
      if (el.scrollWidth > el.clientWidth + 2) {
        out.push({ sel, text: el.textContent.trim().slice(0, 16), need: el.scrollWidth, have: el.clientWidth });
      }
    });
  }
  return out;
}
// 检查页面横向溢出
function __hOverflow() {
  return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 2 };
}
`;

function checkScript(expr) { return CHECK_HELPERS + expr; }

// 从体检结果中提炼对比度问题（正文 <4.5，大字(≥18.66px bold 或 ≥24px) <3.0）
function pickContrastIssues(rows) {
  return rows.filter(r => {
    if (r.ratio === null) return false;
    const fs = parseFloat(r.fs); const bold = parseInt(r.fw) >= 600;
    const isLarge = fs >= 24 || (fs >= 18.66 && bold);
    const min = isLarge ? 3.0 : 4.5;
    return r.ratio < min;
  }).map(r => ({ sel: r.sel, text: r.text, ratio: r.ratio, fs: r.fs, fw: r.fw }));
}

// ---------- 主流程 ----------
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = { time: new Date().toISOString(), viewports: {}, issues: [] };
  const addIssue = (area, sev, desc, evidence) => report.issues.push({ area, severity: sev, desc, evidence });

  const VIEWPORTS = [
    { name: 'desktop-1440', w: 1440, h: 900, mobile: false },
    { name: 'tablet-834', w: 834, h: 1112, mobile: true },
    { name: 'mobile-414', w: 414, h: 896, mobile: true },
    { name: 'small-320', w: 320, h: 700, mobile: true }
  ];

  // ===== 实例 1：登录页 + 房主大厅 =====
  const b1 = await launchBrowser(CDP_PORT_BASE);
  const p1 = await openPage(b1, CDP_PORT_BASE, SERVER_URL);

  // --- 1. 登录页：4 视口 × 双主题 ---
  console.log('\n========== [1] 登录页体检 ==========');
  for (const theme of ['light', 'dark']) {
    await p1.eval(`try{localStorage.setItem('party_theme','${theme}')}catch(e){}`);
    for (const vp of VIEWPORTS) {
      await p1.setViewport(vp.w, vp.h, vp.mobile);
      await p1.goto(SERVER_URL);
      await wait(800);
      const key = `login-${vp.name}-${theme}`;
      const dock = await p1.eval(`JSON.stringify((function(){var d=document.querySelector('.pass-player-dock');var cs=getComputedStyle(d);var a=document.querySelector('.avatar-interactive-slot').getBoundingClientRect();var n=document.querySelector('.player-name-dock').getBoundingClientRect();var j=document.querySelector('#btn-join').getBoundingClientRect();return {dockDisplay:cs.display,dir:cs.flexDirection,avatarW:Math.round(a.width),avatarY:Math.round(a.y),nameY:Math.round(n.y),sideBySide:Math.abs(a.y-n.y)<20,joinVisible:j.top<window.innerHeight&&j.bottom>0,joinBottom:Math.round(j.bottom),winH:window.innerHeight};})())`);
      const ov = await p1.eval(checkScript(`JSON.stringify(__hOverflow())`));
      report.viewports[key] = { dock: JSON.parse(dock), overflow: JSON.parse(ov) };
      if (vp.name === 'desktop-1440' || vp.name === 'mobile-414' || vp.name === 'small-320') {
        await p1.screenshot(key);
      }
      // 记录问题
      const d = JSON.parse(dock);
      if (!d.sideBySide && vp.w >= 700) addIssue('登录页', '中', `头像与昵称未按设计水平双栏并排（.pass-player-dock display=${d.dockDisplay}，两元素垂直堆叠）`, `${vp.name}/${theme}: avatarY=${d.avatarY}, nameY=${d.nameY}`);
      if (!d.joinVisible) addIssue('登录页', '低', `核心 CTA「进入游戏房间」首屏不可见，需滚动（login-wrapper 内部滚动，body 不滚动）`, `${vp.name}/${theme}: 按钮底边 ${d.joinBottom}px > 视口 ${d.winH}px`);
      if (JSON.parse(ov).overflow) addIssue('登录页', '中', '页面出现横向滚动/溢出', `${vp.name}/${theme}: scrollW=${JSON.parse(ov).scrollW} > innerW=${JSON.parse(ov).innerW}`);
    }
  }

  // --- 1b. 登录页对比度 + 点击目标（414 移动端双主题）---
  for (const theme of ['light', 'dark']) {
    await p1.eval(`try{localStorage.setItem('party_theme','${theme}')}catch(e){}`);
    await p1.setViewport(414, 896, true);
    await p1.goto(SERVER_URL); await wait(600);
    const rows = await p1.eval(checkScript(`__auditContrast(['.pass-main-title','.pass-sub-desc','.dock-label','.chip-label','.room-slogan-tip','.quick-room-btn','.theme-switch-btn .theme-label','#btn-join','#player-name','#room-id','.btn-dice-random','.pass-chip-meta','.pass-chip-id'])`));
    const bad = pickContrastIssues(rows);
    if (bad.length) addIssue('登录页', '中', '存在 WCAG 对比度不足的文本', theme + ': ' + JSON.stringify(bad));
    const tap = await p1.eval(checkScript(`JSON.stringify(__auditTapTargets())`));
    const t = JSON.parse(tap);
    if (t.fail.length) addIssue('登录页', '中', '点击目标小于 24px（WCAG 2.5.8 不达标）', theme + ': ' + JSON.stringify(t.fail));
  }

  // --- 2. 房主大厅：桌面 + 移动，双主题 ---
  console.log('\n========== [2] 大厅体检 ==========');
  await p1.setViewport(1440, 900, false);
  await p1.goto(SERVER_URL); await wait(500);
  await p1.eval(`document.querySelector('#player-name').value='审计房主';document.querySelector('#room-id').value='777';document.querySelector('#btn-join').click()`);
  await wait(1500);
  for (const theme of ['light', 'dark']) {
    await p1.eval(`try{localStorage.setItem('party_theme','${theme}');document.documentElement.setAttribute('data-theme','${theme}')}catch(e){}`);
    await wait(600);
    await p1.screenshot(`lobby-desktop-1440-${theme}`);
    const checks = await p1.eval(checkScript(`JSON.stringify({
      trunc: __auditTruncation(['.tile-title','.tile-meta','.tile-seat-tag','.host-title-name','.host-sub-tag','.island-sub-status','.seat-name']),
      contrast: __auditContrast(['.tile-title','.tile-meta','.tile-seat-tag','.host-sub-tag','.room-chip-lbl','.cat-pill','.island-sub-status','.count-hint','.seats-count-pill']),
      overflow: __hOverflow(),
      dockDisplay: getComputedStyle(document.querySelector('.pass-player-dock') || document.body).display
    })`));
    const c = JSON.parse(checks);
    if (c.trunc.length) addIssue('大厅(桌面)', '低', '游戏卡片文字被截断', theme + ': ' + JSON.stringify(c.trunc.slice(0, 6)));
    const bad = pickContrastIssues(c.contrast);
    if (bad.length) addIssue('大厅(桌面)', '中', '对比度不足文本', theme + ': ' + JSON.stringify(bad));
    if (c.overflow.overflow) addIssue('大厅(桌面)', '中', '横向溢出', theme + ': ' + JSON.stringify(c.overflow));
  }

  await p1.setViewport(414, 896, true);
  await wait(800);
  for (const theme of ['light', 'dark']) {
    await p1.eval(`try{localStorage.setItem('party_theme','${theme}');document.documentElement.setAttribute('data-theme','${theme}')}catch(e){}`);
    await wait(600);
    await p1.screenshot(`lobby-mobile-414-${theme}`);
    const checks = await p1.eval(checkScript(`JSON.stringify({
      trunc: __auditTruncation(['.tile-title','.tile-meta','.tile-seat-tag','.host-title-name','.host-sub-tag','.island-sub-status','.seat-name','.seats-count-pill','.host-tag-pill']),
      overflow: __hOverflow(),
      hostBox: (function(){var h=document.querySelector('.host-profile-box');var t=document.querySelector('.host-text-box');if(!h||!t)return null;var hr=h.getBoundingClientRect(),tr=t.getBoundingClientRect();return {boxW:Math.round(tr.width),titleText:document.querySelector('.host-title-name').textContent.trim(),titleW:Math.round(document.querySelector('.host-title-name').getBoundingClientRect().width)};})(),
      actionBarOverlap: (function(){var bar=document.querySelector('.lobby-action-bar, .lobby-actions, [class*=action-bar]');var grid=document.querySelector('.game-tiles-grid');if(!bar||!grid)return null;var br=bar.getBoundingClientRect();var last=grid.lastElementChild.getBoundingClientRect();return {barTop:Math.round(br.top),gridBottom:Math.round(last.bottom),overlap:Math.round(last.bottom-br.top)};})()
    })`));
    const c = JSON.parse(checks);
    if (c.trunc.length) addIssue('大厅(移动)', '中', '游戏卡片文字截断（标题/元信息显示不全）', theme + ': ' + JSON.stringify(c.trunc.slice(0, 8)));
    if (c.overflow.overflow) addIssue('大厅(移动)', '中', '横向溢出', theme + ': ' + JSON.stringify(c.overflow));
    if (c.hostBox && c.hostBox.titleW < 60) addIssue('大厅(移动)', '高', `房主标题「${c.hostBox.titleText}」容器过窄导致文字竖排/换行`, theme + ': 标题宽 ' + c.hostBox.titleW + 'px，盒子宽 ' + c.hostBox.boxW + 'px');
    if (c.actionBarOverlap && c.actionBarOverlap.overlap > 0) addIssue('大厅(移动)', '中', '底部悬浮操作栏遮挡游戏卡片内容', theme + ': 遮挡 ' + c.actionBarOverlap.overlap + 'px（滚动到底部前）');
    const tap = await p1.eval(checkScript(`JSON.stringify(__auditTapTargets())`));
    const t = JSON.parse(tap);
    if (t.fail.length) addIssue('大厅(移动)', '中', '点击目标 <24px', theme + ': ' + JSON.stringify(t.fail.slice(0, 6)));
  }

  // ===== 实例 2：第二名玩家（独立浏览器隔离身份） =====
  console.log('\n========== [3] 游戏舞台体检 ==========');
  const b2 = await launchBrowser(CDP_PORT_BASE + 1);
  const p2 = await openPage(b2, CDP_PORT_BASE + 1, SERVER_URL);
  await p2.setViewport(414, 896, true);
  await p2.goto(SERVER_URL); await wait(500);
  await p2.eval(`document.querySelector('#player-name').value='审计玩家';document.querySelector('#room-id').value='777';document.querySelector('#btn-join').click()`);
  await wait(1500);
  const p2In = await p2.eval(`document.querySelector('.screen.active').id`);
  if (p2In !== 'game-screen') addIssue('联机', '高', '第二名玩家加入房间失败', 'screen=' + p2In);

  // 房主（桌面 1440）立即开局 → 你画我猜
  await p1.setViewport(1440, 900, false); await wait(600);
  await p1.eval(`(function(){var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.indexOf('立即开局')>=0){btns[i].click();return;}}})()`);
  await wait(2500);

  // 检查画师选词弹窗是否出现
  const modal = await p1.eval(`(function(){var m=document.querySelector('#word-modal');return m?{active:m.classList.contains('active'),options:document.querySelectorAll('.word-option-card').length}:{exists:false};})()`);
  if (!modal || !modal.active) addIssue('你画我猜', '高', '开局后画师选词弹窗未出现', JSON.stringify(modal));
  await p1.screenshot('drawguess-desktop-wordmodal-light');

  // 桌面画师舞台（浅色 + 深色）
  const word = await p1.eval(`(function(){var cards=document.querySelectorAll('.word-option-card');if(cards.length){cards[Math.floor(Math.random()*cards.length)].click();return 'picked';}return 'no modal';})()`);
  await wait(1500);
  await p1.screenshot('drawguess-desktop-drawing-light');
  await p1.eval(`document.documentElement.setAttribute('data-theme','dark');try{localStorage.setItem('party_theme','dark')}catch(e){}`);
  await wait(800);
  await p1.screenshot('drawguess-desktop-drawing-dark');
  // 深色模式下画布外框与工具栏主题残留检查
  const darkCheck = await p1.eval(checkScript(`JSON.stringify({
    banner:(function(){var b=document.querySelector('.draw-turn-banner');if(!b)return null;var cs=getComputedStyle(b);return {bg:cs.backgroundColor,color:cs.color};})(),
    toolbar:(function(){var b=document.querySelector('.dg-toolbar, .draw-toolbar');if(!b)return null;var cs=getComputedStyle(b);return {bg:cs.backgroundColor};})(),
    hint:(function(){var h=document.querySelector('#word-hint-box');return h?getComputedStyle(h).color:null;})()
  })`));
  const dc = JSON.parse(darkCheck);
  if (dc.banner && dc.banner.bg && dc.banner.bg.startsWith('rgb(2')) addIssue('你画我猜', '中', '深色模式下画师横幅仍为浅色背景（主题未跟随）', JSON.stringify(dc.banner));

  // 移动端猜词者视角（实例 2，双主题）
  for (const theme of ['light', 'dark']) {
    await p2.eval(`document.documentElement.setAttribute('data-theme','${theme}');try{localStorage.setItem('party_theme','${theme}')}catch(e){}`);
    await wait(700);
    await p2.screenshot('drawguess-mobile-guesser-' + theme);
    const rows = await p2.eval(checkScript(`__auditContrast(['.hint-text','#word-hint-box','.category-indicator','.dg-guess-input','#draw-guess-input','.msg-item','.chat-title-text'])`));
    const bad = pickContrastIssues(rows);
    if (bad.length) addIssue('你画我猜(移动)', '中', '对比度不足', theme + ': ' + JSON.stringify(bad));
    const ov = await p2.eval(checkScript(`JSON.stringify(__hOverflow())`));
    if (JSON.parse(ov).overflow) addIssue('你画我猜(移动)', '中', '横向溢出', theme + ': ' + JSON.stringify(JSON.parse(ov)));
  }

  // --- 4. 切换 UNO 快速走查 ---
  console.log('\n========== [4] UNO 舞台体检 ==========');
  await p1.eval(`(function(){var lb=document.querySelector('#btn-header-lobby');if(lb&&!lb.classList.contains('hidden')){lb.click();}})()`);
  await wait(1200);
  var confirmOk = await p1.eval(`(function(){var m=document.querySelector('#confirm-modal');if(m&&m.classList.contains('active')){document.querySelector('#btn-confirm-ok').click();return 'confirmed';}return 'no modal';})()`);
  await wait(1200);
  await p1.eval(`(function(){var t=document.querySelector('.game-tile[data-game=uno]');if(t){t.scrollIntoView({block:'center'});t.click();}})()`);
  await wait(800);
  await p1.eval(`(function(){var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.indexOf('立即开局')>=0){btns[i].click();return;}}})()`);
  await wait(2500);
  await p1.screenshot('uno-desktop-light');
  await p2.screenshot('uno-mobile-light');
  const unoHand = await p2.eval(`JSON.stringify((function(){var h=document.querySelector('.uno-hand, [class*=uno-hand], [id*=uno-hand]');if(!h)return null;var r=h.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cards:h.querySelectorAll('[class*=card]').length};})())`);
  const unoDark = await p2.eval(`document.documentElement.setAttribute('data-theme','dark');'ok'`);
  await wait(700);
  await p2.screenshot('uno-mobile-dark');

  // --- 汇总 ---
  console.log('\n========== 审计报告 ==========');
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  p1.close(); p2.close(); b1.kill(); b2.kill();
  process.exit(0);
})().catch(e => { console.error('审计失败:', e); process.exit(1); });
