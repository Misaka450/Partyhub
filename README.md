# 🎮 PartyHub (聚会游戏大厅)

一款专为聚会、团建、派对设计的 **全功能多人实时在线网页小游戏聚合平台**。基于 Node.js + Express + Socket.IO 构建，采用极简现代工业级暗色 UI 设计，全端（PC / 平板 / 手机移动端）完美自适应，支持多人实时房间对战、房主控制、战报结算与即时重置。

---

## ✨ 核心特性

- **🕹️ 12 款热门聚会小游戏集成**：一站式聚合，涵盖反应类、益智类、阵营推理类、竞速手速类与社交互动类游戏。
- **⚡ 实时低延迟同步**：基于 WebSocket (Socket.IO) 双向通信，支持 0ms 本地乐观 UI 响应与后台唤醒保活重连。
- **📱 移动端与桌面端全自适应**：
  - 顶栏极简紧凑单行玩家席位（1行4列流式布局，不挤占游戏画布）。
  - 底部 3.5:6.5 手柄式实体双操作按键与全屏磨砂遮罩弹窗。
  - 针对 iOS Safari / Android Chrome 虚拟键盘弹出视口补偿。
- **👑 房主特权与房间生命周期**：支持一键切游、移交房主、踢出玩家、房间全员重置大厅、全员结算战报。
- **🐳 Docker 一键开箱即用**：轻量化容器打包，支持一键部署与 Nginx 反向代理。

---

## 🎯 包含游戏列表

| 序号 | 游戏名称 | 类型 | 玩法简介 |
| :--- | :--- | :--- | :--- |
| 1 | **🎨 你画我猜 (Draw & Guess)** | 绘画猜词 | 轮流作画、平滑贝塞尔画板、实时撤销清屏、抢答计分 |
| 2 | **🕵️ 谁是卧底 (Undercover)** | 阵营推理 | 随机抽取词语、轮流发言、首轮防死斗自保、平票决胜 PK |
| 3 | **🏰 阿瓦隆 (Avalon)** | 身份阵营 | 5-10 人经典规则，圆桌派系演说、组队远征、刺杀梅林 |
| 4 | **🃏 聚会 UNO (UNO)** | 卡牌对战 | 经典 UNO 机制，抽牌、变色、+2/+4 惩罚、抓未喊 UNO |
| 5 | **💣 拆弹轮盘 (Bomb Roulette)** | 惊险博弈 | 轮流剪线博弈，真假引线与致命炸弹的心理战 |
| 6 | **⏱️ 盲压挑战 (Hold Five)** | 极限手感 | 3~10 秒随机目标时长，纯靠感知盲按计时，精准毫秒判定 |
| 7 | **🔢 决战 24 点 (Math 24)** | 益智速算 | 拟真扑克发牌、高颜值虚拟算式键盘、实时解析合法性抢答 |
| 8 | **🔤 词汇炸弹 (Word Bomb)** | 反应接龙 | 快速输入包含指定偏旁/关键词的词语，炸弹计时爆炸即淘汰 |
| 9 | **🐂 猜数字几A几B (Bulls & Cows)** | 逻辑推理 | 破解 4 位不重复神秘数字，即时计算位置与数字命中情况 |
| 10 | **🍕 极限切披萨 (Perfect Slice)** | 几何直觉 | 划线切割动态形状，仪表盘实时评定切片比例精准度 |
| 11 | **🧊 空间数方块 (Cube Count)** | 空间几何 | 3D 轴测等轴几何体生成，透视与盲区遮挡多维视角速算 |
| 12 | **⚡ 闪电数数 (Flash Counter)** | 极速反应 | 瞬时闪烁 Emoji 阵列，在极短时间内准确统计目标元素数量 |

---

## 🚀 快速启动

### 方式一：Node.js 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/Misaka450/Partyhub.git
cd Partyhub

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
# 服务默认运行在 http://localhost:8080
```

### 方式二：Docker / Docker Compose 部署

```bash
# 启动容器
docker compose up -d

# 查看运行日志
docker compose logs -f
```

---

## 🛠️ 技术栈

- **Runtime**: Node.js
- **Backend**: Express, Socket.IO
- **Frontend**: Vanilla ES6+ JavaScript, CSS3 Variables, HTML5 Canvas
- **Deployment**: Docker, Docker Compose, Nginx Reverse Proxy
- **Testing**: Headless Chromium + Chrome DevTools Protocol (CDP) 逐帧联测

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 授权协议。
