const PRESET_24_PUZZLES = [
  [3, 8, 3, 8],
  [5, 5, 5, 1],
  [4, 4, 10, 10],
  [1, 5, 5, 5],
  [2, 7, 8, 9],
  [3, 3, 8, 8],
  [4, 6, 8, 9],
  [1, 3, 4, 6],
  [2, 3, 5, 12],
  [6, 6, 6, 6],
  [1, 2, 7, 7],
  [3, 4, 7, 8],
  [2, 4, 10, 10],
  [1, 4, 5, 6],
  [2, 8, 8, 11]
];

function solve24(cards) {
  return !!find24Solution(cards);
}

function find24Solution(cards) {
  const ops = [
    { sym: '+', fn: (a, b) => a + b },
    { sym: '-', fn: (a, b) => a - b },
    { sym: '×', fn: (a, b) => a * b },
    { sym: '÷', fn: (a, b) => b !== 0 ? a / b : null }
  ];

  function solve(items) {
    if (items.length === 1) {
      if (Math.abs(items[0].val - 24) < 1e-5) {
        return items[0].expr;
      }
      return null;
    }

    const n = items.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = items[i];
        const b = items[j];
        const rest = items.filter((_, idx) => idx !== i && idx !== j);

        for (const op of ops) {
          const res = op.fn(a.val, b.val);
          if (res !== null) {
            const newExpr = `(${a.expr} ${op.sym} ${b.expr})`;
            const ans = solve([...rest, { val: res, expr: newExpr }]);
            if (ans) return ans;
          }
        }
      }
    }
    return null;
  }

  const initialItems = cards.map(c => ({ val: c, expr: `${c}` }));
  let sol = solve(initialItems);
  if (sol) {
    if (sol.startsWith('(') && sol.endsWith(')')) {
      sol = sol.slice(1, -1);
    }
    return sol;
  }
  return null;
}

// 动态算法发牌：从 1~13（扑克牌标准 A~K）中生成保证有严格 24 点解法的题目，
// 彻底打破固定题库限制，题库完全无限。
function getRandom24Puzzle(round = 1) {
  // 第 1 轮偏简单：1~10 的数字；第 2~3 轮使用 1~13 全扑克范围
  const maxCard = round === 1 ? 10 : 13;
  for (let attempt = 0; attempt < 200; attempt++) {
    const nums = [
      Math.floor(Math.random() * maxCard) + 1,
      Math.floor(Math.random() * maxCard) + 1,
      Math.floor(Math.random() * maxCard) + 1,
      Math.floor(Math.random() * maxCard) + 1
    ];
    if (solve24(nums)) return nums;
  }
  // 极低概率尝试失败时的经典保底集合（保证即时返回）
  const FALLBACKS = [
    [3, 8, 3, 8], [5, 5, 5, 1], [4, 4, 10, 10], [1, 5, 5, 5],
    [2, 7, 8, 9], [3, 3, 8, 8], [4, 6, 8, 9], [1, 3, 4, 6]
  ];
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

// 用 Shunting-yard（调度场）算法安全求值四则运算表达式，不依赖 eval/Function，
// 从根本上避免任意代码执行风险。仅支持数字、+ - * / 与括号，按标准运算优先级。
function safeEvaluate(expr) {
  // 严格字符白名单：表达式中出现任何数字/运算符/括号/点以外的字符直接抛错，
  // 不依赖后续分词正则"静默跳过"未知字符（防止被绕过构造意外输入）
  if (typeof expr !== 'string' || !/^[\d\+\-\*\/\(\)\.\s]+$/.test(expr)) {
    throw new Error('非法字符');
  }
  const tokens = expr.match(/(\d+\.?\d*|\+|-|\*|\/|\(|\))/g) || [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const opStack = [];
  const output = [];

  for (const tk of tokens) {
    if (/^\d/.test(tk)) {
      output.push(parseFloat(tk)); // 数字直接进输出队列
    } else if (tk === '(') {
      opStack.push(tk);
    } else if (tk === ')') {
      let matched = false;
      while (opStack.length > 0) {
        const top = opStack.pop();
        if (top === '(') { matched = true; break; }
        output.push(top);
      }
      if (!matched) throw new Error('括号不匹配');
    } else if (precedence[tk] !== undefined) {
      // 弹出栈顶优先级 >= 当前运算符的运算符
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '('
             && precedence[opStack[opStack.length - 1]] >= precedence[tk]) {
        output.push(opStack.pop());
      }
      opStack.push(tk);
    } else {
      throw new Error('非法字符');
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop();
    if (top === '(') throw new Error('括号不匹配');
    output.push(top);
  }

  // 后缀（逆波兰）表达式求值
  const valueStack = [];
  for (const tk of output) {
    if (typeof tk === 'number') {
      valueStack.push(tk);
    } else {
      const b = valueStack.pop();
      const a = valueStack.pop();
      if (a === undefined || b === undefined) throw new Error('表达式无效');
      let r;
      if (tk === '+') r = a + b;
      else if (tk === '-') r = a - b;
      else if (tk === '*') r = a * b;
      else if (tk === '/') {
        if (b === 0) throw new Error('不能除以 0');
        r = a / b;
      }
      valueStack.push(r);
    }
  }

  if (valueStack.length !== 1) throw new Error('表达式无效');
  return valueStack[0];
}

function validateExpression(exprStr, targetCards) {
  // 检查字符白名单，只允许数字、+、-、*、/、(、)、空格、×、÷
  const sanitized = exprStr.replace(/×/g, '*').replace(/÷/g, '/');
  if (!/^[\d\+\-\*\/\(\)\s\.]+$/.test(sanitized)) {
    return { valid: false, reason: '包含非法字符' };
  }

  // 提取数字并与 targetCards 进行比对
  const extractedNums = (sanitized.match(/\d+/g) || []).map(Number);
  if (extractedNums.length !== targetCards.length) {
    return { valid: false, reason: '使用的数字数量不符合（必须各用一次）' };
  }

  const sortedExtracted = [...extractedNums].sort((a, b) => a - b);
  const sortedTargets = [...targetCards].sort((a, b) => a - b);
  for (let i = 0; i < sortedTargets.length; i++) {
    if (sortedExtracted[i] !== sortedTargets[i]) {
      return { valid: false, reason: '使用的数字与给定的 4 张牌不符' };
    }
  }

  try {
    // 用安全求值器替代 eval/Function，避免任意代码执行风险
    const result = safeEvaluate(sanitized);
    if (Math.abs(result - 24) < 1e-5) {
      return { valid: true, result };
    } else {
      return { valid: false, reason: `计算结果为 ${result}，不是 24` };
    }
  } catch (e) {
    return { valid: false, reason: '表达式格式错误' };
  }
}

function initRoomState(room) {
  room.gameType = 'math-24';
  room.status = 'LOBBY';
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.currentCards = [];
  room.roundWinner = null;
  room.roundExpression = '';
  // 每轮答题时长读取房间设置 m24Time（15~300 秒），未配置则默认 60 秒
  room.timeLeft = Math.min(300, Math.max(15, Number.isFinite(room.m24Time) && room.m24Time > 0 ? Math.round(room.m24Time) : 60));
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;
}

function startGame(room, io, broadcastRoom) {
  if (room.gameType !== 'math-24') return;
  if (room.players.length < 1) {
    io.to(room.id).emit('system_message', '至少需要 1 名玩家开始游戏！');
    return;
  }

  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.round = 1;
  startRound(room, io, broadcastRoom);
}

function startRound(room, io, broadcastRoom) {
  if (room.gameType !== 'math-24') return;
  clearInterval(room.timer);
  room.timer = null;
  clearTimeout(room.roundTimeout);
  room.roundTimeout = null;

  room.status = 'M24_PLAYING';
  room.currentCards = getRandom24Puzzle(room.round);
  room.roundWinner = null;
  room.roundExpression = '';
  // 与 initRoomState 保持一致：读取房间设置 m24Time（15~300 秒）
  room.timeLeft = Math.min(300, Math.max(15, Number.isFinite(room.m24Time) && room.m24Time > 0 ? Math.round(room.m24Time) : 60));

  broadcastRoom(room);
  io.to(room.id).emit('system_message', `🧮 第 ${room.round}/${room.maxRounds} 轮：请使用【${room.currentCards.join('、')}】计算出 24 点！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, null, '', io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function submitSolution(room, playerToken, exprStr, io, broadcastRoom) {
  if (room.status !== 'M24_PLAYING') return;
  const player = room.players.find(p => p.token === playerToken);
  if (!player) return;

  // 防御：客户端可能发送缺字段/非字符串数据，直接忽略防止崩溃
  if (typeof exprStr !== 'string' || !exprStr.trim()) return;

  const now = Date.now();
  if (player.lastM24SubmitTime && now - player.lastM24SubmitTime < 2500) {
    const remainSec = ((2500 - (now - player.lastM24SubmitTime)) / 1000).toFixed(1);
    io.to(player.id).emit('m24_submit_error', { reason: `⚠️ 提交过快！请冷却 ${remainSec} 秒后再试` });
    return;
  }
  player.lastM24SubmitTime = now;

  const check = validateExpression(exprStr, room.currentCards);
  if (!check.valid) {
    player.score = Math.max(0, player.score - 10); // 答错扣 10 分防无脑穷举
    io.to(player.id).emit('m24_submit_error', { reason: `${check.reason}（扣除 10 分，冷却 2.5 秒）` });
    broadcastRoom(room);
    return;
  }

  // 抢答成功！
  clearInterval(room.timer);
  const timeBonus = Math.floor(room.timeLeft * 1.5);
  const earnedScore = 150 + timeBonus;
  player.score += earnedScore;
  room.roundWinner = player;
  room.roundExpression = exprStr;

  endRound(room, player, exprStr, io, broadcastRoom);
}

function endRound(room, winner, expression, io, broadcastRoom) {
  room.status = 'M24_ROUND_RESULT';
  clearInterval(room.timer);

  const solution = find24Solution(room.currentCards) || '无解';

  io.to(room.id).emit('m24_round_ended', {
    cards: room.currentCards,
    winnerName: winner ? winner.name : '无人解出',
    winnerAvatar: winner ? winner.avatar : '⏰',
    expression: expression || '--',
    solution: solution,
    isTimeout: !winner
  });

  if (winner) {
    io.to(room.id).emit('system_message', `🎉 【${winner.name}】神速算出了 24 点！算式：【${expression} = 24】（+150 分）`);
  } else {
    io.to(room.id).emit('system_message', `⏰ 时间到，本轮无人解出！参考解法：【${solution} = 24】`);
  }

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'math-24' || room.status !== 'M24_ROUND_RESULT') return;
    if (room.round < room.maxRounds) {
      room.round++;
      startRound(room, io, broadcastRoom);
    } else {
      endGame(room, io, broadcastRoom);
    }
  }, 5000);
}

function skipPuzzleAction(room, playerToken, io, broadcastRoom) {
  if (room.status !== 'M24_PLAYING') return;
  const player = room.players.find(p => p.token === playerToken);
  if (!player || !player.isHost) return;

  clearInterval(room.timer);
  endRound(room, null, '', io, broadcastRoom);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('m24_game_over', {
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

function getPublicState(room) {
  return {
    gameType: 'math-24',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    currentCards: room.currentCards || [],
    roundWinner: room.roundWinner ? { name: room.roundWinner.name, avatar: room.roundWinner.avatar } : null
  };
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  submitSolution,
  skipPuzzleAction,
  safeEvaluate,
  validateExpression,
  solve24,
  find24Solution,
  getRandom24Puzzle
};
