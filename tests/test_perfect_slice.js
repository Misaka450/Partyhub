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

async function testPerfectSlice() {
  console.log('🧪 开始测试《切披萨 50:50 / 完美二等分》...');

  const roomId = 'TEST_' + Math.floor(Math.random() * 8999 + 1000);
  const p1 = createPlayer('神刀手', '🍕', 'tok_1_' + Date.now());
  const p2 = createPlayer('手抖达人', '🔪', 'tok_2_' + Date.now());

  p1.socket.emit('join_room', { roomId, playerName: p1.name, avatar: p1.avatar, playerToken: p1.token });
  await wait(150);
  p2.socket.emit('join_room', { roomId, playerName: p2.name, avatar: p2.avatar, playerToken: p2.token });
  await wait(800);

  p1.socket.emit('switch_game', { gameType: 'perfect-slice' });
  await wait(300);

  let shapeData = null;
  p1.socket.on('slice_start_round', (data) => {
    shapeData = data.shape;
  });

  let p1Result = null;
  p1.socket.on('slice_cut_result', (data) => {
    p1Result = data;
  });

  let roundSummary = null;
  p1.socket.on('slice_round_summary', (data) => {
    roundSummary = data;
  });

  console.log('  -> 房主启动《切披萨 50:50》...');
  p1.socket.emit('start_game');
  await wait(1500);

  // 断言 1：几何图形数据必须存在且至少 3 个顶点（否则无法构成可切割的多边形）
  if (shapeData && shapeData.points && shapeData.points.length >= 3) {
    console.log(`  ✓ 几何图形生成正常：【${shapeData.name}】（共 ${shapeData.points.length} 个顶点）`);
  } else {
    failCount++;
    console.error(`  ✗ 断言失败：几何图形数据无效（shapeData=${shapeData ? '已收到' : 'null'}，顶点数=${shapeData?.points?.length}，要求 >= 3）`);
  }

  // 模拟 p1 垂直中线切一刀：从 (0.5, 0.05) 到 (0.5, 0.95)
  console.log('  -> 【神刀手】下刀：精准垂直中线 (0.5, 0.05) -> (0.5, 0.95)...');
  p1.socket.emit('slice_cut_submit', {
    p1: { x: 0.5, y: 0.05 },
    p2: { x: 0.5, y: 0.95 }
  });
  await wait(500);

  // 断言 2：切割结果必须存在，且两块面积比之和约等于 100（±1 容差）
  const ratioSum = (p1Result?.ratio1 ?? 0) + (p1Result?.ratio2 ?? 0);
  if (p1Result && Math.abs(ratioSum - 100) <= 1) {
    console.log(`  ✓ 面积与二等分计算成功：面积比【${p1Result.ratio1}% : ${p1Result.ratio2}%】，误差仅【±${p1Result.diff}%】！`);
  } else {
    failCount++;
    console.error(`  ✗ 断言失败：切割结果无效或面积比异常（p1Result=${p1Result ? '已收到' : 'null'}，ratio1=${p1Result?.ratio1}，ratio2=${p1Result?.ratio2}，之和=${ratioSum}，应约等于 100）`);
  }

  // 模拟 p2 偏斜切一刀
  console.log('  -> 【手抖达人】下刀：斜切 (0.2, 0.1) -> (0.8, 0.9)...');
  p2.socket.emit('slice_cut_submit', {
    p1: { x: 0.2, y: 0.1 },
    p2: { x: 0.8, y: 0.9 }
  });
  await wait(1500);

  // 断言 3：两名玩家下刀完毕后，必须收到本轮结算榜事件
  if (roundSummary) {
    console.log(`  ✓ 本轮结算榜正常：最佳刀工为【${roundSummary.bestCutter}】`);
  } else {
    failCount++;
    console.error('  ✗ 断言失败：未收到本轮结算事件 slice_round_summary');
  }

  // 结尾：按失败计数分支输出结果，失败时退出码置 1（审计 R2-24）
  if (failCount > 0) {
    console.error(`\n💥 《切披萨 50:50》测试失败：共 ${failCount} 处断言未通过！\n`);
    process.exitCode = 1;
  } else {
    console.log('\n🎉 《切披萨 50:50》全套几何切割算法与联机结算验证全部通过！\n');
  }
  p1.socket.disconnect();
  p2.socket.disconnect();
}

testPerfectSlice().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
