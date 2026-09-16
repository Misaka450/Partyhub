# 🎮 PartyHub (聚会游戏大厅)

一款专为聚会、团建、派对打造的 **商业级多人实时在线网页小游戏聚合平台**。基于 Node.js + Express + Socket.IO 构建，采用精致典雅的 **Modern Neo-Skeuomorphic Clean (现代微质感浅色)** 设计风格，全端（PC / 平板 / 手机移动端）完美自适应。支持多人实时联机、房主房间管理、WebRTC 实时语音连麦、统一有限状态机 (FSM) 与确定性网络同步架构。

---

## ✨ 核心特性

- **🕹️ 19 款精选聚会与脑力小游戏一站式聚合**：
  - 涵盖经典聚会对抗（你画我猜、谁是卧底、阿瓦隆、UNO、拆弹轮盘等）；
  - 深度脑力思维挑战（瞬间数羊、空间数方块、找零大师、折纸打孔、西蒙记忆等）。
- **🧠 FSM 统一状态机与增量同步架构 (借鉴 Boardgame.io 设计思想)**：
  - **确定性授时时钟 (Deterministic Authoritative Clock)**：以服务器授时为权威基准，消除跨设备时钟漂移与网络抖动造成的倒计时不一致；
  - **Delta 增量状态同步 (Delta Diff Sync)**：自动进行新旧状态深层比对，仅下发发生变化的增量字段，广播带宽开销降低 **70%~80%**；
  - **动作原子性与防重放 (Action Mutex & Seq)**：引入全局动作互斥锁与递增流水号机制，彻底杜绝客户端并发狂点、网络重放与竞态脏数据；
  - **安全视口投影 (PlayerView)**：在 FSM 状态投影层针对不同玩家严格过滤私密数据（如手牌、身份、卧底词），杜绝内存越权与外挂作弊。
- **� Modern Neo-Skeuomorphic 现代微质感浅色 UI**：
  - 告别昏暗压抑，全面升级为温润优雅的浅色微质感大厅风格；
  - 具备真实的物理按压反馈（`:hover` 柔和升起、`:active` 凹陷动效与轻快音效），卡片层次自然立体，视效清爽通透。
- **�🎙️ WebRTC 实时语音连麦**：
  - 原生支持 P2P Mesh 语音连麦，具备硬件级回声消除 (AEC)、自动增益 (AGC) 与噪声抑制 (ANS)；
  - 实时声浪动态可视化波形，集成 Coturn TURN 穿透 NAT 与 4G/5G 移动网络，兼容 RFC 5766 动态短效凭据。
- **⚡ 极速加载与网络性能优化**：
  - **Gzip/Brotli 传输压缩**：集成 `compression` 中间件，静态资源体积压缩 **70%+**，首屏极速加载；
  - **强弱协商缓存策略**：启用 `ETag` 与 `maxAge`，结合静态资源预加载 (`<link rel="preload">`) 与版本缓存防穿透；
  - **合帧防抖与 DOM 守卫**：画笔轨迹基于 `requestAnimationFrame` 批量合帧渲染，聊天与系统消息自动裁剪（上限保留 1000 条），防止长会话内存膨胀。
- **🧩 插件化高内聚解耦架构**：
  - **服务端分发调度器 (`gameDispatcher.js`)**：统一抽象动作注册表（Action Registry），集成了房间存在性验证、玩法匹配校验与异常隔离沙箱，告别臃肿的嵌套监听；
  - **前端插件插槽总线 (`window.PartyGames`)**：19 款小游戏全部独立抽离为 `public/games/*.client.js`，闭包作用域隔离、零命名冲突、即插即用，主干大厅逻辑精简超 60%。
- **🛡️ 工业级安全与防作弊体系**：
  - 核心私密数据（卧底词、阿瓦隆角色、UNO 手牌、盲猜谜底）由服务端单独下发，不参与公共广播；
  - 瞬间数羊等观察类小游戏广播载荷剔除答案标记，杜绝控制台读包作弊；
  - 引入私密重连凭据 (`reconnectSecret`)，防止他人冒名顶号劫持玩家座位；
  - 集成 Helmet 安全响应头、HTTP 接口限流防刷、24 点安全逆波兰/调度场表达式解析器（彻底禁用 `eval`）以及全链路 XSS 实体转义。
- **📱 全端全尺寸完美自适应**：
  - 顶栏极简流式玩家席位，紧凑优雅，不挤占游戏主画布；
  - 针对手机竖屏与横屏优化触控交互，支持 iOS Safari / Android Chrome 软键盘唤起防遮挡补偿。
- **👑 房主管理与房间完整生命周期**：
  - 支持一键切换游戏、转交房主、踢出离线/挂机玩家、重置大厅与全员对战战报结算。
- **🐳 Docker 一键容器化交付**：
  - 包含非 root 安全容器构建、内置 Coturn 语音穿透服务编排，开箱即用。

---

## 🎯 包含游戏列表 (共 19 款)

### 经典聚会游戏 (12 款)

| 序号 | 游戏名称 | 核心类型 | 玩法简介 | 独立客户端模块 |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **🎨 你画我猜 (Draw & Guess)** | 绘画猜词 | 轮流作画、平滑贝塞尔画板、实时撤销与清屏、抢答计分 | `drawGuess.client.js` |
| **02** | **🕵️ 谁是卧底 (Undercover)** | 阵营推理 | 随机分配词语、轮流陈述、首轮防自爆保护、平票决胜 PK | `undercover.client.js` |
| **03** | **🏰 阿瓦隆 (Avalon)** | 身份阵营 | 5~10 人经典规则，圆桌组队提案、远征投票、刺杀梅林 | `avalon.client.js` |
| **04** | **🃏 聚会 UNO (UNO)** | 卡牌对战 | 经典 UNO 机制，手牌匹配、功能牌连环惩罚、抓未喊 UNO | `uno.client.js` |
| **05** | **💣 拆弹轮盘 (Bomb Roulette)** | 心理博弈 | 轮流剪断彩色引线，真假引线与致命炸药的心跳博弈 | `partyArcade.client.js` |
| **06** | **⏱️ 盲压挑战 (Hold Five)** | 极速手感 | 3~10 秒随机目标时长，纯靠内心节奏盲按，毫秒级判定 | `holdFive.client.js` |
| **07** | **🔢 决战 24 点 (Math 24)** | 益智速算 | 拟真扑克发牌、高颜值公式虚拟键盘、逆波兰表达式抢答 | `math24.client.js` |
| **08** | **🔤 词汇炸弹 (Word Bomb)** | 词汇反应 | 在倒计时内输入包含指定词素或声韵的词语，超时即淘汰 | `partyArcade.client.js` |
| **09** | **🔢 密码破解大师 (Bulls & Cows)** | 逻辑推理 | 破解 4 位神秘不重复数字，实时反馈位置与数字命中 (几A几B) | `partyArcade.client.js` |
| **10** | **🍕 极限切披萨 (Perfect Slice)** | 几何直觉 | 拖拽画线切割随机不规则图形，仪表盘实时评估面积等分比 | `perfectSlice.client.js` |
| **11** | **🧊 空间数方块 (Cube Count)** | 空间几何 | 3D 轴测等轴几何体随机堆叠，透视遮挡下的盲区空间速算 | `cubeCount.client.js` |
| **12** | **🐑 瞬间数羊 (Flash Counter)** | 动态视力 | 多只动物高速穿屏掠过，比拼视网膜留存记忆与瞬间点数 | `partyArcade.client.js` |

### 脑力与观察挑战游戏 (7 款)

| 序号 | 游戏名称 | 核心类型 | 玩法简介 | 独立客户端模块 |
| :---: | :--- | :--- | :--- | :--- |
| **13** | **🎯 颜色与文字大陷阱 (Stroop Trap)** | 认知对抗 | 克服“文字语义”与“字体颜色”的斯特鲁普冲突，快速选对目标 | `brainGames.client.js` |
| **14** | **🔦 影子猜物 (Shadow Match)** | 剪影辨析 | 探照灯照亮神秘物体黑色剪影，凭借轮廓直觉抢先选出真相 | `brainGames.client.js` |
| **15** | **🎵 西蒙节拍记忆 (Simon Memory)** | 声光记忆 | 观察四色声光节拍序列并复现，序列逐轮变长，挑战脑力极限 | `simonMemory.client.js` |
| **16** | **🚂 轨道小火车 (Train Route)** | 拓扑寻路 | 观察分叉铁轨拼图，挑选唯一点位补全轨道引导火车进站 | `brainGames.client.js` |
| **17** | **📄 折纸打孔展开图 (Hole Punch)** | 空间折叠 | 纸张经多次折叠并打孔，在脑海中空间对称还原展开后的孔洞 | `brainGames.client.js` |
| **18** | **💵 找零大师 (Change Master)** | 算术模拟 | 面对顾客的大额钞票与刁钻消费额，以最快速度组装正确找零 | `brainGames.client.js` |
| **19** | **🎯 盲猜数量 (Number Guess)** | 常识估算 | “绝不爆牌”规则！针对趣味常识问题，估值最接近且不超标者胜 | `brainGames.client.js` |

---

## 🏗️ 项目架构与目录索引

```text
PartyHub/
├── server.js                     # 服务端启动入口（Express + Socket.IO + 安全中间件 + 静态托管）
├── fsmEngine.js                  # 【FSM引擎】确定性授时、Delta增量同步、动作防重放与视口隔离
├── gameDispatcher.js             # 【调度总线】游戏动作统一分发调度器（Action Registry 解耦核心）
├── games/                        # 19 款小游戏服务端逻辑引擎
│   ├── avalon.js
│   ├── cubeCount.js
│   ├── drawGuess.js
│   ├── perfectSlice.js
│   ├── uno.js
│   └── ... (共 19 款服务端核心模块)
├── public/                       # 前端客户端静态资源
│   ├── index.html                # 单页应用入口（带静态资源预加载与版本缓存防穿透）
│   ├── game.js                   # 前端核心大厅通信总线（房间状态、聊天、音效、重连）
│   ├── style.css                 # 现代浅色微质感响应式样式表 (Neo-Skeuomorphic)
│   ├── voice.js                  # WebRTC P2P 实时语音通话管理模块
│   └── games/                    # 前端各游戏解耦客户端插件
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
│   ├── unit/                     # 单元与契约安全测试（FSM、安全读包、生命周期全绿）
│   ├── test_human_playtest.js    # 19 款全量拟人端到端真机联机实战测试
│   ├── ux_cdp_watchdog.js        # Chromium CDP 视觉规范与人机工程体验级看门狗
│   └── lib/browser_launcher.js   # 跨平台浏览器自动化探查与隔离沙箱
├── Dockerfile                    # 生产容器打包镜像（非 root 安全用户）
└── docker-compose.yml            # 包含 Coturn 语音中继的容器编排
```

---

## 🚀 快速启动

### 方式一：Node.js 本地运行

```bash
# 1. 克隆代码仓库
git clone https://github.com/Misaka450/Partyhub.git
cd Partyhub

# 2. 安装项目依赖
npm install

# 3. 启动开发服务器
npm start
# 启动成功后，浏览器访问: http://localhost:8080

# 4. 运行全套自动化测试 (单元测试 + 状态机验证 + 体验级看门狗)
npm test

# 5. 运行 19 款小游戏全量拟人端到端自动化实战测试
npm run test:human

# 6. 单独运行 Chromium CDP 视觉与体验看门狗检测
npm run test:watchdog
```

### 方式二：Docker / Docker Compose 部署（推荐用于生产环境）

```bash
# 1. 打开 docker-compose.yml，将 TURN_URL 中的 YOUR_SERVER_IP 替换为云服务器公网 IP
#    （如需启用 RFC 5766 动态短效凭据，可一并配置 TURN_SECRET 环境变量）
# 2. 一键启动应用与 Coturn 语音穿透服务
docker compose up -d

# 3. 查看容器运行状态
docker compose ps
```

---

## 🛠️ 技术栈清单

- **运行环境 (Runtime)**: Node.js (>= 18.0.0)
- **后端框架 (Backend)**:
  - `Express` - HTTP 服务与静态资源托管
  - `Socket.IO` - 双向低延迟实时通信与房间信令广播
  - `Helmet` & `express-rate-limit` - Web 安全防护头与防刷频频控
  - `compression` - Gzip / Deflate 极速文本压缩传输
- **核心架构 (Architecture)**:
  - **FSM 统一状态机 (`fsmEngine.js`)** - 确定性时钟、Delta 增量状态 Diff、动作流水号互斥
  - **插件化调度器 (`gameDispatcher.js` & `window.PartyGames`)** - 客户端与服务端插槽总线
- **前端技术 (Frontend)**:
  - 原生现代 JavaScript (Vanilla ES6+)
  - 现代浅色微质感 CSS 变量系统 (Modern Neo-Skeuomorphic Clean)
  - HTML5 Canvas 绘图与几何交互引擎
  - Web Audio API 拟真触感音效系统
  - WebRTC P2P Mesh 实时音频通话
- **质量保障与测试体系 (QA & Testing)**:
  - `node:test` 内置测试框架（覆盖全部 19 款游戏生命周期与边界断言）
  - 拟人真机端到端全量对战套件 (`test_human_playtest.js`)
  - 4-Tier Chromium CDP 体验级看门狗 (`ux_cdp_watchdog.js`：参数穿透 / 视窗尺寸 / 光影对比度 / 颁奖台完整性 / 隔离沙箱)

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 授权协议。欢迎 Star、Fork 与提交 Pull Request！
