const io = require('socket.io-client');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testReclaim() {
  console.log("=== 测试离线同名玩家席位认领与防重复人头 ===");
  const room = 'ROOM_DEDUP_TEST';

  // 1. First connection: bao joins with token A
  const s1 = io('http://127.0.0.1:8080');
  await new Promise(r => s1.on('connect', r));

  let hostState1 = null;
  s1.on('room_state', (st) => {
    hostState1 = st;
  });

  s1.emit('join_room', {
    roomId: room,
    playerName: 'bao',
    avatar: '🐱',
    playerToken: 'token_A_1111'
  });
  await sleep(600);
  console.log("1. 初始入房: 玩家数 =", hostState1?.players?.length, "房主 =", hostState1?.players?.[0]?.name, "isHost =", hostState1?.players?.[0]?.isHost);

  // 2. Client 1 disconnects (enters 90s grace period)
  console.log("2. 客户端1断开连接 (进入90秒保留期)...");
  s1.disconnect();
  await sleep(1000);

  // 3. Client 2 joins with NEW token B but SAME name 'bao'
  console.log("3. 客户端2以全新的 Token_B + 同名 'bao' 加入同一房间...");
  const s2 = io('http://127.0.0.1:8080');
  await new Promise(r => s2.on('connect', r));

  let hostState2 = null;
  s2.on('room_state', (st) => {
    hostState2 = st;
  });

  s2.emit('join_room', {
    roomId: room,
    playerName: 'bao',
    avatar: '🐶',
    playerToken: 'token_B_2222'
  });
  await sleep(800);

  console.log("4. 认领后状态: 玩家数 =", hostState2?.players?.length, "玩家列表:", hostState2?.players?.map(p => ({ name: p.name, isHost: p.isHost, avatar: p.avatar, token: p.token })));

  if (hostState2?.players?.length === 1 && hostState2?.players?.[0]?.isHost === true) {
    console.log("✓ SUCCESS: 成功认领原房主席位，零重复人头，保持房主特权！");
  } else {
    console.error("✗ FAILED: 仍存在重复人头或丢失房主权限！");
  }

  s2.disconnect();
}

testReclaim();
