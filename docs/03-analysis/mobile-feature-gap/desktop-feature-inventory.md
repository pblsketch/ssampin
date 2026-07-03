# 쌤핀(SsamPin) 데스크톱 앱 — 사용자 기능 전수 목록

> 2026-07-03 조사. `docs/03-analysis/mobile-feature-gap/mobile-feature-gap.analysis.md`의 비교 기준표.

조사 범위: `src/`, `electron/` (모바일 `src/mobile/` 제외). 앱 버전 v2.2.7. 아키텍처: Clean Architecture 4레이어, 로컬 데이터는 Electron IPC(`data:read`/`data:write`)로 유저 데이터 폴더의 JSON 파일에 저장, 클라우드 동기화는 Google Drive(appDataFolder), 실시간 협업은 Supabase Realtime + 로컬 WebSocket 서버+터널.

형식: **기능명 | 카테고리 | 주요 진입점 | 데이터 저장 위치 | Electron 전용(Y/N)**

## 1. 학생 관리 (담임 업무 — HomeroomPage, 탭 8개)

- 명렬(명단) 관리 | 학생 | `src/adapters/components/Homeroom/RosterManagementTab.tsx` | 로컬 `students.json` (useStudentStore) | N
- 명단 가져오기(NEIS/엑셀 붙여넣기, 충돌 병합) | 학생 | `src/adapters/components/Homeroom/RosterImport/ConflictResolveModal.tsx` | 로컬 `students.json` | N
- 학생 기록(특기사항/관찰 기록, 진도·검색·타임라인 모드) | 학생 | `src/adapters/components/Homeroom/Records/RecordsTab.tsx` | 로컬 `student-records.json`, `observations.json` (+ 첨부 `observation-attachments.json`/바이너리) | N
- 생기부 초안(AI 브릿지 write-back 수신·편집·내보내기) | 학생 | `src/adapters/components/Homeroom/Records/HomeroomRecordDraftTab.tsx` | 로컬 `record-drafts.json` (useRecordDraftsStore) | N
- 설문/체크리스트(학생 대상 발제·응답 수집) | 학생 | `src/adapters/components/Homeroom/Survey/SurveyTab.tsx` | 로컬 `surveys.json` + Supabase(실시간 응답) | N
- 과제 수합(제출 현황 관리) | 학생 | `src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx` | 로컬 `assignments.json` (useAssignmentStore) | N
- 상담 예약(슬롯 자동 계산, 예약/재조정/취소) | 학생 | `src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx` | 로컬 `consultations.json` + Supabase(학부모 예약 실시간, `ConsultationSupabaseClient`) | N
- 학급 자리배치(담임) | 학생 | `src/adapters/components/Homeroom/HomeroomPage.tsx` (seating 탭) → `Seating` | 로컬 `seating.json`, `seat-constraints.json` | N
- 학급 성적 개관(담임용 성적 요약) | 학생 | `src/adapters/components/Homeroom/GradeOverview/HomeroomGradeOverviewTab.tsx` | 로컬 `students.json` + 성적 데이터 | N

## 2. 자리배치 (독립 페이지)

- 자리배치도 편집기(드래그 배치·제약조건·랜덤) | 학생 | `src/adapters/components/Seating/Seating.tsx` | 로컬 `seating.json` + `seat-constraints.json` | N

## 3. 수업 관리 (ClassManagementPage — 교과 담당, 탭 8개)

- 수업 학급 관리(교과 학급 CRUD) | 수업 | `src/adapters/components/ClassManagement/ClassList.tsx` | 로컬 `teaching-classes.json` | N
- 학급 명렬 관리(교과) | 수업 | `src/adapters/components/ClassManagement/ClassRosterTab.tsx` | 로컬 `teaching-classes.json` | N
- 수업 기록 + 출결(명단/좌석 뷰, 자동저장) | 수업 | `src/adapters/components/ClassManagement/ClassRecordTab.tsx` | 로컬 `attendance.json`, `observations.json` | N
- 교과 좌석배치 | 수업 | `src/adapters/components/ClassManagement/ClassSeatingTab.tsx` | 로컬 `seating.json` | N
- 진도 관리(교육과정 진도) | 수업 | `src/adapters/components/ClassManagement/ProgressTab.tsx` | 로컬 `curriculum-progress.json` | N
- 교과 설문/체크 | 수업 | `src/adapters/components/ClassManagement/ClassSurveyTab.tsx` | 로컬 `surveys.json` + Supabase | N
- 교과 과제 수합 | 수업 | `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx` | 로컬 `assignments.json` | N
- 수행평가 채점(루브릭 rubric 기반) | 수업 | `src/adapters/components/ClassManagement/Rubric/ClassRubricTab.tsx` | 로컬 `rubrics.json` (useRubricStore) | N
- 성적 분석/관리(지필·수행 배점, 학기 성적 산출) | 수업 | `src/adapters/components/ClassManagement/GradeAnalysis/ClassAssessmentManagementTab.tsx` | 로컬 성적 데이터 (useGradeAnalysisStore, `GradeAnalysis` 엔티티) | N
- 성적표(생기부/전적) 가져오기(NEIS 파일 → 학생별 병합) | 수업 | `src/adapters/stores/useTranscriptStore.ts` + `GradeImportMappingModal.tsx` | 로컬 (ImportedTranscript, manageImportedTranscript) | N

## 4. 시간표 / 일정 / 급식 (연동 중심)

- 시간표(주간/학급/교사, NEIS·컴시간 연동) | 연동 | `src/adapters/components/Timetable/TimetablePage.tsx` | 로컬 `teacher-schedule.json`/`timetable-overrides.json` + NEIS OpenAPI + 컴시간(comcigan) | N
- NEIS 시간표 자동 동기화 | 연동 | `src/adapters/hooks/useNeisAutoSync.ts` | NEIS OpenAPI → 로컬 | N
- 컴시간 교사 시간표 변경 자동 확인 | 연동 | `src/adapters/hooks/useComciganAutoSync.ts` / `electron/ipc/comcigan.ts` | 컴시간 → 로컬 | Y(IPC 프록시)
- 일정/캘린더(월간, Google Calendar 양방향 동기화, 공유 import) | 연동 | `src/adapters/components/Schedule/Schedule.tsx` | 로컬 `events.json` + Google Calendar API | N
- NEIS 학사일정 동기화 | 연동 | `src/adapters/stores/useNeisScheduleStore.ts` | NEIS OpenAPI → 로컬 | N
- 급식(NEIS 급식 + 수동 급식 입력) | 연동 | `src/adapters/components/Meal/MealPage.tsx` | NEIS OpenAPI + 로컬 `manual-meals.json` | N
- 할 일(Google Tasks 양방향 동기화) | 연동 | `src/adapters/components/Todo/Todo.tsx` | 로컬 `todos.json` + Google Tasks API | N

## 5. 메모 / 노트 / 즐겨찾기

- 메모(포스트잇형, 실시간 공유) | 도구 | `src/adapters/components/Memo/MemoPage.tsx` | 로컬 `memos.json` + Supabase(공유 presence, `MemoSharePresenceClient`) | N
- 쌤핀 노트(노트북/섹션/페이지 계층 문서 편집기) | 도구 | `src/adapters/components/Note/NotePage.tsx` | 로컬 `note-notebooks/sections/pages-meta/note-body--{id}.json` (useNoteStore) | N
- 즐겨찾기(북마크 그룹, import/export) | 도구 | `src/adapters/components/Tools/BookmarksPage.tsx` | 로컬 `bookmarks.json` (useBookmarkStore) | N

## 6. 대시보드 / 위젯

- 대시보드(위젯 그리드, 레이아웃·스타일 커스터마이즈) | 시스템 | `src/adapters/components/Dashboard/Dashboard.tsx` + `src/widgets/registry.ts` | 로컬 dashboard config | N
- 대시보드 위젯들: 교사 주간시간표·오늘 수업·학급 시간표·자리배치·오늘 진도·담임 메모장·성적 현황·급식·다가오는 일정·미니 캘린더·메모·할 일·D-Day 카운터·설문/체크·상담 예약·자주 쓰는 도구·즐겨찾기·이미지 스티커·바탕화면 정리·날씨·시계·메시지 배너 | 시스템 | `src/widgets/registry.ts` | 각 도메인 로컬 스토어 + 날씨 API | N
- D-Day 카운터 | 시스템 | `src/adapters/stores/useDDayStore.ts` | 로컬 `dday.json` | N
- 날씨 표시 | 연동 | `src/adapters/components/Dashboard/WeatherBar.tsx` | 날씨 API (useWeatherStore) | N

## 7. 쌤도구 (Tools — ToolsGrid, 도구 그리드)

_(공통 진입점 `src/adapters/components/Tools/ToolsGrid.tsx` / `toolRegistry.ts`)_

- 병렬(듀얼) 도구 뷰 — 두 도구 좌우 분할 실행 | 도구 | `src/adapters/components/Tools/DualToolContainer.tsx` | 로컬(도구별) | N
- 도구 정리하기(순서·표시 커스터마이즈) | 도구 | `ToolsGrid.tsx` (ToolsOrganizerModal) | 로컬 settings(`toolsOrder`/`hiddenTools`) | N
- 미니앱 "내가 만든 앱"(HTML 앱 등록 → 격리 webview 실행) | 도구 | `src/adapters/components/Tools/MiniApps/MiniAppRunner.tsx` (`miniapp://` 프로토콜) | 로컬 파일 + useMiniAppStore | **Y**

### 실시간 협업 도구 (학생 휴대폰 참여 — 로컬 WebSocket 서버 + 터널 + QR)

- 객관식 설문(실시간 투표) | 도구 | `src/adapters/components/Tools/ToolPoll.tsx` / `electron/ipc/liveVote.ts` | 로컬 세션 + 터널 서버 | **Y**(호스트 서버)
- 주관식 설문(실시간) | 도구 | `ToolSurvey.tsx` / `electron/ipc/liveSurvey.ts` | 로컬 세션 + 터널 | **Y**
- 복합 유형 설문(V2, 여러 문항 유형) | 도구 | `src/adapters/components/MultiSurvey/` / `electron/ipc/liveMultiSurvey.ts` | Supabase(V2 store) + 로컬 | **Y**
- 워드클라우드 브레인스토밍(실시간) | 도구 | `ToolWordCloud.tsx` / `electron/ipc/liveWordCloud.ts` | 로컬 + 터널 (useWordCloudHistoryStore) | **Y**
- 실시간 담벼락(칸반형·자유배치 글 수집) | 도구 | `ToolRealtimeWall.tsx` / `electron/ipc/realtimeWall.ts` | Supabase(useRealtimeWallSyncStore) + 로컬 | **Y**
- 협업 보드(실시간 공동 작업) | 도구 | `ToolCollabBoard.tsx` / `electron/ipc/board.ts` | Supabase(useBoardStore/useBoardSessionStore) | **Y**
- 가치수직선 토론(실시간) | 도구 | `Tools/Discussion/ToolValueLine` / `electron/ipc/liveDiscussion.ts` | 로컬 + 터널 | **Y**
- 신호등 토론(찬성·보류·반대) | 도구 | `Tools/Discussion/ToolTrafficLightDiscussion` / `electron/ipc/discussionTrafficLightHTML.ts` | 로컬 + 터널 | **Y**
- 서명받기(명단에 QR 서명 수집 → 구글시트 등록부) | 도구 | `ToolSignatureRoster.tsx` (`src/student/StudentSignatureApp.tsx`) | Supabase + 로컬(useSignatureRosterStore) + Google Sheets | **Y**
- 교실 약속 정하기(만약-그러면 실행 약속, 실시간) | 도구 | `ToolClassroomAgreement.tsx` / `electron/ipc/classroomAgreement.ts` | Supabase(useClassroomAgreementStore) | **Y**
- 인터랙티브 슬라이드(Slides/PDF 위 실시간 응답 — 코드 보존, UI 노출 보류) | 도구 | `Tools/InteractiveSlides` / `electron/ipc/interactiveSlides.ts` | Supabase(useInteractiveLessonStore/useSlidesSessionStore) | **Y**

### 단독 실행 도구 (로컬/오프라인)

- 타이머 | 도구 | `Tools/Timer` | 로컬(도구 프리셋) | N
- 랜덤 뽑기 | 도구 | `ToolRandom.tsx` | 로컬 | N
- 신호등 | 도구 | `ToolTrafficLight.tsx` | 로컬 | N
- 점수판 | 도구 | `ToolScoreboard.tsx` | 로컬(useToolResultStore) | N
- 룰렛 | 도구 | `ToolRoulette.tsx` | 로컬 | N
- 주사위 | 도구 | `ToolDice.tsx` | 로컬 | N
- 동전 | 도구 | `ToolCoin.tsx` | 로컬 | N
- QR코드 생성 | 도구 | `ToolQRCode.tsx` | — | N
- 활동 기호(수업 모드 표시) | 도구 | `ToolWorkSymbols.tsx` | 로컬 | N
- 자리 뽑기(학생 자율 자리 선택) | 도구 | `ToolSeatPicker.tsx` | 로컬(useSeatPickerConfigStore) | N
- 모둠 편성기(조건별 모둠 구성) | 도구 | `ToolGrouping.tsx` | 로컬 | N
- 칠판(분필 판서) | 도구 | `ToolChalkboard.tsx` | 로컬 | N
- 과제수합(도구판) | 도구 | `Tools/Assignment/AssignmentTool.tsx` → `AssignmentDetail.tsx` | 로컬 `assignments.json` | N
- 배점 계산기(지필 문항 배점 설계) | 도구 | `ToolScoreAllocator.tsx` | 로컬 | N
- 마크다운 변환기(한글/PDF/엑셀 → AI용 텍스트, 개인정보 마스킹) | 도구 | `ToolMarkdownConvert.tsx` / `electron/ipc/markdownConvert.ts` | 로컬 파일 파싱 | **Y**(파일 파싱 IPC)
- 서식(HWPX·PDF·Excel 서식 모음, 열기·인쇄) | 도구 | `Tools/Forms/FormsPage.tsx` (lazy) | 로컬 파일(`forms:*` IPC) | **Y**
- 학교 알리미(학교알리미 공시·학사일정·평가계획, 옆 학교 비교) | 연동 | `SchoolAnnouncements/SchoolAnnouncementsPage.tsx` / `electron/ipc/schoolinfoDisclosure.ts`·`schoolinfoEvaluation.ts` | 학교알리미 OpenAPI + NEIS | N(외부 API는 IPC 프록시)
- 내 이모티콘(단축키로 어디든 붙여넣는 이모티콘/이미지) | 도구 | `ToolMyEmoji.tsx` + `StickerPicker/StickerPickerApp.tsx` | 로컬 `stickers.json` + 이미지 바이너리 (`sticker:*` IPC, 클립보드·글로벌 단축키) | **Y**
- 숲소리(교육 웹진) | 도구 | 외부 URL `https://supsori.com` (`shell:openExternal`) | — | N
- PBL스케치(수업·평가 설계) | 도구 | 외부 URL `https://pblsketch.xyz` | — | N

## 8. 내보내기 / 공유

- 내보내기(시간표·자리배치·일정·학생기록 → Excel/HWPX/PDF) | 도구 | `src/adapters/components/Export/Export.tsx` | 로컬 데이터 → 파일 (ExcelExporter/HwpxExporter/PDF) | N(파일 저장은 IPC)
- 공유 파일(.ssampin) 내보내기/가져오기 | 시스템 | `src/adapters/components/Share/ShareModal.tsx` + `domain/rules/shareRules.ts` | 로컬 `.ssampin` 파일 | Y(파일 열기 IPC)
- 지인에게 추천/건의사항 보내기(피드백) | 시스템 | `common/FeedbackModal.tsx` / useShareStore | — | N

## 9. AI 연동

- AI 브릿지(외부 AI Claude/Codex와 MCP 연결 — 일정·할일·생기부 write-back) | 연동 | `electron/ipc/aiBridge.ts` + `electron/ai-bridge/index.mjs` + `useAiBridgeLiveSync.ts` | MCP 서버(로컬) → 로컬 스토어 | **Y**
- AI 브릿지 동의/연결 관리 | 연동 | `src/adapters/stores/useAiBridgeConsentStore.ts` (설정 ai-bridge 탭) | 로컬 settings | Y
- 도움말 챗봇(HelpChatPanel) | 시스템 | `src/adapters/components/HelpChat/` | — | N

## 10. 시스템 / 설정 / Electron 전용

- 설정(17개 탭: google/school/period/widget/seat/security/calendar/weather/display/sidebar/todo/tools/shortcuts/system/backup/ai-bridge/about) | 시스템 | `src/adapters/components/Settings/SettingsPage.tsx` | 로컬 `settings.json` | N
- Google 계정 연결(OAuth PKCE) | 연동 | `Settings` google 탭 / `electron/ipc/oauth.ts` | 로컬 보안 저장(`secureStorage`) | **Y**(OAuth 콜백)
- Google Drive 백업/동기화(자동·수동·충돌 해결·최초 동기화) | 연동 | `useDriveSyncStore.ts` + `usecases/sync/` | Google Drive appDataFolder(JSON) | N
- PIN 잠금(기능별 보호) | 시스템 | `common/PinGuard.tsx` / `usePinStore.ts` | 로컬(`PinSettings`) | N
- 데이터 백업 내보내기/가져오기(전체 데이터 폴더 zip) | 시스템 | `electron/backupManager.ts` (`backup:*` IPC) | 로컬 파일 시스템 | **Y**
- 데이터 저장 위치 열기 | 시스템 | `backup:openDataLocation` IPC | 로컬 파일 시스템 | **Y**
- 자동 업데이트(확인·다운로드·설치) | 시스템 | `electron/main.ts` (`update:*` IPC) + `UpdateNotification.tsx` | — | **Y**
- 바탕화면 위젯(투명 창, 데스크톱 모드, 항상 위) | 시스템 | `src/adapters/components/Widget/Widget.tsx` + `electron/desktopWidgetManager.ts` | 로컬 dashboard config | **Y**
- 아이콘 모드 / 바탕화면 핀("쌤핀이" 캐릭터, 드래그·오늘 요약 팝오버) | 시스템 | `src/adapters/components/Icon/IconWindow.tsx` + `electron/iconWindowGeometry.ts` (`icon:*` IPC) | 로컬 settings | **Y**
- 퀵애드 팝업(글로벌 단축키 Ctrl+Alt+T/E/M/N → 할일·일정·메모·노트·북마크 즉시 추가) | 시스템 | `common/QuickAdd/QuickAddModal.tsx` + `useGlobalShortcuts.ts` | 로컬 각 스토어 | **Y**(글로벌 단축키)
- 명령 팔레트(Ctrl+K 페이지·명령 검색) | 시스템 | `common/CommandPalette.tsx` (useCommandRecentStore) | 로컬 | N
- 창 닫기 동작 선택(트레이/위젯/아이콘) | 시스템 | `common/CloseActionDialog.tsx` | 로컬 settings | **Y**
- 바탕화면 정리(데스크톱 아이콘 정리 안내) | 시스템 | `useDesktopOrganizeStore.ts` + `electron/platform/win32Desktop.ts` | 로컬 | **Y**
- 온보딩(첫 실행 안내) | 시스템 | `src/adapters/components/Onboarding/Onboarding.tsx` | 로컬 settings | N
- 사이드바 커스터마이즈(메뉴 순서·숨김·접기 Ctrl+B) | 시스템 | `Layout/Sidebar.tsx` | 로컬 settings | N
- 테마/글꼴/글꼴크기 커스터마이즈 | 시스템 | `useThemeApplier.ts` / `useFontApplier.ts` | 로컬 settings | N
- 사용 분석(Analytics) | 시스템 | `src/adapters/hooks/useAnalytics.ts` | 외부 analytics | N

---

## 쌤도구 전체 목록 (도구 이름 그대로 — `ToolsGrid.tsx` TOOLS 배열 순서)

1. 타이머
2. 랜덤 뽑기
3. 신호등
4. 점수판
5. 룰렛
6. 주사위
7. 동전
8. QR코드
9. 활동 기호
10. 객관식 설문
11. 주관식 설문
12. 복합 유형 설문
13. 교실 약속 정하기
14. 서명받기
15. 워드클라우드 브레인스토밍
16. 자리 뽑기
17. 모둠 편성기
18. 과제수합
19. 가치수직선 토론
20. 신호등 토론
21. 칠판
22. 협업 보드
23. 내 이모티콘
24. 실시간 담벼락 (BETA)
25. 인터랙티브 슬라이드 _(코드·라우팅 존재하나 v2.0.6 이후 그리드 노출 보류 — 주석 처리됨)_
26. 서식
27. 마크다운 변환기 (NEW)
28. 학교 알리미 (NEW)
29. 배점 계산기 (NEW)
30. 숲소리 (외부 링크)
31. PBL스케치 (외부 링크)

---

## 모바일 격차 비교 시 유의점 (Electron 전용 = 모바일 물리적 제약 후보)

다음은 데스크톱에서만 물리적으로 가능한 기능으로, 모바일에서 없거나 다른 형태여야 하는 후보:

- **바탕화면 위젯 / 아이콘 모드(바탕화면 핀) / 항상 위 / 트레이 / 창 닫기 동작** — 데스크톱 창 관리 의존
- **퀵애드 글로벌 단축키·내 이모티콘 붙여넣기** — OS 전역 단축키·클립보드 주입 의존
- **미니앱 webview 실행** — Electron `<webview>` + `miniapp://` 프로토콜 의존
- **실시간 협업 도구 호스트(설문·워드클라우드·담벼락·토론·서명 등)** — 로컬 WebSocket 서버 + 터널(`electron/ipc/tunnel.ts`, `sessionedWebSocketServer.ts`)로 학생 접속 수용. 참여자(학생)측은 웹(`src/student/`)이지만 **개설(호스트)은 데스크톱 전용**
- **AI 브릿지(MCP 서버 구동)** — `ELECTRON_RUN_AS_NODE`로 로컬 Node 서버 실행
- **마크다운 변환기·서식 열기/인쇄·데이터 백업 zip·파일(.ssampin) 열기** — 로컬 파일시스템 접근
- **자동 업데이트, 컴시간/학교알리미 IPC 프록시** — 메인 프로세스 네트워크·업데이터 의존

주: 데이터 저장 위치는 대부분 **로컬 JSON 스토어**(파일명은 `src/usecases/sync/syncRegistry.ts`의 `SYNC_REGISTRY` 30개 도메인 참조)이며, 이들은 Google Drive로 동기화된다. 실시간/공유 기능은 **Supabase**(consultation, memo-share, realtime-wall, board, classroom-agreement, multi-survey-v2), 외부 데이터는 **NEIS/컴시간/학교알리미 OpenAPI**, 연동은 **Google Calendar/Tasks/Drive/Sheets API**를 사용한다.
