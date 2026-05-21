# Progress

마지막 업데이트: 2026-05-21 KST

## Current Version

v2.0.6 (2026-05-20 출시 완료, tag `v2.0.6`, main `eaa687d`).

**다음 릴리즈 v2.0.7 후보 묶음 (사용자 결정 2026-05-21: 단독 X, 다른 PDCA와 묶음 대기)**:

1. ✅ notification-modal-stacking-fix Phase 0~4 — Match Rate 97% PASS, main `3cc8c88` (2026-05-21)
2. ✅ realtime-tool-student-page-health Phase 0+1+2 — 학생 페이지 WS 헬스 인디케이터 + KB Q&A 3건 + 회귀 5건 (2026-05-21)
3. ✅ **roster-sample-data-removal Phase 1+2+3** — Match Rate 99.0% PASS (2026-05-21). 사용자 피드백 "담임 업무에 있는 학생들이 내 학생들이 아니야" 해소. SAMPLE_STUDENTS 35명 자동 채움 제거 + 6중 안전 가드(A·B·C·D·E·F·G) 마이그레이션 + 9개 화면 EmptyState 가드 + amber 경고 배너 + 사이드바 빨간 점 + 마이그레이션 토스트. 검증 게이트 4/4: tsc 0 / lint 0 / vitest 1566 (+63) / regression 24/24 (+2 메타테스트). Dev 도구 `npm run electron:dev:fresh` 추가 (별도 데이터 폴더). [Plan v1.2](docs/01-plan/features/roster-sample-data-removal.plan.md) · [Design v1.2](docs/02-design/features/roster-sample-data-removal.design.md) · [Analysis 99.0%](docs/03-analysis/roster-sample-data-removal.analysis.md)
4. ⏳ 다른 기능 PDCA들이 추가되면 함께 묶음 릴리즈

## Completed (최근)

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

- \_workspace/plan.md: 서식관리 Phase 1 MVP
- interactive-slides 기능 (docs/01-plan/features/interactive-slides.plan.md)
- PDCA 문서 구조 활용한 체계적 기능 개발
