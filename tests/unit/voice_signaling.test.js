const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

test('WebRTC 语音信令与状态中继测试', async (t) => {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server);

  const rooms = new Map();

  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentPlayerToken = null;

    socket.on('join_room', ({ roomId, playerName, playerToken }) => {
      currentRoomId = roomId;
      currentPlayerToken = playerToken;
      socket.join(roomId);
      let room = rooms.get(roomId);
      if (!room) {
        room = { id: roomId, players: [] };
        rooms.set(roomId, room);
      }
      room.players.push({ id: socket.id, token: playerToken, name: playerName });
    });

    socket.on('voice_signal', ({ toToken, signal }) => {
      if (!currentRoomId || !currentPlayerToken || typeof toToken !== 'string' || !signal) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const targetPlayer = room.players.find(p => p.token === toToken);
      if (!targetPlayer) return;
      const targetSocket = io.sockets.sockets.get(targetPlayer.id);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('voice_signal', {
          fromToken: currentPlayerToken,
          signal
        });
      }
    });

    socket.on('voice_status', ({ isMuted, isSpeaking }) => {
      if (!currentRoomId || !currentPlayerToken) return;
      socket.to(currentRoomId).emit('voice_status_update', {
        playerToken: currentPlayerToken,
        isMuted: !!isMuted,
        isSpeaking: !!isSpeaking
      });
    });

    socket.on('voice_join_mesh', () => {
      if (!currentRoomId || !currentPlayerToken) return;
      socket.to(currentRoomId).emit('voice_peer_joined', {
        playerToken: currentPlayerToken
      });
    });

    socket.on('leave_room', () => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('voice_peer_leave', { playerToken: currentPlayerToken });
      socket.leave(currentRoomId);
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  const client1 = ClientIO(url, { forceNew: true });
  const client2 = ClientIO(url, { forceNew: true });

  await Promise.all([
    new Promise(res => client1.on('connect', res)),
    new Promise(res => client2.on('connect', res))
  ]);

  client1.emit('join_room', { roomId: 'TEST_VOICE', playerName: 'Player1', playerToken: 'token_1' });
  client2.emit('join_room', { roomId: 'TEST_VOICE', playerName: 'Player2', playerToken: 'token_2' });
  await new Promise(r => setTimeout(r, 50));

  await t.test('voice_signal: Client1 向 Client2 发送 SDP Offer 信令', async () => {
    const signalPromise = new Promise((resolve) => {
      client2.on('voice_signal', (data) => {
        resolve(data);
      });
    });

    client1.emit('voice_signal', {
      toToken: 'token_2',
      signal: { type: 'offer', sdp: 'v=0\r\no=mock 123456 IN IP4 127.0.0.1' }
    });

    const received = await signalPromise;
    assert.equal(received.fromToken, 'token_1');
    assert.equal(received.signal.type, 'offer');
    assert.ok(received.signal.sdp.includes('mock'));
  });

  await t.test('voice_status: Client1 开麦状态广播给 Client2', async () => {
    const statusPromise = new Promise((resolve) => {
      client2.on('voice_status_update', (data) => {
        resolve(data);
      });
    });

    client1.emit('voice_status', { isMuted: false, isSpeaking: true });

    const status = await statusPromise;
    assert.equal(status.playerToken, 'token_1');
    assert.equal(status.isMuted, false);
    assert.equal(status.isSpeaking, true);
  });

  await t.test('voice_join_mesh: 广播通知新成员连麦', async () => {
    const joinPromise = new Promise((resolve) => {
      client2.on('voice_peer_joined', (data) => {
        resolve(data);
      });
    });

    client1.emit('voice_join_mesh');
    const joined = await joinPromise;
    assert.equal(joined.playerToken, 'token_1');
  });

  await t.test('voice_peer_leave: 玩家退房广播挂断', async () => {
    const leavePromise = new Promise((resolve) => {
      client2.on('voice_peer_leave', (data) => {
        resolve(data);
      });
    });

    client1.emit('leave_room');
    const left = await leavePromise;
    assert.equal(left.playerToken, 'token_1');
  });

  await t.test('voiceManager.init 契约: room_state 必须具备 roomId 供客户端初始化语音 (审计 C1 防回归)', async () => {
    // 验证客户端 game.js 中的初始化条件: if (window.voiceManager && state.roomId && myPlayerToken)
    // 确保客户端与服务端字段严格对齐为 roomId，而不是错误的 state.id
    const fs = require('fs');
    const path = require('path');
    const gameJs = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
    assert.ok(gameJs.includes('state.roomId && myPlayerToken'), 'game.js 必须使用 state.roomId 初始化 voiceManager');
    assert.ok(!gameJs.includes('state.id && myPlayerToken'), 'game.js 不得使用已弃用或不存在的 state.id 字段');
  });

  client1.close();
  client2.close();
  server.close();
});
