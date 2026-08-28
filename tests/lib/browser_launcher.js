// 跨平台无头浏览器启动工具（供 tests/ 下的 CDP 脚本统一引用）
// 背景：原 16 个脚本硬编码 '/usr/bin/chromium-browser'（Linux 路径），
// 在 Windows/macOS 上启动即 ENOENT，CDP 测试套件实际覆盖为 0（审计 R2-22）
const fs = require('fs');
const path = require('path');

// 候选浏览器路径：Windows Edge/Chrome → Windows Chrome → Linux 各发行版 → macOS
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

// 环境变量优先：TEST_BROWSER=/path/to/browser 可覆盖自动探测
function findBrowserPath() {
  if (process.env.TEST_BROWSER && fs.existsSync(process.env.TEST_BROWSER)) {
    return process.env.TEST_BROWSER;
  }
  for (const p of BROWSER_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* 忽略 */ }
  }
  return null;
}

// 输出目录：tests/screens/（原脚本写 /tmp/ui_inspect 在 Windows 上不存在且无 mkdir）
function ensureScreensDir() {
  const dir = path.join(__dirname, '..', 'screens');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { findBrowserPath, ensureScreensDir, BROWSER_CANDIDATES };
