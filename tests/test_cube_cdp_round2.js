const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserClient {
  constructor(name, wsUrl, index) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.index = index;
    this.token = `token_cdp_cube_${index}_${Math.random().toString(36).substr(2, 9)}`;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (e) {}
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          ${expression}
        } catch (e) {
          return { __eval_err: e.message || String(e) };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result ? res.result.value : null;
  }

  async waitFor(fnExpr, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.eval(fnExpr);
        if (res) return res;
      } catch (e) {}
      await wait(intervalMs);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${fnExpr}`);
  }
}

function createTarget(url, port = 9555) {
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

async function runTest() {
  console.log('====================================================');
  console.log('🌐 启动 Headless Chromium CDP 真机测试 3D数方块多回合交互');
  console.log('====================================================');

  const chromeProc = spawn('/usr/bin/chromium-browser', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9555',
    'about:blank'
  ], { stdio: 'ignore' });

  await wait(1500);

  const testRoomId = 'CUBE_CDP_' + Math.floor(Math.random() * 8999 + 1000);
  const target = await createTarget('http://127.0.0.1:8080', 9555);
  const host = new BrowserClient('房主测试员', target.webSocketDebuggerUrl, 0);
  await host.connect();
  await host.waitFor("return document.getElementById('player-name') !== null", 15000);

  console.log(`1. 浏览器已加载页面，加入房间: ${testRoomId}`);
  await host.eval(`
    myPlayerToken = '${host.token}';
    myPlayerName = '房主测试员';
    localStorage.setItem('dg_player_token', '${host.token}');
    localStorage.setItem('dg_player_name', '房主测试员');
    document.getElementById('player-name').value = '房主测试员';
    document.getElementById('room-id').value = '${testRoomId}';
    socket.emit('join_room', {
      roomId: '${testRoomId}',
      playerName: '房主测试员',
      avatar: '🐱',
      playerToken: '${host.token}'
    });
  `);

  await host.waitFor("return currentRoomState && currentRoomState.status === 'LOBBY'", 8000);
  console.log('✓ 成功进入游戏大厅');

  console.log('2. 切换至 3D 数方块 (cube-count) 并启动游戏');
  await host.eval("socket.emit('switch_game', { gameType: 'cube-count' })");
  await host.waitFor("return currentRoomState && currentRoomState.gameType === 'cube-count'", 6000);

  await host.eval("socket.emit('start_game')");
  await host.waitFor("return currentRoomState && currentRoomState.status === 'CUBE_OBSERVE'", 8000);
  await wait(300);

  // 验证第 1 轮观察期 DOM
  const r1Observe = await host.eval(`
    return {
      stageVisible: !document.getElementById('stage-cube-count').classList.contains('hidden'),
      hasObserveHint: !!document.querySelector('.cube-observe-hint'),
      promptTitle: document.getElementById('cube-prompt-title')?.textContent,
      optionButtonsCount: document.querySelectorAll('.btn-cube-option').length,
      inputDisabled: document.getElementById('cube-direct-input')?.disabled,
      submitBtnDisabled: document.getElementById('cube-submit-btn')?.disabled
    };
  `);
  console.log('3. 第 1 轮观察期 DOM 状态:', r1Observe);
  if (!r1Observe.stageVisible || !r1Observe.hasObserveHint || !r1Observe.inputDisabled || r1Observe.optionButtonsCount !== 0) {
    throw new Error('第 1 轮观察期状态不正确！');
  }
  console.log('✓ 第 1 轮观察期锁定与提示正常！');

  // 等待第 1 轮抢答期
  console.log('4. 等待 6s 观察期倒计时结束进入抢答期...');
  await host.waitFor("return currentRoomState && currentRoomState.status === 'CUBE_GUESSING'", 10000);
  await wait(300);

  const r1Guess = await host.eval(`
    return {
      optionButtonsCount: document.querySelectorAll('.btn-cube-option').length,
      options: Array.from(document.querySelectorAll('.btn-cube-option')).map(b => b.textContent),
      inputDisabled: document.getElementById('cube-direct-input')?.disabled
    };
  `);
  console.log('5. 第 1 轮抢答期 DOM 状态:', r1Guess);
  if (r1Guess.optionButtonsCount !== 4 || r1Guess.inputDisabled) {
    throw new Error('第 1 轮抢答期未能正确渲染选项！');
  }

  // 点击第 1 轮选项 1
  console.log('6. 点击第 1 轮选项 1 提交答案');
  await host.eval("document.querySelectorAll('.btn-cube-option')[0].click();");
  await wait(400);

  const r1Submitted = await host.eval(`
    return {
      promptTitle: document.getElementById('cube-prompt-title')?.textContent,
      btnDisabled: document.querySelectorAll('.btn-cube-option')[0]?.disabled
    };
  `);
  console.log('7. 提交后即时 UI 状态:', r1Submitted);

  // 等待第 1 轮结算并进入第 2 轮观察期
  console.log('8. 等待第 1 轮结算公布 (4.5s) 并流转至第 2 轮...');
  await host.waitFor("return currentRoomState && currentRoomState.round === 2 && currentRoomState.status === 'CUBE_OBSERVE'", 12000);
  await wait(400);

  // 核心验证：第 2 轮观察期状态
  const r2Observe = await host.eval(`
    return {
      roundText: document.getElementById('display-round')?.textContent,
      hasObserveHint: !!document.querySelector('.cube-observe-hint'),
      optionButtonsCount: document.querySelectorAll('.btn-cube-option').length,
      inputDisabled: document.getElementById('cube-direct-input')?.disabled,
      submitBtnDisabled: document.getElementById('cube-submit-btn')?.disabled,
      promptTitle: document.getElementById('cube-prompt-title')?.textContent
    };
  `);
  console.log('9. 【核心验证】第 2 轮观察期 DOM 状态:', r2Observe);

  if (r2Observe.optionButtonsCount !== 0) {
    throw new Error(`❌ 严重错误：第 2 轮观察期残留了 ${r2Observe.optionButtonsCount} 个旧选项按钮！`);
  }
  if (!r2Observe.hasObserveHint || !r2Observe.inputDisabled) {
    throw new Error('❌ 错误：第 2 轮观察期未正确锁定输入或未显示观察提示！');
  }
  console.log('✓ 验证通过：第 2 轮观察期已彻底杜绝上一轮旧选项残留与早按假死！');

  // 等待第 2 轮抢答期
  console.log('10. 等待第 2 轮观察期结束进入抢答期...');
  await host.waitFor("return currentRoomState && currentRoomState.round === 2 && currentRoomState.status === 'CUBE_GUESSING'", 10000);
  await wait(300);

  const r2Guess = await host.eval(`
    return {
      optionButtonsCount: document.querySelectorAll('.btn-cube-option').length,
      options: Array.from(document.querySelectorAll('.btn-cube-option')).map(b => b.textContent),
      inputDisabled: document.getElementById('cube-direct-input')?.disabled
    };
  `);
  console.log('11. 第 2 轮抢答期 DOM 状态:', r2Guess);
  if (r2Guess.optionButtonsCount !== 4) {
    throw new Error('第 2 轮抢答期未能生成 4 个选项！');
  }

  // 点击第 2 轮选项并验证
  console.log('12. 点击第 2 轮选项 2 提交答案');
  await host.eval("document.querySelectorAll('.btn-cube-option')[1].click();");
  await wait(400);

  const r2Submitted = await host.eval(`
    return {
      promptTitle: document.getElementById('cube-prompt-title')?.textContent,
      btnDisabled: document.querySelectorAll('.btn-cube-option')[1]?.disabled,
      inputValue: document.getElementById('cube-direct-input')?.value
    };
  `);
  console.log('13. 第 2 轮点击后即时反馈:', r2Submitted);
  if (!r2Submitted.btnDisabled || (!r2Submitted.promptTitle.includes('已提交') && !r2Submitted.promptTitle.includes('正确方块总数'))) {
    throw new Error('第 2 轮点击未得到即时反馈与锁定！');
  }

  console.log('\n====================================================');
  console.log('🎉 Chromium 真机 CDP 端到端多回合实战验证 100% 全部通过！');
  console.log('====================================================');

  chromeProc.kill();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ CDP 测试失败:', err);
  process.exit(1);
});
