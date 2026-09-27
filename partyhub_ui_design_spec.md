# PartyHub 聚会游戏大厅 · 架构与温润奶油治愈系 UI 重设计规范 (Design Spec for Stitch)

> **设计基调**：本规范以 PartyHub 当前真实的代码工程与功能实现为唯一基准，**完整收录全部 19 款小游戏的真实 DOM 架构与交互机制（无任何省略与合并）**，并将全站 UI 风格全面重塑为 **温润奶油治愈系 (Warm Creamy Healing Style)**。告别冷硬压抑的死黑或高饱和科技感，采用如同“热燕麦奶、厚切黄油吐司、森林小动物野餐”般的温润轻柔视感，给聚会中的朋友营造松弛、温馨、无压力的陪伴体验。

---

## 一、 当前真实项目结构与代码资产映射 (Codebase Structure)

PartyHub 采用 **极简原生单页架构 (Vanilla ES6+ SPA) + Node.js/Socket.IO 服务端**，无厚重打包工具，真实目录与文件结构如下：

```text
/opt/draw-guess/
├── server.js                          # Express HTTP服务 + Socket.IO 实时通信总线 + 静态托管与安全中间件
├── fsmEngine.js                       # 统一有限状态机：确定性授时时钟、增量状态同步 (Delta Diff)、动作防重放
├── gameDispatcher.js                  # 游戏动作统一调度总线 (Action Registry 动作注册表)
├── package.json                       # 依赖清单 (express, socket.io, helmet, compression 等)
├── Dockerfile & docker-compose.yml    # 容器化运行配置与 Coturn 语音中继穿透服务
│
├── data/ & 词库数据文件
│   ├── words.json                     # 你画我猜题库 (动物、生活用品、成语等)
│   ├── words_undercover.json          # 谁是卧底词库 (平民词/卧底词对)
│   └── data/dictionary.json           # 词汇炸弹/成语接龙合法汉字词典
│
├── games/                             # 19 款小游戏服务端逻辑引擎 (每个文件独立运行一个 FSM 状态机)
│   ├── drawGuess.js                   # 01. 你画我猜 (绘图抢答、积分结算)
│   ├── undercover.js                  # 02. 谁是卧底 (词语分发、轮流发言、投票放逐)
│   ├── avalon.js                      # 03. 阿瓦隆 (5-10人身份分配、组队表决、远征暗票、刺杀梅林)
│   ├── uno.js                         # 04. 聚会 UNO (出牌匹配、功能牌连环惩罚、抓未喊UNO)
│   ├── flashCounter.js                # 05. 瞬间数羊 (高速飞掠动态视力点数)
│   ├── bombRoulette.js                # 06. 拆弹轮盘 (剪彩色引线博弈)
│   ├── bullsAndCows.js                # 07. 几A几B / 密码破译大师 (4位不重复数字推理)
│   ├── math24.js                      # 08. 决战 24 点 (扑克发牌、逆波兰表达式抢答)
│   ├── cubeCount.js                   # 09. 空间数方块 (3D轴测立体堆叠速算)
│   ├── wordBomb.js                    # 10. 词汇炸弹 (指定词素或声韵接龙)
│   ├── perfectSlice.js                # 11. 极限切披萨 (图形切割、面积等分比计算)
│   ├── holdFive.js                    # 12. 盲压挑战 (随机3-10秒盲按，毫秒判定)
│   ├── stroopTrap.js                  # 13. 颜色与文字大陷阱 (斯特鲁普认知对抗)
│   ├── shadowMatch.js                 # 14. 影子猜物 (聚光灯黑色剪影辨析)
│   ├── simonMemory.js                 # 15. 西蒙节拍记忆 (四色声光步进序列)
│   ├── trainRoute.js                  # 16. 轨道小火车 (拓扑拼图引导进站)
│   ├── holePunch.js                   # 17. 折纸打孔展开图 (空间镜像对称还原)
│   ├── changeMaster.js                # 18. 找零大师 (收银找零面额速凑)
│   └── numberGuess.js                 # 19. 盲猜数量 (常识估算，绝不爆牌规则)
│
└── public/                            # 前端单页全部静态资产 (供 Stitch 替换与重构 UI)
    ├── index.html                     # 核心单页 HTML (包含所有屏幕容器、状态栏、舞台与模态弹窗)
    ├── game.js                        # 前端总控通信总线 (房间状态管理、聊天、音效、动效调度)
    ├── style.css                      # 全站 CSS 样式表 (当前待重构的设计样式资产)
    ├── voice.js                       # WebRTC P2P 实时语音管理与音频波形可视化
    ├── qrcode.min.js                  # 客户端离线二维码生成库
    └── games/                         # 19 款游戏前端解耦插件 (通过 window.PartyGames 注册)
        ├── drawGuess.client.js        # 01. 贝塞尔平滑画板与调色板工具栏
        ├── undercover.client.js       # 02. 卧底防偷窥翻牌与发言聚光灯
        ├── avalon.client.js           # 03. 阿瓦隆前台界面与阶段渲染
        ├── uno.client.js              # 04. UNO 弧形手牌渲染与出牌动效
        ├── partyArcade.client.js      # 05/06/07/10. 数羊、拆弹、几A几B、词汇炸弹前台聚合
        ├── math24.client.js           # 08. 扑克牌渲染与虚拟公式计算键盘
        ├── cubeCount.client.js        # 09. 3D数方块 Canvas 视窗与数字键盘
        ├── perfectSlice.client.js     # 11. 披萨切割拖拽手势与双指针仪表盘
        ├── holdFive.client.js         # 12. 盲压触控按键与时间差圆盘
        ├── simonMemory.client.js      # 15. 四色声光触控圆盘
        └── brainGames.client.js       # 13/14/16/17/18/19. 脑力综合前台 (颜色陷阱/影子猜物/轨道火车/折纸打孔/找零大师/盲猜数量)
```

---

## 二、 现有通用界面骨架与交互流转 (Universal UI Architecture)

前端整体为纯单页系统，通过 `#login-screen` 与 `#game-screen` 的切换驱动全局流转：

### 1. 登录通行证界面 (`#login-screen`)
- **主题切换胶囊**：浅色 / 深色模式快速切换。
- **玩家形象卡槽**：
  - 头像选择触控槽（点击呼出 12 款治愈小动物/角色头像弹窗：🐱 🐶 🐼 🦊 🐯 🐰 🚀 👑 🦄 🤖 🧙 𥷑）。
  - 玩家昵称输入框（最多 10 字）+ “🎲 换名”随机昵称骰子。
- **目标房间号卡槽**：
  - 房间号输入框（最多 12 位）+ “🎲 随机号”骰子。
  - **快捷直达标签 (Quick Chips)**：预置 `#888`、`#666`、`#123` 一键填入。
- **核心进入按钮**：“进入游戏房间”操作大按钮。

### 2. 房间主视图 (`#game-screen`)
#### (1) 顶部全局状态栏 (`.game-header`)
- **左侧状态区**：房间号胶囊（点击复制房间直链）、游戏玩法名称标签、轮次计数器（如 `轮次 1/3`）、在线人数胶囊（点击滑出侧边栏）。
- **右侧工具区**：房主专属“返回大厅”按键、退出房间按钮、动态倒计时秒表（等宽数字）、触觉震动开关、声音音效开关、主题切换开关、专属二维码弹窗开关、邀请分享按键。

#### (2) 主舞台等待大厅控制台 (`#lobby-card`)
- **全局指标看板**：在线状态、房间人数（如 `4/12`）、我的房间号、房主特权卡。
- **情境化引导横幅**：房主态显示“👑 请挑选游戏，并邀请好友入席开始对局”；客态显示“⏳ 房主正在挑选游戏并调整参数...”。
- **席位卡片浮岛 (`#lobby-seats-grid`)**：网格化紧凑展示 2~12 名入席玩家（头像、昵称、房主皇冠、麦克风声浪波纹）。
- **19 款游戏挑选网格 (`.game-tiles-grid`)**：
  - 分类过滤：`全部`、`经典 (Party)`、`手速 (Action)`、`益智 (Puzzle)`。
  - “🎲 盲盒抽选”随机抽选按钮。
  - 19 款小游戏双列卡片（含图标、标题、分类徽标、玩法定位、支持人数标签）。
- **玩法参数配置面板 (`#host-settings-container`)**：随当前选中游戏动态切换轮次、思考时间、特殊规则。
- **房主开局条**：“🚀 开始游戏”大按键。

#### (3) 玩家侧边栏抽屉 (`#player-sidebar`)
- 抽屉式侧边面板，列出所有玩家。
- 房主管理按钮：移交房主 (`👑`)、踢出房间 (`🚫`)。

#### (4) 底部协同坞 (Chat, Reactions & Voice Dock)
- **实时聊天面板**：可折叠展开，支持系统进出房/猜对消息与玩家打字发言，带未读计数气泡。
- **快捷轻量表情弹幕**：`👏` `❤️` `😂` `🔥` `💩` `🎉` 六款表情，点击在全屏漂浮升空。
- **WebRTC 实时语音状态**：麦克风开关、讲话时头像光圈与动态声浪波形。

#### (5) 全局弹窗模态体系 (Modals)
- **头像挑选弹窗 (`#avatar-modal`)**：12 款动物与角色网格，支持随机挑选。
- **二维码邀请海报 (`#qr-modal`)**：房间专属二维码海报，扫码极速进房。
- **游戏结算颁奖台 (`#gameover-modal`)**：冠亚季军领奖台 (Podium) + 积分榜单 + “再来一局/换游戏/返回大厅”按钮。

---

## 三、 温润奶油治愈系设计系统 (Warm Creamy Healing Design System)

请 Stitch 将原本冷硬或高对比度的视觉全面重塑为以下规范：

### 3.1 核心设计心流与视觉感受 (Visual Atmosphere)
- **意象映射**：热燕麦奶、厚切黄油吐司、森林小动物野餐、手工羊毛毡。
- **物理质感**：**Puffy & Organic (软糯微膨)**。去除锐利的 90 度直角，全面采用大圆角 (Squircle，`18px ~ 28px`)，搭配如同棉花糖或黄油般饱满微弹的按压反馈。
- **背景与呼吸感**：大面积留白与柔和低饱和暖色，深色模式转为“深夜暖炉木质调”。

### 3.2 奶油治愈系色彩体系 (Healing Color Palette)

| 语义角色 | 浅色模式 (Cream Day) | 深色模式 (Warm Hearth Night) | 治愈材质联想 |
| :--- | :--- | :--- | :--- |
| **画布底色 (Background Base)** | `#FAF7F2` (乳木燕麦白) | `#1F1B18` (暖烘栗子木) | 细腻棉麻纸张 / 暖炉木桌 |
| **卡片/浮岛表面 (Surface Card)** | `#FFFFFF` (纯鲜奶白，带软阴影) | `#2A2420` (深烘焙燕麦咖) | 蓬松厚切吐司 / 软软坐垫 |
| **主交互色 (Primary)** | `#FF8A3D` (日落暖柿橙) | `#FFA666` (暖阳枫糖) | 温暖壁炉、烘焙出炉的面包 |
| **经典品类强调色 (Party)** | `#F39C9B` (柔雾豆沙粉) | `#E08584` | 甜甜马卡龙、草莓奶冻 |
| **手速品类强调色 (Action)** | `#FF7062` (元气西柚暖红) | `#FF8A7E` | 软糖、活力小浆果 |
| **益智品类强调色 (Puzzle)** | `#70B9B0` (森林海盐鼠尾草绿) | `#8BC4BC` | 治愈抹茶、清爽森林微风 |
| **常态辅助色 (Accent)** | `#F3C766` (微甜奶黄) | `#E4B955` | 融化黄油、小雏菊 |
| **主标题字色 (Text Primary)** | `#3D352E` (浓缩摩卡深褐) | `#F6EFE9` (温润米浆白) | 告别死黑，温润易读不伤眼 |
| **次级说明字色 (Text Secondary)** | `#82776E` (温和燕麦灰褐) | `#B3A89F` (浅驼绒) | 柔和清晰的层级交代 |
| **柔和阴影 (Pillow Shadows)** | `0 8px 24px -4px rgba(138, 112, 89, 0.08)` | `0 8px 24px -4px rgba(0, 0, 0, 0.4)` | 像蓬松抱枕陷入沙发的柔软阴影 |

---

## 四、 19 款小游戏真实结构与温润奶油治愈系专属 UI 规格全集 (全部19款完整收录)

> **全部 19 款游戏逐一独立建档**，完整包含现存 DOM 容器 ID、现有交互组件与温润奶油治愈系重构方案。

---

### 01. 🎨 你画我猜 (Draw & Guess)
- **对应舞台容器**：`#stage-draw-guess` (客户端：`drawGuess.client.js`)
- **真实功能与组件**：
  - `#draw-turn-banner`：当前轮次横幅，左侧展示画师角色图标与状态，右侧为当前作画词语徽章 `#draw-word-badge`（仅画师可见）。
  - `#canvas-container` & `#game-canvas`：平滑贝塞尔作画画布，全端固定比例自适应。
  - `#drawing-toolbar`：画师工具栏（11 色彩盘滚动条、4 档笔刷尺寸、橡皮擦 `#btn-eraser`、撤销 `#btn-undo`、清空 `#btn-clear`）。
  - `#draw-guess-bar`：非画师实时抢答打字条，支持多次快速提交。
- **温润奶油治愈系重塑**：
  - 画板设计成一张纯白略带微光纤维纸质的温润素描本，四周有圆润的纸张小翻角。
  - 11 色调色盘设计成 11 颗圆滚滚的水彩颜料球（像装在小木盒里的马卡龙水彩），选中有轻微水珠高光。
  - 笔刷与橡皮擦采用可爱的木柄手绘插画图标；非画师抢答输入框像一条软糯的奶油泡芙条。

---

### 02. 🕵️ 谁是卧底 (Undercover)
- **对应舞台容器**：`#stage-undercover` (客户端：`undercover.client.js`)
- **真实功能与组件**：
  - `#uc-secret-card`：防偷窥翻转底牌卡片。点击在正面（“👁 点击查看/隐藏底牌”）与背面（身份标签与神秘词语 `#uc-word-text`）之间 3D 翻转。
  - `#uc-speaker-spotlight`：当前发言者聚光灯面板，含发言人头像、麦克风声浪动态波形 `#uc-voice-waves`、“🎤 开麦”与“发言完毕 ✓”按钮。
  - `#uc-player-grid`：存活玩家网格，在投票放逐阶段各玩家卡片亮起“放逐”投票按钮；PK 决胜阶段并列展示辩解卡片。
- **温润奶油治愈系重塑**：
  - 底牌设计成带有小熊锁扣的日记手帐本，触碰翻开带有柔和的纸张翻动与柔光。
  - 发言者聚光灯不是刺眼的舞台灯，而是柔和温暖的暖黄色床头台灯光晕，声浪像小跳跳豆上下起伏。
  - 玩家席位是毛茸茸的圆角小方垫，被淘汰玩家卡片盖上一枚可爱的“睡着了 💤”印章。

---

### 03. 🏰 阿瓦隆 (Avalon)
- **对应舞台容器**：`#stage-avalon` (客户端：`avalon.client.js`)
- **真实功能与组件**：
  - `#avalon-hero-card`：玩家个人专属角色卡，展示角色徽章（梅林/派西维尔/莫德雷德等）、阵营归属（正义/邪恶）及 `#av-seen-container` 感知到的同伴信息。
  - `#avalon-quest-track`：五轮圣杯远征轨迹，5 个任务节点展示所需出征人数与任务成败状态（金杯/破损杯）。
  - `#av-speech-panel`：线上发言聚光灯，显示当前发言人与麦序编号。
  - 专属模态弹窗：`#avalon-vote-modal` (组队表决：赞成/反对)、`#avalon-quest-modal` (执行远征：成功/破坏暗票)、`#avalon-assassin-modal` (刺客刺杀梅林选择)。
- **温润奶油治愈系重塑**：
  - 摆脱传统冷硬金属盔甲风，转化为“童话森林骑士团”风格。
  - 任务轨道上的圣杯设计成可爱的橡木金边小木杯，任务成功点亮一颗温润的小星星，失败则是一朵小雨云。
  - 身份卡片设计成童话绘本插画风格徽章；组队表决按钮是可爱的胡桃木盾牌与橄榄枝。

---

### 04. 🃏 聚会 UNO (UNO)
- **对应舞台容器**：`#stage-uno` (客户端：`uno.client.js`)
- **真实功能与组件**：
  - `#uno-opponents-strip`：对手席位横向条带，展示各对手剩余手牌张数与头像。
  - 牌桌中心弃牌堆与摸牌堆，展示当前台面顶牌、顺/逆时针出牌方向指示器。
  - `#uno-hand-container`：当前玩家手牌槽，卡牌弧形扇面排列，可出牌高亮、不可出牌置灰，点击平滑飞向弃牌堆。
  - 核心操作组件：大号“喊 UNO!”警报按键、摸牌按键、`#uno-color-modal` 变色转盘弹窗 (红/黄/蓝/绿)。
- **温润奶油治愈系重塑**：
  - UNO 扑克牌采用圆润的大倒角厚纸板材质，带有像刚拆封纸牌一样的柔软阴影。
  - 经典红黄蓝绿四色调低饱和度，调整为：草莓奶冻红、融化黄油黄、海盐薄荷蓝、抹茶浅绿。
  - 剩最后一张牌时，“喊 UNO!”按钮变成一个圆滚滚、急促摇晃的小铃铛。

---

### 05. 🐑 瞬间数羊 (Flash Counter)
- **对应舞台容器**：`#stage-flash-counter` (客户端：`partyArcade.client.js`)
- **真实功能与组件**：
  - `#flash-arena`：高速穿越通道，多只小羊或随机小动物以不同速度在 1.5 秒内高速横穿视窗。
  - `#flash-options-grid`：飞掠结束后瞬间浮现的数字速选按钮组。
  - 揭晓徽章：展示正确答案、玩家选择与用时。
- **温润奶油治愈系重塑**：
  - 穿越通道背景设计为柔和的草坡蓝天（像绘本里的青青草场）。
  - 奔跑的小羊是像棉花糖一样蓬松可爱的云朵小羊，奔跑时身后扬起小小的圆圈微尘。
  - 倒计时结束后的选项按钮像一块块软糯的羊奶软糖，点击有轻柔的啵声。

---

### 06. 💣 拆弹轮盘 (Bomb Roulette)
- **对应舞台容器**：`#stage-bomb-roulette` (客户端：`partyArcade.client.js`)
- **真实功能与组件**：
  - `#bomb-display`：中央炸弹道具装置，带脉冲闪烁的警示灯与剩余安全引线数统计。
  - `#bomb-wires-container`：彩色引线排架，玩家轮流点击选择一根剪断，服务端判定真假。
  - 触觉与音效联动：剪断安全引线发出“咔嚓”清脆声，剪中炸药触发全屏震动与爆炸动画。
- **温润奶油治愈系重塑**：
  - 拆弹装置不再是危险的黑色炸药，而是设计成一个“复古马戏团发条惊喜礼盒”或可爱的机械小怪兽。
  - 引线是马卡龙配色的软糯毛线或奶油彩带，剪刀是一把圆头复古小剪刀。
  - 引爆时不是血腥火光，而是全屏砰地爆出满天纷飞的彩纸花瓣、星星与爆米花。

---

### 07. 🔢 几A几B / 密码破译大师 (Bulls & Cows)
- **对应舞台容器**：`#stage-bulls-and-cows` (客户端：`partyArcade.client.js`)
- **真实功能与组件**：
  - `#bc-guess-input`：4 位不重复数字输入框，附带数字快捷软键盘。
  - `#bc-history-list`：推演历史瀑布流列表，每行展示猜测的 4 位数、绿色的 A 数量（位置与数字均正确）和黄色的 B 数量（数字正确位置不对）。
  - `#bc-scratchpad`：0~9 数字草稿板，供玩家点击划掉已排除的数字。
- **温润奶油治愈系重塑**：
  - 推演历史设计成一本暖黄色网格笔记本，手写体质感的数字记录。
  - A 命中（全对）用一颗温润的“小绿芽 🌱”或“小红心 ❤️”标记，B 命中（半对）用一颗“小向日葵 🌻”标记。
  - 草稿排除板像积木抽屉，划掉的数字变成淡淡的半透明燕麦色。

---

### 08. 🧮 决战 24 点 (Math 24)
- **对应舞台容器**：`#stage-math-24` (客户端：`math24.client.js`)
- **真实功能与组件**：
  - `#m24-cards-row`：展示 4 张随机抽取的扑克牌，点击卡牌可将其数值填入公式。
  - 实时公式解析显示框，支持逆波兰表达式高亮与括号配对检验。
  - 虚拟算术键盘（包含 `+`、`-`、`×`、`÷`、`(`、`)`、退格、清空、提交）。
- **温润奶油治愈系重塑**：
  - 4 张扑克牌设计成刚出炉的黄油小饼干，牌面花色是温润的暗红与燕麦灰。
  - 公式输入框像一块白色糖霜托盘，字符带圆体排版。
  - 算术软键盘按钮做成一颗颗像马卡龙一样的圆角软键，按压有果冻般的柔和弹性。

---

### 09. 🧊 空间数方块 (Cube Count)
- **对应舞台容器**：`#stage-cube-count` (客户端：`cubeCount.client.js`)
- **真实功能与组件**：
  - `#cube-canvas-wrapper`：基于 Canvas 渲染的等轴测 3D 随机几何方块堆叠，存在视觉盲区遮挡。
  - `#cube-control-panel`：1~30 的数字速选方阵键盘，支持玩家快速点击答案提交抢答。
- **温润奶油治愈系重塑**：
  - 3D 立体方块摆脱刺眼的冷光多边形，采用温润的马卡龙奶油原木积木材质（浅粉、浅黄、薄荷绿交替），边缘带有微妙的圆角光泽。
  - 底部作答键盘做成圆润的小琴键，点击时有清脆的木琴敲击音效。

---

### 10. 💥 词汇炸弹 (Word Bomb)
- **对应舞台容器**：`#stage-word-bomb` (客户端：`partyArcade.client.js`)
- **真实功能与组件**：
  - 倒计时炸弹道具，引信火花随时间缩短越烧越急。
  - 中央巨型词素卡片，展示当前要求的汉字偏旁、拼音生母或特定核心字（如“春”、“海”）。
  - 成语/词汇实时输入通道，校验词典合法性，回答正确炸弹转移至下家。
- **温润奶油治愈系重塑**：
  - 炸弹设计为一个圆滚滚、两颊带红晕的“小河豚”或“发条定时番茄”，快到时间时两腮气鼓鼓地变红。
  - 中央题目卡是柔和米黄色的识字卡片。
  - 答对时炸弹伴随一道柔和的彩虹弧线传给下一位玩家。

---

### 11. 🍕 极限切披萨 (Perfect Slice)
- **对应舞台容器**：`#stage-perfect-slice` (客户端：`perfectSlice.client.js`)
- **真实功能与组件**：
  - `#slice-canvas-box`：食物画布，展示随机生成的不规则多边形或圆形披萨。
  - 切割手势系统：单指拖拽画出切割直线，释放后实时切分为两块。
  - `#slice-meter-bar`：等分比双指针仪表盘，精准显示切分百分比（如 `49.8% : 50.2%`）与得分判定。
- **温润奶油治愈系重塑**：
  - 切割目标做成刚出炉的手工烘焙华夫饼、抹茶芝士蛋糕或芝士披萨，带有温润的焦糖边缘与小番茄点缀。
  - 切割线是像热黄油刀划过奶油般的柔光轨迹。
  - 结算仪表盘像一个可爱的烘焙秤盘，达到完美等分时跳出三颗旋转的小黄油块。

---

### 12. ⏱️ 盲压挑战 (Hold Five)
- **对应舞台容器**：`#stage-hold-five` (客户端：`holdFive.client.js`)
- **真实功能与组件**：
  - 目标时长横幅（如“目标：精准盲按 5.000 秒”）。
  - 全屏超大压感长按触控按键，手指按住开始计时，松开停止（前 1 秒显示读秒，随后隐藏）。
  - 极坐标时间差对比圆盘，展示每位玩家与目标时间的毫秒级偏差。
- **温润奶油治愈系重塑**：
  - 触控大按键设计成一个巨大的、圆滚滚的奶油黄色“布丁按键”，按下去时布丁向内凹陷微晃，松开时 duang 地回弹。
  - 倒计时隐去时，屏幕上飘过几只闭着眼睛数秒的可爱小树懒。
  - 结果比对圆盘像一个复古的手冲咖啡计时器。

---

### 13. 🎯 颜色与文字大陷阱 (Stroop Trap)
- **对应舞台容器**：`#stage-stroop-trap` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - 判定模式指示器，提示本轮规则是“请选文字含义”还是“请选字体颜色”。
  - 产生斯特鲁普认知冲突的大字卡片（例如用黄色字体写着“绿色”二字）。
  - 颜色候选按键网格，点击判定对错并记录毫秒级反应时间。
- **温润奶油治愈系重塑**：
  - 提示条采用柔雾马卡龙色胶囊，文字亲切柔和。
  - 冲突文字卡片像是一张温润的水彩画卡，字迹是饱满的圆体水彩字。
  - 选项按钮做成果酱小糖果盒，点错时伴随轻柔的果冻摇晃震动提示，不刺眼不紧张。

---

### 14. 🔦 影子猜物 (Shadow Match)
- **对应舞台容器**：`#stage-shadow-match` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - `#shadow-box-container`：探照灯黑影视窗，中央展示神秘物体的黑色剪影，随倒计时逐渐增强轮廓透光度。
  - `#shadow-options-grid`：4 个图文候选选项卡片，抢先选对真实物品名称者获得高分。
- **温润奶油治愈系重塑**：
  - 探照灯不是生硬的工业聚光灯，而是森林木屋里的暖黄煤油灯光晕。
  - 剪影来自可爱的小动物、茶壶、小提琴或面包机，边缘柔和。
  - 四个选项卡片是米白色的拍立得照片风格小卡，选中时照片边缘亮起淡淡暖阳黄光。

---

### 15. 🎵 西蒙节拍记忆 (Simon Memory)
- **对应舞台容器**：`#stage-simon-memory` (客户端：`simonMemory.client.js`)
- **真实功能与组件**：
  - 四象限环形触控声光圆盘（红/绿/蓝/黄）。
  - 序列步进指示器，展示当前序列长度。
  - 系统先依次发光并播放不同音高音符，随后玩家按原样点击复现，每轮递增一步。
- **温润奶油治愈系重塑**：
  - 圆盘设计成一个圆润的木质音乐盒，四个发光区域为柔和的草莓冻、抹茶冻、海盐冻与奶黄冻。
  - 音效采用温暖舒缓的马林巴木琴或八音盒铃音，点亮时像晨光透过滤镜般温润柔亮。

---

### 16. 🚂 轨道小火车 (Train Route)
- **对应舞台容器**：`#stage-train-route` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - 迷宫式铁轨拼图视窗，起点是蒸汽小火车头，终点是温馨站台，中间存在断开的铁轨空槽。
  - 底部备选铁轨碎片卡片托盘（包含直轨、转弯轨、立体交叉轨等）。
  - 玩家点击挑选正确拼图碎片补全轨道，小火车平滑行驶进站。
- **温润奶油治愈系重塑**：
  - 整个视窗像一张儿童原木玩具桌，铁轨是经典的木质玩具轨道。
  - 小火车是红绿配色的圆头复古小木车，烟囱噗噗冒出温润的小白棉花云朵。
  - 补齐轨道时木块卡扣发出温润的“咔哒”咬合声。

---

### 17. 📄 折纸打孔展开图 (Hole Punch)
- **对应舞台容器**：`#stage-hole-punch` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - `#hole-fold-info`：折纸步骤指引（如“1️⃣ 从左向右对折，2️⃣ 从下向上对折”）。
  - `#hole-folded-preview`：折叠后的微缩纸张展示区，并在角落用带色圆点标记打孔位置。
  - `#hole-options-grid`：4 个完整展开后的孔位对称候选矩阵图，考验空间镜像对称还原能力。
- **温润奶油治愈系重塑**：
  - 纸张采用质感极佳的手工和纸或水洗牛皮纸纹理，折痕带着温柔的棉麻虚线。
  - 打孔不是冰冷的黑点，而是打出一个可爱的心形或小星星孔。
  - 四个候选展开图展示在圆润的纸张卡片上，选中时有轻轻平摊纸张的动画。

---

### 18. 💵 找零大师 (Change Master)
- **对应舞台容器**：`#stage-change-master` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - `#cash-bill-receipt`：收银小票面板，清晰展示顾客支付面额 `#cash-paid-val`、商品消费总额 `#cash-cost-val` 与应找零金额 `#cash-due-val`。
  - `#cash-tray-status`：当前已选找零金额实时统计。
  - `#cash-chips-rack`：面额货币架（包含 ¥50、¥20、¥10、¥5、¥1 按钮，可多次累加）。
  - `#btn-cash-reset` (清空重选) 与 `#btn-cash-confirm` (确认找零交付)。
- **温润奶油治愈系重塑**：
  - 界面像森林里的一家松饼小铺收银台，小票是手撕牛皮纸边缘。
  - 钞票和硬币设计成圆滚滚的木质代币与橡果金币，面额数字字体温暖圆润。
  - 确认交付时，收银机发出一声清脆复古的“叮~”声，弹出可爱的小爱心。

---

### 19. 🔢 盲猜数量 (Number Guess)
- **对应舞台容器**：`#stage-number-guess` (客户端：`brainGames.client.js`)
- **真实功能与组件**：
  - `#number-trivia-card`：趣味常识科普题目卡（例如“国际象棋的标准棋盘上一共有多少个小方格？”、“一只成年长颈鹿平均身高多少厘米？”）。
  - `#number-guess-form`：数值输入框与量纲单位标签 `#number-unit-tag`（如“个”、“cm”、“千克”），提交估算按钮。
  - `#number-result-board`：开牌结果看板，采用经典“绝不爆牌”规则（超过真实答案者直接淘汰爆牌，在不超过者中取最接近者获胜）。
- **温润奶油治愈系重塑**：
  - 题目卡片是一张带有手绘小动物插画的百科小卡片。
  - 提交结果揭晓时，展示一把像木工卷尺一样的柔和刻度尺，标出真实答案位置。
  - 玩家的估算像一个个彩色小气球落在刻度线上，爆牌的气球变成小烟花飘散，最接近的获胜气球戴上一顶小王冠。

---

## 五、 移动端人机工程学规范 (Mobile Ergonomics)

Stitch 在生成设计时需严格满足移动端直觉操作：
1. **大拇指舒适操控区 (Thumb Zone)**：
   - 聊天栏唤起、开麦、表情弹幕、19 款游戏的操作按键（抢答、出牌、剪线、公式软键盘）必须位于屏幕下半区（底边距 `80px ~ 280px` 内）。
2. **软键盘防顶起保护**：
   - 你画我猜与聊天框聚焦输入时，主舞台核心内容（画布/题目）保持在视口可见区，不被移动端软键盘推飞。
3. **触控安全靶点**：
   - 所有触控组件、按钮、色块最小尺寸不低于 `44 × 44 pt`，圆角半径保持在 `18px ~ 26px`，保障高频防误触。

---

## 六、 交给 Stitch 的重设计提示词 (Stitch Master Prompt)

可以直接将以下 Prompt 复制并投喂给 Stitch 生成全套温润奶油治愈系界面原型：

```markdown
Design a warm, cozy, and delightful responsive Web UI/UX for "PartyHub" — an online multiplayer party game platform featuring 19 mini-games.

### Core Style: "Warm Creamy Healing" (温润奶油治愈系)
- Aesthetic Inspiration: Cozy Nordic bakery, Animal Crossing, warm oat milk latte, fluffy marshmallow pillows.
- Atmosphere: Relaxing, companionable, joyful, tactile, and stress-free. No harsh pitch-black or aggressive neon.
- Shapes: Soft organic squircle corners (border-radius: 20px-28px), pillow-like soft diffused shadows (`0 8px 24px -4px rgba(138, 112, 89, 0.08)`), bouncy tactile buttons.
- Color System:
  * Backgrounds: Warm Oat Cream (`#FAF7F2`), Pure Milk Card (`#FFFFFF`), Roasted Chestnut for dark mode (`#1F1B18`).
  * Accents: Sunset Persimmon Orange (`#FF8A3D`), Macaron Dusty Pink (`#F39C9B`), Sage Mint Green (`#70B9B0`), Butter Yellow (`#F3C766`).
  * Typography: Roasted Mocha (`#3D352E`), Soft Camel (`#82776E`).

### Complete Screen Flow & Archetypes to Generate:
1. Screen 1 - Cozy Player Passport (Login View):
   - Fluffy central card with cute animal emoji avatar selector (cat/dog/fox/rabbit), random nickname dice.
   - Quick room chips (#888, #666, #123) resembling soft candy pills.
   - Warm tactile primary CTA button: "Enter Party Room".

2. Screen 2 - Healing Lobby & Console:
   - Header with friendly status indicator and cozy room badge.
   - "Player Cushion Island": Seat slots for 2-12 players with cute status sprouts and soft speaker waves.
   - 19-Mini-Game Selection Grid: Filter tabs (All, Party, Action, Puzzle), a cute "Mystery Box 🎲" button, game cards looking like artisan dessert tiles.
   - Dynamic host rule configurator and prominent "Start Party 🚀" button.

3. Screen 3 - Universal Game Stage Frame (Mobile-first 393px + Desktop adaptive):
   - Minimalist warm header with round pill timer and collapsible player drawer.
   - Active Play Canvas: Clean, spacious, tactile buttons within bottom thumb zone.
   - Floating cloud-shaped chat drawer and floating balloon reaction emojis (👏 ❤️ 😂 🔥 🎉).

4. Screen 4 - Archetype Game Stages (Covering all 19 games):
   - Stage A (Draw & Guess): Sketchbook canvas with macaron watercolor paint palette.
   - Stage B (Undercover & Avalon): Peep-proof flipping role card, warm glowing spotlight on active speaker, fairy-tale holy grail quest track.
   - Stage C (UNO & Bomb Roulette): Rounded cozy cards with gentle fan-out; retro wind-up toy bomb with soft pastel snippable wires.
   - Stage D (Math 24 & Bulls and Cows): Butter biscuit poker cards with marshmallow math keypad; warm grid notebook deduction list.
   - Stage E (Brain Games): 3D wooden toy cubes (Cube Count), fluffy cloud sheep (Flash Counter), stroop color trap cards, vintage lantern shadow match, music box Simon memory, toy train tracks, origami fold punch, waffle pizza slice, pudding hold button, bakery cashier receipt, and trivia scale ruler.

5. Screen 5 - Celebratory Cream Cake Podium:
   - 3-tier round cake podium with gold/silver/bronze badges, gentle pastel confetti, detailed scoreboard, and "Play Again" buttons.
```
