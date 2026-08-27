const { spawn } = require('child_process');

console.log("=== Debugging Server Reclaim ===");

// Let's test the logic in node
let players = [
  {
    id: 'socket_1',
    token: 'token_A',
    name: 'bao',
    offlineTimer: setTimeout(() => {}, 90000)
  }
];

let currentPlayerToken = 'token_B';
let playerName = 'bao';

let player = players.find(p => p.token === currentPlayerToken);
console.log("Find by token:", player);

if (!player) {
  player = players.find(p => p.name === playerName && Boolean(p.offlineTimer));
  console.log("Find by name & offlineTimer:", player);
}

if (player) {
  clearTimeout(player.offlineTimer);
  player.offlineTimer = null;
  player.token = currentPlayerToken;
  console.log("Reclaimed:", player);
}
