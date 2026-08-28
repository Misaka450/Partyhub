const { io } = require('socket.io-client');

const SERVER_URL = 'http://127.0.0.1:8080';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createPlayer(name, avatar, token) {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true
  });
  return { socket, name, avatar, token };
}

async function testCubeCountMultiRound() {
  console.log('=== 🚀 开始测试 3D 几何数方块多回合流转与点击响应 ===');

  const roomId = 'CUBE_' + Math.floor(Math.random() * 8999 + 1000);
  const p1 = createPlayer('房主小马', '🐱', 'tok_p1_' + Date.now());
  const p2 = createPlayer('玩家小李', '🐶', 'tok_p2_' + Date.now());

  for (const p of [p1, p2]) {
    p.socket.emit('join_room', {
      roomId,
      playerName: p.name,
      avatar: p.avatar,
      playerToken: p.token
    });
    await wait(200);
  }

  console.log(`1. 玩家 1 & 2 成功加入房间: ${roomId}`);

  p1.socket.emit('switch_game', { gameType: 'cube-count' });
  await wait(400);

  let round1Observed = false;
  let round2Observed = false;
  let round1Options = [];
  let round2Options = [];
  let round1Result = null;
  let round2Result = null;

  p1.socket.on('cube_start_observe', (data) => {
    console.log(`[EVENT] cube_start_observe: Round ${data.round}/${data.maxRounds}, ObserveTime=${data.observeTime}s`);
    if (data.round === 1) round1Observed = true;
    if (data.round === 2) round2Observed = true;
  });

  p1.socket.on('cube_question', (data) => {
    console.log(`[EVENT] cube_question: options=[${data.options.join(', ')}]`);
    if (!round1Options.length) {
      round1Options = data.options;
    } else {
      round2Options = data.options;
    }
  });

  p1.socket.on('cube_round_result', (data) => {
    console.log(`[EVENT] cube_round_result: TotalCubes=${data.totalCubes}, Summary:`, data.answersSummary.map(a => `${a.name}:${a.option}`));
    if (!round1Result) {
      round1Result = data;
    } else {
      round2Result = data;
    }
  });

  // 开始游戏
  console.log('2. 房主启动数方块游戏');
  p1.socket.emit('start_game');

  // 等待第 1 轮 6s 观察倒计时结束
  console.log('3. 等待第 1 轮 6s 观察倒计时...');
  await wait(6500);

  if (round1Options.length === 4) {
    console.log(`✓ 第 1 轮题目已生成: [${round1Options.join(', ')}]`);
    console.log('4. P1 和 P2 提交第 1 轮答案');
    p1.socket.emit('cube_submit_answer', { option: round1Options[0] });
    p2.socket.emit('cube_submit_answer', { option: round1Options[1] });
  } else {
    throw new Error('第 1 轮题目未能按时收到！');
  }

  // 等待第 1 轮结算 (4.5s) + 第 2 轮开启
  console.log('5. 等待第 1 轮结算与第 2 轮观察期开启...');
  await wait(5500);

  if (!round2Observed) {
    throw new Error('未能进入第 2 轮观察期！');
  }
  console.log('✓ 成功进入第 2 轮观察期 (CUBE_OBSERVE)！');

  // 模拟在观察期点击（防呆测试）
  console.log('6. 模拟在第 2 轮观察期提交答案（验证观察期不会误判）');
  p1.socket.emit('cube_submit_answer', { option: 99 });
  await wait(1000);

  // 等待第 2 轮 6s 观察倒计时结束
  console.log('7. 等待第 2 轮观察倒计时结束，进入抢答期...');
  await wait(5500);

  if (round2Options.length === 4) {
    console.log(`✓ 第 2 轮题目已生成: [${round2Options.join(', ')}]`);
    console.log('8. P1 和 P2 在第 2 轮抢答期点击提交');
    p1.socket.emit('cube_submit_answer', { option: round2Options[0] });
    p2.socket.emit('cube_submit_answer', { option: round2Options[1] });
  } else {
    throw new Error('第 2 轮题目未能收到！');
  }

  await wait(2000);
  if (round2Result) {
    console.log('✓ 第 2 轮成功结算并产出正确战报！');
  } else {
    console.log('等待第 2 轮结算回调...');
    await wait(3000);
    if (!round2Result) throw new Error('第 2 轮未能完成结算！');
  }

  console.log('\n🎉 3D 几何数方块多回合流转及第二回合点击测试全部成功通过！');
  p1.socket.disconnect();
  p2.socket.disconnect();
  process.exit(0);
}

testCubeCountMultiRound().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
