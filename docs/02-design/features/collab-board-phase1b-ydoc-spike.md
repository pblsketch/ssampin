template: design-spike
version: 0.1
feature: collab-board-phase1b
topic: page-system-ydoc-split
date: 2026-04-21
status: spike — 실제 PoC 코드 작성 전 설계 검토 단계
depends_on: collab-board-phase1b.plan.md §3.3
---

# 협업 보드 페이지 시스템 — Y.Doc 분리 설계 스파이크

> **목적**: Phase 1b Nice-to-have인 "Jamboard 스타일 페이지 시스템" 도입을 위해
> Y.Doc 구조를 어떻게 확장해야 하는지 3개 옵션을 검토하고, 실제 PoC 전에
> 추천안과 검증 필요 가설을 정리한다.

---

## 1. 문제 정의

### 현재 구조의 한계

Phase 1a 구조는 보드 1개 = Y.Doc 1개 = Excalidraw scene 1개다.

- `YDocBoardServer.ts:200` — `setupWSConnection(ws, req, { docName: roomName })`에서 y-websocket 내부 `docs` 맵이 `roomName`(`bd-xxx`)을 키로 단일 `YwsSharedDoc`을 생성한다. 외부에서 `new Y.Doc()`을 직접 만들지 않는다.
- `generateBoardHTML.ts:178-179` — 학생 측은 `ydoc.getArray('elements')`와 `ydoc.getMap('assets')`를 꺼내 `ExcalidrawBinding`에 넘기고, 이것이 Excalidraw의 유일한 scene과 일대일로 연결된다.
- `BoardFilePersistence.ts:79-87` — `Y.encodeStateAsUpdate(doc)` 결과를 `{boardId}.ybin` 단일 파일에 저장한다.

### 페이지 전환 시 발생하는 버그 가능성

Excalidraw API에는 `updateScene({ elements: [] })`나 `resetScene()`으로 캔버스를 비우는 메서드가 있다. 단일 Y.Doc 구조에서 페이지를 바꾸려면 이 메서드를 호출하는 수밖에 없는데, 이렇게 하면:

1. 로컬 Excalidraw 인스턴스의 elements 배열이 비워지면서 Y.js mutation이 발생한다.
2. `ExcalidrawBinding`이 이 mutation을 `yElements`에 반영하고,
3. y-websocket이 delta를 다른 모든 참여자에게 브로드캐스트한다.
4. **결과: 모든 학생의 캔버스가 동시에 초기화**된다.

이것은 교사가 페이지 2로 이동하는 순간 페이지 1에서 작업 중이던 학생들의 화면이 전부 날아가는 치명적 UX 결함이다.

---

## 2. 옵션 A — docName suffix 분리

docName을 `{boardId}-page-{n}` 형태로 확장한다. 페이지마다 y-websocket 내부에 별도 `YwsSharedDoc`이 생기며, 학생 측은 페이지 전환 시 `WebsocketProvider`를 끊고 새 room에 재연결한다.

```
bd-abc123-page-1  →  YwsSharedDoc #1
bd-abc123-page-2  →  YwsSharedDoc #2
```

**서버 측 변경**: `setupWSConnection` 호출은 그대로 유지. 클라이언트가 보내는 roomName이 달라지기만 하면 y-websocket이 알아서 별도 문서를 관리한다.

**클라이언트 측 변경**:
```js
provider.disconnect(); provider.destroy(); binding.destroy();
const newRoomName = `${BOARD_ID}-page-${pageNum}`;
const newProvider = new WebsocketProvider(wsUrl, newRoomName, ydoc, { params });
const newBinding = new ExcalidrawBinding(yElements, yAssets, api, newProvider.awareness);
```

**장점**: 서버 코드 변경 최소, 페이지 간 완전한 격리, 저장 전략 단순 (`{boardId}-page-{n}.ybin`).

**단점**: y-excalidraw 바인딩 재연결 비용, 300ms 딜레이 동안 빈 캔버스 노출, 페이지 전환 감지 별도 채널(awareness) 필요, `ywsUtils.docs` 항목 증가.

---

## 3. 옵션 B — 단일 Y.Doc + Y.Map으로 페이지 중첩

기존 단일 Y.Doc을 유지하되, 최상위 구조를 `Y.Map('pages')`로 바꾼다.

```js
const yPages = ydoc.getMap('pages');
const yElements = yPages.get('page-1') ?? new Y.Array();
```

**장점**: WebsocketProvider 1개만 유지 (재연결 없음), 단일 `.ybin` 파일.

**단점**: y-excalidraw 2.0.12가 Y.Array 런타임 교체를 지원하는지 미확인. 구조 복잡화.

**핵심 미확인 가설**: `ExcalidrawBinding`이 Y.Array 인스턴스 swap을 지원하는가?

---

## 4. 옵션 C — 단일 Y.Doc + Y.Array per page, Excalidraw 재마운트

Y.Doc은 단일 유지, 페이지별 `ydoc.getArray('page-1')` 형태. 페이지 전환 시 Excalidraw React 컴포넌트 전체를 `key` prop으로 unmount/remount.

**장점**: WebsocketProvider 재연결 불필요, Y.Map 중첩 없이 단순.

**단점**: Excalidraw 재마운트 시간 ~500ms, 인라인 HTML 구조 대폭 수정 필요, 300ms 딜레이 반복.

---

## 5. 저장 전략 비교

| 옵션 | `.ybin` 구조 | 로드 시 복원 |
|------|-------------|------------|
| **A** | `{boardId}-page-{n}.ybin` (페이지별 파일) | 세션 시작 시 존재 파일 순서 로드 |
| **B** | `{boardId}.ybin` (단일 파일, Y.Map 전체) | 기존과 동일, 한 번의 `applyUpdate` |
| **C** | `{boardId}.ybin` (단일, 여러 Y.Array) | 기존과 동일 |

---

## 6. 학생 측 영향 — 현재 페이지 공유

교사가 페이지 n으로 이동했을 때 학생 화면도 자동 전환되어야 한다. Y.js awareness 활용:

```js
// 교사 측
awareness.setLocalStateField('host', { currentPage: 2 });
// 학생 측
provider.awareness.on('change', () => { /* host.currentPage 감지해 switchToPage */ });
```

**주의**: 현재 `YDocBoardServer`는 awareness를 이름 감지용으로만 사용. 교사 측 awareness 설정 API 추가 노출 필요.

---

## 7. 권장안 — 옵션 A (docName suffix 분리)

**근거**:
1. **서버 코드 변경 최소**: y-websocket의 `setupWSConnection`이 docName 기반으로 이미 문서 격리. 추가 구현 없이 페이지 간 완전 격리 달성.
2. **y-excalidraw 미검증 API 미의존**: 옵션 B는 핵심 가설 실패 시 옵션 A와 비용 동일해짐 + 복잡도만 높음.
3. **Phase 1a 아키텍처 패턴과 일치**: `YDocBoardServer`가 roomName 기반 단일 조회 패턴 사용.
4. **저장 전략 단순**: 페이지별 파일은 복원 로직 명확, 손상 시 부분 복구 가능.

**수용 가능한 단점**: 재연결 비용 ~300ms → 로딩 스피너로 커버. cleanup 범위 확대 → 루프 처리.

---

## 8. 검증 필요 항목 (스파이크 작업 리스트)

| # | 가설 | 검증 방법 | 실패 시 영향 |
|---|------|-----------|------------|
| S1 | `binding.destroy()`가 메모리 누수 없이 정리되는가 | Chrome DevTools Memory로 리스너 잔존 확인 | 페이지 전환 메모리 누적 |
| S2 | y-excalidraw가 Y.Array 런타임 교체 지원? | ExcalidrawBinding 소스 확인 + 실험 | 옵션 B 불가 확정 |
| S3 | 재연결 후 초기 데이터 복원 정상? | 옵션 A 미니 PoC (페이지 1→2→1 왕복) | `applyUpdate` 패턴 조정 필요 |
| S4 | 30명 awareness 동기화 지연 허용 가능? | 로컬 N클라이언트 측정 | 별도 control 채널 필요 |
| S5 | 페이지 다수 시 메모리 사용 허용? | 5페이지 × 30명 Node.js 메모리 측정 | 페이지 상한선 정책 필요 |

---

## 9. 참고 코드 위치

| 역할 | 경로 |
|------|------|
| y-websocket 서버 래퍼 | `src/infrastructure/board/YDocBoardServer.ts` |
| 학생 HTML 생성 | `src/infrastructure/board/generateBoardHTML.ts` |
| Y.Doc 바이너리 저장/로드 | `src/infrastructure/board/BoardFilePersistence.ts` |
| 공통 상수 | `src/infrastructure/board/constants.ts` |
| Phase 1b 계획서 §3.3 | `docs/01-plan/features/collab-board-phase1b.plan.md` |
| Phase 1a 설계 문서 | `docs/02-design/features/collab-board.design.md` |
