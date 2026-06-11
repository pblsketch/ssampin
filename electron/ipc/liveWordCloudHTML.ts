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

export function generateWordCloudHTML(question: string, maxSubmissions: number): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  ${getStudentViewportMeta()}
  <title>쌤핀 워드클라우드</title>
  ${getStudentFontLinks()}
  <style>
    /* HTML hidden 속성이 display:flex CSS에 덮여 모든 상태가 동시 노출되던 버그 차단.
     * 다른 학생 페이지(liveVoteHTML, liveMultiSurveyHTML)와 동일한 패턴으로 정렬. */
    [hidden] { display: none !important; }
${getStudentBaseCSS()}
    /* ── 페이지 고유 ── */
    #header { text-align: center; padding-top: 4px; }
    #question { text-align: center; }

    .input-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .input-row .sps-input { min-height: 52px; }
    .input-row .sps-btn { width: auto; min-width: 92px; flex: none; }

    /* invalid 응답 — 흔들림 + 토스트 (색 외 단서, 2026-06-12 감사 워드클라우드 ⑤) */
    .input-row.shake { animation: sps-shake 0.4s ease; }
    @keyframes sps-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }

    /* ── 남은 횟수 — 텍스트 + 도트 시각화 ── */
    .remaining {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--sps-muted);
      font-size: 14px;
      margin-bottom: 16px;
    }
    .remaining-dots { display: inline-flex; gap: 5px; }
    .remaining-dots .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 1px solid var(--sps-border);
      background: transparent;
    }
    .remaining-dots .dot.used {
      border-color: var(--sps-highlight);
      background: var(--sps-highlight);
    }

    /* ── 제출 단어 칩 — 차분한 틴트 4색 순환 (도구 성격에 맞는 다채로움) ── */
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
      border-radius: 999px;
      border: 1px solid var(--sps-border);
      font-size: 14px;
      font-weight: 600;
      animation: sps-chip-in 0.3s ease-out;
    }
    .submitted-word.c0 { background: rgba(59, 130, 246, 0.14); color: #93c5fd; border-color: rgba(59, 130, 246, 0.35); }
    .submitted-word.c1 { background: rgba(245, 158, 11, 0.14); color: #fcd34d; border-color: rgba(245, 158, 11, 0.35); }
    .submitted-word.c2 { background: rgba(52, 211, 153, 0.14); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.35); }
    .submitted-word.c3 { background: rgba(167, 139, 250, 0.14); color: #c4b5fd; border-color: rgba(167, 139, 250, 0.35); }

    @keyframes sps-chip-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .input-row.shake { animation: none; }
      .submitted-word { animation: none; }
    }
${getConnectionChipCSS()}
  </style>
</head>
<body class="sps-page">
  ${getConnectionChipHTML()}
  <script>${getConnectionChipJS({ submitButtonSelectors: ['#submitBtn'] })}</script>
  <div id="app" class="sps-app">
    <div id="header">
      <div class="sps-logo">쌤핀 워드클라우드</div>
    </div>

    ${getStatusScreenHTML('connecting', { id: 'connecting', hiddenByDefault: false })}

    <div id="ready" hidden>
      <h1 id="question" class="sps-title">${escapeHtml(question)}</h1>
      <div class="input-row" id="inputRow">
        <input type="text" id="wordInput" class="sps-input" placeholder="단어를 입력하세요"
          autocomplete="off" autocapitalize="off" enterkeyhint="send">
        <button id="submitBtn" class="sps-btn">보내기</button>
      </div>
      <div id="remaining" class="remaining" aria-live="polite">
        <span id="remainingText">남은 횟수: ${maxSubmissions}/${maxSubmissions}</span>
        <span id="remainingDots" class="remaining-dots" aria-hidden="true"></span>
      </div>
      <div id="submittedList" class="submitted-list"></div>
    </div>

    ${getStatusScreenHTML('done', {
      id: 'limit',
      title: '제출 완료!',
      subtitle: '모든 단어를 제출했습니다',
      extraHTML: '<div id="limitList" class="submitted-list"></div>',
    })}

    ${getStatusScreenHTML('closed', { id: 'closed', title: '워드클라우드가 종료되었습니다' })}

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

      var maxSubs = ${maxSubmissions};
      var remaining = maxSubs;
      var submittedWords = [];
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;
      var awaitingAck = false;
      var ackTimer = null;

      function show(id) {
        var ids = ['connecting', 'ready', 'limit', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function updateRemaining() {
        var text = document.getElementById('remainingText');
        if (text) text.textContent = '남은 횟수: ' + remaining + '/' + maxSubs;
        var dots = document.getElementById('remainingDots');
        if (dots) {
          dots.innerHTML = '';
          for (var i = 0; i < maxSubs; i++) {
            var dot = document.createElement('span');
            dot.className = i < maxSubs - remaining ? 'dot used' : 'dot';
            dots.appendChild(dot);
          }
        }
      }

      function clearAwaitingAck() {
        awaitingAck = false;
        if (ackTimer) {
          clearTimeout(ackTimer);
          ackTimer = null;
        }
        var btn = document.getElementById('submitBtn');
        if (btn && window.spsSetPending) window.spsSetPending(btn, false);
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
          span.className = 'submitted-word c' + (i % 4);
          span.textContent = submittedWords[i];
          container.appendChild(span);
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
            clearAwaitingAck();
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
            clearAwaitingAck();
            remaining = 0;
            updateRemaining();
            show('limit');
          } else if (msg.type === 'invalid') {
            // 무반응이던 구간 — 흔들림 + 토스트로 사유 안내 (2026-06-12 감사)
            clearAwaitingAck();
            var row = document.getElementById('inputRow');
            if (row) {
              row.classList.remove('shake');
              void row.offsetWidth; /* reflow로 애니메이션 재시작 */
              row.classList.add('shake');
            }
            if (window.spsToast) window.spsToast('이 단어는 보낼 수 없어요. 다른 단어를 입력해 보세요.');
            var wi = document.getElementById('wordInput');
            if (wi) wi.focus();
          } else if (msg.type === 'closed') {
            clearAwaitingAck();
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          clearAwaitingAck();
          if (window.spConnSetState) window.spConnSetState('disconnected');
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
          if (window.spConnSetState) window.spConnSetState('reconnecting');
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      function submitWord() {
        var input = document.getElementById('wordInput');
        var word = input.value.trim();
        if (!word) return;
        if (remaining <= 0) return;
        if (awaitingAck) return; /* 연타 중복 전송 차단 */

        // WS 미연결 — placeholder 교체 대신 토스트 안내
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
          return;
        }

        awaitingAck = true;
        var btn = document.getElementById('submitBtn');
        if (btn && window.spsSetPending) window.spsSetPending(btn, true);
        ws.send(JSON.stringify({ type: 'submit_word', word: word, sessionToken: sessionToken }));

        // 서버 ack 6초 무응답 시 복구
        ackTimer = setTimeout(function () {
          clearAwaitingAck();
          if (window.spsToast) window.spsToast('전송이 확인되지 않았어요. 다시 시도해 주세요.');
        }, 6000);
      }

      document.getElementById('submitBtn').addEventListener('click', submitWord);

      document.getElementById('wordInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitWord();
        }
      });

      updateRemaining();
      connect();
    })();
  </script>
</body>
</html>`;
}
