/**
 * 🧪 维度一（大画幅视窗尺寸）真机 CDP 测量与验证
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const { findBrowserPath } = require('./lib/browser_launcher');

const CDP_PORT = 9447;
const SERVER_URL = 'http://127.0.0.1:8080';
let chromeProc = null;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function createTarget(url, port = CDP_PORT) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/json/new?${encodeURIComponent(url)}`,
      method: 'PUT'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const browserPath = findBrowserPath();
  chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=412,892',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  try {
    const target = await createTarget(SERVER_URL, CDP_PORT);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let msgId = 1;
    const pending = new Map();
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.id && pending.has(m.id)) pending.get(m.id)(m.result);
    });
    const send = (method, params = {}) => new Promise(res => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');

    await wait(2000);

    // 测量四大容器的 CSS 计算属性
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        // 创建测试挂载节点
        const container = document.createElement('div');
        container.innerHTML = \`
          <div class="hole-folded-preview" id="t-hole-prev"></div>
          <div class="hole-mini-grid" id="t-hole-grid"></div>
          <div class="train-board-grid" id="t-train-grid"></div>
          <div class="simon-disk-container" id="t-simon-disk"></div>
          <div class="disappear-plate-container" id="t-disappear-plate"></div>
        \`;
        document.body.appendChild(container);

        const hpPrev = document.getElementById('t-hole-prev').getBoundingClientRect();
        const hpGrid = document.getElementById('t-hole-grid').getBoundingClientRect();
        const train = document.getElementById('t-train-grid').getBoundingClientRect();
        const simon = document.getElementById('t-simon-disk').getBoundingClientRect();
        const plate = document.getElementById('t-disappear-plate').getBoundingClientRect();

        return {
          holePrev: { w: Math.round(hpPrev.width), h: Math.round(hpPrev.h || hpPrev.height) },
          holeGrid: { w: Math.round(hpGrid.width), h: Math.round(hpGrid.height) },
          train: { w: Math.round(train.width), h: Math.round(train.height) },
          simon: { w: Math.round(simon.width), h: Math.round(simon.height) },
          plate: { w: Math.round(plate.width), minH: Math.round(plate.height) }
        };
      })()`,
      returnByValue: true
    });

    console.log('📊 真机 DOM 尺寸实测结果:');
    console.log(JSON.stringify(res.result.value, null, 2));

    const v = res.result.value;
    if (v.holePrev.w < 130) throw new Error(`折纸打孔预览尺寸未达标: ${v.holePrev.w}`);
    if (v.holeGrid.w < 100) throw new Error(`折纸打孔选项网格未达标: ${v.holeGrid.w}`);
    if (v.train.w < 260) throw new Error(`轨道小火车地图未达标: ${v.train.w}`);
    if (v.simon.w < 260) throw new Error(`西蒙节拍圆盘未达标: ${v.simon.w}`);
    if (v.plate.w < 350) throw new Error(`偷吃怪餐盘未达标: ${v.plate.w}`);

    console.log('✅ 所有大画幅尺寸指标全部达标通过！');
    ws.close();
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

run().catch(e => {
  console.error(e);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
