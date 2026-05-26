# Progress

마지막 업데이트: 2026-05-26 KST

## Current Version

**v2.0.9 (2026-05-26 출시 진행 — 핫픽스 릴리즈, v2.0.8 OAuth 사고 정정).** v2.0.8 빌드 사고(`.env` 누락으로 `VITE_GOOGLE_CLIENT_ID` 가 빈 채로 박혀 구글 캘린더·할 일·드라이브·로그인 전체 깨짐 — 사용자 신고 2026-05-26)를 정정하고 빌드 가드 추가로 재발 차단.

**v2.0.9 묶음에 포함된 변경 사항 (1 Critical fix + 1 신기능 + 회귀 fix 5건 묶음 + UX 개선 4건 + 빌드 가드)**:

1. 🔧 **Critical: 구글 캘린더·할 일·드라이브 연결 복구 (v2.0.8 OAuth client_id 빈값 빌드 사고 정정)** — `vite.config.ts` / `vite.mobile.config.ts` 에 production 모드 OAuth 키 빈값 시 즉시 throw 하는 가드 추가. 검증: .env 백업 후 빌드 시도 → "프로덕션 빌드 중단" 에러로 정상 차단 확인. 사용자 PC 의 v2.0.7~v2.0.8 설치본 `app.asar` 에 `990268309712` 0건 박혀있던 사실을 grep 으로 확정.
2. ✨ **담임 메모장 출결 세부 입력 추가** (`5067245`) — 카드 안에서 출결 사유까지 한 번에 기록.
3. 🪟 **바탕화면 위젯 모달 입력창 포커스 안정화 (회귀 5건 일괄)** — `1d79f4c`/`0c12659`/`a752c05`/`0286a73`/`a58b262` — 모달 열 때 위젯 축소·입력 포커스 race·클릭 시 입력 풀림·detach race·fallback 경로 정정.
4. 🛡️ **출결 자동저장 안전망 + UX 폴리시** (`237de6d`) — 입력 도중 끊겨도 마지막 입력 보존 + 저장 상태 시각 표시.
5. 🔁 **출결 워크플로우 단순화** (`f12b32b`) — 자주 쓰는 동선 우선 + 중복 확인 제거 + 키보드 완주 가능.
6. ♿ **학생 기록 뷰 접근성 개선** (`2d7bbbf`) — Tab 키 탐색 + 스크린 리더 호환성.
7. 🪟 **Windows 보호 경고 안내 애니메이션 개선** (`e00e85e`) — 첫 실행 시 SmartScreen 안내 부드럽게.

**검증 게이트 4/4 통과 (2026-05-26)**: tsc 0 errors / lint 0 errors (118 warnings 기존 부채) / vitest 1809 passed (9 skipped) — phase5-ux-cleanup JSX 줄바꿈 회귀 1건 fix(`이 좌석으로 수업 기록하기` string literal 명시) / regression 28/28.

**빌드 가드 동작 검증 통과**: `.env` 백업 후 `npx vite build --mode production` 시도 → `[vite] 프로덕션 빌드 중단: VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_SECRET 가 비어있습니다.` 에러로 즉시 종료 + .env 자동 복원 확인.

**제외 (다른 묶음 예정 — v2.0.9에서 빠짐)**:

- 학급규칙(ClassroomAgreement) 도구 신규 — 도메인+UI+IPC+테스트 전부 미커밋, 다음 릴리즈로 이연 (사용자 결정 2026-05-26)
- RealtimeWallTabConfig 엔티티 — v2.1.0 멀티탭 묶음 예정
- XlsxExporter 인프라 + 테스트 — 별도 PDCA
- public/landing/, bin/, scripts/gen-card-image.mjs — 빌드/배포 도구류 별도 정리

**다음 단계**: Windows 5단계 분리 빌드 (CLAUDE.md §6) + grep 검증 (`990268309712` 박힘 확인) + macOS GHA + GitHub 릴리즈 + 사용자 PC 재설치.

---

**v2.0.8 (2026-05-23 빌드 사고 — 실제 사용 불가)**: `release-notes.json` v2.0.8 블록 14개는 등록됐고 git/태그/installer 도 발급됐으나, 빌드 시점 `.env` 누락으로 `VITE_GOOGLE_CLIENT_ID` 가 빈 문자열로 박혀 모든 OAuth 가 깨졌음. 이 사고는 v2.0.9 핫픽스 릴리즈로 정정. 사용자에게 노출된 v2.0.8 의 위젯 UX 개선 항목들은 v2.0.9 에도 그대로 포함되므로 v2.0.9 가 첫 사용 가능 버전.

**v2.0.8 묶음에 포함됐던 변경 사항 (위젯 모드 UX 대수술 — v2.0.9에도 함께 포함)**:

1. ✅ **ssampin-widget-inline-ux + widget-expanded-editors** — 위젯 카드 클릭 → 큰 창(모달) 한 개로 통합 + 인라인 CRUD. 할 일·메모·미니 캘린더·다가오는 일정·D-Day + Phase 4 담임 메모장·북마크·즐겨찾기 확장 편집기.
2. ✅ **widget-mode-discovery** — 헤더 모드 인디케이터 칩 + 1회 코치 투어 + 우클릭 컨텍스트 메뉴 모드 섹션 + 설정 → 위젯 탭 모드 섹션 상단 승격 + ModalCoordinator priority 2종 추가(WIDGET_MODE_FALLBACK=2.5, WIDGET_MODE_COACH=5.5).
3. ✅ **native-desktop-left-edge-resize-fix Phase 7-D 2차** — 사용자 신고 "바탕화면 모드 왼쪽 테두리 드래그 시 위젯 사라짐" 결정적 회귀 차단. `moveAndResizeWidgetSync` 신규 헬퍼(SWP_ASYNCWINDOWPOS 제외 sync 변형) + `computeResizeBounds` 순수 함수 추출 + 5 메타테스트. ADR-008.
4. ✅ **위젯 모드 ESC + 모달 버튼 + 모드 전환 + 휠 방향 + 미니 캘린더 split 핫픽스 묶음** — 일반 모드 ESC(window.focus + capture 단계 keydown) + 바탕화면 모드 ESC(globalShortcut IPC 폴백) + WidgetSettingsPanel ESC + 모달 readOnly 가드 부작용 해소 + 모드 전환 bounds 강제 복원 + 좁은 폭 헤더 3열 그리드 + 휠 부호 blink convention SSOT + MiniCalendarExpanded md breakpoint 세로 스택 + desktop-organize 모달 진입 차단.
5. ✅ **widget-wheel-direction-fix** — `computeWheelDeltas(rawDelta, axis)` SSOT 헬퍼 + 메타테스트 16건. ADR-007.
6. ✅ **아이콘 모드 픽셀아트 캐릭터** — PNG 렌더링 연결 + 캐시 무효화.
7. ✅ **student-records rules-of-hooks 위반 해소** — wrapper 분기 패턴.

**검증 게이트 4/4 통과 (2026-05-23)**: tsc 0 errors / lint 0 errors (120 warnings 기존 부채) / vitest 1723 passed (9 skipped) / regression 24/24.

**제외 (다른 묶음 예정)**:

- 협업보드 PDCA-1 Step 1.0~1.4 (코드는 main 잔류, release notes 미노출 — v2.1.0 묶음 또는 별도 fast follow)
- 실시간 담벼락 v2.0 (다른 세션 미커밋 — stash 보호 후 stash@{0}에 보존, 그 세션 마무리 시 자체 release)
- 복합 유형 설문 v2 renewal (Phase A 진입 대기)

---

**v2.0.7 (2026-05-22 출시 완료) 묶음 변경 사항 (4 PDCA + 보안 패치)**:

1. ✅ **자리배치 신규 기능 3종** — 히스토리(저장/복원/비교·이전 자리 피하기) + 이름 학습 모드(전체화면 카드 플립) + 우연을 가장한 배치(사전 설계 → 셔플 위장). 자유 배치 모드 Phase 1~5a(ㄷ자형·시험 대형·모둠 + PDF 출력). 47 신규 테스트.
2. ✅ **roster-sample-data-removal Phase 1+2+3** — Match Rate 99.0% PASS. SAMPLE_STUDENTS 35명 자동 채움 영구 제거 + 6중 안전 가드(A·B·C·D·E·F·G) 마이그레이션 + 9개 화면 EmptyState 가드 + amber 경고 배너 + 사이드바 빨간 점 + 마이그레이션 토스트. Dev 도구 `npm run electron:dev:fresh` 추가.
3. ✅ **notification-modal-stacking-fix Phase 0~4** — Match Rate 97% PASS. 일정 알림 X 안 눌리던 핫픽스 + 공용 Modal 마이그레이션 + ModalCoordinator 우선순위 큐(7단계) + 6개 모달 큐 등록 + REGRESSION 9→17.
4. ✅ **realtime-tool-student-page-health Phase 0+1+2** — Match Rate 98% PASS. 4개 학생 페이지(워드클라우드·주관식·객관식·복합) 우상단 연결 상태 칩 + submit 침묵 실패 차단 + KB Q&A 3건 + REGRESSION 17→22.
5. ✅ **보안 패치** — ws + protobufjs 알려진 취약점 패치(PR #73).

검증 게이트 4/4 통과 (2026-05-22): tsc 0 errors / lint 0 errors / vitest 1566/1566 / regression 24/24.

## Completed (최근)

- 🟢 **v2.0.9 핫픽스 릴리즈 진행 중 (2026-05-26, v2.0.8 OAuth 사고 정정)** — 사용자 신고: 데스크톱 앱에서 "구글 계정 연결" 시 브라우저에 "액세스 차단됨: 승인 오류 / Missing required parameter: client_id / 400 invalid_request" 표시. 진단: v2.0.8 설치본 `app.asar` 에 `990268309712` 0건 박혀있음 — codex 릴리즈 작업 중 `.env` 누락으로 vite `loadEnv` 가 `VITE_GOOGLE_CLIENT_ID` 를 빈 채로 dist 에 박은 결정적 사고. **해결**: (1) `vite.config.ts` / `vite.mobile.config.ts` 에 production 모드 OAuth 키 빈값 시 즉시 throw 가드 (위 §C-1·C-2·C-3 plan) — `.env` 백업 후 빌드 시도 → "프로덕션 빌드 중단" 에러로 정상 차단 확인. (2) `release-notes.json` 에 v2.0.9 블록(highlights 6 + changes 7) 최상단 추가, v2.0.8 블록은 보존. (3) `scripts/ingest-chatbot-qa.mjs` v2.0.9 Q&A 4건 추가 (구글 연결 핫픽스 안내·담임 메모장 출결 세부·위젯 모달 입력 fix·출결 자동저장/접근성 묶음). (4) 6곳 버전 갱신(package.json·landing config/layout·sidebar·mobile settings/more). (5) 검증 게이트 4/4 통과(tsc 0 / lint 0 / vitest 1809 / regression 28 + JSX 줄바꿈 회귀 1건 fix). **포함 커밋**(May 23 18:00 이후 main): `5067245`(메모장 출결 세부) + `1d79f4c`/`0c12659`/`a752c05`/`0286a73`/`a58b262`(바탕화면 위젯 모달 회귀 5건) + `f12b32b`(출결 워크플로우 단순화) + `2d7bbbf`(학생 기록뷰 접근성) + `237de6d`(자동저장 안전망) + `e00e85e`(Windows 보호 경고 안내). **제외**: 학급규칙(ClassroomAgreement) + RealtimeWallTabConfig + XlsxExporter + public/landing — stash 보호 후 v2.0.9 빌드 완료 시 복원. **다음**: Windows 5단계 분리 빌드 + grep 검증 + macOS GHA + GitHub 릴리즈 + 사용자 PC 재설치 + KB ingest + 노션 가이드 갱신. [Plan v0.1](docs/01-plan/features/v209-hotfix-release.plan.md)

- 🟢 **v2.0.8 묶음 릴리즈 완료 (2026-05-23, tag `v2.0.8`, main `b1fe8b5`, 16 commits) — 빌드 사고로 사용 불가** — ⚠️ `.env` 누락으로 OAuth client_id 빈 채 배포되어 모든 구글 연동 깨짐(v2.0.9 핫픽스 참조). 코드 자체는 정상이었음. 위젯 모드 UX 대수술 + 바탕화면 모드 안정화. ssampin-widget-inline-ux(G001~G011) + widget-expanded-editors Phase 1A·1B·2A·2B·4 + widget-mode-discovery + native-desktop Phase 7-D 2차 fix(ADR-008) + 위젯 ESC/모달버튼/모드전환/휠방향/미니캘린더 split 핫픽스 묶음 + widget-wheel-direction-fix(ADR-007) + 아이콘 모드 픽셀아트 + student-records hooks. 검증 게이트 4/4 통과. Windows 빌드 5단계 분리 실행 (EXIT 127 회피 재확인). macOS GHA 7분 13초. 10 URL 302 전부 통과. KB ingest + 노션 가이드 갱신 사용자 직접 실행 대기.

- 🟢 **native-desktop-left-edge-resize-fix Phase 7-D 2차 fix 완료 (2026-05-23, main `0526ed6`)** — 사용자 신고 결정적 회귀 차단. SetWindowPos sync 변형 채택 + `computeResizeBounds` 순수 함수 추출 + 5 메타테스트. ADR-008. v2.0.8 묶음 포함. 사용자 수동 검증 통과.

- 🟢 **widget-wheel-direction-fix PDCA 완료 (2026-05-23, main 미커밋, 사용자 수동 검증 통과)** — 사용자 신고 "바탕화면 위젯 모드에서 마우스 휠 상하 스크롤이 일반 윈도우와 반대 방향" 핫픽스. 부호 정책을 manager inline `-delta` → 순수 helper `computeWheelDeltas(rawDelta, axis)`(SSOT)로 추출 + blink `WebMouseWheelEvent` 컨벤션 채택(Win32 raw 부호 보존). 신규 메타테스트 16건이 회귀 차단. **진단 과정 헛돔 1.5h**: 1차 fix(`+rawDelta`)와 2차 정정(`-rawDelta`)이 사용자 인스턴스에 한 번도 도달하지 못했음을 `dist-electron/main.js` mtime + `computeWheelDeltas` grep으로 확정 — `scripts/electron-dev.mjs`가 `electron/` 폴더 변경을 watch하지 않는 dev 함정 재발(2026-05-21 realtime-tool-student-page-health에도 동일 함정 기록되어 있었음. PROGRESS.md 미독으로 재발견). `node scripts/build-electron.mjs` 명시 빌드 + dev 재시작으로 blink convention 정답 확정. 검증 게이트: tsc 0(본 PDCA 변경분) / lint 0 / vitest focused 78/78 / regression 24/24. ADR-007. **Follow-up**: `electron-dev.mjs`에 `electron/` watch + 자동 rebuild + electron 재실행 (별도 작은 PDCA 권장). [DECISIONS.md ADR-007](DECISIONS.md)

- 🟢 **ssampin-widget-inline-ux + widget-expanded-editors PDCA 완료 (2026-05-22, main 미커밋)** — 위젯 카드 클릭 → 큰 창(모달) 한 개로 통합 + 그 안에서 추가/수정/삭제까지 가능. 두 PDCA 종결.
  - **ssampin-widget-inline-ux (G001~G011)**: WidgetModal(createPortal+ESC+✕+backdrop+autoSave) / ModalCoordinator `onPreempt`(시스템 모달 발생 시 자동 저장) / `useFocusTrap`(직접 구현, focus-trap-react 무사용) / PIN_FEATURE_MAP 추출 / registry 22→21 위젯(`modalSize`/`modalMode`/`inplaceCapable`/`requiresExplicitCancel` 4 필드) / WidgetCard 클릭→모달 / SortableWidget quadrant dwell 호버 핸들 / DashboardHeader 📋·🎨 두 버튼 / WidgetGrid `isEditMode` 분기 완전 제거 / Settings panel `initialTab` prop / Electron Widget.tsx 헤더 동일 두 버튼 + read-only shim(AC17 Phase 2 이연) / 마이크로 인플레이스 편집 + 5초 Undo(Todo/Memo/DDayCounter, `durationMs=5000` 명시) / MemoFocus 위젯 deprecate / AC4·AC11·AC12·AC14·AC20 메타테스트 추가 / AC11 hitbox 8건(today-class·meal·dday-counter·favorite-tools·image-sticker-2/3/4) 일괄 수정 + mini-calendar는 카드 사이즈 제약상 SKIP_AUDIT.
  - **widget-expanded-editors (사용자 UX 신고 해소)**: 카드 클릭 후 두 겹 팝업이 뜨던 문제 해결. Phase 1A 할 일 — `TodoEditor` 추출 + `TodoPopup` 삭제 + 모달에서 추가/수정/삭제. Phase 1B 메모 — `MemoEditor` 추출 + `MemoDetailPopup`은 portal wrapper로 리팩터(MemoPage 호환 유지) + 모달에서 한 줄 추가/그리드/인라인 편집 패널. Phase 2A 미니 캘린더 — `MiniCalendarExpanded` 신규(큰 캘린더 좌 + 일정 패널 우 + QuickEventForm + 5초 Undo). Phase 2B 다가오는 일정 — `DashboardEvents` 확장 뷰에서 `EditableEventRow` + `EventsQuickForm` 인라인 CRUD + showAll portal은 compact 모드에서만.
  - **검증 게이트**: tsc 0 / eslint 0(PDCA 파일 한정) / vitest 1711 pass / 9 skipped / 0 fail / regression 24/24.
  - **AC17 Phase 2 이연**: Electron 데스크톱 위젯 ↔ 메인 앱 양방향 IPC sync는 별도 ralplan(`widget:data:*` 채널 설계).
  - **남은 후속 작업**: G011 sub-agent 보고 중 권고된 `QuickEventForm` DRY-up (MiniCalendarExpanded ↔ DashboardEvents 공유 추출) — 후속 리팩터 PDCA 가능. PROGRESS.md/노션 가이드 사용자 안내 — 사용자 결정.

- ⚠️ **realtimeWall v2.0 — 다른 AI 세션이 작업 중(미커밋)** — `src/domain/entities/RealtimeWall.ts`/`RealtimeWallTabConfig.ts`/`useRealtimeWall*`, `src/domain/services/`, `src/shared/wsProtocol/realtimeWall.ts` + 2 테스트 파일. "멀티탭 보드 + WS 프로토콜 2.0, schemaVersion='2.0', 메타테스트 MT-1/2/3" 별도 Plan 진행 중. `wsProtocol/realtimeWall.test.ts:21-22` 의 `ServerToClientWallMessageSchema`/`ClientToServerWallMessageSchema` unused import 2건 때문에 `npx tsc --noEmit` 전체 실행 시 TS6133 빨간 줄이 잠시 보임 — 그 세션이 마무리하면 자연 해소. 본 세션은 CLAUDE.md "다른 세션 파일 건드리지 말 것" 규칙대로 손대지 않음.

- 🟢 **v2.0.6 묶음 릴리즈 완료 (2026-05-20, tag `v2.0.6`)** — 21커밋 풀세트 통합. multi-date-attendance(#60) + consultation Phase 1+2+3(#59,#61) + update-notification-controls(#57) + modal-scroll-overflow-fix(#58) + Notice 공용(#55) + Phase 2 마이그레이션·amber 가독성(#62). 검증 게이트 4/4 통과. 10 URL 302 (v2.0.6 + latest 각 5종). [Memory](.claude/projects/e--github-ssampin/memory/project_v206_bundled_release.md)
- 🔴 **seating-constraints-and-cluster-fix 핫픽스 (사용자 신고 2026-05-20, main)** — 격자 → 모둠 비연동 모드에서 학생이 "알 수 없음" 표시 + 모든 학생이 미배정에 잔존 + 자리 바꾸기 누르면 GroupShuffleOverlay 무한 로딩되던 회귀 차단. 4-Phase: (1) `sanitizeGroups` 순수 함수, (2) `sanitizeSeating` 가 groups 정합화, (3) `changeLayout`/load 시 빈 모둠 자동 복구, (4) `shuffleGroupSeating` 격자 폴백 + Overlay 0-cell 안전망 + `confirmRandomize` groupCount 보정. 검증 게이트 4/4: tsc 0 / lint 0 / test 1457 / regression 9. [Plan](docs/01-plan/features/seating-constraints-and-cluster-fix.plan.md)
- 🟢 **multi-date-attendance Do 단계 완료 (2026-05-20, feature/multi-date-attendance)** — 사용자 피드백 "여러 날짜 출결 일괄 입력" 대응. 3-Phase 모두 구현 + 4단계 검증 게이트 통과. 신규 `calendarUtils` (8 함수 31 unit) + `MultiDatePicker` (single/range/multi 3-mode, 29 unit) + 18단계 변경 + 4 메타테스트 파일(40 케이스). 1304/1304 tests (baseline +74), 9/9 regression. 다음: `/pdca analyze multi-date-attendance`. [Plan](docs/01-plan/features/multi-date-attendance.plan.md) · [Design](docs/02-design/features/multi-date-attendance.design.md)
- 🔴 modal-scroll-overflow-fix 핫픽스 (사용자 신고, 2026-05-19): 13개 모달 wrapping div 에 `flex-1 min-h-0` 추가 + 회귀 차단 메타테스트. Match Rate 97%, 1156/1156 tests. [Report](docs/04-report/features/modal-scroll-overflow-fix.report.md)
- v2.0.5 릴리스: 설문 실시간 답변 확인 + 학생 페이지 fix + 5도구 난수 + 모바일 UX
- PDCA Report 4건 정착: security-hardening, tool-randomness, roster-data-consistency
- 5개 도구 난수 다양성 강화 (secureRandom + anti-repeat)
- 위젯 우측 사이드 레이아웃 프리셋 (Ctrl+5)
- 모바일 UX 개선 다수 (SW 자동 새로고침, safe-area, 스와이프 제거)
- 하네스 엔지니어링 세팅 (CLAUDE.md 리팩터링, 도메인 규칙 분리, 세션 프로토콜)

## In Progress

- 🟢 **realtime-tool-student-page-health PDCA 완료 + 수동 검증 통과 (2026-05-21, main 미커밋)** — 사용자 신고 "워드클라우드·주관식 설문 학생이 응답해도 0명·응답 미수신" 진단 결과 처방. 5단계 흐름 진단으로 (a) v2.0.4 이하 학생 페이지 누적 상태 노출 + (b) WS 미연결 침묵 실패 식별. Phase 0: KB Q&A 3건 추가 (5단계 진단 / 연결 끊김 표시 / 학교 Wi-Fi 화이트리스트 요청 템플릿). Phase 1: 신규 공용 모듈 `electron/ipc/_studentPageChrome.ts` (145줄, 3 export) + 4개 학생 페이지(워드클라우드·주관식·객관식·복합)에 우상단 연결 상태 칩(4상태 색+텍스트, role=status aria-live=polite, 펄스 애니메이션, safe-area-inset 가드) + submit silent no-op 차단. Phase 2: regression-grep-check 신규 5건 (#18~#22). 검증 게이트 4/4: tsc 0 / lint 0 / test 1510 / regression 22/22 (17→22). gap-detector 98% PASS. **사용자 수동 검증 완료 (2026-05-21)**: 4개 도구 학생 페이지 6 시나리오 (정상/제출/끊김/재연결/dim/SE 위치) + 챗봇 KB Q&A 모두 정상 동작 확인. **빌드 노트**: `npm run electron:dev` 는 main process(electron/\*) 코드를 watch 하지 않음 — 학생 페이지 HTML 변경 시 `node scripts/build-electron.mjs` 재실행 + electron 재시작 필수. **다음: git commit + v2.0.7 묶음 릴리즈 (notification-modal-stacking-fix + roster-sample-data-removal 동반)**. [Plan v1.1](docs/01-plan/features/realtime-tool-student-page-health.plan.md) · [Design v1.0](docs/02-design/features/realtime-tool-student-page-health.design.md) · [Analysis](docs/03-analysis/realtime-tool-student-page-health.analysis.md) · [Report](docs/04-report/features/realtime-tool-student-page-health.report.md)
- 🟢 **notification-modal-stacking-fix PDCA 완료 — Match Rate 97% PASS (2026-05-21, main 5 commits)** — 사용자 신고 "처음 일정 알림이 떠 있을 때 X 안 눌리고 창을 껐다 켜야 누름" 핵심 해소. Phase 0(`4136527`) 핫픽스 + Phase 1(`396b5b4`) EventPopup Modal 베이스 마이그레이션 + Phase 2(`3a9b3a9`) ModalCoordinator 우선순위 큐 인프라 신설 + Phase 3(`50f6c6b`) 6개 모달 큐 등록 + SharePromptOverlay Modal 통합 + Phase 4(`003eb1a`) 메타테스트 18건 + REGRESSION 9→17. 검증 게이트 4/4: tsc 0 / lint 0 / test 1503 (+46) / regression 17/17. **다음: v2.0.7 릴리즈 (CLAUDE.md 8단계 워크플로우)**. [Plan v1.1](docs/01-plan/features/notification-modal-stacking-fix.plan.md) · [Design v1.1](docs/02-design/features/notification-modal-stacking-fix.design.md) · [Report](docs/04-report/features/notification-modal-stacking-fix.report.md)
- **multi-date-attendance Check 완료 (2026-05-20, Match Rate 96.7% PASS)** — `feature/multi-date-attendance` 브랜치 6 commits + 분석 보고서 1건. gap-detector 결과 모든 HIGH 항목 100%, LOW 갭 3건 cosmetic. Iterate 불필요. 다음: `/pdca report multi-date-attendance`. [Analysis](docs/03-analysis/multi-date-attendance.analysis.md)
- **freestyle-seating Phase 1~5a + UX 종합 개선 14건 + PDF 출력 완료 (2026-05-20, main 단일 워킹트리)** — Playwright MCP 실사용 점검으로 결함 발견·즉시 수정 누적:
  1. 컨테이너 4:3→16:10 + max-height (viewport 잘림 해소)
  2. 다이얼로그 제목 중복 제거 (srOnlyTitle)
  3. 모둠 카드 groupId 색상 외곽선+배경
  4. ㄷ자형 좌·우 반경 안쪽 조정
  5. 자유 모드에서 「연동」 버튼 숨김
  6. 편집 안내 메시지 freestyle 전용 (다중 선택 설명 포함)
  7. 회전된 책상 가로/세로 swap (좌·우 이름 잘림 해소)
  8. 모둠 내부 cardInnerDx/Dy 최소값 보장 (아바타 겹침 차단)
  9. Figma 스타일 **다중 선택·이동** (선택 박스 드래그 + Shift+클릭 + ESC + `moveMultipleFreestyleDesks` 액션 + 「N개 선택됨」 안내 칩)
  10. 다이얼로그 카드 3종→2종 축소 (모둠형 제거)
  11. **「시험 대형」 신규 type** (rows 대체) + 학번 순 정렬 + 좌↔우 방향 선택 토글
  12. 책상에 **학번 표시** (격자 모드 SeatCard 와 동일 시각 규칙: 학번+출석 dot+이름)
  13. 컨테이너 내부 작은 교탁 제거 (외부 「[ 교 탁 ]」 헤더와 중복 해소)
  14. 시험 대형 **column-major 배치** (1번 1열 1행, 2번 1열 2행, ... 한 열 차면 다음 열로)
  15. **PDF 출력 완전 구현** — `exportFreestyleSeatingToPdf` 신설, 정규화 좌표→A4 매핑, 회전 텍스트, 모둠 색상, 우측 명렬표. 내보내기 메뉴 PDF/Excel/HWPX 3종 노출.

  **검증 게이트 4/4 통과**: tsc 0 errors, lint 0 errors, test 1457/1457, regression 9/9. Playwright 다운로드 검증: `%PDF-1.7` 매직 / 2.23MB / application/pdf. Phase 5b(제약조건 마이그레이션) + Phase 6(Tier 2/3 프리셋)은 별도 PDCA. [Plan](docs/01-plan/features/freestyle-seating.plan.md) · [Design v0.2.1](docs/02-design/features/freestyle-seating.design.md)

## Blocked

- dlekthf0109@naver.com 회신 — 사용자 행동 필요 (Claude 발송 불가)
- ~~v2.0.6 핫픽스 묶음 릴리즈~~ ✅ 2026-05-20 출시 완료

## Next

- 🆕 **collab-board-rb-parity** (Spike 완료, PDCA-1 진입 대기) — 외부 참고 도구 RB(Reference Board)의 협업 캔버스 수준으로 협업보드 고도화. **Stage 1+2+Spike 완료**: deep-interview 8라운드(ambiguity 100→24%) + omc-plan consensus 3 iter (Architect 9/10·Critic 9/10) + **PDCA-0.5 Risk-First Spike** (2026-05-22, 3 worker team, production code merge 0, 18분 wall-clock). **Spike 결과**: SP-1 PASS(customData R2 fallback retire) / SP-2 PASS(81 element 단일 updateScene + teacher binding caveat) / SP-3 CONDITIONAL(33→50ms 보수화). AC-1.5/3.1/6.1/6.5 cascade revision 적용. 다음: PDCA-1 진입 사용자 승인 → `/pdca design collab-board-rb-parity` 또는 스티커 메모 + toolbar scaffold 직접 구현. [Plan v1.0+Spike](docs/01-plan/features/collab-board-rb-parity.plan.md) · [Spec](.omc/specs/deep-interview-collab-board.md) · [Spike Synthesis](.omc/spikes/synthesis-report.md)
- \_workspace/plan.md: 서식관리 Phase 1 MVP
- interactive-slides 기능 (docs/01-plan/features/interactive-slides.plan.md)
- PDCA 문서 구조 활용한 체계적 기능 개발
