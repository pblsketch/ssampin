import {
  getConnectionChipCSS,
  getConnectionChipHTML,
  getConnectionChipJS,
  getStatusScreenHTML,
  getStudentBaseCSS,
  getStudentFeedbackJS,
  getStudentFontLinks,
  getStudentViewportMeta,
  getToastHTML,
} from './_studentPageChrome';

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
  ${getStudentViewportMeta()}
  <title>쌤핀 가치수직선 토론</title>
  ${getStudentFontLinks()}
  <style>
    [hidden] { display: none !important; }
${getStudentBaseCSS()}
    /* 기존 페이지 변수 — 셸 토큰으로 단일화 (값 정의는 --sps-* 한 곳) */
    :root {
      --accent: var(--sps-accent);
      --bg: var(--sps-bg);
      --card: var(--sps-card);
      --border: var(--sps-border);
      --text: var(--sps-text);
      --muted: var(--sps-muted);
    }

    /* ── Shared ── */
    .screen { display: none; }
    .screen.active { display: block; }

    #header { text-align: center; padding-top: 4px; }

    /* ── Discussion Screen ── */
    #topic-bar {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--sps-radius-card);
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
      border-radius: var(--sps-radius-card);
      padding: 20px 16px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .vl-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .vl-label-oppose {
      font-size: 14px;
      font-weight: 700;
      color: var(--sps-error);
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

    /* 중앙(중립) 눈금 — 색 그라데이션 외 비색상 단서 (색각 이상 대응) */
    #vl-center-tick {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 2px;
      height: 22px;
      transform: translate(-50%, -50%);
      background: var(--sps-text);
      opacity: 0.5;
      border-radius: 1px;
      pointer-events: none;
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
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      pointer-events: none;
      transition: left 0.2s ease;
    }

    /* My handle — role=slider, 키보드 조작 가능 */
    #my-handle {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 3px solid var(--accent);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25);
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

    /* 위치 확정 피드백 — 드래그 종료 시 1회 펄스 */
    #my-handle.confirmed { animation: vl-confirm 0.35s ease-out; }
    @keyframes vl-confirm {
      0% { transform: translate(-50%, -50%) scale(1); }
      40% { transform: translate(-50%, -50%) scale(1.12); }
      100% { transform: translate(-50%, -50%) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      #my-handle.confirmed { animation: none; }
    }

    /* Chat */
    #chat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--sps-radius-card);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 260px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
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
      font-size: 16px;
      padding: 0 14px;
      outline: none;
    }

    #chat-input::placeholder { color: var(--muted); }

    #chat-send {
      height: 48px;
      min-width: 64px;
      padding: 0 16px;
      background: var(--accent);
      color: #fff;
      border: none;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      transition: opacity 0.2s;
    }

    #chat-send:active { opacity: 0.8; }
    #chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
${getConnectionChipCSS()}
  </style>
</head>
<body class="sps-page">
  ${getConnectionChipHTML()}
  <script>${getConnectionChipJS({ submitButtonSelectors: ['#join-btn', '#chat-send'] })}</script>
  <div id="app" class="sps-app">
    <!-- Connecting -->
    <div id="connecting-screen">${getStatusScreenHTML('connecting', { id: 'connecting-inner', hiddenByDefault: false })}</div>

    <!-- Join Screen -->
    <div id="join-screen" class="screen">
      <div id="header">
        <div class="sps-logo">쌤핀 가치수직선 토론</div>
      </div>
      <div id="join-topic" class="sps-screen-subtitle" style="text-align:center;margin-bottom:16px;">${escapeHtml(topic)}</div>
      <div class="sps-card">
        <div class="field" style="margin-bottom:16px;">
          <label class="sps-screen-subtitle" for="name-input" style="display:block;margin-bottom:8px;font-size:13px;">이름 또는 닉네임</label>
          <input type="text" id="name-input" class="sps-input" placeholder="이름 또는 닉네임" maxlength="10" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />
        </div>
        <button class="sps-btn" id="join-btn" disabled>입장하기</button>
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
          <div id="vl-center-tick"></div>
          <!-- Peer handles injected by JS -->
          <div id="my-handle" role="slider" tabindex="0" aria-label="내 위치 (왼쪽 반대, 오른쪽 찬성)"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>
        </div>
      </div>

      <div id="chat-card">
        <div id="chat-messages"></div>
        <div class="chat-input-row">
          <input type="text" id="chat-input" placeholder="의견을 입력하세요..." maxlength="500" autocomplete="off" enterkeyhint="send" />
          <button id="chat-send" disabled>전송</button>
        </div>
      </div>
    </div>

    <!-- Disconnected Screen (2026-06-12 감사 P0 — 침묵 재연결로 응답이 유실되던 결함) -->
    <div id="disconnected-screen" class="screen">${getStatusScreenHTML('disconnected', { id: 'disconnected-inner', hiddenByDefault: false })}</div>

    <!-- End Screen -->
    <div id="end-screen" class="screen">${getStatusScreenHTML('closed', { id: 'end-inner', title: '토론이 종료되었습니다', subtitle: '참여해 주셔서 감사합니다!', hiddenByDefault: false })}</div>
  </div>
  ${getToastHTML()}
  <script>${getStudentFeedbackJS()}</script>

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
      var hasEnded = false;
      var lastMoveSent = 0;
      var pingInterval = null;
      var joinPendingTimer = null;
      var peers = {}; // id -> { name, emoji, avatarColor, position }

      var HANDLE_HALF = 24; /* #my-handle 48px 고정 — style.width 파싱 취약점 제거 */

      /* ── Screen helpers ── */
      function showScreen(id) {
        var screens = ['connecting-screen', 'join-screen', 'discussion-screen', 'disconnected-screen', 'end-screen'];
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

      function clearJoinPending() {
        if (joinPendingTimer) {
          clearTimeout(joinPendingTimer);
          joinPendingTimer = null;
        }
        if (joinBtn && window.spsSetPending) window.spsSetPending(joinBtn, false);
      }

      if (nameInput) {
        nameInput.addEventListener('input', validateJoin);
        nameInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (joinBtn && !joinBtn.disabled) joinBtn.click();
          }
        });
      }

      if (joinBtn) {
        joinBtn.addEventListener('click', function () {
          if (!nameInput) return;
          var name = nameInput.value.trim();
          if (!name) return;
          myName = name;
          if (ws && ws.readyState === WebSocket.OPEN) {
            if (window.spsSetPending) window.spsSetPending(joinBtn, true, '입장 중...');
            ws.send(JSON.stringify({ type: 'join', name: myName }));
            joinPendingTimer = setTimeout(function () {
              clearJoinPending();
              if (!hasJoined && window.spsToast) window.spsToast('입장이 확인되지 않았어요. 다시 시도해 주세요.');
            }, 6000);
          } else {
            if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
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
        var halfHandle = el === myHandle ? HANDLE_HALF : 16;
        var px = pos * wrapperWidth;
        px = Math.max(halfHandle, Math.min(wrapperWidth - halfHandle, px));
        el.style.left = px + 'px';
        if (el === myHandle) {
          el.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
        }
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

      function commitPosition() {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'move', position: positionToPercent(myPosition) }));
        }
        if (myHandle) {
          myHandle.classList.remove('confirmed');
          void myHandle.offsetWidth; /* reflow로 애니메이션 재시작 */
          myHandle.classList.add('confirmed');
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
        commitPosition();
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
        commitPosition();
      });

      // Keyboard (role=slider — 스크린리더/키보드 사용자 대응, 2026-06-12 감사 ③)
      if (myHandle) {
        myHandle.addEventListener('keydown', function (e) {
          var step = 0.05;
          var next = null;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamp(myPosition - step, 0, 1);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamp(myPosition + step, 0, 1);
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = 1;
          if (next === null) return;
          e.preventDefault();
          myPosition = next;
          applyHandlePosition(myHandle, next);
          commitPosition();
        });
      }

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

      function updateChatSend() {
        if (!chatInput || !chatSend) return;
        chatSend.disabled = chatInput.value.trim().length === 0;
      }

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
        // 소켓이 닫혔을 때 입력만 비우고 메시지가 유실되던 결함 — 안내 후 입력 보존
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 보내 주세요.');
          return;
        }
        ws.send(JSON.stringify({ type: 'chat', text: text }));
        chatInput.value = '';
        updateChatSend();
      }

      if (chatSend) {
        chatSend.addEventListener('click', sendChat);
      }

      if (chatInput) {
        chatInput.addEventListener('input', updateChatSend);
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

        if (window.spConnSetState) window.spConnSetState('connecting');

        try {
          var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(wsProto + '//' + location.host);
        } catch (e) {
          if (window.spConnSetState) window.spConnSetState('disconnected');
          scheduleReconnect();
          return;
        }

        ws.onopen = function () {
          reconnectDelay = 1000;
          if (window.spConnSetState) window.spConnSetState('connected');

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
            clearJoinPending();
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
            // Reset to center — 조용한 리셋이던 구간, 안내 추가 (2026-06-12 감사 ⑤)
            myPosition = 0.5;
            applyHandlePosition(myHandle, myPosition);
            if (window.spsToast) window.spsToast('새 라운드가 시작됐어요. 위치가 가운데로 돌아갑니다.');
            return;
          }

          if (msg.type === 'chat') {
            var isMe = msg.senderId != null && String(msg.senderId) === String(myId);
            appendChat(msg.name || '', msg.emoji || '?', msg.avatarColor || '#6366f1', msg.text || '', isMe);
            return;
          }

          if (msg.type === 'end') {
            hasEnded = true;
            if (pingInterval) clearInterval(pingInterval);
            showScreen('end-screen');
            return;
          }
        };

        ws.onclose = function () {
          ws = null;
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
          clearJoinPending();
          if (window.spConnSetState) window.spConnSetState('disconnected');
          // 침묵 재연결로 학생이 끊김을 모른 채 응답이 유실되던 결함 (감사 P0)
          if (!hasEnded && hasJoined) {
            showScreen('disconnected-screen');
          }
          scheduleReconnect();
        };

        ws.onerror = function () {
          // onclose will also fire
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          if (window.spConnSetState) window.spConnSetState('reconnecting');
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
