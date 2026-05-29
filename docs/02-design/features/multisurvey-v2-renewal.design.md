# multisurvey-RB-renewal 설계서

> **Summary**: [Plan](../../01-plan/features/multisurvey-RB-renewal.plan.md)의 Phase 0~D를 구현 단위로 분해. (1) Domain: `MultiSurveyV2` 엔티티 신규 + `formatVersion: 2` + 11종 옵션을 3그룹(presentation/response/display)으로 구조화 + `MigrationReport` 타입. (2) UseCase: `useMultiSurveyV2Store`에 새 lifecycle + `useRealtimeToolFlag()` facade hook + `useMigrationReport()`. (3) Infrastructure: `multiSurveyMigration.ts` v1↔v2 라운드트립, `.ssampin/backup/v1/` writer, syncRegistry 제외 메타테스트, `formatVersion` 충돌 감지. (4) UI(Phase B): 3-column 메이커 + `RealtimeToolSettingsPanel`(11종 토글 3그룹) + 학생 라이브 페이지 sp-\* 토큰 적용 + 교실 모니터 share view + 포디움 컴포넌트. (5) Phase 0 산출물 4종이 본 설계의 전제 — wireframe·컴포넌트 트리·토글 위치 결정·도메인 노트.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: v2.1.0 (Phase A~C 묶음) · v2.1.1 (Phase D flag 제거)
> **Author**: pblsketch
> **Date**: 2026-05-22
> **Status**: Draft (Phase 0 산출물 완료 후 v0.2로 확정)
> **Plan Reference**: [docs/01-plan/features/multisurvey-RB-renewal.plan.md](../../01-plan/features/multisurvey-RB-renewal.plan.md)
> **Spec Reference**: [.omc/specs/deep-interview-multisurvey-RB.md](../../../.omc/specs/deep-interview-multisurvey-RB.md)

---

## 0. 비개발자 한 단락 요약

이 설계서는 plan을 "어디에 어떤 코드 파일을 만들지" 수준으로 구체화한 문서예요. 4 레이어(domain / adapters / electron-ipc / infrastructure)에 각각 어떤 파일을 새로 만들고 수정할지, 함수 이름·인자 모양은 어떻게 잡을지, 마이그레이션과 멀티 PC sync 차단 로직은 어떻게 구현할지 정리했어요. **Phase 0 산출물 4종(wireframe·컴포넌트 트리·11종 토글 위치·도메인 노트)이 끝난 다음에 본 설계서를 v0.2로 다시 확정**하게 됩니다. 그 전까지는 "본격 구현 시 깨질 수 있는 가설"로 가정하시면 됩니다.

---

## 1. Architecture Overview

### 1.1 Layer Touchpoints

```
domain/
  entities/multiSurvey/
    MultiSurveyV2.ts (신규)              ← formatVersion: 2, presentationOpts, responseOpts, displayOpts
    Question.ts (신규)                    ← OX/Multiple/Short/Blank/Description 5종 + 미디어
    Response.ts (신규)                    ← 학생 응답 + 시간 + 점수
    LiveSession.ts (신규)                 ← lobby/open/revealed/podium/end phase
  rules/multiSurveyRules.ts (신규)        ← validateSession, calcScore, isAnswerCorrect
  ports/IMultiSurveyMigrator.ts (신규)    ← migrate, rollback, getReport

adapters/
  stores/useMultiSurveyV2Store.ts (신규)  ← 새 도메인 facade
  hooks/useRealtimeToolFlag.ts (신규)     ← Single facade for feature flag (분기 ≤3)
  hooks/useMigrationReport.ts (신규)      ← 마이그레이션 리포트 모달용
  multiSurvey/migration/
    v1ToV2.ts (신규)                      ← forward 변환
    v2ToV1.ts (신규)                      ← backward 변환 (라운드트립 검증용)
    backupWriter.ts (신규)                ← .ssampin/backup/v1/ 쓰기
  multiSurvey/export/
    csv.ts (신규)                         ← 결과 CSV
    notion.ts (신규)                      ← 결과 Notion (큐잉 + quotaCooldownUntil 패턴)
  components/MultiSurvey/v2/
    Maker/
      MakerLayout.tsx (신규)              ← 3-column wrapper
      QuestionList.tsx (신규)             ← 좌측 (드래그 정렬·복사·추가)
      QuestionEditor.tsx (신규)           ← 중앙 편집
      LivePreview.tsx (신규)              ← 우측 미리보기 (학생 화면 1:1)
      RealtimeToolSettingsPanel.tsx (신규)← 11종 토글 3그룹
    Console/
      TeacherConsole.tsx (신규)           ← lobby/open/revealed/podium 통합
      LobbyView.tsx (신규)
      QuestionDisplay.tsx (신규)
      AnswerReveal.tsx (신규)
      Podium.tsx (신규)                   ← 1·2·3등 시상대 + ambient motion
    Student/                              ← 정적 HTML 템플릿 (sp-* CSS 변수 inline)
    Share/
      ClassroomShareView.tsx (신규)       ← 교실 모니터용 큰 글씨 + 응답 카운트 애니메이션
    Migration/
      MigrationReportModal.tsx (신규)     ← 부분 실패 시 사용자 안내

electron/ipc/
  liveMultiSurvey.ts                      ← Phase A에서 thin layer로 축소 (도메인 위임)
  liveMultiSurveyHTML.ts                  ← Phase B에서 sp-* CSS 변수 inline 주입 helper 추가
  _studentPageChrome.ts                   ← sp-* CSS 변수 inline 주입 helper (공용)
  multiSurveyMigration.ts (신규)          ← v1 데이터 발견 시 자동 v2 변환 + 백업 + 리포트
  _formatVersionGuard.ts (신규)           ← formatVersion: 2 데이터를 옛 클라이언트가 만나면 sync 차단

infrastructure/
  syncRegistry.ts                         ← .ssampin/backup/v1/ 제외 명시 + 메타테스트
  electron-builder.yml                    ← files 패턴에 !prototype/** 추가
  scripts/migration-roundtrip.mjs (신규)  ← npm run migration-roundtrip (5단계 분리)
  scripts/check-flag-usage.mjs (신규)     ← useRealtimeToolFlag ≤3개 카운트 게이트

prototype/realtime-tool-spike/ (Phase 0 전용, 종료 시 git rm)
  wireframes/
    maker.png
    console.png
    student.png
    share.png
  component-tree.md
  toggle-placement.md (11종 토글 UI 위치 결정문)
  domain-notes.md
```

### 1.2 Why a single facade hook for feature flag?

| Option                                               | Pros                                    | Cons                                        | Decision |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------- | -------- |
| 분기를 코드 곳곳에 `if (flag) { ... }`               | 가장 단순                               | 제거 시 grep으로 N건 찾아야 함, 부채 영구화 | ❌       |
| 단일 facade hook `useRealtimeToolFlag()` + 약속 ≤3개 | grep으로 위치 추적 가능, 제거 작업 30분 | hook 1개 추가 부담                          | ✅       |
| Strategy 패턴 (V1Provider / V2Provider)              | 가장 깔끔                               | 본 작업 범위 초과 (오버 엔지니어링)         | ❌       |

**약속한 3개 분기 위치**:

1. `useMultiSurveyV2Store` Adapter 진입점 — V1 store / V2 store 선택
2. UI 라우팅 — `<MakerLayout>` (V2) / `<LegacyMakerModal>` (V1) 분기
3. 마이그레이션 트리거 — 첫 진입 시 v1 데이터 감지 → v2 변환 실행

### 1.3 Why automatic migration with backup vs prompt user?

| Option                                | Pros                        | Cons                                              | Decision |
| ------------------------------------- | --------------------------- | ------------------------------------------------- | -------- |
| 사용자 동의 모달                      | 투명성                      | 비개발자 사용자가 의미 모른 채 거절 → 데이터 단절 | ❌       |
| 자동 변환 + 무손실 백업 + 사후 리포트 | 동의 비용 0 + 백업으로 안전 | 변환 시점 사용자 인지 불가                        | ✅       |
| 자동 변환만 (백업 없음)               | 가장 빠름                   | 롤백 불가                                         | ❌       |

---

## 2. Domain Layer

### 2.1 신규 엔티티 (MultiSurveyV2.ts)

```typescript
// domain/entities/multiSurvey/MultiSurveyV2.ts

export const FORMAT_VERSION_V2 = 2 as const;

export interface MultiSurveyV2 {
  readonly id: string;
  readonly formatVersion: typeof FORMAT_VERSION_V2;
  readonly title: string;
  readonly createdAt: string; // ISO
  readonly updatedAt: string;
  readonly questions: readonly Question[];
  readonly presentationOpts: PresentationOpts;
  readonly responseOpts: ResponseOpts;
  readonly displayOpts: DisplayOpts;
}

/** 발표 설정 그룹 (학습 UX 차원) */
export interface PresentationOpts {
  readonly showCumulativeScore: boolean; // 누적점수표시
  readonly revealExplanation: boolean; // 해설노출
  readonly allowReentry: boolean; // 재입장 가능
  // (배경음악은 v2.1.0 비-목표 — Plan §5.3)
}

/** 응답 설정 그룹 (게임 메카닉) */
export interface ResponseOpts {
  readonly explicitSubmitButton: boolean; // 정답 제출 버튼
  readonly autoAdvance: boolean; // 문제 자동 넘김
  readonly fastSolveBonus: boolean; // 빠른 풀이 점수
  readonly streakBonus: boolean; // 연속 정답 가산점
  readonly randomBonus: boolean; // 랜덤 보너스
}

/** 표시 설정 그룹 (교사 UX) */
export interface DisplayOpts {
  readonly teacherFocusMode: boolean; // 교사 집중 모드
  readonly showPerQuestionScore: boolean; // 문항별 점수 확인
}
```

### 2.2 Question 엔티티 (5종 유형)

```typescript
// domain/entities/multiSurvey/Question.ts

export type QuestionType = 'ox' | 'multiple' | 'short' | 'blank' | 'description';

export interface QuestionBase {
  readonly id: string;
  readonly type: QuestionType;
  readonly text: string;
  readonly mediaUrl?: string; // 보기 이미지 (Phase B 이후 인앱 그리기 별도)
  readonly explanation?: string;
  readonly timerSeconds: number; // 기본 20
  readonly score: number; // 기본 10
}

export interface OXQuestion extends QuestionBase {
  readonly type: 'ox';
  readonly correctAnswer: 'O' | 'X';
}

export interface MultipleQuestion extends QuestionBase {
  readonly type: 'multiple';
  readonly choices: readonly Choice[]; // 최대 5개
  readonly correctChoiceIds: readonly string[]; // 복수 정답 가능 (체크박스)
}

// ... ShortQuestion / BlankQuestion (초성제거 옵션) / DescriptionQuestion (min length)

export type Question =
  | OXQuestion
  | MultipleQuestion
  | ShortQuestion
  | BlankQuestion
  | DescriptionQuestion;
```

### 2.3 Migration Report 타입

```typescript
// domain/entities/multiSurvey/MigrationReport.ts

export interface MigrationReport {
  readonly attemptedAt: string;
  readonly totalCount: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly failedItems: readonly FailedMigrationItem[];
  readonly backupPath: string; // .ssampin/backup/v1/<timestamp>.json
}

export interface FailedMigrationItem {
  readonly sourceId: string;
  readonly reason: string;
  readonly preservedRaw: unknown; // 옛 포맷 원본 보관
}
```

### 2.4 Migration Port

```typescript
// domain/ports/IMultiSurveyMigrator.ts

export interface IMultiSurveyMigrator {
  migrate(v1Data: unknown[]): Promise<MigrationReport>;
  rollback(backupPath: string): Promise<void>;
  getReport(): MigrationReport | null;
}
```

---

## 3. Adapters Layer

### 3.1 Store (useMultiSurveyV2Store.ts)

핵심 메서드:

- `loadSessions()` — V2 데이터 로드, 없으면 v1 발견 시 마이그레이션 트리거
- `createSession(input)` — 신규 V2 세션 작성
- `updateSession(id, patch)` — 부분 업데이트
- `deleteSession(id)` — 휴지통 (영구 삭제 별도)
- `startLive(id, options)` — lobby 진입
- `nextPhase(id)` — open → revealed → podium
- `endLive(id)` — end, 결과 저장

### 3.2 Facade Hook (useRealtimeToolFlag.ts)

```typescript
// adapters/hooks/useRealtimeToolFlag.ts

export function useRealtimeToolFlag(): {
  readonly enabled: boolean;
  readonly setEnabled: (v: boolean) => void;
  readonly migrationStatus: 'idle' | 'in_progress' | 'completed' | 'failed';
} {
  // Settings store의 realtimeToolV2Enabled persist 값 + 마이그레이션 상태 합성
}
```

**호출 위치 약속 ≤ 3개** (Plan §5.2 D5):

1. `useMultiSurveyV2Store.loadSessions` — V1/V2 분기
2. `MultiSurveyToolEntry.tsx` UI 라우팅
3. `multiSurveyMigration.ts` 첫 실행 트리거

### 3.3 Hook (useMigrationReport.ts)

`useMigrationReport()` — 마이그레이션 리포트가 있으면 모달 띄움, "다시 안 보기" 토글 지원.

---

## 4. Migration Spec

### 4.1 v1 → v2 변환 매핑

| v1 필드            | v2 필드            | 변환 규칙                                                                            |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| `id`               | `id`               | 그대로                                                                               |
| `title`            | `title`            | 그대로                                                                               |
| `questions[].type` | `questions[].type` | 1:1 매핑 (`'objective'` → `'multiple'`, `'subjective'` → `'short'` 등 [TBD Phase 0]) |
| (v1에 없음)        | `formatVersion: 2` | 신규 추가                                                                            |
| (v1에 없음)        | `presentationOpts` | 기본값 (재입장만 true)                                                               |
| (v1에 없음)        | `responseOpts`     | 기본값 (게임 메카닉 모두 false)                                                      |
| (v1에 없음)        | `displayOpts`      | 기본값                                                                               |
| (v1에 응답 없음)   | (보존 안 함)       | 라이브 응답은 v1에서 휘발성이라 보존 불가 — 정상                                     |

### 4.2 v2 → v1 역변환 (라운드트립 검증용)

- `presentationOpts` / `responseOpts` / `displayOpts` 옵션 정보 손실 — **단, v1로 돌아가서 손실되는 건 옵션뿐** (질문·정답은 보존)
- 라운드트립 테스트는 **v1 → v2 → v1' (질문/정답만 byte-equal)** 검증

### 4.3 백업 정책

```
.ssampin/backup/v1/
  2026-MM-DD_HH-mm-ss/
    sessions.json        ← v1 원본 통째로
    metadata.json        ← 변환 시점·앱 버전·기기 ID
    failed/              ← 변환 실패한 세션만 격리
```

- **30일 자동 보존**, 30일 후 자동 정리
- **GDrive Sync 제외** (syncRegistry.ts에 추가 안 함, 메타테스트로 검증)
- 설정 화면에 "수동 롤백" 버튼 (마지막 백업 → v1 복원)

### 4.4 GDrive Sync 4 사분면 매트릭스

|        | PC1 옛(v2.0.x)                          | PC1 새(v2.1.0)                                                                 |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------ |
| PC2 옛 | 정상 (기존)                             | PC2가 새 포맷 만남 → `_formatVersionGuard.ts` 감지 → **sync 일시 정지** + 모달 |
| PC2 새 | PC1이 새 포맷 받으면 자동 변환 + 리포트 | 정상                                                                           |

**구현 위치**: `electron/ipc/_formatVersionGuard.ts` — sync 입력 데이터를 검사해 `formatVersion: 2` + 본인 앱이 v2.0.x면 throw + 모달 트리거.

### 4.5 다운그레이드 (v2.1.0 → v2.0.x)

- electron-updater 자동 다운그레이드 미지원, 수동 인스톨러로만 가능
- 수동 다운그레이드 시 옛 앱이 새 포맷 만나면 `_formatVersionGuard`가 차단
- 사용자에게는 "v2.1.0+에서만 볼 수 있는 답변입니다. 다시 v2.1.0으로 업데이트하세요" 안내

---

## 5. UI Layer (Phase B 가설 — Phase 0 wireframe 후 확정)

### 5.1 3-column Maker Layout

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: 제목 입력 + 미리보기·저장·게임하기 액션바              │
├──────────┬───────────────────┬──────────────────────────────┤
│          │                   │                              │
│ Question │  Question Editor  │  Live Preview                │
│ List     │  (현재 문항)      │  (학생 화면 1:1 렌더)        │
│ (좌측)   │                   │                              │
│          │                   │                              │
│ + 추가   │  RealtimeTool     │                              │
│          │  SettingsPanel    │                              │
│          │  (11종 토글 3그룹)│                              │
└──────────┴───────────────────┴──────────────────────────────┘
```

- **반응형**: 1280px 미만에서는 우측 Live Preview를 토글 패널로 (Pre-mortem #2 고려)
- **z-index**: `RealtimeToolSettingsPanel`이 모달이면 ModalCoordinator 큐 등록, 인라인이면 `sp-z-modal` 토큰 (Plan §5.2 D10)

### 5.2 11종 토글 3그룹 배치 (Phase 0에서 확정)

가설:

- **그룹 1 — 발표 설정** (3종): 누적점수표시 / 해설노출 / 재입장 가능
- **그룹 2 — 응답 설정** (5종): 정답 제출 버튼 / 자동 넘김 / 빠른 풀이 / 연속 가산점 / 랜덤 보너스
- **그룹 3 — 표시 설정** (2종): 교사 집중 모드 / 문항별 점수 확인

(라벨명은 Open Questions Q2에서 사용자와 확정)

### 5.3 학생 페이지 sp-\* CSS 변수 inline 주입

```typescript
// electron/ipc/_studentPageChrome.ts
export function injectDesignTokens(): string {
  return `
    <style>
      :root {
        --sp-radius-md: 12px;
        --sp-shadow-card: 0 2px 8px rgba(0,0,0,0.08);
        --sp-duration-base: 200ms;
        --sp-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        /* ... 전체 토큰 */
      }
    </style>
  `;
}
```

### 5.4 Podium 컴포넌트 (Phase C)

```typescript
// adapters/components/MultiSurvey/v2/Console/Podium.tsx
interface PodiumProps {
  readonly first: PodiumEntry;
  readonly second?: PodiumEntry;
  readonly third?: PodiumEntry;
  readonly onShowAllRanks: () => void;
  readonly onEndQuiz: () => void;
}

interface PodiumEntry {
  readonly studentId: string;
  readonly avatarUrl: string;
  readonly nickname: string;
  readonly score: number;
  readonly accuracy: number; // 정답률
}
```

- ambient motion: 1·2·3등 등장 stagger 애니메이션 (Plan Pre-mortem #2 신호 검증)
- `prefers-reduced-motion` 존중

---

## 6. Validation & Verification

### 6.1 메타테스트 (Plan §7 게이트 5+2)

| #   | 메타테스트                                 | 위치                                                        | 통과 기준                          |
| --- | ------------------------------------------ | ----------------------------------------------------------- | ---------------------------------- |
| 1   | `backupPath syncRegistry exclusion`        | `infrastructure/__tests__/syncRegistry.meta.test.ts`        | `.ssampin/backup/v1/` 포함 시 fail |
| 2   | `useRealtimeToolFlag usage count ≤ 3`      | `scripts/check-flag-usage.mjs` (CI)                         | grep 카운트 > 3 시 fail            |
| 3   | `migration roundtrip lossless`             | `adapters/__tests__/multiSurveyMigration.roundtrip.test.ts` | v1 → v2 → v1' 질문/정답 byte-equal |
| 4   | `electron-builder files exclude prototype` | `infrastructure/__tests__/builderFiles.meta.test.ts`        | `!prototype/**` 포함 여부          |

### 6.2 사용자 테스트 시나리오 (Plan §7 게이트 6)

Open Questions Q7 참조 — Phase C 진입 전 확정.

### 6.3 GDrive Sync 수동 검증 (Plan §7 게이트 7)

4 사분면 라운드트립:

1. PC1 v2.0.7 → PC2 v2.0.7: 정상
2. PC1 v2.1.0 마이그레이션 → PC2 v2.0.7: PC2에서 sync 일시 정지 모달 확인
3. PC1 v2.1.0 → PC2 v2.1.0: 자동 변환 + 리포트 확인
4. PC1 v2.1.0 → PC1 v2.0.x 다운그레이드: 차단 + 안내 확인

---

## 7. Open Design Questions (Phase 0 후 확정)

[Open Questions](../../03-analysis/multisurvey-RB-renewal.open-questions.md) Q1~Q10 참조.

본 design 문서에 직접 영향:

- **Q2** — 11종 토글 3그룹 라벨 (§5.2)
- **Q4** — sp-\* ratio baseline (§6 메타테스트 #2 연관)
- **Q10** — `migration-roundtrip` 5단계 분리 명령 (§6 메타테스트 #3 연관)

---

## 8. 다음 단계

1. **Phase 0 시작** — frontend-design 에이전트 협업
   - `prototype/realtime-tool-spike/` 디렉토리 생성
   - wireframe 4장 + 컴포넌트 트리 + 11종 토글 위치 + 도메인 노트
2. **Phase 0 종료 게이트** — 사용자 승인 → 본 design 문서 v0.2로 확정 (Open Questions Q1~Q10 결정 반영)
3. **Phase A 진입** — `useRealtimeToolFlag` + 도메인 + 마이그레이션 라운드트립

---

**Status**: Design v0.1 (Phase 0 후 v0.2 확정). 다음: Phase 0 진입 준비.
