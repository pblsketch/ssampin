# 출결 그리드 v2 — 새 세션 /ralph 핸드오프

> 이 문서는 새 Claude Code 세션에서 출결 그리드 v2를 구현하기 위한 자립형 핸드오프다.
> 아래 "실행 프롬프트"를 새 세션에 그대로 붙여넣으면 된다.

---

## 실행 프롬프트 (새 세션에 복사)

```
/ralph docs/01-plan/features/attendance-grid-v2.plan.md 계획(ralplan 합의 승인본)을 P7.1부터 P7.6까지 순차 구현해줘.

필수 규칙:
1. 계획서 §3.10 "실행 안전·계약 명세"가 실행 명세다 — 특히 §3.10-1(자동 저장은 dirty-gate 주 + 자기 저장 서명 보조), §3.10-4(좌석 렌더 신규 제작·grid 우선), §3.10-6(메타 가드 2회 승계), §3.10-8(공유 뷰 opt-in 격리)을 그대로 따를 것.
2. goals.py로 진행 추적: 저장소 루트에서 python3 C:/Users/wnsdl/.claude/plugins/cache/fablize/fablize/2.0.0/scripts/goals.py status 로 기존 plan(P7.1~P7.6, 7 스토리) 확인 후 next→checkpoint로 진행. PYTHONIOENCODING=utf-8 필요.
3. 각 단계 완료 = 게이트 4종(npx tsc --noEmit 0에러 / npm run lint 0에러 / npm run test / npm run regression-check 38) + 계획서의 단계별 완료 기준 + 커밋(명시 path로 git add). P7.1·P7.2의 UI 변경은 커밋 전 실렌더 확인까지.
4. P7.1~P7.3은 릴리즈 원자성 묶음 — 중간 상태를 릴리즈하지 않는다(커밋은 단계별로 OK).
5. 완료 후 PROGRESS.md 갱신 + DECISIONS.md에 ADR 추가(계획서 §7 ADR 초안 참조) + 핸드오프 문서의 남은 항목 체크.

핸드오프 상세(함정·파일 맵·검증 방법)는 docs/01-plan/features/attendance-grid-v2.ralph-handoff.md 를 먼저 읽을 것.
```

---

## 1. 배경 요약 (2026-07-10~11 세션에서 일어난 일)

1. 사용자 건의 6건 → ralplan 합의 → v1 구현 완료(9커밋, `529faffb`~`4df843e9`, ADR-021). **미푸시 상태**로 main에 있음.
2. 실기기 확인에서 문제 8건 발견(열 폭 붕괴·복잡한 5-상태 순환·사유 입력 부재·페이지 짤림 등).
3. 나이스 출결 매뉴얼(`docs/나이스 출결 관리 업무 매뉴얼.pdf` p28~35) 분석 + 사용자와 4라운드 설계 → **v2 계획**(팔레트 모델) 확정.
4. ralplan 합의(Planner 코드검증 → Architect 리뷰 → Critic 게이트) 완료 — 계획서가 승인본.

## 2. 반드시 읽을 문서 (순서대로)

1. `docs/01-plan/features/attendance-grid-v2.plan.md` — **승인된 실행 명세** (§3 설계, §3.10 안전 계약, §4 단계·완료 기준)
2. 본 핸드오프 문서 §4 함정 목록
3. `docs/03-analysis/attendance-regulation-2026.analysis.md` — 기재요령 별표 8 규정 근거(집계·지각 처리의 왜)
4. `DECISIONS.md` ADR-021 — v1 구조 결정(단일 기록자·headless 코어·규정 정합)

## 3. 핵심 파일 맵 (v1 현재 상태 — 이 위에 v2를 얹음)

| 파일                                                                                         | 역할                                                                                      | v2에서                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/adapters/components/Homeroom/Records/HomeroomAttendanceGrid.tsx`                        | 담임 그리드 셸(v1: 순환+팝오버+선택모드)                                                  | P7.2 대개편(팔레트·자동저장·undo). 스토어 직접 import 금지(메타 가드 5)                        |
| `src/adapters/components/attendance/shared/AttendanceGridView.tsx`                           | headless 표(수업관리와 공유)                                                              | P7.1 table-fixed/colgroup/sticky, 이후 opt-in prop만(§3.10-8)                                  |
| `src/adapters/components/attendance/shared/attendanceGridShared.ts`                          | 상수·타입·buildInitialMatrix                                                              | 소폭 확장                                                                                      |
| `src/adapters/components/Homeroom/Records/InputMode.tsx`                                     | 누가기록(그리드 호스트 배선 포함)                                                         | P7.1 그리드 배선 이동, P7.3 출결 완전 제거. **다중 세션 핫파일 — 착수 전 git status**          |
| `src/adapters/components/Homeroom/Records/RecordsTab.tsx`                                    | 기록 탭 서브탭(로컬 ViewMode 타입 :14)                                                    | P7.1 [출결\|누가기록\|통계\|조회]                                                              |
| `src/adapters/stores/useStudentRecordsStore.ts`                                              | viewMode(:98 타입, :197 초기값)                                                           | P7.1 'attendance' 추가·기본화                                                                  |
| `src/domain/rules/attendanceRules.ts`                                                        | computeAutoPeriods(:268)·summarizeNeisAttendance(:363)·pickRepresentativeAttendance(:173) | 재사용(무변경). 파서 `parseAttendanceQuickText` 신설(P7.2)                                     |
| `src/adapters/components/Homeroom/Records/__tests__/attendanceSingleWriter.metatest.test.ts` | 단일 기록자 가드 6단언                                                                    | P7.1 리타깃, P7.3 부재검증 교체(§3.10-6 — **가드 완화 금지**)                                  |
| `src/adapters/stores/useSeatingStore.ts`                                                     | 좌석 데이터(학생 id 기반)                                                                 | P7.4 데이터만 재사용. **렌더 컴포넌트(SeatCard 등)는 편집 강결합이라 재사용 금지 — 신규 제작** |
| `src/adapters/components/StudentRecords/DateNavigator.tsx`                                   | 날짜 이동(◀▶·오늘·달력)                                                                   | P7.1 과거 배지 확장(prop 기본값 보존)                                                          |
| `src/adapters/components/common/CommandPalette/commandRegistry.ts`                           | "여러 날 출결" 라우팅(:151-153)                                                           | P7.3 requestHomeroomTab 패턴으로 완결                                                          |
| `src/adapters/stores/useTeachingClassStore.ts`                                               | saveDayAttendance(:712 하루치 통째 교체·빈 교시 삭제)                                     | 무변경(호출만)                                                                                 |

## 4. 함정 목록 (이번 세션에서 실제로 겪은 것)

- **저장 직후 재시드**: `loadGridDayRecords`가 `attendanceRecordsAll` 스냅샷 의존(`InputMode.tsx:121-127`) → 저장마다 그리드 재시드. 자동 저장을 얹기 전에 §3.10-1 dirty-gate 필수. **이거 빼먹으면 입력 유실 회귀.**
- **canonical 비대칭**: `saveDayAttendance`는 빈 교시를 삭제하고 하루치를 통째 교체 — 보낸 byPeriod와 읽은 records 형태가 다름. 서명 비교 시 양쪽 동일 투영 필수.
- **PowerShell -replace 함정**: 교체 문자열의 `\"`는 백슬래시가 문자 그대로 삽입됨(JSX 파손 사고 1회 있었음). 파일 수정은 Edit 도구로.
- **git commit 메시지에 큰따옴표 금지**: PS 5.1 인자 전달이 깨져 pathspec 오류 남(here-string이어도). 따옴표 없는 문구로.
- **커밋은 항상 명시 path**: lint-staged가 prettier로 재포맷하므로 커밋 후 파일이 바뀐 것처럼 보임(정상). 다중 세션 저장소라 `git add .` 금지.
- **flaky 테스트(병렬에서만 실패, 단독 통과)**: `studentActivityCallSites` / `light-theme-chip-legibility.metatest` / `Notice.metatest` / `FillFormFields` / `RenderTemplate` — 전체 test 실패 시 이 목록이면 단독 실행으로 통과 확인 후 진행(기존 부채, 고치려 들지 말 것).
- **실렌더 환경**: 브라우저 모드(`npm run dev`)는 명단 미영속 — Playwright로 명단 몇 명 등록 후 스크린샷. Vite dev 서버 2개 동시 실행 금지(deadlock). electron main/preload 변경 시 `node scripts/build-electron.mjs`+재시작.
- **sp-\* 토큰 투명도 수식 무효**(`bg-sp-accent/40` 등 — 클래스 미생성), **raw text-white 금지**(라이트 모드 강제 치환됨), rounded는 Tailwind 기본 키만.
- **좌석 뷰**: 기존 `Seating.tsx`의 SeatCard는 미export+드래그 강결합+초록 점 하드코딩, `FreestyleSeatingView`는 스토어 편집 액션 직접 호출 — **재사용하면 좌석 편집 부작용 유출**. 신규 읽기 전용 카드로.
- **메타 가드**: 고쳐서 통과시키는 것 금지 — §3.10-6의 승계·강화 명세대로만 수정(주석에 근거 명시).

## 5. 완료 후 남은 항목 (구현 세션이 체크)

> P7.1~P7.6 구현 완료 (2026-07-11, main `8d5d1b70`~`49679d3a` 6커밋 + 문서 커밋, ADR-022). 게이트 tsc0/lint0/vitest3604/regr38, 실렌더 Playwright 검증 완료.

- [x] PROGRESS.md 갱신 + DECISIONS.md ADR-022 추가 (2026-07-11)
- [ ] v1 커밋 9개+v2 커밋 6개 **전체 미푸시** — 사용자에게 푸시 여부 확인 (릴리즈 작업)
- [ ] 릴리즈 노트 고지 **3건**: ① 단일 날짜 카드 출결/여러 날 카드 출결 → 출결 탭 이동 ② 기록 탭 첫 진입 화면이 '출결'로 변경 ③ 레거시 이질 상태 행 첫 편집 시 평탄화 (릴리즈 작업)
- [ ] /docs 사용자 가이드(landing/src/content/docs.ts) 출결 섹션 갱신 — 릴리즈 작업 단위에서
- [ ] 실기기(사용자) 확인 요청: 팔레트 입력·텍스트 입력·좌석 뷰·다크/라이트
- [ ] 모바일 행 모델 이관·모둠/자유 좌석 렌더 — 후속 과제 (PROGRESS에 기록됨)

## 6. Critic 실행 유의사항 7건 (구현 세션 필수 인계 — 2026-07-11 APPROVE 시 제시)

1. **[실행 전 확인] 좌석 범위**: 사용자 반의 좌석 배치가 grid인지 확인 — 모둠/자유 위주면 P7.4 v1 좌석 뷰는 해당 반에 "준비 중"만 표시됨(배포 가치 사전 점검).
2. **[P7.2b] dirty 타이밍**: undo가 matrix 적용 직후·저장 트리거 **이전에** dirty=true를 동기 설정할 것(§3.10-2 test ④가 검증).
3. **[P7.1/P7.3] 메타테스트 문자열 보존**: 코드 이동+자동 저장 래핑 시 `saveDayAttendance`·`bridgeHomeroomDayAttendance` 호출 문자열/형태 보존 또는 리타깃과 동시에 정규식 갱신(테스트 4·6은 정확 문자열 의존).
4. **[P7.6 추가] dirty-gate 실렌더 케이스**: "편집 중 타 경로 변경이 조용히 사라지지 않는지" 1케이스 추가.
5. **[일정] P7.4 규모**: grid-only도 신규 카드+매핑 계층+기준교시 선택기로 M 상단~L 하단 — 낙관 금지.
6. **[릴리즈] 고지 3종**: (a) 카드 여러 날 출결 → 출결 탭 이동 (b) 기록 탭 첫 화면이 출결로 변경 (c) 레거시 이질 상태 행의 첫 편집 시 평탄화.
7. **[/docs] 사용자 가이드**: 출결 입력 방식 근본 변경(팔레트·텍스트·좌석) — `landing/src/content/docs.ts` 갱신을 같은 작업 단위에 포함.

## 7. 합의 이력

- Planner 검증: 코드 대조 — 재시드 위험·좌석 id↔번호 불일치·메타 가드 범위·파서 계약 등 8건 보강(§3.10에 반영)
- Architect: APPROVE-WITH-CHANGES — dirty-gate 주/서명 보조 재구성, 좌석 렌더 신규 제작(grid 우선), 공유 뷰 무회귀 실렌더 검증, fake timer 런타임 테스트 (전부 반영)
- **Critic: APPROVE (2026-07-11)** — 6기준 전부 PASS, 필수 4·권장 2 실질 반영 독립 검증, 잔여는 위 유의사항 7건뿐. "/ralph 실행 진입 가능" 명시.
