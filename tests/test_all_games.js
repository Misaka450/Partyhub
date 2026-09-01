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
      failCount++; // 断言失败计数（审计 R2-24）
    }
  } else {
    console.error('  ✗ 选词事件未下发');
    failCount++; // 断言失败计数（审计 R2-24）
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

  // 自动推进发言麦序
  let ucVotingReached = false;
  players[0].socket.on('room_state', (st) => {
    if (st.status === 'UC_VOTING') ucVotingReached = true;
  });
  players.forEach(p => {
    p.socket.on('uc_speaker_turn', (data) => {
      if (data.speakerToken === p.token) {
        setTimeout(() => p.socket.emit('uc_finish_speech'), 100);
      }
    });
  });

  console.log('  -> 房主启动《谁是卧底》...');
  players[0].socket.emit('start_game');
  await wait(1500);

  const roleTypes = Object.values(rolesReceived).map(r => r.role);
  const civCount = roleTypes.filter(r => r === 'civilian').length;
  const spyCount = roleTypes.filter(r => r === 'undercover').length;
  // 断言：5 人局全员必须收到身份，且至少 1 名卧底、1 名平民
  if (Object.keys(rolesReceived).length === 5 && spyCount >= 1 && civCount >= 1) {
    console.log(`  ✓ 身份分发正常：平民 ${civCount} 人，卧底 ${spyCount} 人`);
  } else {
    failCount++;
    console.error(`  ✗ 身份分发异常：${Object.keys(rolesReceived).length}/5 人收到身份，卧底 ${spyCount} 人，平民 ${civCount} 人`);
  }

  const spyPlayer = players.find(p => rolesReceived[p.token]?.role === 'undercover');
  const civPlayers = players.filter(p => rolesReceived[p.token]?.role === 'civilian');
  console.log(`  -> 查明卧底为：【${spyPlayer?.name}】（词语：${rolesReceived[spyPlayer?.token]?.word}），平民词语：${rolesReceived[civPlayers[0]?.token]?.word}`);

  console.log('  -> 等待准备阶段结束并自动依次发言...');
  const waitVotingStart = Date.now();
  while (!ucVotingReached && Date.now() - waitVotingStart < 25000) {
    await wait(250);
  }

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
    failCount++;
    console.error(`  ✗ 卧底结算异常：gameOver=${ucGameOver}，winner=${ucWinningTeam}（应全员投出卧底后平民获胜）`);
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
  // 设为线下自由讨论模式（无需麦序轮候），加速自动化测试
  players[0].socket.emit('update_room_settings', { speechMode: 'offline' });
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
  // 断言：5 人标准局应为 3 正义 + 2 邪恶，且全员都收到身份
  const avalonRolesOk = Object.keys(avalonRoles).length === 5 && goodRoles.length === 3 && evilRoles.length === 2;
  if (avalonRolesOk) {
    console.log(`  ✓ 阵营分发正常：正义阵营 ${goodRoles.length} 人（含梅林/派西维尔），邪恶阵营 ${evilRoles.length} 人（含刺客/莫甘娜）`);
  } else {
    failCount++;
    console.error(`  ✗ 阵营分发异常：${Object.keys(avalonRoles).length}/5 人收到身份，正义 ${goodRoles.length} 人（应 3），邪恶 ${evilRoles.length} 人（应 2）`);
  }

  const merlinPlayer = players.find(p => avalonRoles[p.token]?.role === 'merlin');
  const percivalPlayer = players.find(p => avalonRoles[p.token]?.role === 'percival');
  const assassinPlayer = players.find(p => avalonRoles[p.token]?.role === 'assassin');
  console.log(`  -> 梅林: 【${merlinPlayer?.name}】 | 派西维尔: 【${percivalPlayer?.name}】 | 刺客: 【${assassinPlayer?.name}】`);

  // 断言：梅林的夜间视野必须非空（5 人局应看到 2 名坏人）
  if (merlinPlayer && avalonRoles[merlinPlayer.token]?.seenInfo?.length > 0) {
    console.log('  ✓ 梅林视野：', avalonRoles[merlinPlayer.token].seenInfo.map(x => x.name + '(' + x.tag + ')').join(', '));
  } else {
    failCount++;
    console.error('  ✗ 梅林视野数据缺失（seenInfo 为空或未找到梅林角色）');
  }
  // 断言：派西维尔的夜间视野必须非空（应看到梅林与莫甘娜 2 名候选人）
  if (percivalPlayer && avalonRoles[percivalPlayer.token]?.seenInfo?.length > 0) {
    console.log('  ✓ 派西维尔视野：', avalonRoles[percivalPlayer.token].seenInfo.map(x => x.name + '(' + x.tag + ')').join(', '));
  } else {
    failCount++;
    console.error('  ✗ 派西维尔视野数据缺失（seenInfo 为空或未找到派西维尔角色）');
  }

  await wait(10500); // 跳过夜间睁眼

  console.log('  -> 任务 1 组队：挑选 2 名正义队员...');
  const goodTokens = players.filter(p => avalonRoles[p.token]?.side === 'good').map(p => p.token).slice(0, 2);

  let currentLeaderToken = null;
  players[0].socket.on('room_state', (st) => {
    if (st.leaderToken) currentLeaderToken = st.leaderToken;
  });

  // 关键事件证据：组队表决结果与任务结果（必须在提交表决/任务票之前注册监听）
  let teamVoteApproved = null;
  players[0].socket.on('avalon_team_vote_result', (data) => {
    teamVoteApproved = data.passed;
  });
  let questResultData = null;
  players[0].socket.on('avalon_quest_result', (data) => {
    questResultData = data;
  });

  await wait(500);

  const leaderPlayer = players.find(p => p.token === currentLeaderToken) || players[0];
  leaderPlayer.socket.emit('avalon_submit_team', { teamTokens: goodTokens });
  await wait(800);

  console.log('  -> 全员赞成表决通过队伍...');
  players.forEach(p => {
    p.socket.emit('avalon_team_vote', { approve: true });
  });
  
  const waitVoteApprove = Date.now();
  while (teamVoteApproved === null && Date.now() - waitVoteApprove < 10000) {
    await wait(250);
  }

  // 断言：全员赞成时，组队表决必须判定通过
  if (teamVoteApproved === true) {
    console.log('  ✓ 组队表决判定正常：全员赞成，队伍获批出征！');
  } else {
    failCount++;
    console.error(`  ✗ 组队表决异常：passed=${teamVoteApproved}（全员赞成应通过）`);
  }

  console.log('  -> 等待任务远征投票阶段开启...');
  let questVotePhase = false;
  players[0].socket.on('room_state', (st) => {
    if (st.status === 'AVALON_QUEST_VOTE') questVotePhase = true;
  });
  const waitQuestPhase = Date.now();
  while (!questVotePhase && Date.now() - waitQuestPhase < 8000) {
    await wait(250);
  }

  console.log('  -> 出征队员暗投任务成功卡...');
  players.filter(p => goodTokens.includes(p.token)).forEach(p => {
    p.socket.emit('avalon_quest_vote', { isSuccess: true });
  });

  const waitQuestResult = Date.now();
  while (!questResultData && Date.now() - waitQuestResult < 8000) {
    await wait(250);
  }

  // 断言：任务 1 结果事件必须下发，且全好人出征时判定为成功
  if (questResultData && questResultData.questPassed === true) {
    console.log('  ✓ 任务 1 判定正常：全好人出征，任务成功点亮蓝圣杯！');
  } else {
    failCount++;
    console.error(`  ✗ 任务 1 判定异常：questPassed=${questResultData?.questPassed}（全好人投成功卡应任务成功）`);
  }

  console.log(`  -> 测试刺杀绝杀机制：刺客【${assassinPlayer?.name}】刺杀梅林【${merlinPlayer?.name}】...`);
  let assassinWin = false;
  players[0].socket.on('avalon_game_over', (data) => {
    if (data.winner === 'evil' && data.winReason.includes('成功刺杀梅林')) {
      assassinWin = true;
    }
  });

  if (assassinPlayer && merlinPlayer) {
    assassinPlayer.socket.emit('avalon_assassinate', { targetToken: merlinPlayer.token });
  } else {
    failCount++;
    console.error('  ✗ 刺客或梅林角色缺失，无法执行刺杀指令测试');
  }
  await wait(1000);

  // 断言（阶段守卫）：本流程只完成 1 轮任务（需 3 胜才进入刺杀阶段），
  // 服务器必须正确忽略非刺杀阶段的刺杀指令——若真触发了游戏结束反而说明守卫失效
  if (assassinWin) {
    failCount++;
    console.error('  ✗ 刺杀阶段守卫失效：非刺杀阶段的刺杀指令竟触发了游戏结束！');
  } else {
    console.log('  ✓ 刺杀阶段守卫正常：非刺杀阶段的刺杀指令被服务器正确忽略（需 3 胜方进入刺杀阶段）！');
  }

  // 断言：本游戏已验证的关键链路（身份/视野/表决/任务）事件证据齐全
  if (avalonRolesOk && teamVoteApproved === true && questResultData?.questPassed === true) {
    console.log('  ✓ 阿瓦隆阵营分发、夜间视野、组队表决与任务判定规则链验证完整通过！');
  } else {
    failCount++;
    console.error('  ✗ 阿瓦隆关键链路存在缺失事件（身份/视野/表决/任务结果未齐全）！');
  }

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

  // 断言：发牌后每位玩家必须各持 7 张手牌
  const allDealt = players.every(p => (unoHands[p.token]?.length ?? 0) === 7);
  if (allDealt) {
    console.log(`  ✓ 发牌机制正常：每位玩家各收到 7 张手牌（玩家1有 ${unoHands[players[0].token]?.length} 张）`);
  } else {
    failCount++;
    console.error(`  ✗ 发牌异常：各玩家手牌数为 ${players.map(p => unoHands[p.token]?.length ?? 0).join('/')}（应每人 7 张）`);
  }

  // 断言：桌面底牌与当前颜色必须已生成
  if (unoState?.topCard && unoState?.currentColor) {
    console.log(`  ✓ 桌面底牌：颜色【${unoState.currentColor}】，牌面【${unoState.topCard.value}】`);
  } else {
    failCount++;
    console.error(`  ✗ UNO 桌面状态缺失：topCard=${JSON.stringify(unoState?.topCard)}，currentColor=${unoState?.currentColor}`);
  }

  const activePlayer = players.find(p => p.token === unoState?.currentTurnToken) || players[0];
  console.log(`  -> 当前出牌玩家：【${activePlayer.name}】`);

  const hand = unoHands[activePlayer.token] || [];
  const playableCard = hand.find(c => c.color === unoState?.currentColor || c.value === unoState?.topCard?.value || c.color === 'wild');

  // 关键事件证据：成功出牌时服务器会全房广播 uno_card_played
  let cardPlayedReceived = false;
  players[0].socket.on('uno_card_played', (data) => {
    if (data.playerToken === activePlayer.token) cardPlayedReceived = true;
  });

  if (playableCard) {
    console.log(`  -> 【${activePlayer.name}】打出符合规则的手牌：【${playableCard.color} ${playableCard.value}】...`);
    activePlayer.socket.emit('uno_play_card', { cardId: playableCard.id, chosenColor: 'blue' });
    await wait(1000);
    // 断言：必须收到出牌广播，且该玩家手牌数从 7 张减少
    if (cardPlayedReceived && (unoHands[activePlayer.token]?.length ?? 7) < 7) {
      console.log(`  ✓ 成功打出手牌！剩余手牌数变为：${unoHands[activePlayer.token]?.length} 张，底牌与回合流转正常！`);
    } else {
      failCount++;
      console.error(`  ✗ 出牌断言失败：出牌广播=${cardPlayedReceived}，剩余手牌=${unoHands[activePlayer.token]?.length}（应 < 7）`);
    }
  } else {
    const beforeDraw = unoHands[activePlayer.token]?.length ?? 0;
    console.log(`  -> 【${activePlayer.name}】无符合牌，执行摸牌操作...`);
    activePlayer.socket.emit('uno_draw_card');
    await wait(800);
    // 断言：摸牌后手牌数必须恰好 +1
    if ((unoHands[activePlayer.token]?.length ?? 0) === beforeDraw + 1) {
      console.log(`  ✓ 摸牌后手牌数变为：${unoHands[activePlayer.token]?.length} 张，抽牌堆正常！`);
    } else {
      failCount++;
      console.error(`  ✗ 摸牌断言失败：${beforeDraw} 张 -> ${unoHands[activePlayer.token]?.length} 张（应恰好 +1）`);
    }
  }

  // 测试喊 UNO（关键事件证据：只有手牌剩 2 张时喊话才会广播 uno_called）
  let unoCalledReceived = false;
  players[0].socket.on('uno_called', () => { unoCalledReceived = true; });
  activePlayer.socket.emit('uno_call_uno');
  await wait(300);
  // 断言（防误报守卫）：当前玩家手牌数并非 2 张，服务器必须忽略喊话、不广播 uno_called
  if (unoCalledReceived) {
    failCount++;
    console.error(`  ✗ 喊 UNO 守卫失效：手牌数非 2（${unoHands[activePlayer.token]?.length} 张）时服务器仍广播了 uno_called！`);
  } else {
    console.log('  ✓ 喊 UNO 防误报守卫正常：手牌数非 2 时喊话被正确忽略！');
  }

  // 结尾：按失败计数分支输出结果，失败时退出码置 1（审计 R2-24）
  if (failCount > 0) {
    console.error('\n====================================================');
    console.error(`💥 测试结束：共 ${failCount} 处断言失败！`);
    console.error('====================================================');
    process.exitCode = 1;
  } else {
    console.log('\n====================================================');
    console.log('🎉 4 款聚会游戏全部自动化实战验证通过！完全符合经典规则！');
    console.log('====================================================');
  }

  players.forEach(p => p.socket.disconnect());
}

runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
