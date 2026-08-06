# Critic 평가 r1 — school-year-archive.plan.md (RALPLAN-DR DELIBERATE)

> 판정: **ITERATE** · 2026-08-06 · 수정 요구 1~9번이 승인 차단, 반영 시 APPROVE.
> DELIBERATE 필수 요건(사전 부검 3시나리오·확장 테스트 4레벨)은 Pass — REJECT 사유 없음.
> Ralplan 게이트: 원칙-옵션 일관성 Fail / 대안 공정성 Pass / 리스크·검증 절차 Fail / 테스트 가능한 AC Fail(경계) / 사전 부검 Pass / 확장 테스트 Pass.
> Architect 지적 4계열 전부 동의(코드 재확인 완료 — 봉투 재조립 3지점·`useTeachingClassStore.ts:405` 우회·build\* chokepoint 3개 실존·`matchingRules` null 반환·`grade-analysis` SYNC_REGISTRY 미등재).

## CRITICAL (착수 차단)

### C1. S1.4/S1.6의 "호출처 화이트리스트 테스트"는 필터 누락을 원리적으로 탐지할 수 없다

선례 `src/domain/rules/studentActivityCallSites.test.ts:90-110`은 **부정형 검사** — 해당 문자열이 "있는" 파일만 수집 후 화이트리스트 대조. `archived`를 잘못 쓴 파일은 잡지만 **한 번도 언급하지 않는(=필터를 빠뜨린) 파일은 무조건 통과.** 계획이 "유일한 자동 장치"로 못박은 안전장치가 실재하지 않음.
**고치는 법**: **긍정형(required-list) 메타테스트** 신설 — `MUST_FILTER_FILES` 각 파일에 `filterActiveClasses(` 존재를 단언. 부정형은 보조 병행. S1.4 AC-4·S1.6 AC-1 재작성("MUST_FILTER 목록 파일에서 filterActiveClasses를 지우면 실패한다").

### C2. S1.4 필터 대상 목록이 양방향으로 틀렸다 — 7곳 누락 + 2곳은 필터하면 안 됨

**(a) 필터하면 새 버그 2건**: `ToolRandom.tsx:58`·`ToolGrouping.tsx:103`은 **id 해석 전용**(`.map()` 없음, 선택지는 `<ClassRosterSelector>`가 그림) — 필터하면 저장된 선택("tc:<id>")이 보관 후 빈 명렬로 해석됨.
**(b) 누락 7곳(전부 진짜 선택 표면)**:
| 파일:line | 성격 | 위험도 |
|---|---|---|
| `src/adapters/components/Settings/RosterCopyAction.tsx:23`(렌더 :110) | 담임 명렬표→수업반 복사 대상 선택 | **최고 — 보관된 반에 새 데이터를 쓴다** |
| `src/mobile/components/Today/MobileProgressLogModal.tsx:57`(후보 :69-87) | 새 진도 기록할 반 선택 | **최고 — S1.2b의 모바일 판박이** |
| `src/adapters/components/Tools/Timer/PresentationMode.tsx:55`(렌더 :501) | 타이머 반 드롭다운 | 중 |
| `src/adapters/components/Settings/tabs/tools/SeatPickerToolSettings.tsx:20`(렌더 :134) | 자리뽑기 범위 | 중 |
| `src/mobile/pages/ToolGroupingPage.tsx:103`(렌더 :205) | 모둠 반 칩 | 중 |
| `src/mobile/pages/ToolRubricPage.tsx:299`(렌더 :390) | 루브릭→채점 진입 | 중 |
| `src/mobile/pages/StudentsPage.tsx:77`(렌더 :433) | 학생 탭 반 탭 | 중 |
**(c) 앵커 오류 3건**: `useStudentLists` 스토어 읽기 L24(순회 L53) / `ClassSurveyTab` L150(+L346 두 번째 해석 전용 읽기) / `ProgressTab` L57-58.
**고치는 법**: 표를 "열거(map/렌더) 여부" 기준으로 재작성 · ToolRandom·ToolGrouping은 "필터 금지" 목록으로 · 도구 실제 편집점 3곳=`ClassRosterSelector.tsx:240`(체인점)+`ToolRoulette.tsx:304`+`ToolSeatPicker.tsx:633` · `RosterCopyAction.tsx` **P1-min 승격** · 앵커 정정.

## MAJOR

### M1. AI 브릿지 AC-3 근거가 사실과 정반대 — AI가 보관된 반에 진도를 쓴다

`classExists` 유일 소비처는 `applyLiveSyncWrite.ts:702` — **쓰기 가드**이며, 차단 시 명시적 `bad(...,404)`(조용한 실패 아님). 막지 않는 쪽이 조용한 오기록. S1.2b는 이름 매칭만 고치므로 id 기반 브릿지 경로는 무방비. **고치는 법**: AC-3 교체 — "보관된 반 쓰기는 사용자 언어 오류('보관된 수업반이라 새로 기록할 수 없어요…')로 거부, 조회 무변경". 미결 4를 `notMirrored`로 종결(안전 관점 무의미해짐).

### M2. S1.3 AC-1 ↔ S1.2 reorder 규칙 상호 만족 불가

"orderedIds만 order 갱신"이면 재정렬 후 보관 반의 order가 활성 반과 충돌 → 복원 위치가 임의. **한쪽 확정**: "보관 해제 = 활성 목록 맨 아래(order = max+1)" 권고.

### M3. "읽기 전용"이 저장 버튼 비활성으로만 규정 — 자동저장 경로 미봉쇄

출결은 `createAttendanceSaveSequencer`(attendanceAutosave.ts) 자동저장. S1.3 AC-2가 탭 열람을 요구하므로 반드시 마운트됨. **고치는 법**: S1.3 AC 추가 — (a)입력 전체 비활성 (b)시퀀서 미생성 (c)강제 호출해도 무저장(단위 테스트). 미결 2 기본값 상향.

### M4. 모바일 범위 5배 축소 산정

`src/mobile`은 `useTeachingClassStore` 참조 0 — 별개 `useMobileTeachingClassStore`(소비처 12). 데스크톱 수정 전파 0. 선택 표면 5곳. 일부 화면은 인라인 `classes.find(...)`(`ClassAttendanceStatsView.tsx:54` 등)라 **필터는 뷰 단에서만**(스토어 셀렉터 금지). **고치는 법**: P1-min에 모바일 2곳(`ClassListPage`+`MobileProgressLogModal:57`) 편입, 나머지 3곳 P1.1.

### M5. v2.2.14는 이미 대기 중인 릴리즈 번호

PROGRESS.md 완료 트랙 4건(아이콘·ADR-026·027·028)+미커밋 2건이 v2.2.14 대기분. **고치는 법**: "v2.2.14 선출시(대기분+미커밋) → P0+P1은 v2.3.0, 배너 창 시작일=v2.3.0 출시일" 확정. 미결 11에서 릴리즈 번호 삭제.

### M6. S1.0 "정리"가 과소 기술 — 미출시 데이터 무결성 수정 폐기 위험

미커밋 6파일은 ADR-027 계열 수정(`saveAttendanceRecord` void→boolean 등). **고치는 법**: S1.0 재작성 — ①폐기 금지 ②명시 path 커밋+게이트 ③v2.2.14 선출시 포함 ④이후 S1.2 line 앵커 재확인.

### M7. 배너 창 시작일이 4가지로 서술 — 도메인 함수 명세 불가

**고치는 법**: `isSecondSemesterSeason` = **매년 8/1~9/15 고정**, 4곳 통일. AC-1을 경계 테스트(8/1·8/10·9/15 true, 7/31·9/16 false)로. `isNewSchoolYearSeason`(2/15~3/15)은 P1~P3 소비처가 없음 — 소비 예정 명시 또는 P1 제외.

### M8. §12 미결 11건이 비개발자 오너가 답할 수 없는 형태 + 개학일을 묻지 않음

**고치는 법**: §12 이원화 — **12-A 오너 확인(평이한 한국어 5문항: ①개학일 ②같은 반 다른 과목 함께 보관? ③폰 동시 출시? ④시간표 안내 문구? ⑤보관함 보존·용량 알림?)** / **12-B 구현 결정(답+한 줄 근거, 묻지 않음)** — 미결 3=NO·4=notMirrored는 이미 확정.

### M9. P1 출시 게이트가 무효한 2기기 실측에 걸림 (Architect 동의+보강)

2주 시드는 D-11에 불가능, 프로젝트는 2기기 Drive 왕복 미실행 이력(ADR-027). **고치는 법**: 미결 3 NO 종결, §10.1 "남은 조건" 삭제, §8.4를 "보관 직후 5분 내 B 선업로드 경쟁" 테스트로 교체.

## MINOR 7건

①§8.5 "확인 다이얼로그 대신 Undo" ↔ S1.3 확인 다이얼로그 모순 → "확인(형제 개수 명시)+성공 토스트 Undo" ②P1-min 제외 목록에 애초 P1에 없던 2항목 삭제 ③§8.3에 그룹 격리·S1.2b 통합 테스트 추가 ④regression-grep 룰(a)는 구현 형태 고정 취약 — 진짜 가드는 스토어 단위 테스트 ⑤릴리즈 노트 "구버전엔 활성으로 보임" 체크박스 추가 ⑥S1.2 AC-3 "deleteClass와 동일" 문구 정정(ensureWritable vs loadFailed 동작 다름) ⑦`data:write`는 길이 검증은 있으나 오류 미전파로 정밀화.

## 빠진 것

- **집계·이력 화면 원칙 1줄**: "집계·이력은 필터하지 않는다. '지금 기록할 대상'을 고르는 순간만 필터."
- **P2·P3 묶음 기계화**: 메타테스트("ExecuteYearTransition 존재 시 Archive 뷰어 진입점 필수") + 매니페스트 version 구버전 감지기 = P2 출시 조건 3번.
- **P1-min 축소 게이트 실행 가능화**: 개학일 확정 후 "YYYY-MM-DD 18시 미완 시 축소+PROGRESS.md 기록".
- **S1.1 AC-6 값싼 대체 검증**: `git show v2.2.13:...JsonTeachingClassRepository.ts` 판독(5분) + "알 수 없는 필드 픽스처 왕복 보존" 단위 테스트.
- **§8.4 시드에 groupId 형제 케이스 추가.**
- **P1 롤백 절차**: "구버전은 모르는 필드 무시=보관 반이 활성으로 보임=사실상 자동 복구" 명시 또는 일괄 해제 경로.

## 실행자 관점 메모

`useTeachingClassStore` 단위 테스트 부재 — 하네스 선례는 `src/adapters/stores/__tests__/attendanceBridgeDelete.test.ts`(`vi.hoisted`+`@adapters/di/container` mock). S1.2 대상 파일 절에 명시하면 하루 절약.

## 회의론자 관점 (계획이 §1.1에서 정면 응답할 것)

"P1이 정말 개학 전에 필요한가" — S1.2b 결함은 archived 필드가 생겨야 성립(P1이 스스로 만든 문제를 P1이 고침). P1 가치는 목록 정리 UX. → §1.1에 "미루면 무엇을 잃는가" 한 문단 정면 반박 또는 **P1-min을 처음부터 기본 계획으로**(P1-min은 표면이 작아 이 반론에 잘 견딤).

## 미결 질문(미채점)

- ToolRoulette/ToolSeatPicker의 ClassRosterSelector 미사용은 부채? → P1.1 후속 후보.
- AddClassModal 중복 이름 검증이 보관 반을 계속 봐야 하나? — 고교학점제 재편성에선 같은 이름 신설이 정상 → 필터가 맞을 수도(제품 판단).
- `conflictPolicy:'ask'` 사용자에게 보관 직후 충돌 다이얼로그 가능(기본 'latest') — 문구 확인.
- 아카이브의 동기화 오유입 방어 룰(syncRegistry.meta) — P2 착수 시 판단.
