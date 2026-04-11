function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateTrafficLightHTML(topic: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 신호등 토론</title>
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

    /* ── Shared utilities ── */
    .hidden { display: none !important; }

    .state-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 70vh;
      gap: 12px;
    }

    .state-view h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
    }

    .state-view p {
      color: var(--muted);
      font-size: 15px;
    }

    /* ── JOIN SCREEN ── */
    #join-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      padding-top: 32px;
    }

    .logo {
      font-size: 15px;
      color: var(--muted);
      text-align: center;
      margin-bottom: 28px;
      letter-spacing: 0.01em;
    }

    .join-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 20px;
      width: 100%;
    }

    .join-card label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .name-input {
      width: 100%;
      height: 48px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
      padding: 0 14px;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .name-input::placeholder {
      color: var(--muted);
    }

    .name-input:focus {
      border-color: var(--accent);
    }

    .join-btn {
      width: 100%;
      height: 52px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 20px;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .join-btn:active {
      transform: scale(0.97);
    }

    .join-btn:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    /* ── DISCUSSION SCREEN ── */
    #discussion-screen {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-height: 100vh;
      overflow: hidden;
      padding: 0;
      margin: -20px;
      width: calc(100% + 40px);
    }

    .topic-bar {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      flex-shrink: 0;
      line-height: 1.4;
    }

    .signals-area {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
    }

    .signal-btn {
      width: 100%;
      height: 80px;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: 14px;
      color: var(--text);
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .signal-btn:active {
      transform: scale(0.98);
    }

    .signal-btn .signal-emoji {
      font-size: 28px;
      line-height: 1;
    }

    /* Red */
    .signal-btn.red { border-color: rgba(239, 68, 68, 0.4); }
    .signal-btn.red.selected {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.18);
      transform: scale(1.02);
    }

    /* Yellow */
    .signal-btn.yellow { border-color: rgba(245, 158, 11, 0.4); }
    .signal-btn.yellow.selected {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.18);
      transform: scale(1.02);
    }

    /* Green */
    .signal-btn.green { border-color: rgba(34, 197, 94, 0.4); }
    .signal-btn.green.selected {
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.18);
      transform: scale(1.02);
    }

    .signal-status {
      text-align: center;
      font-size: 13px;
      color: var(--muted);
      padding: 0 16px 8px;
      flex-shrink: 0;
    }

    /* ── CHAT AREA ── */
    .chat-divider {
      height: 1px;
      background: var(--border);
      margin: 0;
      flex-shrink: 0;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-messages::-webkit-scrollbar { width: 4px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .chat-msg {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .chat-msg .avatar {
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

    .chat-msg .bubble-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: calc(100% - 32px);
    }

    .chat-msg .sender {
      font-size: 11px;
      color: var(--muted);
    }

    .chat-msg .bubble {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0 10px 10px 10px;
      padding: 7px 10px;
      font-size: 14px;
      line-height: 1.5;
      word-break: break-word;
    }

    .chat-msg.system .bubble {
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 12px;
      font-style: italic;
      padding: 2px 0;
    }

    .chat-input-row {
      display: flex;
      gap: 8px;
      padding: 10px 16px 16px;
      flex-shrink: 0;
      background: var(--bg);
      border-top: 1px solid var(--border);
    }

    .chat-input {
      flex: 1;
      height: 42px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-family: inherit;
      font-size: 15px;
      padding: 0 12px;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .chat-input::placeholder { color: var(--muted); }
    .chat-input:focus { border-color: var(--accent); }

    .chat-send-btn {
      width: 42px;
      height: 42px;
      background: var(--accent);
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      flex-shrink: 0;
    }

    .chat-send-btn:active { transform: scale(0.93); }
    .chat-send-btn:disabled { opacity: 0.4; pointer-events: none; }

    /* ── END SCREEN ── */
    #end-screen {
      padding-top: 0;
    }
  </style>
</head>
<body>
  <div id="app">

    <!-- CONNECTING -->
    <div id="connecting-screen" class="state-view">
      <p>연결 중...</p>
    </div>

    <!-- JOIN SCREEN -->
    <div id="join-screen" class="hidden">
      <div class="logo">🚦 쌤핀 신호등 토론</div>
      <div class="join-card">
        <label for="name-input">이름</label>
        <input
          id="name-input"
          class="name-input"
          type="text"
          placeholder="이름 또는 닉네임"
          maxlength="10"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />

        <button class="join-btn" id="join-btn" disabled>입장하기</button>
      </div>
    </div>

    <!-- DISCUSSION SCREEN -->
    <div id="discussion-screen" class="hidden">
      <div class="topic-bar" id="topic-bar">라운드 1 — ${escapeHtml(topic)}</div>

      <div class="signals-area">
        <button class="signal-btn red" id="signal-red" data-value="red">
          <span class="signal-emoji">🔴</span>
          <span>반대</span>
        </button>
        <button class="signal-btn yellow" id="signal-yellow" data-value="yellow">
          <span class="signal-emoji">🟡</span>
          <span>보류</span>
        </button>
        <button class="signal-btn green" id="signal-green" data-value="green">
          <span class="signal-emoji">🟢</span>
          <span>찬성</span>
        </button>
      </div>

      <div class="signal-status" id="signal-status">아직 선택하지 않았습니다</div>

      <div class="chat-divider"></div>

      <div class="chat-messages" id="chat-messages"></div>

      <div class="chat-input-row">
        <input
          id="chat-input"
          class="chat-input"
          type="text"
          placeholder="채팅 메시지..."
          maxlength="200"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button class="chat-send-btn" id="chat-send-btn" disabled>↑</button>
      </div>
    </div>

    <!-- END SCREEN -->
    <div id="end-screen" class="state-view hidden">
      <div style="font-size:60px;line-height:1;margin-bottom:8px;">🚦</div>
      <h2>토론이 종료되었습니다</h2>
      <p>참여해 주셔서 감사합니다</p>
    </div>

    <!-- DISCONNECTED -->
    <div id="disconnected-screen" class="state-view hidden">
      <h2>연결이 끊어졌습니다</h2>
      <p>다시 연결 중...</p>
    </div>

  </div>

  <script>
    (function () {
      'use strict';

      /* ── State ── */
      var myName = '';
      var currentSignal = null; // 'red' | 'yellow' | 'green' | null
      var hasJoined = false;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;
      var pingTimer = null;

      /* ── Screen management ── */
      var SCREENS = ['connecting-screen', 'join-screen', 'discussion-screen', 'end-screen', 'disconnected-screen'];

      function showScreen(id) {
        for (var i = 0; i < SCREENS.length; i++) {
          var el = document.getElementById(SCREENS[i]);
          if (el) {
            if (SCREENS[i] === id) {
              el.classList.remove('hidden');
            } else {
              el.classList.add('hidden');
            }
          }
        }
      }

      /* ── JOIN SCREEN logic ── */
      var nameInput = document.getElementById('name-input');
      var joinBtn = document.getElementById('join-btn');

      nameInput.addEventListener('input', function () {
        joinBtn.disabled = nameInput.value.trim().length === 0;
      });

      joinBtn.addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name) return;
        myName = name;
        hasJoined = true;
        sendJoin();
      });

      /* ── SIGNAL BUTTONS ── */
      var signalLabels = { red: '반대', yellow: '보류', green: '찬성' };

      function updateSignalUI() {
        var btns = document.querySelectorAll('.signal-btn');
        for (var i = 0; i < btns.length; i++) {
          var btn = btns[i];
          var val = btn.getAttribute('data-value');
          if (val === currentSignal) {
            btn.classList.add('selected');
          } else {
            btn.classList.remove('selected');
          }
        }
        var statusEl = document.getElementById('signal-status');
        if (currentSignal) {
          statusEl.textContent = '현재 선택: ' + signalLabels[currentSignal];
          statusEl.style.color = currentSignal === 'red' ? '#ef4444'
            : currentSignal === 'yellow' ? '#f59e0b' : '#22c55e';
        } else {
          statusEl.textContent = '아직 선택하지 않았습니다';
          statusEl.style.color = '';
        }
      }

      document.querySelector('.signals-area').addEventListener('click', function (e) {
        var btn = e.target.closest('.signal-btn');
        if (!btn) return;
        var val = btn.getAttribute('data-value');
        if (val === currentSignal) return; // no change
        currentSignal = val;
        updateSignalUI();
        wsSend({ type: 'signal', value: val });
      });

      /* ── CHAT ── */
      var chatInput = document.getElementById('chat-input');
      var chatSendBtn = document.getElementById('chat-send-btn');

      chatInput.addEventListener('input', function () {
        chatSendBtn.disabled = chatInput.value.trim().length === 0;
      });

      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChat();
        }
      });

      chatSendBtn.addEventListener('click', sendChat);

      function sendChat() {
        var text = chatInput.value.trim();
        if (!text) return;
        wsSend({ type: 'chat', text: text });
        chatInput.value = '';
        chatSendBtn.disabled = true;
      }

      function appendChatMessage(emoji, avatarColor, name, text, isSystem) {
        var container = document.getElementById('chat-messages');
        if (!container) return;

        var msgEl = document.createElement('div');
        msgEl.className = 'chat-msg' + (isSystem ? ' system' : '');

        if (isSystem) {
          var bubble = document.createElement('div');
          bubble.className = 'bubble-wrap';
          var bubbleText = document.createElement('div');
          bubbleText.className = 'bubble';
          bubbleText.textContent = text;
          bubble.appendChild(bubbleText);
          msgEl.appendChild(bubble);
        } else {
          var avatarEl = document.createElement('div');
          avatarEl.className = 'avatar';
          avatarEl.style.backgroundColor = avatarColor || '#6366f1';
          avatarEl.textContent = emoji || '?';

          var wrap = document.createElement('div');
          wrap.className = 'bubble-wrap';

          var senderEl = document.createElement('div');
          senderEl.className = 'sender';
          senderEl.textContent = name || '';

          var bubbleEl = document.createElement('div');
          bubbleEl.className = 'bubble';
          bubbleEl.textContent = text;

          wrap.appendChild(senderEl);
          wrap.appendChild(bubbleEl);
          msgEl.appendChild(avatarEl);
          msgEl.appendChild(wrap);
        }

        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
      }

      /* ── WebSocket ── */
      function wsSend(obj) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(obj));
        }
      }

      function sendJoin() {
        wsSend({ type: 'join', name: myName });
        if (currentSignal) {
          wsSend({ type: 'signal', value: currentSignal });
        }
      }

      function startPing() {
        stopPing();
        pingTimer = setInterval(function () {
          wsSend({ type: 'ping' });
        }, 25000);
      }

      function stopPing() {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
      }

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
          startPing();
          if (hasJoined) {
            sendJoin();
            showScreen('discussion-screen');
          } else {
            showScreen('join-screen');
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          switch (msg.type) {
            case 'session':
              // Server confirmed session — show discussion screen
              hasJoined = true;
              showScreen('discussion-screen');
              break;

            case 'state':
              // No student-side visual update needed for state broadcast
              break;

            case 'round':
              // New round: update topic bar, reset signal
              currentSignal = null;
              updateSignalUI();
              var topicBar = document.getElementById('topic-bar');
              if (topicBar) {
                var round = msg.round || 1;
                var topicText = msg.topic || '';
                topicBar.textContent = '라운드 ' + round + ' — ' + topicText;
              }
              appendChatMessage('', '', '', '새 라운드가 시작되었습니다', true);
              break;

            case 'chat':
              appendChatMessage(msg.emoji || '?', msg.avatarColor || '#6366f1', msg.name, msg.text, false);
              break;

            case 'end':
              stopPing();
              showScreen('end-screen');
              break;

            default:
              break;
          }
        };

        ws.onclose = function () {
          ws = null;
          stopPing();
          if (hasJoined) {
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
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      connect();
    })();
  </script>
</body>
</html>`;
}
