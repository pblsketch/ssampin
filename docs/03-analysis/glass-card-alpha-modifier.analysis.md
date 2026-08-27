# `bg-sp-card/NN` — 투명도 수식이 붙은 배경은 아예 칠해지지 않는다

**작성일**: 2026-08-28 · **상태**: 미착수(목록만 확보) · **관련**: [ADR-077](../../DECISIONS.md)

## 무엇이 문제인가

`bg-sp-card/80` 처럼 Tailwind 투명도 수식을 붙이면 **배경색이 아예 칠해지지 않는다.**
`sp-*` 토큰은 CSS 변수라 Tailwind 가 알파를 합성하지 못하기 때문이다.

실측(2026-08-28, 브라우저 `getComputedStyle`):

```
bg-sp-card     ->  color(srgb 0.901961 0.905882 0.921569 / 0.42)   ← 정상
bg-sp-card/75  ->  rgba(0, 0, 0, 0)                                 ← 배경 없음
```

즉 코드를 쓴 사람은 "조금 비치게" 를 의도했는데 실제로는 **완전히 비친다.**
유리 효과와는 무관하며, 유리를 꺼도 마찬가지다.

이 함정 자체는 이미 알려져 있다 — `src/mobile/components/common/BottomSheet.tsx` 주석에
"수식(`bg-sp-card/40`)을 붙이면 색이 조용히 투명해지므로 금지" 라고 적혀 있다.
그런데 저장소 전체에는 아직 74곳이 남아 있다.

## 왜 이번 작업(ADR-077)에 넣지 않았나

준일님 결정(2026-08-28): **떠 있는 면의 불투명 계약만 이번에 처리하고, 이쪽은 분리한다.**

원인이 다르고(유리 규칙이 아니라 Tailwind 토큰 한계), 고치는 방향이 자리마다 갈린다 —
`bg-sp-card` 로 바꿔 불투명하게 할지, `color-mix` 인라인으로 진짜 반투명을 살릴지는
**"원래 얼마나 진해야 하는가"라는 디자인 판단**이라 기계적으로 정할 수 없다.
회귀 검사(REGRESSION #64)로 강제하지 않는 이유도 같다.

진짜 반투명이 필요하면 인라인 `color-mix` 를 쓴다 —
`src/mobile/pages/AttendanceCheckPage.tsx` 의 안내 상자가 선례다.

## 집계

| 갈래        |     곳 | 설명                                                                  |
| ----------- | -----: | --------------------------------------------------------------------- |
| 떠 있는 면  |      9 | 드롭다운·메뉴·배지 등. 배경이 없어 뒤가 그대로 보인다 — **우선 검토** |
| 평소 배경   |     47 | 카드·구역 배경. 의도한 옅은 면이 아예 안 칠해진 상태                  |
| 상태 변형만 |     18 | `hover:` 등. 평소엔 안 보이고 눌렀을 때만 어긋난다                    |
| **합계**    | **74** |                                                                       |

## 1. 떠 있는 면 — 우선 검토 대상

배경이 없으면 뒤 내용과 겹쳐 읽히므로 영향이 가장 크다.
아래 셋은 `backdrop-blur-xl` 이 함께 걸려 있어 **"반투명 유리 메뉴"를 의도했던 흔적**이
뚜렷하다. 불투명으로 바꿀지 진짜 반투명으로 살릴지 결정이 필요하다.

| 파일                                                                |   줄 | 토큰                  | 비고                                   |
| ------------------------------------------------------------------- | ---: | --------------------- | -------------------------------------- |
| `src/adapters/components/StaffRoom/GalleryView.tsx`                 |   71 | `bg-sp-card/90`       |                                        |
| `src/adapters/components/Tools/RealtimeWall/StudentDraftChip.tsx`   |   43 | `hover:bg-sp-card/80` | hover 상태만                           |
| `src/adapters/components/Tools/RealtimeWall/WallBoardThumbnail.tsx` |  125 | `bg-sp-card/90`       |                                        |
| `src/adapters/components/Tools/Sticker/StickerManager.tsx`          |  778 | `bg-sp-card/80`       |                                        |
| `src/adapters/components/Tools/Sticker/StickerUploader.tsx`         | 1186 | `bg-sp-card/85`       |                                        |
| `src/adapters/components/Tools/Sticker/StickerUploader.tsx`         | 1198 | `bg-sp-card/85`       |                                        |
| `src/adapters/components/Widget/WidgetContextMenu.tsx`              |   84 | `bg-sp-card/75`       | backdrop-blur-xl 동반 — 유리 메뉴 의도 |
| `src/widgets/components/LayoutSelector.tsx`                         |  103 | `bg-sp-card/75`       | backdrop-blur-xl 동반 — 유리 메뉴 의도 |
| `src/widgets/components/WidgetModePopover.tsx`                      |   96 | `bg-sp-card/95`       | backdrop-blur-xl 동반 — 유리 메뉴 의도 |

## 2. 평소 배경으로 쓰는 곳

- `src/adapters/components/Forms/FormGrid.tsx` — 32(`bg-sp-card/50`)
- `src/adapters/components/Forms/FormUploadModal.tsx` — 137(`bg-sp-card/50`)
- `src/adapters/components/HelpChat/HelpChatWindow.tsx` — 133(`bg-sp-card/50`)
- `src/adapters/components/Note/NotePage.tsx` — 732(`bg-sp-card/90`)
- `src/adapters/components/Schedule/DuplicateCleanupModal.tsx` — 102(`bg-sp-card/60`)
- `src/adapters/components/Schedule/HiddenEventsModal.tsx` — 107(`bg-sp-card/60`)
- `src/adapters/components/Schedule/NeisSchedulePanel.tsx` — 292(`bg-sp-card/40`)
- `src/adapters/components/Seating/FreestyleSeatingView.tsx` — 320(`bg-sp-card/30`), 361(`bg-sp-card/30`)
- `src/adapters/components/Seating/GroupSeatingView.tsx` — 228(`bg-sp-card/50`)
- `src/adapters/components/Seating/Seating.tsx` — 129(`bg-sp-card/50`), 141(`bg-sp-card/50`), 910(`bg-sp-card/30`), 951(`bg-sp-card/30`)
- `src/adapters/components/Seating/ShuffleOverlay.tsx` — 202(`bg-sp-card/30`), 205(`bg-sp-card/40`)
- `src/adapters/components/Settings/SettingsSidebar.tsx` — 150(`bg-sp-card/50`)
- `src/adapters/components/Timetable/TeacherExcelPreviewModal.tsx` — 74(`bg-sp-card/50`)
- `src/adapters/components/Timetable/TimetableEditor.tsx` — 856(`bg-sp-card/80`)
- `src/adapters/components/Timetable/TimetablePage.tsx` — 1184(`bg-sp-card/50`)
- `src/adapters/components/Tools/Discussion/ChatPanel.tsx` — 91(`bg-sp-card/50`), 114(`bg-sp-card/60`)
- `src/adapters/components/Tools/Discussion/DiscussionLive.tsx` — 153(`bg-sp-card/80`)
- `src/adapters/components/Tools/Discussion/ToolTrafficLightDiscussion.tsx` — 235(`bg-sp-card/50`)
- `src/adapters/components/Tools/Discussion/ToolValueLine.tsx` — 248(`bg-sp-card/90`), 292(`bg-sp-card/90`)
- `src/adapters/components/Tools/InteractiveSlides/Editor/OverlayHandle.tsx` — 64(`bg-sp-card/85`)
- `src/adapters/components/Tools/InteractiveSlides/Presenter/LessonPresenter.tsx` — 283(`bg-sp-card/90`)
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardPdfBadge.tsx` — 47(`bg-sp-card/80`)
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx` — 441(`bg-sp-card/40`), 444(`bg-sp-card/20`), 724(`bg-sp-card/30`)
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallTabBar.tsx` — 68(`bg-sp-card/60`)
- `src/adapters/components/Tools/RealtimeWall/StudentImageMultiPicker.tsx` — 191(`bg-sp-card/50`)
- `src/adapters/components/Tools/RealtimeWall/StudentPdfPicker.tsx` — 70(`bg-sp-card/50`)
- `src/adapters/components/Tools/RealtimeWall/WallBoardThumbnail.tsx` — 87(`bg-sp-card/80`), 155(`bg-sp-card/80`), 178(`bg-sp-card/80`)
- `src/adapters/components/Tools/Sticker/StickerManager.tsx` — 753(`bg-sp-card/80`)
- `src/adapters/components/Tools/Sticker/StickerSheetSplitter.tsx` — 958(`bg-sp-card/80`)
- `src/adapters/components/Tools/ToolMarkdownConvert.tsx` — 858(`bg-sp-card/40`)
- `src/adapters/components/Tools/ToolWorkSymbols.tsx` — 703(`bg-sp-card/50`)
- `src/mobile/components/common/BottomSheet.tsx` — 28(`bg-sp-card/40`)
- `src/student/StudentAttachmentRow.tsx` — 48(`bg-sp-card/50`)
- `src/student/StudentBoardView.tsx` — 523(`bg-sp-card/80`), 526(`bg-sp-card/80`)
- `src/widgets/items/DesktopOrganize/DesktopOrganize.tsx` — 201(`bg-sp-card/60`)

## 3. 상태 변형(hover 등)만 쓰는 곳

평소 화면에는 드러나지 않는다. 마우스를 올렸을 때 배경이 바뀌지 않을 뿐이라 우선순위가 낮다.

- `src/adapters/components/attendance/shared/AttendanceGridView.tsx` — 283(`hover:bg-sp-card/30`)
- `src/adapters/components/ClassManagement/AttendanceTab.tsx` — 700(`hover:bg-sp-card/50`)
- `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx` — 1260(`hover:bg-sp-card/40`)
- `src/adapters/components/Homeroom/Records/DefaultRecordListView.tsx` — 102(`hover:bg-sp-card/80`)
- `src/adapters/components/Homeroom/Records/StudentTimelineView.tsx` — 146(`hover:bg-sp-card/80`)
- `src/adapters/components/Settings/AppInfoSection.tsx` — 372(`hover:bg-sp-card/50`)
- `src/adapters/components/StudentRecords/StudentRecords.tsx` — 1748(`hover:bg-sp-card/80`), 1904(`hover:bg-sp-card/80`)
- `src/adapters/components/Timetable/TeacherExcelPreviewModal.tsx` — 73(`hover:bg-sp-card/30`)
- `src/adapters/components/Timetable/TimetableEditor.tsx` — 872(`hover:bg-sp-card/30`)
- `src/adapters/components/Tools/InteractiveSlides/Lobby/LessonLobby.tsx` — 483(`hover:bg-sp-card/80`)
- `src/adapters/components/Tools/MiniApps/MiniAppsSection.tsx` — 180(`hover:bg-sp-card/40`), 249(`hover:bg-sp-card/70`)
- `src/adapters/components/Tools/TeacherControlPanel.tsx` — 316(`hover:bg-sp-card/70`), 854(`hover:bg-sp-card/70`)
- `src/adapters/components/Tools/ToolRandom.tsx` — 459(`hover:bg-sp-card/80`)
- `src/widgets/components/WidgetSettingsPanel.tsx` — 189(`hover:bg-sp-card/50`)
- `src/widgets/components/WidgetTabBar.tsx` — 28(`hover:bg-sp-card/50`)

## 다음에 할 일

1. 위 1번(떠 있는 면 9곳)부터 디자인 에이전트와 함께 방향을 정한다 —
   불투명 전환인지, `color-mix` 로 진짜 반투명을 살리는지.
2. 방향이 정해지면 2번·3번을 같은 기준으로 훑는다.
3. 마지막에 `bg-sp-*` 계열 전체에 투명도 수식을 금지하는 회귀 검사를 추가한다
   (지금 넣으면 74건이 한꺼번에 빨간불이라 게이트가 막힌다).
