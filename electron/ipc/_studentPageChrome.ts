/**
 * 학생 페이지(live*HTML.ts) 공용 chrome.
 *
 * 4개 학생 페이지(워드클라우드·주관식·객관식·복합)가 공유하는
 * UI 부속(연결 상태 칩 등)을 한 곳에서 관리한다.
 * 새 라이브 도구를 추가할 때도 이 모듈을 통해야 회귀 메타테스트가 통과한다.
 *
 * 회귀 가드 (REGRESSION #22): getConnectionChipHTML 의 sp-conn-chip 구조 +
 * role="status" + aria-live="polite" 패턴이 사라지면 빌드가 실패한다.
 *
 * Design: docs/02-design/features/realtime-tool-student-page-health.design.md
 */

/** 연결 상태 칩 CSS — 각 학생 페이지 `<style>` 안에 inline */
export function getConnectionChipCSS(): string {
  return `
    /* ── 연결 상태 칩 — 우상단 fixed (sp-conn-chip) ───────────────────── */
    .sp-conn-chip {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 1000;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      background: rgba(19, 26, 43, 0.85);
      border: 1px solid #2a3548;
      color: #e2e8f0;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      user-select: none;
      pointer-events: none;
      transition: border-color 0.2s, color 0.2s;
    }
    .sp-conn-chip::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .sp-conn-chip[data-state="connecting"]   { color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); }
    .sp-conn-chip[data-state="connected"]    { color: #34d399; border-color: rgba(52, 211, 153, 0.4); }
    .sp-conn-chip[data-state="disconnected"] { color: #f87171; border-color: rgba(248, 113, 113, 0.5); }
    .sp-conn-chip[data-state="reconnecting"] { color: #fb923c; border-color: rgba(251, 146, 60, 0.4); }
    .sp-conn-chip[data-state="disconnected"]::before,
    .sp-conn-chip[data-state="reconnecting"]::before {
      animation: sp-conn-pulse 1.2s ease-in-out infinite;
    }
    @keyframes sp-conn-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.3; }
    }
    @supports (top: env(safe-area-inset-top)) {
      .sp-conn-chip { top: calc(env(safe-area-inset-top, 0px) + 8px); }
    }
    /* 보내기/선택 버튼 — WS 미연결 시 dim + 클릭 차단 */
    [data-ws-blocked="true"] {
      opacity: 0.4 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
    }
  `;
}

/** 연결 상태 칩 HTML — 각 학생 페이지 `<body>` 최상단에 inline */
export function getConnectionChipHTML(): string {
  // REGRESSION #22 보호 패턴: sp-conn-chip + role="status" + aria-live="polite"
  return `<div class="sp-conn-chip"
       data-state="connecting"
       role="status"
       aria-live="polite"
       aria-label="서버 연결 상태"
       id="spConnChip">
    <span class="sp-conn-chip-label">연결 중...</span>
  </div>`;
}

/**
 * 연결 상태 칩 JS — 각 학생 페이지에서 IIFE 보다 먼저 별도 `<script>` 로 삽입.
 * 전역 `window.spConnSetState(state)` 를 노출한다.
 *
 * @param config.submitButtonSelectors — WS 미연결 시 disable 할 버튼 셀렉터 배열
 */
export function getConnectionChipJS(config: { submitButtonSelectors: readonly string[] }): string {
  const selectorsJson = JSON.stringify(config.submitButtonSelectors);
  return `
    (function () {
      'use strict';
      var STATE_LABELS = {
        connecting:   '연결 중...',
        connected:    '연결됨',
        disconnected: '연결 끊김',
        reconnecting: '재연결 중...'
      };
      var SUBMIT_SELECTORS = ${selectorsJson};
      var currentState = 'connecting';

      function setState(state) {
        if (state === currentState) return;
        if (!STATE_LABELS[state]) return;
        currentState = state;
        var chip = document.getElementById('spConnChip');
        if (chip) {
          chip.setAttribute('data-state', state);
          var label = chip.querySelector('.sp-conn-chip-label');
          if (label) label.textContent = STATE_LABELS[state];
        }
        var blocked = state !== 'connected';
        for (var i = 0; i < SUBMIT_SELECTORS.length; i++) {
          var btns = document.querySelectorAll(SUBMIT_SELECTORS[i]);
          for (var j = 0; j < btns.length; j++) {
            if (blocked) btns[j].setAttribute('data-ws-blocked', 'true');
            else btns[j].removeAttribute('data-ws-blocked');
          }
        }
      }

      window.spConnSetState = setState;
    })();
  `;
}

/**
 * 칩과 JS 를 한 번에 주입하는 헬퍼 — CSS는 `<style>` 안, HTML+JS 는 `<body>` 시작 직후.
 * (참고용 — 각 live*HTML.ts 는 보통 위 3 함수를 개별 호출)
 */
export function getConnectionChipBundle(config: { submitButtonSelectors: readonly string[] }): {
  css: string;
  html: string;
  js: string;
} {
  return {
    css: getConnectionChipCSS(),
    html: getConnectionChipHTML(),
    js: getConnectionChipJS(config),
  };
}
