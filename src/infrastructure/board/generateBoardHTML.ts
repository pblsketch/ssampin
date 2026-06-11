/**
 * generateBoardHTML — 학생 브라우저가 받을 단일 HTML을 문자열로 생성
 *
 * 기존 쌤도구(liveMultiSurveyHTML.ts 등)와 동일한 인라인 HTML 패턴.
 * Excalidraw·React·Y.js는 esm.sh CDN에서 로드 — spike s1에서 검증.
 */
import type { BoardAuthToken } from '@domain/valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '@domain/valueObjects/BoardSessionCode';
import type { BoardId } from '@domain/valueObjects/BoardId';

import {
  EXCALIDRAW_VERSION,
  REACT_VERSION,
  YJS_VERSION,
  Y_WEBSOCKET_VERSION,
  Y_EXCALIDRAW_VERSION,
  FRACTIONAL_INDEXING_VERSION,
} from './constants';

export interface GenerateBoardHtmlInput {
  /** WebsocketProvider roomName = 서버 docName 일치용. `bd-xxx` 형태 */
  readonly boardId: BoardId;
  readonly boardName: string;
  readonly authToken: BoardAuthToken;
  readonly sessionCode: BoardSessionCode;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsString(s: string): string {
  return JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function generateBoardHTML(input: GenerateBoardHtmlInput): string {
  const { boardId, boardName, authToken, sessionCode } = input;
  const title = `쌤핀 협업 보드 — ${escapeHtml(boardName)}`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>${title}</title>
  <style>
    html, body, #app { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif; }
    body { background: #f8fafc; }
    #app { height: 100vh; position: relative; }
    #status {
      position: fixed; top: 10px; right: 10px; z-index: 9999;
      background: rgba(15, 23, 42, 0.9); color: #e2e8f0;
      padding: 6px 12px; border-radius: 999px; font-size: 12px;
    }
    #status .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    #status.connected .dot { background: #22c55e; }
    #status.disconnected .dot { background: #ef4444; }
    #status.connecting .dot { background: #f59e0b; }
    #join-modal, #error-overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85);
      display: flex; align-items: center; justify-content: center; z-index: 10000;
      backdrop-filter: blur(6px);
    }
    /* iter #4: [hidden] attribute가 display:flex를 이기도록 강제.
       그렇지 않으면 에러 오버레이가 페이지 로드 순간부터 표시되어 이름 입력 모달을 덮는다. */
    #join-modal[hidden], #error-overlay[hidden] { display: none !important; }
    .modal-card {
      background: #ffffff; border-radius: 16px; padding: 28px 24px;
      width: min(360px, 92vw); box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal-card h1 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
    .modal-card p { margin: 0 0 16px; font-size: 13px; color: #475569; }
    .modal-card input {
      width: 100%; padding: 12px 14px; font-size: 16px;
      border: 2px solid #e2e8f0; border-radius: 10px; outline: none;
      box-sizing: border-box;
    }
    .modal-card input:focus { border-color: #3b82f6; }
    .modal-card button {
      width: 100%; margin-top: 12px; padding: 12px; font-size: 15px;
      background: #3b82f6; color: #fff; border: 0; border-radius: 10px; cursor: pointer;
      font-weight: 600;
    }
    .modal-card .error { color: #dc2626; font-size: 12px; margin-top: 8px; min-height: 16px; }
    #error-overlay .modal-card h1 { color: #dc2626; }
    /* 팜 리젝션: 브라우저 기본 스크롤·줌 제스처 차단 (pointer 이벤트는 JS에서 필터) */
    canvas { touch-action: none; }
    .error-card {
      background: #ffffff; border-radius: 16px; padding: 32px 28px;
      width: min(380px, 92vw); box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      text-align: center;
    }
    .error-title { font-size: 20px; font-weight: 700; color: #dc2626; margin-bottom: 10px; }
    .error-body { font-size: 14px; color: #1e293b; margin-bottom: 8px; line-height: 1.5; }
    .error-hint { font-size: 12px; color: #94a3b8; line-height: 1.5; }

    /* PDCA-1/2: board toolbar — 스티커 5색 + 도형 9 native + 3 시각 동등(plan AC-2.2).
       스티커 = text 도구 + finalize 시 포스트잇 변환, 도형 = 도구형/스탬프형 분기 (script 참조).
       위치: 우측 상단 고정. 좌측(12px)에 두면 Excalidraw 의 메뉴 드롭다운·속성 패널
       (불투명도/레이어 island)과 겹쳐 뒤 창을 가린다 — 사용자 신고 2026-06-11.
       Excalidraw 우측은 상단 toolbar 가운데 정렬이라 비어 있음. 접기 버튼으로 폭 좁은
       화면(모바일)에서도 캔버스를 가리지 않게 한다. */
    #board-toolbar {
      position: fixed; top: 64px; right: 12px; z-index: 9990;
      background: rgba(255, 255, 255, 0.97);
      border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      display: flex; flex-direction: column; gap: 10px;
      user-select: none;
      font-family: inherit;
      max-height: calc(100vh - 140px);
      overflow-y: auto;
    }
    #board-toolbar[hidden] { display: none !important; }
    /* 접기 토글 헤더 — 접힌 상태에선 이 버튼만 남는다 */
    #board-toolbar .toolbar-collapse {
      width: 100%; height: 28px; border: 0; background: transparent;
      cursor: pointer; padding: 0 4px;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      font-size: 12px; font-weight: 700; color: #475569; font-family: inherit;
    }
    #board-toolbar .toolbar-collapse:hover { color: #1d4ed8; }
    #board-toolbar .toolbar-collapse .chev { font-size: 11px; color: #94a3b8; }
    #board-toolbar.collapsed { gap: 0; }
    #board-toolbar.collapsed .tool-section { display: none; }
    #board-toolbar .tool-section { display: flex; flex-direction: column; gap: 4px; }
    #board-toolbar .section-label { font-size: 10px; color: #64748b; text-align: center; font-weight: 600; }
    #board-toolbar .swatch-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
    #board-toolbar .swatch { width: 28px; height: 28px; border: 2px solid transparent; border-radius: 8px; cursor: pointer; padding: 0; }
    #board-toolbar .swatch:hover { border-color: #94a3b8; }
    #board-toolbar .swatch[aria-pressed="true"] { border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
    #board-toolbar .shape-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    #board-toolbar .shape-btn { width: 28px; height: 28px; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #475569; padding: 0; }
    #board-toolbar .shape-btn:hover { background: #f1f5f9; }
    #board-toolbar .shape-btn[aria-pressed="true"] { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
    /* PDCA-1 Step 1.3: snap-to-grid 토글 — toolbar 하단 단일 가로 버튼. */
    #board-toolbar .grid-toggle { width: 100%; height: 28px; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 6px; cursor: pointer; font-size: 11px; color: #475569; padding: 0 6px; display: flex; align-items: center; justify-content: center; gap: 4px; }
    #board-toolbar .grid-toggle:hover { background: #f1f5f9; }
    #board-toolbar .grid-toggle[aria-pressed="true"] { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
    #board-toolbar .grid-toggle .grid-dot { font-size: 14px; line-height: 1; }

    /* PDCA-1 Step 1.4 (AC-1.4): 권한 거부 toast — boardRules.canEditElement === false 시 표시.
       바닥 중앙, 자동 페이드 아웃 (2.5초). 학생이 다른 학생 sticker 를 끌려 하거나 템플릿을 만지면 안내.
       z-index #status(9999) 보다 낮추고 #join-modal(10000) 보다도 낮음 — 모달 위에 뜨면 안 됨. */
    #board-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      z-index: 9980;
      background: rgba(15, 23, 42, 0.92); color: #fff;
      padding: 10px 18px; border-radius: 999px;
      font-size: 13px; font-weight: 500;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      pointer-events: none;
      opacity: 0; transition: opacity 0.2s ease-out;
      max-width: 90vw; text-align: center;
    }
    #board-toast.visible { opacity: 1; }
  </style>

  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@${REACT_VERSION}",
      "react/jsx-runtime": "https://esm.sh/react@${REACT_VERSION}/jsx-runtime",
      "react-dom": "https://esm.sh/react-dom@${REACT_VERSION}?external=react",
      "react-dom/client": "https://esm.sh/react-dom@${REACT_VERSION}/client?external=react",
      "yjs": "https://esm.sh/yjs@${YJS_VERSION}",
      "fractional-indexing": "https://esm.sh/fractional-indexing@${FRACTIONAL_INDEXING_VERSION}",
      "@excalidraw/excalidraw": "https://esm.sh/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}?external=react,react-dom",
      "y-websocket": "https://esm.sh/y-websocket@${Y_WEBSOCKET_VERSION}?external=yjs",
      "y-excalidraw": "https://esm.sh/y-excalidraw@${Y_EXCALIDRAW_VERSION}?external=@excalidraw/excalidraw,yjs,fractional-indexing"
    }
  }
  </script>
</head>
<body>
  <div id="status" class="connecting"><span class="dot"></span><span id="status-text">연결 중…</span></div>

  <div id="join-modal">
    <div class="modal-card">
      <h1>이름 입력</h1>
      <p>${escapeHtml(boardName)}에 참여하려면 이름을 입력해주세요.</p>
      <input id="name-input" type="text" placeholder="예: 김민수" maxlength="12" autofocus />
      <div class="error" id="name-error"></div>
      <button id="join-btn">입장하기</button>
    </div>
  </div>

  <div id="error-overlay" hidden>
    <div class="error-card">
      <div class="error-title" id="error-title">연결 오류</div>
      <div class="error-body" id="error-body"></div>
      <div class="error-hint" id="error-hint"></div>
    </div>
  </div>

  <div id="app"></div>

  <!-- PDCA-1 Step 1.4 (AC-1.4): 권한 거부 toast. JS 에서 showToast(text) 호출 시 2.5초 페이드. -->
  <div id="board-toast" role="status" aria-live="polite"></div>

  <!-- PDCA-1/2: 우측 board toolbar — 스티커 5색 + 도형 12종 + 격자 토글 (전부 활성, 접기 가능). -->
  <div id="board-toolbar" hidden aria-label="협업 보드 도구">
    <button type="button" class="toolbar-collapse" data-toolbar-collapse aria-expanded="true" title="도구 모음 접기/펼치기">
      <span>🧰 도구</span>
      <span class="chev" aria-hidden="true">▲</span>
    </button>
    <div class="tool-section">
      <div class="section-label">스티커</div>
      <div class="swatch-row">
        <button type="button" class="swatch" data-color="yellow" aria-label="노란 스티커 추가" title="노란 스티커 추가 — 클릭하면 화면 가운데에 생겨요" aria-pressed="false" style="background:#FEF3C7"></button>
        <button type="button" class="swatch" data-color="pink" aria-label="분홍 스티커 추가" title="분홍 스티커 추가 — 클릭하면 화면 가운데에 생겨요" aria-pressed="false" style="background:#FCE7F3"></button>
        <button type="button" class="swatch" data-color="blue" aria-label="파란 스티커 추가" title="파란 스티커 추가 — 클릭하면 화면 가운데에 생겨요" aria-pressed="false" style="background:#DBEAFE"></button>
        <button type="button" class="swatch" data-color="green" aria-label="초록 스티커 추가" title="초록 스티커 추가 — 클릭하면 화면 가운데에 생겨요" aria-pressed="false" style="background:#D1FAE5"></button>
        <button type="button" class="swatch" data-color="purple" aria-label="보라 스티커 추가" title="보라 스티커 추가 — 클릭하면 화면 가운데에 생겨요" aria-pressed="false" style="background:#EDE9FE"></button>
      </div>
    </div>
    <div class="tool-section">
      <div class="section-label">도형</div>
      <div class="shape-row">
        <button type="button" class="shape-btn" data-shape="line" aria-label="직선" aria-pressed="false" title="직선">—</button>
        <button type="button" class="shape-btn" data-shape="arrow" aria-label="화살표" aria-pressed="false" title="화살표">→</button>
        <button type="button" class="shape-btn" data-shape="rect" aria-label="사각형" aria-pressed="false" title="사각형">▭</button>
        <button type="button" class="shape-btn" data-shape="rounded-rect" aria-label="둥근 사각형" aria-pressed="false" title="둥근 사각형">▢</button>
        <button type="button" class="shape-btn" data-shape="ellipse" aria-label="원" aria-pressed="false" title="원">○</button>
        <button type="button" class="shape-btn" data-shape="triangle" aria-label="삼각형" aria-pressed="false" title="삼각형">△</button>
        <button type="button" class="shape-btn" data-shape="diamond" aria-label="마름모" aria-pressed="false" title="마름모">◇</button>
        <button type="button" class="shape-btn" data-shape="right-arrow" aria-label="오른쪽 화살표" aria-pressed="false" title="오른쪽 화살표">⇒</button>
        <button type="button" class="shape-btn" data-shape="text-box" aria-label="텍스트" aria-pressed="false" title="텍스트">T</button>
        <button type="button" class="shape-btn" data-shape="pentagon-equiv" aria-label="오각형(육각 대체)" aria-pressed="false" title="오각 → 정육각 (시각 동등 매핑)">⬡</button>
        <button type="button" class="shape-btn" data-shape="elbow-arrow-equiv" aria-label="꺾인 화살표(직선 결합)" aria-pressed="false" title="꺾인 화살표 → 직선 결합 (시각 동등)">⤵</button>
        <button type="button" class="shape-btn" data-shape="bidirectional-equiv" aria-label="양방향(양 끝 화살표)" aria-pressed="false" title="양방향 → 양 끝 화살표 (시각 동등)">⇔</button>
      </div>
    </div>
    <!-- PDCA-1 Step 1.3: snap-to-grid 토글 (Excalidraw gridSize 20 ↔ null) -->
    <div class="tool-section">
      <div class="section-label">격자</div>
      <button type="button" class="grid-toggle" data-grid-toggle aria-pressed="true" title="20px 격자 켜기/끄기 — 스티커가 격자에 자동 정렬">
        <span class="grid-dot" aria-hidden="true">⊞</span>
        <span>20px</span>
      </button>
    </div>
  </div>

  <script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import ExcalidrawLib from '@excalidraw/excalidraw';
    const { Excalidraw, convertToExcalidrawElements } = ExcalidrawLib;
    import * as Y from 'yjs';
    import { WebsocketProvider } from 'y-websocket';
    import { ExcalidrawBinding, yjsToExcalidraw } from 'y-excalidraw';

    const AUTH_TOKEN   = ${jsString(authToken)};
    const SESSION_CODE = ${jsString(sessionCode)};
    const BOARD_ID     = ${jsString(String(boardId))};
    const BOARD_NAME   = ${jsString(boardName)};

    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const setStatus = (cls, text) => { statusEl.className = cls; statusText.textContent = text; };

    // PDCA-1 Step 1.4 (AC-1.4): inline toast — boardRules.canEditElement === false 시 호출.
    // 같은 메시지 연속 호출 시 timer reset (사용자가 계속 드래그하면 2.5초 연장).
    let toastTimer = null;
    function showToast(text) {
      const t = document.getElementById('board-toast');
      if (!t) return;
      t.textContent = text;
      t.classList.add('visible');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.classList.remove('visible'); toastTimer = null; }, 2500);
    }

    const showCloseError = (code) => {
      const overlay = document.getElementById('error-overlay');
      if (!overlay) return;
      const titleEl = document.getElementById('error-title');
      const bodyEl  = document.getElementById('error-body');
      const hintEl  = document.getElementById('error-hint');
      if (!titleEl || !bodyEl || !hintEl) return;
      overlay.hidden = false;
      switch (code) {
        case 1008:
          titleEl.textContent = '입장 정보가 맞지 않습니다';
          bodyEl.textContent  = '세션 코드나 이름이 올바르지 않습니다.';
          hintEl.textContent  = '선생님께 새 QR 코드를 받아 다시 접속해주세요.';
          break;
        case 1013:
          titleEl.textContent = '접속 인원이 가득 찼습니다';
          bodyEl.textContent  = '이 보드는 최대 50명까지 접속할 수 있어요.';
          hintEl.textContent  = '다른 학생이 나간 뒤 다시 시도해주세요.';
          break;
        case 1000:
          titleEl.textContent = '수업이 종료되었어요';
          bodyEl.textContent  = '선생님이 보드를 마쳤습니다.';
          hintEl.textContent  = '다음 수업 때 다시 만나요!';
          break;
        case 1006:
          titleEl.textContent = '비정상 연결 종료';
          bodyEl.textContent  = 'Wi-Fi가 갑자기 끊기거나 서버 오류가 발생했어요.';
          hintEl.textContent  = '잠시 후 다시 시도해주세요.';
          break;
        default:
          titleEl.textContent = '연결이 끊어졌어요';
          bodyEl.textContent  = 'Wi-Fi 또는 인터넷을 확인해주세요.';
          hintEl.textContent  = '5초 뒤 자동으로 다시 연결을 시도합니다.';
          break;
      }
    };

    const joinModal = document.getElementById('join-modal');
    const nameInput = document.getElementById('name-input');
    const nameError = document.getElementById('name-error');
    const joinBtn = document.getElementById('join-btn');

    function sanitize(raw) {
      const trimmed = raw.trim().slice(0, 12);
      if (trimmed.length === 0) return null;
      if (/^[\\s\\u200B-\\u200D]+$/.test(trimmed)) return null;
      return trimmed;
    }

    joinBtn.addEventListener('click', () => {
      const name = sanitize(nameInput.value);
      if (!name) { nameError.textContent = '이름을 입력해주세요.'; return; }
      nameError.textContent = '';
      joinModal.hidden = true;
      startBoard(name);
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

    // 교사 입장 (PDCA 리팩토링 2026-06-11): ?role=teacher 쿼리 → 이름 입력 없이 즉시 입장.
    // 교사는 모든 요소 편집 가능 (선택 차단 가드 미적용).
    // 신뢰 경계: 클라이언트 신뢰 — Plan ADR Consequences. 폐쇄 교실 환경(교사 PC + 학생 브라우저)
    // 전제로 URL 파라미터 권한을 수용한다. Y.Doc 프로토콜 레벨 보호는 비목표.
    const IS_TEACHER = new URLSearchParams(location.search).get('role') === 'teacher';
    if (IS_TEACHER) {
      joinModal.hidden = true;
      startBoard('선생님');
    }

    function startBoard(userName) {
      const ydoc = new Y.Doc();
      const yElements = ydoc.getArray('elements');
      const yAssets = ydoc.getMap('assets');

      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      // R-6 (iter #2): y-websocket은 serverUrl + "/" + roomname + "?" + encodedParams
      // 방식으로 URL을 조립한다. serverUrl에 쿼리를 직접 넣으면
      // "wss://host/?t=X&code=Y/bd-xxx" 형태가 되어 code 값에 "/bd-xxx"가 섞여
      // 서버 검증 실패(1008). 반드시 params 옵션으로 전달해야 올바른
      // "wss://host/bd-xxx?t=X&code=Y"가 된다.
      const wsUrl = \`\${wsProto}://\${location.host}\`;
      const provider = new WebsocketProvider(wsUrl, BOARD_ID, ydoc, {
        params: { t: AUTH_TOKEN, code: SESSION_CODE },
      });

      provider.on('status', (ev) => {
        console.log('[board] status:', ev.status);
        if (ev.status === 'connected') setStatus('connected', '연결됨');
        else if (ev.status === 'disconnected') setStatus('disconnected', '연결 끊김 — 재연결 시도 중…');
        else setStatus('connecting', '연결 중…');
      });
      provider.on('connection-close', (ev) => {
        console.warn('[board] connection-close:', ev && ev.code, ev && ev.reason);
        showCloseError(ev?.code || 1006);
      });
      provider.on('connection-error', (ev) => {
        console.error('[board] connection-error:', ev);
      });

      provider.awareness.setLocalStateField('user', {
        name: userName,
        color: '#3b82f6',
        colorLight: '#3b82f655',
      });

      // ────────────────────────────────────────────────────────────────────
      // PDCA-1/2 리팩토링 (2026-06-11): "되돌리기(revert) 가드" → "선택 차단 가드"
      //
      // 이전 구현은 onChange 마다 직전 스냅샷(lastSnapshot)과 비교해 남의 요소
      // 변경을 revert 했다. 그러나 Excalidraw onChange 는 **원격(다른 학생) 변경이
      // ExcalidrawBinding 으로 반영될 때도** 발생하므로, 학생 A 가 자기 메모를
      // 움직이면 학생 B 클라이언트가 "남의 요소 mutation" 으로 오판해 revert →
      // Y.Doc 재전파 → 서로 되돌리는 sync war + toast 도배가 발생했다
      // (2인 이상 접속 시 협업 자체가 불능 — "잘 안되는" 근본 원인 1).
      //
      // 새 구조: Excalidraw 에서 요소를 이동/수정/삭제하려면 반드시 먼저 **선택**해야
      // 한다는 점을 이용해 선택 단계에서 차단한다. selectedElementIds 는 로컬
      // appState 라 Y.Doc 으로 전파되지 않으므로 원격 변경과 충돌할 수 없다.
      // 판정 predicate 는 boardRules.canEditElement 와 동기 (inline 복제 — string template).
      // 잔여 한계(주석으로 명시): 지우개 도구(E)는 선택 없이 삭제 가능 — 폐쇄 교실
      // 신뢰 모델(Plan ADR)에서 수용, PDCA-5 권한 단계에서 재검토.
      // ────────────────────────────────────────────────────────────────────
      // PDCA-1 Step 1.2: hex 값은 src/index.css 의 --sp-board-sticky-* 토큰과 hex 동기.
      // 학생 페이지는 inline HTML 이라 CSS 변수 직접 사용 어려움 — 두 곳 동시 갱신 필요.
      const STICKER_COLORS = {
        yellow: '#FEF3C7', // --sp-board-sticky-yellow
        pink: '#FCE7F3', // --sp-board-sticky-pink
        blue: '#DBEAFE', // --sp-board-sticky-blue
        green: '#D1FAE5', // --sp-board-sticky-green
        purple: '#EDE9FE', // --sp-board-sticky-purple
      };
      let currentExcalidrawAPI = null;
      let activeShapeKey = null; // 도구형 도형 버튼 (line/arrow/...) 활성 키
      let stickerStampCount = 0; // 연속 추가 시 계단식 offset 용
      // 한 번이라도 화면에 존재했던 요소 id — "신규 요소" 판정용.
      // 원격 신규 요소도 즉시 등록되므로 내 작성자 id 로 잘못 태깅되지 않는다.
      const knownElementIds = new Set();
      const myAwarenessId = String(provider.awareness.clientID);
      const MY_ROLE = IS_TEACHER ? 'teacher' : 'student';
      // boardRules.canEditElement 의 inline 복제. 변경 시 양쪽 동기 필수.
      function canEditElementInline(elementAuthorAwarenessId, currentAwarenessId, role) {
        if (!currentAwarenessId || currentAwarenessId.length === 0) return false;
        if (role === 'teacher') return true;
        if (!elementAuthorAwarenessId) return false;
        return elementAuthorAwarenessId === currentAwarenessId;
      }

      function randomVersionNonce() {
        return Math.floor(Math.random() * 0x7fffffff);
      }

      // 작성자 customData — 모든 신규 로컬 요소에 부여 (근본 원인 2 해소:
      // 이전엔 스티커에만 부여되어 학생이 그린 일반 도형/텍스트를 본인조차
      // 다시 수정할 수 없었다. author 없음 → canEditElement false → 잠김).
      function authorCustomData(userName, extra) {
        return Object.assign({
          authorAwarenessId: myAwarenessId,
          authorName: userName,
          createdAtIso: new Date().toISOString(),
        }, extra || {});
      }

      // 스티커 메모 생성 방식 (2026-06-11 2차 수정):
      // 처음엔 "색 선택 → text 도구 → 입력 완료 시 포스트잇 변환" 4단계 모드였는데,
      // (a) 색을 눌러도 화면에 즉각 변화가 없어 "안 된다"로 보이고
      // (b) Excalidraw 가 텍스트 편집 중 activeTool 을 되돌리면 모드가 풀리는
      // 허점이 있었다 (사용자 신고: 스티커가 만들어지지 않음).
      // → 도형 스탬프와 동일하게 **클릭 즉시 화면 중앙에 생성**으로 단순화.
      // 생성 후 더블클릭으로 내용 편집 (Excalidraw 기본 bound text 편집).
      function stampSticker(colorKey, userName) {
        if (!currentExcalidrawAPI) return;
        if (typeof convertToExcalidrawElements !== 'function') {
          showToast('이 브라우저에서는 스티커를 추가할 수 없어요');
          return;
        }
        const colorHex = STICKER_COLORS[colorKey] || '#FEF3C7';
        const appState = currentExcalidrawAPI.getAppState();
        const z = appState.zoom && appState.zoom.value ? appState.zoom.value : 1;
        const cx = appState.width / (2 * z) - appState.scrollX;
        const cy = appState.height / (2 * z) - appState.scrollY;
        // 연속 추가 시 겹쳐서 안 보이는 일이 없도록 계단식 offset
        const offset = (stickerStampCount % 6) * 22;
        stickerStampCount += 1;
        let converted;
        try {
          converted = convertToExcalidrawElements([{
            type: 'rectangle',
            x: cx - 90 + offset,
            y: cy - 55 + offset,
            width: 180,
            height: 110,
            backgroundColor: colorHex,
            fillStyle: 'solid',
            strokeColor: '#94a3b8',
            strokeWidth: 1,
            label: {
              text: '⭐ ' + userName + '\\n메모를 입력하세요',
              fontSize: 16,
              textAlign: 'left',
              verticalAlign: 'top',
            },
          }]);
        } catch (err) {
          console.warn('[board] 스티커 생성 실패:', err);
          showToast('스티커 추가에 실패했어요. 다시 시도해주세요');
          return;
        }
        const tagged = converted.map((el) => Object.assign({}, el, {
          customData: authorCustomData(userName, {
            stickerType: 'memo',
            stickerColor: colorKey,
          }),
        }));
        const selectedIds = {};
        for (const el of tagged) {
          knownElementIds.add(el.id);
          selectedIds[el.id] = true;
        }
        const scene = currentExcalidrawAPI.getSceneElementsIncludingDeleted();
        currentExcalidrawAPI.updateScene({
          elements: scene.concat(tagged),
          appState: { selectedElementIds: selectedIds },
          commitToHistory: false,
        });
        currentExcalidrawAPI.setActiveTool({ type: 'selection' });
        showToast('스티커를 더블클릭하면 내용을 쓸 수 있어요');
      }

      function App() {
        const [api, setApi] = React.useState(null);
        const containerRef = React.useRef(null);
        const bindingRef = React.useRef(null);

        React.useEffect(() => {
          currentExcalidrawAPI = api; // Step 1.1: toolbar 핸들러용 closure 공유
          if (!api) return;
          // y-excalidraw 2.0.12 setupUndoRedo null-check 버그 회피 — undoManager 생략
          const setup = setTimeout(() => {
            try {
              bindingRef.current = new ExcalidrawBinding(yElements, yAssets, api, provider.awareness);
            } catch (err) {
              console.error('[board] binding 실패:', err);
            }
          }, 300);
          return () => {
            clearTimeout(setup);
            bindingRef.current?.destroy();
            bindingRef.current = null;
            currentExcalidrawAPI = null;
          };
        }, [api]);

        // PDCA-1/2 리팩토링 onChange 파이프라인 (AC-1.1 + AC-1.4 + AC-1.5):
        // (1) 선택 차단 가드 — 학생이 남의 요소를 선택하면 즉시 해제 + toast
        // (2) 작성자 태깅 — 내가 만든 모든 신규 요소에 customData.authorAwarenessId 부여
        //     (스티커는 stampSticker 가 생성 시점에 직접 태깅 — 여기 안 거침)
        // (3) knownElementIds 등록 — 원격 요소 오태깅 방지
        // (4) toolbar pressed 상태 ↔ 실제 활성 도구 동기화
        const handleSceneChange = React.useCallback((elements, appState) => {
          // 사용자 조작 중(그리기 드래그/리사이즈/텍스트 편집)에는 요소를 건드리지
          // 않는다 — finalize 후에만 변환·태깅. 조작 중 updateScene 은 입력을 끊는다.
          const interacting = Boolean(
            appState && (appState.draggingElement || appState.editingElement || appState.resizingElement)
          );
          const sel = (appState && appState.selectedElementIds) || {};

          // (1) 선택 차단 가드 (학생만). 선택은 로컬 상태라 원격과 충돌 없음.
          if (MY_ROLE === 'student') {
            let blocked = false;
            const nextSel = {};
            for (const el of elements) {
              if (el.isDeleted || !sel[el.id]) continue;
              const author = el.customData && el.customData.authorAwarenessId;
              if (author && !canEditElementInline(author, myAwarenessId, MY_ROLE)) {
                blocked = true;
              } else {
                nextSel[el.id] = true;
              }
            }
            if (blocked && api) {
              api.updateScene({ appState: { selectedElementIds: nextSel } });
              showToast('다른 사람이 만든 것은 수정할 수 없어요');
            }
          }

          let mutated = false;
          let working = elements;

          if (!interacting) {
            // (2) 작성자 태깅: 내 선택에 들어있는 신규 미태깅 요소 = 내가 방금 만든 요소.
            //     (Excalidraw 는 그리기 완료 직후 해당 요소를 선택 상태로 둔다.)
            //     원격 신규 요소는 내 selectedElementIds 에 없으므로 태깅되지 않는다.
            //     version/versionNonce 를 올려야 y-excalidraw 가 변경으로 인식해 전파한다.
            working = working.map((el) => {
              if (el.isDeleted) return el;
              if (knownElementIds.has(el.id)) return el;
              if (el.customData && el.customData.authorAwarenessId) return el;
              if (!sel[el.id]) return el;
              mutated = true;
              return Object.assign({}, el, {
                customData: Object.assign({}, el.customData || {}, authorCustomData(userName)),
                version: el.version + 1,
                versionNonce: randomVersionNonce(),
              });
            });
          }

          if (mutated && api) {
            api.updateScene({ elements: working, commitToHistory: false });
          }

          // (3) 알려진 id 등록. 단, 내가 아직 조작/선택 중인 미태깅 요소는 finalize 시
          //     (2)에서 태깅해야 하므로 등록을 보류한다 (등록되면 신규 판정에서 제외됨).
          for (const el of elements) {
            if (!el.customData || !el.customData.authorAwarenessId) {
              const isMineInProgress =
                sel[el.id] ||
                (appState && appState.draggingElement && appState.draggingElement.id === el.id) ||
                (appState && appState.editingElement && appState.editingElement.id === el.id);
              if (isMineInProgress) continue;
            }
            knownElementIds.add(el.id);
          }

          // (4) toolbar pressed 상태 동기화 (ESC·도구 자동 복귀 대응).
          syncToolbarState(appState && appState.activeTool ? appState.activeTool.type : null);
        }, [api]);

        return React.createElement('div', { ref: containerRef, style: { height: '100vh' } },
          React.createElement(Excalidraw, {
            excalidrawAPI: setApi,
            // PDCA-1 Step 1.3: gridSize 20px default ON. toolbar 토글로 null ↔ 20 전환.
            initialData: { elements: yjsToExcalidraw(yElements), appState: { gridSize: 20 } },
            onPointerUpdate: (p) => bindingRef.current?.onPointerUpdate(p),
            onChange: handleSceneChange,
            theme: 'light',
            langCode: 'ko-KR',
            UIOptions: {
              canvasActions: {
                toggleTheme: false,
                loadScene: false,
                saveAsImage: false,
                changeViewBackgroundColor: false,
                export: false,
                clearCanvas: false,
              },
            },
          }));
      }

      createRoot(document.getElementById('app')).render(React.createElement(App));

      // 팜 리젝션 — iPad + Apple Pencil 사용 시 손바닥 터치 차단
      // 기본 정책: touch 차단 (Plan §6 Q1 기본값 "기본 ON")
      // pen / mouse 는 필터 없이 통과 → Excalidraw 기본 동작.
      // 향후 "iPad 감지 시만 ON" 옵션으로 조정 가능.
      let palmRetry = 0;
      let palmInstalled = false;
      function installPalmRejection() {
        if (palmInstalled) return;
        const scope = document.querySelector('.excalidraw');
        if (!scope) {
          if (++palmRetry > 10) {
            console.warn('[board] palm rejection: .excalidraw 요소를 찾지 못해 설치 중단 (10회 초과)');
            return;
          }
          setTimeout(installPalmRejection, 200);
          return;
        }
        const blockTouch = (e) => {
          if (e.pointerType === 'touch') {
            // 캔버스 영역만 차단. 버튼·메뉴 등 UI 클릭은 허용.
            const target = e.target;
            const isCanvas = target instanceof HTMLCanvasElement
              || target.closest('.excalidraw__canvas-container')
              || target.closest('.interactive');
            if (isCanvas) {
              e.stopPropagation();
              e.preventDefault();
            }
          }
        };
        ['pointerdown', 'pointermove', 'pointerup'].forEach(type => {
          scope.addEventListener(type, blockTouch, { capture: true, passive: false });
        });
        palmInstalled = true;
        console.log('[board] palm rejection installed (touch blocked on canvas)');
      }
      installPalmRejection();

      // ────────────────────────────────────────────────────────────────────
      // PDCA-2 (AC-2.x): 도형 12종 활성화 — placeholder 제거 (근본 원인 4:
      // 버튼이 보이는데 누르면 console.log 만 찍혀 "고장난 기능"으로 보였다).
      //
      // 두 갈래:
      //  - 도구형(SHAPE_TOOL_MAP): Excalidraw native 도구 활성화 + appState 기본값
      //    (둥근/직각 사각형, 단방향/양방향 화살표는 currentItem* 으로 표현)
      //  - 스탬프형(STAMP_BUILDERS): native 도구가 없는 도형(삼각형·오각형·블록
      //    화살표·꺾인 화살표)을 화면 중앙에 즉시 추가 (Plan "native 9 + 시각 동등 3")
      // ────────────────────────────────────────────────────────────────────
      const SHAPE_TOOL_MAP = {
        'line': { type: 'line' },
        'arrow': { type: 'arrow', appState: { currentItemStartArrowhead: null, currentItemEndArrowhead: 'arrow' } },
        'rect': { type: 'rectangle', appState: { currentItemRoundness: 'sharp' } },
        'rounded-rect': { type: 'rectangle', appState: { currentItemRoundness: 'round' } },
        'ellipse': { type: 'ellipse' },
        'diamond': { type: 'diamond' },
        'text-box': { type: 'text' },
        'bidirectional-equiv': { type: 'arrow', appState: { currentItemStartArrowhead: 'arrow', currentItemEndArrowhead: 'arrow' } },
      };

      // 정다각형 꼭짓점 (좌상단 0,0 기준 닫힌 polyline)
      function regularPolygonPoints(sides, radius) {
        const pts = [];
        for (let i = 0; i <= sides; i++) {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
          pts.push([
            Math.round(radius + radius * Math.cos(a)),
            Math.round(radius + radius * Math.sin(a)),
          ]);
        }
        return pts;
      }

      const STAMP_BUILDERS = {
        'triangle': () => ({ type: 'line', points: regularPolygonPoints(3, 65) }),
        'pentagon-equiv': () => ({ type: 'line', points: regularPolygonPoints(5, 65) }),
        'right-arrow': () => ({
          type: 'line',
          points: [[0, 20], [70, 20], [70, 0], [120, 40], [70, 80], [70, 60], [0, 60], [0, 20]],
        }),
        'elbow-arrow-equiv': () => ({
          type: 'arrow',
          points: [[0, 0], [90, 0], [90, 70]],
          endArrowhead: 'arrow',
        }),
      };

      function stampShape(key, userName) {
        if (!currentExcalidrawAPI) return;
        if (typeof convertToExcalidrawElements !== 'function') {
          showToast('이 도형은 현재 브라우저에서 추가할 수 없어요');
          return;
        }
        const appState = currentExcalidrawAPI.getAppState();
        const z = appState.zoom && appState.zoom.value ? appState.zoom.value : 1;
        const cx = appState.width / (2 * z) - appState.scrollX;
        const cy = appState.height / (2 * z) - appState.scrollY;
        const base = STAMP_BUILDERS[key]();
        const skeleton = Object.assign({
          x: cx - 65,
          y: cy - 65,
          strokeColor: '#1e293b',
          backgroundColor: base.type === 'line' ? '#e2e8f0' : 'transparent',
          fillStyle: 'solid',
        }, base);
        let converted;
        try {
          converted = convertToExcalidrawElements([skeleton]);
        } catch (err) {
          console.warn('[board] 도형 스탬프 실패:', key, err);
          showToast('도형 추가에 실패했어요. 다시 시도해주세요');
          return;
        }
        const tagged = converted.map((el) => Object.assign({}, el, {
          customData: authorCustomData(userName, { stampShape: key }),
        }));
        const selectedIds = {};
        for (const el of tagged) {
          knownElementIds.add(el.id);
          selectedIds[el.id] = true;
        }
        const scene = currentExcalidrawAPI.getSceneElementsIncludingDeleted();
        currentExcalidrawAPI.updateScene({
          elements: scene.concat(tagged),
          appState: { selectedElementIds: selectedIds },
          commitToHistory: false,
        });
        // 추가 직후 selection 도구 — 바로 끌어서 배치 가능
        currentExcalidrawAPI.setActiveTool({ type: 'selection' });
      }

      // toolbar pressed 상태 ↔ Excalidraw 실제 활성 도구 동기화.
      // ESC, 그리기 완료 후 selection 자동 복귀, 기본 toolbar 사용 시 호출됨.
      // (스티커는 즉시 생성 방식이라 모드 상태가 없음 — 도형 도구만 동기화)
      function syncToolbarState(toolType) {
        const tb = document.getElementById('board-toolbar');
        if (!tb || toolType === null) return;
        if (activeShapeKey) {
          const map = SHAPE_TOOL_MAP[activeShapeKey];
          if (!map || map.type !== toolType) {
            activeShapeKey = null;
            tb.querySelectorAll('.shape-btn').forEach((el) => el.setAttribute('aria-pressed', 'false'));
          }
        }
      }

      const toolbar = document.getElementById('board-toolbar');
      if (toolbar) {
        toolbar.hidden = false;
        toolbar.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!(target instanceof HTMLElement)) return;
          const btn = target.closest('button');
          if (!btn) return;
          const isSwatch = btn.classList.contains('swatch');
          const isShape = btn.classList.contains('shape-btn');
          if (!isSwatch && !isShape) return;

          if (isSwatch) {
            // 즉시 생성 방식 — 모드 토글 없음. 누름 표시는 짧게 깜빡여 피드백만.
            btn.setAttribute('aria-pressed', 'true');
            setTimeout(() => btn.setAttribute('aria-pressed', 'false'), 250);
            stampSticker(btn.dataset.color || 'yellow', userName);
            return;
          }

          if (isShape) {
            const key = btn.dataset.shape || '';

            if (STAMP_BUILDERS[key]) {
              // 스탬프형: 즉시 캔버스 중앙에 추가 (누름 상태 유지 안 함)
              stampShape(key, userName);
              return;
            }

            const wasActive = btn.getAttribute('aria-pressed') === 'true';
            toolbar.querySelectorAll('.shape-btn').forEach((el) => el.setAttribute('aria-pressed', 'false'));
            if (wasActive) {
              activeShapeKey = null;
              if (currentExcalidrawAPI) currentExcalidrawAPI.setActiveTool({ type: 'selection' });
              return;
            }
            btn.setAttribute('aria-pressed', 'true');
            activeShapeKey = key;
            const map = SHAPE_TOOL_MAP[key];
            if (map && currentExcalidrawAPI) {
              if (map.appState) currentExcalidrawAPI.updateScene({ appState: map.appState });
              currentExcalidrawAPI.setActiveTool({ type: map.type });
            }
          }
        });

        // 접기/펼치기 토글 — 패널이 캔버스·다른 창을 가릴 때 접어둘 수 있다 (사용자 신고 2026-06-11).
        const collapseBtn = toolbar.querySelector('[data-toolbar-collapse]');
        if (collapseBtn) {
          collapseBtn.addEventListener('click', () => {
            const collapsed = toolbar.classList.toggle('collapsed');
            collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            const chev = collapseBtn.querySelector('.chev');
            if (chev) chev.textContent = collapsed ? '▼' : '▲';
          });
        }

        // PDCA-1 Step 1.3: grid 토글 (gridSize 20 ↔ null). default ON (initialData 에 gridSize: 20).
        const gridBtn = toolbar.querySelector('[data-grid-toggle]');
        if (gridBtn) {
          gridBtn.addEventListener('click', () => {
            const isOn = gridBtn.getAttribute('aria-pressed') === 'true';
            const nextSize = isOn ? null : 20;
            gridBtn.setAttribute('aria-pressed', isOn ? 'false' : 'true');
            if (currentExcalidrawAPI) {
              currentExcalidrawAPI.updateScene({ appState: { gridSize: nextSize } });
            }
          });
        }
      }
    }
  </script>
</body>
</html>`;
}
