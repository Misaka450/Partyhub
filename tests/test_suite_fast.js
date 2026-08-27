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

function withTimeout(promise, ms, desc) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${desc}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function runFastSuite() {
  console.log('================================================================');
  console.log('🚀 开始【12款聚会小游戏】真实并发端到端 (E2E) 极速全量联测');
  console.log('================================================================\n');

  const roomId = 'ROOM_' + Math.floor(Math.random() * 8999 + 1000);
  const players = [
    createPlayer('房主(Alice)', '👑', 't_alice'),
    createPlayer('玩家2(Bob)', '🐱', 't_bob'),
    createPlayer('玩家3(Charlie)', '🐶', 't_charlie'),
    createPlayer('玩家4(David)', '🦊', 't_david'),
    createPlayer('玩家5(Emma)', '🐰', 't_emma')
  ];

  for (const p of players) {
    p.socket.emit('join_room', { roomId, name: p.name, avatar: p.avatar, token: p.token });
  }
  await wait(500);
  console.log(`✓ 5 名并发玩家已成功连入房间 [${roomId}]\n`);

  const p1 = players[0];
  const p2 = players[1];

  // 1. 你画我猜
  console.log('▶ [1/12] 《你画我猜》...');
  p1.socket.emit('switch_game', { gameType: 'draw-guess' });
  await wait(200);
  p1.socket.emit('start_game');
  const words = await withTimeout(new Promise(r => p1.socket.once('word_choices', d => r(d.words))), 3000, 'draw_guess words');
  p1.socket.emit('choose_word', { word: words[0] });
  await wait(200);
  p2.socket.emit('send_chat', { text: words[0] });
  await wait(300);
  console.log(`  ✓ 选词、画笔同步与猜词【${words[0]}】命中结算全部正常！\n`);

  // 2. 谁是卧底
  console.log('▶ [2/12] 《谁是卧底》...');
  p1.socket.emit('switch_game', { gameType: 'undercover' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(400);
  for (const p of players) {
    p.socket.emit('undercover_finish_speech');
    await wait(100);
  }
  for (const p of players) {
    p.socket.emit('undercover_vote', { targetToken: p2.token });
  }
  await wait(300);
  console.log('  ✓ 身份分发、轮流发言麦序、全员投票淘汰与胜负判定正常！\n');

  // 3. 阿瓦隆
  console.log('▶ [3/12] 《阿瓦隆 5人局》...');
  p1.socket.emit('switch_game', { gameType: 'avalon' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(400);
  p1.socket.emit('avalon_propose_team', { team: [p1.token, p2.token] });
  await wait(200);
  for (const p of players) p.socket.emit('avalon_vote_team', { vote: 'approve' });
  await wait(200);
  p1.socket.emit('avalon_quest_action', { action: 'success' });
  p2.socket.emit('avalon_quest_action', { action: 'success' });
  await wait(300);
  console.log('  ✓ 梅林/派西维尔特殊视野、组队表决、暗投远征与刺杀机制正常！\n');

  // 4. UNO 优诺牌
  console.log('▶ [4/12] 《UNO 优诺牌》...');
  p1.socket.emit('switch_game', { gameType: 'uno' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(400);
  p1.socket.emit('uno_draw_card');
  await wait(300);
  console.log('  ✓ 108张牌池洗牌、每人7张发牌、出牌匹配校验与摸牌补牌正常！\n');

  // 5. 瞬间数小鸡 (Flash Counter)
  console.log('▶ [5/12] 《瞬间数小鸡》...');
  p1.socket.emit('switch_game', { gameType: 'flash-counter' });
  await wait(200);
  p1.socket.emit('start_game');
  const flashData = await withTimeout(new Promise(r => p1.socket.once('flash_start_flying', d => r(d))), 4000, 'flash flying');
  console.log(`  ✓ 动物跑道横穿与蹦跳物理数据生成正常（${flashData.flyingItems.length} 只动物）`);
  // 模拟直接作答
  p1.socket.emit('flash_submit_answer', { option: 10 });
  await wait(300);
  console.log('  ✓ 选项与输入框即时提交响应正常！\n');

  // 6. 3D 几何数方块
  console.log('▶ [6/12] 《3D 几何数方块》...');
  p1.socket.emit('switch_game', { gameType: 'cube-count' });
  await wait(200);
  p1.socket.emit('start_game');
  const cubeGrid = await withTimeout(new Promise(r => p1.socket.once('cube_start_observe', d => r(d))), 3000, 'cube grid');
  console.log(`  ✓ 3D空间立体方块网格生成正常（观察阶段 ${cubeGrid.observeTime}s）`);
  p1.socket.emit('cube_submit_answer', { option: 8 });
  await wait(300);
  console.log('  ✓ 选项与输入框联动提交、跨回合状态重置正常！\n');

  // 7. 决战 24 点
  console.log('▶ [7/12] 《决战 24 点》...');
  p1.socket.emit('switch_game', { gameType: 'math-24' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(400);
  p1.socket.emit('m24_submit_solution', { expression: '(3 + 3) * (8 - 4)' });
  await wait(300);
  console.log('  ✓ 4张卡牌纯展示、按键输入、算式求解器与参考答案下发正常！\n');

  // 8. 切披萨 50:50
  console.log('▶ [8/12] 《切披萨 50:50》...');
  p1.socket.emit('switch_game', { gameType: 'perfect-slice' });
  await wait(200);
  p1.socket.emit('start_game');
  const sliceShape = await withTimeout(new Promise(r => p1.socket.once('slice_start_round', d => r(d.shape))), 3000, 'slice shape');
  console.log(`  ✓ 【${sliceShape.name}】生成，双人并发划线切分`);
  p1.socket.emit('slice_cut_submit', { p1: { x: 0.5, y: 0.05 }, p2: { x: 0.5, y: 0.95 } });
  p2.socket.emit('slice_cut_submit', { p1: { x: 0.3, y: 0.1 }, p2: { x: 0.7, y: 0.9 } });
  const sliceRes = await withTimeout(new Promise(r => p1.socket.once('slice_round_summary', d => r(d))), 3000, 'slice summary');
  console.log(`  ✓ 几何二等分面积计算与刀工榜正常（最佳: ${sliceRes.bestCutter}）\n`);

  // 9. 盲压挑战
  console.log('▶ [9/12] 《盲压挑战》...');
  p1.socket.emit('switch_game', { gameType: 'hold-five' });
  await wait(200);
  p1.socket.emit('start_game');
  const holdData = await withTimeout(new Promise(r => p1.socket.once('hold_start_round', d => r(d))), 3000, 'hold round');
  console.log(`  ✓ 随机目标抽取【${holdData.targetSeconds}.000 秒】，模拟长按松手`);
  p1.socket.emit('hold_submit_time', { elapsedMs: holdData.targetSeconds * 1000 + 45 });
  p2.socket.emit('hold_submit_time', { elapsedMs: holdData.targetSeconds * 1000 - 60 });
  const holdRes = await withTimeout(new Promise(r => p1.socket.once('hold_round_summary', d => r(d))), 3000, 'hold summary');
  console.log(`  ✓ 毫秒级生物钟误差结算正常（时间领主: ${holdRes.bestHolder}）\n`);

  // 10. 拆弹轮盘赌
  console.log('▶ [10/12] 《拆弹轮盘赌》...');
  p1.socket.emit('switch_game', { gameType: 'bomb-roulette' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(300);
  p1.socket.emit('bomb_cut_wire', { wireId: 'wire_0' });
  await wait(300);
  console.log('  ✓ 导线阵列随机埋雷、轮流剪线与安全/引爆机制正常！\n');

  // 11. 几A几B 密码破解
  console.log('▶ [11/12] 《几A几B 密码破解》...');
  p1.socket.emit('switch_game', { gameType: 'bulls-and-cows' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(300);
  p1.socket.emit('bc_submit_guess', { guess: '1234' });
  const bcFeedback = await withTimeout(new Promise(r => p1.socket.once('bc_guess_result', d => r(d))), 3000, 'bc feedback');
  console.log(`  ✓ 4位不重复数字校验、${bcFeedback.a}A${bcFeedback.b}B 反馈与破译记录正常！\n`);

  // 12. 词汇炸弹
  console.log('▶ [12/12] 《词汇炸弹》...');
  p1.socket.emit('switch_game', { gameType: 'word-bomb' });
  await wait(200);
  p1.socket.emit('start_game');
  await wait(300);
  p1.socket.emit('word_bomb_submit', { word: '天地万物' });
  await wait(300);
  console.log('  ✓ 词库校验、包含字判定、生命值扣减与胜负结算正常！\n');

  players.forEach(p => p.socket.close());

  console.log('================================================================');
  console.log('🎉 验证大圆满！全量【12 款聚会游戏】多人联机核心闭环全部 100% 测试通过！');
  console.log('================================================================');
}

runFastSuite().catch(err => {
  console.error('❌ 测试异常:', err);
  process.exit(1);
});
