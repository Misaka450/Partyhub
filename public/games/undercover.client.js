/**
 * undercover.client.js
 * ============================================================================
 * 【谁是卧底 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 包含私密词语遮罩卡片、轮流发言麦序、开麦闭麦切换、投票淘汰卡片交互与终局结算。
 * 对外注册至 window.PartyGames['undercover']。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let myUndercoverRole = null;

  // DOM 缓存
  let ucSecretCard = null;
  let ucWordText = null;
  let ucRoleLabel = null;
  let btnFinishSpeech = null;
  let btnUcMicToggle = null;
  let ucSpeakerName = null;
  let ucSpeakerAvatar = null;
  let ucSpeechTip = null;
  let ucStageDesc = null;
  let ucPlayerGrid = null;
  let displayRoundTag = null;
  let displayRound = null;

  function ensureDom() {
    if (!ucSecretCard) ucSecretCard = document.getElementById('uc-secret-card');
    if (!ucWordText) ucWordText = document.getElementById('uc-word-text');
    if (!ucRoleLabel) ucRoleLabel = document.getElementById('uc-role-label');
    if (!btnFinishSpeech) btnFinishSpeech = document.getElementById('btn-finish-speech');
    if (!btnUcMicToggle) btnUcMicToggle = document.getElementById('btn-uc-mic-toggle');
    if (!ucSpeakerName) ucSpeakerName = document.getElementById('uc-speaker-name');
    if (!ucSpeakerAvatar) ucSpeakerAvatar = document.getElementById('uc-speaker-avatar');
    if (!ucSpeechTip) ucSpeechTip = document.getElementById('uc-speech-tip');
    if (!ucStageDesc) ucStageDesc = document.getElementById('uc-stage-desc');
    if (!ucPlayerGrid) ucPlayerGrid = document.getElementById('uc-player-grid');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function bindEvents(socket) {
    ensureDom();

    if (ucSecretCard && !ucSecretCard._eventsBound) {
      ucSecretCard._eventsBound = true;
      ucSecretCard.addEventListener('click', () => {
        ucSecretCard.classList.toggle('masked');
      });
    }

    if (btnFinishSpeech && !btnFinishSpeech._eventsBound) {
      btnFinishSpeech._eventsBound = true;
      btnFinishSpeech.addEventListener('click', () => {
        if (window.voiceManager && window.voiceManager.isMicEnabled) {
          window.voiceManager.toggleMic().catch(() => {});
        }
        if (socket) socket.emit('uc_finish_speech');
      });
    }

    if (btnUcMicToggle && !btnUcMicToggle._eventsBound) {
      btnUcMicToggle._eventsBound = true;
      btnUcMicToggle.addEventListener('click', async () => {
        if (window.voiceManager) {
          const isEnabled = await window.voiceManager.toggleMic();
          btnUcMicToggle.textContent = isEnabled ? '🔴 闭麦' : '🎤 开麦发言';
          btnUcMicToggle.className = isEnabled ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
          if (isEnabled && window.currentRoomState?.players?.length > 8 && window.showToast) {
            window.showToast('💡 房间人数较多（>8人），发言完毕后请及时闭麦以节省移动端网络与电量', '🎙️');
          }
        }
      });
    }

    if (!socket || socket._ucBound) return;
    socket._ucBound = true;

    socket.on('uc_secret_role', (data) => {
      ensureDom();
      myUndercoverRole = data;
      if (ucWordText) ucWordText.textContent = data.role === 'blank' ? '⚪ 你是白板 (无词)' : data.word;
      if (ucRoleLabel) ucRoleLabel.textContent = data.role === 'blank' ? '你的身份' : '我的私密词语';
      if (ucSecretCard) ucSecretCard.classList.add('masked');
      if (window.playSound) window.playSound('card');
    });

    socket.on('uc_speaker_turn', () => {
      if (window.playSound) window.playSound('tick');
    });

    socket.on('uc_vote_result', (data) => {
      if (data && Array.isArray(data.voteDetails) && data.voteDetails.length > 0 && window.showToast) {
        const top = (data.topCandidates || []).map(p => p.name).join('、');
        window.showToast(`🗳️ 最高 ${data.maxVotes} 票：${top || '无人得票'}`, '📊');
      }
    });

    socket.on('uc_player_eliminated', (data) => {
      if (data && data.name && window.showToast) {
        window.showToast(`【${data.name}】出局，身份：${data.roleName || '未知'}`, '🚨');
      }
    });

    socket.on('uc_game_over', (data) => {
      const isCivWin = data.winningTeam === 'civilians';
      const isSpyWin = data.winningTeam === 'undercovers';
      const title = isCivWin ? '🎉 平民阵营胜利！' : (isSpyWin ? '😈 卧底阵营胜利！' : '⚪ 白板绝地胜利！');

      const esc = window.escapeHtml || (s => s);
      const extraHtml = `
        <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:12px">
          <p style="margin:0">平民词：<b style="color:#60A5FA">${esc(data.civWord)}</b> | 卧底词：<b style="color:#F87171">${esc(data.spyWord)}</b></p>
        </div>
      `;

      const podium = (data.allRoles || []).map(p => {
        const roleTag = p.role === 'undercover' ? '🕵️ 卧底' : (p.role === 'blank' ? '⚪ 白板' : '🧑‍🌾 平民');
        return {
          avatar: p.avatar,
          name: p.name,
          detail: `(${roleTag}) · ${p.word || '无词'}`,
          score: p.score || 0
        };
      });

      if (window.showGameOverModal) {
        window.showGameOverModal({
          title,
          desc: data.winReason || '',
          extraHtml,
          podium
        });
      }
    });
  }

  window.PartyGames['undercover'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDom();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `第 ${state.round} 轮`;

      const myToken = window.myPlayerToken;
      const isMySpeechTurn = (state.currentSpeakerToken === myToken && state.status === 'UC_SPEAKING');
      if (btnFinishSpeech) btnFinishSpeech.classList.toggle('hidden', !isMySpeechTurn);
      if (btnUcMicToggle) {
        btnUcMicToggle.classList.toggle('hidden', !isMySpeechTurn);
        if (isMySpeechTurn && window.voiceManager) {
          const isMicOn = window.voiceManager.isMicEnabled;
          btnUcMicToggle.textContent = isMicOn ? '🔴 闭麦' : '🎤 开麦发言';
          btnUcMicToggle.className = isMicOn ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
        }
      }

      if (state.currentSpeakerName && ucSpeakerName) {
        ucSpeakerName.textContent = state.currentSpeakerName;
        if (ucSpeakerAvatar) {
          ucSpeakerAvatar.textContent = state.players.find(p => p.token === state.currentSpeakerToken)?.avatar || '🎤';
        }
      }

      if (ucSpeechTip) {
        if (state.status === 'UC_SPEAKING') {
          ucSpeechTip.textContent = isMySpeechTurn ? '轮到你发言（可开麦或打字）' : '正在发言中...';
        } else {
          ucSpeechTip.textContent = '等待进入下一阶段';
        }
      }

      if (ucStageDesc) {
        ucStageDesc.textContent = state.status === 'UC_SPEAKING' ? '🎤 玩家轮流发言中' : (state.status === 'UC_VOTING' ? '🗳️ 请点击卡片投出卧底' : '📊 结算中');
      }

      if (ucPlayerGrid) {
        ucPlayerGrid.innerHTML = '';
        const esc = window.escapeHtml || (s => s);
        state.players.forEach(p => {
          const card = document.createElement('div');
          card.className = `uc-player-card ${p.token === state.currentSpeakerToken ? 'is-speaking' : ''} ${!p.alive ? 'is-dead' : ''}`;
          
          card.innerHTML = `
            <div style="font-size:1.6rem">${esc(p.avatar)}</div>
            <b style="font-size:0.85rem;display:block;margin-top:2px">${esc(p.name)}</b>
            <small style="font-size:0.7rem;color:#94A3B8">${p.alive ? '存活' : '已出局'}</small>
            ${p.votesReceived > 0 ? `<span class="uc-vote-badge">${p.votesReceived}票</span>` : ''}
          `;

          if (state.status === 'UC_VOTING' && p.alive && p.token !== myToken) {
            card.onclick = () => {
              document.querySelectorAll('.uc-player-card').forEach(c => c.classList.remove('selected-vote'));
              card.classList.add('selected-vote');
              const socket = window.socket;
              if (socket) socket.emit('uc_cast_vote', { targetToken: p.token });
              if (window.playSound) window.playSound('tick');
            };
          }
          ucPlayerGrid.appendChild(card);
        });
      }
    }
  };
})();
