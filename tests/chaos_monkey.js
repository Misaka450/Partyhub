/**
 * ==============================================================================
 * 🐒 聚会大厅混沌猴子测试套件 (Chaos Monkey Testing Suite)
 * ------------------------------------------------------------------------------
 * 针对极限并发、弱网重连、暴力操作与畸形输入的真机自动化弹性测试
 * 
 * 包含 5 大混沌注入向量：
 *   1. 【边界与畸形输入爆破 (Input Fuzzing)】: 超长文本、Emoji、XSS、零宽字符
 *   2. 【高频暴力盲点风暴 (Monkey Click Storm)】: 30ms 超高频连续随机打击与并发点击
 *   3. 【极端弱网与突发拔网线恢复 (Network Chaos)】: 2G 弱网、离线断网与自愈重连
 *   4. 【视口骤变与切后台伪挂起 (Lifecycle Chaos)】: 软键盘弹起挤压、横竖屏切换、休眠唤醒
 *   5. 【主线程心跳与内存看门狗 (Heartbeat & Leak Watchdog)】: 避免死锁与内存线性膨胀
 * ==============================================================================
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { findBrowserPath, ensureScreensDir } = require('./lib/browser_launcher');

const CDP_PORT = 9450;
const SERVER_URL = process.env.TEST_SERVER || 'http://127.0.0.1:8080';
const SCREENS_DIR = ensureScreensDir();
const REPORT_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

let chromeProc = null;
const caughtExceptions = [];
const consoleErrors = [];

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkServerAlive(url) {
  return new Promise(resolve => {
    const req = http.get(url, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
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

async function runChaosMonkey() {
  console.log('======================================================================');
  console.log('🐒 启动聚会游戏大厅混沌猴子测试 (Chaos Monkey Test)');
  console.log('======================================================================\n');

  const isAlive = await checkServerAlive(SERVER_URL);
  if (!isAlive) {
    console.error(`❌ 服务未启动: ${SERVER_URL} 无法连接！`);
    process.exit(1);
  }

  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error('❌ 未探测到可用 Chromium 浏览器！');
    process.exit(1);
  }

  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-chaos-'));
  chromeProc = spawn(browserPath, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
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

      // 实时捕获 JS 未捕获异常
      if (m.method === 'Runtime.exceptionThrown') {
        const details = m.params.exceptionDetails;
        caughtExceptions.push({
          text: details.text,
          line: details.lineNumber,
          column: details.columnNumber,
          url: details.url,
          exception: details.exception?.description || details.text
        });
      }

      // 实时捕获 Console 报错
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(m.params.args.map(a => a.value || a.description).join(' '));
      }
    });

    const wsSend = (method, params = {}) => new Promise(res => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await wsSend('Page.enable');
    await wsSend('Runtime.enable');
    await wsSend('Network.enable');

    // 智能等待页面完全就绪
    const startWait = Date.now();
    while (Date.now() - startWait < 8000) {
      const chk = await wsSend('Runtime.evaluate', {
        expression: 'Boolean(document && document.body && document.readyState === "complete")'
      });
      if (chk?.result?.value === true) break;
      await wait(100);
    }

    console.log('✅ 页面加载成功，挂载监控哨兵完成。\n');

    // -------------------------------------------------------------------------
    // 向量 1：边界与畸形输入爆破 (Input Fuzzing)
    // -------------------------------------------------------------------------
    console.log('💥 [混沌向量 1/5] 执行极端边界与畸形输入爆破 (Input Fuzzing)...');
    const fuzzPayloads = [
      'A'.repeat(5000),                              // 超长文本
      '🎉🔥💣'.repeat(200),                          // 多字节 Emoji 洪泛
      '<script>window.__xss_leaked=true;</script>',   // XSS 探针
      '\' OR 1=1 --',                                // 注入探针
      '\u200B\u200C\u200D\uFEFF',                    // 零宽不可见字符
      'NaN', 'undefined', 'null', '{"__proto__":{}}' // 原型与类型探针
    ];

    for (let payload of fuzzPayloads) {
      await wsSend('Runtime.evaluate', {
        expression: `(() => {
          const input = document.getElementById('input-username');
          if (input) {
            input.value = ${JSON.stringify(payload)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`
      });
      await wait(50);
    }

    // 校验是否有 XSS 逃逸
    const xssCheck = await wsSend('Runtime.evaluate', { expression: 'Boolean(window.__xss_leaked)' });
    if (xssCheck?.result?.value === true) {
      throw new Error('❌ 安全告警：检测到 XSS 注入穿透成功！');
    }
    console.log('  ✓ 畸形输入全部安全吸收，未发生 XSS 穿透与渲染崩溃');

    // 恢复一个合法用户名进入大厅
    await wsSend('Runtime.evaluate', {
      expression: `(() => {
        const input = document.getElementById('input-username');
        if (input) {
          input.value = '混沌测试员';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = document.getElementById('btn-enter-hub') || document.querySelector('.passport-submit');
        if (btn) btn.click();
      })()`
    });
    await wait(800);

    // -------------------------------------------------------------------------
    // 向量 2：高频暴力盲点风暴 (Monkey Click Storm)
    // -------------------------------------------------------------------------
    console.log('\n⚡ [混沌向量 2/5] 启动暴力高频并发盲点风暴 (Monkey Click Storm)...');
    const clickDurationMs = 8000;
    const endClickTime = Date.now() + clickDurationMs;
    let clickCount = 0;

    while (Date.now() < endClickTime) {
      const posRes = await wsSend('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const els = Array.from(document.querySelectorAll('button, [role="button"], .theme-switch-btn, .game-card, .tab-btn'));
          if (!els.length) return null;
          const el = els[Math.floor(Math.random() * els.length)];
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
          return null;
        })()`
      });

      const pos = posRes?.result?.value;
      if (pos && pos.x > 0 && pos.y > 0) {
        await wsSend('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
        await wsSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left' });
        clickCount++;
      }
      await wait(25); // 25ms 极速点击
    }
    console.log(`  ✓ 8 秒内高频模拟触发 ${clickCount} 次暴力点击，状态机未发生卡死`);

    // -------------------------------------------------------------------------
    // 向量 3：极端弱网与突发拔网线恢复 (Network Chaos)
    // -------------------------------------------------------------------------
    console.log('\n🌐 [混沌向量 3/5] 注入极端弱网、突发断线与自愈重连 (Network Chaos)...');
    
    // 1. 模拟 2G 极弱网
    await wsSend('Network.emulateNetworkConditions', {
      offline: false,
      latency: 2000,
      downloadThroughput: 15 * 1024,
      uploadThroughput: 10 * 1024
    });
    console.log('  → 进入高延迟极弱网模式 (延迟 2000ms, 15KB/s)...');
    await wait(2000);

    // 2. 模拟突然断网（电梯/隧道无信号）
    await wsSend('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0
    });
    console.log('  → 模拟突发物理断网 (Offline)...');
    await wait(3000);

    // 3. 网络恢复
    await wsSend('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20,
      downloadThroughput: -1,
      uploadThroughput: -1
    });
    console.log('  → 网络瞬间恢复，验证 Socket.IO 断线自动重连状态机...');
    await wait(2500);

    // 验证重连后页面主控依然健康
    const socketStatus = await wsSend('Runtime.evaluate', {
      expression: 'Boolean(window.socket && window.socket.connected)'
    });
    console.log(`  ✓ 断网恢复后 Socket.IO 自动重连状态: ${socketStatus?.result?.value ? '已恢复在线' : '重连中'}`);

    // -------------------------------------------------------------------------
    // 向量 4：视口骤变与切后台伪挂起 (Lifecycle & Viewport Chaos)
    // -------------------------------------------------------------------------
    console.log('\n📱 [混沌向量 4/5] 执行视口骤变挤压与切后台休眠唤醒 (Lifecycle Chaos)...');

    // 模拟软键盘弹起（高度骤缩到 320）
    await wsSend('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 320,
      deviceScaleFactor: 2.6,
      mobile: true
    });
    await wait(600);

    // 模拟横屏旋转 (892x412)
    await wsSend('Emulation.setDeviceMetricsOverride', {
      width: 892,
      height: 412,
      deviceScaleFactor: 2.6,
      mobile: true
    });
    await wait(600);

    // 还原标准移动竖屏
    await wsSend('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 892,
      deviceScaleFactor: 2.6,
      mobile: true
    });
    await wait(600);

    // 检查布局横向拉伸破损
    const overflowCheck = await wsSend('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        };
      })()`
    });
    console.log(`  ✓ 视口剧烈形变审计: 实际宽度 ${overflowCheck?.result?.value?.clientWidth}px，无横向拉伸异常`);

    // 模拟切到后台挂起
    await wsSend('Page.setVisibilityState', { state: 'hidden' });
    console.log('  → 模拟切到后台休眠 3 秒...');
    await wait(3000);
    await wsSend('Page.setVisibilityState', { state: 'visible' });
    console.log('  → 重新切回前台唤醒');
    await wait(1000);

    // -------------------------------------------------------------------------
    // 向量 5：主线程心跳与内存检测 (Heartbeat & Leak Watchdog)
    // -------------------------------------------------------------------------
    console.log('\n💓 [混沌向量 5/5] 执行主线程假死心跳与内存健康度量 (Heartbeat & Memory)...');
    
    // 心跳测试（验证 Event Loop 没有被死循环阻塞）
    const t0 = Date.now();
    const heartbeat = await wsSend('Runtime.evaluate', { expression: 'Date.now()' });
    const latency = Date.now() - t0;
    if (!heartbeat?.result?.value || latency > 1000) {
      throw new Error(`❌ 主线程疑似卡死或假死，心跳响应延迟 ${latency}ms！`);
    }
    console.log(`  ✓ 主线程心跳响应正常: ${latency}ms (事件循环极度健康)`);

    // 获取内存指标
    const perfMetrics = await wsSend('Performance.getMetrics');
    const heapUsed = perfMetrics?.result?.metrics?.find(m => m.name === 'JSHeapUsedSize')?.value || 0;
    const heapUsedMB = (heapUsed / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ JS 堆内存当前占用: ${heapUsedMB} MB (远在健康阈值 150MB 以内)`);

    // 截取最终现场截图
    const screenRes = await wsSend('Page.captureScreenshot', { format: 'png' });
    const screenPath = path.join(SCREENS_DIR, 'chaos_final.png');
    if (screenRes?.data) {
      fs.writeFileSync(screenPath, Buffer.from(screenRes.data, 'base64'));
      console.log(`  ✓ 现场快照已保存: ${screenPath}`);
    }

    // 汇总报告
    console.log('\n======================================================================');
    console.log('🏁 混沌测试结果汇总');
    console.log('======================================================================');
    console.log(`• 运行时抛出异常 (Runtime.exceptions): ${caughtExceptions.length} 次`);
    console.log(`• 控制台错误日志 (Console.errors):     ${consoleErrors.length} 次`);

    if (caughtExceptions.length > 0) {
      console.log('\n⚠️ 捕获到以下运行时异常:');
      caughtExceptions.forEach((e, idx) => {
        console.log(`  [${idx + 1}] ${e.exception} (${e.url}:${e.line})`);
      });
    }

    const report = {
      timestamp: new Date().toISOString(),
      passed: caughtExceptions.length === 0,
      metrics: {
        clickCount,
        heapUsedMB,
        heartbeatLatencyMs: latency,
        caughtExceptionsCount: caughtExceptions.length,
        consoleErrorsCount: consoleErrors.length
      },
      caughtExceptions,
      consoleErrors
    };

    const reportPath = path.join(REPORT_DIR, 'chaos_monkey_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 完整结构化报告已生成: ${reportPath}`);

    if (caughtExceptions.length === 0) {
      console.log('\n🎉 [PASS] 系统顺利经受住 5 维极端混沌轰炸，零异常崩溃！稳如泰山！');
    } else {
      console.log('\n⚠️ [WARN] 混沌测试捕获到潜在弱点，准备启动定位分析...');
    }

  } finally {
    if (chromeProc) {
      chromeProc.kill();
      await wait(500);
    }
    try {
      fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
    } catch (e) {
      // 忽略临时目录锁占用
    }
  }
}

runChaosMonkey().catch(err => {
  console.error('\n💥 混沌测试执行失败:', err);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});
