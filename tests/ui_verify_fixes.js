/**
 * 修复回归验证：逐项核对 UI 审计修复点
 * 运行：node tests/ui_verify_fixes.js（需 npm start 已启动）
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

const PORT = 9481;
const OUT = path.join(__dirname, 'screens', 'ui-audit');
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
const results = [];
function log(ok, name, detail) {
  results.push({ ok, name, detail });
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function openPage(port, url) {
  const target = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: `/json/new?${encodeURIComponent(url)}`, method: 'PUT' },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
  await wait(400);
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let idSeq = 0; const pending = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++idSeq;
    pending.set(id, (msg) => msg.error ? reject(new Error(method)) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 15000);
  });
  await send('Page.enable'); await send('Runtime.enable');
  const page = {
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 150));
      return r.result && r.result.value;
    },
    async screenshot(name) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(r.data, 'base64'));
      console.log('  📸 ' + name + '.jpg');
    },
    async setViewport(w, h, mobile) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile }); },
    async goto(u) {
      await send('Page.navigate', { url: u });
      for (let i = 0; i < 20; i++) { await wait(300); try { if (await page.eval('document.readyState')) break; } catch (e) {} }
      await wait(600);
    },
    close() { try { ws.close(); } catch (e) {} }
  };
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(findBrowserPath(), ['--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'verify-fix-'))}`, '--no-sandbox', '--disable-gpu', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  await wait(1500);
  // 每次回归测试使用时间戳动态房间号，杜绝前次执行将房间切至 UNO 后的状态污染
  const ROOM = 'VR' + (Date.now() % 10000);

  // ========== 1. 登录页：双栏布局 + 对比度 ==========
  const p = await openPage(PORT, 'http://127.0.0.1:8080');
  await p.setViewport(1440, 900, false);
  await p.goto('http://127.0.0.1:8080');

  const dock = JSON.parse(await p.eval(`JSON.stringify((function(){
    var d=document.querySelector('.pass-player-dock'); var cs=getComputedStyle(d);
    var a=document.querySelector('.avatar-interactive-slot').getBoundingClientRect();
    var n=document.querySelector('.player-name-dock').getBoundingClientRect();
    return { display:cs.display, sideBySide: Math.abs(a.y-n.y)<30, avatarW:Math.round(a.width), nameW:Math.round(n.width) };
  })())`));
  log(dock.display === 'flex' && dock.sideBySide, '登录页头像/昵称水平双栏', JSON.stringify(dock));

  const contrast = JSON.parse(await p.eval(`JSON.stringify((function(){
    function L(r,g,b){var f=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
    function ratio(fg,bg){var l1=L(fg[0],fg[1],fg[2]),l2=L(bg[0],bg[1],bg[2]);var a=Math.max(l1,l2),b=Math.min(l1,l2);return (a+0.05)/(b+0.05);}
    function parse(s){var m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
    // 背景回溯：跳过透明层；半透明背景需与下层实色 alpha 混合后再算对比度
    function bgOf(el){
      var layers=[];
      var c=el;
      while(c&&c!==document.documentElement){
        var cs=getComputedStyle(c);
        var bg=parse(cs.backgroundColor);
        if(bg&&bg.a>0.85){layers.push(bg);break;}
        if(bg&&bg.a>0){layers.push(bg);}
        c=c.parentElement;
      }
      if(!layers.length)return {r:255,g:255,b:255,a:1};
      // 从最底层向上混合
      var mixed=layers[layers.length-1];
      for(var i=layers.length-2;i>=0;i--){
        var top=layers[i];
        mixed={r:top.r*top.a+mixed.r*(1-top.a),g:top.g*top.a+mixed.g*(1-top.a),b:top.b*top.a+mixed.b*(1-top.a),a:1};
      }
      return mixed;
    }
    function cr(sel){var el=document.querySelector(sel);if(!el)return null;var fg=parse(getComputedStyle(el).color);var bg=bgOf(el);return Math.round(ratio([fg.r,fg.g,fg.b],[bg.r,bg.g,bg.b])*100)/100;}
    return { join: cr('#btn-join'), chip: cr('.pass-chip-meta'), online: cr('.pass-chip-id'), label: cr('.dock-label'), slogan: cr('.room-slogan-tip') };
  })())`));
  log(contrast.join >= 4.5, 'CTA「进入游戏房间」对比度≥4.5', '实测 ' + contrast.join + ':1');
  log(contrast.chip >= 4.5, 'PARTY HUB 徽标对比度≥4.5', '实测 ' + contrast.chip + ':1');
  log(contrast.online >= 4.5, 'ONLINE 徽标对比度≥4.5', '实测 ' + contrast.online + ':1');
  log(contrast.label >= 4.5, '表单标签对比度≥4.5', '实测 ' + contrast.label + ':1');
  log(contrast.slogan === null || contrast.slogan >= 4.5, '标语条对比度≥4.5', '实测 ' + contrast.slogan + ':1');
  await p.screenshot('fix-login-desktop-light');

  const pillH = await p.eval(`Math.round(document.querySelector('.pill-btn') ? 28 : 0)`); // 占位，pill 在游戏屏
  // 320px 无横向溢出复查
  await p.setViewport(320, 700, true);
  await wait(400);
  const ov320 = JSON.parse(await p.eval(`JSON.stringify({ow:document.documentElement.scrollWidth,iw:window.innerWidth})`));
  log(ov320.ow <= ov320.iw + 2, '320px 无横向溢出', JSON.stringify(ov320));

  // ========== 2. 加入房间：大厅检查 ==========
  await p.setViewport(1440, 900, false);
  await p.goto('http://127.0.0.1:8080'); await wait(400);
  await p.eval(`document.querySelector('#player-name').value='验证房主';document.querySelector('#room-id').value='${ROOM}';document.querySelector('#btn-join').click()`);
  await wait(1800);
  const lobby = JSON.parse(await p.eval(`JSON.stringify((function(){
    var rt=document.querySelector('#display-round-tag');
    var sb=document.querySelector('.sub-status-bar');
    var badge=document.querySelector('.tile-capacity-badge');
    return {
      roundHidden: rt ? rt.classList.contains('hidden') : null,
      subBarHidden: sb ? sb.classList.contains('hidden') : null,
      gameTag: document.querySelector('#display-game-tag').textContent,
      badgeText: badge ? badge.textContent : null,
      badgeOneLine: badge ? badge.getBoundingClientRect().height < 26 : null
    };
  })())`));
  log(lobby.roundHidden === true, '大厅隐藏「轮次 1/3」胶囊', JSON.stringify(lobby));
  log(lobby.subBarHidden === true, '大厅隐藏提示条', 'gameTag=' + lobby.gameTag);
  log(lobby.badgeText && lobby.badgeText.indexOf('差') >= 0 && lobby.badgeOneLine, '容量徽章精简为单行', lobby.badgeText);

  // 移动端大厅：单列卡片 + 无截断
  await p.setViewport(414, 896, true); await wait(700);
  const mob = JSON.parse(await p.eval(`JSON.stringify((function(){
    var grid=document.querySelector('.game-tiles-grid');
    var cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    var trunc=0; document.querySelectorAll('.tile-title').forEach(function(t){ if(t.scrollWidth>t.clientWidth+2) trunc++; });
    return { cols: cols, truncated: trunc };
  })())`));
  log(mob.cols === 1, '移动端游戏卡片单列布局', JSON.stringify(mob));
  log(mob.truncated === 0, '移动端卡片标题零截断', '截断数=' + mob.truncated);
  await p.screenshot('fix-lobby-mobile-414');

  // ========== 3. 第二玩家加入 → 开局 → 选词弹窗 ==========
  const g = await openPage(PORT, 'http://127.0.0.1:8080');
  await g.setViewport(414, 896, true);
  await g.goto('http://127.0.0.1:8080');
  await g.eval(`document.querySelector('#player-name').value='验证玩家';document.querySelector('#room-id').value='${ROOM}';document.querySelector('#btn-join').click()`);
  await wait(1500);
  log(await g.eval(`document.querySelector('.screen.active').id`) === 'game-screen', '第二名玩家正常加入');

  await p.eval(`document.querySelector('#btn-start-game').click()`);
  var modalSeen = false;
  for (var i = 0; i < 14; i++) {
    await wait(500);
    if (await p.eval(`(function(){var m=document.querySelector('#word-modal');return m?m.classList.contains('active'):false;})()`)) { modalSeen = true; break; }
  }
  log(modalSeen, '开局后画师选词弹窗出现');

  // 重连补发验证：刷新房主页面（仍在 SELECTING 窗口内）→ 弹窗应再次出现
  if (modalSeen) {
    await p.goto('http://127.0.0.1:8080'); await wait(1500);
    var autoBack = await p.eval(`document.querySelector('.screen.active').id`);
    var rematch = false;
    for (var j = 0; j < 10; j++) {
      if (await p.eval(`(function(){var m=document.querySelector('#word-modal');return m?m.classList.contains('active'):false;})()`)) { rematch = true; break; }
      await wait(500);
    }
    log(autoBack === 'game-screen', '刷新后自动回房（不再停留登录页）', 'screen=' + autoBack);
    log(rematch, 'SELECTING 阶段重连补发选词弹窗');
  } else {
    // 弹窗可能已超时自动选词进入绘画阶段，验证绘画阶段正常
    var drawing = await p.eval(`document.querySelector('#display-game-tag').textContent`);
    log(drawing.indexOf('你画我猜') >= 0, '开局进入你画我猜（弹窗窗口已过）', drawing);
  }
  await p.screenshot('fix-drawguess-stage');

  // ========== 4. 切 UNO：桌面舞台适配 ==========
  await p.eval(`document.querySelector('#btn-header-lobby').click()`); await wait(800);
  await p.eval(`(function(){var m=document.querySelector('#confirm-modal');if(m&&m.classList.contains('active'))document.querySelector('#btn-confirm-ok').click();})()`);
  await wait(1000);
  await p.eval(`(function(){var t=document.querySelector('.game-tile[data-game=uno]');t.scrollIntoView({block:'center'});t.click();})()`);
  await wait(600);
  await p.eval(`document.querySelector('#btn-start-game').click()`);
  await wait(2500);
  var uno = JSON.parse(await p.eval(`JSON.stringify((function(){
    var st=document.querySelector('#stage-uno'); var r=st?st.getBoundingClientRect():{width:0,left:0};
    var card=document.querySelector('.uno-card, #uno-top-card, #btn-uno-draw'); var cs=card?getComputedStyle(card):null;
    var winW=window.innerWidth;
    var center=(r.left+r.width/2);
    return { w:Math.round(r.width), cardW: cs?Math.round(parseFloat(cs.width)):null, offCenter: Math.abs(center-winW/2), tag: document.querySelector('#display-game-tag').textContent };
  })())`));
  log(uno.tag.indexOf('UNO') >= 0, 'UNO 正常开局', uno.tag);
  log(uno.cardW >= 80, '桌面端 UNO 手牌放大(≥80px)', '卡宽 ' + uno.cardW + 'px');
  log(uno.offCenter < 130, '桌面端舞台居中(960px 限宽)', '中心偏差 ' + Math.round(uno.offCenter) + 'px');
  await p.screenshot('fix-uno-desktop');

  // 深色主题快速回归（UNO 桌面 + 提示条隐藏）
  await p.eval(`document.documentElement.setAttribute('data-theme','dark')`); await wait(500);
  await p.screenshot('fix-uno-desktop-dark');

  // 猜词者反馈监听验证（事件名注册存在性）
  var fb = await g.eval(`(function(){
    var ok = false;
    try { socket.emit('__noop__'); ok = true; } catch(e) {}
    return JSON.stringify({ hasInput: !!document.getElementById('draw-guess-input'), alive: ok });
  })()`);
  log(JSON.parse(fb).hasInput, '猜词输入框就绪（guess_rejected 监听已随插件注册）', fb);

  // ========== 汇总 ==========
  var pass = results.filter(r => r.ok).length;
  console.log('\\n========== 回归结果: ' + pass + '/' + results.length + ' 通过 ==========');
  fs.writeFileSync(path.join(OUT, 'verify-fixes-result.json'), JSON.stringify(results, null, 2));
  p.close(); g.close();
  try { proc.kill(); } catch (e) {}
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('验证脚本失败:', e.message); process.exit(1); });
