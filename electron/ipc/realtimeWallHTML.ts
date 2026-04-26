/**
 * 실시간 담벼락 학생 참여 — legacy vanilla HTML (fallback).
 *
 * v1.14 P1부터는 `dist-student/` React SPA가 기본 학생 뷰이며,
 * 이 함수가 반환하는 HTML은 dist-student 번들이 누락된 dev/예외 환경에서만
 * http 서버가 fallback으로 내려준다 (electron/ipc/realtimeWall.ts 참조).
 *
 * [패들렛 모드 정책 — Design §0.1 동일 뷰 원칙]
 * v1.14부터 학생도 다른 학생 카드를 볼 수 있다. 이는 학생 SPA가 처리하며,
 * 본 legacy HTML은 그 SPA가 로드되지 않는 환경에서만 쓰인다. 따라서 이 HTML의
 * 역할은 "닉네임+본문 1카드 제출" 최소 기능 유지로 축소된다. 이 HTML에 새
 * 기능을 추가할 필요는 없다 — 모든 신규 UX는 `src/student/` React entry에 구현.
 *
 * [부적절 콘텐츠 차단 원칙 유지]
 * 교사 승인 전(pending) 카드는 학생에게 노출되지 않는다. 이는 dist-student
 * SPA와 legacy HTML 모두 동일하게 지키며, 학생용 `WallBoardSnapshot` 빌더
 * (`src/usecases/realtimeWall/BroadcastWallState.ts`)가 status === 'approved'
 * 카드만 통과시켜 구조적으로 보장한다.
 *
 * 본 파일은 v1.14 이후에도 legacy fallback으로 유지되며, 기능 확장은 React
 * SPA 쪽에서만 이루어진다.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateRealtimeWallHTML(
  title: string,
  maxTextLength: number,
): string {
  const safeTitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>쌤핀 실시간 담벼락</title>
  <style>
    [hidden] { display: none !important; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(59,130,246,0.22), transparent 36%),
        linear-gradient(180deg, #0a0e17 0%, #121928 100%);
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    #app {
      width: 100%;
      max-width: 520px;
      padding: 28px 16px 80px;
    }

    /* ── 브랜드 헤더 ── */
    .brand {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      margin-bottom: 20px;
      color: #64748b;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .brand-pin {
      font-size: 15px;
      line-height: 1;
    }

    /* ── 히어로 ── */
    .hero {
      margin-bottom: 20px;
      text-align: center;
    }

    .hero-title {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 8px;
      color: #e2e8f0;
    }

    .hero-copy {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.65;
    }

    /* ── 카드 ── */
    .card {
      background: rgba(26,35,50,0.96);
      border: 1px solid #2a3548;
      border-radius: 20px;
      padding: 22px 20px;
      box-shadow:
        0 1px 0 rgba(255,255,255,0.04) inset,
        0 20px 60px rgba(0,0,0,0.32);
      animation: card-in 0.18s ease both;
    }

    @keyframes card-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── 필드 ── */
    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-bottom: 16px;
    }

    .label {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    input[type="text"],
    textarea {
      width: 100%;
      background: rgba(10,14,23,0.8);
      border: 1px solid #2a3548;
      border-radius: 12px;
      color: #e2e8f0;
      font-family: inherit;
      font-size: 16px;
      padding: 13px 14px;
      outline: none;
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
      -webkit-appearance: none;
    }

    input[type="text"]:focus,
    textarea:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.16);
    }

    input[type="text"]::placeholder,
    textarea::placeholder {
      color: #3d4f6a;
    }

    textarea {
      min-height: 140px;
      resize: vertical;
      line-height: 1.65;
    }

    /* 글자수 카운터 */
    .counter-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }

    .char-counter {
      font-size: 11px;
      color: #64748b;
      transition: color 0.2s ease;
    }

    .char-counter.warn { color: #f59e0b; }
    .char-counter.danger { color: #f87171; }

    /* 링크 에러 — 인라인 */
    .link-error {
      display: none;
      margin-top: 5px;
      color: #f87171;
      font-size: 12px;
      line-height: 1.4;
    }

    .link-error.visible { display: block; }

    /* 공통 에러 (서버 응답) */
    .error {
      min-height: 18px;
      color: #f87171;
      font-size: 12px;
      margin-bottom: 12px;
    }

    /* ── 제출 버튼 ── */
    .submit-btn {
      width: 100%;
      height: 52px;
      border: none;
      border-radius: 14px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition:
        transform 0.12s ease,
        opacity 0.22s ease,
        box-shadow 0.22s ease;
      -webkit-tap-highlight-color: transparent;
      box-shadow: none;
    }

    .submit-btn:not(:disabled) {
      box-shadow: 0 4px 20px rgba(59,130,246,0.35);
    }

    .submit-btn:active:not(:disabled) {
      transform: scale(0.98);
    }

    .submit-btn:disabled {
      opacity: 0.38;
      pointer-events: none;
    }

    /* ── 상태 뷰 (connecting / submitted / closed / disconnected) ── */
    .state-view {
      min-height: 62vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      text-align: center;
      padding: 0 8px;
      animation: card-in 0.22s ease both;
    }

    .state-icon {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .state-title {
      font-size: 22px;
      font-weight: 800;
      color: #e2e8f0;
      line-height: 1.3;
    }

    .state-copy {
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.65;
      max-width: 280px;
    }

    /* connecting 스피너 */
    .spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(59,130,246,0.18);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* submitted 체크 */
    .check-circle {
      width: 64px;
      height: 64px;
    }

    /* closed / disconnected 아이콘 opacity */
    .state-icon svg {
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="brand">
      <span class="brand-pin">🧷</span>
      쌤핀 실시간 담벼락
    </div>

    <!-- 연결 중 -->
    <div id="connecting" class="state-view">
      <div class="state-icon">
        <div class="spinner"></div>
      </div>
      <h1 class="state-title">잠깐, 게시판을 여는 중이에요</h1>
      <p class="state-copy">선생님 게시판에 연결하고 있어요.<br>금방 참여 화면이 나타날 거예요.</p>
    </div>

    <!-- 입력 폼 -->
    <div id="form-view" hidden>
      <div class="hero">
        <h1 class="hero-title">${safeTitle}</h1>
        <p class="hero-copy">이름과 생각을 남겨주세요.<br>링크가 있으면 함께 올려도 좋아요.</p>
      </div>

      <div class="card">
        <div class="field">
          <label for="nickname" class="label">이름 · 닉네임</label>
          <input id="nickname" type="text" maxlength="20" placeholder="나를 부를 이름을 알려주세요" autocomplete="off" />
        </div>

        <div class="field">
          <label for="text" class="label">내용</label>
          <textarea id="text" maxlength="${maxTextLength}" placeholder="수업 생각, 궁금한 점, 공유하고 싶은 것을 자유롭게 써주세요."></textarea>
          <div class="counter-row">
            <span id="char-counter" class="char-counter"><span id="char-count">0</span> / ${maxTextLength}</span>
          </div>
        </div>

        <div class="field">
          <label for="link" class="label">링크 <span style="font-weight:400;text-transform:none;letter-spacing:0;">(선택)</span></label>
          <input id="link" type="text" placeholder="https://" inputmode="url" autocomplete="off" />
          <span id="link-error" class="link-error">http 또는 https 주소만 입력할 수 있어요.</span>
        </div>

        <div id="error" class="error"></div>

        <button id="submit-btn" class="submit-btn" disabled>게시하기</button>
      </div>
    </div>

    <!-- 제출 완료 -->
    <div id="submitted" class="state-view" hidden>
      <div class="state-icon">
        <svg class="check-circle" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" fill="rgba(59,130,246,0.14)" stroke="#3b82f6" stroke-width="2"/>
          <path d="M20 32.5 L28.5 41 L44 24" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1 class="state-title">의견이 잘 전달됐어요!</h1>
      <p class="state-copy">선생님 게시판에 올라갔어요.<br>수업 시간에 같이 봐요.</p>
    </div>

    <!-- 게시판 종료 -->
    <div id="closed" class="state-view" hidden>
      <div class="state-icon">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" fill="rgba(148,163,184,0.08)" stroke="#2a3548" stroke-width="2"/>
          <path d="M22 32h20" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="state-title">게시판이 닫혔어요</h1>
      <p class="state-copy">선생님이 게시판을 종료했어요.<br>참여해줘서 고마워요.</p>
    </div>

    <!-- 연결 끊김 -->
    <div id="disconnected" class="state-view" hidden>
      <div class="state-icon">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" fill="rgba(59,130,246,0.06)" stroke="#2a3548" stroke-width="2"/>
          <path d="M20 38 Q32 22 44 38" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.4"/>
          <path d="M24 43 Q32 31 40 43" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7"/>
          <circle cx="32" cy="48" r="2.5" fill="#3b82f6"/>
          <line x1="18" y1="18" x2="46" y2="46" stroke="#f87171" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        </svg>
      </div>
      <h1 class="state-title">연결이 잠깐 끊어졌어요</h1>
      <p class="state-copy">자동으로 다시 연결하고 있어요.<br>잠시만 기다려주세요.</p>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      var storageKey = 'ssampin-realtime-wall-token';
      var sessionToken = '';
      try {
        sessionToken = sessionStorage.getItem(storageKey) || '';
      } catch (e) {}
      if (!sessionToken) {
        sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
        try {
          sessionStorage.setItem(storageKey, sessionToken);
        } catch (e) {}
      }

      var ws = null;
      var hasSubmitted = false;
      var reconnectTimer = null;
      var reconnectDelay = 1000;

      var nicknameEl = document.getElementById('nickname');
      var textEl = document.getElementById('text');
      var linkEl = document.getElementById('link');
      var errorEl = document.getElementById('error');
      var linkErrorEl = document.getElementById('link-error');
      var submitBtn = document.getElementById('submit-btn');
      var charCountEl = document.getElementById('char-count');
      var charCounterEl = document.getElementById('char-counter');

      var MAX_LEN = ${maxTextLength};

      function show(id) {
        var ids = ['connecting', 'form-view', 'submitted', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function setError(message) {
        if (errorEl) errorEl.textContent = message || '';
      }

      function setLinkError(visible) {
        if (!linkErrorEl) return;
        if (visible) {
          linkErrorEl.classList.add('visible');
        } else {
          linkErrorEl.classList.remove('visible');
        }
      }

      function validateLink(value) {
        var trimmed = value.trim();
        if (!trimmed) return true;
        try {
          var parsed = new URL(trimmed);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (e) {
          return false;
        }
      }

      function updateCharCounter() {
        if (!textEl || !charCountEl || !charCounterEl) return;
        var len = textEl.value.length;
        charCountEl.textContent = String(len);
        charCounterEl.classList.remove('warn', 'danger');
        if (len >= MAX_LEN) {
          charCounterEl.classList.add('danger');
        } else if (MAX_LEN > 0 && len / MAX_LEN >= 0.8) {
          charCounterEl.classList.add('warn');
        }
      }

      function updateSubmitState() {
        if (!nicknameEl || !textEl || !submitBtn) return;
        var nickname = nicknameEl.value.trim();
        var text = textEl.value.trim();
        var link = linkEl ? linkEl.value : '';
        var validLink = validateLink(link);
        setLinkError(!validLink);
        submitBtn.disabled = nickname.length === 0 || text.length === 0 || !validLink || hasSubmitted;
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
          if (hasSubmitted) {
            show('submitted');
          } else {
            show('form-view');
            updateSubmitState();
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          if (msg.type === 'wall') {
            if (!hasSubmitted) {
              show('form-view');
              updateSubmitState();
            }
          } else if (msg.type === 'submitted' || msg.type === 'already_submitted') {
            hasSubmitted = true;
            show('submitted');
          } else if (msg.type === 'closed') {
            show('closed');
          } else if (msg.type === 'error') {
            setError(typeof msg.message === 'string' ? msg.message : '입력값을 다시 확인해주세요.');
            updateSubmitState();
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
          // onclose에서 재연결 처리
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      if (textEl && charCountEl) {
        textEl.addEventListener('input', function () {
          updateCharCounter();
          updateSubmitState();
        });
      }

      if (nicknameEl) nicknameEl.addEventListener('input', updateSubmitState);
      if (linkEl) linkEl.addEventListener('input', updateSubmitState);

      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          if (hasSubmitted || !nicknameEl || !textEl) return;

          var nickname = nicknameEl.value.trim();
          var text = textEl.value.trim();
          var link = linkEl ? linkEl.value.trim() : '';
          if (!nickname || !text || !validateLink(link)) {
            updateSubmitState();
            return;
          }

          submitBtn.disabled = true;
          setError('');

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'submit',
              sessionToken: sessionToken,
              nickname: nickname,
              text: text,
              linkUrl: link
            }));
          }
        });
      }

      connect();
    })();
  </script>
</body>
</html>`;
}
