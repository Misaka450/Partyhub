/**
 * 游戏舞台补充审计（干净环境单实例双标签页）
 * 修复点：tab2 加入前清空 localStorage 中的 token/secret，避免身份串扰
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

const PORT = 9473;
const OUT = path.join(__dirname, 'screens', 'ui-audit');
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    pending.set(id, (msg) => msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 15000);
  });
  await send('Page.enable'); await send('Runtime.enable');
  const page = {
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
      return r.result && r.result.value;
    },
    async screenshot(name) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(r.data, 'base64'));
      console.log('📸 ' + name);
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
  const browserPath = findBrowserPath();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-audit-'));
  const proc = spawn(browserPath, ['--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--no-sandbox', '--disable-gpu', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  await wait(1500);

  // tab1 = 房主（桌面视口）
  const h = await openPage(PORT, 'http://127.0.0.1:8080');
  await h.setViewport(1440, 900, false);
  await h.goto('http://127.0.0.1:8080');
  await h.eval(`document.querySelector('#player-name').value='舞台房主';document.querySelector('#room-id').value='778';document.querySelector('#btn-join').click()`);
  await wait(1500);
  console.log('房主加入:', await h.eval(`JSON.stringify({screen:document.querySelector('.screen.active').id, activeTile:document.querySelector('.game-mode-card.active') ? document.querySelector('.game-mode-card.active').dataset.game : null, hostBtnVisible: !document.querySelector('#btn-start-game').classList.contains('hidden')})`));

  // 大厅双主题截图（这次保证大厅真实可见）
  await h.screenshot('v2-lobby-desktop-light');
  await h.eval(`document.documentElement.setAttribute('data-theme','dark')`); await wait(500);
  await h.screenshot('v2-lobby-desktop-dark');
  await h.eval(`document.documentElement.setAttribute('data-theme','light')`); await wait(300);

  // tab2 = 玩家（移动视口，清空 token 防串扰）
  const g = await openPage(PORT, 'http://127.0.0.1:8080');
  await g.setViewport(414, 896, true);
  await g.goto('http://127.0.0.1:8080');
  await g.eval(`try{localStorage.removeItem('dg_player_token');localStorage.removeItem('dg_reconnect_secret');}catch(e){}`);
  await g.eval(`document.querySelector('#player-name').value='舞台玩家';document.querySelector('#room-id').value='778';document.querySelector('#btn-join').click()`);
  await wait(1500);
  console.log('玩家加入:', await g.eval(`document.querySelector('.screen.active').id`));

  // 房主用真实 ID 按钮开局，轮询选词弹窗最长 8 秒
  await h.eval(`document.querySelector('#btn-start-game').click()`);
  let modalSeen = false, sawGame = '';
  for (let i = 0; i < 16; i++) {
    await wait(500);
    const st = await h.eval(`JSON.stringify({tag:document.querySelector('#display-game-tag').textContent, modal:(function(){var m=document.querySelector('#word-modal');return m?m.classList.contains('active'):false;})(), opts:document.querySelectorAll('.word-option-card').length})`);
    const s = JSON.parse(st);
    sawGame = s.tag;
    if (s.modal) { modalSeen = true; console.log(`选词弹窗在第 ${(i + 1) * 0.5}s 出现, 选项数=${s.opts}`); break; }
  }
  console.log('开局结果:', JSON.stringify({ gameTag: sawGame, wordModalSeen: modalSeen }));
  await h.screenshot(modalSeen ? 'v2-drawguess-wordmodal' : 'v2-drawguess-nomodal');

  if (modalSeen) {
    await h.eval(`(function(){var c=document.querySelectorAll('.word-option-card');c[Math.floor(c.length/2)].click();})()`);
    await wait(1200);
  }
  await h.screenshot('v2-drawguess-drawing-light');
  await h.eval(`document.documentElement.setAttribute('data-theme','dark')`); await wait(600);
  await h.screenshot('v2-drawguess-drawing-dark');
  // 深色下画布周边元素主题一致性
  console.log('深色一致性:', await h.eval(`JSON.stringify({
    bodyBg:getComputedStyle(document.body).backgroundColor,
    banner:(function(){var b=document.querySelector('.draw-turn-banner');return b?getComputedStyle(b).backgroundColor:null;})(),
    sidebar:(function(){var b=document.querySelector('.player-drawer');return b?getComputedStyle(b).backgroundColor:null;})()
  })`));

  // 猜词者视角双主题
  await g.eval(`document.documentElement.setAttribute('data-theme','light')`); await wait(500);
  await g.screenshot('v2-guesser-mobile-light');
  await g.eval(`document.documentElement.setAttribute('data-theme','dark')`); await wait(500);
  await g.screenshot('v2-guesser-mobile-dark');

  // 切 UNO：真实按钮流程
  await h.eval(`document.documentElement.setAttribute('data-theme','light')`);
  await h.eval(`document.querySelector('#btn-header-lobby').click()`); await wait(800);
  await h.eval(`(function(){var m=document.querySelector('#confirm-modal');if(m&&m.classList.contains('active'))document.querySelector('#btn-confirm-ok').click();})()`);
  await wait(1200);
  await h.eval(`(function(){var t=document.querySelector('.game-tile[data-game=uno]');t.scrollIntoView({block:'center'});t.click();})()`);
  await wait(600);
  console.log('选中UNO后:', await h.eval(`JSON.stringify({activeTile:document.querySelector('.game-mode-card.active') ? document.querySelector('.game-mode-card.active').dataset.game : null})`));
  await h.eval(`document.querySelector('#btn-start-game').click()`);
  await wait(2500);
  console.log('UNO开局:', await h.eval(`document.querySelector('#display-game-tag').textContent`));
  await h.screenshot('v2-uno-desktop-light');
  await g.screenshot('v2-uno-mobile-light');
  await g.eval(`document.documentElement.setAttribute('data-theme','dark')`); await wait(500);
  await g.screenshot('v2-uno-mobile-dark');

  h.close(); g.close();
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
