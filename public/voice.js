/**
 * 🎙️ PartyHub 实时语音引擎 (WebRTC P2P Mesh + Web Audio Analyser)
 * 支持多端浏览器硬件回声消除、降噪、声浪可视化与麦序权限控制
 */
class VoiceManager {
  constructor() {
    this.socket = null;
    this.myToken = null;
    this.roomId = null;

    // 本地媒体与音频上下文
    this.localStream = null;
    this.audioCtx = null;
    this.localAnalyser = null;
    this.isMicEnabled = false; // 是否开麦
    this.isPermissionGranted = false;
    this.isSpeaking = false;
    this.volumeAnimId = null;

    // WebRTC 节点映射: token -> { pc, audioElement, analyser, isSpeaking, pendingCandidates }
    this.peers = new Map();

    // 回调钩子
    this.onSpeakingChange = null; // (token, isSpeaking, volume) => {}
    this.onStatusChange = null;   // (isMicEnabled, hasPermission) => {}

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:1337' }
      ]
    };
  }

  /**
   * 动态设置 ICE / STUN / TURN 服务器列表
   * 当从服务端拉取到自建 TURN 服务器（coturn）配置时更新，确保在移动4G/5G或对称NAT下通话顺畅
   * @param {Array} iceServers 服务器配置数组
   */
  setIceServers(iceServers) {
    if (Array.isArray(iceServers) && iceServers.length > 0) {
      this.rtcConfig.iceServers = iceServers;
      console.log('🎙️ [VoiceManager] 已动态更新 ICE/TURN 服务器配置:', iceServers);
    }
  }

  init(socket, myToken, roomId, customIceServers) {
    this.socket = socket;
    this.myToken = myToken;
    this.roomId = roomId;

    if (customIceServers) {
      this.setIceServers(customIceServers);
    }

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    if (!this.socket) return;

    // 收到远程 Peer 的信令
    this.socket.on('voice_signal', async ({ fromToken, signal }) => {
      await this.handleSignal(fromToken, signal);
    });

    // 收到新成员加入语音网格通知
    this.socket.on('voice_peer_joined', async ({ playerToken }) => {
      if (playerToken === this.myToken) return;
      // 依字典序协商发起方：字典序较大者主动发起 Offer，避免冲突
      if (this.myToken > playerToken) {
        await this.createPeerConnection(playerToken, true);
      } else {
        await this.createPeerConnection(playerToken, false);
      }
    });

    // 收到远程玩家语音状态（开麦/闭麦/说话）
    this.socket.on('voice_status_update', ({ playerToken, isMuted, isSpeaking }) => {
      const peer = this.peers.get(playerToken);
      if (peer) {
        peer.isMuted = isMuted;
        peer.isSpeaking = isSpeaking;
      }
      if (this.onSpeakingChange) {
        this.onSpeakingChange(playerToken, isSpeaking, isSpeaking ? 60 : 0);
      }
    });

    // 成员离开
    this.socket.on('voice_peer_leave', ({ playerToken }) => {
      this.closePeer(playerToken);
    });
  }

  /**
   * 确保 AudioContext 已初始化并解除挂起
   */
  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * 申请麦克风权限并启动本地音频采集
   */
  async requestMicrophone() {
    this.ensureAudioContext();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器或网络环境（需 HTTPS）不支持麦克风采集');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        },
        video: false
      });

      this.localStream = stream;
      this.isPermissionGranted = true;
      this.isMicEnabled = true;

      // 设置本地音频分析器，检测音量并驱动声浪
      this.setupLocalAnalyser(stream);

      // 将本地轨道添加到已存在的 PeerConnection
      this.localStream.getAudioTracks().forEach(track => {
        this.peers.forEach(peer => {
          if (peer.pc && peer.pc.signalingState !== 'closed') {
            const senders = peer.pc.getSenders();
            const sender = senders.find(s => s.track && s.track.kind === 'audio');
            if (sender) {
              sender.replaceTrack(track);
            } else {
              peer.pc.addTrack(track, this.localStream);
            }
          }
        });
      });

      // 通知房间内其他玩家
      if (this.socket) {
        this.socket.emit('voice_status', { isMuted: false, isSpeaking: false });
        this.socket.emit('voice_join_mesh');
      }

      if (this.onStatusChange) {
        this.onStatusChange(this.isMicEnabled, this.isPermissionGranted);
      }

      return true;
    } catch (err) {
      console.warn('获取麦克风权限失败:', err);
      this.isMicEnabled = false;
      if (this.onStatusChange) {
        this.onStatusChange(false, false);
      }
      throw err;
    }
  }

  /**
   * 设置本地 Web Audio 实时音量分析器
   */
  setupLocalAnalyser(stream) {
    if (!this.audioCtx) return;
    try {
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.localAnalyser = this.audioCtx.createAnalyser();
      this.localAnalyser.fftSize = 64;
      this.localAnalyser.smoothingTimeConstant = 0.3;
      source.connect(this.localAnalyser);

      const bufferLength = this.localAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastSpeakEmitTime = 0;

      const monitorVolume = () => {
        if (!this.localStream || !this.isMicEnabled) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            if (this.onSpeakingChange) this.onSpeakingChange(this.myToken, false, 0);
            if (this.socket) this.socket.emit('voice_status', { isMuted: true, isSpeaking: false });
          }
          this.volumeAnimId = requestAnimationFrame(monitorVolume);
          return;
        }

        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength; // 0 ~ 255
        const volume = Math.min(100, Math.round((avg / 128) * 100));

        const nowSpeaking = volume > 10;
        if (nowSpeaking !== this.isSpeaking || (nowSpeaking && Date.now() - lastSpeakEmitTime > 400)) {
          this.isSpeaking = nowSpeaking;
          lastSpeakEmitTime = Date.now();
          if (this.socket) {
            this.socket.emit('voice_status', { isMuted: !this.isMicEnabled, isSpeaking: nowSpeaking });
          }
        }

        if (this.onSpeakingChange) {
          this.onSpeakingChange(this.myToken, this.isSpeaking, volume);
        }

        this.volumeAnimId = requestAnimationFrame(monitorVolume);
      };

      if (this.volumeAnimId) cancelAnimationFrame(this.volumeAnimId);
      this.volumeAnimId = requestAnimationFrame(monitorVolume);
    } catch (e) {
      console.warn('创建音频分析器失败:', e);
    }
  }

  /**
   * 切换麦克风静音状态
   */
  setMute(isMuted) {
    if (!this.localStream) {
      if (!isMuted) {
        return this.requestMicrophone();
      }
      return Promise.resolve(false);
    }

    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });

    this.isMicEnabled = !isMuted;
    if (this.socket) {
      this.socket.emit('voice_status', { isMuted: !this.isMicEnabled, isSpeaking: false });
    }

    if (this.onStatusChange) {
      this.onStatusChange(this.isMicEnabled, this.isPermissionGranted);
    }
    if (this.onSpeakingChange) {
      this.onSpeakingChange(this.myToken, false, 0);
    }

    return Promise.resolve(this.isMicEnabled);
  }

  async toggleMic() {
    if (!this.localStream || !this.isPermissionGranted) {
      return await this.requestMicrophone();
    }
    return await this.setMute(this.isMicEnabled);
  }

  /**
   * 创建与远程 Peer 的 WebRTC 连接
   */
  async createPeerConnection(peerToken, isInitiator) {
    if (this.peers.has(peerToken)) {
      const existing = this.peers.get(peerToken);
      if (existing.pc && existing.pc.signalingState !== 'closed') {
        return existing;
      }
      this.closePeer(peerToken);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    const peerData = {
      pc,
      audioElement: null,
      analyser: null,
      isSpeaking: false,
      isMuted: false,
      pendingCandidates: []
    };
    this.peers.set(peerToken, peerData);

    // ICE 候选回调
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('voice_signal', {
          toToken: peerToken,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // 收到远程音频流
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.setupRemoteAudio(peerToken, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        // 连接异常时静默清理
      }
    };

    // 添加本地音轨
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // 主动发起 Offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        if (this.socket) {
          this.socket.emit('voice_signal', {
            toToken: peerToken,
            signal: { type: 'offer', sdp: pc.localDescription }
          });
        }
      } catch (err) {
        console.warn(`向玩家 ${peerToken} 发起 WebRTC Offer 失败:`, err);
      }
    }

    return peerData;
  }

  /**
   * 处理远程信令消息 (Offer / Answer / Candidate)
   */
  async handleSignal(fromToken, signal) {
    if (!signal) return;
    this.ensureAudioContext();

    let peer = this.peers.get(fromToken);
    if (!peer || !peer.pc || peer.pc.signalingState === 'closed') {
      peer = await this.createPeerConnection(fromToken, false);
    }

    const { pc } = peer;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        // 处理之前缓存的 ICE Candidates
        while (peer.pendingCandidates.length > 0) {
          const cand = peer.pendingCandidates.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }

        // 添加本地音频轨道并回发 Answer
        if (this.localStream) {
          const senders = pc.getSenders();
          this.localStream.getAudioTracks().forEach(track => {
            if (!senders.some(s => s.track === track)) {
              pc.addTrack(track, this.localStream);
            }
          });
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.socket) {
          this.socket.emit('voice_signal', {
            toToken: fromToken,
            signal: { type: 'answer', sdp: pc.localDescription }
          });
        }
      } else if (signal.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          while (peer.pendingCandidates.length > 0) {
            const cand = peer.pendingCandidates.shift();
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        } else {
          peer.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      console.warn(`处理来自 ${fromToken} 的信令异常:`, err);
    }
  }

  /**
   * 绑定远程音频并分析声浪
   */
  setupRemoteAudio(peerToken, remoteStream) {
    const peer = this.peers.get(peerToken);
    if (!peer) return;

    // 创建隐藏的 <audio> 标签播放音频
    if (!peer.audioElement) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      peer.audioElement = audio;
    }

    peer.audioElement.srcObject = remoteStream;
    peer.audioElement.play().catch(() => {
      // 移动端自动播放受限时，挂载到全局首次手势恢复
      const resumePlay = () => {
        peer.audioElement?.play();
        document.removeEventListener('click', resumePlay);
        document.removeEventListener('touchstart', resumePlay);
      };
      document.addEventListener('click', resumePlay, { once: true });
      document.addEventListener('touchstart', resumePlay, { once: true });
    });

    // 远程声浪分析
    if (this.audioCtx) {
      try {
        const source = this.audioCtx.createMediaStreamSource(remoteStream);
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        peer.analyser = analyser;
      } catch (e) {
        console.warn('远程音频流连接分析器异常:', e);
      }
    }
  }

  /**
   * 关闭单个 Peer
   */
  closePeer(peerToken) {
    const peer = this.peers.get(peerToken);
    if (peer) {
      if (peer.pc) {
        peer.pc.close();
      }
      if (peer.audioElement) {
        peer.audioElement.srcObject = null;
        peer.audioElement.remove();
      }
      this.peers.delete(peerToken);
      if (this.onSpeakingChange) {
        this.onSpeakingChange(peerToken, false, 0);
      }
    }
  }

  /**
   * 退出房间时彻底清理所有连接与麦克风流
   */
  destroy() {
    if (this.volumeAnimId) {
      cancelAnimationFrame(this.volumeAnimId);
      this.volumeAnimId = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.peers.forEach((peer, token) => {
      this.closePeer(token);
    });
    this.peers.clear();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.isMicEnabled = false;
    this.isPermissionGranted = false;
    this.isSpeaking = false;
  }
}

// 挂载全局单例
window.voiceManager = new VoiceManager();
