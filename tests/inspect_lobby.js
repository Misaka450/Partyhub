const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createTarget(url, port = 9996) {
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

async function inspectLobby() {
  const proc = spawn('/usr/bin/chromium-browser', [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9996',
    '--window-size=390,844',
    '--hide-scrollbars'
  ]);
  await sleep(1500);

  const json = await createTarget('http://127.0.0.1:8080', 9996);
  const ws = new WebSocket(json.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 1;
  const handlers = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && handlers.has(m.id)) {
      const { resolve } = handlers.get(m.id);
      handlers.delete(m.id);
      resolve(m.result);
    }
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    handlers.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8080' });
  await sleep(1000);

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('player-name').value = '房主小马';
      document.getElementById('room-id').value = 'INSPECT_ROOM';
      document.getElementById('btn-join').click();
      await new Promise(r => setTimeout(r, 1200));

      const lobbyCard = document.getElementById('lobby-card');
      const hero = document.querySelector('.lobby-room-hero');
      const tiles = document.querySelector('.game-tiles-grid');
      const stageSection = document.querySelector('.stage-section');

      return {
        lobbyCardClass: lobbyCard?.className,
        lobbyCardRect: lobbyCard?.getBoundingClientRect(),
        heroRect: hero?.getBoundingClientRect(),
        tilesRect: tiles?.getBoundingClientRect(),
        stageSectionRect: stageSection?.getBoundingClientRect(),
        stageSectionStyle: stageSection ? window.getComputedStyle(stageSection).display : null,
        lobbyCardStyle: lobbyCard ? window.getComputedStyle(lobbyCard).display : null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Inspect Result:", JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

inspectLobby();
