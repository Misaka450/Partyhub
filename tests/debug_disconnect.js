const io = require('socket.io-client');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function debugDisconnect() {
  const s1 = io('http://127.0.0.1:8080');
  await new Promise(r => s1.on('connect', r));

  s1.emit('join_room', {
    roomId: 'DEBUG_ROOM',
    playerName: 'bao',
    avatar: '🐱',
    playerToken: 'token_A_1111'
  });
  await sleep(500);

  // Check state before disconnect
  s1.disconnect();
  await sleep(500);

  // New connection
  const s2 = io('http://127.0.0.1:8080');
  await new Promise(r => s2.on('connect', r));

  s2.on('room_state', (st) => {
    console.log("Room state received by S2:", st.players);
  });

  s2.emit('join_room', {
    roomId: 'DEBUG_ROOM',
    playerName: 'bao',
    avatar: '🐶',
    playerToken: 'token_B_2222'
  });
  await sleep(800);

  s2.disconnect();
}

debugDisconnect();
