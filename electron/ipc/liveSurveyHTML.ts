function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateSurveyHTML(
  question: string,
  maxLength: number,
): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 설문</title>
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

    .survey-card {
      background: #1a2332;
      border: 1px solid #2a3548;
      border-radius: 16px;
      padding: 20px;
    }

    textarea {
      width: 100%;
      min-height: 120px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 12px;
      color: #e2e8f0;
      font-family: inherit;
      font-size: 16px;
      line-height: 1.6;
      padding: 12px 14px;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    textarea::placeholder {
      color: #94a3b8;
    }

    textarea:focus {
      border-color: #3b82f6;
    }

    textarea:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .char-counter {
      text-align: right;
      font-size: 13px;
      color: #94a3b8;
      margin-top: 6px;
      margin-bottom: 14px;
    }

    .char-counter.over {
      color: #ef4444;
    }

    .submit-btn {
      width: 100%;
      height: 52px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .submit-btn:active {
      transform: scale(0.97);
    }

    .submit-btn:disabled {
      opacity: 0.4;
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
      <div class="logo">📝 쌤핀 설문</div>
    </div>

    <div id="connecting">연결 중...</div>

    <div id="survey" hidden>
      <h1 id="question">${escapeHtml(question)}</h1>
      <div class="survey-card">
        <textarea id="answer" placeholder="답변을 입력하세요..." maxlength="${maxLength}"></textarea>
        <div class="char-counter"><span id="char-count">0</span>/${maxLength}자</div>
        <button class="submit-btn" id="submit-btn" disabled>답변 제출</button>
      </div>
    </div>

    <div id="submitted" class="state-view" hidden>
      <div class="check">✓</div>
      <h2>답변이 제출되었습니다!</h2>
      <p>감사합니다</p>
    </div>

    <div id="closed" class="state-view" hidden>
      <h2>설문이 종료되었습니다</h2>
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

      var hasSubmitted = false;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;
      var maxLength = ${maxLength};

      function show(id) {
        var ids = ['connecting', 'survey', 'submitted', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function disableForm() {
        var ta = document.getElementById('answer');
        var btn = document.getElementById('submit-btn');
        if (ta) ta.disabled = true;
        if (btn) btn.disabled = true;
      }

      function updateSubmitBtn() {
        if (hasSubmitted) return;
        var ta = document.getElementById('answer');
        var btn = document.getElementById('submit-btn');
        if (!ta || !btn) return;
        var trimmed = ta.value.trim();
        btn.disabled = trimmed.length === 0;
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
          if (hasSubmitted) {
            show('submitted');
          } else {
            show('survey');
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          if (msg.type === 'survey') {
            if (!hasSubmitted) {
              show('survey');
            }
          } else if (msg.type === 'submitted') {
            hasSubmitted = true;
            disableForm();
            show('submitted');
          } else if (msg.type === 'already_submitted') {
            hasSubmitted = true;
            disableForm();
            show('submitted');
          } else if (msg.type === 'closed') {
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          if (!hasSubmitted) {
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

      var answerEl = document.getElementById('answer');
      if (answerEl) {
        answerEl.addEventListener('input', function () {
          var val = answerEl.value;
          var len = val.length;
          var counter = document.getElementById('char-count');
          if (counter) {
            counter.textContent = String(len);
            var counterWrapper = counter.parentElement;
            if (counterWrapper) {
              if (len >= maxLength) {
                counterWrapper.classList.add('over');
              } else {
                counterWrapper.classList.remove('over');
              }
            }
          }
          updateSubmitBtn();
        });
      }

      var submitBtn = document.getElementById('submit-btn');
      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          if (hasSubmitted) return;
          var ta = document.getElementById('answer');
          if (!ta) return;
          var text = ta.value.trim();
          if (!text) return;

          disableForm();

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'submit', text: text, sessionToken: sessionToken }));
          }
        });
      }

      connect();
    })();
  </script>
</body>
</html>`;
}
