/**
 * avalon.client.js
 * ============================================================================
 * 【阿瓦隆 · 独立前端客户端模块】
 * 
 * 💡 小白通俗解释：
 * 包含夜间角色与阵营感知、圣杯胜负轨道、队长挑选队伍、全员公开表决弹窗、
 * 远征暗投弹窗、刺客绝命刺杀梅林与终局阵营结算。
 * 对外注册至 window.PartyGames['avalon']。
 * ============================================================================
 */

(function() {
  window.PartyGames = window.PartyGames || {};

  let myAvalonRole = null;

  // DOM 缓存
  let avRoleBadge = null;
  let avSideBadge = null;
  let avRoleDesc = null;
  let avSeenContainer = null;
  let avalonQuestTrack = null;
  let avRejectDots = null;
  let btnSubmitTeam = null;
  let avSpeechPanel = null;
  let avSpeakerAvatar = null;
  let avSpeakerName = null;
  let avSpeakerTag = null;
  let btnAvFinishSpeech = null;
  let btnAvMicToggle = null;
  let avSpeechTip = null;
  let avBoardStatus = null;
  let avalonAssassinModal = null;
  let assassinTargetList = null;
  let avPlayerCardsGrid = null;
  let avalonVoteModal = null;
  let avalonQuestModal = null;
  let displayRoundTag = null;
  let displayRound = null;

  function ensureDom() {
    if (!avRoleBadge) avRoleBadge = document.getElementById('av-role-badge');
    if (!avSideBadge) avSideBadge = document.getElementById('av-side-badge');
    if (!avRoleDesc) avRoleDesc = document.getElementById('av-role-desc');
    if (!avSeenContainer) avSeenContainer = document.getElementById('av-seen-container');
    if (!avalonQuestTrack) avalonQuestTrack = document.getElementById('avalon-quest-track');
    if (!avRejectDots) avRejectDots = document.getElementById('av-reject-dots');
    if (!btnSubmitTeam) btnSubmitTeam = document.getElementById('btn-submit-team');
    if (!avSpeechPanel) avSpeechPanel = document.getElementById('av-speech-panel');
    if (!avSpeakerAvatar) avSpeakerAvatar = document.getElementById('av-speaker-avatar');
    if (!avSpeakerName) avSpeakerName = document.getElementById('av-speaker-name');
    if (!avSpeakerTag) avSpeakerTag = document.getElementById('av-speaker-tag');
    if (!btnAvFinishSpeech) btnAvFinishSpeech = document.getElementById('btn-av-finish-speech');
    if (!btnAvMicToggle) btnAvMicToggle = document.getElementById('btn-av-mic-toggle');
    if (!avSpeechTip) avSpeechTip = document.getElementById('av-speech-tip');
    if (!avBoardStatus) avBoardStatus = document.getElementById('av-board-status');
    if (!avalonAssassinModal) avalonAssassinModal = document.getElementById('avalon-assassin-modal');
    if (!assassinTargetList) assassinTargetList = document.getElementById('assassin-target-list');
    if (!avPlayerCardsGrid) avPlayerCardsGrid = document.getElementById('av-player-cards-grid');
    if (!avalonVoteModal) avalonVoteModal = document.getElementById('avalon-vote-modal');
    if (!avalonQuestModal) avalonQuestModal = document.getElementById('avalon-quest-modal');
    if (!displayRoundTag) displayRoundTag = document.getElementById('display-round-tag');
    if (!displayRound) displayRound = document.getElementById('display-round');
  }

  function bindEvents(socket) {
    ensureDom();

    if (btnSubmitTeam && !btnSubmitTeam._eventsBound) {
      btnSubmitTeam._eventsBound = true;
      btnSubmitTeam.addEventListener('click', () => {
        if (window.currentRoomState && window.currentRoomState.selectedTeam && socket) {
          socket.emit('avalon_submit_team', { teamTokens: window.currentRoomState.selectedTeam });
        }
      });
    }

    if (btnAvFinishSpeech && !btnAvFinishSpeech._eventsBound) {
      btnAvFinishSpeech._eventsBound = true;
      btnAvFinishSpeech.addEventListener('click', () => {
        if (socket) socket.emit('avalon_finish_speech');
        if (window.voiceManager && window.voiceManager.isMicEnabled) {
          window.voiceManager.setMute(true);
        }
        if (window.playSound) window.playSound('pop');
      });
    }

    if (btnAvMicToggle && !btnAvMicToggle._eventsBound) {
      btnAvMicToggle._eventsBound = true;
      btnAvMicToggle.addEventListener('click', async () => {
        if (!window.voiceManager) return;
        try {
          const isEnabled = await window.voiceManager.toggleMic();
          btnAvMicToggle.textContent = isEnabled ? '🔴 闭麦' : '🎤 开麦发言';
          btnAvMicToggle.className = isEnabled ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
          if (window.showToast) {
            window.showToast(isEnabled ? '麦克风已开启，请开始发言 🎤' : '麦克风已静音 🔇', isEnabled ? '🎤' : '🔇');
          }
          if (isEnabled && window.currentRoomState?.players?.length > 8 && window.showToast) {
            window.showToast('💡 房间人数较多（>8人），发言完毕后请及时闭麦以节省移动端网络与电量', '🎙️');
          }
        } catch (err) {
          console.warn('麦克风开启异常:', err);
          if (window.showToast) window.showToast('无法启动麦克风：请检查浏览器麦克风授权与 HTTPS 环境 ⚠️', '⚠️');
        }
      });
    }

    const btnTeamApprove = document.getElementById('btn-team-approve');
    if (btnTeamApprove && !btnTeamApprove._eventsBound) {
      btnTeamApprove._eventsBound = true;
      btnTeamApprove.addEventListener('click', () => {
        if (socket) socket.emit('avalon_team_vote', { approve: true });
        if (avalonVoteModal) avalonVoteModal.classList.remove('active');
      });
    }

    const btnTeamReject = document.getElementById('btn-team-reject');
    if (btnTeamReject && !btnTeamReject._eventsBound) {
      btnTeamReject._eventsBound = true;
      btnTeamReject.addEventListener('click', () => {
        if (socket) socket.emit('avalon_team_vote', { approve: false });
        if (avalonVoteModal) avalonVoteModal.classList.remove('active');
      });
    }

    const btnQuestSuccess = document.getElementById('btn-quest-success');
    if (btnQuestSuccess && !btnQuestSuccess._eventsBound) {
      btnQuestSuccess._eventsBound = true;
      btnQuestSuccess.addEventListener('click', () => {
        if (socket) socket.emit('avalon_quest_vote', { isSuccess: true });
        if (avalonQuestModal) avalonQuestModal.classList.remove('active');
      });
    }

    const btnQuestFail = document.getElementById('btn-quest-fail');
    if (btnQuestFail && !btnQuestFail._eventsBound) {
      btnQuestFail._eventsBound = true;
      btnQuestFail.addEventListener('click', () => {
        if (socket) socket.emit('avalon_quest_vote', { isSuccess: false });
        if (avalonQuestModal) avalonQuestModal.classList.remove('active');
      });
    }

    if (!socket || socket._avalonBound) return;
    socket._avalonBound = true;

    socket.on('avalon_secret_role', (data) => {
      ensureDom();
      myAvalonRole = data;
      if (avRoleBadge) avRoleBadge.textContent = data.roleName;
      if (avSideBadge) {
        avSideBadge.textContent = data.side === 'good' ? '正义阵营 🛡️' : '邪恶阵营 😈';
        avSideBadge.style.color = data.side === 'good' ? '#60A5FA' : '#EF4444';
      }
      if (avRoleDesc) avRoleDesc.textContent = data.desc;

      if (avSeenContainer) {
        avSeenContainer.innerHTML = '';
        if (data.seenInfo && data.seenInfo.length > 0) {
          data.seenInfo.forEach(item => {
            const chip = document.createElement('span');
            chip.className = 'seen-chip';
            chip.textContent = `${item.avatar} ${item.name} (${item.tag})`;
            avSeenContainer.appendChild(chip);
          });
        } else {
          avSeenContainer.innerHTML = '<small style="color:#94A3B8;font-size:0.75rem">闭眼无特殊感知</small>';
        }
      }
      if (window.playSound) window.playSound('card');
    });

    socket.on('avalon_team_vote_result', (data) => {
      if (data && window.showToast) {
        window.showToast(`表决${data.passed ? '通过' : '未通过'}：赞成 ${data.approves} : 反对 ${data.rejects}`, data.passed ? '🛡️' : '❌');
      }
    });

    socket.on('avalon_quest_result', (data) => {
      if (data && window.showToast) {
        window.showToast(`任务 ${data.questIndex + 1} ${data.questPassed ? '成功 🏆' : '失败 💥'}（${data.successCount} 成功 / ${data.failsCount} 失败）`, data.questPassed ? '🏆' : '💥');
      }
    });

    socket.on('avalon_game_over', (data) => {
      const isGoodWin = data.winner === 'good';
      const esc = window.escapeHtml || (s => s);
      const podium = (data.allRoles || []).map(p => ({
        avatar: p.avatar,
        name: p.name,
        detail: `(${esc(p.roleName)})`,
        score: p.side === 'good' ? (isGoodWin ? 100 : 0) : (!isGoodWin ? 100 : 0)
      }));

      if (window.showGameOverModal) {
        window.showGameOverModal({
          title: isGoodWin ? '🛡️ 正义阵营胜利！' : '👿 邪恶阵营胜利！',
          desc: data.winReason || '',
          podium
        });
      }
    });
  }

  window.PartyGames['avalon'] = {
    init(socket) {
      bindEvents(socket);
    },
    renderState(state) {
      ensureDom();
      if (displayRoundTag) displayRoundTag.classList.remove('hidden');
      if (displayRound) displayRound.textContent = `任务 ${state.currentQuestIndex + 1}/5`;

      const myToken = window.myPlayerToken;

      // 渲染圣杯轨道
      if (avalonQuestTrack) {
        const nodes = avalonQuestTrack.querySelectorAll('.quest-node');
        nodes.forEach((node, i) => {
          node.className = 'quest-node';
          if (i === state.currentQuestIndex) node.classList.add('active-quest');
          const hist = state.questHistory[i];
          if (hist) {
            node.classList.add(hist.success ? 'good-win' : 'evil-win');
            const icon = node.querySelector('.grail-icon');
            if (icon) icon.textContent = hist.success ? '🛡️' : '💀';
          }
        });
      }

      // 渲染流产红点
      if (avRejectDots) {
        const dots = avRejectDots.querySelectorAll('.dot');
        dots.forEach((dot, i) => {
          dot.classList.toggle('filled', i < state.rejectTrack);
        });
      }

      const isLeader = (state.leaderToken === myToken);
      if (btnSubmitTeam) {
        btnSubmitTeam.classList.toggle('hidden', !isLeader || state.status !== 'AVALON_TEAM_PROPOSE');
      }

      // 麦序发言区域控制
      if (state.status === 'AVALON_SPEECH') {
        if (avSpeechPanel) avSpeechPanel.classList.remove('hidden');
        if (avSpeakerAvatar) avSpeakerAvatar.textContent = state.currentSpeakerAvatar || '🐱';
        if (avSpeakerName) avSpeakerName.textContent = state.currentSpeakerName || '某位玩家';
        if (avSpeakerTag) avSpeakerTag.textContent = `麦序 ${state.speakerIndex + 1}/${state.speakerTotal || state.players.length} · ⏱ ${state.timeLeft}s`;

        const isCurrentSpeaker = (state.currentSpeakerToken === myToken);
        if (btnAvFinishSpeech) btnAvFinishSpeech.classList.toggle('hidden', !isCurrentSpeaker);
        if (btnAvMicToggle) {
          btnAvMicToggle.classList.toggle('hidden', !isCurrentSpeaker);
          if (isCurrentSpeaker && window.voiceManager) {
            const isMicOn = window.voiceManager.isMicEnabled;
            btnAvMicToggle.textContent = isMicOn ? '🔴 闭麦' : '🎤 开麦发言';
            btnAvMicToggle.className = isMicOn ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
          }
        }

        if (avSpeechTip) {
          if (isCurrentSpeaker) {
            const isMicOn = window.voiceManager && window.voiceManager.isMicEnabled;
            avSpeechTip.textContent = isMicOn ? '🎤 麦克风已开启，请陈述观点（完毕点击【结束发言】）' : '🎤 轮到你发言！请点击【开麦发言】阐述观点';
            avSpeechTip.style.color = '#60A5FA';
          } else {
            avSpeechTip.textContent = `👂 正在倾听【${state.currentSpeakerName}】发言... (${state.timeLeft}s)`;
            avSpeechTip.style.color = '#94A3B8';
            if (window.voiceManager && window.voiceManager.isMicEnabled) {
              window.voiceManager.setMute(true);
            }
          }
        }
        if (avBoardStatus) avBoardStatus.textContent = `🎙️ 全员轮流发言中 (当前麦序: ${state.currentSpeakerName})`;
      } else {
        if (avSpeechPanel) avSpeechPanel.classList.add('hidden');
      }

      if (state.status === 'AVALON_ASSASSIN') {
        const isEvilOrAssassin = myAvalonRole && (myAvalonRole.role === 'assassin' || myAvalonRole.side === 'evil');
        if (avBoardStatus) avBoardStatus.textContent = isEvilOrAssassin ? '🗡️ 刺客行动！请指认并刺杀梅林！' : '🗡️ 刺客正在进行绝命刺杀梅林...';
        if (isEvilOrAssassin && avalonAssassinModal && assassinTargetList) {
          avalonAssassinModal.classList.add('active');
          assassinTargetList.innerHTML = '';
          const esc = window.escapeHtml || (s => s);
          state.players.forEach(p => {
            if (p.token === myToken) return;
            const item = document.createElement('div');
            item.className = 'assassin-target-item';
            item.innerHTML = `
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.4rem">${esc(p.avatar)}</span>
                <span style="font-weight:700;font-size:0.9rem">${esc(p.name)}</span>
              </div>
              <button class="btn btn-sm btn-danger">刺杀此人</button>
            `;
            item.querySelector('button').onclick = () => {
              if (window.socket) window.socket.emit('avalon_assassinate', { targetToken: p.token });
              avalonAssassinModal.classList.remove('active');
            };
            assassinTargetList.appendChild(item);
          });
        } else if (avalonAssassinModal) {
          avalonAssassinModal.classList.remove('active');
        }
      } else if (state.status !== 'AVALON_SPEECH') {
        if (avalonAssassinModal) avalonAssassinModal.classList.remove('active');
        if (avBoardStatus) {
          if (state.status === 'AVALON_ROLE_REVEAL') {
            avBoardStatus.textContent = '🔮 夜幕降临，感知阵营中...';
          } else {
            avBoardStatus.textContent = isLeader ? `👑 你是队长！请选择 ${state.requiredTeamCount} 名队员` : `👑 队长【${state.leaderName}】挑选队员中 (${state.selectedTeam.length}/${state.requiredTeamCount})`;
          }
        }
      }

      // 渲染组队卡片
      if (avPlayerCardsGrid) {
        avPlayerCardsGrid.innerHTML = '';
        const esc = window.escapeHtml || (s => s);
        state.players.forEach(p => {
          const card = document.createElement('div');
          const isSelected = state.selectedTeam.includes(p.token);
          const isSpeaker = (state.status === 'AVALON_SPEECH' && p.token === state.currentSpeakerToken);
          card.className = `av-p-card ${p.token === state.leaderToken ? 'is-leader' : ''} ${isSelected ? 'is-selected' : ''} ${isSpeaker ? 'is-speaker' : ''}`;
          
          let badgeText = '';
          if (p.token === state.leaderToken) badgeText = '👑队长';
          if (isSelected) badgeText = '⚔️已选';
          if (isSpeaker) badgeText = '🎤发言中';

          card.innerHTML = `
            <div style="font-size:1.5rem">${esc(p.avatar)}</div>
            <div style="font-size:0.8rem;font-weight:bold">${esc(p.name)}</div>
            <small style="font-size:0.7rem;color:${isSpeaker ? '#60A5FA' : '#94A3B8'}">${badgeText}</small>
          `;

          if (isLeader && state.status === 'AVALON_TEAM_PROPOSE') {
            card.onclick = () => {
              if (window.socket) window.socket.emit('avalon_select_member', { memberToken: p.token });
              if (window.playSound) window.playSound('tick');
            };
          }
          avPlayerCardsGrid.appendChild(card);
        });
      }

      // 组队表决弹窗控制
      if (avalonVoteModal) {
        if (state.status === 'AVALON_TEAM_VOTE' && !state.votedTokens.includes(myToken)) {
          avalonVoteModal.classList.add('active');
        } else {
          avalonVoteModal.classList.remove('active');
        }
      }

      // 任务暗投弹窗控制
      if (avalonQuestModal) {
        if (state.status === 'AVALON_QUEST_VOTE' && state.selectedTeam.includes(myToken) && !(state.questVotedTokens || []).includes(myToken)) {
          avalonQuestModal.classList.add('active');
          const isGood = myAvalonRole && myAvalonRole.side === 'good';
          const btnFail = document.getElementById('btn-quest-fail');
          if (btnFail) {
            btnFail.disabled = isGood;
            btnFail.style.opacity = isGood ? '0.3' : '1';
          }
        } else {
          avalonQuestModal.classList.remove('active');
        }
      }
    }
  };
})();
