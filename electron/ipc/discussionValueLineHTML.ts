function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateValueLineHTML(topic: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 가치수직선 토론</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent: #3b82f6;
      --bg: #0a0e17;
      --card: #1a2332;
      --border: #2a3548;
      --text: #e2e8f0;
      --muted: #94a3b8;
    }

    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    #app {
      max-width: 480px;
      width: 100%;
      padding: 20px;
    }

    /* ── Shared ── */
    .screen { display: none; }
    .screen.active { display: block; }

    .state-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 60vh;
      gap: 16px;
    }

    .logo {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 28px;
      margin-top: 12px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
    }

    input[type="text"] {
      width: 100%;
      height: 52px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
      padding: 0 14px;
      outline: none;
      transition: border-color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    input[type="text"]::placeholder { color: var(--muted); }
    input[type="text"]:focus { border-color: var(--accent); }

    .primary-btn {
      width: 100%;
      height: 52px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .primary-btn:active { transform: scale(0.97); }
    .primary-btn:disabled { opacity: 0.4; pointer-events: none; }

    /* ── Join Screen ── */
    #join-screen .label {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 8px;
    }

    #join-screen .field { margin-bottom: 16px; }

    /* ── Discussion Screen ── */
    #topic-bar {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 16px;
      text-align: center;
    }

    #topic-round {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
    }

    /* Value line */
    #value-line-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px 16px;
      margin-bottom: 16px;
    }

    .vl-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .vl-label-oppose {
      font-size: 14px;
      font-weight: 700;
      color: #ef4444;
    }

    .vl-label-agree {
      font-size: 14px;
      font-weight: 700;
      color: var(--accent);
    }

    #vl-track-wrapper {
      position: relative;
      height: 60px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }

    #vl-track {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 10px;
      transform: translateY(-50%);
      border-radius: 999px;
      background: linear-gradient(to right, #ef4444, #8b5cf6, #3b82f6);
    }

    /* Other students */
    .peer-handle {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      pointer-events: none;
      transition: left 0.2s ease;
    }

    .peer-name {
      position: absolute;
      top: calc(50% + 20px);
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--muted);
      white-space: nowrap;
      pointer-events: none;
      transition: left 0.2s ease;
    }

    /* My handle */
    #my-handle {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 3px solid var(--accent);
      box-shadow: 0 0 0 4px rgba(59,130,246,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      cursor: grab;
      z-index: 10;
      transition: left 0.05s linear;
      touch-action: none;
    }

    #my-handle:active { cursor: grabbing; }

    /* Chat */
    #chat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 260px;
    }

    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #chat-messages::-webkit-scrollbar { width: 4px; }
    #chat-messages::-webkit-scrollbar-track { background: transparent; }
    #chat-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .chat-msg {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .chat-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .chat-msg-body {}

    .chat-msg-meta {
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 2px;
    }

    .chat-msg-text {
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
      word-break: break-word;
    }

    .chat-msg.mine .chat-msg-meta { color: #60a5fa; }

    .chat-input-row {
      display: flex;
      border-top: 1px solid var(--border);
    }

    #chat-input {
      flex: 1;
      height: 48px;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: inherit;
      font-size: 15px;
      padding: 0 14px;
      outline: none;
    }

    #chat-input::placeholder { color: var(--muted); }

    #chat-send {
      height: 48px;
      padding: 0 16px;
      background: var(--accent);
      color: #fff;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      transition: opacity 0.2s;
    }

    #chat-send:active { opacity: 0.8; }

    /* ── End Screen ── */
    #end-screen .big-emoji {
      font-size: 72px;
      line-height: 1;
      animation: scaleIn 0.5s ease-out;
    }

    #end-screen h2 {
      font-size: 22px;
      font-weight: 700;
    }

    #end-screen p {
      color: var(--muted);
      font-size: 15px;
    }

    @keyframes scaleIn {
      from { transform: scale(0); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }

    /* ── Connecting ── */
    #connecting-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      color: var(--muted);
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Connecting -->
    <div id="connecting-screen">연결 중...</div>

    <!-- Join Screen -->
    <div id="join-screen" class="screen">
      <div class="logo">📏 쌤핀 가치수직선 토론</div>
      <div class="card">
        <div class="field">
          <div class="label">이름 또는 닉네임</div>
          <input type="text" id="name-input" placeholder="이름 또는 닉네임" maxlength="10" autocomplete="off" />
        </div>
        <button class="primary-btn" id="join-btn" disabled>입장하기</button>
      </div>
    </div>

    <!-- Discussion Screen -->
    <div id="discussion-screen" class="screen">
      <div id="topic-bar">
        <div id="topic-round">라운드 1</div>
        <div id="topic-text">${escapeHtml(topic)}</div>
      </div>

      <div id="value-line-card">
        <div class="vl-labels">
          <span class="vl-label-oppose">반대</span>
          <span class="vl-label-agree">찬성</span>
        </div>
        <div id="vl-track-wrapper">
          <div id="vl-track"></div>
          <!-- Peer handles injected by JS -->
          <div id="my-handle"></div>
        </div>
      </div>

      <div id="chat-card">
        <div id="chat-messages"></div>
        <div class="chat-input-row">
          <input type="text" id="chat-input" placeholder="의견을 입력하세요..." maxlength="500" autocomplete="off" />
          <button id="chat-send">전송</button>
        </div>
      </div>
    </div>

    <!-- End Screen -->
    <div id="end-screen" class="screen">
      <div class="state-view">
        <div class="big-emoji">📏</div>
        <h2>토론이 종료되었습니다</h2>
        <p>참여해 주셔서 감사합니다!</p>
      </div>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      /* ── State ── */
      var myName = '';
      var myConsonant = '';
      var myAvatarColor = '#6366f1';
      var myId = null;
      var myPosition = 0.5;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;
      var hasJoined = false;
      var lastMoveSent = 0;
      var pingInterval = null;
      var peers = {}; // id -> { name, emoji, avatarColor, position }

      /* ── Screen helpers ── */
      function showScreen(id) {
        var screens = ['connecting-screen', 'join-screen', 'discussion-screen', 'end-screen'];
        for (var i = 0; i < screens.length; i++) {
          var el = document.getElementById(screens[i]);
          if (!el) continue;
          if (screens[i] === id) {
            el.style.display = '';
            el.classList.add('active');
          } else {
            el.style.display = 'none';
            el.classList.remove('active');
          }
        }
      }

      /* ── Join form ── */
      var nameInput = document.getElementById('name-input');
      var joinBtn = document.getElementById('join-btn');

      function validateJoin() {
        var name = nameInput ? nameInput.value.trim() : '';
        joinBtn.disabled = name.length === 0;
      }

      if (nameInput) {
        nameInput.addEventListener('input', validateJoin);
      }

      if (joinBtn) {
        joinBtn.addEventListener('click', function () {
          if (!nameInput) return;
          var name = nameInput.value.trim();
          if (!name) return;
          myName = name;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'join', name: myName }));
          }
        });
      }

      /* ── Value line drag ── */
      var trackWrapper = document.getElementById('vl-track-wrapper');
      var myHandle = document.getElementById('my-handle');
      var isDragging = false;

      function positionToPercent(pos) {
        return Math.round(pos * 1000) / 1000;
      }

      function applyHandlePosition(el, pos) {
        if (!el || !trackWrapper) return;
        var wrapperWidth = trackWrapper.offsetWidth;
        var halfHandle = parseInt(el.style.width || '48') / 2 || 24;
        var px = pos * wrapperWidth;
        px = Math.max(halfHandle, Math.min(wrapperWidth - halfHandle, px));
        el.style.left = px + 'px';
      }

      function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
      }

      function posFromClientX(clientX) {
        if (!trackWrapper) return 0.5;
        var rect = trackWrapper.getBoundingClientRect();
        return clamp((clientX - rect.left) / rect.width, 0, 1);
      }

      function throttledMove(pos) {
        var now = Date.now();
        if (now - lastMoveSent < 100) return;
        lastMoveSent = now;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'move', position: positionToPercent(pos) }));
        }
      }

      // Touch events
      if (myHandle) {
        myHandle.addEventListener('touchstart', function (e) {
          e.preventDefault();
          isDragging = true;
        }, { passive: false });
      }

      document.addEventListener('touchmove', function (e) {
        if (!isDragging) return;
        e.preventDefault();
        var touch = e.touches[0];
        var pos = posFromClientX(touch.clientX);
        myPosition = pos;
        applyHandlePosition(myHandle, pos);
        throttledMove(pos);
      }, { passive: false });

      document.addEventListener('touchend', function () {
        if (!isDragging) return;
        isDragging = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'move', position: positionToPercent(myPosition) }));
        }
      });

      // Mouse events (desktop testing)
      if (myHandle) {
        myHandle.addEventListener('mousedown', function (e) {
          e.preventDefault();
          isDragging = true;
        });
      }

      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var pos = posFromClientX(e.clientX);
        myPosition = pos;
        applyHandlePosition(myHandle, pos);
        throttledMove(pos);
      });

      document.addEventListener('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'move', position: positionToPercent(myPosition) }));
        }
      });

      /* ── Peers rendering ── */
      function renderPeers() {
        if (!trackWrapper) return;
        // Remove old peer elements
        var old = trackWrapper.querySelectorAll('.peer-handle, .peer-name');
        for (var i = 0; i < old.length; i++) old[i].remove();

        var wrapperWidth = trackWrapper.offsetWidth;

        Object.keys(peers).forEach(function (id) {
          if (id === String(myId)) return;
          var peer = peers[id];
          var halfHandle = 16;
          var px = clamp(peer.position * wrapperWidth, halfHandle, wrapperWidth - halfHandle);

          var handle = document.createElement('div');
          handle.className = 'peer-handle';
          handle.style.left = px + 'px';
          handle.style.backgroundColor = peer.avatarColor || '#6366f1';
          handle.textContent = peer.emoji || '?';

          var nameEl = document.createElement('div');
          nameEl.className = 'peer-name';
          nameEl.style.left = px + 'px';
          nameEl.textContent = peer.name || '';

          trackWrapper.appendChild(handle);
          trackWrapper.appendChild(nameEl);
        });

        // Re-apply my handle position so it stays on top
        applyHandlePosition(myHandle, myPosition);
      }

      /* ── Chat ── */
      var chatInput = document.getElementById('chat-input');
      var chatSend = document.getElementById('chat-send');
      var chatMessages = document.getElementById('chat-messages');

      function appendChat(name, emoji, avatarColor, text, isMe) {
        if (!chatMessages) return;
        var msg = document.createElement('div');
        msg.className = 'chat-msg' + (isMe ? ' mine' : '');

        var avatar = document.createElement('div');
        avatar.className = 'chat-msg-avatar';
        avatar.style.backgroundColor = avatarColor || '#6366f1';
        avatar.textContent = emoji || '?';

        var body = document.createElement('div');
        body.className = 'chat-msg-body';

        var meta = document.createElement('div');
        meta.className = 'chat-msg-meta';
        meta.textContent = name;

        var textEl = document.createElement('div');
        textEl.className = 'chat-msg-text';
        textEl.textContent = text;

        body.appendChild(meta);
        body.appendChild(textEl);
        msg.appendChild(avatar);
        msg.appendChild(body);
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      function sendChat() {
        if (!chatInput) return;
        var text = chatInput.value.trim();
        if (!text) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'chat', text: text }));
        }
        chatInput.value = '';
      }

      if (chatSend) {
        chatSend.addEventListener('click', sendChat);
      }

      if (chatInput) {
        chatInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            sendChat();
          }
        });
      }

      /* ── WebSocket ── */
      function connect() {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        try {
          var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(wsProto + '//' + location.host);
        } catch (e) {
          scheduleReconnect();
          return;
        }

        ws.onopen = function () {
          reconnectDelay = 1000;

          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(function () {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);

          if (hasJoined && myName) {
            // Reconnect: re-send join
            ws.send(JSON.stringify({ type: 'join', name: myName }));
          } else {
            showScreen('join-screen');
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try { msg = JSON.parse(event.data); } catch (e) { return; }

          if (msg.type === 'pong') {
            return;
          }

          if (msg.type === 'session') {
            myId = msg.yourId;
            hasJoined = true;
            // Extract avatar info from server
            if (msg.avatar) {
              myConsonant = msg.avatar.consonant || '?';
              myAvatarColor = msg.avatar.color || '#6366f1';
            }
            // Update topic if present
            var roundEl = document.getElementById('topic-round');
            var topicEl = document.getElementById('topic-text');
            if (roundEl && msg.round != null) roundEl.textContent = '라운드 ' + msg.round;
            if (topicEl && msg.topic) topicEl.textContent = msg.topic;
            // Update my handle with avatar
            if (myHandle) {
              myHandle.textContent = myConsonant;
              myHandle.style.backgroundColor = myAvatarColor;
            }
            // Reset position to center
            myPosition = 0.5;
            applyHandlePosition(myHandle, myPosition);
            showScreen('discussion-screen');
            return;
          }

          if (msg.type === 'state') {
            // msg.students: array of { id, name, emoji, avatarColor, position }
            peers = {};
            if (Array.isArray(msg.students)) {
              msg.students.forEach(function (s) {
                peers[String(s.id)] = { name: s.name, emoji: s.emoji, avatarColor: s.avatarColor || '#6366f1', position: s.position != null ? s.position : 0.5 };
              });
            }
            renderPeers();
            return;
          }

          if (msg.type === 'round') {
            var roundEl = document.getElementById('topic-round');
            var topicEl = document.getElementById('topic-text');
            if (roundEl && msg.round != null) roundEl.textContent = '라운드 ' + msg.round;
            if (topicEl && msg.topic) topicEl.textContent = msg.topic;
            // Reset to center
            myPosition = 0.5;
            applyHandlePosition(myHandle, myPosition);
            return;
          }

          if (msg.type === 'chat') {
            var isMe = msg.senderId != null && String(msg.senderId) === String(myId);
            appendChat(msg.name || '', msg.emoji || '?', msg.avatarColor || '#6366f1', msg.text || '', isMe);
            return;
          }

          if (msg.type === 'end') {
            if (pingInterval) clearInterval(pingInterval);
            showScreen('end-screen');
            return;
          }
        };

        ws.onclose = function () {
          ws = null;
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
          scheduleReconnect();
        };

        ws.onerror = function () {
          // onclose will also fire
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      showScreen('connecting-screen');
      connect();
    })();
  </script>
</body>
</html>`;
}
