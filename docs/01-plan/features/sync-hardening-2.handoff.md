# 동기화 2차 하드닝 — ralplan 핸드오프 (2026-07-14)

> 이 문서는 v2.2.13 릴리즈 세션이 작성한 계획 수립용 핸드오프다. 목표는 **/ralplan 합의 계획**
> (`docs/01-plan/features/sync-hardening-2.plan.md` 산출)이며, 구현은 계획 승인 후 별도로 진행한다.

## 0. 배경 (10줄 요약)

- 2026-07-13 실사용자 데이터 유실 신고(두 PC Google 동기화 → 수업 기록·커스텀 카테고리 전량 소실).
- 당일 원인 규명 → 수정 → **v2.2.13 출시 완료**: observations 레코드 병합(mergeObservations)+삭제 전파 툼스톤,
  categories 합집합 병합(mergeCategories), 시작 시 날짜별 스냅샷(backups/startup, 14일), AI 브릿지 직접쓰기
  verbatim 보존, StudentRecord updatedAt 병합(9ce4c1cf). 상세: PROGRESS.md 최상단 + 메모리 `project_user_data_loss_sync_lww`.
- 릴리즈 과정의 외부 QA(Codex gpt-5.6-sol) 2회가 **아직 안 고친 구조 결함 2건**을 남겼고, 이것이 이번 트랙이다.
- 둘 다 "지금도 조용히 데이터가 어긋날 수 있는" 경합/병합 문제지만 발생 빈도가 낮아 비긴급으로 분류됐다.

## 1. 이번 계획의 범위 (두 문제)

### A. 파일 쓰기 직렬화 — 동시 저장 경합

**증상**: 모든 데이터 저장이 "파일 읽기 → 변형 → 통째 쓰기"인데 서로를 모른 채 겹치면 나중 쓰기가 먼저 쓰기를 삼킨다.
Codex QA가 실제 재현함(동기화가 읽은 뒤 사용자가 메모 추가 → 동기화가 병합본 저장 → 사용자 메모 유실).

- 경합 당사자: ① SyncFromCloud 병합 쓰기(`src/usecases/sync/SyncFromCloud.ts` — observations/student-records/attendance 병합 후 `storage.write`)
  ② 각 유스케이스 저장(ManageObservations/ManageStudentRecords/ManageAttendance 등) ③ autoSyncOnSave 디바운스 업로드 경로.
- 저장 최종 관문: electron `data:write`(electron/main.ts ~2457) — 원자 교체(tmp→rename)+1세대 백업만 하고, **읽은 시점 이후 파일이 바뀌었는지 재확인(CAS)은 없다**.
- **이미 있는 부분 해법(참고 패턴)**: `f0732fb0`이 `ManageStudentRecords`에 쓰기 직렬화 체인(모든 변이 순차화·실패 격리)+`updateMany`(1회 읽기→전체 교체→1회 쓰기)를 넣었고 경합 회귀 테스트 5종이 있다. 이 패턴의 전 도메인 확대 vs main 프로세스 단 파일별 뮤텍스/버전 CAS — 어느 층에서 막을지가 핵심 설계 결정.
- 참고: AI 브릿지(별도 레포)는 이미 락+CAS를 가진다(`ssampin-ai-bridge/packages/core/src/write.ts withLock`) — 개념 참고용.

### B. StudentRecord 필드 충돌 (타 세션 인계 HIGH)

**증상**: 같은 학생 기록을 두 기기가 서로 다른 항목으로 고치면(예: PC=서류 제출 체크, 낡은 노트북=나이스 반영 체크)
레코드 단위 LWW(updatedAt 최신 우선)가 기록을 통째로 골라 한쪽 체크가 사라진다. 검토 모드 일괄 처리로 발생 표면이 커졌다.

- 대상 필드(체크리스트류): `reportedToNeis` / `documentSubmitted` / 서류 상세(documents — 출결 4종 M6에서 추가, 정확한 필드명은 엔티티 확인) / `followUpDone`(+followUp/followUpDate 동반 여부 판단).
- **금지된 쉬운 길**: 단순 OR-병합(체크는 무조건 살리기) — `9ce4c1cf`가 고친 "체크 해제가 동기화로 되살아나던 버그"를 정확히 되돌린다.
- 정석 방향: 필드(또는 체크리스트 그룹)별 수정 시각 도입 → 항목 단위 LWW. 엔티티 스키마 변경이므로 아래 계약 함정 필수.

## 2. 필수 함정·제약 (재론 금지 수준)

1. **엔티티 새 필드 = `scripts/emit-entity-samples.mjs`의 ENTITY_FIELD_CONTRACT 분류 필수** — 안 하면
   `entitySampleContract.meta.test.ts` 실패. 새 인터페이스 추가 시 같은 테스트의 `sampleObjectsFor` switch도 갱신(타 세션 실측 함정).
   `reportedToNeis`/`documentSubmitted`는 aiBridge **mirrored** 필드 — 브릿지 왕복 계약 영향 검토(동기화 메타 시각은 notMirrored 분류가 선례: StudentRecord.updatedAt).
2. 병합 함수들(mergeStudentRecords/mergeAttendance/mergeObservations/mergeCategories)은 **방금 v2.2.13으로 출시된 코드** —
   기존 테스트(mergeAttendance 20·mergeObservations 18·mergeCategories 6·경합 회귀 5) 전부 보존, 회귀 표면 최소화.
3. 시계 오차(기기 간 Date.now 차이로 삭제/편집 승자 뒤집힘)는 **수용된 기존 트레이드오프** — 이번 범위에 논리시계 도입을 넣을지는
   planner가 비용 대비 판단하되, 기본은 범위 밖.
4. 병합 출력 정렬 부재(같은 데이터·다른 순서 → 체크섬 차이 → 무해한 재업로드 진동)는 저비용 동반 수리 후보(비차단, QA 지적).
5. 세션 규칙: main 단일 워킹트리, 다른 세션 파일 존중, 커밋은 항상 명시 path, 검증 게이트(tsc/lint/vitest/regression) + 스키마 변경 시 브릿지 레포 게이트.
6. 카테고리·customTags 툼스톤(삭제 전파)과 인앱 복구(Drive 리비전)는 **이번 범위 밖** — 아래 후속 큐.

## 3. 참고 자료

- PROGRESS.md 최상단 2개 섹션(릴리즈·데이터 유실 대응) / DECISIONS.md ADR-019(병합·툼스톤 설계 원형)
- Codex QA 아티팩트: `.omc/artifacts/ask/codex-electron-react-*2026-07-13T07-14-43*.md`(블로커 ③ 경합 재현 로그 포함),
  조회 탭 세션 QA `.omc/artifacts/ask/codex-*qa-git-9ce4c1cf-e4f6aed8*.md`(bulk 경합·필드 충돌 원 발견)
- 패턴 원형: `buildAttendanceSaveData`(ManageAttendance.ts) · `buildObservationSaveData`(ManageObservations.ts) ·
  f0732fb0의 ManageStudentRecords 직렬화 체인+updateMany

## 4. 후속 큐 (이번 계획에 포함하지 말 것 — 순서만 인지)

② 인앱 복구 기능 — Drive 리비전(revisions API, drive.file 스코프로 가능 확인) 자동 감지 → "복구할까요?" 흐름. 별도 PDCA.
③ 카테고리·커스텀 태그·담임 기록 삭제 전파(툼스톤) — 항목에 시간 정보 추가 동반. 별도 PDCA.
