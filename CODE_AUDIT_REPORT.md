# PartyHub 全量代码审计与优化报告 (Full Code Audit & Optimization Report)

**审计与优化日期：** 2026-10-08  
**基线版本：** `main @ a3b197e`  
**优化状态：** 全部 4 项 P2 缺陷与 3 项 P3 优化项已全部完成修复与单测回归闭环（详见下文各节及表格）。  
**范围：** 服务端核心（`server.js`、`fsmEngine.js`、`gameDispatcher.js`）、16 款游戏引擎（`games/*.js`）、客户端交互与语音（`game.js`、`voice.js`、`public/games/*.client.js`）、容器与依赖安全、自动化测试体系。

---

## 一、结论摘要与优化矩阵

本次全量代码审计与针对性优化已全部落地，涵盖生命周期流转、状态机增量协议、排序稳定性、跨房间会话防护、防外挂作弊以及测试防御网。全套单元测试与回归测试（65+ 项用例）**100% 通过**，无回归风险。

| 缺陷/优化编号 | 级别 | 涉及模块 | 核心问题简述 | 优化修复状态 |
| :--- | :---: | :--- | :--- | :---: |
| **P2-1** | P2 | `games/uno.js:330` | UNO 摸牌动作缺少「已摸牌」状态阻断，防单回合重复连摸与超时死锁 | ✅ **已完善防护** |
| **P2-2** | P2 | `games/bullsAndCows.js:148` | 几A几B猜数字排序比较器违反严格弱序，全员未猜中时排名乱序 | ✅ **已彻底修复** |
| **P2-3** | P2 | `fsmEngine.js:52-70` | FSM 增量同步 `computeDelta` 删键赋值 `undefined` 导致 JSON 序列化丢键 | ✅ **已彻底修复** |
| **P2-4** | P2 | `server.js:345` | 同一 Socket 连接跨房间加入未清理旧房间导致幽灵席位与广播串台 | ✅ **已彻底修复** |
| **P3-1** | P3 | `games/numberGuess.js:97,207` | 盲猜数量规则宣称「绝不爆牌」与真实「双向绝对差最小」逻辑冲突 | ✅ **已统一文案** |
| **P3-2** | P3 | `server.js:848` | `kick_player` 被踢玩家若处于掉线宽限期未主动清理 `offlineTimer` 句柄 | ✅ **已彻底修复** |
| **P3-3** | P3 | `games/shadowMatch.js:125` | 影子猜物题型选项暴露原始 Emoji，防抓包比对 0ms 秒杀答案 | ✅ **已加固防作弊** |

---

## 二、各项修复与优化细节

### 1. 【P2-2】修复几A几B结算排序比较器严格弱序 (`games/bullsAndCows.js`)
- **成因**：原比较器 `(a.solved ? -1 : 1) || (a.attempts - b.attempts)` 在双方均未解出时恒返回 `1`，违反排序算法的反对称性，导致 `||` 后续猜测次数比较死代码且数组非确定性乱序。
- **改动**：改为对称的数学差值比较：
  ```javascript
  .sort((a, b) => ((b.solved ? 1 : 0) - (a.solved ? 1 : 0)) || (a.attempts - b.attempts));
  ```
  未解出者按尝试次数稳定升序，解出者优先稳居首位；同时在 `games/bullsAndCows.js` 导出 `endGame` 并向 `tests/unit/engine_core.test.js` 补充了严格回归测试。

### 2. 【P2-3】修复 FSM 增量同步协议删除键丢失缺陷 (`fsmEngine.js`)
- **成因**：`computeDelta` 原实现对删除字段赋值 `undefined`，但在经过 WebSocket 底层 `JSON.stringify` 传输时，`undefined` 字段被静默丢弃，导致客户端 `applyDelta` 永远无法察觉并删除本地旧字段。
- **改动**：
  - `computeDelta`：删除字段显式赋值为 `null`（保留在 JSON 序列化结果中）；
  - `applyDelta`：兼容识别 `value === undefined || value === null` 并执行 `delete result[key]`；
  - `tests/unit/fsm_engine.test.js`：新增了经 `JSON.parse(JSON.stringify(delta))` 网络回环反序列化后的属性删除测试。

### 3. 【P2-4】修复跨房间切换时的旧房间幽灵席位残留 (`server.js`)
- **成因**：同连接在已有 `currentRoomId` 的状态下调用 `join_room` 进入新房间时，直接覆盖变量而未退出旧房间，导致旧房间席位残留、信令串台以及断线时旧房间无法自愈。
- **改动**：在 `server.js` `join_room` 入口增加切换保护：
  ```javascript
  if (currentRoomId && currentRoomId !== roomId) {
    const oldRoom = rooms.get(currentRoomId);
    if (oldRoom) {
      socket.leave(currentRoomId);
      const idx = oldRoom.players.findIndex(p => p.token === currentPlayerToken || p.id === socket.id);
      if (idx !== -1) {
        const removed = oldRoom.players.splice(idx, 1)[0];
        if (removed && removed.offlineTimer) clearTimeout(removed.offlineTimer);
        notifyPlayerRemoved(oldRoom, idx);
        io.to(oldRoom.id).emit('system_message', '🚪 【' + removed.name + '】离开了房间');
        // 移交房主与僵尸房间销毁兜底...
      }
    }
  }
  ```

### 4. 【P3-2】踢人主动释放离线保留定时器 (`server.js`)
- **成因**：房主执行 `kick_player` 踢出处于离线 90 秒保留期的玩家时，虽然移出了席位，但未主动清除其定时器句柄。
- **改动**：在 `room.players.splice` 前执行 `if (target.offlineTimer) clearTimeout(target.offlineTimer);`，杜绝悬挂闭包。

### 5. 【P3-1】统一盲猜数量游戏规则与公告文案 (`games/numberGuess.js`)
- **成因**：系统公告播报“【绝不爆牌规则】超过直接 0 分”，与底层数学算法（双向最接近绝对差最小者胜）及单元测试断言不一致。
- **改动**：修正为“请估算【问题】！谁的估算值与真实数量最接近，谁就能斩获高分！”，使产品文案、业务逻辑与测试用例 100% 保持一致。

### 6. 【P3-3】影子猜物防作弊强化 (`games/shadowMatch.js` & `brainGames.client.js`)
- **成因**：题目题面通过 CSS `filter: brightness(0)` 渲染剪影，但选项 `options` 原先直接下发了各选项的彩色 Emoji，作弊者通过抓包比对 `opt.emoji === targetEmoji` 即可 0ms 秒答。
- **改动**：服务端 options 中的 emoji 统一脱敏为 `'❓'`（或纯文本），前端按钮兼容渲染；真正彩色原型在回合结束揭晓弹窗时才下发展示。

---

## 三、自动化测试与回归验证

执行本地全套测试套件：
- `tests/unit/fsm_engine.test.js`：5/5 passed (新增 JSON 删除字段网络回环测试)
- `tests/unit/engine_core.test.js`：15/15 passed (新增几A几B严格弱序与尝试次数排序测试)
- `tests/unit/engine_contract.test.js`：4/4 passed (16 款游戏引擎契约函数测试)
- `tests/unit/player_removal.test.js`：15/15 passed (全引擎玩家离场自愈测试)
- `tests/unit/voice_signaling.test.js`：6/6 passed (WebRTC 信令与中继测试)
- `tests/unit/new_brain_games.test.js`：5/5 passed (脑力类小游戏规则与题库测试)
- `tests/unit/full_games_e2e.test.js`：16/16 passed (全量 16 款小游戏生命周期完整 E2E 测试)

**测试总计：66 项全部通过，0 失败，0 告警。**
