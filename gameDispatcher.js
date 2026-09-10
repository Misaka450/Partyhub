/**
 * gameDispatcher.js
 * ============================================================================
 * 【游戏事件统一分发器 (Game Action Dispatcher)】
 * 
 * 💡 为什么需要这个模块？（小白开发者通俗解释）：
 * 原本在 server.js 中，每一个小游戏的操作（例如出牌、按抢答、切披萨等）都需要
 * 手动写一个 socket.on(...)，19 款小游戏写了 30 多处，导致 server.js 膨胀到 1000 多行，
 * 而且每处都在重复做 "判断房间在不在"、"判断玩家在不在" 等枯燥校验。
 * 
 * 本模块就像一个【智能总服务台】：
 * 1. 统一登记所有 19 款小游戏的动作规则（动作名 -> 对应引擎函数）；
 * 2. 自动帮你做前置安全检查（房间是否存在、玩家是否合法、游戏类型是否吻合）；
 * 3. 既支持原有单独事件监听（100% 兼容老代码），又提供统一的 'game_action' 通道；
 * 4. 让 server.js 变得极为干净、清爽且易于维护！
 * ============================================================================
 */

/**
 * 注册所有小游戏动作与处理函数的映射字典
 * @param {Object} engines 游戏引擎字典
 * @returns {Object} 动作配置表
 */
function createActionRegistry(engines) {
  return {
    // ---------- 你画我猜 ----------
    'select_word': {
      gameType: 'draw-guess',
      handler: (ctx, payload) => {
        if (ctx.room.status !== 'SELECTING') return;
        ctx.safeCall(engines['draw-guess'].selectWord, ctx.room, ctx.socket.id, payload?.word, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 谁是卧底 ----------
    'uc_finish_speech': {
      gameType: 'undercover',
      handler: (ctx) => {
        ctx.safeCall(engines['undercover'].finishCurrentSpeech, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'uc_cast_vote': {
      gameType: 'undercover',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['undercover'].castVote, ctx.room, ctx.playerToken, payload?.targetToken, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 阿瓦隆 ----------
    'avalon_select_member': {
      gameType: 'avalon',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['avalon'].selectTeamMember, ctx.room, ctx.playerToken, payload?.memberToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'avalon_submit_team': {
      gameType: 'avalon',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['avalon'].submitTeam, ctx.room, ctx.playerToken, payload?.teamTokens, ctx.io, ctx.broadcastRoom);
      }
    },
    'avalon_finish_speech': {
      gameType: 'avalon',
      handler: (ctx) => {
        ctx.safeCall(engines['avalon'].finishCurrentSpeech, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'avalon_team_vote': {
      gameType: 'avalon',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['avalon'].castTeamVote, ctx.room, ctx.playerToken, payload?.approve, ctx.io, ctx.broadcastRoom);
      }
    },
    'avalon_quest_vote': {
      gameType: 'avalon',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['avalon'].castQuestVote, ctx.room, ctx.playerToken, payload?.isSuccess, ctx.io, ctx.broadcastRoom);
      }
    },
    'avalon_assassinate': {
      gameType: 'avalon',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['avalon'].assassinatePlayer, ctx.room, ctx.playerToken, payload?.targetToken, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- UNO ----------
    'uno_play_card': {
      gameType: 'uno',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['uno'].playCard, ctx.room, ctx.playerToken, payload?.cardId, payload?.chosenColor, ctx.io, ctx.broadcastRoom);
      }
    },
    'uno_draw_card': {
      gameType: 'uno',
      handler: (ctx) => {
        ctx.safeCall(engines['uno'].drawCardAction, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'uno_pass_turn': {
      gameType: 'uno',
      handler: (ctx) => {
        ctx.safeCall(engines['uno'].passTurnAction, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'uno_call_uno': {
      gameType: 'uno',
      handler: (ctx) => {
        ctx.safeCall(engines['uno'].callUno, ctx.room, ctx.playerToken, ctx.io);
      }
    },
    'uno_catch_uno': {
      gameType: 'uno',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['uno'].catchUno, ctx.room, ctx.playerToken, payload?.targetToken, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 瞬间数羊 ----------
    'flash_submit_answer': {
      gameType: 'flash-counter',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['flash-counter'].submitAnswer, ctx.room, ctx.playerToken, payload?.option, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 拆弹轮盘赌 ----------
    'bomb_cut_wire': {
      gameType: 'bomb-roulette',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['bomb-roulette'].cutWire, ctx.room, ctx.playerToken, payload?.wireId, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 密码破解大师 (几A几B) ----------
    'bc_submit_guess': {
      gameType: 'bulls-and-cows',
      handler: (ctx, payload) => {
        const player = ctx.player;
        if (!player) return;
        // 500ms 频控防护，防止短时间连续暴力提交
        const now = Date.now();
        if (player.lastGuessAt && now - player.lastGuessAt < 500) return;
        player.lastGuessAt = now;
        ctx.safeCall(engines['bulls-and-cows'].submitGuess, ctx.room, ctx.playerToken, payload?.guess, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 决战 24 点 ----------
    'm24_submit_solution': {
      gameType: 'math-24',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['math-24'].submitSolution, ctx.room, ctx.playerToken, payload?.expression, ctx.io, ctx.broadcastRoom);
      }
    },
    'm24_skip_puzzle': {
      gameType: 'math-24',
      handler: (ctx) => {
        if (engines['math-24'].skipPuzzleAction) {
          ctx.safeCall(engines['math-24'].skipPuzzleAction, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
        }
      }
    },

    // ---------- 瞬间几何数方块 ----------
    'cube_submit_answer': {
      gameType: 'cube-count',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['cube-count'].submitAnswer, ctx.room, ctx.playerToken, payload?.option, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 成语/词汇炸弹 ----------
    'word_bomb_submit': {
      gameType: 'word-bomb',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['word-bomb'].submitWord, ctx.room, ctx.playerToken, payload?.word, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 切披萨 50:50 ----------
    'slice_cut_submit': {
      gameType: 'perfect-slice',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['perfect-slice'].submitSlice, ctx.room, ctx.playerToken, payload?.p1, payload?.p2, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 盲压 5 秒 ----------
    // 服务端墙钟计时：按下/抬起两个事件分别记录起止时刻，杜绝客户端伪造精准时长刷满分
    'hold_start': {
      gameType: 'hold-five',
      handler: (ctx) => {
        ctx.safeCall(engines['hold-five'].holdStart, ctx.room, ctx.playerToken, ctx.io, ctx.broadcastRoom);
      }
    },
    'hold_end': {
      gameType: 'hold-five',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['hold-five'].holdEnd, ctx.room, ctx.playerToken, payload, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 颜色与文字大陷阱 ----------
    'stroop_submit_answer': {
      gameType: 'stroop-trap',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['stroop-trap'].submitAnswer, ctx.room, ctx.player, payload?.answerId, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 聚光灯拼图 / 影子猜物 ----------
    'shadow_submit_answer': {
      gameType: 'shadow-match',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['shadow-match'].submitAnswer, ctx.room, ctx.player, payload?.answerId, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 西蒙说 / 节拍记忆 ----------
    'simon_submit_step': {
      gameType: 'simon-memory',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['simon-memory'].submitStep, ctx.room, ctx.player, payload?.color, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 轨道连连通 / 小火车快跑 ----------
    'train_submit_answer': {
      gameType: 'train-route',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['train-route'].submitAnswer, ctx.room, ctx.player, payload?.trackId, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 折纸打孔展开图 ----------
    'hole_submit_answer': {
      gameType: 'hole-punch',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['hole-punch'].submitAnswer, ctx.room, ctx.player, payload?.optionId, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 找零钱大师 ----------
    'change_submit_counts': {
      gameType: 'change-master',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['change-master'].submitChange, ctx.room, ctx.player, payload?.counts, ctx.io, ctx.broadcastRoom);
      }
    },

    // ---------- 盲猜谁接近 ----------
    'number_submit_guess': {
      gameType: 'number-guess',
      handler: (ctx, payload) => {
        ctx.safeCall(engines['number-guess'].submitGuess, ctx.room, ctx.player, payload?.guess, ctx.io, ctx.broadcastRoom);
      }
    }
  };
}

/**
 * 挂载分发机制到指定的 Socket 连接上
 * 
 * @param {Object} socket 当前客户端的 Socket.IO 连接
 * @param {Object} options 全局运行上下文依赖
 * @param {Function} options.getRoomContext 获取当前连接关联的房间与玩家对象
 * @param {Object} options.engines 所有已加载的游戏引擎
 * @param {Object} options.io 全局 Socket.IO 实例
 * @param {Function} options.broadcastRoom 全房间状态广播函数
 * @param {Function} options.safeEngineCall 异常安全包裹函数
 */
function attachGameDispatcher(socket, { getRoomContext, engines, io, broadcastRoom, safeEngineCall }) {
  const registry = createActionRegistry(engines);

  // 统一的内部动作执行路由：负责鉴权、状态检查与异常隔离
  function dispatch(actionName, payload = {}) {
    const config = registry[actionName];
    if (!config) {
      console.warn(`[Dispatcher] 未知游戏动作请求: ${actionName}`);
      return;
    }

    const { room, player, roomId, playerToken } = getRoomContext();
    if (!room || !player) return;

    // 严密校验：房间当前游戏类型必须与动作匹配，防止跨游戏误触发
    if (config.gameType && room.gameType !== config.gameType) {
      return;
    }

    // 执行具体游戏逻辑
    try {
      config.handler({
        socket,
        room,
        player,
        roomId,
        playerToken,
        io,
        broadcastRoom,
        safeCall: safeEngineCall
      }, payload);
    } catch (err) {
      console.error(`⚠️ [Dispatcher 异常] 动作 ${actionName} 执行失败:`, err);
    }
  }

  // 1. 【通用新通道】前端只需 emit('game_action', { action, payload })
  socket.on('game_action', ({ action, payload } = {}) => {
    if (typeof action !== 'string') return;
    dispatch(action, payload);
  });

  // 2. 【100% 向下兼容老通道】自动循环监听原有特定事件名称（例如 'uno_play_card'）
  for (const actionName of Object.keys(registry)) {
    socket.on(actionName, (payload) => {
      dispatch(actionName, payload);
    });
  }
}

module.exports = {
  attachGameDispatcher,
  createActionRegistry
};
