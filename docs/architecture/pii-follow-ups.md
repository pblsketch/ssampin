# 학생 PII Follow-up Tracking

**ADR**: `docs/architecture/student-pii-adr-v1.2.md`
**상태**: v1.11.x 구현 진행 중. 본 문서는 명시적으로 **연기된** 작업의 추적.

---

## #PII-TRACK-1 — `AcademicLevel` → `Quintile { rank: 1..5 }` 마이그레이션

**목표 버전**: v1.12.x
**관련 ADR Section**: Concern D-2 (Architect v1.0)
**현재 v1.11 상태**: `AcademicLevel = 'A' | 'B' | 'C' | 'D' | 'E'` 5-letter string union. 한국 교육 평가 체계 종속.

### 작업 범위 (v1.12 시점)

- [ ] `src/domain/valueObjects/AcademicLevel.ts` → `Quintile.ts`로 리네임/대체.
- [ ] 타입: `export type Quintile = { readonly rank: 1 | 2 | 3 | 4 | 5 };`.
- [ ] 마이그레이션 매핑 — A→1, B→2, C→3, D→4, E→5 (또는 역순; 의미 결정 필요).
- [ ] `migrateStudentPiiV2.ts` — overlay 파일 ABCDE → Quintile 변환 1회.
- [ ] UI 표시: 한국어 라벨은 그대로 유지 ("A"/"B"/.. 또는 "최상"/"상"/.. 등 사용자 결정), 내부 타입만 ordinal.
- [ ] groupingRules / seatRules의 ABCDE 의존 코드를 ordinal 비교로 일괄 교체.

### 동기

- 5-letter는 한 학교 시스템(영문 평가) 종속. ordinal `rank`는 다른 시스템(1-5점, 수/우/미/양/가 등)에 매핑 가능.
- 다학년/다학기 데이터 모델 확장 시 ordinal이 통계 연산에 유리.

### 차단 요소 (수행 전 결정 필요)

- 한국 학교 표준 등급 표기 → ordinal 매핑 합의 (rank=1이 최상위인가, 최하위인가?).
- 기존 사용자 데이터 무중단 마이그레이션 fixture 준비.

---

## #PII-TRACK-2 — Native 5-level `groupingRules` + `toLegacyLevel` shim 제거

**목표 버전**: v1.13.x
**관련 ADR Section**: Decision 7 (LegacyStudentView), Tension 3.3
**현재 v1.11 상태**:
- `groupingRules.ts` 의 `Level = 'high' | 'mid' | 'low'` 3단계 유지.
- `src/adapters/legacy/groupingLevelAdapter.ts::toLegacyLevel` shim이 ABCDE → high/mid/low 매핑 담당 (A·B→high, C→mid, D·E→low).
- 매핑 손실: A와 B의 차이가 grouping에서 사라짐.

### 작업 범위 (v1.13 시점)

- [ ] `groupingRules.ts` 의 `Level` 타입을 native 5-level (`'A'|'B'|'C'|'D'|'E'` 또는 #PII-TRACK-1 완료 시 `Quintile`)로 교체.
- [ ] `assignGroups`, `leastLevelIdx` 등을 5단계 분배 알고리즘으로 확장.
- [ ] `toLegacyLevel` shim 삭제.
- [ ] `src/adapters/legacy/` 디렉토리 완전 제거 (LegacyStudentView도 P5에서 이미 제거된 상태).
- [ ] ESLint 룰 `no-legacy-student-view-in-new-code` 삭제 (의존 파일 부재).
- [ ] `ToolGrouping.tsx` UI: 5단계 분배 균형 옵션 표시.

### 차단 요소

- #PII-TRACK-1과 의존 관계 — Quintile 채택 후 진행 권장.
- 5단계 균형 분배 알고리즘 통계 검증 (3단계 대비 작은 모둠(4-5명)에서 분산 한계).

---

## #PII-TRACK-3 — 프라이버시 진단 화면

**목표 버전**: post-v1.13 (정확 버전 미정)
**관련 ADR Section**: Decision 5 (audit log tiering)

### 작업 범위

- [ ] 설정 페이지 → "프라이버시 진단" 탭 신규.
- [ ] 표시 항목:
  - 최근 30일 `access_denied` 카운트 (capability별)
  - Sticky log 사이즈, FIFO log 사이즈, 다음 eviction 예상 시점
  - 최근 동의 변경 이력 (consent_grant/consent_deny 타임라인)
  - 최근 마이그레이션 이벤트 요약
- [ ] CSV export (감사 시 제출용; PII 미포함).

### 동기

- 교사 본인의 보안 자세 인지 — "내 잠금이 얼마나 자주 시도되었는가" 가시성.
- PIPA 감사 대응 시 자체 보존 증거 활용.

---

## Open Questions (전 v1.11 시점 미결)

1. **동의 카피 검토 owner**: 한국 교육법 전문가 vs 개인정보보호위원회 가이드 자체 검토. P5 출시 전 결정.
2. **감사 로그 파일 위치**: Windows `%APPDATA%/Ssampin/audit/` vs Electron `app.getPath('userData')/logs/`. P2 시작 시 결정.
3. **마이그레이션 `.bak` 수명**: 다음 부팅 성공 후 즉시 정리 vs N번 부팅 후. P3 시작 시 결정.
4. **멀티 윈도우 PII** (Decision 9 + N-4 잔여): 위젯 PII가 워크플로우 요구사항이 되면 main-process PIN 세션 broker 도입. 본 v1.11 범위 밖.
5. **PinCapability 6개월 collapse 검토** (Decision 8 + N-5 잔여): v1.11 출시 + 6개월 시점 트리거.
6. **out-of-scope PII-인접 필드 11종** (name, phone, parentPhone, birthDate 등): 현재 `Student`에 직접 보유. v2 범위 검토 필요.

---

## 본 문서 갱신 정책

- 각 TRACK 완료 시 해당 섹션을 "DONE (v1.XX.x)"으로 마크.
- 새로운 follow-up 발견 시 본 문서 + ADR Follow-ups 섹션 동기 갱신.
- 본 문서가 비어가면 PII 작업 종료 신호 (모든 follow-up 흡수 완료).
