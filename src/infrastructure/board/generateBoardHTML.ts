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

    /* PDCA-1 AC-1.0: 좌측 board toolbar scaffold — 스티커 5색 + 도형 9 native + 3 시각 동등(plan AC-2.2) 진입점 placeholder.
       실제 도구 활성화(setActiveTool, customData.authorAwarenessId, fillColor 토큰)는 AC-1.1 이후 연결. */
    #board-toolbar {
      position: fixed; top: 60px; left: 12px; z-index: 9990;
      background: rgba(255, 255, 255, 0.97);
      border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 10px 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      display: flex; flex-direction: column; gap: 10px;
      user-select: none;
      font-family: inherit;
    }
    #board-toolbar[hidden] { display: none !important; }
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

  <!-- PDCA-1 AC-1.0: 좌측 board toolbar scaffold (placeholder). 실제 도구 활성화는 AC-1.1+ 에서 연결. -->
  <div id="board-toolbar" hidden aria-label="협업 보드 도구">
    <div class="tool-section">
      <div class="section-label">스티커</div>
      <div class="swatch-row">
        <button type="button" class="swatch" data-color="yellow" aria-label="노란 스티커" aria-pressed="false" style="background:#FEF3C7"></button>
        <button type="button" class="swatch" data-color="pink" aria-label="분홍 스티커" aria-pressed="false" style="background:#FCE7F3"></button>
        <button type="button" class="swatch" data-color="blue" aria-label="파란 스티커" aria-pressed="false" style="background:#DBEAFE"></button>
        <button type="button" class="swatch" data-color="green" aria-label="초록 스티커" aria-pressed="false" style="background:#D1FAE5"></button>
        <button type="button" class="swatch" data-color="purple" aria-label="보라 스티커" aria-pressed="false" style="background:#EDE9FE"></button>
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
    const { Excalidraw } = ExcalidrawLib;
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

      // PDCA-1 Step 1.1: 스티커 메모 closure state (toolbar 핸들러 ↔ Excalidraw onChange 공유)
      // SP-1 PASS 근거: customData.authorAwarenessId 가 y-excalidraw 2.0.12 round-trip 안전 확인.
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
      let activeStickerColor = null;
      const processedTextIds = new Set();
      // PDCA-1 Step 1.4 (AC-1.4): 권한 검사용 lastSnapshot.
      // boardRules.canEditElement 와 동기 로직 (inline 복제 — generateBoardHTML 은 string template 이라 import 불가).
      // 각 onChange 마다 elementId → 직전 element 객체 매핑을 유지해 version/isDeleted 변동을 검출.
      const lastSnapshot = new Map();
      const myAwarenessId = String(provider.awareness.clientID);
      // 학생 페이지(generateBoardHTML) 는 항상 role='student'. 교사 페이지(별도 React 컴포넌트) 는
      // 자체 권한 처리를 가질 예정 (PDCA-3 design 단계 결정 — open-questions R-NEW-1 참조).
      const MY_ROLE = 'student';
      // boardRules.canEditElement 의 inline 복제. 변경 시 양쪽 동기 필수.
      function canEditElementInline(elementAuthorAwarenessId, currentAwarenessId, role) {
        if (!currentAwarenessId || currentAwarenessId.length === 0) return false;
        if (role === 'teacher') return true;
        if (!elementAuthorAwarenessId) return false;
        return elementAuthorAwarenessId === currentAwarenessId;
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

        // PDCA-1 Step 1.1 + 1.4 (AC-1.1 + AC-1.4 + AC-1.5):
        // (1) text element finalize 감지 시 작성자 라벨 prepend + sticker 배경색 + customData 주입
        // (2) 다른 학생/템플릿 요소 mutation 감지 시 revert + toast (학생 권한 가드)
        // (3) lastSnapshot 갱신 (다음 onChange 의 비교 기준)
        const handleSceneChange = React.useCallback((elements, appState) => {
          if (appState && appState.editingElement) return; // inline 텍스트 편집 중이면 대기

          // (1) 권한 가드: lastSnapshot 과 비교해 mutation/deletion 검출.
          // 신규 element (snapshot 에 없음) 은 항상 허용 — 학생이 본인 sticker 를 새로 만드는 경우.
          let needsRevert = false;
          const guarded = elements.map((el) => {
            const snap = lastSnapshot.get(el.id);
            if (!snap) return el;
            const versionChanged = el.version !== snap.version;
            const deletionChanged = el.isDeleted !== snap.isDeleted;
            if (!versionChanged && !deletionChanged) return el;
            const authorId = snap.customData && snap.customData.authorAwarenessId;
            if (!canEditElementInline(authorId, myAwarenessId, MY_ROLE)) {
              needsRevert = true;
              return snap; // 직전 상태로 되돌림
            }
            return el;
          });

          let workingElements = needsRevert ? guarded : elements;
          let needsRender = needsRevert;

          // (2) sticker 주입: 권한 가드 통과한 경로에서만, 활성 색상이 있을 때만.
          if (!needsRevert && activeStickerColor) {
            workingElements = workingElements.map((el) => {
              if (
                el.type === 'text' &&
                !el.isDeleted &&
                !processedTextIds.has(el.id) &&
                el.text && el.text.trim().length > 0 &&
                !el.text.startsWith('⭐ ')
              ) {
                processedTextIds.add(el.id);
                needsRender = true;
                return {
                  ...el,
                  text: '⭐ ' + userName + '\\n' + el.text,
                  backgroundColor: STICKER_COLORS[activeStickerColor] || '#FEF3C7',
                  customData: {
                    ...(el.customData || {}),
                    authorAwarenessId: myAwarenessId,
                    authorName: userName,
                    stickerType: 'memo',
                    stickerColor: activeStickerColor,
                    createdAtIso: new Date().toISOString(),
                  },
                };
              }
              return el;
            });
          }

          if (needsRender && api) {
            api.updateScene({ elements: workingElements, commitToHistory: false });
          }
          if (needsRevert) showToast('다른 사람의 메모는 수정할 수 없어요');

          // (3) snapshot 갱신: 우리가 화면에 띄운 (revert/inject 또는 그대로 둔) 상태를 기록.
          // 이렇게 해야 revert 직후 발생하는 onChange 가 "또 다른 mutation" 으로 잘못 검출되지 않음.
          lastSnapshot.clear();
          for (const el of workingElements) lastSnapshot.set(el.id, el);
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

      // PDCA-1 Step 1.0+1.1: toolbar 활성화.
      // 스티커 swatch: 토글 + Excalidraw text tool 활성화 (Step 1.1). 도형 버튼: placeholder (Step 다음).
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
            const wasActive = btn.getAttribute('aria-pressed') === 'true';
            toolbar.querySelectorAll('.swatch').forEach((el) => el.setAttribute('aria-pressed', 'false'));
            if (wasActive) {
              // 토글 OFF: 활성 색상 해제 + selection 도구로 복귀
              activeStickerColor = null;
              if (currentExcalidrawAPI) currentExcalidrawAPI.setActiveTool({ type: 'selection' });
              return;
            }
            // 토글 ON: 색상 저장 + text 도구 활성화 (Excalidraw inline text editor 사용)
            btn.setAttribute('aria-pressed', 'true');
            activeStickerColor = btn.dataset.color || null;
            if (currentExcalidrawAPI) currentExcalidrawAPI.setActiveTool({ type: 'text' });
            return;
          }

          if (isShape) {
            // Step 1.0 placeholder — 다음 step 에서 setActiveTool(rectangle/line/...) 연결
            toolbar.querySelectorAll('.shape-btn').forEach((el) => el.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
            console.log('[toolbar] AC-1.0 shape placeholder:', btn.dataset.shape);
          }
        });

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
