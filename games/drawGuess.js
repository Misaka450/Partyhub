const fs = require('fs');
const path = require('path');

let categorizedWords = {
  food: ["西瓜", "苹果", "香蕉", "火锅", "奶茶", "披萨", "冰淇淋", "烤鸭", "寿司", "汉堡"],
  animal: ["猫咪", "小狗", "大象", "兔子", "老虎", "熊猫", "长颈鹿", "企鹅", "鲨鱼", "恐龙"],
  daily: ["手机", "电脑", "眼镜", "雨伞", "手表", "书包", "冰箱", "电视机", "耳机", "相机"],
  anime: ["奥特曼", "孙悟空", "哆啦A梦", "海绵宝宝", "柯南", "路飞", "蜘蛛侠", "皮卡丘"],
  idioms: ["对牛弹琴", "画蛇添足", "狐假虎威", "盲人摸象", "守株待兔", "掩耳盗铃", "井底之蛙"]
};

try {
  const raw = fs.readFileSync(path.join(__dirname, '../words.json'), 'utf8');
  categorizedWords = JSON.parse(raw);
} catch (e) {
  console.error("加载 words.json 失败，使用内置默认词库", e);
}

function getWordPool(room) {
  let pool = [];
  const selectedCats = room.categories || ['food', 'animal', 'daily', 'anime', 'idioms'];
  selectedCats.forEach(cat => {
    if (categorizedWords[cat]) {
      pool.push(...categorizedWords[cat]);
    }
  });
  if (room.customWords && room.customWords.length > 0) {
    pool.push(...room.customWords);
  }
  if (pool.length < 5) {
    pool = [...categorizedWords.food, ...categorizedWords.animal, ...categorizedWords.daily];
  }
  return pool;
}

function getRandomWords(count = 3, room) {
  const pool = getWordPool(room);
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function findCategoryOfWord(word) {
  for (const [cat, list] of Object.entries(categorizedWords)) {
    if (list.includes(word)) {
      const names = {
        food: '美食', animal: '动物', daily: '日常物品', anime: '动漫/影视', idioms: '成语'
      };
      return names[cat] || '分类';
    }
  }
  return '趣味词汇';
}

function getWordHint(word, hintGiven = false) {
  if (!word) return '';
  const len = word.length;
  if (!hintGiven) {
    return word.split('').map(() => '_').join(' ') + ` (${len}个字)`;
  } else {
    const firstChar = word[0];
    const rest = word.slice(1).split('').map(() => '_').join(' ');
    return `${firstChar} ${rest} (${len}个字)`;
  }
}

function initRoomState(room) {
  room.currentDrawerIndex = 0;
  room.currentWord = '';
  room.currentCategory = '';
  room.wordOptions = [];
  room.drawHistory = [];
  room.round = 1;
  room.maxRounds = room.maxRounds || 3;
  room.roundTime = room.roundTime || 60;
  room.timeLeft = room.roundTime;
  room.categories = room.categories || ['food', 'animal', 'daily', 'anime', 'idioms'];
  room.customWords = room.customWords || [];
  room.enableHints = room.enableHints !== false;
  room.hintGiven = false;
  room.status = 'LOBBY';
  clearInterval(room.timer);
  room.timer = null;
}

function getPublicState(room) {
  const currentDrawer = room.players[room.currentDrawerIndex];
  return {
    gameType: 'draw-guess',
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    timeLeft: room.timeLeft,
    drawerName: currentDrawer ? currentDrawer.name : '',
    drawerId: currentDrawer ? currentDrawer.id : '',
    drawerToken: currentDrawer ? currentDrawer.token : '',
    wordLength: room.currentWord ? room.currentWord.length : 0,
    wordCategory: (room.enableHints && room.hintGiven) ? room.currentCategory : '',
    enableHints: room.enableHints,
    wordHint: room.status === 'DRAWING' ? getWordHint(room.currentWord, room.enableHints && room.hintGiven) : ''
  };
}

function startTurn(room, io, broadcastRoom) {
  if (room.players.length < 2) {
    room.status = 'LOBBY';
    clearInterval(room.timer);
    broadcastRoom(room);
    io.to(room.id).emit('system_message', '玩家不足 2 人，已返回等待大厅');
    return;
  }

  if (room.currentDrawerIndex >= room.players.length) {
    room.currentDrawerIndex = 0;
    room.round += 1;
  }

  if (room.round > room.maxRounds) {
    endGame(room, io, broadcastRoom);
    return;
  }

  room.players.forEach(p => {
    p.hasGuessed = false;
    p.isDrawing = false;
  });

  const drawer = room.players[room.currentDrawerIndex];
  if (!drawer) {
    room.currentDrawerIndex = 0;
    startTurn(room, io, broadcastRoom);
    return;
  }

  drawer.isDrawing = true;
  room.status = 'SELECTING';
  room.drawHistory = [];
  room.currentWord = '';
  room.hintGiven = false;
  room.wordOptions = getRandomWords(3, room);
  room.timeLeft = 15;

  io.to(room.id).emit('clear_canvas');
  broadcastRoom(room);

  io.to(drawer.id).emit('select_word_options', { options: room.wordOptions });

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      selectWord(room, drawer.id, room.wordOptions[0], io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function selectWord(room, socketId, chosenWord, io, broadcastRoom) {
  const drawer = room.players[room.currentDrawerIndex];
  if (!drawer || drawer.id !== socketId || room.status !== 'SELECTING') return;

  room.currentWord = chosenWord;
  room.currentCategory = findCategoryOfWord(chosenWord);
  room.status = 'DRAWING';
  room.timeLeft = room.roundTime || 60;

  broadcastRoom(room);
  io.to(drawer.id).emit('your_turn_to_draw', { word: room.currentWord, category: room.currentCategory });
  io.to(room.id).emit('system_message', `🎨 轮到【${drawer.name}】作画，大家快来猜！`);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;

    if (room.enableHints && !room.hintGiven && room.timeLeft <= Math.floor(room.roundTime / 2)) {
      room.hintGiven = true;
      broadcastRoom(room);
      io.to(room.id).emit('system_message', `💡 提示公布：首字【${room.currentWord[0]}】，分类【${room.currentCategory}】`);
    }

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endRound(room, '时间到！', io, broadcastRoom);
    } else {
      io.to(room.id).emit('timer_tick', { timeLeft: room.timeLeft });
    }
  }, 1000);
}

function handleGuess(room, player, text, io, broadcastRoom) {
  if (room.status !== 'DRAWING') return false;
  if (player.isDrawing || player.hasGuessed) return false;

  const guess = text.trim();
  if (guess.toLowerCase() === room.currentWord.toLowerCase()) {
    player.hasGuessed = true;
    const baseScore = 100;
    const timeBonus = Math.floor(room.timeLeft * 1.5);
    const scoreEarned = baseScore + timeBonus;
    player.score += scoreEarned;

    const drawer = room.players[room.currentDrawerIndex];
    if (drawer) {
      drawer.score += 50;
    }

    io.to(room.id).emit('chat_message', {
      type: 'correct',
      avatar: player.avatar,
      sender: player.name,
      text: `🎉 猜对了！获得 +${scoreEarned} 分！`
    });

    broadcastRoom(room);

    const nonDrawers = room.players.filter(p => !p.isDrawing);
    const allGuessed = nonDrawers.every(p => p.hasGuessed);

    if (allGuessed && nonDrawers.length > 0) {
      clearInterval(room.timer);
      endRound(room, '全员猜中！', io, broadcastRoom);
    }
    return true;
  }
  return false;
}

function endRound(room, reason, io, broadcastRoom) {
  room.status = 'ROUND_END';
  clearInterval(room.timer);

  const word = room.currentWord;
  const drawer = room.players[room.currentDrawerIndex];

  io.to(room.id).emit('round_ended', {
    reason,
    word,
    drawerName: drawer ? drawer.name : ''
  });

  broadcastRoom(room);

  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    if (room.gameType !== 'draw-guess' || room.status !== 'ROUND_END') return;
    room.currentDrawerIndex += 1;
    startTurn(room, io, broadcastRoom);
  }, 4000);
}

function startGame(room, io, broadcastRoom) {
  if (room.players.length < 2) {
    io.to(room.id).emit('system_message', '你画我猜至少需要 2 名玩家开始游戏！');
    return;
  }
  room.currentDrawerIndex = 0;
  room.round = 1;
  startTurn(room, io, broadcastRoom);
}

function endGame(room, io, broadcastRoom) {
  room.status = 'GAME_OVER';
  clearInterval(room.timer);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.id).emit('game_over', {
    podium: sortedPlayers.slice(0, 3).map(p => ({
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }))
  });

  broadcastRoom(room);
}

module.exports = {
  initRoomState,
  getPublicState,
  startGame,
  startTurn,
  selectWord,
  handleGuess,
  endRound,
  endGame
};
