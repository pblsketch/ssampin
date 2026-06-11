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

export function generateSurveyHTML(question: string, maxLength: number): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  ${getStudentViewportMeta()}
  <title>쌤핀 설문</title>
  ${getStudentFontLinks()}
  <style>
    /* HTML hidden 속성이 display:flex CSS에 덮여 모든 상태가 동시 노출되던 버그 차단.
     * 다른 학생 페이지(liveVoteHTML, liveMultiSurveyHTML)와 동일한 패턴으로 정렬. */
    [hidden] { display: none !important; }
${getStudentBaseCSS()}
    /* ── 페이지 고유 ── */
    #header { text-align: center; padding-top: 4px; }
    #question { text-align: center; }

    textarea.sps-input {
      min-height: 120px;
      line-height: 1.6;
      resize: none; /* 모바일에서 무의미한 데스크톱 관습 제거 */
    }
    textarea.sps-input:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .char-counter {
      text-align: right;
      font-size: 13px;
      color: var(--sps-muted);
      margin-top: 6px;
      margin-bottom: 14px;
    }

    /* 글자수 한도 — 색 + 굵기 + 텍스트 보조 단서 (색각 이상 대응) */
    .char-counter.over {
      color: var(--sps-error);
      font-weight: 700;
    }
    .char-counter.over::after {
      content: ' (최대)';
    }
${getConnectionChipCSS()}
  </style>
</head>
<body class="sps-page">
  ${getConnectionChipHTML()}
  <script>${getConnectionChipJS({ submitButtonSelectors: ['#submit-btn'] })}</script>
  <div id="app" class="sps-app">
    <div id="header">
      <div class="sps-logo">쌤핀 설문</div>
    </div>

    ${getStatusScreenHTML('connecting', { id: 'connecting', hiddenByDefault: false })}

    <div id="survey" hidden>
      <h1 id="question" class="sps-title">${escapeHtml(question)}</h1>
      <div class="sps-card">
        <textarea id="answer" class="sps-input" placeholder="답변을 입력하세요..." maxlength="${maxLength}"></textarea>
        <div class="char-counter" aria-live="polite"><span id="char-count">0</span>/${maxLength}자</div>
        <button class="sps-btn" id="submit-btn" disabled>답변 제출</button>
      </div>
    </div>

    ${getStatusScreenHTML('done', { id: 'submitted', title: '답변이 제출되었습니다!', subtitle: '감사합니다' })}

    ${getStatusScreenHTML('closed', { id: 'closed', title: '설문이 종료되었습니다' })}

    ${getStatusScreenHTML('disconnected', { id: 'disconnected' })}
  </div>
  ${getToastHTML()}
  <script>${getStudentFeedbackJS()}</script>

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
      var pendingTimer = null;

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

      function enableForm() {
        var ta = document.getElementById('answer');
        if (ta) ta.disabled = false;
        updateSubmitBtn();
      }

      function clearPending() {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        var btn = document.getElementById('submit-btn');
        if (btn && window.spsSetPending) window.spsSetPending(btn, false);
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
            clearPending();
            disableForm();
            show('submitted');
          } else if (msg.type === 'already_submitted') {
            hasSubmitted = true;
            clearPending();
            disableForm();
            show('submitted');
          } else if (msg.type === 'closed') {
            clearPending();
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          clearPending();
          if (window.spConnSetState) window.spConnSetState('disconnected');
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
          if (window.spConnSetState) window.spConnSetState('reconnecting');
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

          // WS 미연결 — placeholder 교체는 글을 쓴 학생에게 보이지 않으므로
          // 토스트로 안내 (2026-06-12 감사 주관식 ⑤)
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
            return;
          }

          disableForm();
          if (window.spsSetPending) window.spsSetPending(submitBtn, true, '전송 중...');
          ws.send(JSON.stringify({ type: 'submit', text: text, sessionToken: sessionToken }));

          // 서버 ack(submitted) 6초 무응답 시 복구
          pendingTimer = setTimeout(function () {
            clearPending();
            if (!hasSubmitted) {
              enableForm();
              if (window.spsToast) window.spsToast('답변이 확인되지 않았어요. 다시 시도해 주세요.');
            }
          }, 6000);
        });
      }

      connect();
    })();
  </script>
</body>
</html>`;
}
