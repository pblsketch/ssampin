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

export function generateTrafficLightHTML(topic: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  ${getStudentViewportMeta()}
  <title>쌤핀 신호등 토론</title>
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

    /* ── Shared utilities ── */
    .hidden { display: none !important; }

    #header { text-align: center; padding-top: 4px; }

    /* ── JOIN SCREEN ── */
    #join-screen {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding-top: 16px;
    }

    .join-card label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .join-card .sps-btn { margin-top: 20px; }

    /* ── DISCUSSION SCREEN — fixed 풀스크린 (음수 마진 핵 제거, dvh+safe-area 대응) ── */
    #discussion-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      background: var(--bg);
      padding-top: env(safe-area-inset-top, 0px);
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
      position: relative;
      width: 100%;
      height: 76px;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--sps-radius-card);
      color: var(--text);
      font-family: inherit;
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

    /* 선택 인디케이터 — 색 변화 외 "모양" 단서 (적록색약 학생 대응, 2026-06-12 감사 P0).
     * 비선택: 우측 빈 원 / 선택: 흰 체크가 들어간 신호색 원판 */
    .signal-btn::after {
      content: '';
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1;
    }
    .signal-btn.selected::after {
      content: '✓';
      border-color: var(--signal-color);
      background: var(--signal-color);
    }

    /* Red */
    .signal-btn.red { --signal-color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }
    .signal-btn.red.selected {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.18);
      transform: scale(1.02);
    }

    /* Yellow */
    .signal-btn.yellow { --signal-color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); }
    .signal-btn.yellow.selected {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.18);
      transform: scale(1.02);
    }

    /* Green */
    .signal-btn.green { --signal-color: #22c55e; border-color: rgba(34, 197, 94, 0.4); }
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
      border-radius: 4px 10px 10px 10px; /* 좌상단 직각 제거 — 라운드 정책 */
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
      padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
      flex-shrink: 0;
      background: var(--bg);
      border-top: 1px solid var(--border);
    }

    .chat-input {
      flex: 1;
      height: 48px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--sps-radius-control);
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
      padding: 0 12px;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .chat-input::placeholder { color: var(--muted); }
    .chat-input:focus { border-color: var(--accent); }

    .chat-send-btn {
      width: 48px;
      height: 48px;
      background: var(--accent);
      border: none;
      border-radius: var(--sps-radius-control);
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
${getConnectionChipCSS()}
  </style>
</head>
<body class="sps-page">
  ${getConnectionChipHTML()}
  <script>${getConnectionChipJS({ submitButtonSelectors: ['#join-btn', '#chat-send-btn', '.signal-btn'] })}</script>
  <div id="app" class="sps-app">

    <!-- CONNECTING -->
    <div id="connecting-screen">${getStatusScreenHTML('connecting', { id: 'connecting-inner', hiddenByDefault: false })}</div>

    <!-- JOIN SCREEN -->
    <div id="join-screen" class="hidden">
      <div id="header">
        <div class="sps-logo">쌤핀 신호등 토론</div>
      </div>
      <div id="join-topic" class="sps-screen-subtitle" style="text-align:center;margin-bottom:16px;">${escapeHtml(topic)}</div>
      <div class="join-card sps-card">
        <label for="name-input">이름</label>
        <input
          id="name-input"
          class="sps-input"
          type="text"
          placeholder="이름 또는 닉네임"
          maxlength="10"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="go"
        />

        <button class="sps-btn" id="join-btn" disabled>입장하기</button>
      </div>
    </div>

    <!-- DISCUSSION SCREEN -->
    <div id="discussion-screen" class="hidden">
      <div class="topic-bar" id="topic-bar">라운드 1 — ${escapeHtml(topic)}</div>

      <div class="signals-area">
        <button class="signal-btn red" id="signal-red" data-value="red" aria-pressed="false">
          <span class="signal-emoji" aria-hidden="true">🔴</span>
          <span>반대</span>
        </button>
        <button class="signal-btn yellow" id="signal-yellow" data-value="yellow" aria-pressed="false">
          <span class="signal-emoji" aria-hidden="true">🟡</span>
          <span>보류</span>
        </button>
        <button class="signal-btn green" id="signal-green" data-value="green" aria-pressed="false">
          <span class="signal-emoji" aria-hidden="true">🟢</span>
          <span>찬성</span>
        </button>
      </div>

      <div class="signal-status" id="signal-status" aria-live="polite">아직 선택하지 않았습니다</div>

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
          enterkeyhint="send"
        />
        <button class="chat-send-btn" id="chat-send-btn" disabled aria-label="보내기">↑</button>
      </div>
    </div>

    <!-- END SCREEN -->
    <div id="end-screen" class="hidden">${getStatusScreenHTML('closed', { id: 'end-inner', title: '토론이 종료되었습니다', subtitle: '참여해 주셔서 감사합니다', hiddenByDefault: false })}</div>

    <!-- DISCONNECTED -->
    <div id="disconnected-screen" class="hidden">${getStatusScreenHTML('disconnected', { id: 'disconnected-inner', hiddenByDefault: false })}</div>

  </div>
  ${getToastHTML()}
  <script>${getStudentFeedbackJS()}</script>

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
      var joinPendingTimer = null;

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

      function clearJoinPending() {
        if (joinPendingTimer) {
          clearTimeout(joinPendingTimer);
          joinPendingTimer = null;
        }
        if (joinBtn && window.spsSetPending) window.spsSetPending(joinBtn, false);
      }

      nameInput.addEventListener('input', function () {
        joinBtn.disabled = nameInput.value.trim().length === 0;
      });

      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!joinBtn.disabled) joinBtn.click();
        }
      });

      joinBtn.addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
          return;
        }
        myName = name;
        hasJoined = true;
        if (window.spsSetPending) window.spsSetPending(joinBtn, true, '입장 중...');
        sendJoin();
        joinPendingTimer = setTimeout(function () {
          clearJoinPending();
        }, 6000);
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
            btn.setAttribute('aria-pressed', 'true');
          } else {
            btn.classList.remove('selected');
            btn.setAttribute('aria-pressed', 'false');
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
        // 낙관 반영 전 연결 확인 — 화면과 교사 집계가 어긋나던 결함 보완
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
          return;
        }
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
        // 소켓이 닫혔을 때 입력만 비워지고 메시지가 유실되던 결함 — 안내 후 입력 보존
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 보내 주세요.');
          return;
        }
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
              clearJoinPending();
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
          clearJoinPending();
          if (window.spConnSetState) window.spConnSetState('disconnected');
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
          if (window.spConnSetState) window.spConnSetState('reconnecting');
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
