# Plan: 위젯 카드 클릭 시 한 화면에서 편집까지 (widget-expanded-editors)

작성일: 2026-05-22
상태: Plan v0.1 — 사용자 검토 대기
선행: `ssampin-widget-inline-ux` (G001~G010 완료, G011 일시 보류)

## 왜 이걸 하는가

위젯 카드를 클릭하면 새 큰 창(모달)이 열리도록 바꾼 뒤(이번 주 작업), 기존 위젯들이 가지고 있던 "자기 편집 팝업"이 한 번 더 떠서 **창이 두 겹으로 보이는 현상**이 생겼습니다.

> 사용자 신고 (2026-05-22)
>
> - 할 일 카드: 두 가지 팝업이 뜸 — 하나는 체크만, 하나는 추가·수정·삭제 가능. 후자로 통합하길 원함.
> - 메모 카드: 팝업 안에서 추가·수정·삭제 가능하길 원함.
> - 미니 캘린더 / 다가오는 일정: 팝업에서 일정 추가·수정·삭제 가능하길 원함.

핵심 원인: 큰 창(모달)은 만들었지만, 안에 보여 줄 "큰 화면용 편집기"는 아직 안 만들었음. 그래서 큰 창이 그냥 작은 카드 모양을 키워서 보여 주고, 진짜 편집은 옛 팝업이 따로 처리하고 있었음.

## 무엇을 바꾸는가

위 네 개 위젯에 대해, **카드는 작게, 모달은 곧 편집기**가 되도록 한 컴포넌트 안에 두 가지 화면을 둡니다.

| 위젯          | 작은 카드(`isCompactMode=true`) | 큰 화면(`isCompactMode=false`)                                                         |
| ------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| 할 일         | 체크·간단 추가                  | 기존 `TodoPopup` 본문을 그대로 모달 안에서 사용 (제목/마감/우선순위 편집·삭제 다 가능) |
| 메모          | 그리드 미리보기·한 줄 추가      | 그리드 + 큰 입력칸 + 메모 클릭 시 편집 패널                                            |
| 미니 캘린더   | 월별 점·선택 패널               | 큰 월 캘린더 + 날짜 선택 시 일정 추가/편집/삭제 폼                                     |
| 다가오는 일정 | 목록 미리보기                   | 일정 목록 + 인라인 편집/삭제 + 새 일정 추가                                            |

옛 자체 팝업(`TodoPopup`, `MemoDetailPopup`의 모달 wrapper, `DashboardEvents`의 자체 portal)은 같은 본문을 가진 채 wrapper만 모달로 옮기거나 제거합니다. 결과적으로 화면에 뜨는 큰 창은 항상 한 개뿐입니다.

## 단계

### Phase 1 — 할 일 + 메모 (가장 자주 씀)

#### 1A. 할 일

- `TodoPopup.tsx`의 본문(입력/리스트/우선순위/마감일/삭제 UI)을 별도 컴포넌트 `TodoEditor.tsx`로 추출.
- `DashboardTodo`에서 `isCompactMode={false}`일 때 `<TodoEditor />`만 렌더.
- 기존 카드 본체의 헤더 클릭 → `TodoPopup` 띄우기 경로는 제거 (모달이 같은 본문을 보여주므로 중복).
- `TodoPopup.tsx`는 deprecate (단, 모바일 등 다른 곳에서 import 중인지 grep으로 확인 후 결정).

#### 1B. 메모

- `MemoDetailPopup.tsx`의 본문(편집기·색상·이미지)을 별도 컴포넌트 `MemoEditor.tsx`로 추출.
- `DashboardMemo`에서 `isCompactMode={false}`일 때:
  - 좌측: 메모 그리드 + 한 줄 추가 입력칸 (모달 모드에서도 노출)
  - 우측 또는 상단: 선택된 메모의 `<MemoEditor />` (편집)
  - 메모 클릭 시 `MemoDetailPopup` 모달을 새로 띄우는 대신 expanded view 안에서 패널 전환
- 단순화 옵션 A: 모달 안에서도 `MemoDetailPopup` 그대로 띄우게 두고 1차 진행 (옛 동작 + 모달 안에서 추가·편집 둘 다 됨). 디자인 욕심 부리지 않음.

→ **Phase 1 견적**: 4~6시간, 1~2일

### Phase 2 — 미니 캘린더 + 다가오는 일정

#### 2A. 미니 캘린더

- 모달 본체에 큰 월 캘린더 + 날짜 클릭 시 우측 패널(`EventDayPanel`)에서 일정 추가/수정/삭제.
- 일정 데이터는 기존 `useEventsStore` 그대로 사용 (스키마 변경 없음).

#### 2B. 다가오는 일정

- 모달 본체에 일정 목록(`EventList`) + 신규 추가 폼.
- 각 항목 클릭 시 인라인 편집 또는 우측 detail 패널.
- 기존 자체 `showAll` portal 팝업 제거.

→ **Phase 2 견적**: 8~12시간, 2~3일

### Phase 3 — G011 final quality gate 재개

원래 보류했던 `ssampin-widget-inline-ux`의 G011(8개 AC11 hitbox 버그 + ai-slop-cleaner + code-review)를 마무리.

## 안전 장치

- 도메인 코드(`@domain/*`) 절대 안 건드림. UI 어댑터 컴포넌트만 변경.
- 데이터 저장/불러오기(`useTodoStore`, `useMemoStore`, `useEventsStore`)는 그대로 사용. 스키마 변경 0.
- 새 화면은 기존 컴포넌트 본문을 추출해 재사용하므로 회귀 위험 적음.
- 단계마다 검증 게이트 4종(tsc/lint/test/regression) 통과 + 사용자 수동 검증.

## 처음에 손 안 댈 것

- 다른 17개 위젯의 모달 본문 (이번 신고 4개만 우선)
- 카드 본체 시각 디자인 (작은 카드 그대로)
- 모바일(`src/mobile/*`) — 별도 PDCA
- Electron 양방향 IPC sync (Phase 2 이연 그대로)

## 검증 게이트

각 Phase 끝에:

1. `npx tsc --noEmit` EXIT=0
2. `npm run lint` clean
3. `npx vitest run` 전부 pass
4. `node scripts/regression-grep-check.mjs` 24/24
5. 사용자가 직접 클릭해 큰 창 한 개만 뜨는지 확인
