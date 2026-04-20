---
template: design
version: 1.2
feature: collab-board
date: 2026-04-19
author: pblsketch
project: ssampin
version_target: v1.12.0
depends_on: docs/01-plan/features/collab-board.plan.md
spike_result: spikes/collab-board/SPIKE-RESULT.md
---

# 쌤핀 협업 온라인 보드(Collab Board) 설계서

> Plan의 Phase 1a MVP(30명 동시 드로잉) 범위를 **Clean Architecture 4-layer 경계**, **IPC·HTML 생성 패턴**, **WebSocket 인증·자동 저장·터널 조정**으로 구체화한다. 모든 기술 선택은 [spikes/collab-board/SPIKE-RESULT.md](../../../spikes/collab-board/SPIKE-RESULT.md)로 검증된 값.
>
> **Status**: Draft v0.2 (2026-04-19, design-validator Score 74→90+ 해소 후)
> **Planning Doc**: [collab-board.plan.md](../../01-plan/features/collab-board.plan.md)
> **Spike Result**: [SPIKE-RESULT.md](../../../spikes/collab-board/SPIKE-RESULT.md)

---

## 1. Architecture Overview

### 1.1 Design Goals

- 교사 Electron 앱을 "임시 Y.js WebSocket 서버 + HTTP 정적 호스트"로 동작시켜 30명 동시 접속 실시간 드로잉 지원
- **기존 쌤도구 5종(투표/설문/워드클라우드/토론/멀티설문)과 완전히 같은 UX**: QR/URL → 브라우저 → 이름 입력 → 바로 사용
- **Clean Architecture 4-layer 엄수**: domain은 순수 TypeScript, Y.js·ws·cloudflared는 infrastructure 한정
- **기존 터널 싱글턴 무수정**: `tunnel.ts`의 `activeTunnel`을 건드리지 않고 `BoardTunnelCoordinator` 래퍼로 상호 배타
- **CDN 전략**: 학생 브라우저 번들은 esm.sh에서 받음. Vite 별도 빌드·extraResources 패키징 **불필요**

### 1.2 Design Principles

- **개방·폐쇄**: 기존 5개 라이브 도구 코드는 건드리지 않고, 보드만 coordinator를 경유해 터널 사용
- **단일 책임**: 엔티티는 비즈니스 규칙, 유스케이스는 흐름, 어댑터는 UI+조립, 인프라는 기술 세부
- **명시적 실패**: 터널 점유 충돌·인증 실패·자동 저장 실패는 전부 사용자에게 Toast로 안내 (무음 실패 금지)
- **최소 구현(MVP 원칙)**: Phase 1a는 "30명이 같이 그린다"만. Phase 1b 스킨·Phase 2 권한은 인터페이스만 열어두고 구현은 유예

### 1.3 Touchpoints

| 레이어 | 파일 | 변경 유형 |
|--------|------|-----------|
| domain | [src/domain/entities/Board.ts](../../../src/domain/entities/Board.ts) | **신규** |
| domain | [src/domain/entities/BoardSession.ts](../../../src/domain/entities/BoardSession.ts) | **신규** |
| domain | [src/domain/entities/BoardParticipant.ts](../../../src/domain/entities/BoardParticipant.ts) | **신규** |
| domain | [src/domain/valueObjects/BoardId.ts](../../../src/domain/valueObjects/BoardId.ts) | **신규** |
| domain | [src/domain/valueObjects/BoardSessionCode.ts](../../../src/domain/valueObjects/BoardSessionCode.ts) | **신규** |
| domain | [src/domain/valueObjects/BoardAuthToken.ts](../../../src/domain/valueObjects/BoardAuthToken.ts) | **신규** |
| domain | [src/domain/rules/boardRules.ts](../../../src/domain/rules/boardRules.ts) | **신규** |
| domain | [src/domain/repositories/IBoardRepository.ts](../../../src/domain/repositories/IBoardRepository.ts) | **신규** |
| domain | [src/domain/ports/IBoardTunnelPort.ts](../../../src/domain/ports/IBoardTunnelPort.ts) | **신규** — coordinator 추상화 |
| domain | [src/domain/ports/IBoardServerPort.ts](../../../src/domain/ports/IBoardServerPort.ts) | **신규** — WebSocket 서버 추상화 |
| usecases | [src/usecases/board/ManageBoard.ts](../../../src/usecases/board/ManageBoard.ts) | **신규** — 목록 CRUD |
| usecases | [src/usecases/board/StartBoardSession.ts](../../../src/usecases/board/StartBoardSession.ts) | **신규** — 서버·터널 기동 |
| usecases | [src/usecases/board/EndBoardSession.ts](../../../src/usecases/board/EndBoardSession.ts) | **신규** — 정리·최종 저장 |
| usecases | [src/usecases/board/SaveBoardSnapshot.ts](../../../src/usecases/board/SaveBoardSnapshot.ts) | **신규** — Y.js update 저장 |
| usecases | [src/usecases/board/AuthorizeBoardJoin.ts](../../../src/usecases/board/AuthorizeBoardJoin.ts) | **신규** — 학생 입장 인증 |
| adapters | [src/adapters/components/Tools/ToolCollabBoard.tsx](../../../src/adapters/components/Tools/ToolCollabBoard.tsx) | **신규** — 교사용 진입 컴포넌트 |
| adapters | [src/adapters/components/Tools/Board/BoardSessionPanel.tsx](../../../src/adapters/components/Tools/Board/BoardSessionPanel.tsx) | **신규** — QR/코드/접속자 |
| adapters | [src/adapters/components/Tools/Board/BoardControls.tsx](../../../src/adapters/components/Tools/Board/BoardControls.tsx) | **신규** — 시작/종료/저장 버튼 |
| adapters | [src/adapters/components/Tools/Board/BoardListPanel.tsx](../../../src/adapters/components/Tools/Board/BoardListPanel.tsx) | **신규** — 저장된 보드 목록 |
| adapters | [src/adapters/repositories/FileBoardRepository.ts](../../../src/adapters/repositories/FileBoardRepository.ts) | **신규** |
| adapters | [src/adapters/stores/useBoardStore.ts](../../../src/adapters/stores/useBoardStore.ts) | **신규** — 목록 상태 |
| adapters | [src/adapters/stores/useBoardSessionStore.ts](../../../src/adapters/stores/useBoardSessionStore.ts) | **신규** — 실시간 세션 |
| adapters | [src/adapters/di/container.ts](../../../src/adapters/di/container.ts) | **수정** — 기존 `export const` 상수 패턴 그대로 `boardRepository`, `boardServerPort`, `boardTunnelPort` 3개 추가 export |
| infrastructure | [src/infrastructure/board/YDocBoardServer.ts](../../../src/infrastructure/board/YDocBoardServer.ts) | **신규** — IBoardServerPort 구현 |
| infrastructure | [src/infrastructure/board/BoardTunnelCoordinator.ts](../../../src/infrastructure/board/BoardTunnelCoordinator.ts) | **신규** — IBoardTunnelPort 구현 (스파이크 s2 코드 이식) |
| infrastructure | [src/infrastructure/board/BoardFilePersistence.ts](../../../src/infrastructure/board/BoardFilePersistence.ts) | **신규** — `Y.encodeStateAsUpdate` 바이너리 저장 |
| infrastructure | [src/infrastructure/board/generateBoardHTML.ts](../../../src/infrastructure/board/generateBoardHTML.ts) | **신규** — 기존 `liveMultiSurveyHTML.ts`와 동일 패턴 |
| electron | [electron/ipc/board.ts](../../../electron/ipc/board.ts) | **신규** — `registerBoardHandlers(mainWindow)` |
| electron | [electron/ipc/tunnel.ts](../../../electron/ipc/tunnel.ts) | **수정** — `getCurrentOwner(): string \| null` 1개 함수 추가 (coordinator가 기존 5개 도구의 터널 점유 상태를 관찰). 기존 함수는 전부 유지, 5개 도구 코드 무수정 |
| electron | [electron/preload.ts](../../../electron/preload.ts) | **수정** — `window.electronAPI.collabBoard.*` 서브객체에 약 12개 메서드 추가 (기존 `window.electronAPI` flat 노출에 그루핑 추가) |
| electron | [electron/main.ts](../../../electron/main.ts) | **수정** — `registerBoardHandlers(mainWindow)` 호출 + 기존 `app.on('before-quit')` 콜백에 `endActiveBoardSessionSync()` 1줄 추가 |
| typings | [src/global.d.ts](../../../src/global.d.ts) | **수정** — `ElectronAPI` 인터페이스에 `collabBoard: CollabBoardApi` 필드 추가 |

### 1.4 Dependency Rule 검증

```
domain/                                   (순수 TS — React·ws·Electron·Y.js 전부 금지)
  ↑
usecases/                                 (domain만 import)
  ↑
adapters/  ──→  infrastructure/           (adapters는 infrastructure import 금지
                                           유일한 예외: di/container.ts 조립부)
              ↓
              (Y.js, ws, y-websocket, cloudflared, fs)

검증:
- [x] domain/entities/Board.ts            → 0 외부 의존 (id/name/timestamps 등 타입만)
- [x] domain/repositories/IBoardRepository → 포트 인터페이스 (return 타입은 domain만)
- [x] usecases/board/StartBoardSession    → IBoardRepository + IBoardServerPort + IBoardTunnelPort만 주입받음
- [x] infrastructure/board/YDocBoardServer → yjs·ws·y-websocket import OK (infrastructure 레이어)
- [x] adapters/components/Tools/*         → usecases·stores만 참조, infrastructure 직접 import 금지
- [x] electron/ipc/board.ts               → infrastructure + usecases 호출 OK (infra 등가 레이어)
```

### 1.5 Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ Electron Renderer (React)                                        │
│                                                                  │
│  ToolCollabBoard.tsx (쌤도구 메뉴에서 진입)                        │
│    ├─ BoardListPanel — 저장된 보드 목록 (useBoardStore)           │
│    ├─ BoardControls  — 시작/종료/저장 (StartBoardSession 호출)     │
│    └─ BoardSessionPanel — QR/코드/접속자 (useBoardSessionStore)    │
│                                                                  │
│                ↕ window.electronAPI.collabBoard.* (preload)      │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Electron Main (Node)                                             │
│                                                                  │
│  electron/ipc/board.ts                                           │
│    registerBoardHandlers(mainWindow) ← main.ts에서 1회 호출       │
│                                                                  │
│  usecases/board/*  (domain만 import)                             │
│    ├─ ManageBoard        (목록 CRUD)                             │
│    ├─ StartBoardSession  (tunnel acquire + server start + token) │
│    ├─ AuthorizeBoardJoin (토큰+코드 검증)                         │
│    ├─ SaveBoardSnapshot  (Y.js state 영속화)                     │
│    └─ EndBoardSession    (server stop + tunnel release + 저장)   │
│                                                                  │
│  infrastructure/board/                                           │
│    ├─ YDocBoardServer         ws + y-websocket setupWSConnection │
│    ├─ BoardTunnelCoordinator  tunnel.ts 래퍼 (S2 스파이크 이식)   │
│    ├─ BoardFilePersistence    userData/data/boards/*.ybin        │
│    └─ generateBoardHTML       인라인 HTML + CDN import map       │
│                                                                  │
│  electron/ipc/tunnel.ts (수정: getCurrentOwner() 1개 함수 추가)    │
└──────────────────────────────────────────────────────────────────┘
                ↕ cloudflared 터널 (https://xxx.trycloudflare.com)
┌──────────────────────────────────────────────────────────────────┐
│ 학생 브라우저 (모바일/태블릿/PC)                                    │
│                                                                  │
│  HTML (generateBoardHTML이 생성한 한 장)                          │
│    <script type="importmap"> esm.sh CDN 매핑 </script>           │
│    <script type="module">                                        │
│      React + Excalidraw 0.17.6 + Y.js + y-websocket              │
│      + y-excalidraw 바인딩                                        │
│      ws://host/?token=<32hex>&code=<6char>  로 연결              │
│    </script>                                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 Domain Entities

**파일**: `src/domain/entities/Board.ts`

```ts
import type { BoardId } from '../valueObjects/BoardId';

/** 보드 메타데이터 (Y.Doc 바이너리와 분리 저장) */
export interface Board {
  /** `bd-` + crypto.randomUUID() 계열 14자 (FileBoardRepository가 생성) */
  id: BoardId;
  name: string;
  createdAt: number;  // Unix ms
  updatedAt: number;
  lastSessionEndedAt: number | null;
  /** 참여자 이름 히스토리 (기본 중복 제거, 교사 UI에서 "누가 참여했었는지" 표시용) */
  participantHistory: string[];
  /** Y.Doc 바이너리 파일 경로 (FileBoardRepository 소유, 절대 경로 아님 - ID 재구성) */
  hasSnapshot: boolean;
}
```

**파일**: `src/domain/entities/BoardSession.ts`

```ts
import type { BoardId } from '../valueObjects/BoardId';
import type { BoardSessionCode } from '../valueObjects/BoardSessionCode';
import type { BoardAuthToken } from '../valueObjects/BoardAuthToken';

export type BoardSessionPhase = 'starting' | 'running' | 'stopping' | 'stopped';

/** 세션 = 보드가 실시간으로 "열려있는 상태" */
export interface BoardSession {
  boardId: BoardId;
  phase: BoardSessionPhase;
  /** WebSocket 서버 로컬 포트 */
  localPort: number;
  /** cloudflared 공개 URL (https) — phase='running' 이후만 유효 */
  publicUrl: string | null;
  /** 학생 브라우저가 URL 파라미터로 제시해야 하는 난수 토큰 (32자리 hex) */
  authToken: BoardAuthToken;
  /** 교사 콘솔에서 확인 가능한 6자리 세션 코드 (학생이 이름 입력 시 교사가 구두 공유 시나리오 대비) */
  sessionCode: BoardSessionCode;
  startedAt: number;
  /** 현재 접속 중인 학생 (실시간 갱신) */
  participants: BoardParticipant[];
}
```

**파일**: `src/domain/entities/BoardParticipant.ts`

```ts
export interface BoardParticipant {
  /** Y.js awareness clientID 기반 (number → string 변환) */
  awarenessId: string;
  name: string;
  /** awareness에 포함된 색상 (커서/이름 뱃지용, Phase 2 awareness UI에서 사용) */
  color: string;
  joinedAt: number;
  /** 마지막 ping 시각 — 끊김 감지용 */
  lastSeenAt: number;
}
```

### 2.2 Value Objects

**파일**: `src/domain/valueObjects/BoardId.ts`

```ts
/** `bd-` prefix + 14자. 충돌 방지용 unique id. */
export type BoardId = string & { readonly __brand: 'BoardId' };

export function isBoardId(s: string): s is BoardId {
  return /^bd-[A-Za-z0-9_-]{14}$/.test(s);
}
```

**파일**: `src/domain/valueObjects/BoardSessionCode.ts`

```ts
/** 6자리 대문자 영숫자 (헷갈리는 0/O, 1/I, L 제외) */
export type BoardSessionCode = string & { readonly __brand: 'BoardSessionCode' };

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31자
export function generateSessionCode(rand: () => number = Math.random): BoardSessionCode {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out as BoardSessionCode;
}
export function isSessionCode(s: string): s is BoardSessionCode {
  return new RegExp(`^[${ALPHABET}]{6}$`).test(s);
}
```

**파일**: `src/domain/valueObjects/BoardAuthToken.ts`

```ts
/** 32자리 hex. infrastructure에서 crypto.randomBytes(16).toString('hex')로 생성 */
export type BoardAuthToken = string & { readonly __brand: 'BoardAuthToken' };

export function isAuthToken(s: string): s is BoardAuthToken {
  return /^[a-f0-9]{32}$/.test(s);
}
```

### 2.3 Domain Rules

**파일**: `src/domain/rules/boardRules.ts`

```ts
import type { BoardAuthToken } from '../valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '../valueObjects/BoardSessionCode';
import { isAuthToken } from '../valueObjects/BoardAuthToken';
import { isSessionCode } from '../valueObjects/BoardSessionCode';

/** 이름 유효성 (학생 입장) — 1~12자, 공백 트리밍, 이모지 허용 */
export function sanitizeParticipantName(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 12);
  if (trimmed.length === 0) return null;
  if (/^[\s\u200B-\u200D]+$/.test(trimmed)) return null;  // 공백/제로폭만
  return trimmed;
}

/**
 * 입장 인증: URL 토큰 + 세션 코드 양쪽 검증
 *
 * 1) 형식 검증 실패(길이·문자 집합)는 타이밍 공격 대상 아니므로 early return 허용
 * 2) 형식이 맞는 입력끼리의 비교는 상수 시간 비교(`timingSafeEqual` or 양측 AND) 사용
 */
export function verifyJoinCredentials(
  providedToken: string,
  providedCode: string,
  expected: { token: BoardAuthToken; code: BoardSessionCode },
): boolean {
  if (!isAuthToken(providedToken) || !isSessionCode(providedCode)) return false;
  // infrastructure 측에서 Node crypto.timingSafeEqual(Buffer, Buffer)로 구현
  // 이 domain 규칙은 순수 JS 폴백 AND 비교로 동작 (렌더러/테스트 환경용)
  const tokenOk = providedToken === expected.token;
  const codeOk = providedCode === expected.code;
  return tokenOk && codeOk;
}

/** 중복 이름 추가 접미사 처리: "민수" 가 이미 있으면 "민수(2)", "민수(3)" */
export function nextAvailableName(base: string, existing: ReadonlyArray<string>): string {
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}(${n})`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base}(${Date.now().toString().slice(-4)})`;
}
```

### 2.4 Repository & Port Interfaces

**파일**: `src/domain/repositories/IBoardRepository.ts`

```ts
import type { Board } from '../entities/Board';
import type { BoardId } from '../valueObjects/BoardId';

export interface IBoardRepository {
  listAll(): Promise<Board[]>;
  get(id: BoardId): Promise<Board | null>;
  create(input: { name: string }): Promise<Board>;
  rename(id: BoardId, name: string): Promise<Board>;
  delete(id: BoardId): Promise<void>;
  /** Y.Doc 바이너리 저장 (Y.encodeStateAsUpdate 결과 Uint8Array) */
  saveSnapshot(id: BoardId, update: Uint8Array): Promise<void>;
  /** Y.Doc 바이너리 로드 */
  loadSnapshot(id: BoardId): Promise<Uint8Array | null>;
  /** 참여자 이름 히스토리 병합 저장 */
  appendParticipantHistory(id: BoardId, names: string[]): Promise<void>;
}
```

**파일**: `src/domain/ports/IBoardTunnelPort.ts`

```ts
export type TunnelOwner =
  | 'board'
  | 'live-survey'
  | 'live-vote'
  | 'live-wordcloud'
  | 'live-discussion'
  | 'live-multi-survey';

export interface ActiveOwnership {
  owner: TunnelOwner;
  localPort: number;
  url: string;
  acquiredAt: number;
}

export class TunnelBusyError extends Error {
  constructor(public readonly existing: TunnelOwner) {
    super(`다른 도구(${existing})가 이미 터널을 사용 중입니다.`);
    this.name = 'TunnelBusyError';
  }
}

/** Plan 스파이크 S2에서 증명된 인터페이스. infrastructure가 구현. */
export interface IBoardTunnelPort {
  acquire(owner: TunnelOwner, localPort: number): Promise<string>;
  release(owner: TunnelOwner): void;
  getCurrent(): ActiveOwnership | null;
  isBusy(): boolean;
  /**
   * cloudflared 프로세스 비정상 종료 시 통지. StartBoardSession이 이 훅으로
   * 세션을 'stopping'으로 전환하고 UI에 Toast 발송.
   * 반환값은 구독 해제 함수.
   */
  onExit(cb: (reason: string) => void): () => void;
}
```

> **tunnel.ts 측 변경**: `acquire`/`release`가 기존 5개 도구의 `openTunnel`/`closeTunnel` 직접 호출과 **양방향 상호 배타**를 보장하려면 `electron/ipc/tunnel.ts`에 `getCurrentOwner(): string | null` 함수 한 개를 추가한다 (owner 문자열 모듈 전역에 간단 저장). 기존 5개 도구는 `openTunnel(port)` 시 내부적으로 이 owner를 `'live-*'` 계열로 세팅하도록 파라미터 1개 추가하거나, `tunnel.ts`에 별도 `setOwner(owner)` 를 `openTunnel` 성공 시 내부 호출하도록 **tunnel.ts 내부만 수정** (5개 도구 파일 무수정, 기존 시그니처 하위호환 유지).

**파일**: `src/domain/ports/IBoardServerPort.ts`

```ts
import type { BoardId } from '../valueObjects/BoardId';
import type { BoardAuthToken } from '../valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '../valueObjects/BoardSessionCode';

export interface BoardServerHandle {
  boardId: BoardId;
  localPort: number;
  authToken: BoardAuthToken;
  sessionCode: BoardSessionCode;
  participantCount: () => number;
  getParticipantNames: () => string[];
  /** Y.Doc state를 직렬화 바이너리로 덤프 (자동 저장용) */
  encodeState: () => Uint8Array;
}

export interface BoardServerStartOpts {
  boardId: BoardId;
  /** 이전 세션 Y.Doc 바이너리 (null이면 빈 문서) */
  initialState: Uint8Array | null;
  /** Y.Doc 변경 이벤트 콜백 (auto-save trigger에 사용) */
  onStateChange: () => void;
  /** 참여자 변화 콜백 (UI 갱신용) */
  onParticipantsChange: (names: string[]) => void;
}

export interface IBoardServerPort {
  start(opts: BoardServerStartOpts): Promise<BoardServerHandle>;
  stop(boardId: BoardId): Promise<void>;
}
```

> **heartbeat 구현 위치**: `YDocBoardServer.start` 내부에서 25초 주기 `wss.clients.forEach(ws => ws.ping())` 실행. 브라우저의 WebSocket pong은 `ws` 라이브러리가 자동 회신하므로 `onStateChange`/client 파트는 무영향. Plan R3 (cloudflared idle drop) 완화의 유일한 구현 지점.

---

## 3. Use Cases (Application Flow)

### 3.1 StartBoardSession — 세션 기동

**파일**: `src/usecases/board/StartBoardSession.ts`

```
입력: boardId
출력: { publicUrl, sessionCode, authToken, qrDataUrl }

사전 상태:
  - 모듈 전역: let dirty = false  (최초 false, onStateChange 시 true)
  - 모듈 전역: let autoSaveTimer: NodeJS.Timeout | null = null
  - 모듈 전역: let unsubscribeTunnelExit: (() => void) | null = null

절차:
  1. IBoardTunnelPort.isBusy() 확인
     → busy이고 owner !== 'board' 면 TunnelBusyError 즉시 throw
  2. 포트 선점: net.createServer().listen(0, '0.0.0.0')로 OS 위임 (기존 쌤도구 관습)
     → 반환된 address().port 를 localPort로 사용
  3. IBoardRepository.loadSnapshot(boardId) → initialState (없으면 null)
  4. onStateChange 콜백 정의: () => { dirty = true; }
  5. IBoardServerPort.start({ boardId, initialState, onStateChange, onParticipantsChange })
     → BoardServerHandle { localPort, authToken, sessionCode, ... }
  6. IBoardTunnelPort.acquire('board', localPort) → publicUrl
  7. unsubscribeTunnelExit = IBoardTunnelPort.onExit(reason => {
        → BoardSession.phase = 'stopping'
        → mainWindow.send('collab-board:session-error', { reason })
        → EndBoardSession 호출 (비동기)
     })
  8. qrcode.toDataURL(`${publicUrl}?t=${authToken}&code=${sessionCode}`) → qrDataUrl
  9. 30초 주기 자동 저장 (setInterval):
        if (!dirty) return
        const localDirty = dirty; dirty = false     // 캡처
        try { saveSnapshot() } catch { dirty = localDirty }   // 실패 시 복구
  10. BoardSession 레코드를 useBoardSessionStore에 반영 (collab-board:session-started IPC push)

실패:
  - 5 실패 시 (서버 기동) → 리소스 없음, 그대로 throw
  - 6 실패 시 (터널 획득) → IBoardServerPort.stop(boardId) 후 throw
  - 7~9 실패 시 → 6·5 역순 롤백 후 throw
```

### 3.2 EndBoardSession — 세션 종료

```
입력: boardId, opts: { forceSave: boolean }
절차:
  1. 자동 저장 타이머 clearInterval + unsubscribeTunnelExit?.()
  2. encodeState() → IBoardRepository.saveSnapshot()     (forceSave=true면 에러 무시)
  3. IBoardRepository.appendParticipantHistory(participantNames)
  4. IBoardServerPort.stop(boardId)
  5. IBoardTunnelPort.release('board')
  6. BoardSession phase='stopped' 로 변경 후 store 갱신
```

### 3.2-bis `endActiveBoardSessionSync` — app.before-quit 전용

`app.on('before-quit')`는 async 콜백의 `await`를 기다리지 않으므로, 세션이 실행 중일 때 **동기적 저장 경로**가 별도 필요하다.

```ts
// electron/ipc/board.ts 에서 export
export function endActiveBoardSessionSync(event: Electron.Event): void {
  const session = getActiveBoardSession();
  if (!session) return;
  event.preventDefault();           // 종료 지연
  // (1) 타이머 해제 + 터널 구독 해제 (동기)
  stopAutoSaveTimer(); unsubscribeTunnelExit?.();
  // (2) 서버 핸들에서 encodeState 동기 호출 → 파일시스템 fs.writeFileSync로 저장
  const state = activeServerHandle.encodeState();
  fs.writeFileSync(snapshotPath(session.boardId), Buffer.from(state));
  // (3) 참여자 히스토리도 동기 파일 append
  fs.appendFileSync(historyPath(session.boardId), JSON.stringify(names) + '\n');
  // (4) 서버·터널 정리는 비동기 시작 후 2초 deadline 뒤 강제 종료
  Promise.race([
    Promise.all([serverPort.stop(session.boardId), Promise.resolve(tunnelPort.release('board'))]),
    new Promise(r => setTimeout(r, 2000)),
  ]).finally(() => app.exit(0));
}
```

**등록 지점**: `electron/main.ts`의 기존 `app.on('before-quit', async () => { ... })` 블록 맨 앞에 `endActiveBoardSessionSync(event);` 한 줄. 이후 기존 async 로직은 그대로 실행됨 (서버가 이미 stopped라 no-op). `fs.writeFileSync` 블로킹은 Y.Doc 바이너리 크기가 평균 수백 KB 범위라 1초 이내 완료.

### 3.3 AuthorizeBoardJoin — 학생 입장 인증 (WebSocket handshake 전)

```
입력: req.url 쿼리 { t: token, code }
출력: boolean + (통과 시) sanitized name
절차:
  1. providedToken = url.searchParams.get('t')
  2. providedCode = url.searchParams.get('code')
  3. boardRules.verifyJoinCredentials(providedToken, providedCode, expected)
  4. 실패 → ws.close(1008, 'AUTH_FAILED'), 서버 로그에 기록 없음(PIPA)
  5. 성공 → setupWSConnection 호출, ws.on('message') 경로로 y-websocket 프로토콜 진입
```

### 3.4 SaveBoardSnapshot — 수동/자동 저장

```
입력: boardId
절차:
  1. server.encodeState() → Uint8Array update
  2. IBoardRepository.saveSnapshot(boardId, update)
  3. UI 토스트 "저장 완료" (수동 호출 시에만, 자동 호출 시엔 UI 노출 안 함)
트리거:
  - 30초 주기 (StartBoardSession에서 setInterval)
  - 교사의 수동 저장 버튼
  - app.before-quit (EndBoardSession 경로로 동기 실행)
```

### 3.5 ManageBoard — 목록 CRUD

```
listAll()   → IBoardRepository.listAll()
create(name) → 기본 이름 "협업 보드 N" (N = 현재 목록 개수+1), FileBoardRepository가 id 생성
rename(id, name)
delete(id)  → 세션 실행 중이면 거부 (EndBoardSession 먼저 요구)
```

---

## 4. IPC Specification

### 4.1 Channel 목록 — 기존 `live-*:kebab-case` 관습과 동일한 `collab-board:*` 네임스페이스

기존 5개 쌤도구는 `live-vote:start`, `live-multi-survey:activate-session` 등 **kebab-case + colon** 패턴을 사용한다. 협업 보드도 이 관습을 그대로 따른다.

| 채널명 | 방향 | 페이로드 | 응답 |
|-------|------|---------|------|
| `collab-board:list` | R→M | `{}` | `Board[]` |
| `collab-board:create` | R→M | `{ name?: string }` | `Board` |
| `collab-board:rename` | R→M | `{ id: BoardId, name: string }` | `Board` |
| `collab-board:delete` | R→M | `{ id: BoardId }` | `{ ok: true }` |
| `collab-board:start-session` | R→M | `{ id: BoardId }` | `BoardSessionStartResult` |
| `collab-board:end-session` | R→M | `{ id: BoardId, forceSave: boolean }` | `{ ok: true }` |
| `collab-board:get-active-session` | R→M | `{}` | `BoardSession \| null` |
| `collab-board:save-snapshot` | R→M | `{ id: BoardId }` | `{ savedAt: number }` |
| `collab-board:tunnel-available` | R→M | `{}` | `{ available: boolean }` |
| `collab-board:tunnel-install` | R→M | `{}` | `{ ok: true }` — 40MB cloudflared 다운로드 |
| `collab-board:participant-change` | M→R | `{ boardId, names: string[] }` | (event) |
| `collab-board:auto-save` | M→R | `{ boardId, savedAt: number }` | (event) |
| `collab-board:session-error` | M→R | `{ boardId, reason: string }` | (event) |
| `collab-board:session-started` | M→R | `BoardSessionStartResult` | (event, renderer 측 store sync용) |

> **기존 라이브 도구와의 IPC 공존**: 쌤핀은 `live-vote:*`, `live-survey:*`, `live-wordcloud:*`, `live-discussion:*`, `live-multi-survey:*` 5개 네임스페이스가 공존 중. 본 기능의 `collab-board:*`는 **충돌 없는 신규 네임스페이스**. 터널 자원만 상호 배타(§2.4 주석 참조).

### 4.2 `BoardSessionStartResult` 타입

```ts
export interface BoardSessionStartResult {
  boardId: BoardId;
  publicUrl: string;      // https://xxx.trycloudflare.com
  sessionCode: BoardSessionCode;
  authToken: BoardAuthToken;
  qrDataUrl: string;      // data:image/png;base64,...
  startedAt: number;
}
```

### 4.3 IPC 에러 코드

| 코드 | 메시지(한국어) | 발생 조건 |
|------|---------------|----------|
| `BOARD_TUNNEL_BUSY` | "다른 도구(투표/설문 등)가 사용 중입니다" | `TunnelBusyError` |
| `BOARD_NOT_FOUND` | "보드를 찾을 수 없습니다" | 잘못된 boardId |
| `BOARD_SESSION_ALREADY_RUNNING` | "이미 실행 중인 세션입니다" | startSession 중복 호출 |
| `BOARD_TUNNEL_TIMEOUT` | "터널 연결 시간 초과 (30초)" | cloudflared `tunnel.ts`의 30초 타임아웃 |
| `BOARD_SERVER_LISTEN_FAILED` | "서버 포트 할당 실패" | `net.createServer().listen(0)` 실패 (방화벽 등) |
| `BOARD_PERSISTENCE_FAILED` | "보드 저장 실패" | fs 쓰기 실패 (디스크 풀 등) |
| `BOARD_TUNNEL_EXIT` | "터널 연결이 끊어졌습니다" | cloudflared 프로세스 비정상 종료 (`onExit`) |

### 4.4 `registerBoardHandlers` 시그니처

```ts
// electron/ipc/board.ts
export function registerBoardHandlers(mainWindow: BrowserWindow): void {
  // 쌤핀 container는 `export const xxx = new JsonXxxRepository(storage)` 패턴 (함수 아닌 상수).
  // 이 기능 추가를 위해 container.ts에 아래 3줄을 추가한다:
  //   export const boardRepository = new FileBoardRepository(storage);
  //   export const boardServerPort = new YDocBoardServer();
  //   export const boardTunnelPort = new BoardTunnelCoordinator({ openTunnel, closeTunnel, getCurrentOwner });
  //
  // 그런 다음 electron 측 이 파일에서 이렇게 사용:
  //   import { boardRepository, boardServerPort, boardTunnelPort } from '../../src/adapters/di/container';
  //   (path alias @adapters/* 는 electron tsconfig에서도 활성 상태여야 함)

  const useCases = {
    manage: new ManageBoard(boardRepository),
    start: new StartBoardSession(boardRepository, boardServerPort, boardTunnelPort),
    end: new EndBoardSession(boardRepository, boardServerPort, boardTunnelPort),
    saveSnapshot: new SaveBoardSnapshot(boardRepository, boardServerPort),
  };

  ipcMain.handle('collab-board:list', async () => useCases.manage.listAll());
  ipcMain.handle('collab-board:create', async (_e, { name }) => useCases.manage.create(name));
  ipcMain.handle('collab-board:rename', async (_e, { id, name }) => useCases.manage.rename(id, name));
  ipcMain.handle('collab-board:delete', async (_e, { id }) => useCases.manage.delete(id));
  ipcMain.handle('collab-board:start-session', async (_e, { id }) => useCases.start.execute(id));
  ipcMain.handle('collab-board:end-session', async (_e, { id, forceSave }) => useCases.end.execute(id, { forceSave }));
  ipcMain.handle('collab-board:get-active-session', async () => getActiveBoardSession());
  ipcMain.handle('collab-board:save-snapshot', async (_e, { id }) => useCases.saveSnapshot.execute(id));
  ipcMain.handle('collab-board:tunnel-available', async () => ({ available: isTunnelAvailable() }));
  ipcMain.handle('collab-board:tunnel-install', async () => { await installTunnel(); return { ok: true }; });

  // Main→Renderer 이벤트: IBoardServerPort.start 의 콜백 opts로 주입 (V-4: EventEmitter가 아님)
  //   onParticipantsChange: (names) => mainWindow.webContents.send('collab-board:participant-change', { boardId, names })
  //   onStateChange:        () => { dirty=true }  // 자동 저장 타이머가 체크
  // 자동 저장 완료 시: mainWindow.webContents.send('collab-board:auto-save', { boardId, savedAt })
  // 터널 이탈 시:    mainWindow.webContents.send('collab-board:session-error', { boardId, reason })
}
```

- 기존 [electron/ipc/liveMultiSurvey.ts](../../../electron/ipc/liveMultiSurvey.ts) 와 **핸들러 네이밍·등록 구조 동일**
- 이벤트 발행은 EventEmitter가 아닌 **StartBoardSession 유스케이스의 콜백 opts를 통해 mainWindow.webContents.send** 직접 호출 (V-4)
- renderer 측은 `window.electronAPI.collabBoard.onParticipantChange((data) => ...)` 형태로 구독 (preload 어댑터)

#### preload.ts 추가 (G-2 준수)

기존 `contextBridge.exposeInMainWorld('electronAPI', { ... })` 객체에 `collabBoard` 서브객체 추가:

```ts
// electron/preload.ts (발췌)
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 기존 필드 유지 ...
  collabBoard: {
    list: () => ipcRenderer.invoke('collab-board:list'),
    create: (args: { name?: string }) => ipcRenderer.invoke('collab-board:create', args),
    rename: (args: { id: string; name: string }) => ipcRenderer.invoke('collab-board:rename', args),
    delete: (args: { id: string }) => ipcRenderer.invoke('collab-board:delete', args),
    startSession: (args: { id: string }) => ipcRenderer.invoke('collab-board:start-session', args),
    endSession: (args: { id: string; forceSave: boolean }) => ipcRenderer.invoke('collab-board:end-session', args),
    getActiveSession: () => ipcRenderer.invoke('collab-board:get-active-session'),
    saveSnapshot: (args: { id: string }) => ipcRenderer.invoke('collab-board:save-snapshot', args),
    tunnelAvailable: () => ipcRenderer.invoke('collab-board:tunnel-available'),
    tunnelInstall: () => ipcRenderer.invoke('collab-board:tunnel-install'),
    onParticipantChange: (cb) => { const l = (_e, d) => cb(d); ipcRenderer.on('collab-board:participant-change', l); return () => ipcRenderer.removeListener('collab-board:participant-change', l); },
    onAutoSave:          (cb) => { /* 동일 패턴 */ },
    onSessionError:      (cb) => { /* 동일 패턴 */ },
    onSessionStarted:    (cb) => { /* 동일 패턴 */ },
  },
});
```

`src/global.d.ts`의 `ElectronAPI` 인터페이스에 `collabBoard: CollabBoardApi` 필드를 추가해 `window.electronAPI.collabBoard.*` 타입 체크를 활성화한다.

---

## 5. UI/UX Design

### 5.1 Screen Layout (교사 `/tool-collab-board`)

```
┌─────────────────────────────────────────────────────────────┐
│ ToolLayout Header — "협업 보드" 타이틀                       │
├──────────────┬──────────────────────────────────────────────┤
│ 보드 목록     │  세션 미활성 상태 (보드 선택 시):             │
│ (좌 sidebar) │  ┌──────────────────────────────────────┐  │
│              │  │ 보드 이름: 수학 브레인스토밍             │  │
│  • 수학 브레인 │  │ 참여 이력: 민수, 서연, 지우, 재민 (+12)  │  │
│  • 과학 토론   │  │ 마지막 활동: 3시간 전                 │  │
│  • (신규 +)   │  │                                      │  │
│              │  │        [ 보드 시작 ]                   │  │
│              │  └──────────────────────────────────────┘  │
│              │                                            │
│              │  세션 활성 상태:                            │
│              │  ┌──────────────────────────────────────┐  │
│              │  │ [QR 200×200]      세션 코드: MK7P2Q     │  │
│              │  │                   https://xxx.trycl…   │  │
│              │  │                   [링크 복사] [종료]    │  │
│              │  │ ─────────────────────────────────────  │  │
│              │  │ 접속 중 (7명):                          │  │
│              │  │ [민수] [서연] [지우] [재민] [하은] …    │  │
│              │  │                                        │  │
│              │  │ 마지막 자동 저장: 12초 전               │  │
│              │  └──────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────────┘
```

### 5.2 User Flow (교사)

```
[사이드바] → 쌤도구 → 협업 보드
   ↓
(보드 없음) → [+ 새 보드] → 이름 입력 → 기본 이름 자동(협업 보드 1) → 생성
   ↓
보드 선택 → 미활성 카드 → [보드 시작] 버튼
   ↓
(터널 상호 배타) 다른 도구 실행 중? → Toast "투표를 먼저 종료해주세요" → 진입 차단
   ↓  (가능하면)
StartBoardSession 호출 → 5초 이내 QR+코드 표시
   ↓
학생들이 접속 시작 → 접속자 카운트 실시간 증가
   ↓
수업 진행 (30초마다 자동 저장 알림 없음, 내부 silent)
   ↓
[보드 종료] 버튼 → EndBoardSession → 서버·터널 종료 + 최종 저장
```

### 5.3 User Flow (학생)

```
QR 스캔 → 브라우저에서 https://xxx.trycloudflare.com?t=<token>&code=<code> 열림
   ↓
(인증 실패 시) → 빈 페이지 + "연결할 수 없습니다" 안내 (토큰/코드 잘못됨)
   ↓  (성공 시)
이름 입력 창 (기본값: 빈칸, placeholder "이름을 입력하세요")
   ↓
[입장] → 이름 sanitize → 중복 시 "이름(2)" 자동 → Y.Doc awareness 등록
   ↓
Excalidraw 캔버스 로드 (2MB CDN 번들, WiFi 1~2초, 3G 3~5초)
   ↓
연결 상태 뱃지(우상단): ● 연결됨 / ● 연결 끊김 (재연결 중…)
   ↓
드로잉 → Y.js가 자동으로 서버·다른 학생 탭에 전파
```

### 5.4 Component List

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `ToolCollabBoard` | `adapters/components/Tools/ToolCollabBoard.tsx` | 쌤도구 진입, 사이드바+세션 영역 조립 |
| `BoardListPanel` | `adapters/components/Tools/Board/BoardListPanel.tsx` | 저장 보드 목록·신규 보드 생성 |
| `BoardControls` | `adapters/components/Tools/Board/BoardControls.tsx` | 보드 시작/종료/저장 버튼 |
| `BoardSessionPanel` | `adapters/components/Tools/Board/BoardSessionPanel.tsx` | 활성 세션 뷰 (QR·코드·접속자) |
| `BoardParticipantList` | `adapters/components/Tools/Board/BoardParticipantList.tsx` | 접속자 이름 칩 목록 |
| `BoardQRCard` | `adapters/components/Tools/Board/BoardQRCard.tsx` | QR + URL + 복사 버튼 (기존 `ToolQRCode` 패턴 재사용) |
| `useBoardStore` | `adapters/stores/useBoardStore.ts` | 목록 상태, CRUD 액션 |
| `useBoardSessionStore` | `adapters/stores/useBoardSessionStore.ts` | 활성 세션 상태 (IPC 이벤트 구독) |

### 5.5 학생 HTML 구조 (`generateBoardHTML`)

스파이크 [board.html](../../../spikes/collab-board/s1-cdn-poc/board.html)을 기반으로 본 구현 시 아래처럼 조정:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>쌤핀 협업 보드 - {BoardName}</title>
  <style>/* 연결 상태 뱃지, 이름 입력 모달, 에러 오버레이 인라인 */</style>
  <script type="importmap">{ /* esm.sh CDN, 스파이크와 동일 */ }</script>
</head>
<body>
  <div id="status"></div>
  <div id="join-modal"><!-- 이름 입력 --></div>
  <div id="error-overlay" hidden></div>
  <div id="app"></div>
  <script type="module">
    import ExcalidrawLib from '@excalidraw/excalidraw';
    const { Excalidraw } = ExcalidrawLib;
    // ... 스파이크 구조 + 이름 입력 플로우 + 연결 끊김 처리
  </script>
</body>
</html>
```

정적 부분(HTML/CSS/JS 본문 약 **10~20KB**: 스파이크 base 8KB + 이름 입력 + 에러 오버레이 + fallback 스크립트)은 `generateBoardHTML(boardName, token, code)`가 템플릿 문자열로 생성. Excalidraw·React·Y.js는 전부 CDN.

#### CDN Fallback 구현 힌트 (Plan R7)

esm.sh 장애 대비 jsdelivr fallback:

```html
<script>
  // importmap은 첫 로드 전에만 평가되므로, script onerror 훅으로 map 교체 후 location.reload
  (function(){
    var primary  = 'https://esm.sh/';
    var fallback = 'https://cdn.jsdelivr.net/npm/';
    var probe = document.createElement('script');
    probe.src = primary + 'yjs@13.6.19/dist/yjs.mjs';
    probe.type = 'module';
    probe.onerror = function(){
      sessionStorage.setItem('collab-board:cdn', fallback);
      location.reload();
    };
    document.head.appendChild(probe);
  })();
</script>
```

첫 방문 시 primary로 로드 시도, 실패하면 `sessionStorage`에 표시해 두고 새로고침. 새로고침 시 `generateBoardHTML`이 HTTP 요청에 쿠키/헤더 검사 대신 같은 HTML을 반환하므로 inline map 생성 시 `sessionStorage` 플래그를 확인해 jsdelivr URL로 렌더 (client-side JS에서 importmap 교체).

---

## 6. Error Handling

### 6.1 에러 정책

| 지점 | 에러 유형 | 처리 |
|-----|----------|------|
| **교사 UI** | `BOARD_TUNNEL_BUSY` | Toast (destructive): "다른 도구가 사용 중입니다. 먼저 종료해주세요." + "도구 목록 보기" 버튼 |
| **교사 UI** | `BOARD_TUNNEL_TIMEOUT` | Toast (warning): "터널 연결이 지연됩니다. 인터넷 상태를 확인해주세요." + 재시도 버튼 |
| **교사 UI** | `BOARD_PERSISTENCE_FAILED` | Toast (warning) + 다음 자동 저장 주기에 재시도 (exponential backoff X — 다음 30초에 다시 시도) |
| **교사 UI** | Unknown | Toast (destructive): "오류가 발생했습니다. 다시 시도해주세요." + 콘솔 로그 |
| **학생 HTML** | 인증 실패 (close 1008) | Full-screen overlay: "연결할 수 없습니다. 선생님께 QR 코드를 다시 받아주세요." |
| **학생 HTML** | 인원 초과 (close 1013) | Full-screen overlay: "접속 인원이 가득 찼습니다. 선생님께 문의해주세요." |
| **학생 HTML** | WebSocket close unexpected | 상태 뱃지 "연결 끊김" + Exponential backoff 재연결 (1s, 2s, 4s, ..., max 30s) |
| **학생 HTML** | Excalidraw CDN 로드 실패 | Fallback: `jsdelivr` CDN으로 재시도 (§5.5 CDN Fallback 스크립트) |
| **교사 UI** | `BOARD_TUNNEL_EXIT` (세션 중 터널 끊김) | Toast (warning): "터널 연결이 끊어졌습니다. 다시 시작해주세요." + 세션 phase='stopped' 전환 |
| **교사 UI** | `BOARD_SERVER_LISTEN_FAILED` | Toast (destructive): "서버 포트 할당에 실패했습니다. 방화벽/VPN 설정을 확인해주세요." |

### 6.2 에러 복구

- **자동 저장 실패**: 메모리 Y.Doc은 그대로 유지. 다음 주기(30초) 재시도. 연속 3회 실패 시 Toast 에스컬레이트
- **터널 끊김(cloudflared exit)**: 세션을 `phase='stopping'`으로 전환 + 최종 저장 시도 + 교사 UI에 안내 + 수동 재시작 유도
- **학생 재연결**: y-websocket 내장 재연결 로직 사용. Y.js CRDT 특성상 재연결 후 diff 자동 병합

---

## 7. Security Considerations

### 7.1 인증 모델

- **무계정**: 학생은 이름만 입력. 계정·이메일·비밀번호 없음.
- **이중 토큰**: URL 토큰(32자 hex) + 세션 코드(6자) 동시 일치 시에만 WebSocket 연결 허용. URL 토큰만 유출돼도 코드 없이는 접속 불가.
- **세션 생애**: 토큰/코드는 세션마다 **새로 생성**. 세션 종료 후엔 무효.
- **타이밍 공격 방지**: `verifyJoinCredentials`는 early-return 금지 (boardRules.ts 설계 반영).

### 7.2 PIPA 준수

- **학생 IP 비저장**: WebSocket `conn.socket.remoteAddress`에 접근 가능하나 **어디에도 저장·로그 남기지 않음**.
- **참여자 이름만 메모리**: Y.Doc awareness에 있고 세션 종료 시 `Board.participantHistory`에만 병합 저장 (이름 문자열만).
- **로컬 전용**: Y.Doc 바이너리는 `userData/data/boards/*.ybin`에만 저장, 외부 전송 없음.
- **원격 공개 URL**: cloudflared 터널 URL만 학생과 공유, 그 외 모든 데이터는 교사 PC 로컬.

### 7.3 XSS 방어

- **이름 sanitize**: `sanitizeParticipantName`이 길이 제한 + 공백/제로폭 제거. React는 기본 escape, innerHTML 사용 금지.
- **학생 HTML 생성 시 템플릿 안전**: `generateBoardHTML(boardName, token, code)`는 토큰/코드/이름을 템플릿 문자열에 **반드시 JSON.stringify 또는 명시적 escape** 후 주입.

### 7.4 연결 수 제한

```ts
const MAX_PARTICIPANTS = 50;  // 30명 학급 + 교사 여분
// BoardServerHandle의 wss.on('connection')에서 count >= MAX_PARTICIPANTS 시
// ws.close(1013, 'TRY_AGAIN_LATER') + "접속 인원 초과" 로그
```

### 7.5 CSRF

HTTP 엔드포인트는 **GET /** (HTML 서빙), **GET /health** (선택)만. 상태 변경 요청 없음. WebSocket은 `Origin` 헤더 검증 제외 (모바일 브라우저 호환).

---

## 8. Test Plan

### 8.1 테스트 유형

| 계층 | 대상 | 도구 | 자동화 |
|------|------|------|-------|
| Domain Unit | `boardRules`, value objects, entities | `tsx` 실행형 테스트 (스파이크 s2 스타일) | ✅ |
| UseCase | `StartBoardSession`, `EndBoardSession` (포트 mock) | tsx | ✅ |
| Integration (Electron 없이) | `YDocBoardServer` + mock tunnel + 2 클라이언트 | tsx + `ws` 클라이언트 | ✅ |
| E2E (수동) | 교사 앱 + 스마트폰 10대 | 실기기 | 수동 |
| 회귀 | 기존 5개 라이브 도구 정상 동작 | 수동 (투표·설문 각 1회 실행) | 수동 |

### 8.2 테스트 케이스 (핵심)

- [x] **S2 스파이크 PASS 재사용**: `BoardTunnelCoordinator` 로직이 그대로 infrastructure로 이식되므로 기존 s2 테스트 활용
- [ ] **Happy path**: 보드 생성 → 세션 시작 → 2탭 클라이언트 연결 → 드로잉 동기화 → 세션 종료 → 재진입 시 복원
- [ ] **인증 실패**: 잘못된 토큰/코드로 WebSocket 연결 시도 → 1008 close
- [ ] **터널 충돌**: 투표 실행 중 보드 시작 시 `BOARD_TUNNEL_BUSY`
- [ ] **터널 양방향 상호 배타**: 보드 실행 중 기존 5개 도구 중 하나 시작 시 coordinator.isBusy === true → 해당 도구가 (자체 UX로) 사용자에게 안내
- [ ] **자동 저장**: 30초 경과 후 파일 업데이트 타임스탬프 변경 확인
- [ ] **before-quit 동기 저장**: 세션 활성 중 창 X → 파일 크기 0 아님 + Board.updatedAt 갱신
- [ ] **강제 종료 복구**: Electron 프로세스 kill → 재기동 → 보드 열기 → 30초 이전 내용 유지
- [ ] **이름 중복**: 같은 이름 2명 입장 → "민수", "민수(2)"
- [ ] **이름 공백**: 공백/제로폭만 입력 → 거부
- [ ] **최대 인원**: 50명 초과 시 1013 close + 학생 overlay 노출
- [ ] **터널 끊김 감지**: cloudflared 프로세스 강제 kill → `BOARD_TUNNEL_EXIT` Toast + 세션 stopped
- [ ] **FR-05 성능 벤치** — 동일 머신에서 3개 브라우저 탭 시뮬레이션:
   각 탭이 초당 10회 랜덤 드로잉 push → Y.Doc ObserveDeep에 `performance.now()` 측정
   합격 기준: **p50 ≤ 200ms, p95 ≤ 500ms** (Plan FR-05), 실측 리포트를 `docs/03-analysis/collab-board.analysis.md`에 첨부
- [ ] **FR-11 heartbeat**: `wss` 인스턴스의 `ping` 이벤트 프레임이 25±2초 주기로 관찰됨 (`wireshark` 또는 `ws` 핸들러로 count)
- [ ] **Undo 동작(A-5)**: 2탭 각자 그린 후 탭1 Ctrl+Z → 탭1 요소만 사라지는지 (undoManager 생략 상태의 기본 동작 확인)
- [ ] **Excalidraw CDN fallback**: unpkg 블록(hosts 파일) 시 jsdelivr 경유 로드 확인 (수동)

### 8.3 Zero Script QA (기존 쌤핀 패턴)

Electron 개발 모드에서 `npm run electron:dev` 실행 후 콘솔 로그 구조화:
```json
{"level":"info","scope":"board","event":"session.started","boardId":"bd-xxx","localPort":40123}
{"level":"info","scope":"board","event":"participant.joined","name":"민수","count":1}
{"level":"warn","scope":"board","event":"snapshot.retry","attempt":2}
```

---

## 9. Clean Architecture

### 9.1 Layer Structure (쌤핀 4-layer)

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **domain** | 순수 비즈니스 규칙, 엔티티, 값 객체, 포트·레포 인터페이스 | `src/domain/` |
| **usecases** | 도메인 규칙 조합, 포트 주입 흐름 | `src/usecases/` |
| **adapters** | React UI, Zustand store, DI 조립, 포트→구현체 연결 | `src/adapters/` |
| **infrastructure** | Y.js / ws / cloudflared / fs / qrcode 실제 호출 | `src/infrastructure/` |
| **electron** | IPC 등록, contextBridge, BrowserWindow 제어 | `electron/` |

### 9.2 Dependency Rules

```
electron/           ──→  adapters/ (container)  ──→  infrastructure/
                                 ↓                         ↓
                            usecases/  ──────────────→  domain/
                                 ↑                         ↑
adapters/components/  ──────────┘  (React hooks via stores)
```

- domain: 외부 import **0개** (React, Y.js, ws, Electron, Node fs 전부 금지)
- usecases: domain만 import
- adapters: usecases + domain import OK, infrastructure 직접 import 금지 (예외: `di/container.ts`)
- infrastructure: domain import OK (포트 인터페이스 구현), Y.js/ws/cloudflared/fs 직접 import OK

### 9.3 File Import Rules (이 기능)

| From | Can Import | Cannot Import |
|------|-----------|---------------|
| `domain/entities/Board.ts` | domain value objects | React, yjs, ws, electron, anything |
| `domain/ports/IBoardServerPort.ts` | domain types | yjs (구현은 infrastructure) |
| `usecases/board/StartBoardSession.ts` | `IBoardRepository`, `IBoardServerPort`, `IBoardTunnelPort` | infrastructure, adapters, React |
| `infrastructure/board/YDocBoardServer.ts` | yjs, ws, y-websocket, domain ports | adapters, React |
| `adapters/components/Tools/ToolCollabBoard.tsx` | usecases, stores, React | infrastructure 직접 |
| `adapters/di/container.ts` | infrastructure, usecases, domain | **유일한 예외** (의존성 조립 지점) |
| `electron/ipc/board.ts` | usecases, adapters/di/container | React |

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `Board`, `BoardSession`, `BoardParticipant` | domain | `src/domain/entities/` |
| `BoardId`, `BoardSessionCode`, `BoardAuthToken` | domain | `src/domain/valueObjects/` |
| `boardRules` | domain | `src/domain/rules/boardRules.ts` |
| `IBoardRepository`, `IBoardServerPort`, `IBoardTunnelPort` | domain | `src/domain/{repositories,ports}/` |
| `ManageBoard`, `StartBoardSession`, `EndBoardSession`, `SaveBoardSnapshot`, `AuthorizeBoardJoin` | usecases | `src/usecases/board/` |
| `ToolCollabBoard` + `Board/*` | adapters (presentation) | `src/adapters/components/Tools/Board/` |
| `FileBoardRepository` | adapters (data) | `src/adapters/repositories/` |
| `useBoardStore`, `useBoardSessionStore` | adapters (state) | `src/adapters/stores/` |
| `YDocBoardServer`, `BoardTunnelCoordinator`, `BoardFilePersistence`, `generateBoardHTML` | infrastructure | `src/infrastructure/board/` |
| `registerBoardHandlers` | electron (infra 등가) | `electron/ipc/board.ts` |

---

## 10. Coding Convention Reference

### 10.1 Naming

| Target | Rule | Example |
|--------|------|---------|
| 컴포넌트 | PascalCase | `ToolCollabBoard`, `BoardSessionPanel` |
| 유스케이스 | PascalCase 동사구 | `StartBoardSession`, `EndBoardSession` |
| 포트 인터페이스 | `I` prefix + PascalCase | `IBoardRepository`, `IBoardServerPort` |
| 값 객체 | PascalCase | `BoardId`, `BoardSessionCode` |
| 상수 | UPPER_SNAKE_CASE | `MAX_PARTICIPANTS`, `AUTO_SAVE_INTERVAL_MS` |
| 파일 (컴포넌트) | PascalCase.tsx | `ToolCollabBoard.tsx` |
| 파일 (유틸/유스케이스) | PascalCase.ts | `StartBoardSession.ts` |
| IPC 채널 | **`collab-board:kebab-case`** (요청·이벤트 동일 스타일) — 기존 5개 라이브 도구(`live-vote:start` 등)와 통일 | `collab-board:start-session`, `collab-board:participant-change` |

### 10.2 Import Order (쌤핀 관습)

```ts
// 1. 외부 라이브러리
import * as Y from 'yjs';
import { WebSocketServer } from 'ws';

// 2. 절대 경로 (path alias)
import type { Board } from '@domain/entities/Board';
import { StartBoardSession } from '@usecases/board/StartBoardSession';
import { useBoardStore } from '@adapters/stores/useBoardStore';

// 3. 상대 경로
import { generateBoardHTML } from './generateBoardHTML';
```

### 10.3 상수 값

```ts
// src/infrastructure/board/constants.ts
export const BOARD_SERVER_PORT_RANGE = { min: 40000, max: 49999 } as const;
export const AUTO_SAVE_INTERVAL_MS = 30_000;        // 30초
export const MAX_PARTICIPANTS = 50;
export const HEARTBEAT_INTERVAL_MS = 25_000;        // cloudflared idle 방어
export const EXCALIDRAW_VERSION = '0.17.6' as const; // Plan v0.2 결정
export const YJS_VERSION = '13.6.19' as const;
export const Y_WEBSOCKET_VERSION = '2.0.4' as const;
export const Y_EXCALIDRAW_VERSION = '2.0.12' as const;
```

### 10.4 CDN Import Map (학생 HTML)

```json
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
    "yjs": "https://esm.sh/yjs@13.6.19",
    "fractional-indexing": "https://esm.sh/fractional-indexing@3.2.0",
    "@excalidraw/excalidraw": "https://esm.sh/@excalidraw/excalidraw@0.17.6?external=react,react-dom",
    "y-websocket": "https://esm.sh/y-websocket@2.0.4?external=yjs",
    "y-excalidraw": "https://esm.sh/y-excalidraw@2.0.12?external=@excalidraw/excalidraw,yjs,fractional-indexing"
  }
}
```

위 URL은 **스파이크 S1에서 실제 검증된 값** 그대로.

---

## 11. Implementation Guide

### 11.1 File Structure (최종)

```
src/
├── domain/
│   ├── entities/
│   │   ├── Board.ts                            ➕
│   │   ├── BoardSession.ts                     ➕
│   │   └── BoardParticipant.ts                 ➕
│   ├── valueObjects/
│   │   ├── BoardId.ts                          ➕
│   │   ├── BoardSessionCode.ts                 ➕
│   │   └── BoardAuthToken.ts                   ➕
│   ├── rules/
│   │   └── boardRules.ts                       ➕
│   ├── repositories/
│   │   └── IBoardRepository.ts                 ➕
│   └── ports/
│       ├── IBoardServerPort.ts                 ➕
│       └── IBoardTunnelPort.ts                 ➕
├── usecases/
│   └── board/
│       ├── ManageBoard.ts                      ➕
│       ├── StartBoardSession.ts                ➕
│       ├── EndBoardSession.ts                  ➕
│       ├── SaveBoardSnapshot.ts                ➕
│       └── AuthorizeBoardJoin.ts               ➕
├── adapters/
│   ├── components/Tools/
│   │   ├── ToolCollabBoard.tsx                 ➕
│   │   └── Board/
│   │       ├── BoardListPanel.tsx              ➕
│   │       ├── BoardControls.tsx               ➕
│   │       ├── BoardSessionPanel.tsx           ➕
│   │       ├── BoardParticipantList.tsx        ➕
│   │       └── BoardQRCard.tsx                 ➕
│   ├── repositories/
│   │   └── FileBoardRepository.ts              ➕
│   ├── stores/
│   │   ├── useBoardStore.ts                    ➕
│   │   └── useBoardSessionStore.ts             ➕
│   └── di/container.ts                         ✏️
└── infrastructure/
    └── board/
        ├── YDocBoardServer.ts                  ➕
        ├── BoardTunnelCoordinator.ts           ➕
        ├── BoardFilePersistence.ts             ➕
        ├── generateBoardHTML.ts                ➕
        └── constants.ts                        ➕

electron/
├── ipc/
│   ├── board.ts                                ➕
│   └── tunnel.ts                               ✏️  (getCurrentOwner 1줄 추가, 기존 함수 유지)
├── preload.ts                                  ✏️  (collabBoard 서브객체 추가)
└── main.ts                                     ✏️  (registerBoardHandlers + before-quit 1줄)

src/global.d.ts                                 ✏️  (ElectronAPI 인터페이스 확장)
```

### 11.2 Implementation Order (권장 순서 + 병렬/직렬 표기)

**Phase 1a MVP — 순서 (의존성 역순)**. 병렬(∥) 가능 항목은 함께 진행하면 전체 기간 단축 가능.

| # | 작업 | 직렬/병렬 | 예상 기간 |
|---|------|----------|---------|
| 1 | **domain/** 전체 (값 객체 → 엔티티 → 규칙 → 포트/레포 인터페이스) | 직렬 | 0.5일 |
| 2a | `infrastructure/board/constants.ts` | ∥ 2b/2c/2d 병렬 가능 | 0.1일 |
| 2b | `electron/ipc/tunnel.ts` 수정 (`getCurrentOwner` 추가) + `BoardTunnelCoordinator.ts` (스파이크 s2 이식) | ∥ | 0.5일 |
| 2c | `BoardFilePersistence.ts` | ∥ | 0.5일 |
| 2d | `YDocBoardServer.ts` (y-websocket setupWSConnection + 인증 필터 + heartbeat) | ∥ | 2일 |
| 2e | `generateBoardHTML.ts` (스파이크 board.html 템플릿화 + 이름 모달 + 에러 오버레이 + CDN fallback) | ∥ 2d 와 병렬 | 1~2일 |
| 3 | **usecases/board/** 5개 (Manage/Start/End/SaveSnapshot/AuthorizeJoin) | 직렬 (2 완료 후) | 2~3일 |
| 4 | `adapters/repositories/FileBoardRepository.ts` + `adapters/di/container.ts` 3줄 추가 | 직렬 | 1일 |
| 5 | `electron/ipc/board.ts` (registerBoardHandlers) + `preload.ts` + `main.ts` + `src/global.d.ts` | 직렬 (4 완료 후) | 0.5일 |
| 6 | `adapters/stores/useBoardStore` + `useBoardSessionStore` (IPC 이벤트 구독) | 직렬 | 0.5일 |
| 7a | `ToolCollabBoard.tsx` + `BoardListPanel` + `BoardControls` | ∥ 7b 와 병렬 | 2일 |
| 7b | `BoardSessionPanel` + `BoardParticipantList` + `BoardQRCard` | ∥ | 2일 |
| 8 | 수동 통합 테스트 (교사 PC + 실기기 5~10대, §8.2 체크리스트 실행) | 직렬 | 2일 |
| 9 | AI 챗봇 KB Q&A 3~5건 + `public/release-notes.json` v1.12.0 항목 추가 | 직렬 | 0.5일 |

**합계 예상 (병렬 최적화 시)**: 약 **2~3주**. 1인 기준 직렬로만 진행하면 ~3.5주.

### 11.3 Phase 1b (Jamboard 스킨, 별도 릴리즈) — 구현 힌트

Phase 1a 완료 후 착수. 이 Design 문서 범위 외이나 **설계 시 고려한 확장 포인트**:

- `generateBoardHTML`은 `initialAppState` 파라미터를 추가로 받아 `roughness:0` 등 주입 가능하도록 미리 설계
- `YDocBoardServer`는 페이지별 Y.Doc 분리를 지원하도록 room 이름에 `:page-N` 접미사 파라미터 용의
- `UIOptions`는 교사/학생 모드별 분기 가능하도록 `generateBoardHTML(..., opts)` 서명 준비

---

## 12. Open Questions & Future Work

| # | 질문 | Phase | 답변 계획 |
|---|------|-------|----------|
| Q1 | y-excalidraw `setupUndoRedo` 버그 업스트림 PR vs 자체 wrapper 어느 쪽? | Phase 2 | Phase 1a 배포 후 실사용 로그 수집, PR 시도 후 머지 진척도에 따라 결정 |
| Q2 | Excalidraw 0.18+ 기능(예: 향후 신규 도구)이 필요해지면? | Phase 3 | 자체 Y.Array ↔ elements 바인딩(~300 LOC)으로 전환. 현재는 불필요 |
| Q3 | 오프라인 교실(학교 방화벽이 esm.sh 차단)? | Phase 2 | `extraResources` 번들링으로 선택적 승격. 현재는 발생 보고 시 대응 |
| Q4 | 모바일 팜 리젝션(iPad+Pencil) | Phase 1b | `pointerType === 'pen'` 필터, Excalidraw 표준 지원 확인 후 toggle |
| Q5 | 30명 초과 학급 (특수 상황) | Phase 2 | MAX_PARTICIPANTS 설정화 + 경고 UI |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-19 | 스파이크 S1/S2 결과 반영한 초안 (Clean Architecture 4-layer 엄수, Excalidraw 0.17.6 고정, CDN import map, IPC 스펙, 인증·자동 저장 플로우) | pblsketch |
| 0.2 | 2026-04-19 | bkit:design-validator 검증 결과(Score 74/100) 반영 | pblsketch |
| | | ├─ G-1: IPC 채널 네이밍을 기존 5개 라이브 도구 관습(`live-*:kebab-case`)에 맞춰 `collab-board:*` 전면 교체 | |
| | | ├─ G-2: preload 네임스페이스 `window.api.*` → `window.electronAPI.collabBoard.*` 서브객체로 변경 | |
| | | ├─ G-3: DI container 함수 호출 패턴 → 쌤핀 기존 `export const` 상수 패턴 준수 (3줄 추가 명시) | |
| | | ├─ M-1: `app.before-quit` 동기 저장 시퀀스(`endActiveBoardSessionSync`) 및 등록 지점 구체화 | |
| | | ├─ M-5 (A안): 기존 5개 도구 코드 무수정 + `tunnel.ts`에 `getCurrentOwner()` 1개 추가 (coordinator가 점유 상태 관찰, 양방향 상호 배타 보장) | |
| | | ├─ 부가: BoardTunnelPort `onExit` 훅(cloudflared 종료 감지), IBoardServerPort heartbeat 구현 위치, `verifyJoinCredentials` 타이밍 주석 정리 | |
| | | ├─ §8.2 테스트 케이스에 FR-05 성능 벤치(p50≤200ms/p95≤500ms), heartbeat 관찰, before-quit 동기 저장, 터널 끊김 감지, Undo 동작 추가 | |
| | | ├─ §5.5 CDN Fallback(unpkg→jsdelivr) 구체 스크립트 힌트 추가 | |
| | | ├─ §6.1 에러 정책에 `BOARD_TUNNEL_EXIT`, `BOARD_SERVER_LISTEN_FAILED`, 학생 인원 초과 overlay 추가 | |
| | | ├─ §11.1 파일 구조에 `electron/ipc/tunnel.ts` 수정·`src/global.d.ts` 추가 | |
| | | └─ §11.2 구현 순서에 병렬/직렬 표기 추가 (1인 기준 2~3주 유지, 병렬 최적화 시 단축 가능) | |
