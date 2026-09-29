# PartyHub 代码审计报告

**审计日期：** 2026-09-29
**审计基线：** `main @ e7991eb`（fix(ui): 修复全站UI走查多端适配、WCAG对比度与选词重连问题）
**修复批次：** 2026-09-29 当晚完成全部 P1 + P2 修复（见各发现末尾的「✅ 已修复」标记），并同步删除了折纸/找零钱/小火车三款游戏，游戏数从 19 → 16。
**审计范围：** 服务端核心（server.js / fsmEngine / gameDispatcher）、19 款游戏引擎抽样 6 款（undercover / drawGuess / uno / avalon / holdFive / partyArcade 前端）、客户端（game.js + voice.js）、部署配置（Dockerfile / docker-compose / .env.example）、依赖（npm audit）、测试体系（npm test 实跑通过）

**风险分级：** P1 = 建议尽快修复；P2 = 计划内修复；P3 = 建议/观察项

---

## 一、结论摘要

整体代码质量**明显高于同类业余项目平均水平**：输入校验覆盖全量 socket 事件、私密信息白名单脱敏、防作弊计时、无偏随机、断线重连善后、测试看门狗体系都比较扎实。`npm test` 实跑通过（单元 + 契约 + e2e + UI 视觉看门狗 5/5）。

本次发现 **2 个 P1 安全问题**（均在席位认领与 TURN 凭据下发路径）、**4 个 P2 问题**、若干 P3 建议项。无关键逻辑死锁、无明显内存泄漏、无 XSS 实际利用链。

**修复进展：** 全部 6 项 P1/P2 已修复并回归测试通过；同时按用户要求删除折纸/找零钱/小火车三款游戏（详见第七节）。

---

## 二、P1 发现（建议尽快修复）

### P1-1 席位冒领防线可被「不带密钥」绕过，可窃取他人身份与私密游戏信息

**位置：** `server.js:371-380`（join_room 会话防护）+ `server.js:246-256`（buildRoomState 广播 token）

**问题链条：**

1. `room_state` 全房广播中，`safePlayers` 显式包含每个玩家的 `token`（`p.token`）——token 是**公开信息**；
2. 会话防护逻辑为：
   ```js
   if (player.reconnectSecret && reconnectSecret && player.reconnectSecret !== reconnectSecret) {
     player = null;   // 只有“提供了错误密钥”才拒绝
   } else if (player.name !== playerName) {
     player = null;   // 昵称也是公开信息
   }
   ```
   攻击者只要**不传 reconnectSecret**（空串），第一个条件因 `reconnectSecret` 为 falsy 短路失效，剩下只需匹配公开昵称即可通过；
3. 目标玩家掉线后有 90 秒宽限期（`offlineTimer`），期间席位可被接管；
4. 接管成功后，join_room 的私密补发逻辑（`server.js:518-532`）会把 `uc_secret_role`（卧底词）、`avalon_secret_role`（梅林/刺客等角色）、`uno_hand`（完整手牌）发给攻击者；
5. 更糟：`joined_successly` 回包（`server.js:484-492`）会下发 `player.reconnectSecret`，攻击者连受害者的重连密钥都拿到了，之后可无限次接管。

**影响：** 同房恶意玩家可在他人掉线 90 秒窗口内冒领席位，直接获取卧底词/阿瓦隆角色/UNO 手牌等决定胜负的私密信息。

**修复建议（一行语义改动）：** 当席位已持有 `reconnectSecret` 时，**必须**提供且匹配才允许接管：
```js
if (player) {
  if (player.reconnectSecret) {
    if (!reconnectSecret || player.reconnectSecret !== reconnectSecret) {
      player = null; // 有密钥的席位，缺密钥或密钥不符一律拒绝
    }
  } else if (player.name !== playerName) {
    player = null;
  }
}
```
另注意 `server.js:383-394` 的「同名继承席位」路径（不校验 reconnectSecret）同样存在此窗口，建议一并按密钥校验收紧。

**✅ 已修复（2026-09-29）：** `server.js` join_room 路径已按上述语义改写：① token 匹配分支——席位持有 reconnectSecret 时必须提供且完全匹配才接管；② 同名继承分支——同样校验 reconnectSecret，密钥不匹配（如换浏览器/清存储）按新席位加入，对局中作观战。`npm test` 全套回归通过。

### P1-2 /api/ice-servers 免鉴权下发 TURN 中继凭据

**位置：** `server.js:164-174`

**问题：** 校验写法为 `if (roomId || token)` —— 两个参数**都不传**即完全跳过会话校验，直接返回 ICE 配置。当部署方配置了 `TURN_SECRET`（自建 coturn）时，任何互联网上的匿名请求都能拿到 RFC 5766 短效 HMAC 凭据（有效期 1 小时，可无限刷新），将 TURN 中继当作免费流量跳板，带宽被盗用。

**修复建议：**
```js
app.get('/api/ice-servers', (req, res) => {
  const { roomId, token } = req.query;
  if (roomId || token) {
    const room = rooms.get(roomId);
    if (!room || !room.players.some(p => p.token === token)) {
      return res.status(403).json({ error: '未授权访问内部语音中继凭据' });
    }
    return res.json({ iceServers: getIceServers(token) }); // 含 TURN，须鉴权
  }
  res.json({ iceServers: [/* 仅公开 STUN */] }); // 匿名只给 STUN
});
```

**✅ 已修复（2026-09-29）：** `server.js` 抽出 `PUBLIC_STUN_SERVERS` 常量，`getIceServers` 改为拷贝该常量后再追加 TURN；`/api/ice-servers` 路由分两路：匿名请求只返回 `[...PUBLIC_STUN_SERVERS]`，传参且会话校验通过者才返回完整 ICE（含 TURN）。

---

## 三、P2 发现（计划内修复）

### P2-1 被踢玩家仍残留幽灵语音状态通道

**位置：** `server.js:794-816`（kick_player）+ `server.js:939-948`（voice_status）

kick 时只做了 `kickedSocket.leave(room.id)`，但该 socket 闭包变量 `currentRoomId / currentPlayerToken` 未重置。被踢者仍可发 `voice_status`（向房间广播幽灵状态）、`ping_sync`（仅校验 room 存在即回发全量状态视图）。

**建议：** kick 时向目标 socket 发一个内部事件令客户端清空本地会话并断开，或直接 `kickedSocket.disconnect(true)`。

**✅ 已修复（2026-09-29）：** `server.js` kick_player 在 `leave(room.id)` 之后追加 300ms 延迟 `kickedSocket.disconnect(true)`，先让 'kicked' 事件送达客户端触发本地登出，再废弃底层连接清空其会话闭包。玩家此时已从 room.players 移除，disconnect 处理器查无此人，不会建立保留计时器。

### P2-2 第三方统计脚本无完整性校验，且 CSP 整体关闭

**位置：** `public/index.html:31`（umami 脚本）+ `server.js:38-41`（`contentSecurityPolicy: false`）

`https://umami.980823.xyz/script.js` 未加 `integrity`/`crossorigin`；该域名一旦被劫持即是全站存储型 XSS，而 helmet CSP 被禁用后没有第二道防线。

**建议：** 为该脚本加 SRI（`integrity` + `crossorigin="anonymous"`）或自托管；同时配置一个宽松 CSP（`default-src 'self'; script-src 'self' https://umami...; style-src 'self' 'unsafe-inline'; media-src 'self' blob:` 等）替代完全关闭。

**✅ 已修复（2026-09-29）：** 实测 umami 脚本支持 `data-host-url` 属性覆盖上报端点（`(x || u.src.split('/').slice(0,-1).join('/')).replace(/\/$/,'')}/api/send`）。已将 `https://umami.980823.xyz/script.js` 下载到 `public/assets/umami.js` 自托管，`index.html` 改为同源加载并显式声明 `data-host-url="https://umami.980823.xyz"`：脚本代码完全在本站控制下，远端被劫持也不再影响页面代码执行（仅打点数据走远端），且天然适配未来收紧的 `script-src 'self'` CSP。

### P2-3 docker-compose 与 Dockerfile 策略相悖，存在弱默认凭据

**位置：** `docker-compose.yml`

- compose 用 `image: node:22-alpine` + `.:/app` 卷挂载直接跑源码：绕过镜像构建、以 root 运行（Dockerfile 的 `USER node` 被完全架空）、无 `npm ci` 依赖锁定，仅适合开发环境；
- `TURN_CREDENTIAL` 默认值 `partyhub_secret_default`：未改 `.env` 时弱凭据直接生效到公网 coturn；
- coturn `network_mode: host` + 49152-49200 端口段需在防火墙放行，文档未提示。

**建议：** 生产 compose 改为 `build: .` + `user: node`；TURN 凭据改为必填项（缺失时禁用 TURN 而非使用默认值）。

**✅ 已修复（2026-09-29）：** `docker-compose.yml` 重写——partyhub 服务改为 `build: .`，移除 `.:/app` 源码卷挂载（保留 localtime），TURN_* 全部留空默认（服务端自动降级为纯 STUN）；coturn 服务改为 `profiles: [turn]` 可选启用，凭据与 `COTURN_EXTERNAL_IP` 改为 `${VAR:?...}` 必填项（未设置会直接报错拒绝启动）。`.env.example` 同步更新为带使用说明的注释模板。

### P2-4 依赖存在 3 个 moderate 级公告（暂无修复版本）

`npm audit --omit=dev`：express 4.22.2 / body-parser 1.20.x / qs 2.2.5-6.15.3 各 1 个 moderate，当前 express 4.x 线尚无补丁版本（`fixAvailable: none`）。属于上游待修，**不建议**为规避升 express 5（破坏性变更）。建议在 CI 中加入 `npm audit --audit-level=high` 门禁，补丁发布后第一时间升级。

另：`qrcode` npm 依赖在服务端零引用（前端用的是本地 `public/qrcode.min.js`），属于死依赖，可从 dependencies 移除以缩小供应链面。

**✅ 已修复（2026-09-29）：** `npm uninstall qrcode` 移除该死依赖，`package.json` 与 `package-lock.json` 同步更新，`npm test` 回归通过。express/body-parser/qs 的 3 个 moderate 仍维持观察（上游暂无补丁），在 CI 引入 `npm audit --audit-level=high` 门禁即可。

---

## 四、P3 建议 / 观察项

| # | 位置 | 说明 |
|---|------|------|
| 1 | `server.js:66-71` | `uncaughtException` 全局吞掉继续运行——务实但激进；异常后状态机可能已半损坏，长期可考虑记录后受控重启 |
| 2 | `server.js:34` | `trust proxy 1` 仅适配一级反代；若前面再加 CDN/多层代理，rate-limit 会被伪造 `X-Forwarded-For` 绕过，部署文档需注明拓扑假设 |
| 3 | `server.js:731-737` | 画师泄底检查只拦「聊天包含谜底原文」，拆字/拼音/谐音可绕过（游戏性范畴，非安全） |
| 4 | `fsmEngine.js:40` | `computeDelta` 用 `JSON.stringify` 做深比较，大状态有 CPU 开销；当前规模（≤20 人房间）可接受 |
| 5 | Socket.IO 层 | express 限流不覆盖 WS 连接；现有 `MAX_ROOMS=100`、每房 20 人、信令 50 次/秒、聊天 500ms 频控等兜底已较完善，暂可接受 |
| 6 | `server.js:74-82` | `safeEngineCall` 吞掉引擎异常返回 null，调用方多数不区分「返回 null 的正常拒绝」与「异常」，排查线上问题时可观测性偏弱，建议异常时同时打 roomId/gameType |

---

## 五、正面发现（做得好的地方）

1. **私密信息防泄露设计到位**：`buildRoomState` 用显式白名单序列化玩家字段（avalon 阵营/角色、卧底词、UNO 手牌均不进广播）；`createPlayerView` 按 token 二次脱敏（他人 UNO 手牌只给张数）；阿瓦隆角色、卧底身份走 `io.to(p.id)` 私发。
2. **输入校验体系化**：所有 socket 事件均有 null 兜底（QA-M3）、类型/长度截断（昵称 12 字、房间号 32 字符、表情 8 字符、聊天 200 字符、信令 4KB）；`draw_stroke` 结构校验 + 坐标 clamp01 + 历史上限 3000 条防内存撑爆。
3. **防作弊**：盲压挑战改为服务端墙钟计时（按下/抬起锚点差值 + 物理可信性校验），杜绝客户端自报时长；UNO 出牌校验回合归属 + 手牌所有权 + 合法颜色枚举；卧底投票校验身份资格（观战者无 role 不能投票计票）。
4. **房主配置白名单**（`ALLOWED_SETTINGS` + `SETTING_RANGES` 钳制）：杜绝客户端任意覆写 room 属性、极端值卡死引擎。
5. **并发/一致性善后**：`onPlayerRemoved` 在 leave/kick/掉线超时三条路径统一修正回合指针，防 UNO/拆弹等索引漂移死锁；`checkActionAllowed` 80ms 防重放。
6. **随机性**：统一 Fisher-Yates 无偏洗牌工具（替代有统计偏差的 `sort(() => 0.5 - Math.random())`）。
7. **资源生命周期**：优雅关停、僵尸房间 10 分钟周期回收、双计时器（timer/roundTimeout）在各状态迁移点清理。
8. **前端 XSS 防御**：抽查 chat、lobby 座位卡、podium、几A几B 日志、卧底结算 extraHtml 等所有用户数据注入点均经 `escapeHtml`（含引号转义）；聊天 DOM 上限 1000 条防膨胀。
9. **测试体系**：单元 + 引擎契约 + 全游戏 e2e + 玩家移除 + 语音信令 + 真机 UI 视觉看门狗，本次实跑全部通过。

---

## 六、修复优先级路线图

1. ~~**立即**（P1-1）：join_room 强制 reconnectSecret 匹配——一行语义改动，收益最大~~ **✅ 已修复**
2. ~~**立即**（P1-2）：/api/ice-servers 匿名路径只返回 STUN~~ **✅ 已修复**
3. ~~**本周**（P2-1）：kick 时断开目标 socket~~ **✅ 已修复**
4. ~~**本周**（P2-2）：umami 脚本加 SRI 或自托管~~ **✅ 已修复（自托管到 public/assets/umami.js）**
5. ~~**下次部署**（P2-3）：compose 生产化（build + 非 root + TURN 凭据必填）~~ **✅ 已修复**
6. ~~**持续**（P2-4）：跟踪 express 补丁；移除 qrcode 死依赖~~ **✅ 已修复（qrcode 已移除；express 待上游补丁）**

---

## 七、附加变更：删除折纸 / 找零钱 / 小火车三款游戏

按用户要求删除了 `hole-punch` / `change-master` / `train-route` 三款游戏。游戏总数由 19 → 16。涉及的文件变更：

**删除文件：**
- `games/holePunch.js`、`games/changeMaster.js`、`games/trainRoute.js`（共约 1,360 行引擎代码）

**服务端：**
- `server.js`：移除 3 个 `require`、3 个 `GAME_ENGINES` 条目、3 个 `gameNames` 条目
- `gameDispatcher.js`：移除 `hole_submit_answer` / `change_submit_counts` / `train_submit_answer` 3 个动作路由

**前端：**
- `public/index.html`：移除 3 个游戏卡片、3 个舞台容器
- `public/game.js`：移除 3 个舞台 DOM 引用、3 个 `GAME_CAPS` 条目、3 个 `GAME_NAMES` 条目、3 个 `GAME_META` 条目、3 处舞台映射、3 处 `maxRounds` 分支、3 处 `*-rounds` 设置 ID、3 处 `allStages` 数组引用
- `public/games/brainGames.client.js`：整段移除 train-route / hole-punch / change-master 三块客户端代码（含 9 个 `socket.on` 监听器、3 个 game_over 处理器、2 个事件回调、相关 DOM 引用与状态变量），保留 stroop / shadow / simon / number-guess 四款

**测试：**
- `tests/unit/engine_contract.test.js`：从引擎注册表与作答清理断言中移除 3 款
- `tests/unit/full_games_e2e.test.js`：移除 3 个 require 与 3 个生命周期 e2e test
- `tests/unit/new_brain_games.test.js`：移除 3 个 require 与 3 个单元 test
- `tests/ux_cdp_watchdog.js`：移除 train/hole 的 DOM 夹具与像素断言、相关 metric 提取
- `tests/test_human_playtest.js`：移除 3 个 GAME_HANDLERS 条目、3 个 socket 监听桩、ALL_GAME_KEYS 中 3 个条目

**文档：**
- `README.md`、`package.json`、`partyhub_ui_design_spec.md`：游戏数 19 → 16，删除三款条目与目录树说明

**回归：** `npm test` 全套通过（单元 + 契约 + e2e + UI 视觉看门狗 5/5），`node --check` 全部源文件语法 OK，`node server.js` 启动正常。
