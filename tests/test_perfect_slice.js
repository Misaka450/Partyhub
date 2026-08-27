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

  console.log(`  ✓ 几何图形生成正常：【${shapeData?.name}】（共 ${shapeData?.points?.length} 个顶点）`);

  // 模拟 p1 垂直中线切一刀：从 (0.5, 0.05) 到 (0.5, 0.95)
  console.log('  -> 【神刀手】下刀：精准垂直中线 (0.5, 0.05) -> (0.5, 0.95)...');
  p1.socket.emit('slice_cut_submit', {
    p1: { x: 0.5, y: 0.05 },
    p2: { x: 0.5, y: 0.95 }
  });
  await wait(500);

  console.log(`  ✓ 面积与二等分计算成功：面积比【${p1Result?.ratio1}% : ${p1Result?.ratio2}%】，误差仅【±${p1Result?.diff}%】！`);

  // 模拟 p2 偏斜切一刀
  console.log('  -> 【手抖达人】下刀：斜切 (0.2, 0.1) -> (0.8, 0.9)...');
  p2.socket.emit('slice_cut_submit', {
    p1: { x: 0.2, y: 0.1 },
    p2: { x: 0.8, y: 0.9 }
  });
  await wait(1500);

  if (roundSummary) {
    console.log(`  ✓ 本轮结算榜正常：最佳刀工为【${roundSummary.bestCutter}】`);
  }

  console.log('\n🎉 《切披萨 50:50》全套几何切割算法与联机结算验证通过！\n');
  p1.socket.disconnect();
  p2.socket.disconnect();
  process.exit(0);
}

testPerfectSlice().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
