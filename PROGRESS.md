# Progress

마지막 업데이트: 2026-06-11 KST

## Recently completed (다음 릴리즈 묶음 후보)

- 🛡️ **Dependabot 취약점 12건 일괄 처리 (2026-06-11)** — v2.0.x security-hardening 잔여 패시브("npm audit 게이트 승격") 일부 해소. **루트**: shell-quote 1.8.3→1.8.4(critical, concurrently가 exact pin → `overrides` 필요) + tmp 0.2.5→0.2.7(high, `npm audit fix`) + uuid 8.3.2→11.1.1(moderate, @blocknote/exceljs 경유 → `overrides` — 취약점은 v3/v5/v6+buf 전용이라 v4만 쓰는 양쪽 모두 무영향, Excel/Xlsx exporter 테스트로 실증) / **file-type(moderate)은 수정판 없음** — jimp 0.22(nut-js)가 16.x exact pin + 17+는 ESM-only라 강제 시 스티커 자동 붙여넣기 파손 → GitHub alert #21 `tolerable_risk` dismiss(입력이 로컬 전용). **landing**: next 16.1.6→16.2.9(high 1+moderate 다수, 동일 마이너) + 중첩 postcss 8.4.31→8.5.15(`overrides`) → `npm audit` 0건 + tsc 0 + next build 통과. **spike(s1-cdn-poc)**: ws 8.21.0 lockfile-only 갱신. **사고 1건 복구**: 클린 재설치 중 실행 중인 Electron dev 앱이 `electron/dist` 잠금 → rm 중단 → exceljs 중첩 bluebird 손상(테스트 4파일 로드 실패)으로 발현 → exceljs 서브트리 재설치로 정상화. ⚠️ 교훈: **클린 재설치 전 Electron dev 앱 종료 확인 필수**. 검증: tsc 0 / lint 0 errors / vitest 164 files 2097 passed / regression 34/34 / build-electron OK / landing build OK. 남은 audit: 루트 moderate 7건 전부 file-type 사슬(수정 불가, dismiss 처리).

- 🧩 **대시보드 위젯 크기 조절 회귀 fix (2026-06-11, main `260f2d0` 커밋)** — 사용자 신고 "위젯 카드 크기 편집이 안 됨". 근본 원인: v2.0.8 widget-modal 개편(`4442207`)에서 편집 모드 → quadrant dwell 호버(우상단 60×60 + 300ms)로 바뀌면서, 핸들 표시 후 모서리 zone을 벗어나면 **100ms 만에 핸들이 unmount** — 우측(가로)/하단(세로) 리사이즈 핸들까지 마우스가 도달할 수 없어 크기 편집이 사실상 불능이었음(⋮/✕ pill에만 유지 처리가 있었고 리사이즈 핸들에는 누락). 수정: 핸들 표시 후에는 카드 내부에 마우스가 있는 동안 유지 + 카드 전체 이탈 시 150ms 후 숨김 + 리사이즈 드래그 중(`isResizing`)에는 카드 밖에서도 유지. 표시 조건(quadrant dwell)은 그대로. 변경 3파일: `SortableWidget.tsx` / `WidgetResizeHandle.tsx` / `WidgetVerticalResizeHandle.tsx`(`onDraggingChange` prop 추가). 검증 게이트 4/4: tsc 0 / eslint 변경 파일 0 / vitest 2097 passed (164 files) / regression 34/34 + **Playwright 실브라우저 검증**(quadrant dwell→핸들 표시→가장자리 이동 후 유지→드래그 colSpan 2→3(653→986px)·rowSpan 5→8 localStorage 저장 확인). ⚠️ 부수 사건: 커밋 중 lint-staged .bin 링크 깨짐 발견 → npm install 중 실행 중이던 dev Electron 5개가 파일 잠금으로 EBUSY 중단 → electron 프로세스 종료 후 `npm install` 재실행으로 node_modules 완전 복구(lockfile 변경 없음).

- ✅ **챗봇 장애(6/3~6/11) 복구 + 대시보드 대화 원문 전체 보기 (2026-06-11, main `4922621` push 완료)** — (1) **장애 진단·복구 완료**: 6/3 11:09 KST부터 챗봇 전면 다운(`ssampin-chat` 500). 근본 원인: Gemini `GOOGLE_API_KEY` 무효화(`API_KEY_INVALID`) — 로컬 `.env` 키 SHA256 = Supabase secret digest 일치로 배포 키 확정. git 히스토리에 키 커밋 이력 0건(저장소 유출 아님). 대화 저장이 답변 성공 후에만 실행되어 장애 기간(8일) 대화 기록 전무. 사용자가 새 키 발급 → 양 모델(generateContent/embedContent) 200 사전 검증 → `supabase secrets set` + 로컬 `.env` 갱신 → E2E 검증(isTest POST 200 + 한글 질문/답변 DB 저장 + sources 확인, 디버그 행 삭제). 같은 secret을 쓰는 ssampin-embed(KB ingest)도 일괄 복구. ⚠️ 교훈: 외부 키 단일 장애점 — 8일간 조용히 다운돼도 감지 수단 없음, 헬스체크/실패 로그 저장은 추후 개선 후보. (2) **대시보드 개선(완료·배포)**: 관리자 Analytics "챗봇 대화 원문" — 답변 300자 잘림 제거 → 질문/답변 말풍선 전문 표시 + 메시지별 시각 + 참조 문서(sources) 칩, 조회 200→1000건, 세션 30개 제한 → "더 보기" +30 페이지네이션. 검증: landing tsc 0 + next build 통과, Vercel 자동 배포.

- 📋 **MultiSurvey v2 라이브 흐름 완결 — 배포 가능 상태 (2026-06-11, main 미커밋)** — Phase C까지 메이커만 연결돼 있던 결정적 갭 3종 해소. (1) **라이브 흐름 연결**: 메이커 "설문(퀴즈) 시작" → `LiveConsoleContainer` 신설이 학생 접속 서버(`live-multi-survey:start` stepMode=true) 기동 + 터널·숏코드(LiveSessionClient) 발급 + `TeacherConsole` 렌더. phase 전이 시 학생 페이지 IPC 동기화(lobby→activate / open→reveal / revealed·round_result→advance·end-session / podium→stop). roster→students, 학생 답변→`liveBridge.buildResponseFromLiveAnswer`(정답 판정·점수는 domain rules)→responses upsert. StrictMode 이중 mount 안전(liveId 단위 기동/정리 단일 effect). (2) **v2 세션 영속화**: `useMultiSurveyV2Store` partialize에 sessions+selectedSessionId 추가 — 앱 재시작 시 작성한 설문 소실 해소. 메이커 헤더에 세션 선택 select + "+ 새 설문" + 삭제(2단계 확인, `--sp-error` 토큰 신규 — index.css 3개 테마 블록, v2 학생 폼들이 이미 참조하던 미정의 변수 잠재 버그 해소). (3) **no-op 버튼 해소**: 저장→"저장됨 ✓" 플래시(자동 영속 확인 피드백), 리포트 버튼 제거(미구현 dead UI), 시작 버튼 `validateSession` 가드(실패 사유 툴팁). (4) **'게임' 표기 → '설문(퀴즈)'**: "게임 시작"→"설문(퀴즈) 시작", 토글 그룹 부제 "게임 메카닉"→"설문(퀴즈) 메카닉" (사용자 지시 2026-06-11). (5) **IPC 확장**: `student-answered` 이벤트에 `answer` 원본 payload 추가(additive — v1 UI 무영향) + preload/global.d.ts 타입. 신규 `src/adapters/multiSurvey/live/liveBridge.ts`(9종 문항→학생 HTML 4종 다운매핑: ox→O/X single-choice, multiple→multi-choice, short/blank/description→text — 정답 정보 학생 페이지 유출 0) + 단위 테스트 12건. 검증 게이트: tsc 0 / lint 0 errors / vitest 163 files 2090 passed(FillFormFields 1건 flaky — 재실행 전체 통과 확인) / regression 34/34 / migration-roundtrip 5단계 ✓ / check-flag-usage 3/3 / check-hex 0건 / check-sp-coverage 1215. electron main 재번들 완료(`node scripts/build-electron.mjs` — dev watch 함정 회피). **남은 이연 항목(후속 PDCA)**: Share view(교실 모니터 별도 창) 미연결, STUDENT_WAVE·TOGGLE_FOCUS_MODE IPC 미등록, 콘솔 타이머 실시간 카운트다운(현재 정적 표시), 빠른풀이/연속정답/랜덤 보너스 점수(calcSessionScore), blank 초성 비교. **다음**: 실기기 C.6 시나리오 수동 검증(교사 시작→학생 QR 입장→답변→정답 공개→포디움) → 커밋. **(추가 UX 결정 2건, 같은 날 사용자 지시)** ① 시작 버튼 비활성 사유를 툴팁→버튼 옆 상시 표시 텍스트로 승격(`startBlockerMessage` — "N번 문항의 내용/정답을 입력해주세요" 교사용 문구, validateSession 폴백). ② **자동 넘김 OFF 시 타이머 전면 비표시**(편집기 스테퍼·문항 칩 ⏱·미리보기 ⏱·콘솔 문항 메타·콘솔 TimerBar 5곳 — 교사 주도 진행에선 무의미). ③ **입장 코드 폐기 — QR+링크만**(LobbyView EntryCodeDisplay 제거+URL 20px 승격, ConsoleHeader 코드 표시 제거, EntryCodeDisplay.tsx 삭제, 숏코드 등록은 짧은 주소 발급용으로 유지). 재검증: tsc 0 / lint 0 errors / regression 34/34 / hex 0 / sp-coverage 1208.

- 🎨 **협업보드 PDCA-1/2 실작동 리팩토링 — "고도화가 잘 안됨" 근본 원인 5건 수술 (2026-06-11, main 미커밋)** — 변경 파일 2개: `src/infrastructure/board/generateBoardHTML.ts`(학생/교사 보드 페이지) + `src/adapters/components/Tools/Board/BoardQRCard.tsx`. (1) **(치명) revert 권한 가드 → 선택 차단 가드**: 이전 가드는 다른 학생의 정상 편집(원격 변경)도 "남의 요소 수정"으로 오판해 강제로 되돌리고 그 되돌림을 다시 전체에 전파 — 2명만 접속해도 서로 되돌리는 충돌 + 안내 토스트 도배로 협업 자체가 불능이었음. 요소를 수정하려면 먼저 선택해야 한다는 점을 이용해, 남의 요소를 선택하는 순간 선택만 해제(로컬 상태라 전파 없음)하는 방식으로 교체. (2) **(치명) 내가 만든 것도 못 고치던 잠김 해소**: 작성자 표시가 스티커에만 붙어 일반 도형·텍스트는 만든 본인조차 수정 불가였음 → 내가 새로 만든 모든 요소에 finalize 시점 작성자 태깅(+version bump 로 동기화 보장, 원격 요소 오태깅 방지 로직 포함). (3) **(UX) 스티커가 진짜 포스트잇으로**: 텍스트 요소 배경색은 Excalidraw 가 그리지 않아 색이 안 보였음 → 작성 완료 시 색 사각형 + 내부 텍스트(⭐작성자 첫 줄)로 자동 변환, 연속 작성 지원. (4) **(미완 → 완료) 도형 12종 버튼 활성화**: 누르면 콘솔 로그만 찍히던 placeholder 를 전부 실제 동작으로 — 도구형 8종(직선·화살표·사각형·둥근사각형·원·마름모·텍스트·양방향 화살표) + 스탬프형 4종(삼각형·오각형·블록 화살표·꺾인 화살표: 화면 중앙 즉시 추가 후 바로 끌어 배치). 누름 상태가 실제 활성 도구와 자동 동기화(ESC 대응). (5) **(UX) 교사가 보드에 들어갈 길 신설**: 교사 화면은 QR/접속자 목록뿐 캔버스 진입 불가였음 → 세션 카드에 **[보드 열기]** 버튼 추가, 기본 브라우저에서 `?role=teacher`로 이름 입력 없이 '선생님' 즉시 입장 + 전체 편집 권한(폐쇄 교실 클라이언트 신뢰 — Plan ADR 정합). **검증 게이트 4/4**: tsc 0 / eslint 변경 파일 0 / vitest 162 files 2078 passed 9 skipped / regression 34/34. 추가로 인라인 학생 페이지 JS 는 tsc 가 못 보므로 esbuild 번들→HTML 생성→`node --check` 구문·마커·잔재 검사 신설(.omc/tmp/check-board-html.mjs) ALL PASS. `node scripts/build-electron.mjs` 재번들 + 신규 심볼 3종 grep 확인(electron dev watch 함정 회피). omc 장부 `.omc/ultragoal/collab-board-rb-parity/goal-ledger.md` G002~G004 complete 갱신(이전 세션 누락 소급). **다음**: 실기기 2-브라우저 수동 시나리오(스티커→타 학생 선택 차단→도형 12종→교사 보드 열기) → 커밋 → G005(PDCA-3 템플릿 4종). **알려진 한계**: 지우개 도구(E)는 선택 없이 삭제 가능(권한 가드 우회) — PDCA-5 권한 단계에서 재검토. **(추가 fix, 같은 날)** 사용자 신고 "도구 창 겹침" — 좌측 고정이던 스티커/도형 패널이 Excalidraw 메뉴·속성 패널(불투명도/레이어)을 가림 → 우측 상단(`top:64px; right:12px`)으로 이동 + 🧰 접기/펼치기 버튼 + max-height 스크롤. **(추가 fix 2, 같은 날)** 사용자 신고 "스티커 클릭해도 안 만들어짐" — "색 선택→text 도구→입력 완료 시 변환" 4단계 모드는 (a) 클릭 즉시 피드백 0 (b) Excalidraw 가 텍스트 편집 중 activeTool 복귀 시 모드 풀림 허점 → **색 클릭 즉시 화면 중앙에 포스트잇 생성**(도형 스탬프와 동일 패턴, 계단식 offset, '⭐작성자\n메모를 입력하세요' 프리필, 생성 직후 선택 + 더블클릭 편집 toast 안내)으로 단순화. activeStickerColor 모드 머신 전부 제거. 인라인 JS 구문검사·lint 0·regression 34/34·build-electron 재번들 확인. ⚠️ 반영하려면 앱 재시작 + 보드 세션 재시작 필요(HTML 은 세션 시작 시 1회 생성).

- ✍️ **서명받기(sigv2) 도구 전면 리팩토링 — 5단계 마법사 UX + 수업반 명렬 + 임포트 열 매핑 + 404 정정 (2026-06-11, main `18f16e3`)** — 사용자 신고 5건 전부 해소. (1) **404 근본 원인 + 링크 도메인 결정**: 링크는 `https://ssampin.com/sign/{code}` 유지(사용자 선호 — 짧고 브랜드 일치), `landing/vercel.json`에 `/sign/:path* → https://m.ssampin.com/sign/:path*` 307 redirect 추가로 해소. 실제 페이지는 모바일 번들(`src/mobile/main.tsx`)이 처리. `.env.example` + `docs/signature-deployment-checklist.md` sigv2 기준 전면 재작성(기존 문서는 폐기된 2C 구조 기준이었음). 추가: 임포트 시 매핑 안 된 기존 열 정리 옵션(가져온 양식 ↔ 열 편집 동기화) + 열 편집 순서 변경(위/아래) 버튼. (2) **단계 UX**: 한 화면 일괄 설정 → `기본 정보 → 명단 구성 → 공개 설정 → 공유·현황 → 등록부 생성` 5단계 마법사(이전/다음 + 클릭 가능한 인디케이터 + 공개 후 ①~③ 잠금). (3) **수업반 명렬**: `useTeachingClassStore` 연동 — 담임반 버튼 옆에 수업반별 버튼(활성 학생만, 소속=학생별 학년-반 폴백 수업반명, 연번=출석번호). (4) **붙여넣기/CSV ↔ 열 편집 양방향 연동**: `parseRosterGrid → suggestImportTargets → 매핑 미리보기 UI(RosterImportMapping) → applyImportMapping` — 칸별 대상 열 선택 + '새 열로 추가' 시 열 편집기에 자동 생성 + 중복 매핑 가드 + 인라인 편집 명단 표(RosterTable). (5) **숨은 버그 3건**: 접근 코드가 서버로 전송되지 않아 accessCodeEnabled 시 publish 400 (ISignaturePort에 accessCode 추가 + 클라이언트 전달), 세션 비영속으로 앱 재시작 시 adminKey 유실(localStorage 영속 + 공개 시점 명단 스냅샷째 보관), 도구 재진입 시 members 빈 배열로 등록부가 빈 시트로 생성되던 문제(세션 스냅샷 기준 내보내기로 정정). 구조: 1,443줄 단일 파일 → `ToolSignatureRoster.tsx`(마법사) + `SignatureRoster/{signatureRosterLogic.ts, RosterImportMapping.tsx, RosterTable.tsx, SessionPanels.tsx}`. 검증 게이트 4/4: tsc 0 / lint 본 작업 범위 0 errors 0 warnings(MemoFocus 1 error는 다른 세션 부채) / vitest 162 files 2076 passed(신규 13건 포함, Notice 메타테스트 amber 가드 위반 1건 수정) / regression 34/34. 다음: 커밋·푸시 → m.ssampin.com 재배포 확인 → 실기기 QR 시나리오(공개→서명→현황→시트/Excel) 수동 검증.

- 📋 **MultiSurvey v2 G004 Phase C C.4 완료 — v1 템플릿 추출 + opt-in 이벤트 로깅 (2026-05-30)** — Phase C C.0/C.1/C.3 직후 잔여 C.4를 1 파일 5 영역 수술적 편집으로 완결. (1) `useV1MultiSurveyData()` 빈 배열 stub → `useToolTemplateStore`의 `toolType==='multi-survey'` 템플릿을 V1Survey shape(id/title/questions/submissions=[]/isOpen=false/createdAt epoch ms)로 변환 — `Date.parse(template.createdAt)` ISO 8601 → epoch ms + `useEffect` 자동 load + `useMemo` 변환 캐시. (2) `useAnalytics().trackRaw` 채널 도입 — AnalyticsEvent enum(보호 파일) 비-확장 원칙으로 4종 신규 이벤트(`multi_survey_v2_opt_in`, `multi_survey_v2_opt_out`, `multi_survey_v2_migration_completed`, `multi_survey_v2_migration_failed`) 게재. Phase D 합격선 95% (Q5 ADR-005 폴백 90% 포함) 측정의 분자 입력. (3) 마이그레이션 useEffect 보강 — `v1Sessions.length===0` 시 ref 미세팅 → 템플릿 비동기 로드 후 재진입 시 자동 재시도 가능. runMigration 결과를 success/failed 이벤트로 로깅. (4) `handleOptIn`/`handleRollbackToV1` 콜백에 클릭 시점 트래킹 추가 — V2OptInBanner의 inline 콜백을 참조로 교체. 검증: tsc 0 errors / lint 0 errors / check-flag-usage 3/3 (추가 호출 없음) / check-hex-hardcoding 0건 / check-sp-coverage 1175건 / migration-roundtrip 29/29 / 보호 파일 10종 GUARD-CLEAN (useAnalytics는 useSettingsStore _읽기만_ — 본 파일은 비-수정). 다음: C.2 정성 게이트 시각 검증(데스크톱 실 화면) → C.6 사용자 테스트 5 시나리오 → C.5 릴리즈 워크플로우 → G004 complete checkpoint.

- 📋 **MultiSurvey v2 G004 Phase C C.0 + C.1 + C.3 진입 완료 (ADR-010 발행, 2026-05-30)** — G003 Phase B(55 신규 파일) 직후 Phase C 진입. (1) **C.0 Phase B 잔여 통합 완료**: `MultiSurveyToolEntry.tsx` 신규 작성 (`useRealtimeToolFlag` 3번째이자 마지막 호출 위치 — check-flag-usage 3/3 PASS), `MakerLayout` 자동 진입 + 빈 세션 1개 자동 생성 + V2OptInBanner(flag OFF 시) + 이전 도구로 복귀 버튼(flag ON 시) + MigrationReportModal `api` prop 주입 + 자동 마이그레이션 트리거 useRef로 1회 보장. `toolRegistry.ts:76` + `App.tsx:353` 두 진입점 `ToolMultiSurvey` → `MultiSurveyToolEntry` 교체. v1 데이터 추출은 `useV1MultiSurveyData()` 빈 배열 stub(TODO C.4-followup으로 분리). (2) **C.1 미감 정량 게이트 자동화 3종**: ADR-010 발행 — sp-\* ratio ±20% 게이트 폐기 + 비-fallback HEX 0건 / sp-\* 바인딩 ≥500 / frontend-design S1/S2 0건 3종으로 대체. `scripts/check-hex-hardcoding.mjs`(화이트리스트 4종: var fallback + qrcode color + [Ff]allback 식별자 + \_studentPageChrome.ts) + `scripts/check-sp-coverage.mjs`(Phase B baseline 582 → 임계 500) 신규. 실측: HEX 0건 PASS / sp-\* 1175건 PASS(임계 2.35배). (3) **C.3 Percy 미도입 ADR 발행**: `.omc/specs/adr-percy-non-adoption.md` 1인 OSS 운영 비용/효과 + Phase D 합격선 미달 시 재오픈 트리거 4종 명시. (4) **Open Questions 갱신**: Q4(ADR-010으로 해소) + Q5(폴백 합격선 A 채택 — 90/99.5/0 + 90일 + 결재) + Q7(권장 5건 전부 채택). 검증: tsc 0 errors / lint 본 작업 범위 0 errors(MemoFocus 1건은 다른 세션 부채) / check-flag-usage 3/3 / check-hex-hardcoding 0건 / check-sp-coverage 1175 / 보호 파일 10종 GUARD-CLEAN. 다음(다른 세션 또는 본 G004 후속): C.2 정성 게이트 시각 검증(데스크톱 실 화면 + frontend-design 협업) → C.4 v1 데이터 추출(useToolTemplateStore 연동) + opt-in 이벤트 로깅 → C.5 릴리즈 워크플로우 8단계 → C.6 사용자 테스트 5 시나리오 → G004 complete checkpoint.

- 🍱 **점심 위치 1급 도메인 승격 + 표 내 인라인 위·아래 버튼** (ADR-009 / C안 + Phase 2 통합, 2026-05-29) — 사용자 피드백 "3교시 후 점심으로 옮기는 단일 액션이 없음"에 대응. Settings에 `lunchAfterPeriod?: number` 추가, PeriodTab 점심 행에 [↑][↓] 버튼 인라인 배치, lazy 마이그레이션, 3단 폴백(`lunchAfterPeriod` → `lunchStart/End` → 30분 갭). 데스크톱만(모바일은 Phase 3 이연 — 시간표 그리드 화면 자체가 없음). 도메인 함수 5개 + presenter 3단 폴백 + PeriodTab UI 갱신 + 학급/교사 시간표 양쪽 동일 lunchIndex 공유 검증 완료. 검증 게이트 4/4 통과: tsc 0 errors / lint 0 errors / vitest 2021 passed (166 files, 10 skipped) / regression 41/41.

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
