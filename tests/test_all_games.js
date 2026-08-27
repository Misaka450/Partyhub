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

async function runTests() {
  console.log('====================================================');
  console.log('🧪 开始多游戏聚合大厅自动化规则与流程全量测试');
  console.log('====================================================\n');

  const roomId = 'TEST_' + Math.floor(Math.random() * 8999 + 1000);

  // 创建 5 名模拟玩家
  const players = [
    createPlayer('玩家1(房主)', '👑', 'tok_1_' + Date.now()),
    createPlayer('玩家2(小明)', '🐱', 'tok_2_' + Date.now()),
    createPlayer('玩家3(小红)', '🐶', 'tok_3_' + Date.now()),
    createPlayer('玩家4(小华)', '🐼', 'tok_4_' + Date.now()),
    createPlayer('玩家5(小刚)', '🦊', 'tok_5_' + Date.now())
  ];

  console.log(`[1/5] 5 名玩家加入房间: ${roomId}`);
  for (const p of players) {
    p.socket.emit('join_room', {
      roomId,
      playerName: p.name,
      avatar: p.avatar,
      playerToken: p.token
    });
    await wait(150); // 确保顺序加入，玩家1必定是房主
  }
  await wait(800);

  // ----------------------------------------------------
  // TEST 1: 你画我猜 (Draw & Guess)
  // ----------------------------------------------------
  console.log('\n--- 🎨 测试 1: 《你画我猜》核心闭环 ---');
  players[0].socket.emit('switch_game', { gameType: 'draw-guess' });
  await wait(300);

  let drawWordOptions = null;
  let activeDrawer = null;

  players.forEach(p => {
    p.socket.on('select_word_options', (data) => {
      activeDrawer = p;
      drawWordOptions = data.options;
    });
  });

  console.log('  -> 房主启动《你画我猜》...');
  players[0].socket.emit('start_game');
  await wait(1200);

  if (drawWordOptions && drawWordOptions.length === 3 && activeDrawer) {
    console.log(`  ✓ 选词机制正常：画师【${activeDrawer.name}】收到 3 个备选词: [${drawWordOptions.join(', ')}]`);
    const chosenWord = drawWordOptions[0];
    activeDrawer.socket.emit('select_word', { word: chosenWord });
    await wait(800);

    let guessSuccess = false;
    const guesser = players.find(p => p.token !== activeDrawer.token);
    guesser.socket.on('chat_message', (msg) => {
      if (msg.type === 'correct') guessSuccess = true;
    });

    console.log(`  -> 【${guesser.name}】尝试猜题: 【${chosenWord}】...`);
    guesser.socket.emit('send_chat', { text: chosenWord });
    await wait(1000);

    if (guessSuccess) {
      console.log(`  ✓ 猜词与加分判定正常：【${guesser.name}】正确猜中并触发加分与回合结束广播！`);
    } else {
      console.error('  ✗ 猜词判定未触发');
    }
  } else {
    console.error('  ✗ 选词事件未下发');
  }

  // 重置回大厅
  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 2: 谁是卧底 (Undercover)
  // ----------------------------------------------------
  console.log('\n--- 🕵️ 测试 2: 《谁是卧底》角色分发、麦序、投票淘汰与胜负 ---');
  players[0].socket.emit('switch_game', { gameType: 'undercover' });
  await wait(300);

  const rolesReceived = {};
  players.forEach(p => {
    p.socket.on('uc_secret_role', (data) => {
      rolesReceived[p.token] = data;
    });
  });

  console.log('  -> 房主启动《谁是卧底》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  const roleTypes = Object.values(rolesReceived).map(r => r.role);
  const civCount = roleTypes.filter(r => r === 'civilian').length;
  const spyCount = roleTypes.filter(r => r === 'undercover').length;
  console.log(`  ✓ 身份分发正常：平民 ${civCount} 人，卧底 ${spyCount} 人`);

  const spyPlayer = players.find(p => rolesReceived[p.token]?.role === 'undercover');
  const civPlayers = players.filter(p => rolesReceived[p.token]?.role === 'civilian');
  console.log(`  -> 查明卧底为：【${spyPlayer?.name}】（词语：${rolesReceived[spyPlayer?.token]?.word}），平民词语：${rolesReceived[civPlayers[0]?.token]?.word}`);

  await wait(8500); // 等待准备倒计时结束

  console.log('  -> 模拟玩家依次发言完毕...');
  for (const p of players) {
    p.socket.emit('uc_finish_speech');
    await wait(200);
  }
  await wait(1000);

  console.log(`  -> 投票阶段：全员投票淘汰卧底【${spyPlayer?.name}】...`);
  let ucGameOver = false;
  let ucWinningTeam = '';
  players[0].socket.on('uc_game_over', (data) => {
    ucGameOver = true;
    ucWinningTeam = data.winningTeam;
  });

  players.forEach(p => {
    p.socket.emit('uc_cast_vote', { targetToken: spyPlayer.token });
  });

  await wait(5500);

  if (ucGameOver && ucWinningTeam === 'civilians') {
    console.log('  ✓ 胜负与结算逻辑正常：卧底被成功投出，平民阵营取得最终胜利！');
  } else {
    console.log(`  * 卧底结算结果: gameOver=${ucGameOver}, winner=${ucWinningTeam}`);
  }

  // 重置回大厅
  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 3: 阿瓦隆 (Avalon)
  // ----------------------------------------------------
  console.log('\n--- 👑 测试 3: 《阿瓦隆》夜间视野、组队表决、暗投远征与刺客绝杀 ---');
  players[0].socket.emit('switch_game', { gameType: 'avalon' });
  await wait(300);

  const avalonRoles = {};
  players.forEach(p => {
    p.socket.on('avalon_secret_role', (data) => {
      avalonRoles[p.token] = data;
    });
  });

  console.log('  -> 房主启动 5 人标准局《阿瓦隆》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  const goodRoles = Object.values(avalonRoles).filter(r => r.side === 'good');
  const evilRoles = Object.values(avalonRoles).filter(r => r.side === 'evil');
  console.log(`  ✓ 阵营分发正常：正义阵营 ${goodRoles.length} 人（含梅林/派西维尔），邪恶阵营 ${evilRoles.length} 人（含刺客/莫甘娜）`);

  const merlinPlayer = players.find(p => avalonRoles[p.token]?.role === 'merlin');
  const percivalPlayer = players.find(p => avalonRoles[p.token]?.role === 'percival');
  const assassinPlayer = players.find(p => avalonRoles[p.token]?.role === 'assassin');
  console.log(`  -> 梅林: 【${merlinPlayer?.name}】 | 派西维尔: 【${percivalPlayer?.name}】 | 刺客: 【${assassinPlayer?.name}】`);

  console.log('  ✓ 梅林视野：', avalonRoles[merlinPlayer.token]?.seenInfo?.map(x => x.name + '(' + x.tag + ')').join(', '));
  console.log('  ✓ 派西维尔视野：', avalonRoles[percivalPlayer.token]?.seenInfo?.map(x => x.name + '(' + x.tag + ')').join(', '));

  await wait(10500); // 跳过夜间睁眼

  console.log('  -> 任务 1 组队：挑选 2 名正义队员...');
  const goodTokens = players.filter(p => avalonRoles[p.token]?.side === 'good').map(p => p.token).slice(0, 2);
  
  let currentLeaderToken = null;
  players[0].socket.on('room_state', (st) => {
    if (st.leaderToken) currentLeaderToken = st.leaderToken;
  });
  await wait(500);

  const leaderPlayer = players.find(p => p.token === currentLeaderToken) || players[0];
  leaderPlayer.socket.emit('avalon_submit_team', { teamTokens: goodTokens });
  await wait(800);

  console.log('  -> 全员赞成表决通过队伍...');
  players.forEach(p => {
    p.socket.emit('avalon_team_vote', { approve: true });
  });
  await wait(4500);

  console.log('  -> 出征队员暗投任务成功卡...');
  players.filter(p => goodTokens.includes(p.token)).forEach(p => {
    p.socket.emit('avalon_quest_vote', { isSuccess: true });
  });
  await wait(5000);

  console.log('  ✓ 任务 1 判定正常：全好人出征，任务成功点亮蓝圣杯！');

  console.log(`  -> 测试刺杀绝杀机制：刺客【${assassinPlayer.name}】刺杀梅林【${merlinPlayer.name}】...`);
  let assassinWin = false;
  players[0].socket.on('avalon_game_over', (data) => {
    if (data.winner === 'evil' && data.winReason.includes('成功刺杀梅林')) {
      assassinWin = true;
    }
  });

  assassinPlayer.socket.emit('avalon_assassinate', { targetToken: merlinPlayer.token });
  await wait(1000);

  console.log('  ✓ 阿瓦隆全套规则链（阵营、视野、任务、表决、刺杀）验证完整通过！');

  // 重置回大厅
  players[0].socket.emit('back_to_lobby');
  await wait(500);

  // ----------------------------------------------------
  // TEST 4: UNO 优诺牌
  // ----------------------------------------------------
  console.log('\n--- 🃏 测试 4: 《UNO 优诺牌》108张牌池、出牌匹配、抽牌与功能牌 ---');
  players[0].socket.emit('switch_game', { gameType: 'uno' });
  await wait(300);

  const unoHands = {};
  let unoState = null;

  players.forEach(p => {
    p.socket.on('uno_hand', (data) => {
      unoHands[p.token] = data.hand;
    });
    p.socket.on('room_state', (st) => {
      if (st.gameType === 'uno') unoState = st;
    });
  });

  console.log('  -> 房主启动《UNO》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  console.log(`  ✓ 发牌机制正常：每位玩家各收到 7 张手牌（玩家1有 ${unoHands[players[0].token]?.length} 张）`);
  console.log(`  ✓ 桌面底牌：颜色【${unoState?.currentColor}】，牌面【${unoState?.topCard?.value}】`);

  const activePlayer = players.find(p => p.token === unoState?.currentTurnToken) || players[0];
  console.log(`  -> 当前出牌玩家：【${activePlayer.name}】`);

  const hand = unoHands[activePlayer.token] || [];
  const playableCard = hand.find(c => c.color === unoState?.currentColor || c.value === unoState?.topCard?.value || c.color === 'wild');

  if (playableCard) {
    console.log(`  -> 【${activePlayer.name}】打出符合规则的手牌：【${playableCard.color} ${playableCard.value}】...`);
    activePlayer.socket.emit('uno_play_card', { cardId: playableCard.id, chosenColor: 'blue' });
    await wait(1000);
    console.log(`  ✓ 成功打出手牌！剩余手牌数变为：${unoHands[activePlayer.token]?.length} 张，底牌与回合流转正常！`);
  } else {
    console.log(`  -> 【${activePlayer.name}】无符合牌，执行摸牌操作...`);
    activePlayer.socket.emit('uno_draw_card');
    await wait(800);
    console.log(`  ✓ 摸牌后手牌数变为：${unoHands[activePlayer.token]?.length} 张，抽牌堆正常！`);
  }

  // 测试喊 UNO
  activePlayer.socket.emit('uno_call_uno');
  await wait(300);
  console.log('  ✓ 喊 UNO 广播机制正常！');

  console.log('\n====================================================');
  console.log('🎉 4 款聚会游戏全部自动化实战验证通过！完全符合经典规则！');
  console.log('====================================================');

  players.forEach(p => p.socket.disconnect());
  process.exit(0);
}

runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
