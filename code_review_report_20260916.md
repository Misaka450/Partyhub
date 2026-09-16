# PartyHub 全量代码审查报告（正确性与稳定性专项）

> **审查日期**：2026-09-16
> **审查范围**：全仓库逐文件精读 —— `server.js` / `fsmEngine.js` / `gameDispatcher.js`、`games/` 19 个引擎、`public/game.js` / `voice.js` / `index.html`、`public/games/` 11 个客户端插件（约 1.7 万行）
> **关注重点**：正确性与稳定性（逻辑错误、死锁卡死、定时器/监听器泄漏、断线重连一致性、边界崩溃、计分错误）；安全问题仅在影响正确性时一并报告
> **测试基线**：审查开始时运行全部 7 个单元/契约测试文件，**70/70 全部通过，0 失败**
> **复核方式**：全部 Critical 与 High 发现均由主审查人逐行回到源码二次验证；1 条子审查疑似 High 经复核判定为误报（见附录 B）

---

## 一、总体评价

项目整体架构成熟度高：19 个引擎全部同步实现（无 async 竞态）、定时器统一挂在 `room.timer/roundTimeout` 两个句柄上且切游戏/回大厅/空房回收/优雅关停四条路径均有清理、私密数据不下公共广播、房主权限校验完备、前端玩家可控数据基本全部经过 `escapeHtml`。这些在本次审查中逐一复核确认，**不是纸面声明**。

但本次全量复查仍发现 **2 个 Critical、9 个 High、24 个 Medium** 及一批 Low，集中在三类场景：

1. **玩家非正常离场（掉线/被踢/中途退房）后的善后不完整** —— 幽灵 token 污染队伍、作答残留挤占名次、计时器被无关离场重置；
2. **最新 FSM 重构提交 `5ead732` 引入或带回归的问题** —— 语音监听防重入守卫丢失（旧报告称已修复，现网代码中不存在）、80ms 全局防抖误杀快速连点、Delta 删键语义丢失（目前因无人消费而潜伏）；
3. **移动端边界交互** —— 触摸中断（`touchcancel` 缺失）后状态标志悬空、旧内核无 `roundRect` polyfill 白屏。

### 问题分布统计

| 严重级别 | 服务端核心 | 游戏引擎 | 前端核心 | 前端插件 | 合计 |
|---|:---:|:---:|:---:|:---:|:---:|
| 🔴 Critical | 1 | 1 | 0 | 0 | **2** |
| 🟠 High | 1 | 2 | 3 | 1 | **9** |
| 🟡 Medium | 4 | 10 | 4 | 6 | **24** |
| 🟢 Low | 6 | 13 | 8 | 10+ | **37+** |

---

## 二、🔴 Critical（必须最优先修复）

### C1. 重连凭据校验存在两条绕过路径，90 秒离线窗口内可接管任意席位（含房主）

**位置**：[server.js:363-384](server.js#L363-L384)

这是 2026-09-10 安全审计已指出、**至今未修复**的问题，本次确认绕过路径实际有两条：

**路径 A：空值短路绕过（363-369 行）**

```js
if (player) {
  if (player.reconnectSecret && reconnectSecret && player.reconnectSecret !== reconnectSecret) {
    player = null;   // 三个条件全真才拒绝
  } else if (player.name !== playerName) {
    player = null;
  }
}
```

攻击者入房时**省略 `reconnectSecret` 字段**（服务端 323-325 行将其规整为空串），第一个条件直接短路；而 `token` 和 `name` 都在 `room_state` 公开广播（[server.js:238-248](server.js#L238-L248)），房内任何人可见。移动端切后台 90 秒掉线在聚会场景极常见。

**路径 B：同名认领先天无密钥（372-384 行）**

```js
const sameNamePlayer = room.players.find(p => p.name === playerName);
if (sameNamePlayer) {
  if (sameNamePlayer.offlineTimer || isOldSocketDead) {
    player = sameNamePlayer;          // 整体继承席位
    player.token = currentPlayerToken; // 连 token 都换成攻击者的
  }
}
```

该路径**完全没有 secret 校验**，攻击者换一个自己的 token、仅用受害者相同昵称即可继承整个席位对象（房主身份、得分、手牌一并继承）。

**雪上加霜**：认领成功后 395-397 行还会写入攻击者的 secret，真正的玩家之后重连反被 364 行拒绝，永久失去席位。

**修复建议**：

```js
// 服务端存有 secret 时，客户端必须提供且相等（删除对入参的真值判断）
if (player.reconnectSecret && player.reconnectSecret !== reconnectSecret) player = null;
else if (player.name !== playerName) player = null;
// 同名认领路径同样要求 secret，或直接移除该路径（token 已持久化，隐私模式走新玩家即可）
```

中期建议：`room_state` 不再广播真实 token，改为不透明会话 ID。

---

### C2. 阿瓦隆组队阶段，被选入队伍的玩家离场后整房永久死锁

**位置**：[avalon.js:665-683](games/avalon.js#L665-L683)（钩子未清洗队伍）；卡点校验 [avalon.js:262-265](games/avalon.js#L262-L265)；超时兜底 [avalon.js:203-221](games/avalon.js#L203-L221)

队长已把玩家 A 选入 `selectedTeam`，A 在投票前离场。`onPlayerRemoved` 只修正 `leaderIndex`，不过滤队伍中的幽灵 token。此后三条路全部走不通：

1. 队长想取消 A：`selectTeamMember` 在 232-233 行 `find` 不到成员直接 return，**幽灵无法被取消**；
2. 手动提交：262-265 行逐 token 校验在房且有身份，幽灵导致静默 return，且**无任何提示**；
3. 60 秒超时兜底：211-217 行只从"不在队伍中的人"里补足人数，幽灵占位不动，随后调 `submitTeam` 同样被拒；interval 已在 206 行清除，不会重试。

结果：状态永久停在 `AVALON_TEAM_PROPOSE`，投票阶段永远进不了，`rejectTrack` 也到不了 5，无任何自愈路径，整房只能弃局。

**修复建议**：在 `onPlayerRemoved` 中清洗队伍：

```js
if (Array.isArray(room.selectedTeam)) {
  room.selectedTeam = room.selectedTeam.filter(
    t => room.players.some(p => p.token === t && p.avalonSide)
  );
}
```

同时建议 `submitTeam` 被拒时向队长回一条 `system_message`，目前静默失败玩家完全无感知。

---

## 三、🟠 High（高频场景下结果错误或功能失效）

### H1. 同一 socket 重复 join_room 不离开旧房间 → 幽灵席位、跨房私密信息泄露

**位置**：[server.js:327-331](server.js#L327-L331)；断线清理只认当前房 [server.js:958-961](server.js#L958-L961)

`join_room` 开头直接 `currentRoomId = roomId; socket.join(roomId);`，从不清理该 socket 之前的房间关联。客户端（或恶意脚本）依次加入 A、B 后：

- socket 仍是 A 频道成员，继续收到 A 的 `room_state`；A 中幽灵席位的定向私发（UNO 手牌 `uno_hand`、卧底/阿瓦隆身份补发）**无视频道归属**直达该 socket；
- 二次加入同一房间会产生两个 `id` 相同的席位，踢掉幽灵时 `kicked` 私发会把正常连接一起踢下线（[server.js:769](server.js#L769)）；
- disconnect 只处理 B，A 中幽灵席位永不进 offlineTimer、永不被移除，永久占用 20 人上限。

**修复建议**：327 行之前若已存在旧 `currentRoomId`，先复用离场逻辑完成 `socket.leave` + 席位移除 + `notifyPlayerRemoved`，保证一个连接任意时刻只关联一个席位。

### H2. 24 点：小数点可把两张牌"拼成一个数"，无效答案判胜刷分

**位置**：[math24.js:170](games/math24.js#L170) 与 [math24.js:101-108](games/math24.js#L101-L108) 的词法不一致

数字提取用 `sanitized.match(/\d+/g)` —— `"1.2"` 被提取成 `[1, 2]` 两个数通过牌组比对；但 `safeEvaluate` 的分词正则 `\d+\.?\d*` 把它当成 **1.2 一个操作数**。

实证：牌组 `[1,2,4,5]`，提交 `1.2*5*4`：提取结果 `[1,2,5,4]` 与牌组完全一致（171-181 行通过），实际求值 `1.2×5×4=24`（186 行通过）→ 抢答成功加 150+ 时间分。该算式根本没有"四张牌各用一次"。

附带：杂散点号（如 `1.3.3`）会被分词正则静默丢弃，与 96-97 行注释声称的"不静默跳过未知字符"矛盾。

**修复建议**：24 点牌面只有整数 1~13，直接拒绝小数点：

```js
if (sanitized.includes('.')) return { valid: false, reason: '只能使用整数牌面' };
```

更稳妥的根治方案：让 `safeEvaluate` 返回它实际消费的数值列表，用该列表（而非另一套正则的产物）与牌组比对。

### H3. 盲猜数量"绝不爆牌（超过答案 0 分）"规则完全未实现，计分与承诺相反

**位置**：[numberGuess.js:100-144](games/numberGuess.js#L100-L144)；对玩家的承诺文案在 [numberGuess.js:210](games/numberGuess.js#L210) 及 97/115/123 行注释

```js
const isBust = !isValidNum;   // 104 行：爆牌只定义了"非法数字"
// 116-119 行：纯按绝对差排序，超答者可以排第一
```

例：真值 64，A 猜 100（超，差 36）、B 猜 20（差 44）→ A 拿 160 分冠军。系统消息却明确告知"超过直接 0 分"。

**修复建议**：二选一并取齐文案——实现规则则改为 `const isBust = !isValidNum || guessNum > truth;`；产品本意若为纯比接近，则删除所有"绝不爆牌"表述。

### H4. 阿瓦隆组队表决把中途加入的观战者计为"反对票"，可翻转表决结果

**位置**：[avalon.js:385-392](games/avalon.js#L385-L392)；门槛口径 [avalon.js:370-372](games/avalon.js#L370-L372)

投票门槛只统计 `p.avalonSide` 的参战者，但 `tallyTeamVotes` 遍历**全部 `room.players`**，无身份的中途加入者在 `teamVotes` 中无记录，387 行被当作"超时反对"，`rejects++`。一个旁观席位即可把 3:3 平票冲成否决。

**修复建议**：计票的 `voteDetails / approves / rejects` 全部以 `room.players.filter(p => p.avalonSide)` 为准。

### H5. 语音 socket 监听随每次 room_state 无限重复绑定（旧修复已回归丢失）

**位置**：[voice.js:49-59](public/voice.js#L49-L59)、[voice.js:61-96](public/voice.js#L61-L96)；触发点 [game.js:1879-1881](public/game.js#L1879-L1881)

`handleRoomState` 在**每次** `room_state`（准备、切游戏、每秒计时等，一局数十次）都调 `voiceManager.init()`，而 `init()` 无条件执行 `setupSocketListeners()`，四个 `socket.on(...)` 从不去重、不 `off`。

> ⚠️ **回归提示**：2026-09-05 的 [code_review_report.md](code_review_report.md) C1 条记载"init() 增设 `_listenersBound` 防重入守卫"，但当前代码中该守卫**不存在**（疑在 `5ead732` FSM 重构中被覆盖）。语音信令测试只断言了字段名，没有覆盖重复 init，故测试全绿也未拦截。

后果：第 N 次广播后每条信令被处理 N 次——offer 被重复 `setRemoteDescription` 并多次回 answer、ICE candidate 重复添加、声浪回调 N 倍触发，CPU/流量随房间时长线性恶化。

**修复建议**：加 `this.listenersBound` 标志幂等化，或用具名函数 `off(event).on(event, handler)`。

### H6. voice.destroy() 不卸载 socket 监听，退房后可被在途信令"复活"出幽灵连接

**位置**：[voice.js:485-509](public/voice.js#L485-L509)

`destroy()` 取消 rAF、停麦轨、关 peers 和 AudioContext，但**没有 `socket.off`、没有 destroyed 标志**。退房后物理 socket 仍然存活，在途 `voice_signal` 进入 `handleSignal` 后会走到 `ensureAudioContext()`（重新 new AudioContext）与 `createPeerConnection`（[voice.js:350-355](public/voice.js#L350-L355)），收到 offer 还会回 answer —— 退房瞬间产生幽灵 PC + AudioContext 泄漏；重新入房时再叠加 H5 的重复监听。

**修复建议**：把四个处理函数存为实例属性，`destroy()` 中逐一 `socket.off`；加 `destroyed` 标志在各回调开头拦截，`init` 时复位。

### H7. 语音 Mesh 引导协议存在确定性死锁，50% 的加入顺序永远建不通

**位置**：[voice.js:70-78](public/voice.js#L70-L78)、[voice.js:158-161](public/voice.js#L158-L161)；服务端 [server.js:910-915](server.js#L910-L915)

发起方按 token 字典序选举（大者主动发 offer），但选举只在新人收到 `voice_peer_joined` 时发生；服务端对 `voice_join_mesh` 的处理是 `socket.to(roomId).emit(...)` —— **只通知老人，不向新人下发已在 mesh 中的成员清单**。

死锁场景：A 先开麦（mesh 仅 A）；B 后开麦 → 只有 A 收到事件。若 **B 的 token 字典序更大**，A 判定自己不发起（只建 PC 傻等），而 B 从未得知 A 的存在 → 双方都不发 offer，P2P 永久无法建立。该顺序组合占 50%。

**修复建议**：服务端处理 `voice_join_mesh` 时向本人单播当前 mesh 成员 token 列表（如 `voice_mesh_peers`），客户端收到后对每个成员按同一字典序规则决定发起方。

### H8. 窗口获焦/可见即无条件重发 join_room，唤醒看门狗再叠加一次

**位置**：[game.js:1275-1336](public/game.js#L1275-L1336)

`focus`、`visibilitychange(visible)`、`pageshow` 都以 `force=true` 调重连，而 force 分支只要执行到就无条件 `emit('join_room')`，**即使 `socket.connected === true`**（1276 行的判断只包着 `socket.connect()`，没包 emit）。Alt-Tab 切回、关弹窗、点 DevTools 都触发 focus，每次都重走席位认领并向全房广播 `room_state`。

另外 1295-1302 行看门狗 `socket.disconnect().connect()` 之后**立即** emit join（断连态下进入发送缓冲，连上自动 flush），而 1307-1317 行的 `connect` 处理器还会再发一次 → 单轮重连双 join。

**修复建议**：force 且已连接时只发 `ping_sync`；join 仅由真正的 `connect` 触发；看门狗重置连接后不要立即 emit，交给 connect 处理器统一发。

### H9. 绘画/切披萨插件缺少按键状态与 touchcancel 处理，触摸中断后"悬空作画/误提交"，且监听永不卸载

**位置**：[drawGuess.client.js:139-150](public/games/drawGuess.client.js#L139-L150)、[drawGuess.client.js:192-195](public/games/drawGuess.client.js#L192-L195)；[perfectSlice.client.js:638-707](public/games/perfectSlice.client.js#L638-L707)；[holdFive.client.js:101-116](public/games/holdFive.client.js#L101-L116)

`handleMove` 只判断模块标志 `isDrawing`，不判断 `e.buttons`；标志只在 window `mouseup`/画布 `touchend` 中清除，**没有监听 `touchcancel`**。鼠标在窗口外松开、触摸被来电/系统手势打断（只触发 touchcancel）后，标志永久残留：

- 你画我猜：不按任何键、鼠标悬停画布就画线并 `emit('draw_stroke')`；
- 切披萨：下次在页面任意位置点击就以旧坐标发出 `slice_cut_submit`，在没拖刀的情况下**消耗掉本轮唯一一次切割机会**；切游戏后 window 级监听仍存活，会向别的游戏误发包；
- 盲压：切游戏中途松手仍会发 `hold_end`。

**修复建议**：move 处理增加 `e.buttons === 1` 校验（不符则复位标志并 return）；三个插件统一补 `touchcancel`；在插件规范中增加 `destroy(socket)` 钩子，由 game.js 切游戏/退房时移除 window 监听并清理定时器/rAF。

---

## 四、🟡 Medium 汇编（24 项）

### 服务端核心（4 项）

| # | 位置 | 问题 | 修复建议 |
|---|---|---|---|
| M1 | [server.js:156-166](server.js#L156-L166) | `/api/ice-servers` 两个参数都不传即跳过房间校验，匿名领取 TURN 中继凭据（配 TURN_SECRET 发合法 HMAC 短效凭据，配静态密码等于公开账号） | 无 roomId+token 直接 403；校验失败仅返回 STUN |
| M2 | [fsmEngine.js:146-161](fsmEngine.js#L146-L161)、[gameDispatcher.js:289-292](gameDispatcher.js#L289-L292) | 80ms 全局同动作防抖一刀切：西蒙记忆快速复现（每次点击一个颜色，[simonMemory.js:161](games/simonMemory.js#L161)）间隔常 <80ms，丢一步导致整条序列错位被误判淘汰；卧底/阿瓦隆 80ms 内改票被丢弃（[undercover.js:246](games/undercover.js#L246) 明确支持覆盖票）。且被拒动作也先 `actionSeq++` | 防抖改为注册表每动作可配 `debounceMs`（序列/改票类设 0~16ms）；拒绝时回 `action_rejected`；先校验再自增 seq |
| M3 | [server.js:304](server.js#L304)、535、693、729、745、760、868、901 | 解构处理器均无默认值，客户端发 `null` 载荷同步抛 `Cannot destructure ... of null`，落入 uncaughtException 且无任何应答（登录界面永远等待）；`send_chat` 对 `{text:123}` 调 `.trim()` 同样必崩 | 统一 `(payload = {}) => { const {...} = payload || {}; }`；chat 增加 `typeof text === 'string'` |
| M4 | [server.js:234](server.js#L234)、[521-532](server.js#L521-L532) | `ping_sync` 经 `buildRoomState` 无限刷新 `lastActivity`，每 500ms 一次心跳即可让房间永不满足 2 小时回收；建满 100 间房持续心跳即占满名额 | 只读心跳不更新活跃时间；回收增加"最长存活"硬上限 |

### 游戏引擎（10 项）

| # | 位置 | 问题 | 修复建议 |
|---|---|---|---|
| M5 | [avalon.js:457-477](games/avalon.js#L457-L477)、[494-497](games/avalon.js#L494-L497) | 任务进行中队员离场，`selectedTeam` 幽灵占位使提前结算门槛永远差一票，活人全投完也干等 25 秒；结算时幽灵的票默认按**成功**，第四任务需 2 张失败牌时可能翻转结果 | 门槛与结算均以在房队员 `liveTeam` 为准；人数不符建议流局重开 |
| M6 | [undercover.js:386-401](games/undercover.js#L386-L401) | 白板胜利分支永远不可达：`{卧底,白板}` 先判卧底胜，`{平民,白板}`/`{白板}` 先判平民胜，250 分奖励是死代码 | 调整判定顺序，明确白板存活规则 |
| M7 | [undercover.js:241-244](games/undercover.js#L241-L244) 对比 [283-285](games/undercover.js#L283-L285) | PK 阶段允许把票投给任意存活者，但 tally 只在 `pkPlayers` 内统计，投给局外人的票被静默没收 | castVote 增加 PK 候选人白名单校验 |
| M8 | [drawGuess.js:338-342](games/drawGuess.js#L338-L342) | 回合结算 4 秒间隙刚画完的画师本人离场，splice 后索引未修正，延时回调 `+1` 跳过原下一位画师（旧报告 M3 只修了"画师在绘制中离场"） | 分支条件改为 `removedIndex <= currentDrawerIndex` 时先 -1 抵消 |
| M9 | [wordBomb.js:274-294](games/wordBomb.js#L274-L294) | 唯一存活持弹人离场（另一人 lives=0 不移出 players）时 `findCurrentPlayer()` 为 null，`if (!next) return` 不结算、不重启定时器，留下死局 | `!next` 时按实时存活名单 ≤1 人调 endGame |
| M10 | [cubeCount.js:208-220](games/cubeCount.js#L208-L220)（导出表 298-305 无钩子） | 已答对玩家在回合结束前离场，答案残留占据 rank=0，在房玩家速度档从 50/30 被压到 30/10 | 导出 onPlayerRemoved 清理 playerAnswers，或排序前按在房 token 过滤 |
| M11 | [flashCounter.js:337-349](games/flashCounter.js#L337-L349)（导出表 433-439 无钩子） | 与 M10 完全同构的名次挤占 | 同上 |
| M12 | [holdFive.js:166-209](games/holdFive.js#L166-L209)（导出表 253-259 无钩子） | 已出成绩玩家离场后条目残留可能排第一，`bestHolder` 为 undefined，系统消息播成"最佳领主：【undefined】" | 补钩子清理 playerHolds/holdPressList；find 失败回退"无" |
| M13 | [changeMaster.js:348-363](games/changeMaster.js#L348-L363) | getPublicState 引用 `b.items/totalCost/receivedCash` 三个**根本不存在**的字段（实为 `paid/cost/changeDue`），还漏发 availableDenoms 等，找零阶段重连无法重建题面 | 与 `change_new_bill` 载荷对齐字段 |
| M14 | [wordBomb.js:274-294](games/wordBomb.js#L274-L294)、[231-232](games/wordBomb.js#L231-L232) | 钩子注释承诺删除离场者生命值条目，实际从未 `delete`，幽灵命数经 getPublicState 广播；`lives===undefined` 反被视为存活，等待窗口内新人第一次接弹就以 -1 命淘汰 | 钩子中 delete 命数条目；续爆时为不在表中的在房玩家补发默认命 |

### 前端核心（4 项）

| # | 位置 | 问题 | 修复建议 |
|---|---|---|---|
| M15 | [voice.js:313-317](public/voice.js#L313-L317) | `connectionstatechange` 的 if 体是空实现，ICE failed 后无任何恢复路径，PC 与 audio 节点永久残留 | failed 时关闭删除 peer，短延迟后按字典序重新协商；closed 直接清理 |
| M16 | [voice.js:348-405](public/voice.js#L348-L405) | 信令无连接代际标识，同 token 毫秒级重入 mesh 时旧在途 offer/candidate 作用于新 PC；answer 状态不符时静默丢弃无日志（表现为偶发单通且无线索） | createPeerConnection 生成递增 connId 随信令携带；状态不符 console.warn 并触发重建 |
| M17 | [game.js:48-72](public/game.js#L48-L72) | sessionStorage 未命中即回退读 localStorage，新标签页必然读到另一标签页正在使用的 token+secret，"标签页隔离"与注释承诺相反；旧页处于 90 秒离线窗口时两页互踢 | sessionStorage 未命中应生成新 token，不回退 localStorage |
| M18 | [game.js:1998-2007](public/game.js#L1998-L2007) | 8 个降级渲染函数（renderDrawGuessState 等）全仓只有调用处没有定义；插件脚本被广告扩展拦截/404 时进入分支即 ReferenceError，整个 room_state 回调中断（相邻 2008-2009 行却有 typeof 防护，确认为疏漏） | 删除死分支或全部加 typeof 防护 |

### 前端插件（6 项）

| # | 位置 | 问题 | 修复建议 |
|---|---|---|---|
| M19 | [avalon.client.js:16](public/games/avalon.client.js#L16) | IIFE 私有 `myAvalonRole` 退房不重置（game.js 的重置改的是另一份同名变量），新房私密角色到达前的空窗按旧身份弹刺杀框/启用失败票按钮（服务端会拒，但属跨房 UI 泄密） | 插件暴露 reset()，由 resetRoomLocalState 统一调用 |
| M20 | [simonMemory.client.js:68-72](public/games/simonMemory.client.js#L68-L72) | 演示序列裸发 setTimeout 不保存句柄，快速重开/切游戏后新旧序列闪烁交错 | 数组收集 timer id，新 demo/离开时全部 clear |
| M21 | [perfectSlice.client.js:458](public/games/perfectSlice.client.js#L458)、[548](public/games/perfectSlice.client.js#L548) | `ctx.roundRect()` 无 polyfill，Chrome<99 / 旧安卓 WebView / 微信内核直接 TypeError，rAF 每帧抛错画布永久空白 | 加 arcTo 手绘圆角 polyfill 或降级 fillRect |
| M22 | [math24.client.js:159-165](public/games/math24.client.js#L159-L165) | 退格后用字符串 includes 反推已用牌，牌面同时有 13 与 1、3 时按字符误匹配，正确的牌被置灰锁死，只能清空重来 | 维护已用牌 token 序列，退格直接 pop |
| M23 | [drawGuess.client.js:270-274](public/games/drawGuess.client.js#L270-L274) | 每次重连收到 sync_draw_history 直接叠加绘制不清空，网络抖动后同批笔画重画一层，线条变粗重影 | handler 开头先 clearRect（复用 redrawCanvasHistory） |
| M24 | [cubeCount.client.js:387-399](public/games/cubeCount.client.js#L387-L399) | 重连后 room_state 带 currentGrid 但渲染只认本地缓存（本地只能靠不会重放的事件赋值），观察/抢答阶段重连画布空白；已答玩家提交态也丢失、输入框被重新启用 | renderState 开头从 state.currentGrid 回填；提交态信任 state.answeredTokens |

---

## 五、🟢 Low 汇编（按模块归并，建议顺手清理）

**服务端核心**

- [server.js:208-217](server.js#L208-L217)：僵尸房间回收不 `socket.leave`，房间号（用户自取）撞号后旧连接收到新房数据。
- [server.js:760-780](server.js#L760-L780)：kick_player 漏清被踢者 offlineTimer（leave/认领路径都清了），最长悬挂 90 秒。
- 频控缺口：send_reaction（[729-742](server.js#L729-L742)，入站 1 条放大为 N 条全房广播）、voice_status（901-915）、draw_stroke（783-825）无频率限制。
- 频控计数器挂在 socket 上（ping/语音信令），断线重连即归零；聊天等挂在 player 上的不受影响，口径应统一。
- Delta 机制潜伏缺陷（**当前无现网状态丢失**）：删键赋 `undefined` 经 JSON 编码被整体丢弃（[fsmEngine.js:51-57](fsmEngine.js#L51-L57)）；`game_delta` 客户端无任何消费方（双份 payload 白白发）；`actionSeq` 仅 dispatcher 动作自增，不具备全局单调语义。建议接入客户端消费前先修这三点，或直接停发 delta。
- 死代码：`setDeterministicPhase`/`applyDelta` 生产环境零调用，"确定性时钟"实际未上线；[fsmEngine.js:138](fsmEngine.js#L138) 注释 100ms 与实际 80ms 不符；[server.js:771](server.js#L771) 注释顺序与代码相反（代码顺序本身正确，引擎均按 splice 后索引实现）。

**游戏引擎**

- [avalon.js:630-639](games/avalon.js#L630-L639) endGame 漏清 roundTimeout（有守卫不误触发）；[289-319](games/avalon.js#L289-L319) 当前发言者离场不干跳过，须等满 60 秒（卧底已有正确写法可参照）；367-375 残留 teamVotes 键可能提前几秒触发结算。
- [uno.js:155-180](games/uno.js#L155-L180)：非当前出牌者离场也无条件重启计时器，当前玩家时限被重置为 30 秒且可再摸一张；掉到 1 人不判胜负，中途加入的空手玩家也进轮转（超时摸牌以 1 张手牌参与）。
- [undercover.js:199-200](games/undercover.js#L199-L200) 注释"&& 是笔误"已过时（代码已是 ||）；272-276 离场玩家已投的票仍计入结果，规则未声明。
- 幽灵数据广播：changeMaster/numberGuess/stroopTrap/simonMemory 不清理离场玩家作答（公共态 answeredTokens/completedTokens 携带幽灵 token）。
- 计时器守卫风格不一致：[cubeCount.js:127-135](games/cubeCount.js#L127-L135) 观察 interval 无 gameType 自检（抢答阶段有）；[simonMemory.js:97-99](games/simonMemory.js#L97-L99) 演示 setTimeout 无状态守卫。
- 无关玩家离场也重置行动计时：[bombRoulette.js:232-234](games/bombRoulette.js#L232-L234)、[wordBomb.js:291-293](games/wordBomb.js#L291-L293)，旁观者退房可给当前行动者"续命"。
- [wordBomb.js:96](games/wordBomb.js#L96) 引信秒数未取整，配置小数时倒计时播 6.5/5.5；成语模式词库未命中时任意 4 字中文即放行（[162-179](games/wordBomb.js#L162-L179)，"的的的的"可当成语）。
- 重连题面缺失：flashCounter 公开态有 options 无 questionType/questionPrompt（[415-431](games/flashCounter.js#L415-L431)）；simonMemory DEMO 阶段公开态不含 sequence（[306-317](games/simonMemory.js#L306-L317)，sequence 本就全房明文下发，无保密理由）；bombRoulette 爆炸后仍隐去引爆线（[202-208](games/bombRoulette.js#L202-L208)）。
- [numberGuess.js:232-235](games/numberGuess.js#L232-L235) 接受负数与小数答案（题库答案均为整数）；changeMaster:250/numberGuess:242/simonMemory:202 的 `every()` 缺空数组保护（当前不可达）；[perfectSlice.js:739-745](games/perfectSlice.js#L739-L745) 全员未下刀时文案残缺（"误差仅 ±--%"）。

**前端核心与插件**

- [game.js](public/game.js) 一批顶层 DOM 引用缺判空（318/379/741/756/1019/1134/1694 等），任一 id 缺失整个脚本加载中断；[425](public/game.js#L425) 远程 token 拼 CSS 选择器应用 `CSS.escape`；[611](public/game.js#L611) 排行榜 score 未转义（语义为服务端数字，风险低）；[1319-1321](public/game.js#L1319-L1321) `socket.on('reconnect')` 在 Socket.IO v4 是死代码（应挂 `socket.io`）；撒花动画无并发/节流（2252-2288，高频 correct 时 CPU 尖峰）；token 换发后未回写 `window.myPlayerToken`（[718](public/game.js#L718)）。
- [voice.js:65-93](public/voice.js#L65-L93) 信令 payload 解构无防御（`null` 即抛，handleSignal 内部的判空来不及生效）；[425-433](public/voice.js#L425-L433) 自动播放失败时 document 级 once 监听可在首次手势前成对堆积。
- 插件纵深防御：[brainGames.client.js:512](public/games/brainGames.client.js#L512) 猜测值进 innerHTML 未转义（服务端已强制 Number，当前不可注入）；选词卡 word、partyArcade 的 emoji/toFixed、若干 `forEach` 缺空数组兜底；多个 IIFE 加载时一次性 `const socket = window.socket`，脚本顺序一旦变动整体静默失效；cubeCount 每次 room_state（每秒 tick）全量重绘 3D 场景，移动端持续耗电。
- [index.html:28](public/index.html#L28) socket.io.js 在 head 同步加载建议加 defer；1233-1234 class hidden 与 style display:none 冗余；30 行第三方 Umami 脚本无 SRI。

---

## 附录 A：本次复核确认"无问题"的方面

1. **XSS 防护**：玩家可控数据（昵称/头像/聊天/表情）进入 innerHTML 前均经 `escapeHtml`，系统消息走 textContent；math24 服务端与客户端均为自研解析器，全仓无 `eval`/`new Function`。
2. **定时器主链路**：54 处引擎定时器全部挂在 `room.timer/roundTimeout`，切游戏/回大厅/再来一局/空房回收/掉线超时/优雅关停六条路径均有清理，无跨游戏泄漏；各延时回调普遍带 `gameType + status` 双守卫。
3. **数据竞争**：19 个引擎全部同步实现，socket 处理器与超时回调在事件循环上天然串行；陈旧闭包靠 token/status 实时查找化解。
4. **房主越权**：switch_game / update_room_settings（含白名单+数值钳制+状态限制）/ start_game / transfer_host / kick_player 均有房主与状态校验；游戏内"是否轮到你"授权下沉各引擎（抽查卧底投票存活/身份校验完备）。
5. **私密广播**：safePlayers 白名单不含 role/word/hand；UNO 仅广播张数，阿瓦隆/卧底 getPublicState 不含角色词语，身份只走 socket 私发，ping_sync 经 PlayerView 脱敏。
6. **房主唯一性**：三条离场路径逐场景推演无双房主；在线顶号防护（活跃 socket 占用席位时拒绝接管）有效。
7. **随机质量**：全部复用 Fisher-Yates（shuffle.js 正确），无 `sort(() => Math.random()-0.5)`；trainRoute 生成器有穷举验证+静态兜底，无无解/多解退化。
7. **UNO 核心规则**：2 人局 reverse、离场时顺/逆时针索引修正经推导正确；发牌抽空有保护。

## 附录 B：经复核排除的疑似问题

- 子审查曾报告"卧底任意非决定性离场都会导致本轮发言作废重开、轮次虚增"。**复核判定为误报**：[undercover.js:494-500](games/undercover.js#L494-L500) 中不满足胜负条件时走的是 `else { broadcastRoom(room); }`，并不调用 `checkWinCondition`；而该函数被调用时，其内部 386-401 行以相同口径重新计算，必然进入 gameOver 分支，不会落入 434-439 的"开新一轮"。

---

## 六、修复路线图建议

| 批次 | 内容 | 预估 |
|---|---|---|
| **P0（当天）** | C1 席位接管两条绕过路径；C2 阿瓦隆 selectedTeam 清洗 | 改动小、收益最大，C1 是已知安全债 |
| **P1（本轮迭代）** | H1 幽灵席位；H5/H6/H7 语音三件套（含补回归测试：重复 init 不重复绑定、mesh 成员清单）；H2/H3/H4 计分与计票错误；H9 touchcancel | 每个引擎/模块独立可改，建议配回归用例 |
| **P2（排期）** | M1-M24：按"离场善后 → 防抖/输入加固 → 重连体验 → 旧设备兼容"顺序；M2 防抖调整需回归西蒙/投票类全链路测试 | 建议与 H9 一起建立插件 `destroy()` 规范一次做透 |
| **P3（随手）** | Low 清单随功能迭代清理；Delta 三件套在客户端接入消费前必须先修 | — |

修复后建议至少执行：`npm test`（70 项契约，需为 C1/C2/H5/H7 增补用例）、`npm run test:human`（19 款拟人全链路），重点回归"组队中掉线、持弹人退房、投票中改票、快速复现序列、弱网重连语音"五个场景。
