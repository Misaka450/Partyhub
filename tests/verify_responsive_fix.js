/* =========================================================
   响应式改造快速验证脚本（Edge CDP，2026-08-27）
   运行： node tests/verify_responsive_fix.js
   截图输出到： tests/ui_audit_screens/FIX_*
   ========================================================= */
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT_DIR = path.join(__dirname, 'ui_audit_screens');
const CDP_PORT = 9333;
const SERVER = 'http://127.0.0.1:8080';
const USER_DATA_DIR = path.join(__dirname, '..', '.tmp_edge_profile_verify');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

/* ---------- 工具：HTTP GET / PUT ---------- */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('非JSON响应: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}
function httpPut(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('PUT非JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---------- CDP 简易封装 ---------- */
class CDPSession {
  constructor(wsUrl) { this.url = wsUrl; this.msgId = 1; this.pending = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const [res, rej] = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        }
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, [resolve, reject]);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

/* ---------- 核心：打开页面 → 加入房间 → 选游戏 → 截图 ---------- */
async function captureScenario({ name, width, height, game, outFile }) {
  console.log(`\n📸 [${name}] ${width}x${height}  game=${game || 'lobby'} → ${outFile}`);

  // 1. 启动带新目标的 Edge（复用已启动的浏览器）
  const targets = await httpPut(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(SERVER)}`);
  const cdp = new CDPSession(targets.webSocketDebuggerUrl);
  await cdp.connect();

  // 2. 设置视口
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 500,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: width < 500 });

  // 3. 等待页面加载
  await delay(1200);

  // 4. 填入昵称+房间号，点击进入
  const nick = '验证小马_' + (width < 500 ? 'M' : 'D');
  const room = width < 500 ? `FIX_SM_${width}` : `FIX_BIG_${width}`;
  await cdp.send('Runtime.evaluate', {
    expression: `
      (function(){
        document.getElementById('player-name').value = ${JSON.stringify(nick)};
        document.getElementById('room-id').value = ${JSON.stringify(room)};
        document.getElementById('btn-join').click();
      })();
    `,
    awaitPromise: false,
  });
  await delay(1500); // 等待socket连接 + 进入大厅

  // 5. 如果要开局，需要触发房主开局流程（通过UI点击路径）
  if (game) {
    // 点击目标游戏磁贴 + 开局
    await cdp.send('Runtime.evaluate', {
      expression: `
        (async function(){
          // 等待磁贴渲染
          for (let i=0; i<40; i++) {
            const t = document.querySelector('.game-tile[data-game="${game}"]');
            if (t) { t.click(); break; }
            await new Promise(r=>setTimeout(r,50));
          }
          // 点击立即开局按钮
          for (let i=0; i<40; i++) {
            const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary:not([disabled])');
            if (b && !b.disabled) { b.click(); break; }
            await new Promise(r=>setTimeout(r,50));
          }
        })();
      `,
      awaitPromise: true,
    });
    await delay(2500); // 等待游戏舞台渲染
  }

  // 6. 截图保存
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
  console.log(`   ✔ 已保存 ${fs.statSync(outFile).size} bytes`);

  // 7. 关闭页面
  await cdp.send('Page.close');
  cdp.close();
  await delay(300);
}

/* ---------- 主流程 ---------- */
(async () => {
  let edgeProc = null;
  try {
    // 若 CDP 端口没开，则启动 Edge headless
    try { await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`); console.log('✅ Edge CDP 已在端口', CDP_PORT); }
    catch {
      console.log('🚀 启动 Edge headless on port', CDP_PORT);
      edgeProc = spawn(EDGE_PATH, [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--no-first-run',
        '--disable-gpu',
        '--hide-scrollbars',
      ], { windowsHide: true, detached: false });
      for (let i = 0; i < 40; i++) {
        await delay(300);
        try { await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`); break; } catch {}
      }
    }

    // 关键场景：手机小屏(360) + 手机(390) + 桌面(1920)
    const scenarios = [
      // 移动端 360px：大厅（原顶栏溢出 + 邀请按钮竖排）
      { name: 'FIX_360大厅', width: 360, height: 780, game: null,
        outFile: path.join(OUT_DIR, 'FIX_mobile_s_360_lobby.png') },
      // 移动端 360px：UNO（原手牌拥挤）
      { name: 'FIX_360_UNO', width: 360, height: 780, game: 'uno',
        outFile: path.join(OUT_DIR, 'FIX_mobile_s_360_uno.png') },
      // 移动端 360px：阿瓦隆（原任务节点贴边 + 轮次裁切）
      { name: 'FIX_360_阿瓦隆', width: 360, height: 780, game: 'avalon',
        outFile: path.join(OUT_DIR, 'FIX_mobile_s_360_avalon.png') },
      // 移动端 390px：大厅
      { name: 'FIX_390大厅', width: 390, height: 844, game: null,
        outFile: path.join(OUT_DIR, 'FIX_mobile_390_lobby.png') },
      // 桌面 1920px：大厅（原顶栏文字裁切）
      { name: 'FIX_1920大厅', width: 1920, height: 1080, game: null,
        outFile: path.join(OUT_DIR, 'FIX_desktop_1920_lobby.png') },
    ];

    for (const s of scenarios) {
      try { await captureScenario(s); }
      catch (e) { console.log(`   ❌ 失败: ${e.message}`); }
    }

    console.log('\n🎉 验证截图完成！请查看 tests/ui_audit_screens/FIX_*.png');
    console.log('   建议对边：');
    console.log('   - FIX_mobile_s_360_lobby.png  ↔  Edge_mobile_s_lobby.png（原顶栏溢出/竖排）');
    console.log('   - FIX_mobile_s_360_uno.png    ↔  Edge_mobile_s_uno.png（原UNO手牌挤压）');
    console.log('   - FIX_mobile_s_360_avalon.png ↔  Edge_mobile_s_avalon.png（原任务条裁切）');
    console.log('   - FIX_desktop_1920_lobby.png  ↔  Edge_desktop_lobby.png（原顶栏文字裁切）');
  }
  catch (e) {
    console.error('验证脚本错误:', e);
    process.exitCode = 1;
  }
  finally {
    if (edgeProc) { edgeProc.kill(); }
  }
})();
