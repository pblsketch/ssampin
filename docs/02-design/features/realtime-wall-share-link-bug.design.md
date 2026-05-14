# Design — realtime-wall-share-link-bug

> Phase: Design · 짧은 design (UX 회귀 핫픽스)
> Plan: [`docs/01-plan/features/realtime-wall-share-link-bug.plan.md`](../../01-plan/features/realtime-wall-share-link-bug.plan.md)

---

## 1. 진단 결정 트리 (qa 가 RG 시나리오로 사용)

```
"학생 참여 시작" 클릭
   │
   ├─ liveError 토스트 노출?
   │     ├─ "데스크톱 앱에서만" → window.electronAPI 미주입 (브라우저 모드). 정상 가드.
   │     ├─ "협업 보드 실행 중" → 보드 세션 종료 후 재시도. 정상 가드.
   │     └─ "서버를 시작할 수 없습니다" → IPC 실패. main.ts/preload 회귀 의심 (현재 origin/main 기준 정상).
   │
   ├─ 보드 뷰가 풀-사이즈 전환됨? (`isLiveMode === true`)
   │     ├─ 예 → 우측 56px ActionBar 의 share 버튼이 enabled?
   │     │       ├─ 예 → 공유 드로어가 자동으로 열림? ← **여기서 NO 가 현재 버그**
   │     │       └─ 아니오 → setIsLiveMode(true) 전파 회귀 (현재는 정상 작동)
   │     └─ 아니오 → handleStartLive try/catch silent failure
   │
   └─ 공유 드로어가 열렸다면 QR/URL/짧은 코드 영역 노출?
         ├─ QR 캔버스 — displayUrl 있으면 그려짐
         ├─ "QR 준비 중..." — tunnelLoading=true (cloudflared 다운로드/연결 중)
         └─ "주소 생성 실패" — tunnelError 셋팅. ShareSectionBody 가 `tunnelError` 메시지 + "다시 시도" 노출
```

---

## 2. 수정 설계

### F-1: 라이브 시작 시 공유 드로어 자동 오픈 (필수)

**파일**: `src/adapters/components/Tools/ToolRealtimeWall.tsx`

**변경 (`handleStartLive` 흐름)**:
```typescript
// Before (현재)
setIsLiveMode(true);
setConnectedStudents(0);
await connectTunnel();

// After
setIsLiveMode(true);
setConnectedStudents(0);
setBoardSettingsDrawer('share'); // ← 공유 패널 자동 노출
await connectTunnel();
```

근거:
- `boardSettingsDrawer === 'share'` 일 때 Drawer §0 ShareSectionBody 가 렌더 (`RealtimeWallBoardSettingsDrawer.tsx:419-424`)
- ShareSectionBody 는 `tunnelLoading` / `tunnelError` 상태를 자체 처리하므로 connectTunnel 진행 단계도 사용자에게 즉시 보임 ("외부 접속 주소를 만드는 중입니다.")
- `share` prop 은 `isLiveMode ? (...) : undefined` 로 가드 (line 1496) → 라이브 진입 후 정상 채워짐
- 자동 오픈이 사용자가 다른 작업을 막지 않음 (drawer 는 side='right' / size='md' overlay, 닫기 버튼 명확)

### F-2: 보드 영역 상단 슬림 라이브 상태 칩 (사용자 안전망)

**위치**: `ToolRealtimeWall.tsx` 의 라이브 모드 보드 컨테이너 안쪽 상단 (라인 ~1374 의 pre-live banner 와 대칭 위치, `{isLiveMode && (...)}` 조건)

**디자인**:
```
[ ● 라이브 — 학생 N명 접속  · 주소: https://abc.trycloudflare.com  복사 ]   [ QR 보기 ] [ 공유 ] [ 종료 ]
```

- 좌측: 라이브 표시 dot + 학생 수 + 짧은 학생 접속 URL (truncate)
- 우측: "공유 보기" 버튼 (= `setBoardSettingsDrawer('share')`)
- 사용자가 drawer 를 close 해도 보드 위에 항상 있어서 다시 진입 가능
- 보드 풀-사이즈 원칙 유지를 위해 `h-9` (36px) slim · `shrink-0` · `mb-2`

**핵심 이유**: 우측 56px ActionBar 의 share 아이콘은 너무 좁고 학생에게 보여주는 화면에서 격리된 위치라 교사 본인도 찾기 어렵다. 보드 위 슬림 칩이 발견성을 100% 보장한다.

### F-3: handleStartLive 에러 로깅 + 메시지 명확화 (방어선)

**변경**:
```typescript
} catch (error) {
  console.error('[realtime-wall] startLive failed', error);
  setLiveError(
    '학생 참여를 시작하지 못했습니다. 인터넷 연결 후 잠시 뒤 다시 시도해 주세요.'
  );
}
```

근거: 현재 에러 메시지는 "실시간 담벼락 서버를 시작할 수 없습니다" — 사용자가 무엇을 해야 할지 단서 없음. 추가로 console.error 로 main process 로그와 정합.

### F-4: 회귀 방지 unit test (안전망)

**파일**: `src/adapters/components/Tools/RealtimeWall/__tests__/ToolRealtimeWall.shareUx.test.tsx` (신규)

테스트:
1. "학생 참여 시작" 버튼 클릭 시 `setBoardSettingsDrawer('share')` 가 호출되는지 (mocked `window.electronAPI`)
2. `RealtimeWallTeacherActionBar` 의 share 버튼이 `isLiveMode=false` 일 때 `disabled` 인지
3. ShareSectionBody 가 `displayUrl=null && tunnelLoading=true` 일 때 "QR 준비 중..." 노출

→ `RealtimeWallTeacherActionBar` 는 props-only 순수 컴포넌트라 가볍게 테스트 가능. `ToolRealtimeWall` 통합 테스트는 IPC mock 비용이 커서 단위 ActionBar 테스트만 둠.

---

## 3. 비-회귀 (Guard)

| 회귀 후보 | 가드 |
|-----------|-----|
| pre-live 단계에서도 drawer 열림 | `setBoardSettingsDrawer('share')` 호출은 `setIsLiveMode(true)` 직후라 `isLiveMode === false` 단계는 영향 없음 |
| live 진입 직후 사용자가 다른 drawer (export/design)를 의도하여 열었는데 share 로 강제 전환 | live 진입 시점에는 사용자 의도가 "공유" 이외일 가능성 없음 (Padlet UX 동일). 다른 drawer 는 ActionBar 에서 명시적으로 진입 가능 |
| handleStopLive 후 drawer 가 'share' 로 남아있어 다음 보드에서 자동 노출 | `handleStopLive` 흐름이 viewMode='list' 로 돌아가지는 않지만, 사용자가 다시 "학생 참여 시작" 누를 때마다 `setBoardSettingsDrawer('share')` 가 재호출되어 정합 유지. 라이브 종료 후 drawer 자동 close 도 함께 — `handleStopLive` 에 `setBoardSettingsDrawer(null)` 추가 (선택) |

---

## 4. 구현 순서 (Do)

1. F-1 — `handleStartLive` 자동 drawer open (1 line change)
2. F-2 — 라이브 상태 칩 컴포넌트 ToolRealtimeWall 안쪽 인라인 (작은 JSX 블록)
3. F-3 — 에러 로깅 + 메시지 (1 line change · 1 message 갱신)
4. F-3 보강 — `handleStopLive` 에 `setBoardSettingsDrawer(null)` (안전망)
5. F-4 — `RealtimeWallTeacherActionBar` props 테스트 작성
6. `npx tsc --noEmit` · `npx vitest run` · 영향 파일만 git add

---

## 5. 산출물

- `src/adapters/components/Tools/ToolRealtimeWall.tsx` (modified)
- `src/adapters/components/Tools/RealtimeWall/__tests__/RealtimeWallTeacherActionBar.shareUx.test.tsx` (new)
- 본 design + plan + analysis + report 문서

---

## 6. Match Rate 목표

90%+ (UX 회귀 4개 fix · meta test 1개 · console error logging 1개)
