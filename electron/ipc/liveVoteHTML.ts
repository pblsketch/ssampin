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

interface VoteOption {
  id: string;
  text: string;
  color: string;
}

/**
 * 교사 지정 색의 상대 휘도(0~1). `#rrggbb` 외 형식은 null.
 * 어두운 색(휘도 낮음)을 다크 배경 위 텍스트로 쓰면 읽을 수 없으므로
 * 버튼 스타일 보정(getOptionStyle)에 사용한다 — 2026-06-12 디자인 감사 객관식 ③.
 */
function relativeLuminance(hexColor: string): number | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor.trim());
  if (!match || match[1] === undefined) return null;
  const hex = match[1];
  const channel = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * 선택지 버튼 인라인 스타일 — 교사 지정 색 기반 + 대비 자동 보정.
 *
 * - 밝은 색: 기존 패턴(테두리 30% / 배경 10% 알파 / 원색 텍스트) — 다크 배경에서 가독 OK
 * - 어두운 색(휘도 < 0.25): 원색을 면(배경 45% 알파)으로 쓰고 텍스트는 흰색으로 전환
 * - 형식 오류: sps 토큰 폴백
 */
function getOptionStyle(color: string): string {
  const luminance = relativeLuminance(color);
  if (luminance === null) {
    return 'border-color:var(--sps-border);background:var(--sps-card);color:var(--sps-text)';
  }
  const safe = escapeHtml(color);
  if (luminance < 0.25) {
    return `border-color:${safe};background:${safe}73;color:#ffffff`;
  }
  return `border-color:${safe}4d;background:${safe}1a;color:${safe}`;
}

export function generateVotingHTML(question: string, options: VoteOption[]): string {
  const pollData = JSON.stringify({ question, options });

  const optionButtons = options
    .map(
      (opt) =>
        `<button class="option-btn" data-id="${escapeHtml(opt.id)}" style="${getOptionStyle(opt.color)}">${escapeHtml(opt.text)}</button>`,
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  ${getStudentViewportMeta()}
  <title>쌤핀 투표</title>
  ${getStudentFontLinks()}
  <style>
    [hidden] { display: none !important; }
${getStudentBaseCSS()}
    /* ── 페이지 고유 ── */
    #header { text-align: center; padding-top: 4px; }
    #question { text-align: center; }

    #options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .option-btn {
      width: 100%;
      min-height: 56px;
      padding: 16px 20px;
      border-radius: var(--sps-radius-card);
      font-family: inherit;
      font-size: 18px;
      font-weight: 600;
      border: 2px solid;
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

    /* 전송 중 — 탭한 선택지에 스피너 (sps-btn 패턴과 동일) */
    .option-btn[data-pending="true"] {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      opacity: 0.85;
    }
    .option-btn[data-pending="true"]::after {
      content: '';
      width: 14px;
      height: 14px;
      flex: none;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-top-color: transparent;
      animation: sps-spin 0.8s linear infinite;
    }
${getConnectionChipCSS()}
  </style>
</head>
<body class="sps-page">
  ${getConnectionChipHTML()}
  <script>${getConnectionChipJS({ submitButtonSelectors: ['.option-btn'] })}</script>
  <div id="app" class="sps-app">
    <div id="header">
      <div class="sps-logo">쌤핀 투표</div>
    </div>

    ${getStatusScreenHTML('connecting', { id: 'connecting', hiddenByDefault: false })}

    <div id="voting" hidden>
      <h1 id="question" class="sps-title">${escapeHtml(question)}</h1>
      <div id="options">
      ${optionButtons}
      </div>
    </div>

    ${getStatusScreenHTML('done', { id: 'voted', title: '투표 완료!', subtitle: '감사합니다' })}

    ${getStatusScreenHTML('closed', { id: 'closed', title: '투표가 종료되었습니다' })}

    ${getStatusScreenHTML('disconnected', { id: 'disconnected' })}
  </div>
  ${getToastHTML()}
  <script>${getStudentFeedbackJS()}</script>

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
      var pendingBtn = null;
      var pendingTimer = null;

      function show(id) {
        var ids = ['connecting', 'voting', 'voted', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
      }

      function setButtonsDisabled(disabled) {
        var btns = document.querySelectorAll('.option-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].disabled = disabled;
        }
      }

      function clearPending() {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        if (pendingBtn) {
          if (window.spsSetPending) window.spsSetPending(pendingBtn, false);
          pendingBtn = null;
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
            clearPending();
            setButtonsDisabled(true);
            show('voted');
          } else if (msg.type === 'already_voted') {
            hasVoted = true;
            clearPending();
            setButtonsDisabled(true);
            show('voted');
          } else if (msg.type === 'closed') {
            clearPending();
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          clearPending();
          if (window.spConnSetState) window.spConnSetState('disconnected');
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
          if (window.spConnSetState) window.spConnSetState('reconnecting');
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      document.getElementById('options').addEventListener('click', function (e) {
        var btn = e.target.closest('.option-btn');
        if (!btn || hasVoted) return;
        var optionId = btn.getAttribute('data-id');
        if (!optionId) return;

        // WS 미연결 — silent no-op 대신 토스트로 안내 (2026-06-12 감사 F5)
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (window.spsToast) window.spsToast('연결을 확인하는 중이에요. 잠시 후 다시 눌러 주세요.');
          return;
        }

        setButtonsDisabled(true);
        pendingBtn = btn;
        if (window.spsSetPending) window.spsSetPending(btn, true);
        ws.send(JSON.stringify({ type: 'vote', optionId: optionId, sessionToken: sessionToken }));

        // 서버 ack(voted) 6초 무응답 시 복구 — 학생이 멈춘 화면에 갇히지 않게
        pendingTimer = setTimeout(function () {
          clearPending();
          if (!hasVoted) {
            setButtonsDisabled(false);
            if (window.spsToast) window.spsToast('응답이 확인되지 않았어요. 다시 시도해 주세요.');
          }
        }, 6000);
      });

      connect();
    })();
  </script>
</body>
</html>`;
}
