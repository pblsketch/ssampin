/**
 * 학생 페이지(live*HTML.ts / discussion*HTML.ts) 공용 chrome.
 *
 * 라이브 도구 학생 페이지(워드클라우드·주관식·객관식·복합·가치수직선·신호등)가
 * 공유하는 UI 부속을 한 곳에서 관리한다:
 *   1) 연결 상태 칩 (sp-conn-*) — realtime-tool-student-page-health
 *   2) MultiSurvey v2 디자인 토큰 (--color-*, DN-10 SSOT) — 다른 세션 영역, 수정 금지
 *   3) 학생 페이지 공용 셸 (--sps-* / .sps-*) — student-pages-design-refactor
 * 새 라이브 도구를 추가할 때도 이 모듈을 통해야 회귀 메타테스트가 통과한다.
 *
 * 회귀 가드:
 *   - REGRESSION #22: getConnectionChipHTML 의 sp-conn-chip 구조 +
 *     role="status" + aria-live="polite" 패턴이 사라지면 빌드가 실패한다.
 *   - REGRESSION #47: --sps-accent 토큰 정의 + viewport 줌 허용(user-scalable=no 부재)이
 *     사라지면 빌드가 실패한다.
 *
 * Design: docs/02-design/features/realtime-tool-student-page-health.design.md
 *       + docs/01-plan/features/student-pages-design-refactor.plan.md
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

// ─────────────────────────────────────────────────────────────────────
// 디자인 토큰 — Phase B 학생 페이지 정적 HTML 주입 (DN-10)
// ─────────────────────────────────────────────────────────────────────

/**
 * 학생 페이지가 사용하는 sp-* / --color-* CSS 변수 기본값.
 *
 * 학생 페이지 React 컴포넌트는 `var(--color-xxx, #fallback)` 패턴으로
 * 토큰을 참조한다. 정적 HTML 컨텍스트에서 토큰 주입이 누락되더라도
 * fallback HEX 가 동작하도록 이중 안전장치 (DN-10 예외 허용).
 *
 * @example
 *   const tokenStyle = injectDesignTokens();
 *   const html = `<html><head>${tokenStyle}</head>...`;
 */
export function getDesignTokenDefaults(): Record<string, string> {
  return {
    '--color-bg': '#0a0e17',
    '--color-card': '#1a1f2e',
    '--color-text': '#e2e8f0',
    '--color-muted': '#94a3b8',
    '--color-accent': '#60a5fa',
    '--color-highlight': '#fbbf24',
    '--color-border': '#334155',
    '--sp-radius-md': '12px',
    '--sp-shadow-card': '0 2px 8px rgba(0,0,0,0.08)',
    '--sp-duration-base': '200ms',
    '--sp-ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  };
}

/**
 * 학생 페이지 `<head>` 에 inline 으로 삽입할 `<style>:root { ... }</style>` 문자열.
 * 컴포넌트 className 의 sp-* 토큰과 그 fallback HEX 가 모두 정의된다.
 */
export function injectDesignTokens(): string {
  const defaults = getDesignTokenDefaults();
  const rules = Object.entries(defaults)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `<style>:root {\n${rules}\n}</style>`;
}

// ─────────────────────────────────────────────────────────────────────
// 학생 페이지 공용 셸 (sps-*) — student-pages-design-refactor Phase 1
// ─────────────────────────────────────────────────────────────────────
//
// 6개 라이브 도구 학생 페이지(객관식·주관식·복합·워드클라우드·가치수직선·신호등)가
// 공유하는 디자인 토대. 페이지별로 표류하던 폰트/색/radius/상태 화면을 한 곳으로 수렴.
//
// ⚠️ 네임스페이스 분리 원칙:
//   - 위의 `--color-*` 토큰(getDesignTokenDefaults)은 MultiSurvey v2 학생 컴포넌트의
//     SSOT(DN-10) — 다른 세션 영역이므로 절대 수정하지 않는다.
//   - 본 셸은 `--sps-*` 변수와 `.sps-` 클래스만 사용한다 (sp-conn-* 칩과도 독립).
//   - 두 파랑(#3b82f6 vs #60a5fa)의 최종 합치는 복합 설문 v2 조율 시점에 결정
//     (plan D3, docs/01-plan/features/student-pages-design-refactor.plan.md).
//
// 회귀 가드 (REGRESSION #47): --sps-accent / --sps-radius 정의와
// viewport 의 줌 허용(user-scalable=no 부재)이 사라지면 빌드가 실패한다.

/**
 * 학생 페이지 표준 viewport 메타.
 *
 * `user-scalable=no` / `maximum-scale` 을 의도적으로 넣지 않는다 — 저시력 학생의
 * 핀치 줌을 막으면 WCAG 1.4.4 위반 (2026-06-12 디자인 감사 F4).
 * `viewport-fit=cover` 로 노치 기기 safe-area 변수(env())를 활성화한다.
 */
export function getStudentViewportMeta(): string {
  return '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">';
}

/**
 * 브랜드 폰트(Pretendard) CDN 링크 — `<head>` 에 삽입.
 *
 * 학생 페이지는 교사 PC LAN 서빙이라 폰트 동봉이 비현실적(한글 MB급).
 * CDN 실패 시 font-display: swap + 시스템 폴백으로 현재와 동일하게 동작 — 악화 없음.
 * (plan D2 결정, 2026-06-12)
 */
export function getStudentFontLinks(): string {
  return `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">`;
}

/**
 * 공용 베이스 CSS — 각 학생 페이지 `<style>` 최상단에 inline.
 *
 * 포함: --sps-* 토큰(:root), reset, 타이포, 로고(앰버 핀 점), 카드/버튼/입력,
 * focus-visible 링, [hidden] 가드, 상태 화면 4종, 완료 SVG 체크, 토스트,
 * 전송 중(data-pending) 스피너, prefers-reduced-motion 대응.
 *
 * 페이지 자체 CSS 와의 충돌을 막기 위해 전부 `.sps-` prefix / `--sps-` 변수만 사용.
 */
export function getStudentBaseCSS(): string {
  return `
    /* ── sps 토큰 (plan D1/D4: accent #3b82f6 · card #1a2332 · 카드 12px/컨트롤 8px) ── */
    :root {
      --sps-bg: #0a0e17;
      --sps-card: #1a2332;
      --sps-border: #2a3548;
      --sps-text: #e2e8f0;
      --sps-muted: #94a3b8;
      --sps-accent: #3b82f6;
      --sps-accent-press: #2563eb;
      --sps-highlight: #f59e0b;
      --sps-error: #ef4444;
      --sps-success: #34d399;
      --sps-radius-card: 12px;
      --sps-radius-control: 8px;
      --sps-font: 'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system,
        BlinkMacSystemFont, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    }

    /* ── reset + 타이포 ── */
    .sps-page, .sps-page * { margin: 0; padding: 0; box-sizing: border-box; }
    .sps-page {
      font-family: var(--sps-font);
      background: var(--sps-bg);
      color: var(--sps-text);
      -webkit-text-size-adjust: 100%;
      word-break: keep-all;
      line-height: 1.5;
      -webkit-tap-highlight-color: transparent;
    }
    [hidden] { display: none !important; }

    /* ── 앱 컨테이너 — 모바일 단일 컬럼 + safe-area ── */
    .sps-app {
      max-width: 480px;
      margin: 0 auto;
      padding: calc(env(safe-area-inset-top, 0px) + 20px) 16px
        calc(env(safe-area-inset-bottom, 0px) + 24px);
      min-height: 100vh;
      min-height: 100dvh;
    }

    /* ── 로고 — 앰버 핀 점(쌤핀=핀을 꽂다) ── */
    .sps-logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
      color: var(--sps-muted);
      letter-spacing: -0.01em;
      margin-bottom: 20px;
    }
    .sps-logo::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sps-highlight);
      flex: none;
    }

    /* ── 질문 타이틀 ── */
    .sps-title {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: -0.01em;
      margin-bottom: 24px;
      color: var(--sps-text);
    }

    /* ── 카드 ── */
    .sps-card {
      background: var(--sps-card);
      border: 1px solid var(--sps-border);
      border-radius: var(--sps-radius-card);
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    /* ── 주 버튼 ── */
    .sps-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 52px;
      padding: 12px 20px;
      border: none;
      border-radius: var(--sps-radius-control);
      background: var(--sps-accent);
      color: #ffffff;
      font-family: inherit;
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      touch-action: manipulation;
      transition: background-color 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
    }
    .sps-btn:active { transform: scale(0.97); background: var(--sps-accent-press); }
    .sps-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .sps-btn--ghost {
      background: transparent;
      border: 1px solid var(--sps-border);
      color: var(--sps-text);
    }
    .sps-btn--ghost:active { background: rgba(148, 163, 184, 0.08); }

    /* ── 전송 중 — data-pending ── */
    .sps-btn[data-pending="true"] { pointer-events: none; opacity: 0.75; }
    .sps-btn[data-pending="true"]::after {
      content: '';
      width: 16px;
      height: 16px;
      flex: none;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #ffffff;
      animation: sps-spin 0.8s linear infinite;
    }

    /* ── 입력 ── */
    .sps-input {
      width: 100%;
      min-height: 48px;
      padding: 12px 14px;
      background: var(--sps-bg);
      border: 1px solid var(--sps-border);
      border-radius: var(--sps-radius-control);
      color: var(--sps-text);
      font-family: inherit;
      font-size: 16px; /* iOS focus 자동 줌 방지 하한 */
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .sps-input::placeholder { color: var(--sps-muted); }
    .sps-input:focus {
      outline: none;
      border-color: var(--sps-accent);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    /* ── 키보드 포커스 링 (WCAG 2.4.7) ── */
    .sps-page :focus-visible {
      outline: 2px solid var(--sps-accent);
      outline-offset: 2px;
    }

    /* ── 상태 화면 4종 공용 ── */
    .sps-screen {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
      padding: 24px 16px;
      animation: sps-fade-up 0.4s ease-out;
    }
    .sps-screen-title { font-size: 20px; font-weight: 700; color: var(--sps-text); }
    .sps-screen-subtitle { font-size: 14px; color: var(--sps-muted); }

    /* ── 스피너 ── */
    .sps-spinner {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid var(--sps-border);
      border-top-color: var(--sps-accent);
      animation: sps-spin 0.9s linear infinite;
    }

    /* ── 완료 체크 — 앰버 틴트 원판 + 선이 그려지는 SVG (네온/글로우 아님) ── */
    .sps-done-halo {
      width: 104px;
      height: 104px;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .sps-done-check-circle {
      stroke-dasharray: 158;
      stroke-dashoffset: 158;
      animation: sps-draw 0.5s ease-out forwards;
    }
    .sps-done-check-mark {
      stroke-dasharray: 36;
      stroke-dashoffset: 36;
      animation: sps-draw 0.35s ease-out 0.4s forwards;
    }

    /* ── 토스트 — 하단 중앙 pill, aria-live ── */
    .sps-toast {
      position: fixed;
      left: 50%;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
      transform: translateX(-50%) translateY(8px);
      z-index: 1100;
      max-width: min(90vw, 420px);
      padding: 10px 18px;
      border-radius: 999px;
      background: rgba(19, 26, 43, 0.95);
      border: 1px solid var(--sps-border);
      color: var(--sps-text);
      font-size: 14px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .sps-toast[data-open="true"] {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    @keyframes sps-spin { to { transform: rotate(360deg); } }
    @keyframes sps-draw { to { stroke-dashoffset: 0; } }
    @keyframes sps-fade-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sps-screen { animation: none; }
      .sps-done-check-circle, .sps-done-check-mark {
        animation: none;
        stroke-dashoffset: 0;
      }
      .sps-btn, .sps-toast { transition: none; }
    }
  `;
}

/** 상태 화면 종류 — 6개 학생 페이지가 공유하는 4가지 상태 */
export type StudentStatusScreenKind = 'connecting' | 'disconnected' | 'closed' | 'done';

export interface StudentStatusScreenOptions {
  /** DOM id — 기존 페이지의 show() 라우팅과 맞추기 위해 재정의 가능 */
  readonly id?: string;
  readonly title?: string;
  readonly subtitle?: string;
  /** 추가 콘텐츠(제출 요약 등) — 호출부가 escape 책임 */
  readonly extraHTML?: string;
  /** 기본 true — 페이지 show() 가 hidden 토글로 단일 노출 */
  readonly hiddenByDefault?: boolean;
}

const STATUS_SCREEN_DEFAULTS: Record<
  StudentStatusScreenKind,
  { id: string; title: string; subtitle: string }
> = {
  connecting: { id: 'sps-connecting', title: '연결 중...', subtitle: '잠시만 기다려 주세요' },
  disconnected: {
    id: 'sps-disconnected',
    title: '연결이 끊어졌습니다',
    subtitle: '다시 연결하는 중이에요. 화면을 그대로 두세요.',
  },
  closed: { id: 'sps-closed', title: '종료되었습니다', subtitle: '참여해 주셔서 감사합니다' },
  done: { id: 'sps-done', title: '제출 완료!', subtitle: '감사합니다' },
};

function escapeStatusText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 완료 체크 SVG — stroke 가 그려지는 애니메이션 (CSS 는 getStudentBaseCSS) */
function getDoneCheckSVG(): string {
  return `<div class="sps-done-halo"><svg viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
    <circle class="sps-done-check-circle" cx="28" cy="28" r="25" fill="none" stroke="var(--sps-accent)" stroke-width="3"/>
    <path class="sps-done-check-mark" fill="none" stroke="var(--sps-accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M17 29l8 8 14-16"/>
  </svg></div>`;
}

/**
 * 표준 상태 화면 HTML — 연결 중(스피너)/끊김(스피너+pulse 칩 연동)/마감/완료(SVG 체크).
 *
 * 각 페이지의 기존 `show(id)` 라우팅에 끼우도록 컨테이너 + hidden 속성만 제공한다.
 * 화면 전환 알림은 컨테이너의 role="status" 가 담당 (스크린리더 대응).
 */
export function getStatusScreenHTML(
  kind: StudentStatusScreenKind,
  options: StudentStatusScreenOptions = {},
): string {
  const defaults = STATUS_SCREEN_DEFAULTS[kind];
  const id = options.id ?? defaults.id;
  const title = escapeStatusText(options.title ?? defaults.title);
  const subtitle = escapeStatusText(options.subtitle ?? defaults.subtitle);
  const hiddenAttr = (options.hiddenByDefault ?? true) ? ' hidden' : '';
  const visual =
    kind === 'done'
      ? getDoneCheckSVG()
      : kind === 'closed'
        ? ''
        : '<div class="sps-spinner" aria-hidden="true"></div>';
  const extra = options.extraHTML ?? '';
  return `<div id="${id}" class="sps-screen" role="status"${hiddenAttr}>
    ${visual}
    <h2 class="sps-screen-title">${title}</h2>
    <p class="sps-screen-subtitle">${subtitle}</p>
    ${extra}
  </div>`;
}

/** 토스트 컨테이너 HTML — `<body>` 끝에 1회 삽입 */
export function getToastHTML(): string {
  return '<div class="sps-toast" id="spsToast" role="status" aria-live="polite"></div>';
}

/**
 * 공용 피드백 JS — 토스트 + 전송 중 버튼 상태. ES5, IIFE.
 *
 * 전역 노출:
 * - `window.spsToast(message, durationMs?)` — 하단 토스트 (WS 미연결 탭, invalid 응답 안내)
 * - `window.spsSetPending(elOrSelector, pending, pendingText?)` — 버튼 "전송 중…" 표시/복원
 */
export function getStudentFeedbackJS(): string {
  return `
    (function () {
      'use strict';
      var toastTimer = null;

      window.spsToast = function (message, durationMs) {
        var toast = document.getElementById('spsToast');
        if (!toast) return;
        toast.textContent = message;
        toast.setAttribute('data-open', 'true');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
          toast.removeAttribute('data-open');
        }, durationMs || 2600);
      };

      window.spsSetPending = function (elOrSelector, pending, pendingText) {
        var el = typeof elOrSelector === 'string'
          ? document.querySelector(elOrSelector)
          : elOrSelector;
        if (!el) return;
        if (pending) {
          if (pendingText && !el.getAttribute('data-sps-label')) {
            el.setAttribute('data-sps-label', el.textContent || '');
            el.textContent = pendingText;
          }
          el.setAttribute('data-pending', 'true');
          el.disabled = true;
        } else {
          var original = el.getAttribute('data-sps-label');
          if (original !== null) {
            el.textContent = original;
            el.removeAttribute('data-sps-label');
          }
          el.removeAttribute('data-pending');
          el.disabled = false;
        }
      };
    })();
  `;
}

/**
 * 셸 일괄 번들 — Phase 2 에서 각 페이지가 head/style/body 에 나눠 삽입.
 *
 * @example
 *   const shell = getStudentShellBundle();
 *   `<head>${shell.viewportMeta}${shell.fontLinks}<style>${shell.baseCSS}...</style></head>
 *    <body>...${shell.toastHTML}<script>${shell.feedbackJS}</script></body>`
 */
export function getStudentShellBundle(): {
  viewportMeta: string;
  fontLinks: string;
  baseCSS: string;
  toastHTML: string;
  feedbackJS: string;
} {
  return {
    viewportMeta: getStudentViewportMeta(),
    fontLinks: getStudentFontLinks(),
    baseCSS: getStudentBaseCSS(),
    toastHTML: getToastHTML(),
    feedbackJS: getStudentFeedbackJS(),
  };
}
