# 쌤도구 팝업 — 설계서 (S0)

- 작성: 2026-09-08 · 계획서: [tool-popup.plan.md](../../01-plan/features/tool-popup.plan.md)

## 1. 한 줄 요약

도구의 실행 상태를 **창 밖으로 옮길 수 있는 스냅샷**으로 만들고, 그 스냅샷을 넘겨받는
**전용 Electron 창**을 띄운다. 소유자(조작·알람 책임)는 언제나 창 하나뿐이다.

## 2. 레이어 배치 (architecture-rules 준수)

```
domain/entities/ToolPopup.ts          지원 도구 9종 id, 창 사양, 이관 봉투 타입
domain/rules/toolPopupRules.ts        허용목록 판정, 창 사양 조회, 쿼리 조립·해석
domain/rules/toolPopupSession.ts      이관 중 흐른 시간 계산(카운트다운·스톱워치)
       ↑ 외부 의존성 0

electron/toolPopupWindows.ts          창 생명주기 관리자(단일 창 보장·준비 게이트)
electron/main.ts                      toolPopup:* IPC 등록 + getAllAppWindows 편입
electron/preload.ts                   허용한 요청만 노출

adapters/components/Tools/popup/      진입점·컨텍스트·훅
adapters/stores/useToolPopupStore.ts  "지금 팝업으로 열린 도구" 창 간 동기화
```

`domain/` 은 electron·react 를 import 하지 않는다. electron 쪽은 `domain/rules` 만 참조한다.

## 3. 세션 이관 계약 (핵심)

각 도구는 훅으로 두 함수를 등록한다.

```ts
useToolPopupHandoff<T>(toolId, {
  capture(): T,        // ★ 반드시 먼저 "정지"시키고 스냅샷을 돌려준다
  resume(snapshot: T): void,  // 스냅샷을 다시 적용하고 필요하면 다시 돌린다
})
```

- `capture()` 는 **순수 함수가 아니다.** 진행 중인 `setInterval`·애니메이션·예약 알람을
  **먼저 끄고** 나서 상태를 담는다. 이렇게 하면 "두 창이 동시에 소유자"인 구간이 아예 없다.
  주석으로만 약속하면 아무도 안 지킨다는 과거 사고를 반영해, 이 정지 책임을 계약 함수 안에 둔다.
- 스냅샷에는 항상 `capturedAt`(epoch ms)이 들어간다. 받는 쪽이 흐른 시간을 더해 복원한다.
- 초기 복원은 **첫 렌더 전에** 이뤄진다. 도구는 `useState(() => initial?.x ?? 기본값)` 으로 읽는다.

## 4. 소유권 이전 순서 (실패 복구 포함)

```
본문 창                                  main process               팝업 창
  │ 1. capture() → 정지 + 스냅샷
  │ 2. toolPopup:open(toolId, snapshot) ──►
  │                                       3. 기존 창 있으면 focus 후 종료
  │                                       4. BrowserWindow 생성, 스냅샷 보관
  │                                       5. ?mode=toolPopup&tool=..&handoff=.. 로드 ──►
  │                                                                  6. claimHandoff (1회 소비)
  │                                                                  7. 스냅샷으로 도구 렌더
  │                                       ◄── 8. markReady
  │                                       9. show + 준비 게이트 해제
  │ ◄── 10. { ok: true }
  │ 11. 도구 언마운트 → 본문은 "팝업으로 사용 중" 표시
```

- 10초 안에 `markReady` 가 안 오거나 로드가 실패하면 main 이 창을 정리하고 `{ ok:false, reason }` 을 돌려준다.
  본문 창은 **`resume(스냅샷)`** 으로 원래 실행을 되살린다 — 흐른 시간까지 반영되므로 시간이 뒤로 가지 않는다.
- 본문으로 가져오기는 반대 방향: 팝업이 `capture()` → `toolPopup:returnToMain(snapshot)` →
  main 이 메인 창에 `toolPopup:returned` 를 보내고 팝업을 닫는다. 메인 창이 그 도구 페이지를 열고 `resume`.
- 연속 클릭은 `useRef` 불리언 가드로 막는다(React 상태는 비동기라 두 번 통과한다 — 과거 실사고).

## 5. 창 생명주기·보안

- **도구 하나당 창 하나.** `Map<PopupToolId, BrowserWindow>` 로 강제. 재열기 = `restore()+show()+focus()`.
- 창은 `getAllAppWindows()` 에 편입 → `data:changed`·`system:resume`·업데이트 알림을 똑같이 받는다.
- `installNavigationGuard` 적용. 로드 대상은 dev 서버 URL 또는 `dist/index.html` **뿐**.
- IPC 는 (가) 도구 id 가 허용목록에 있고 (나) 발신 `webContents` 가 앱이 아는 창일 때만 처리한다.
  `returnToMain` 의 도구 id 는 인자가 아니라 **발신 창에서 역조회**한다(인자를 믿지 않는다).
- 앱 종료(`before-quit`) 시 모든 팝업 정리. 트레이 숨기기는 팝업을 닫지 않는다.
- `backgroundThrottling: false` — 가려져도 타이머가 느려지지 않게 한다.
  (절전 복귀는 `capturedAt` 기반 계산이 별도로 보정한다.)

## 6. 창 사양 (도구별 최소 크기)

배율만 줄이면 글씨·버튼이 지나치게 작아지므로 **도구마다** 기본·최소 크기를 둔다.

| 도구 | 기본 | 최소 |
| --- | --- | --- |
| 타이머 | 560×720 | 420×560 |
| 랜덤 뽑기 | 620×760 | 460×600 |
| 신호등 | 420×620 | 340×480 |
| 점수판 | 900×680 | 620×520 |
| 룰렛 | 640×760 | 520×620 |
| 주사위 | 560×660 | 420×520 |
| 동전 | 460×600 | 360×460 |
| QR코드 | 560×720 | 460×600 |
| 활동 기호 | 620×680 | 460×520 |

## 7. 화면 변화

- `ToolsGrid` 카드: 오른쪽 위에 **[새 창으로 열기]** 아이콘 버튼(카드 버튼 안에 버튼을 중첩하지 않도록
  카드를 `relative` 래퍼로 감싸고 형제로 둔다).
- `ToolLayout` 머리줄:
  - 본문(팝업 지원 도구): **[팝업으로 옮기기]**
  - 팝업 안: **[항상 위]** 토글 · **[본문으로 가져오기]** · **[닫기]**, `뒤로가기`/`병렬 모드` 숨김
- 팝업으로 열려 있는 도구의 본문 페이지: 도구 대신 안내 카드 + **[창 보기]** · **[본문으로 가져오기]**.

## 8. 브라우저(개발) 폴백

Electron API 가 없으면 `window.open(?mode=toolPopup...)` 로 연다. 스냅샷은 `localStorage`
한 칸에 담아 넘기고 새 창이 1회 소비한다. 준비·종료 신호는 `BroadcastChannel` 로 주고받는다.
차단되면 "브라우저가 새 창을 막았습니다" 안내를 띄우고 **원래 실행을 되살린다**.
항상 위·창 위치 제어는 브라우저에서 보장하지 않으므로 그 버튼을 숨긴다.
브라우저 확인은 데스크톱 앱 검증을 대체하지 않는다.

## 9. 하지 않는 것

- 같은 도구를 두 창에서 동시에 조작 / 같은 도구 팝업 여러 개
- 앱 재시작 후 실행 복구
- 병렬 보기 슬롯에서 팝업으로 직접 옮기기
- 팝업 창 위치·크기의 영구 기억
