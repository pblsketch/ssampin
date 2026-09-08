# Progress

마지막 업데이트: 2026-09-08 KST

> **이 파일은 상태판이다 — 300줄 상한.** 세션별 작업 기록은 `docs/progress/YYYY-MM.md`(월별, 최신이 위)에 쓰고,
> 여기에는 항목당 3~5줄 + 링크만 남긴다. 완료·출시된 항목은 그 세션에서 상태판에서 지운다.
> 결정 기록은 `DECISIONS.md`(목록) → `docs/03-decisions/ADR-NNN.md`(본문).

## 🚨 지금 상태

- **생기부 초안이 교사 평가로 열린다 — 서버 프롬프트 판본 2 적용 완료, 저장소는 미커밋(2026-09-08, [ADR-094](docs/03-decisions/ADR-094.md))**:
  글의 순서가 `교사 평가 → 동기·질문 → 과정 → 결과` 로 바뀌었고 첫 문장 어미는 `~하는 학생임.` 으로 고정했다. 1층 프롬프트(서버 시크릿)·2층 표식 지시·화면 범례 **세 곳이 같은 배열 하나**를 따른다.
  서버는 실호출로 확인(`version 2 · 본문 일치`). 되돌리려면 `E:/test/ssampin-prompts/record-prompt-l1.v1.backup-20260908.txt` 를 base64 한 줄로 다시 올린다.
  ★잔여: **실기기 왕복으로 어미 준수 확인**(규칙은 3중이지만 실측 전) · 앱을 켜 둔 채면 캐시 1시간 동안 옛 규정 · 이미 저장된 초안은 안 바뀐다. [기록](docs/progress/2026-09.md).

- **생활기록부 화면 단순화 — 구현·게이트 완료, 미커밋(2026-09-08, [ADR-093](docs/03-decisions/ADR-093.md))**: 집중 보기(학생 목록+넓은 본문)가 기본·전체 훑어보기 유지 · 오른쪽 보조 공간 하나([AI 초안|근거], 닫으면 폭 0; 쌤핀 AI 도크와는 **배타** — 오너 피드백으로 탭 통합은 철회) ·
  초안 생성 대상 [고른 N명](체크) · 실행 상태 스토어(`useRecordAiRunStore`: "남은 학생 모두"가 2명째에서 끊기던 결함·분량 조절 결과 소실 결함 수정) · 카드 겉면=내용·출처·상태, 조작은 골랐을 때 · 학급 목록 자동 접기/복원.
  브라우저 합성 30명 1280/1440/1920 담임·교과 실측(가로 스크롤 0·세로 글자 0) → [설계서 §7](docs/02-design/features/record-workspace-simplification.design.md) · 캡처 `output/playwright/record-ux-20260908/after/`.
  ★잔여: 오너 실기기(Electron)·실제 구독 AI 왕복 확인 · 커밋(`git commit -- <경로>`). 장부 `.omc/ultragoal/plans/record-workspace-simplification-20260908/`. [기록](docs/progress/2026-09.md).

- 🔴 **운영 DB 1시간 먹통(2026-09-08 07:30~09:38 KST) → 관리 API 재시작으로 복구.** 30분마다 도는 통계 롤업 크론(job 5)이 출근 부하와 겹쳐 timeout 폭주(Nano 인스턴스, `app_analytics` 하루 7,585행으로 급증). **job 5 는 지금 꺼져 있다**(`cron.alter_job(5, active := false)`) — 관리자 대시보드 롤업은 9/8 07:00 KST 값에서 멈춤. 재활성화 전에 컴퓨트 승격·주기 완화·증분 갱신 중 하나 결정 필요. [기록](docs/progress/2026-09.md).
- **출시 버전 v2.4.9** (2026-09-04). 릴리즈 기록 → [2026-09](docs/progress/2026-09.md).
- **워킹트리 정리됨**(2026-09-07): v3·board-v2 는 `ed760331` 로, 관찰 입력 S1·S2 는 `74f9473d`·`880a82c4` 로 커밋됐다. 실기기 확인은 여전히 잔여.
- **운영 DB 주의**: 060(상담·설문 익명 접근 차단 마지막 단계)은 다음 릴리즈 확산 후 적용. 그 전까지 `supabase db push` 금지(060이 같이 나간다).

## 🎯 진행 중 · 대기

- **오류 제보 2건(2026-09-08) — 위젯 입력칸 스페이스 삼킴 · 컴시간 "이번 주 변경" 안내** — 구현·게이트 완료, **커밋·푸시 완료 `8d1a1d73`**. 스페이스는 `SortableWidget` 손잡이 `setActivatorNodeRef`(REGRESSION #72). 컴시간은 일일자료(자료147)를 받아 배너·토스트로 알리기만(반영 안 함, [ADR-091](docs/03-decisions/ADR-091.md), #73). ★잔여: 실기기 4단계(기록 참조) · overrides 자동 등록은 별도 설계. [기록](docs/progress/2026-09.md).
- **온라인 교무실 제출 과제 · 인수인계 지식 · 일정 붙여넣기** (2026-09-07) — **구현 10단계 전부 완료, 미커밋.**
  제출 과제(6번째 모듈, 만들기는 멤버 누구나·명단은 만든이/관리자만) · 업무에 반복주기/절차/인수인계 메모 ·
  표 붙여넣기 · 업무에 자료실 서식 · 필독 읽음 명단 좁히기(구현 중 발견한 기존 구멍).
  게이트 4종 전통과(tsc 0 · lint 0 · **704파일 9,495통과** · **회귀 58/58**).
  ★**잔여: 배포 4회(매번 서버 먼저) · 운영 DB CHECK 적용 확인 · 실호출 스크립트 · 실기기 · 공개 가이드.**
  ★**별건: `sp-danger` 가 tailwind 에 없어 교무실 6파일의 빨간 표시가 안 보인다**(1파일만 고침).
  [ADR-087](docs/03-decisions/ADR-087.md) · [기록](docs/progress/2026-09.md) · 계획 `.omc/plans/staffroom-submission-plan.md`

- **생기부 AI 분량 조절** (2026-09-07) — 현황·설계 검토, 제안 단계. 오른쪽 패널에서 목표 입력·줄이기/근거 보충·새 판 비교 후 반영.
  기존 관련 테스트 4파일 99/99 통과. 앱 구현·실제 AI 품질 검증은 미실행.
  [검토](docs/03-analysis/record-draft-length-adjustment.analysis.md) · [기록](docs/progress/2026-09.md).

- **관찰 입력 → 주제별 근거 연결 UIUX** — **S0~S3 완료 + S4 저장 계약까지 push 완료**(ADR-086).
  **잔여: S4 비교창 화면 · S5 실기기 QA·공개 가이드.** 다음 세션은 여기부터.
  S1 저장 안정성(파일 잠금·저장 후 게시·원본당 근거 1개·첨부 파일별 결과·담임 본문 소실 결함 수정) /
  S2 본문 우선 입력 + 주제 연결 선택기(교과·담임) / S3 화면 왕복(요청 1회 소비·초안 flush 후 이동) /
  S4 비교 규칙 + 적용 직전 재검증 + 출결·공백 자동 거울 제외.
  게이트 전통과(vitest 696파일 9296통과, 실패 0). [계획](docs/01-plan/features/observation-evidence-flow.plan.md) ·
  [설계](docs/02-design/features/observation-input-topic-picker.design.md) ·
  [분석](docs/03-analysis/observation-evidence-flow.analysis.md) · [ADR-086](docs/03-decisions/ADR-086.md) ·
  [기록](docs/progress/2026-09.md).
- **생기부 초안 3차 (record-draft-uiux-v3)** — 구현·게이트 완료, 미커밋. 실기기 확인 + 서랍(덮기 vs 나란히) 오너 판단. ADR-085. → 아래 섹션.
- **근거 정리 보드 2차 (record-evidence-board-v2)** — 구현·게이트 완료, **커밋·푸시·배포 완료(2026-09-07)**. 실기기 확인(설계서 §8)만 남음. → 아래 섹션.
- **내 AI로 실행(선생님 본인 구독 CLI)** — 구현 완료(2026-09-05, ADR-082·084). 잔여: 생기부 T6 한 줄 삽입 · 디자인 검토 · 실기기 QA. 계획서 원문 → [2026-09](docs/progress/2026-09.md).
- **쌤핀 AI 패널 이미지 첨부(내 AI 전용)** — 구현·게이트 완료, **미커밋**(2026-09-07, [ADR-090](docs/03-decisions/ADR-090.md)). Claude 는 stdin stream-json, Codex 는 `-i` 임시 파일(끝나면 삭제). Solar 엔 버튼 없음·포트 거절·폴백 금지. ★잔여: 실기기 확인(앱에서 캡처 붙여 답 받기, Codex 는 한도 풀린 뒤) · 문서(PDF·한글) 첨부는 별도 설계. 기록 → [2026-09](docs/progress/2026-09.md).
- **생기부 규정 배급 문 잠그기** — 구현·게이트 완료, **미커밋**(2026-09-07, [ADR-089](docs/03-decisions/ADR-089.md)). 배급 창구가 **인증 없이 열려 있던 것**을 실호출로 확인하고 한도(설치 분당 10·하루 200 / IP 분당 60)·3단 스위치·차단 관측·만료 캐시 24시간·`promptVersion` 저장을 넣었다. 마이그레이션 0건. **배포·실증 완료(2026-09-07): 세 모드를 실제로 켜 보고 확인** — `off` 는 전부 200에 DB 행 0(왕복까지 멈춤), `observe` 는 전부 200에 차단 1행, `enforce` 는 1~10:200 / 11~12:429. **최종 상태 `enforce`**(시크릿 다이제스트 sha256 대조). ★잔여: 실기기 QA(30명 생성 시 행 증가가 90이 아니라 3인지) · 함수 로그에서 `mode=enforce` 눈으로 확인. **(다) 명령줄 노출도 같은 날 완료** — 두 CLI 다 프롬프트를 stdin 으로 넘긴다(claude 항상, codex 는 0.153.4 이상에서만·하한은 안 올림). 러너 실행 시간 상한(10분)도 신설 — 그전엔 상한이 아예 없었다. 실명 유출 가드를 **argv + stdin 합본**으로 고쳐 "빈 곳을 재고 통과"하는 것을 막았다. 기록 → [2026-09](docs/progress/2026-09.md).
- **생기부 흐름 T6 통합** — T0~T5 완료(ADR-083). 잔여: 브릿지 `write.ts` 한 줄 · `get_record_guidelines` 문구 · `RecordDraft.threadId?` 칸 · 동봉 번들 재생성. 분석 원문 → [2026-09](docs/progress/2026-09.md).
- **사용 통계 구멍 메우기** (2026-09-01) — 게이트 통과, 실기기 확인 대기. → [2026-09](docs/progress/2026-09.md).
- **온라인 교무실 P0 계측** (2026-08-31) — 구현 완료. 서버 롤업 061·065는 09-01 운영 적용됨. 앱 쪽 계측의 배포 여부는 확인 필요. → [2026-08](docs/progress/2026-08.md).

## 🧪 실기기 확인 잔여 (오너만 가능)

- ★**다음 릴리즈 전 통합표(2026-09-08)** → [pre-release-device-qa-20260908.md](docs/03-analysis/pre-release-device-qa-20260908.md) — v2.4.9 이후 9묶음(A~I). **같은 날 Claude 세션이 CDP 로 앱을 조종해 대행 실행(§6): 🔴 5/8 통과, 새 결함 10건(R-1~R-10) → 같은 날 오후 전부 수정([ADR-092](docs/03-decisions/ADR-092.md), 미커밋). 재확인 5건은 §6-2-a.** 오너 잔여: 🔴-4(연결 해제) · 🔴-7(브릿지 GUI) · 말로 쓰기 OS 막대 · 휴대폰 · 교무실(구글 로그인) · A③④(보강 있는 주).
- v2.4.9 설치 확인 · 상담예약 링크 마지막 번호가 **32번**인지(31번이면 별건) · 옆핀 발표 중 가리기(끄고 15초 뒤에도 메모 생존)
- 상담예약 번호 밀림 **재신고(9/8, 33명 중 2명 결번)** — 코드는 이상 없음. 구버전 or 명렬표 학번 1~31 재부여. 챗봇 KB 에 구분법·해법 추가(441건). 신고자 버전·링크 번호 모양 확인 대기 → [기록](docs/progress/2026-09.md)
- macOS [그래도 열기] · 옆핀 모니터 케이블 뽑기→꽂기 · 쿨메신저 가져오기 · 교무실 임시저장 말머리·태그·첨부 왕복 · 쌤핀 AI 쓰기 실서버 왕복 · 할 일 알람 하루 상한

## ⛔ 막힘

- 없음. (참고: Vercel 팀 402 DEPLOYMENT_DISABLED 재발 이력 2026-08-18 — 팀 단위 차단이라 전 사이트가 같이 멈춘다.)

## ➡️ 다음

1. 오너 실기기 확인 → v3 커밋(다중 세션이므로 `git commit -m "..." -- <경로>` 로 파일을 지정).
2. 근거 정리 보드 2차 — 오너 실기기 확인(설계서 §8 8줄) → v3 와 함께 커밋 → `supabase functions deploy ssampin-ai-models` ✅ 완료(2026-09-07, 실제 호출로 확인).
3. 다음 릴리즈 — 060 포함 여부 판단. 릴리즈 노트에 "완전히 차단" 문구 금지(아직 사실 아님).

## 📚 기록 보관

- 월별 작업 기록: [2026-09](docs/progress/2026-09.md) · [2026-08](docs/progress/2026-08.md) · [2026-07](docs/progress/2026-07.md) · [2026-06](docs/progress/2026-06.md) · [옛 상태판(2026-05~08 혼재)](docs/progress/legacy-status-board.md)
- 결정 기록: [DECISIONS.md](DECISIONS.md)(목록) → `docs/03-decisions/ADR-NNN.md`(본문)

---

## ✅ 생기부 초안: AI 본문은 줄바꿈 없이 한 덩어리 (2026-09-07)

오너: "AI 로 초안을 작성했을 때 생기부 문장들이 줄바꿈이 되면 안 되고 그냥 쭉 이어져야 한다." NEIS 는 한 덩어리 글이다.

- `aiDraftText`·`stripNarrativeMarks` 가 문단을 `

` 으로 잇던 것을 **공백 하나**로. [뒤에 붙이기]도 같게.

- 문단의 흔적은 `roleMarks` 에만 남고 화면에서는 **인라인 형광펜 색**이 구조를 보여 준다. 미리보기도 한 덩어리로 그린다(저장될 것과 같은 글).
- 신설 `alignRoleMarksInline` — 문단 나누기 대신 **표식 본문을 순서대로 찾아** 구간을 만든다. 줄바꿈이 있든 없든 같게 동작해 **옛 초안도 색이 맞는다**. 문단 기반 `alignRoleMarks` 는 삭제(죽은 코드).
- ★`sameNarrativeBody` 가 **문단 수**로 견주던 탓에 본문이 한 덩어리가 되면 [다시 표시]가 늘 실패했다 → 이어 붙인 글끼리 견주도록 수정.
- `/docs` 가이드: 형광펜 절을 "문단" → "대목"으로 고치고 "줄바꿈 없이 한 덩어리로 들어간다"를 새로 알림.
- 게이트: tsc 0 · vitest **510 파일 7,060건 전부 통과** · regression 55/55 · landing docs:check 46·build 통과. 미커밋.

## ✅ 근거 정리 보드 2차 (record-evidence-board-v2) — 구현 완료, **미커밋** (2026-09-06)

설계서 `docs/02-design/features/record-evidence-board-v2.design.md`(§7 단계별 완료 표시, §8 실기기 시나리오 8줄) · **ADR-085 보강 2**(R1~R4) · 세션 기록 → [2026-09](docs/progress/2026-09.md).
오너 지적 7건을 GJC 세션이 한 턴에 한 단계씩 8단계로 구현(ultragoal 미사용). ★v3 와 같은 워킹트리에 미커밋.

- **바뀐 것**: 관찰·수행평가 등 원본 기록이 미분류에 **거울 카드**로 저절로 보이고 첫 손댄에 저장(`add(threadId)` 한 번) · **끌어다 놓기**(`@dnd-kit`, 6px, 하단 바와 같은 함수) ·
  카드 곉의 **[AI 제외]** + 하단 바 일괄(`setExcludedFromAiMany`) · AI 제안 **1건 주제 허용·`없음 | 이유`·[다시 제안 받기]·[답 원문 보기]** ·
  열 머리 두 줄·두 번 클릭 이름 고치기 · [줄기 보기] · 토스트 + 삭제 5초 되돌리기 · 영역 1개면 칩 숨김 · [가져오기 ▾] → [엑셀 ▾] · em 대시 → 쌍점 · 모델 이름만.
- **새 파일**: `usecases/studentRecords/collectEvidenceCandidates.ts`(순수) · `adapters/hooks/useEvidenceCandidates.ts` · `RecordDraft/EvidenceCard.tsx`·`EvidenceColumn.tsx`·`evidenceBoardStyles.ts` · 메타 테스트 `recordDraftNoEmDash.meta.test.ts`.
- **게이트(2026-09-06 19:00)**: tsc 0 · lint 0 에러 · vitest(RecordDraft+domain+stores+usecases) 신규 실패 0(기존 메타 테스트 2파일 5초 타임아웃만, 단독 통과) · regression-check · `landing docs:check`+`build`. 상세 수치는 월별 기록.
- ✅ **배포 완료(2026-09-07)**: `supabase functions deploy ssampin-ai-models`. 실제 호출로 확인 — 라벨이 모델명만, `version` 1→2, 설명 잔재 0. `OWN_AI_MODEL_CATALOG` 덮어쓰기는 설정돼 있지 않다.
  ★클라이언트 캐시는 모듈 변수라 앱을 껐다 켜면 즉시, 켜 둔 채면 최대 6시간 뒤 반영된다.
- ★확인 필요(그대로): 사진 제출 카드의 출처 칩이 빈 알약으로 뜰던 것 — 실기기 `record-evidence.json` 의 `sourceType` 값 확인(설계서 §5-g).

## ✅ 생기부 초안 3차 (record-draft-uiux-v3) — 구현 완료, **미커밋** (2026-09-06)

설계서 `docs/02-design/features/record-draft-uiux-v3.design.md` · **ADR-085** · 브리프 `_workspace/ultragoal-brief.md`(5 목표).
이전 파세오 에이전트(WSL)가 목표 1~3 을, 윈도우 GJC 세션이 목표 4~5 를 한 턴에 한 단계씩 나눠 구현했다.
★**전부 워킹트리에만 있고 커밋되지 않았다**(`git status`: 수정 ~24 / 삭제 5 / 신규 ~25). 커밋은 오너가 실기기 확인 뒤 직접.

- **목표 1** ADR-085 append · RecordDraft/\*\* 글자 하한 `text-xs`(메타 테스트가 `text-[0.x rem]` 전부 금지) · 초안 행에서 "이 주제로…" select·요청문 복사 제거, [미분류 N건] 버튼화.
- **목표 2** `selectedStudentRef` 상승 · 오른쪽 패널 `RecordDraftSidePanel`(AI 초안 | 근거) · 실행 로직은 `RecordDraftAiPanel` 로, 행에는 [AI ▸]만 ·
  `RecordAiDraft`(`record-ai-drafts.json`, 상한 20, 오래된 미반영 우선 삭제) + 저장소·스토어·container·archiveScope·연도 전환·동기화 등록 · 판 탭·[내 글과 비교]·반영/뒤에 붙이기/버리기·30초 되돌리기.
- **목표 3** `narrativeParagraphs.ts` 파서(관대한 괄호) · 팡 표식 지시 · `RecordDraft.roleMarks?` · 4색 미리보기 · 편집 칸 거울 레이어 · [다시 표시] · 스위치(`recordHighlightOn`) · 범례.
- **목표 4** (이번 세션) domain `threadSuggestPack.ts` 보강(초안 꾸러미와 같은 제외 순서·사유) + `rules/threadSuggestionParser.ts`(전각/반각·범위·중복·실패 이유 4종) →
  store `useRecordEvidenceStore.moveToThread / moveToNewThread(생성+이동 한 동작, 실패 시 주제 되돌림) / unclassify`(학생 경계에서 거르고 `skippedIds` 보고) →
  UI `RecordEvidenceBoard.tsx`(열 = 미분류·주제·+ 새 주제, 카드 클릭 선택, 하단 바, 영역 필터, 학생 ▾/←/→, 「…」 AI 전송 토글, "이것도 이 주제?" 칩, AI 분류 제안 고스트 — 적용 전 저장 0회) ·
  `EvidenceDrawer.tsx`(body 포털 + `data-sp-floating`, Esc·바깥 클릭, 포커스 복귀) · `RecordEvidenceImportDrawer.tsx`(가져오기 ▾ — 예전 `candidatesFor`·엑셀 양식/업로드 복원) ·
  **삭제** `RecordEvidenceView.tsx`·`InquiryThreadChips.tsx`(dnd-kit 드래그)·`RecordDraftAiButton.tsx`·관련 테스트 2개.
  디자인 검토에서 RecordDraft/\*_ 의 `sp-_/NN`투명도(규칙 미생성 버그) 21곳 →`blue-500/NN`, `rounded-md`→`rounded-lg`, `text-white`→`text-sp-accent-fg`.
- **목표 5** `/docs` 가이드(`landing/src/content/docs.ts`) 담임 업무 > "생활기록부 초안과 근거 정리 보드", 내 AI로 실행 > "생기부 초안 쓰기 — 오른쪽 패널" · "형광펜" · "AI 분류 제안"(신설) → `docs:check` 문서 46개 통과, `build` 65페이지.
  스크린샷은 안 넣었다(오너 실기기 촬영).
- **게이트(2026-09-06 13:30)**: `tsc` 0 에러 · `lint` 0 에러/137 경고(이번 작업 몷 1: `RecordEvidenceImportDrawer` 의 엑셀 인프라 import — 예전 화면과 동일, 컴포넌트 23곳 선례) ·
  `vitest RecordDraft+domain+stores` **3,955 통과 / 3 실패** — 실패 3건은 파일시스템을 전수 훑는 메타 테스트(`studentActivityCallSites`·`teachingClassArchiveCallSites`)의 **5초 타임아웃**으로,
  단독 실행하면 7/7 통과(4.1초). 이번 변경과 무관한 부하 문제라 그대로 둠 · `regression-check` 55/55.
- **오너 판단 남음**: 서랍(주제 줄기·가져오기)을 지금처럼 오른쪽에 덮는 방식(폭 440px, 좌은 창에서 92vw)으로 둘지, 보드 옆에 붙여 나란히 보는(split) 방식으로 바꿀지.
- **실기기 확인 시나리오**(수업반 하나, 학생 2명 이상, 설정 > 실험실 > 내 AI로 실행 켜고 구독 AI 연결):
  1. 생기부 초안 > 학생 행 [AI ▸] → 오른쪽 패널이 그 학생으로 열리고 [이 학생만] 후 미리보기 문단이 4색(형광펜 스위치 켜야)으로 보여야 정상. [반영] 뒤 편집 칸 뒤에 같은 색, 글에는 `[동기]` 같은 표식이 없어야 함.
  2. 편집 칸에서 한 문단을 고치면 그 문단만 색이 흰어지고, 패널 [다시 표시] 뒤 다시 진해져야 정상(본문은 그대로).
  3. 패널에서 한 번 더 [이 학생만] → 판 탭이 2개, [내 글과 비교] 좌우 문단, [바꾸기] 뒤 30초 안 [되돌리기]로 이전 글 복구.
  4. 행의 [미분류 N건] → 근거 정리 보드가 **그 학생·그 영역 필터**로 열려야 정상. 카드 2개 클릭 → 하단 바 "선택 2건" → [+ 새 주제로] → 이름 입력 → 새 열이 생기고 카드가 그 열로.
  5. 열 머리 [줄기 보기](2차에서 [열기]에서 이름 바뀜) → 오른쪽 서랍(유리 모드에서도 불투명), Esc 로 닫히고 포커스가 단추로 돌아와야 정상. 학생 → 로 바꾸면 선택·서랍이 전부 비어야 함.
  6. (2차에서 바뀜) 출처별 가져오기 메뉴는 없고 관찰 기록이 미분류에 거울 카드로 저절로 보여야 정상(보드 2차 설계서 §8-1). [엑셀 ▾] > [엑셀 양식 받기]로 파일이 저장되면 정상.
  7. [AI 분류 제안] → "읽고 있습니다…" → 점선 카드가 열 아래에 뜨고, 이때 앱을 재시작하면 아무것도 바뀜 게 없어야 정상(적용 전 저장 없음). [이 열 적용] 뒤에만 실제 카드로 바뀜.
  8. 설정 > 화면 > 글꼴 크기를 "크게"로 바꾸면 초안·미리보기·보드 글자가 함께 커져야 정상(본문보다 작은 AI 글이 없어야 함).
