function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateWordCloudHTML(
  question: string,
  maxSubmissions: number,
): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 워드클라우드</title>
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

    h1 {
      font-size: 22px;
      font-weight: 700;
      text-align: center;
      margin: 20px 0;
      color: #e2e8f0;
      line-height: 1.4;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #e2e8f0;
    }

    .input-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .word-input {
      flex: 1;
      min-height: 48px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 16px;
      border: 2px solid #2a3548;
      background: #131a2b;
      color: #e2e8f0;
      outline: none;
      transition: border-color 0.2s;
    }

    .word-input:focus {
      border-color: #3b82f6;
    }

    .word-input::placeholder {
      color: #64748b;
    }

    .submit-btn {
      min-width: 72px;
      min-height: 48px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      background: #3b82f6;
      color: #fff;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .submit-btn:active {
      transform: scale(0.95);
    }

    .submit-btn:disabled {
      background: #1e293b;
      color: #475569;
      pointer-events: none;
    }

    .remaining {
      text-align: center;
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .submitted-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 12px;
    }

    .submitted-word {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 20px;
      background: #1e293b;
      color: #94a3b8;
      font-size: 14px;
      animation: fadeIn 0.3s ease-out;
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

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div>☁️ 쌤핀 워드클라우드</div>
    </div>

    <div id="connecting">연결 중...</div>

    <div id="ready" hidden>
      <h1 id="question">${escapeHtml(question)}</h1>
      <div class="input-row">
        <input type="text" id="wordInput" class="word-input" placeholder="단어를 입력하세요" autocomplete="off">
        <button id="submitBtn" class="submit-btn">보내기</button>
      </div>
      <div id="remaining" class="remaining">남은 횟수: ${maxSubmissions}/${maxSubmissions}</div>
      <div id="submittedList" class="submitted-list"></div>
    </div>

    <div id="limit" class="state-view" hidden>
      <div class="check">✓</div>
      <h2>제출 완료!</h2>
      <p>모든 단어를 제출했습니다</p>
      <div id="limitList" class="submitted-list"></div>
    </div>

    <div id="closed" class="state-view" hidden>
      <h2>워드클라우드가 종료되었습니다</h2>
    </div>

    <div id="disconnected" class="state-view" hidden>
      <h2>연결이 끊어졌습니다</h2>
      <p>다시 연결 중...</p>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      var sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

      var maxSubs = ${maxSubmissions};
      var remaining = maxSubs;
      var submittedWords = [];
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;

      function show(id) {
        var ids = ['connecting', 'ready', 'limit', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function updateRemaining() {
        var el = document.getElementById('remaining');
        if (el) el.textContent = '남은 횟수: ' + remaining + '/' + maxSubs;
      }

      function addSubmittedWord(word) {
        submittedWords.push(word);
        renderSubmittedWords('submittedList');
        renderSubmittedWords('limitList');
      }

      function renderSubmittedWords(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (var i = 0; i < submittedWords.length; i++) {
          var span = document.createElement('span');
          span.className = 'submitted-word';
          span.textContent = submittedWords[i];
          container.appendChild(span);
        }
      }

      function connect() {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        try {
          ws = new WebSocket('ws://' + location.host);
        } catch (e) {
          scheduleReconnect();
          return;
        }

        ws.onopen = function () {
          reconnectDelay = 1000;
          ws.send(JSON.stringify({ type: 'join', sessionToken: sessionToken }));
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          if (msg.type === 'ready') {
            remaining = msg.remaining;
            updateRemaining();
            if (remaining <= 0) {
              show('limit');
            } else {
              show('ready');
              document.getElementById('wordInput').focus();
            }
          } else if (msg.type === 'word_accepted') {
            remaining = msg.remaining;
            updateRemaining();
            addSubmittedWord(msg.word);
            var input = document.getElementById('wordInput');
            input.value = '';
            input.focus();
            if (remaining <= 0) {
              show('limit');
            }
          } else if (msg.type === 'limit_reached') {
            remaining = 0;
            updateRemaining();
            show('limit');
          } else if (msg.type === 'invalid') {
            // 유효하지 않은 입력 → 입력 필드에 포커스 유지
          } else if (msg.type === 'closed') {
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          if (remaining > 0) {
            show('disconnected');
          }
          scheduleReconnect();
        };

        ws.onerror = function () {
          // onclose에서 처리
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      function submitWord() {
        var input = document.getElementById('wordInput');
        var word = input.value.trim();
        if (!word) return;
        if (remaining <= 0) return;

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'submit_word', word: word, sessionToken: sessionToken }));
        }
      }

      document.getElementById('submitBtn').addEventListener('click', submitWord);

      document.getElementById('wordInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitWord();
        }
      });

      connect();
    })();
  </script>
</body>
</html>`;
}
