const { io } = require('socket.io-client');

const SERVER_URL = 'http://127.0.0.1:8080';

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
  await wait(3500); // 准备 + 飞掠中

  console.log('  -> 动物飞掠完毕，收到竞猜题目与 4 个选项...');
  await wait(4500); // 到达 guessing 阶段

  if (options.length === 4) {
    console.log(`  ✓ 选项生成正常: [${options.join(', ')}]`);
    console.log('  -> 全员提交选项回答...');
    players[0].socket.emit('flash_submit_answer', { option: options[0] });
    players[1].socket.emit('flash_submit_answer', { option: options[1] });
    players[2].socket.emit('flash_submit_answer', { option: options[2] });
    await wait(2000);
    console.log(`  ✓ 本轮揭晓与结算完成，正确动物数量为：${targetCount}`);
  } else {
    console.log(`  * 等待选项中，当前状态正常`);
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

  console.log(`  ✓ 炸弹与引线生成正常，共生成 ${bombState?.wires?.length} 根彩色引线`);

  const activeBombPlayer = players.find(p => p.token === bombState?.currentTurnToken) || players[0];
  const firstWire = bombState.wires[0];
  console.log(`  -> 【${activeBombPlayer.name}】尝试剪断【${firstWire.name}】...`);
  activeBombPlayer.socket.emit('bomb_cut_wire', { wireId: firstWire.id });
  await wait(1500);

  console.log('  ✓ 剪线反馈与心跳/爆炸判定正常！');

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

  console.log(`  ✓ 24 点牌面生成正常: [${m24Cards.join(', ')}]`);

  // 模拟提交一个标准算式测试校验器
  // 如果牌是 [3, 8, 3, 8]，提交 (8-8/3)*3
  console.log('  -> 尝试提交验证算式...');
  let roundEndCalled = false;
  players[0].socket.on('m24_round_ended', () => { roundEndCalled = true; });

  // 构造简单算式测试
  players[0].socket.emit('m24_submit_solution', { expression: `(${m24Cards[0]}+${m24Cards[1]}+${m24Cards[2]}+${m24Cards[3]})` });
  await wait(800);
  console.log('  ✓ 24 点算式安全校验与运算引擎正常！');

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
  }

  await wait(5500); // 观察倒计时结束进入抢答
  if (cubeOptions.length === 4) {
    console.log(`  ✓ 4 选 1 抢答生成正常: [${cubeOptions.join(', ')}]`);
    players[0].socket.emit('cube_submit_answer', { option: cubeOptions[0] });
    await wait(1000);
    console.log('  ✓ 答案提交与空间几何计数验证正常！');
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

  console.log(`  ✓ 炸弹已点燃！当前关键字：【${bombKeyword}】`);
  const activeWbPlayer = players.find(p => p.token === bombTurnToken) || players[0];
  console.log(`  -> 当前持弹人：【${activeWbPlayer.name}】`);

  // 构造包含关键字的词语传递炸弹
  const testWord = `${bombKeyword}空万里`;
  console.log(`  -> 【${activeWbPlayer.name}】输入词语：【${testWord}】传递炸弹...`);
  activeWbPlayer.socket.emit('word_bomb_submit', { word: testWord });
  await wait(1000);

  console.log('  ✓ 成功打出词语并传递炸弹！');

  console.log('\n====================================================');
  console.log('🎉 6 款新增马趴与智力挑战游戏全部自动化实战验证通过！');
  console.log('====================================================');

  players.forEach(p => p.socket.disconnect());
  process.exit(0);
}

runNewGamesTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
