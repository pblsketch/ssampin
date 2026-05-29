# ADR — 쌤핀 학생 PII 저장 + 자리 배치 학업성취도 균형 (v1.2)

**상태**: APPROVED (v1.2, Critic APPROVE with 2 ADR addendum, 2026-05-29)
**범위**: v1.10.x → v1.11.x 기능 추가
**작성자**: /ralplan consensus DELIBERATE 모드 (Planner v1.2)
**검토자**: Architect APPROVE_FOR_CRITIC, Critic APPROVE

---

## 컨텍스트

쌤핀(SsamPin)은 한국 중·고등학교 교사용 데스크톱 대시보드(Electron + React 18 + TS strict + Zustand + IndexedDB / electron file storage, Clean Architecture 4 레이어). 사용자(교사)는 모둠 편성(`ToolGrouping`)과 자리 배치(`Seating`) 도구에서 학생 성별·학업성취도를 매번 임시 입력해야 했다. 사용자 피드백:

> "학생 정보 저장. 조 편성과 자리 배치시에 성별, 학업성취도를 매번 입력하지 않아도 되도록 정보 저장 기능이 필요함. 자리 배치 시 고급 설정에서 학업 성취도도 고려 필요"

**확정 결정**: 학업 성취도 = 5단계 A/B/C/D/E, 성별 미지정 허용 (M/F/undefined), 프라이버시 보호 적용.

---

## Principles (비협상 원칙)

1. **PII isolation by construction** — gender/academicLevel은 `Student`의 속성이 아니다. `StudentPiiOverlay`에 별도 보관하며 capability gate 뒤에서만 join한다.
2. **Reuse capability surface** — PII 접근은 기존 `classManagement` PIN을 재사용한다. 신규 글로벌 unlock 키 도입 금지.
3. **Gates before storage** — PII 흐름이 가능한 모든 경로에 게이트가 먼저 존재해야 한다.
4. **Type-level over runtime guards (where possible)** — Brand 타입과 ESLint가 흐름을 강제한다. 런타임 PIN 검사는 capability 경계에서만.
5. **Local-only by default** — PII는 잠금 해제 상태에서 명시적 동의로 export될 때를 제외하고 디바이스를 떠나지 않는다.

## Decision Drivers (Top 3)

1. **한국 PIPA 준수 방어가능성** — 동의 카피, 보존 정책, 감사 로그 tiering이 감사 시 유지되어야 함.
2. **리팩토링 표면 최소화** — 13개 PII-인접 필드 중 신규 2개(gender, academicLevel)만 분리. LegacyStudentView 전환 어댑터로 P5까지 churn 제한.
3. **멀티 윈도우 안전성 (IPC 재설계 없이)** — 위젯 창은 PII를 절대 보지 않음. 메인 윈도우가 single source of truth.

---

## Decisions (10)

### Decision 1 — Aggregate 분리
`Student` (도메인 코어, PII-free) + `StudentPiiOverlay` (gender, academicLevel; studentId로 조인) 별도 저장소.

### Decision 2 — Capability 모델
기존 `classManagement` PIN 재사용. `PinCapability` 태그 `{ ViewStudentPii, EditStudentPii, ImportStudentPii, ExportStudentPii }`를 단일 unlock 안에서 도입.

### Decision 3 — 단일 알고리즘 + 2-stage solver (precedence 명시)
`shuffleSeatsWithConstraints`를 단일 함수로 유지하되 내부에서 2-stage 처리:
- **Stage 1 (Hard, 부울 must-pass)**: `forbiddenPairs`, `fixedSeats`, `zones`. 후보 중 하나라도 실패 시 폐기.
- **Stage 2 (Soft, 연속 스코어, lexicographic)**:
  1. `separations` — 쌍 거리 최대화
  2. `adjacencies` — 쌍 거리 최소화
  3. `balance.academicLevel` — 행/클러스터 분산 최소화
  4. `balance.gender` — 행/클러스터 분산 최소화
- **타이브레이크**: 결정적 seed-based RNG (seed = sessionId hash).

### Decision 4 — Migration 안전성 (Option α)
`tmp → fsync → rename` atomic write + `.bak` sibling. 부팅 시 `.bak` 존재 AND 타겟 파일 파싱 실패 → **Option α: 시작 차단 + 복원 CTA 모달**. 카피: "백업 파일에서 복원" / "초기화 후 새로 시작" / "지원팀에 문의". 별도 degraded read-only 모드 도입 안 함.

### Decision 5 — Audit log 2-tier (UPDATED N-2)
Append-only 2-tier 로그:
- **Sticky tier** (`pii-audit-sticky.log`): 이벤트 `migrate`, `consent_grant`, `consent_deny`, `access_denied`. event-type-class별 1000건 무한 보존.
- **FIFO tier** (`pii-audit-rolling.log`): 이벤트 `view`, `update`. 5MB rolling.
- studentId는 SHA-256으로 해시(`pinHash.ts`) — §Hash Functions 참조.

### Decision 6 — Brand 타입 + 팩토리 (UPDATED N-3)
- `type NoPii = Brand<'NoPii'>`.
- `export function createNoPiiDto(s: Student): Student & NoPii` — 명시 destructure + PII overlay 참조 제거 + 브랜드 부착. **`Student & NoPii`를 mint하는 유일한 합법 경로**.
- ESLint 룰 `no-pii-brand-assertion` — `as Brand<'NoPii'>`, `as Student & NoPii` 캐스트 차단.

### Decision 7 — LegacyStudentView 전환 어댑터 (UPDATED Critic #8)
- 파일: `src/adapters/legacy/legacyStudentView.ts`.
- `export type LegacyStudentView = Student & StudentPiiOverlay;`.
- 헤더: `@deprecated 전환 어댑터 — P5 완료 시 삭제. Tracking: #PII-TRACK-1`.
- ESLint 룰 `no-legacy-student-view-in-new-code` — P1 시점에 frozen allow-list로 호출처 enumerate. 신규 import 차단.
- 삭제 게이트: **P5 acceptance** (phase boundary, not calendar).

### Decision 8 — ESLint 룰 (UPDATED N-7)
- `eslint-rules/no-pii-in-logs.ts` — type-aware via `@typescript-eslint/utils` ParserServices. `console.*` / `logger.*` 인자가 `StudentPiiOverlay` 또는 allowlist PII 필드 보유 타입일 때 ban. type-only import는 면제.
- `eslint-rules/no-pii-brand-assertion.ts` — Brand 캐스트 ban.
- `eslint-rules/no-legacy-student-view-in-new-code.ts` — allow-list 강제.

### Decision 9 — 멀티 윈도우 PII 경계 (UPDATED N-4)
- **단일 윈도우 (메인) 전용 PII 접근**. PII reveal/edit 컴포넌트는 메인 윈도우 라우트 트리에만 존재.
- 위젯 감지: `window.location.hash === '#/widget'` (P1 시 정확 패턴 검증).
- `Student → StudentPiiOverlay` merge 함수는 위젯 감지 시 unlock 상태 불문 PII-free `Student` 반환.
- 미래 cross-window PII = main-process PIN 세션 broker (Open Question, 본 ADR 미포함).

### Decision 10 — Session-only repository
`SessionOnlyStudentPiiRepository` — in-memory, 영속 X. PII 편집은 unlock 세션에서 메인 윈도우 repository 통해 디스크 기록. 위젯 repository 인스턴스는 항상 session-only + Student 베이스 readonly.

---

## §Legal Basis (PIPA)

- **(a) Classification**: 본 앱은 **일반 개인정보** 처리 (NOT 민감정보 §23). 전화번호, 보호자 연락처, 생년월일은 고유식별정보-인접이지만 본 앱 범위에서 일반 개인정보로 분류.
- **(b) Applicable clauses**: §15 (수집·이용 동의)가 앱 내 capture·use를 규율. §17 (제3자 제공 동의)는 현재 범위에서 미발동 — `Brand<NoPii>` 강제로 모든 향후 클라우드 sync DTO에서 PII 차단.
- **(c) Retention defense**: 90일 rolling FIFO (`view`/`update` 이벤트)는 **앱 내부 접근 로그**이지 PIPA §30 접근기록(≥5만 정보주체 개인정보처리시스템 대상 — 본 앱 ~30명/교사 임계 미달)이 아님. Sticky log는 `consent_grant`/`consent_deny`/`migrate`/`access_denied`를 무기한(1000건 bound 내) 보존하여 동의 흐름·마이그레이션 provenance 증거화. 방어: 본 앱은 개별 교사 개인 도구이며 학교/교육청의 개인정보처리자 아님.
- **(d) Consent copy items** (PIPA §15(2) 의무): ① 수집·이용 목적 (좌석 배치 균형 알고리즘 입력값), ② 항목 (성별·학력 수준), ③ 보유·이용 기간 (앱 사용 종료 또는 사용자 삭제 시까지; 단 잠금 해제 이력은 1000건까지 보존), ④ 동의 거부권 + 불이익 (거부 가능, 거부 시 학력·성별 균형 토글 비활성화, 기타 기능 무영향).
- **(e) Consent copy review owner**: **Open Question** — 한국 교육법 전문가 검토 or 개인정보보호위원회 가이드 자체 검토 (사용자 지정 필요).

### Addendum 2 (Critic v1.2) — Claim C 보조 논거
Claim C(앱은 §2(5) 개인정보처리자 아님 — §58(1)4 가사목적 예외)는 **보조 논거**에 불과하다. 컴플라이언스 방어는 Claim A(민감정보 §23 아님) + Claim B(§15 적용, §17은 Brand 강제로 미발동)에 의존한다. Claim C가 직무목적 해석(KISA/PIPC)으로 다투어져도 A+B로 충분 compliant하다. ADR은 Claim C를 load-bearing으로 취급하지 않는다.

---

## §Hash Functions

두 해시 구현, 두 서로 다른 역할, **둘 다 유지**:

- `src/domain/rules/pinRules.ts` — 32-bit 비암호 해시. **역할**: 로컬 전용 PIN 검증. PIN은 디바이스를 떠나지 않으며 replay 공격 표면 없음. 비암호 해시로 충분. `usePinStore` 백엔드 유지.
- `src/infrastructure/crypto/pinHash.ts` — SHA-256. **역할**: 감사 로그 `studentId` 해싱 (Decision 5), 향후 provenance 해싱. P2에서 `PiiAuditLogger`에 wire.
- **둘 다 SHA-256으로 통일 안 함**: 로컬 PIN 유스케이스에서는 비암호로 충분하며, 통일 시 기존 PIN 해시 마이그레이션 비용만 발생. 의도 명확화를 위해 분리 유지.

---

## §Addendum 1 (Critic v1.2) — Decision 9 명확화 (Principle 4 위반 해소)

> 프라이버시 경계는 **(a) `Brand<NoPii>` 타입 시스템**, **(b) main-process 코드 경로로 제한된 `createNoPiiDto` 팩토리**, **(c) preload 스크립트의 IPC 채널 allowlist**로 강제된다. `window.location.hash === '#/widget'` 검사는 **개발자 경험(DX) 신호**이지 경계가 아니다. 해시를 위변조해도 위젯 IPC 채널로 흐르는 데이터는 타입·채널 계층에서 구조적으로 PII가 제거되어 있으므로 PII로 escalate 불가능하다. Principle 4 (type-level over runtime guards)는 타입+채널 경계로 honor되며, 해시 검사는 defense-in-depth.

---

## Alternatives Considered

### Option B (steel-manned, rejected) — Encrypt-in-place without entity split
- **Pros**: ~60% 적은 P1 표면; LegacyStudentView shim 불필요; aggregate split 없음; 기존 consumer ergonomics 보존.
- **Cons**: (i) 암호화-at-rest는 in-memory 누출(로그, 에러 메시지, IPC, sync DTO) 미방어; (ii) 키 관리 스토리 필요(PIN-derived? 키 위치? export/import 키 이식?); (iii) Principle 1 위반 — 암호화는 런타임이지 타입 레벨 아님; (iv) `groupingRules.ts` 컨슈머가 인라인 decrypt 처리 → 알고리즘 코드 경로에 PII 누출.
- **Rejected**: Principle 1 위반.

### Option C (steel-manned, rejected) — Separate PIN for studentPii distinct from classManagement
- **Pros**: (i) 최강 격리; (ii) 데이터 클래스별 세분 정책; (iii) 교사 멘탈 모델에서 학급 관리와 학생 PII 분리.
- **Cons**: (i) Principle 2 위반(PIN 다중화); (ii) 교사 PIN 피로 → 실세계 보안 자세 저하; (iii) 단일 PIN 내 `PinCapability` 태그가 키 다중화 없이 동등 세분성 달성; (iv) 두 번째 PIN 리셋·복구 흐름 도입.
- **Rejected**: Principle 2 위반.

---

## Why Chosen — Option A

Option A는 Principles 1·2를 동시 만족: 타입 레벨 PII 격리 (Principle 1) = aggregate split + Brand 타입. Capability 재사용 (Principle 2) = 기존 classManagement PIN의 `PinCapability` 태그. 리팩토링 표면은 LegacyStudentView shim 삭제 게이트로 P5에 한정.

## Consequences

**Positive**:
- 사용자 요구 즉시 충족 (1회 입력 → 그룹핑·시팅 자동 활용).
- 타입 레벨 PII 격리로 다수의 런타임 버그 클래스 제거.
- 미래 PII 종류 확대 시 패턴 재사용 가능.

**Negative**:
- 두 단계 마이그레이션 필요.
- LegacyStudentView shim = 시간 제한 기술 부채(P5 삭제 게이트).
- 위젯 기능 셋 제한 — 미래 main-process PIN broker 전까지 위젯 PII 미지원.
- 감사 로그 tiering으로 1개 → 2개 파일.

## Follow-ups (Open Questions)

- **#PII-TRACK-1 (v1.12)**: `AcademicLevel` ABCDE → `Quintile { rank: 1..5 }` 마이그레이션.
- **#PII-TRACK-2 (v1.13)**: Native 5-level `groupingRules`; `toLegacyLevel` shim + `src/adapters/legacy/` 삭제.
- **#PII-TRACK-3 (post-v1)**: 프라이버시 진단 화면 — `denied` 이벤트 카운트 + 로그 사이즈 표시.
- **PinCapability 6개월 collapse 검토**: {View, Edit, Import, Export}가 6개월 내 차등 정책 발생 시 유지, 아니면 {Read, Write}로 축소.
- 멀티 윈도우 PII 향후 — main-process PIN 세션 broker.
- 감사 로그 파일 위치 표준화 (Windows `%APPDATA%/Ssampin/audit/` vs `userData/audit/`).
- 마이그레이션 `.bak` 수명 — 다음 부팅 성공 후? N번 부팅 후?
- 동의 카피 검토 owner.

---

## Tensions Resolved (참고)

- **3.1 (PII 최소화 vs back-compat)**: 잠금 import는 PII 필드 strip + 사용자 알림. 잠금 교사는 colleague의 PII 미가져옴 — silent persistence보다 선택.
- **3.2 (tight balance vs 추론 방지)**: tight balance + R10 정직한 ack 모달 disclosure (가짜 randomization 대신).
- **3.3 (B1 매핑 vs grouping 진화)**: `toLegacyLevel` 시간 제한 shim, P5 삭제 게이트.
- **3.4 (audit log 무제한)**: 5MB FIFO + 1000건 sticky 보존 = P2 acceptance criterion (Follow-up 아님).
