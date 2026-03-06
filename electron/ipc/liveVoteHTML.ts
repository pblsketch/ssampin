function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface VoteOption {
  id: string;
  text: string;
  color: string;
}

export function generateVotingHTML(
  question: string,
  options: VoteOption[],
): string {
  const pollData = JSON.stringify({ question, options });

  const optionButtons = options
    .map(
      (opt) =>
        `<button class="option-btn" data-id="${escapeHtml(opt.id)}" style="border-color:${escapeHtml(opt.color)}4d;background:${escapeHtml(opt.color)}1a;color:${escapeHtml(opt.color)}">${escapeHtml(opt.text)}</button>`,
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 투표</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      background: #0a0e17;
      color: #e2e8f0;
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

    #header {
      text-align: center;
      padding: 16px;
      color: #94a3b8;
      font-size: 14px;
    }

    .logo {
      font-size: 14px;
      color: #94a3b8;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      margin: 24px 0;
      color: #e2e8f0;
      line-height: 1.4;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #e2e8f0;
    }

    #options {
      display: flex;
      flex-direction: column;
    }

    .option-btn {
      width: 100%;
      min-height: 56px;
      padding: 16px 20px;
      border-radius: 16px;
      font-size: 18px;
      font-weight: 600;
      border: 2px solid;
      margin-bottom: 12px;
      cursor: pointer;
      transition: transform 0.1s ease, opacity 0.2s ease;
      text-align: left;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .option-btn:active {
      transform: scale(0.97);
    }

    .option-btn:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .state-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 60vh;
      gap: 12px;
    }

    #connecting {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      color: #94a3b8;
      font-size: 16px;
    }

    .check {
      font-size: 80px;
      animation: scaleIn 0.5s ease-out;
      line-height: 1;
    }

    p {
      color: #94a3b8;
      font-size: 15px;
    }

    @keyframes scaleIn {
      from { transform: scale(0); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div class="logo">📊 쌤핀 투표</div>
    </div>

    <div id="connecting">연결 중...</div>

    <div id="voting" hidden>
      <h1 id="question">${escapeHtml(question)}</h1>
      <div id="options">
      ${optionButtons}
      </div>
    </div>

    <div id="voted" class="state-view" hidden>
      <div class="check">✓</div>
      <h2>투표 완료!</h2>
      <p>감사합니다</p>
    </div>

    <div id="closed" class="state-view" hidden>
      <h2>투표가 종료되었습니다</h2>
    </div>

    <div id="disconnected" class="state-view" hidden>
      <h2>연결이 끊어졌습니다</h2>
      <p>다시 연결 중...</p>
    </div>
  </div>

  <script id="poll-data" type="application/json">${pollData}</script>

  <script>
    (function () {
      'use strict';

      var sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

      var hasVoted = false;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;

      function show(id) {
        var ids = ['connecting', 'voting', 'voted', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function disableButtons() {
        var btns = document.querySelectorAll('.option-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].disabled = true;
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
          ws.send(JSON.stringify({ type: 'join', sessionToken: sessionToken }));
          if (hasVoted) {
            show('voted');
          } else {
            show('voting');
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          if (msg.type === 'poll') {
            if (!hasVoted) {
              show('voting');
            }
          } else if (msg.type === 'voted') {
            hasVoted = true;
            disableButtons();
            show('voted');
          } else if (msg.type === 'already_voted') {
            hasVoted = true;
            disableButtons();
            show('voted');
          } else if (msg.type === 'closed') {
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          if (!hasVoted) {
            show('disconnected');
          }
          scheduleReconnect();
        };

        ws.onerror = function () {
          // onclose will also fire; handled there
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      document.getElementById('options').addEventListener('click', function (e) {
        var btn = e.target.closest('.option-btn');
        if (!btn || hasVoted) return;
        var optionId = btn.getAttribute('data-id');
        if (!optionId) return;

        disableButtons();

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'vote', optionId: optionId, sessionToken: sessionToken }));
        }
      });

      connect();
    })();
  </script>
</body>
</html>`;
}
