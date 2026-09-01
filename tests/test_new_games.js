const { io } = require('socket.io-client');

// 测试服务器地址：默认本机 8080，可用环境变量 TEST_SERVER 覆盖（审计 R2-54）
const SERVER_URL = process.env.TEST_SERVER || 'http://127.0.0.1:8080';

// 失败计数器：每处断言失败 +1，结尾据此决定退出码（审计 R2-24）
let failCount = 0;

function createPlayer(name, avatar, token) {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true
  });
  return { socket, name, avatar, token };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runNewGamesTests() {
  console.log('====================================================');
  console.log('🧪 开始测试 6 款新增马趴与智力对决小游戏');
  console.log('====================================================\n');

  const roomId = 'TEST_' + Math.floor(Math.random() * 8999 + 1000);

  const players = [
    createPlayer('玩家1(房主)', '👑', 'tok_1_' + Date.now()),
    createPlayer('玩家2(小明)', '🐱', 'tok_2_' + Date.now()),
    createPlayer('玩家3(小红)', '🐶', 'tok_3_' + Date.now())
  ];

  console.log(`[准备] 3 名玩家加入房间: ${roomId}`);

  // 连接看门狗：若 10 秒内没有任何玩家成功连上服务器，直接快速失败退出（审计 R2-54）
  // 避免服务未启动时脚本静默挂起几十秒后还显示"通过"
  let connectedCount = 0;
  setTimeout(() => {
    if (connectedCount === 0) {
      console.error(`✗ 10 秒内无法连接测试服务器 ${SERVER_URL}，测试快速失败退出！`);
      process.exit(1);
    }
  }, 10000);
  players.forEach(p => {
    p.socket.on('connect', () => { connectedCount++; });
    // 每个连接只记录一次错误日志，避免重连刷屏
    let errLogged = false;
    p.socket.on('connect_error', (err) => {
      if (!errLogged) {
        errLogged = true;
        console.error(`✗ 玩家【${p.name}】连接服务器失败: ${err.message}`);
      }
    });
  });

  for (const p of players) {
    p.socket.emit('join_room', {
      roomId,
      playerName: p.name,
      avatar: p.avatar,
      playerToken: p.token
    });
    await wait(150);
  }
  await wait(800);

  // ----------------------------------------------------
  // TEST 1: 瞬间数羊 (Flash Counter)
  // ----------------------------------------------------
  console.log('\n--- 🐑 测试 1: 《瞬间数羊 / 眼力大挑战》 ---');
  players[0].socket.emit('switch_game', { gameType: 'flash-counter' });
  await wait(300);

  let targetCount = null;
  let options = [];
  players[0].socket.on('flash_question', (data) => {
    options = data.options;
  });
  players[0].socket.on('flash_round_result', (data) => {
    targetCount = data.targetCount;
  });

  console.log('  -> 房主启动《瞬间数羊》...');
  players[0].socket.emit('start_game');

  console.log('  -> 动物飞掠中，等待竞猜题目与 4 个选项...');
  const flashStartWait = Date.now();
  while (options.length === 0 && Date.now() - flashStartWait < 15000) {
    await wait(250);
  }

  if (options.length === 4) {
    console.log(`  ✓ 选项生成正常: [${options.join(', ')}]`);
    console.log('  -> 全员提交选项回答...');
    players[0].socket.emit('flash_submit_answer', { option: options[0] });
    players[1].socket.emit('flash_submit_answer', { option: options[1] });
    players[2].socket.emit('flash_submit_answer', { option: options[2] });
    await wait(2000);
    // 断言：全员作答完毕后必须收到本轮结算事件（含正确答案）
    if (targetCount !== null && targetCount !== undefined) {
      console.log(`  ✓ 本轮揭晓与结算完成，正确动物数量为：${targetCount}`);
    } else {
      failCount++;
      console.error('  ✗ 未收到本轮结算事件 flash_round_result（全员作答后应立即结算）');
    }
  } else {
    failCount++;
    console.error(`  ✗ 竞猜选项异常：收到 ${options.length} 个选项（应为 4 个）`);
  }

  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 2: 拆弹轮盘赌 (Bomb Roulette)
  // ----------------------------------------------------
  console.log('\n--- 💣 测试 2: 《拆弹轮盘赌 / 剪引线》 ---');
  players[0].socket.emit('switch_game', { gameType: 'bomb-roulette' });
  await wait(300);

  let bombState = null;
  players[0].socket.on('room_state', (st) => {
    if (st.gameType === 'bomb-roulette') bombState = st;
  });

  console.log('  -> 房主启动《拆弹轮盘赌》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  // 断言：炸弹与彩色引线必须已生成（至少 1 根引线）
  if (bombState?.wires?.length > 0) {
    console.log(`  ✓ 炸弹与引线生成正常，共生成 ${bombState.wires.length} 根彩色引线`);
  } else {
    failCount++;
    console.error(`  ✗ 炸弹引线数据缺失：wires=${JSON.stringify(bombState?.wires)}`);
  }

  // 关键事件证据：剪线后必收到 wire_cut_safe（安全）或 bomb_exploded（踩雷）广播
  let wireCutResultReceived = false;
  players[0].socket.on('wire_cut_safe', () => { wireCutResultReceived = true; });
  players[0].socket.on('bomb_exploded', () => { wireCutResultReceived = true; });

  const activeBombPlayer = players.find(p => p.token === bombState?.currentTurnToken) || players[0];
  const firstWire = bombState?.wires?.[0];
  if (firstWire) {
    console.log(`  -> 【${activeBombPlayer.name}】尝试剪断【${firstWire.name}】...`);
    activeBombPlayer.socket.emit('bomb_cut_wire', { wireId: firstWire.id });
    await wait(1500);
    // 断言：剪线后必须收到结果广播（安全或爆炸二选一）
    if (wireCutResultReceived) {
      console.log('  ✓ 剪线反馈与心跳/爆炸判定正常！');
    } else {
      failCount++;
      console.error('  ✗ 剪线后未收到 wire_cut_safe / bomb_exploded 结果广播');
    }
  } else {
    failCount++;
    console.error('  ✗ 引线数据缺失，无法执行剪线测试');
  }

  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 3: 几A几B (Bulls and Cows)
  // ----------------------------------------------------
  console.log('\n--- 🔢 测试 3: 《密码破解大师 / 几A几B》 ---');
  players[0].socket.emit('switch_game', { gameType: 'bulls-and-cows' });
  await wait(300);

  let bcResult = null;
  players[0].socket.on('bc_guess_result', (data) => {
    bcResult = data;
  });

  console.log('  -> 房主启动《几A几B》...');
  players[0].socket.emit('start_game');
  await wait(1000);

  console.log('  -> 【玩家1】提交猜测数字: 【1234】...');
  players[0].socket.emit('bc_submit_guess', { guess: '1234' });
  await wait(800);

  if (bcResult) {
    console.log(`  ✓ 逻辑反馈正常：猜想 1234 获得反馈 -> 【${bcResult.a}A${bcResult.b}B】！`);
  } else {
    console.error('  ✗ 几A几B 未收到反馈');
    failCount++; // 断言失败计数（审计 R2-24）
  }

  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 4: 决战 24 点 (Math 24 Duel)
  // ----------------------------------------------------
  console.log('\n--- 🧮 测试 4: 《决战 24 点》 ---');
  players[0].socket.emit('switch_game', { gameType: 'math-24' });
  await wait(300);

  let m24Cards = [];
  players[0].socket.on('room_state', (st) => {
    if (st.gameType === 'math-24' && st.currentCards) m24Cards = st.currentCards;
  });

  console.log('  -> 房主启动《决战 24 点》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  // 断言：每轮必须生成 4 张牌
  if (m24Cards.length === 4) {
    console.log(`  ✓ 24 点牌面生成正常: [${m24Cards.join(', ')}]`);
  } else {
    failCount++;
    console.error(`  ✗ 24 点牌面异常：收到 ${m24Cards.length} 张牌（应为 4 张）`);
  }

  // 模拟提交一个标准算式测试校验器
  // 如果牌是 [3, 8, 3, 8]，提交 (8-8/3)*3
  console.log('  -> 尝试提交验证算式...');
  let roundEndCalled = false;
  players[0].socket.on('m24_round_ended', () => { roundEndCalled = true; });
  // 关键事件证据：无论算式对错，校验器必须给出明确反馈（正确→m24_round_ended，错误→m24_submit_error）
  let submitErrorReceived = false;
  players[0].socket.on('m24_submit_error', () => { submitErrorReceived = true; });

  // 构造简单算式测试
  players[0].socket.emit('m24_submit_solution', { expression: `(${m24Cards[0]}+${m24Cards[1]}+${m24Cards[2]}+${m24Cards[3]})` });
  await wait(800);
  // 断言：安全校验与运算引擎必须对提交给出反馈（结算或报错二选一）
  if (roundEndCalled || submitErrorReceived) {
    console.log('  ✓ 24 点算式安全校验与运算引擎正常！');
  } else {
    failCount++;
    console.error('  ✗ 24 点提交后未收到任何校验反馈（m24_round_ended / m24_submit_error 均缺失）');
  }

  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 5: 3D 几何数方块 (Cube Count)
  // ----------------------------------------------------
  console.log('\n--- 🧊 测试 5: 《瞬间几何数方块 (Cube Count)》 ---');
  players[0].socket.emit('switch_game', { gameType: 'cube-count' });
  await wait(300);

  let cubeGridReceived = false;
  let cubeOptions = [];
  players[0].socket.on('cube_start_observe', (data) => {
    if (data.grid) cubeGridReceived = true;
  });
  players[0].socket.on('cube_question', (data) => {
    cubeOptions = data.options;
  });

  console.log('  -> 房主启动《3D 几何数方块》...');
  players[0].socket.emit('start_game');
  await wait(2000);

  if (cubeGridReceived) {
    console.log('  ✓ 3D 等轴立体几何体数据生成并下发正常！');
  } else {
    failCount++;
    console.error('  ✗ 未收到 cube_start_observe 立体几何数据（grid 缺失）');
  }

  await wait(5500); // 观察倒计时结束进入抢答
  if (cubeOptions.length === 4) {
    console.log(`  ✓ 4 选 1 抢答生成正常: [${cubeOptions.join(', ')}]`);
    // 关键事件证据：提交答案后服务器会广播含已作答名单（answeredTokens）的 room_state
    let cubeAnswerRecorded = false;
    players[0].socket.on('room_state', (st) => {
      if (st.gameType === 'cube-count' && (st.answeredTokens || []).includes(players[0].token)) {
        cubeAnswerRecorded = true;
      }
    });
    players[0].socket.emit('cube_submit_answer', { option: cubeOptions[0] });
    await wait(1000);
    // 断言：提交的答案必须被服务器记录（answeredTokens 中出现提交者）
    if (cubeAnswerRecorded) {
      console.log('  ✓ 答案提交与空间几何计数验证正常！');
    } else {
      failCount++;
      console.error('  ✗ 答案提交后未在 room_state.answeredTokens 中发现提交者，答案未被记录');
    }
  } else {
    failCount++;
    console.error(`  ✗ 抢答选项异常：收到 ${cubeOptions.length} 个选项（应为 4 个）`);
  }

  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 6: 成语/词汇炸弹 (Word Bomb)
  // ----------------------------------------------------
  console.log('\n--- 💥 测试 6: 《成语/词汇炸弹 (Word Bomb)》 ---');
  players[0].socket.emit('switch_game', { gameType: 'word-bomb' });
  await wait(300);

  let bombKeyword = '';
  let bombTurnToken = '';
  players[0].socket.on('room_state', (st) => {
    if (st.gameType === 'word-bomb') {
      bombKeyword = st.currentKeyword;
      bombTurnToken = st.currentTurnToken;
    }
  });

  console.log('  -> 房主启动《词汇炸弹》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  // 断言：开局必须下发关键字（否则无法构造合法词语）
  if (bombKeyword) {
    console.log(`  ✓ 炸弹已点燃！当前关键字：【${bombKeyword}】`);
  } else {
    failCount++;
    console.error('  ✗ 词汇炸弹关键字未下发（room_state.currentKeyword 为空）');
  }
  const activeWbPlayer = players.find(p => p.token === bombTurnToken) || players[0];
  console.log(`  -> 当前持弹人：【${activeWbPlayer.name}】`);

  // 关键事件证据：词语通过校验时服务器会全房广播 chat_message（type=correct）
  let wordAccepted = false;
  players[0].socket.on('chat_message', (msg) => {
    if (msg.type === 'correct') wordAccepted = true;
  });

  // 构造包含关键字的词语传递炸弹
  const testWord = `${bombKeyword}空万里`;
  console.log(`  -> 【${activeWbPlayer.name}】输入词语：【${testWord}】传递炸弹...`);
  activeWbPlayer.socket.emit('word_bomb_submit', { word: testWord });
  await wait(1000);

  // 断言：词语必须通过校验并触发全房广播（传递成功）
  if (wordAccepted) {
    console.log('  ✓ 成功打出词语并传递炸弹！');
  } else {
    failCount++;
    console.error('  ✗ 词语提交未被接受（未收到 type=correct 的 chat_message 广播）');
  }

  // 结尾：按失败计数分支输出结果，失败时退出码置 1（审计 R2-24）
  if (failCount > 0) {
    console.error('\n====================================================');
    console.error(`💥 测试结束：共 ${failCount} 处断言失败！`);
    console.error('====================================================');
    process.exitCode = 1;
  } else {
    console.log('\n====================================================');
    console.log('🎉 6 款新增马趴与智力挑战游戏全部自动化实战验证通过！');
    console.log('====================================================');
  }

  players.forEach(p => p.socket.disconnect());
}

runNewGamesTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
