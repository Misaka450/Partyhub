# 🎮 PartyHub (聚会游戏大厅)

一款专为聚会、团建、派对设计的 **全功能多人实时在线网页小游戏聚合平台**。基于 Node.js + Express + Socket.IO 构建，采用极简现代工业级暗色 UI 设计，全端（PC / 平板 / 手机移动端）完美自适应，支持多人实时房间对战、房主控制、WebRTC 实时语音连麦、战报结算与即时重置。

---

## ✨ 核心特性

- **🕹️ 19 款热门聚会与脑力小游戏一站式聚合**：涵盖反应类、益智类、阵营推理类、竞速手速类、几何空间类与记忆挑战类。
- **🎙️ WebRTC 实时语音连麦**：集成 P2P Mesh 语音、硬件级回声消除与降噪、声浪可视化，支持通过 Coturn TURN 穿透对称 NAT 与 4G/5G 移动网络，并兼容 RFC 5766 REST API 动态短效凭据与会话鉴权。
- **⚡ 极速加载与网络效率（维度二优化）**：
  - **Gzip/Brotli 高性能压缩**：集成 `compression` 中间件，静态文本资源传输体积缩减 **70%~80%**，首屏秒开；
  - **静态资源强弱协商缓存**：启用 `ETag` 与 `maxAge: 1d`，结合版本戳防穿透（`?v=1.1.0`）与 `<link rel="preload">` 核心文件预加载；
  - **合帧防抖与内存守卫**：画笔 rAF 批量合帧渲染；聊天与系统消息自动裁剪（上限保留 1000 条），杜绝长会话 DOM 膨胀。
- **🧩 插件化模块解耦架构（维度一优化）**：
  - **服务端游戏分发中心 (`gameDispatcher.js`)**：统一抽象动作注册表（Action Registry），集成了房间存在性验证、玩法匹配校验与异常隔离沙箱，彻底解除了 `server.js` 内部 30+ 处重复监听代码；
  - **前端插件插槽总线 (`window.PartyGames`)**：彻底终结 5,820 行“巨石文件”模式，将全部 19 款小游戏完整抽离为 `public/games/*.client.js` 独立模块，各游戏闭包作用域隔离、零命名冲突、即插即用，主干代码精简超 60%。
- **🛡️ 工业级安全与防作弊架构**：
  - 核心私密数据（卧底词、阿瓦隆角色、手牌、估数谜底）服务端单播隔离；
  - 观察类小游戏（瞬间数羊飞掠物）广播载荷剥离答案 ID 与目标标记，彻底根治控制台读包作弊；
  - 引入私密重连凭据 (`reconnectSecret`)，杜绝离线宽限期内凭公开 Token 冒名顶号劫持席位；
  - 集成 Helmet 安全响应头、HTTP 请求防刷限流、24点安全 Shunting-yard 表达式求值器（无 `eval`）、XSS 全方位转义与房间人数上限控制。
- **📱 移动端与桌面端全自适应**：
  - 顶栏极简紧凑单行玩家席位（1行4列流式布局，不挤占游戏画布）；
  - 底部手柄式实体双操作按键与全屏磨砂遮罩弹窗；
  - 针对 iOS Safari / Android Chrome 虚拟键盘弹出视口补偿。
- **👑 房主特权与房间生命周期**：支持一键切游、移交房主、踢出玩家、房间全员重置大厅、全员结算战报。
- **🐳 Docker 一键开箱即用**：采用非 root 安全用户打包，内置 Coturn TURN 中继服务，一键启动。

---

## 🎯 包含游戏列表 (共 19 款)

### 经典聚会游戏 (12 款)

| 序号 | 游戏名称 | 类型 | 玩法简介 | 独立客户端模块 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **🎨 你画我猜 (Draw & Guess)** | 绘画猜词 | 轮流作画、平滑贝塞尔画板、实时撤销清屏、抢答计分 | `drawGuess.client.js` |
| 2 | **🕵️ 谁是卧底 (Undercover)** | 阵营推理 | 随机抽取词语、轮流发言、首轮防死斗自保、平票决胜 PK | `undercover.client.js` |
| 3 | **🏰 阿瓦隆 (Avalon)** | 身份阵营 | 5-10 人经典规则，圆桌派系演说、组队远征、刺杀梅林 | `avalon.client.js` |
| 4 | **🃏 聚会 UNO (UNO)** | 卡牌对战 | 经典 UNO 机制，抽牌、变色、+2/+4 惩罚、抓未喊 UNO | `uno.client.js` |
| 5 | **💣 拆弹轮盘 (Bomb Roulette)** | 惊险博弈 | 轮流剪线博弈，真假引线与致命炸弹的心理战 | `partyArcade.client.js` |
| 6 | **⏱️ 盲压挑战 (Hold Five)** | 极限手感 | 3~10 秒随机目标时长，纯靠感知盲按计时，精准毫秒判定 | `holdFive.client.js` |
| 7 | **🔢 决战 24 点 (Math 24)** | 益智速算 | 拟真扑克发牌、高颜值虚拟算式键盘、纯前端逆波兰解析抢答 | `math24.client.js` |
| 8 | **🔤 词汇炸弹 (Word Bomb)** | 反应接龙 | 快速输入包含指定偏旁/关键词的词语，炸弹计时爆炸即淘汰 | `partyArcade.client.js` |
| 9 | **🔢 密码破解大师 (Bulls & Cows)** | 逻辑推理 | 破解 4 位不重复神秘数字，即时计算位置与数字命中情况 (几A几B) | `partyArcade.client.js` |
| 10 | **🍕 极限切披萨 (Perfect Slice)** | 几何直觉 | 划线切割动态形状，仪表盘实时评定切片比例精准度 | `perfectSlice.client.js` |
| 11 | **🧊 空间数方块 (Cube Count)** | 空间几何 | 3D 轴测等轴几何体生成，透视与盲区遮挡多维视角速算 | `cubeCount.client.js` |
| 12 | **🐑 瞬间数羊 (Flash Counter)** | 极速反应 | 动态视力大挑战，极短时间内统计动物数量、多寡对比或辨识幽灵动物 | `partyArcade.client.js` |

### 脑力与观察挑战游戏 (7 款 · 统一收录于 `brainGames.client.js`)

| 序号 | 游戏名称 | 类型 | 玩法简介 |
| :--- | :--- | :--- | :--- |
| 13 | **🎯 颜色与文字大陷阱 (Stroop Trap)** | 认知冲突 | 克服文字颜色与字义的斯特鲁普冲突，极速抢答正确答案 |
| 15 | **🔦 影子猜物 (Shadow Match)** | 剪影辨析 | 聚光灯扫过黑暗轮廓，在最模糊的剪影阶段猜出真实物体 |
| 17 | **🎵 西蒙节拍记忆 (Simon Memory)** | 声光节拍 | 观察越来越长的四色声光节奏序列，按正序或倒序完整复现 (`simonMemory.client.js`) |
| 18 | **🚂 轨道小火车 (Train Route)** | 拓扑寻路 | 观察混乱轨道，选择最正确的拼图让小火车顺利开往终点站 |
| 19 | **📄 折纸打孔展开图 (Hole Punch)** | 空间折叠 | 模拟纸张多次对称折叠打孔，在脑海中还原完全展开后的孔位分布 |
| 20 | **💵 找零大师 (Change Master)** | 算术模拟 | 面对顾客的大额钞票与刁钻账单，以最快速度清点出正确零钱组合 |
| 21 | **🎯 盲猜数量 (Number Guess)** | 估算直觉 | 绝不爆牌规则！面对常识谜题，估算数值最接近且不超过上限者获胜 |

---

## 🏗️ 项目架构与目录索引

```text
PartyHub/
├── server.js                     # 服务端启动入口（集成 Helmet、限流、Compression 压缩与静态托管）
├── gameDispatcher.js             # 【新增】游戏动作统一分发调度器（Action Registry，解耦核心）
├── games/                        # 19 款小游戏后端逻辑引擎（统一规范与生命周期）
│   ├── avalon.js
│   ├── cubeCount.js
│   ├── drawGuess.js
│   ├── perfectSlice.js
│   └── ... (共 19 款引擎)
├── public/                       # 前端静态资源
│   ├── index.html                # 单页应用入口（带静态资源预加载与版本缓存防穿透）
│   ├── game.js                   # 前端核心大厅通信总线（房间、聊天、音效、重连）
│   ├── style.css                 # 工业级响应式样式表
│   ├── voice.js                  # WebRTC P2P 实时语音管理模块
│   └── games/                    # 【新增】独立解耦的前端客户端小游戏插件目录
│       ├── avalon.client.js
│       ├── brainGames.client.js
│       ├── cubeCount.client.js
│       ├── drawGuess.client.js
│       ├── holdFive.client.js
│       ├── math24.client.js
│       ├── partyArcade.client.js
│       ├── perfectSlice.client.js
│       ├── simonMemory.client.js
│       ├── undercover.client.js
│       └── uno.client.js
├── tests/                        # 自动化质保与看门狗测试套件
│   ├── unit/                     # 单元与契约安全断言（71/71 项全绿）
│   ├── ux_cdp_watchdog.js        # 体验级 Chromium CDP 视觉与人机工程看门狗
│   └── lib/browser_launcher.js   # 跨平台浏览器探查与隔离沙箱
├── Dockerfile                    # 生产容器打包镜像
└── docker-compose.yml            # 包含 Coturn 语音中继的容器编排
```

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

# 4. 运行全套自动化测试（包含 71 项单元/契约测试与 4 大体验级看门狗）
npm test

# 5. 运行端到端联机实战测试（多玩家长流程实战链路）
npm run test:e2e
```

### 方式二：Docker / Docker Compose 部署（推荐，含 Coturn 语音中继）

```bash
# 1. 打开 docker-compose.yml 将 TURN_URL 中的 YOUR_SERVER_IP 修改为云服务器公网 IP
#    （如需启用 RFC 5766 动态短效凭据，可配置 TURN_SECRET 环境变量）
# 2. 启动应用与 Coturn 语音服务
docker compose up -d

# 3. 查看运行状态
docker compose ps
```

---

## 🛠️ 技术栈

- **Runtime**: Node.js
- **Backend**: Express, Socket.IO, Helmet, express-rate-limit, compression (HTTP 响应压缩), WebRTC 信令中继
- **Frontend**: Vanilla ES6+ JavaScript, CSS3 Variables, HTML5 Canvas, Web Audio API, WebRTC P2P Mesh
- **Architecture**: 插件式总线架构 (`gameDispatcher.js` + `window.PartyGames`)
- **Deployment**: Docker (非 root 安全容器), Docker Compose, Coturn (STUN/TURN 中继)
- **Quality & Testing**:
  - Node.js 内置 `node:test` 单元与集成测试框架（71 项严格断言）；
  - 19 款小游戏引擎统一规范与防作弊读包安全契约套件 (`engine_contract.test.js`)；
  - 4-Tier 真机无头 CDP 体验级看门狗 (`ux_cdp_watchdog.js`：参数穿透 / 视窗尺寸 / 光影对比度 / 颁奖台完整性 / 智能就绪轮询 / 隔离沙箱)；
  - 全流程联机端到端对战回归套件 (`test:e2e`)。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 授权协议。
