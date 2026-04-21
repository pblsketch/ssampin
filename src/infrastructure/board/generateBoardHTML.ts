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

      function App() {
        const [api, setApi] = React.useState(null);
        const containerRef = React.useRef(null);
        const bindingRef = React.useRef(null);

        React.useEffect(() => {
          if (!api) return;
          // y-excalidraw 2.0.12 setupUndoRedo null-check 버그 회피 — undoManager 생략
          const setup = setTimeout(() => {
            try {
              bindingRef.current = new ExcalidrawBinding(yElements, yAssets, api, provider.awareness);
            } catch (err) {
              console.error('[board] binding 실패:', err);
            }
          }, 300);
          return () => { clearTimeout(setup); bindingRef.current?.destroy(); bindingRef.current = null; };
        }, [api]);

        return React.createElement('div', { ref: containerRef, style: { height: '100vh' } },
          React.createElement(Excalidraw, {
            excalidrawAPI: setApi,
            initialData: { elements: yjsToExcalidraw(yElements) },
            onPointerUpdate: (p) => bindingRef.current?.onPointerUpdate(p),
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
    }
  </script>
</body>
</html>`;
}
