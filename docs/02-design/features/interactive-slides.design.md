---
template: design
version: 0.1
feature: interactive-slides
date: 2026-05-10
author: cto-lead (consult: enterprise-expert / security-architect / frontend-architect / qa-strategist)
project: ssampin
version_target: v2.2.x
plan: docs/01-plan/features/interactive-slides.plan.md
---

# 인터랙티브 슬라이드 — 설계서

> 대응 Plan: [`interactive-slides.plan.md`](../../01-plan/features/interactive-slides.plan.md) (Phase 1 MVP 우선)
> 4인 팀 리뷰 v2 결과 반영본을 직접 구현 전 단계로 구체화한다. 이 문서는 Plan의 "무엇을·왜"에 대해 "어떻게"를 못 박는다.

---

## 0. 핵심 설계 원칙 (못박기)

### 0.1 Clean Architecture 의존 원칙

```
infrastructure → domain (포트 구현)
adapters       → domain + usecases
usecases       → domain만
domain         → 외부 import 0
```

**금지**:
- `usecases/`에서 `adapters/` import
- `usecases/`에서 `infrastructure/` import (DI 컨테이너 통해서만 주입)
- `domain/`에서 어떤 외부 라이브러리 import (zod 포함 — zod는 adapters/infrastructure 검증 경계에서만 사용)

**도메인 누설 차단**:
- `SlideOverlay.config`는 **discriminated union** (PollConfig | TextConfig | ...)
- Fabric.js 객체, Zustand store, React 타입은 절대 도메인 진입 금지
- 학생 응답의 `data`는 도메인 레벨에서는 typed union, 직렬화는 infrastructure에서

### 0.2 메인 프로세스 격리 원칙

다음은 **메인 프로세스 (Electron main)에서만** 실행한다. 렌더러는 IPC로 호출:
- Google Slides API 키 사용 fetch
- 단명 contentUrl 다운로드 → 디스크 저장
- WS 서버 (`ws` 패키지)
- 파일 시스템 R/W (`fs/promises`)
- LAN 모드 IP 탐지 (`os.networkInterfaces()`)

이유: API 키 노출 차단, asar 추출 시 노출 표면 최소화, OS 자원 단일 진입점.

### 0.3 학생 정보 최소화 원칙 (PIPA)

- 학생 식별자는 `studentToken` (서버 발급 UUID)만 사용
- 학생 이름은 평문 보관하되 **세션 종료 시 자동 익명화** (실명 → "학생1, 학생2..." 매핑)
- `late-join-state`는 **요청 학생 본인의 응답만** 포함. 다른 학생 응답 내용·이름은 절대 노출 X
- 응답 데이터는 **180일 자동 sweep**, GDrive 백업·챗봇 학습 파이프라인에 등록 X

### 0.4 단방향 진행 원칙 + 양방향 예외

- 진행: `Editor → Lobby → Presenter`. Presenter 진입 후 Editor 복귀 불가.
- 예외: `Lobby → Editor`는 `session.status === 'lobby'`일 때만 허용. 학생은 로비에 그대로 대기.

---

## 1. 구현 순서 (Phase 1 MVP, 의존성)

```
S0. 도메인 엔티티 + 포트 (외부 의존 0, 가장 먼저)
   ▼
S1. UseCases 10종 (StartLessonSession 등) — 도메인만 import
   ▼
S2. Infrastructure (병렬 가능)
    ├─ S2a. GoogleSlidesApiClient (메인 프로세스 IPC + 단명 URL 다운로드)
    ├─ S2b. LocalImageCacheRepository (revisionId 기반 캐시)
    ├─ S2c. JsonInteractiveLessonRepository (영속)
    └─ S2d. WS 서버 + SessionedWebSocketServer<TC,TS> 베이스 추출
   ▼
S3. PdfCanvasPreview N페이지 확장 (병렬 시작 가능)
   ▼
S4. 추출 작업 (병렬 가능)
    ├─ S4a. useChalkCanvas → useFabricOverlay 추출
    └─ S4b. ToolPoll → PollVotingOverlay + CreateView 옵션 빌더
   ▼
S5. Adapters
    ├─ S5a. useInteractiveLessonStore (수업 CRUD)
    ├─ S5b. useSlidesSessionStore (WS 클라이언트)
    ├─ S5c. LessonEditor.tsx (react-rnd 활동 배치)
    └─ S5d. LessonPresenter.tsx (점진적 노출 컨트롤 바)
   ▼
S6. 학생 SPA (src/slides-student/, vite.slides-student.config.ts)
   ▼
S7. 메타테스트 6종 + 부하 스크립트
   ▼
S8. 사이드바 진입 + 도구 카드 등록
```

각 Phase 완료 기준은 §11.

---

## 2. 도메인 엔티티 (TypeScript)

> 위치: `src/domain/entities/InteractiveSlides.ts` 신규 (단일 파일에 모음)

```ts
// ============ Branded ID Types (혼동 방지) ============
export type LessonId      = string & { __brand: 'LessonId' };
export type SlideId       = string & { __brand: 'SlideId' };
export type OverlayId     = string & { __brand: 'OverlayId' };
export type SessionId     = string & { __brand: 'SessionId' };
export type StudentToken  = string & { __brand: 'StudentToken' };
export type ResponseId    = string & { __brand: 'ResponseId' };
export type ShortCode     = string & { __brand: 'ShortCode' };

// ============ Source ============
export type SlideSource =
  | { type: 'google-slides'; presentationId: string; revisionId: string }
  | { type: 'pdf'; originalFileName: string; originalSize: number };

// ============ Lesson (재사용 가능한 수업 템플릿) ============
export interface InteractiveLesson {
  readonly id: LessonId;
  readonly title: string;
  readonly source: SlideSource;
  readonly slides: readonly Slide[];
  readonly createdAt: number;     // epoch ms
  readonly updatedAt: number;
}

export interface Slide {
  readonly id: SlideId;
  readonly pageNumber: number;     // 1-indexed
  readonly imagePath: string;      // file:// 절대 경로
  readonly overlays: readonly SlideOverlay[];
}

// ============ Overlay ============
export type OverlayType = 'poll' | 'text' | 'wordcloud' | 'draw' | 'draggable';

export interface OverlayPosition {
  readonly xPercent: number;       // 0~100
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

export interface SlideOverlay {
  readonly id: OverlayId;
  readonly slideId: SlideId;
  readonly type: OverlayType;
  readonly position: OverlayPosition;
  readonly autoActivate: boolean;
  readonly config: OverlayConfig;
  readonly createdAt: number;
}

// Discriminated union — 도메인은 fabric.js / Zustand 누설 0
export type OverlayConfig =
  | { type: 'poll'; question: string; options: readonly string[]; multiSelect: boolean }
  | { type: 'text'; prompt: string; maxLength: number }
  | { type: 'wordcloud'; prompt: string; maxKeywords: number }
  | { type: 'draw'; strokeWidthPx: number; palette: readonly string[] }
  | { type: 'draggable'; items: readonly { id: string; label: string }[];
                          targets: readonly { id: string; label: string }[] };

// ============ Session ============
export type SessionStatus = 'lobby' | 'active' | 'archived';
export type ResultsVisibility = 'hidden' | 'anonymous' | 'full';

export interface LessonSession {
  readonly id: SessionId;
  readonly lessonId: LessonId;
  readonly sessionName: string;       // 예: "2반 1교시"
  readonly shortCode: ShortCode;
  readonly status: SessionStatus;
  readonly currentSlideIndex: number;
  readonly resultsVisibility: ResultsVisibility;
  readonly accessMode: 'lan' | 'tunnel';
  readonly startedAt: number;
  readonly archivedAt: number | null;
  readonly anonymized: boolean;       // 종료 시 true로 전환
}

// ============ Student & Response ============
export interface SessionStudent {
  readonly studentToken: StudentToken;
  readonly displayName: string;       // 익명화 후 "학생N"
  readonly originalName: string | null; // 익명화 전 원본 (anonymized=false면 동일)
  readonly joinedAt: number;
  readonly presence: 'online' | 'offline';
}

export type StudentResponseData =
  | { type: 'poll'; selectedOptionIds: readonly string[] }
  | { type: 'text'; value: string }
  | { type: 'wordcloud'; keywords: readonly string[] }
  | { type: 'draw'; pngBase64: string; widthPx: number; heightPx: number }
  | { type: 'draggable'; placements: readonly { itemId: string; targetId: string | null }[] };

export interface StudentResponse {
  readonly id: ResponseId;            // 서버 UUID
  readonly sessionId: SessionId;
  readonly slideId: SlideId;
  readonly overlayId: OverlayId;
  readonly studentToken: StudentToken;
  readonly clientResponseId: string;   // 클라이언트 idempotency
  readonly data: StudentResponseData;
  readonly submittedAt: number;
}

// ============ Aggregated Results (집계, 종료 시 freeze) ============
export interface OverlayResults {
  readonly overlayId: OverlayId;
  readonly type: OverlayType;
  readonly aggregated: AggregatedResultData;
  readonly respondCount: number;
  readonly totalCount: number;
  readonly finalizedAt: number | null;  // null = 진행 중
}

export type AggregatedResultData =
  | { type: 'poll'; counts: Record<string, number>; totalVotes: number }
  | { type: 'text'; entries: readonly { studentToken: StudentToken; displayName: string; value: string }[] }
  | { type: 'wordcloud'; tally: Record<string, number> }
  | { type: 'draw'; submissions: readonly { studentToken: StudentToken; displayName: string; thumbnailPath: string }[] }
  | { type: 'draggable'; placementCounts: Record<string, Record<string, number>> };
```

### 2.1 도메인 규칙 (`src/domain/rules/overlayRules.ts`)

```ts
/** 활동 활성화 가능 여부 — Phase 1: 슬라이드당 동시 1개 제약 */
export function canActivateOverlay(
  slide: Slide,
  overlayId: OverlayId,
  activeOverlayIds: ReadonlySet<OverlayId>,
): { allowed: true } | { allowed: false; reason: 'already-active-on-slide' | 'overlay-not-found' };

/** 활동 타입별 응답 집계 (UseCase가 호출) */
export function aggregateResponses(
  overlay: SlideOverlay,
  responses: readonly StudentResponse[],
  students: readonly SessionStudent[],
): AggregatedResultData;

/** 결과 공개 모드별 학생 view 마스킹 */
export function maskResultsForStudent(
  results: AggregatedResultData,
  visibility: ResultsVisibility,
  requestingToken: StudentToken,
): AggregatedResultData | null;

/** shortCode 생성 charset (헷갈림 제거) */
export const SHORT_CODE_CHARSET = 'ACDEFGHJKLMNPQRTUVWXY3479';
export const SHORT_CODE_LENGTH = 6;
```

---

## 3. 도메인 포트 (인터페이스)

> 위치: `src/domain/ports/`

```ts
// IGoogleSlidesPort.ts — Slides 메타+썸네일 조회
export interface IGoogleSlidesPort {
  /** revisionId 변경 감지용 */
  getRevisionId(presentationId: string): Promise<string>;
  /** 페이지별 단명 contentUrl 목록 */
  getPageThumbnails(presentationId: string): Promise<readonly { pageId: string; contentUrl: string }[]>;
  /** 단명 URL 즉시 다운로드 → 영구 file:// 경로로 반환 */
  downloadAndCache(
    presentationId: string,
    revisionId: string,
    pages: readonly { pageId: string; contentUrl: string }[],
  ): Promise<readonly { pageId: string; imagePath: string }[]>;
}

// IImageCachePort.ts — 캐시 저장소
export interface IImageCachePort {
  exists(presentationId: string, revisionId: string): Promise<boolean>;
  list(presentationId: string, revisionId: string): Promise<readonly string[]>; // file:// 경로들
  invalidate(presentationId: string, exceptRevisionId?: string): Promise<void>;
}

// ISessionRepository.ts — 세션 영속
export interface ISessionRepository {
  save(session: LessonSession): Promise<void>;
  loadById(id: SessionId): Promise<LessonSession | null>;
  listByLessonId(lessonId: LessonId): Promise<readonly LessonSession[]>;
  delete(id: SessionId): Promise<void>;
  /** 180일 sweep 대상 조회 */
  listExpired(beforeMs: number): Promise<readonly SessionId[]>;
}

// IRealtimeBroadcaster.ts — WS 추상화 (UseCase가 호출)
export interface IRealtimeBroadcaster {
  broadcastToStudents(sessionId: SessionId, message: ServerToStudentMessage): void;
  sendToStudent(token: StudentToken, message: ServerToStudentMessage): void;
  sendToTeacher(sessionId: SessionId, message: ServerToTeacherMessage): void;
}

// ILessonRepository.ts — 수업 템플릿 영속 (생략 가능)
export interface ILessonRepository { /* save / load / list / delete */ }
```

---

## 4. UseCases (10종, `src/usecases/interactiveSlides/`)

각 UseCase는 **순수 함수 또는 의존성 주입을 받는 클래스**. domain만 import.

| # | UseCase | 시그니처 (요약) | 핵심 로직 |
|---|---------|---------------|---------|
| U1 | `StartLessonSession` | `(lessonId, sessionName, accessMode) → LessonSession` | shortCode 충돌 시 재시도, status='lobby' |
| U2 | `EndLessonSession` | `(sessionId) → { archivedSession, results[] }` | OverlayResults finalize, 익명화 적용, 영속 저장 |
| U3 | `AdvanceSlide` | `(sessionId, targetIndex, requesterRole) → Result` | 교사 권한 검증, autoActivate 활동 자동 활성화 |
| U4 | `ActivateOverlay` | `(sessionId, overlayId) → Result` | `canActivateOverlay` 검증, broadcaster 통보 |
| U5 | `DeactivateOverlay` | `(sessionId, overlayId, visibility) → OverlayResults` | results freeze + visibility 마스킹 |
| U6 | `SubmitStudentResponse` | `(sessionId, response) → 'recorded'\|'late'\|'rejected'` | upsert by (overlayId, studentToken), grace 500ms 'late' |
| U7 | `AggregateResponses` | `(overlay, responses[]) → AggregatedResultData` | 도메인 규칙 호출, 마스킹은 별도 |
| U8 | `RestoreLateJoinState` | `(sessionId, studentToken) → LateJoinState` | activeOverlays + closedOverlays + myResponses, 정보 최소화 |
| U9 | `AnonymizeSession` | `(session, students) → { newSession, mappingTable }` | 실명 → "학생N" 매핑 |
| U10 | `PurgeExpiredSessions` | `() → SessionId[] purged` | 180일 초과 sweep |

### 4.1 핵심 UseCase: `SubmitStudentResponse` 의사코드

```ts
// src/usecases/interactiveSlides/SubmitStudentResponse.ts
export interface SubmitStudentResponseDeps {
  sessionRepo: ISessionRepository;
  // 라이브 응답은 메모리 (디스크 X) — 종료 시 스냅샷
  liveResponseStore: LiveResponseStore;
  broadcaster: IRealtimeBroadcaster;
  clock: () => number;
}

export interface SubmitInput {
  sessionId: SessionId;
  overlayId: OverlayId;
  studentToken: StudentToken;
  clientResponseId: string;
  data: StudentResponseData;
}

export type SubmitOutcome = 'recorded' | 'late' | 'rejected';

export async function SubmitStudentResponse(
  deps: SubmitStudentResponseDeps,
  input: SubmitInput,
): Promise<SubmitOutcome> {
  const session = await deps.sessionRepo.loadById(input.sessionId);
  if (!session) return 'rejected';
  if (session.status === 'archived') return 'rejected';

  const overlayState = deps.liveResponseStore.getOverlayState(input.sessionId, input.overlayId);
  if (!overlayState) return 'rejected';

  // Deactivation grace: 500ms 안에 도착하면 'late'
  let outcome: SubmitOutcome = 'recorded';
  if (overlayState.deactivatedAt !== null) {
    if (deps.clock() - overlayState.deactivatedAt > 500) return 'rejected';
    outcome = 'late';
  }

  // Upsert by (overlayId, studentToken) — 최신값 우선
  deps.liveResponseStore.upsertResponse({
    id: makeResponseId(),
    sessionId: input.sessionId,
    slideId: overlayState.slideId,
    overlayId: input.overlayId,
    studentToken: input.studentToken,
    clientResponseId: input.clientResponseId,
    data: input.data,
    submittedAt: deps.clock(),
  });

  // 교사 화면에 집계 통보 (마스킹은 broadcaster가 visibility로 처리)
  const aggregated = aggregateResponses(
    overlayState.overlay,
    deps.liveResponseStore.listResponses(input.sessionId, input.overlayId),
    deps.liveResponseStore.listStudents(input.sessionId),
  );
  deps.broadcaster.sendToTeacher(input.sessionId, {
    type: 'response-received',
    overlayId: input.overlayId,
    aggregated,
    respondCount: deps.liveResponseStore.respondCount(input.sessionId, input.overlayId),
    totalCount: deps.liveResponseStore.studentCount(input.sessionId),
  });

  return outcome;
}
```

---

## 5. Infrastructure 구현

### 5.1 GoogleSlidesApiClient (메인 프로세스)

> 위치: `src/infrastructure/googleSlides/GoogleSlidesApiClient.ts` (메인에서 import)
> 환경변수: `process.env.GOOGLE_SLIDES_API_KEY` (build 시 메인 번들에만 주입)

```ts
export class GoogleSlidesApiClient implements IGoogleSlidesPort {
  constructor(
    private apiKey: string,
    private cache: IImageCachePort,
    private fetchFn: typeof fetch,
    private fs: { writeFile: (path: string, data: Buffer) => Promise<void> },
    private cacheDir: string, // app.getPath('userData')/cache/slides
  ) {}

  async getRevisionId(presentationId: string): Promise<string> {
    const url = `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=revisionId&key=${this.apiKey}`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw mapHttpError(res);
    const json = await res.json();
    return json.revisionId;
  }

  async getPageThumbnails(presentationId: string) { /* presentations.get → pages[] → 각 page에 대해 getThumbnail */ }

  async downloadAndCache(presentationId, revisionId, pages) {
    // 단명 contentUrl을 즉시 다운로드 (~30분 TTL이라 사용자가 클릭하기 전에 fetch)
    // 동시 max 4 (rate limit 회피)
    // 결과: file:// 경로
  }
}

function mapHttpError(res: Response): Error {
  if (res.status === 404) return new SlidesNotPublicError();
  if (res.status === 429) return new SlidesQuotaExceededError();
  return new SlidesNetworkError(res.status);
}
```

### 5.2 IPC 채널 (메인 ↔ 렌더러)

> 위치: `electron/ipc/slidesSource.ts`

| 채널 | 페이로드 | 응답 |
|------|---------|------|
| `slides:fetch-from-google` | `{ presentationId }` | `{ revisionId, slides: { pageId, imagePath }[] }` 또는 에러 |
| `slides:render-pdf` | `{ pdfPath, lessonId }` | `{ slides: { pageNumber, imagePath }[] }` |
| `slides:cache-status` | `{ presentationId, revisionId }` | `{ cached: boolean, paths: string[] }` |

렌더러는 `window.electronAPI.slidesSource.fetchFromGoogle(...)` 형태로 호출. preload는 `contextBridge.exposeInMainWorld`로 노출.

### 5.3 WS 서버 (`electron/ipc/interactiveSlides.ts`)

#### 5.3.1 `SessionedWebSocketServer<TC, TS>` 베이스 추출

> 위치: `electron/ipc/sessionedWebSocketServer.ts` 신규
> realtimeWall.ts와 공유. 본 PDCA에서 **추출 + realtimeWall 마이그레이션** 함께 수행.

```ts
export interface SessionedWsConfig<TC, TS> {
  port: number;
  clientMessageSchema: ZodSchema<TC>;
  onClientMessage(client: ClientHandle, msg: TC): Promise<void>;
  onClientDisconnect(client: ClientHandle): void;
}

export interface ClientHandle {
  readonly ws: WebSocket;
  readonly sessionCode: string;
  readonly role: 'teacher' | 'student';
  readonly studentToken: StudentToken | null;
}

export class SessionedWebSocketServer<TC, TS> {
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(sessionCode: string, role: 'teacher' | 'student', msg: TS): void;
  sendTo(client: ClientHandle, msg: TS): void;
  // ws options: maxPayload: 2MB
}
```

#### 5.3.2 인터랙티브 슬라이드 어댑터

```ts
// electron/ipc/interactiveSlides.ts
const server = new SessionedWebSocketServer<ClientToServerMsg, ServerToClientMsg>({
  port: SLIDES_PORT,
  clientMessageSchema: ClientToServerMsgSchema, // 13건 union
  onClientMessage: handleSlidesMessage,
  onClientDisconnect: handleDisconnect,
});

// IPC: ipcMain.handle('slides-session:start', ...) 등
// teacher mutex: sessionCode당 role='teacher' 동시 2 연결 차단
// heartbeat: 5초마다 활성 활동 상태 broadcast
// disconnect grace: 학생 60초 이내 rejoin 가능, 교사 60초 grace + teacher-disconnected broadcast
```

### 5.4 LocalImageCacheRepository

```ts
// src/infrastructure/storage/LocalImageCacheRepository.ts
// path: {userData}/cache/slides/{presentationId}/{revisionId}/{pageId}.png
// invalidate: 다른 revisionId 폴더 삭제
// 디스크 풀 감지: writeFile ENOSPC → 사용자 토스트로 throw
```

### 5.5 JsonInteractiveLessonRepository

```ts
// src/adapters/repositories/JsonInteractiveLessonRepository.ts
// (구현체는 어댑터 — IStoragePort 통해 JSON file/localStorage 폴백)
// 라이브 응답: 메모리 (LiveResponseStore — usecases가 주입)
// 종료 시 스냅샷:
//   userData/data/lessonSessions/{sessionId}.json
//   { session, students[], responses[], overlayResults[] }
// 마이그레이션: schemaVersion 필드 + 분기
```

### 5.6 LiveResponseStore (메모리)

```ts
// 메모리 상주, IPC 모듈 닫힐 때 휘발
// API:
//   upsertResponse(r: StudentResponse)
//   listResponses(sessionId, overlayId): readonly StudentResponse[]
//   listStudents(sessionId): readonly SessionStudent[]
//   getOverlayState(sessionId, overlayId): OverlayState | null
//   markDeactivated(sessionId, overlayId, atMs)
//   respondCount / studentCount
// 디스크 영속 X (per-event 디스크 쓰기 회피)
```

---

## 6. WebSocket 프로토콜 — Zod 스키마

> 위치: `src/shared/wsProtocol/interactiveSlides.ts` (메인 + 학생 SPA 양쪽 import)

```ts
import { z } from 'zod';

// ========== 공통 ==========
export const PROTOCOL_VERSION = '1.0.0' as const;
export const ShortCodeSchema = z.string().regex(/^[ACDEFGHJKLMNPQRTUVWXY3479]{6}$/);
export const StudentTokenSchema = z.string().uuid();

// ========== Client → Server ==========
export const SlideAdvanceSchema = z.object({
  type: z.literal('slide-advance'),
  sessionCode: ShortCodeSchema,
  slideIndex: z.number().int().nonnegative(),
  timestamp: z.number(),
});
// ... overlay-activate / overlay-deactivate / lesson-end
export const JoinSessionSchema = z.object({
  type: z.literal('join-session'),
  sessionCode: ShortCodeSchema,
  studentName: z.string().min(1).max(20),
  rejoin: z.object({ previousToken: StudentTokenSchema }).optional(),
});
export const OverlayResponseSchema = z.object({
  type: z.literal('overlay-response'),
  sessionCode: ShortCodeSchema,
  overlayId: z.string().uuid(),
  studentToken: StudentTokenSchema,
  clientResponseId: z.string().min(1).max(64),
  data: z.discriminatedUnion('type', [
    z.object({ type: z.literal('poll'), selectedOptionIds: z.array(z.string()).max(10) }),
    z.object({ type: z.literal('text'), value: z.string().max(2000) }),
    z.object({ type: z.literal('wordcloud'), keywords: z.array(z.string()).max(10) }),
    z.object({ type: z.literal('draw'),
               pngBase64: z.string().max(700_000),  // 400KB 권장 + 여유
               widthPx: z.number(), heightPx: z.number() }),
    z.object({ type: z.literal('draggable'), placements: z.array(z.object({
      itemId: z.string(), targetId: z.string().nullable(),
    })) }),
  ]),
});

export const ClientToServerMsgSchema = z.discriminatedUnion('type', [
  SlideAdvanceSchema, OverlayActivateSchema, OverlayDeactivateSchema,
  LessonEndSchema, JoinSessionSchema, OverlayResponseSchema,
]);
export type ClientToServerMsg = z.infer<typeof ClientToServerMsgSchema>;

// ========== Server → Student / Teacher ==========
// ... (slide-changed / overlay-activated / overlay-deactivated / lesson-ended /
//      teacher-disconnected / teacher-reconnected / overlay-deadline / error /
//      session-joined / late-join-state / response-accepted /
//      response-received / student-joined / student-presence-changed)
```

### 6.1 Zod 검증 실패 정책

- parse 실패 → 즉시 `ws.close(1008, 'invalid-payload')`
- 서버는 보안 로그 기록 (메시지 type 추정 + IP + studentToken)
- 학생 클라이언트는 자동 재연결 비활성 (스팸 차단)

### 6.2 PNG magic byte 검증

```ts
function isValidPng(base64: string): boolean {
  // base64 디코딩 후 첫 8바이트가 89 50 4E 47 0D 0A 1A 0A인지 확인
  // 위반 시 drop + 보안 로그
}
```

### 6.3 Rate limit (학생당)

- overlay당 1초 5회 (sliding window)
- 위반 시 `error: { code: 'rate-limited' }` 회신 + drop

---

## 7. 핵심 시퀀스 다이어그램 (5종)

### 7.1 슬라이드 소스 연결 (Google Slides)

```
Renderer        Main Process          Google API      Disk
   │   ipc:fetch-from-google                          │
   │──────────────────►│                              │
   │                   │ presentations.get?fields=revisionId
   │                   │─────────────────►            │
   │                   │◄─────────────────            │
   │                   │ cache.exists(presId, revId)? │
   │                   │──────────────────────────────►
   │                   │◄────────────────────────  yes → 5
   │                   │ pages.getThumbnail × N pages │
   │                   │─────────────────►            │
   │                   │◄─── contentUrl (TTL ~30min)──│
   │                   │ download contentUrl × N      │
   │                   │─────────────────►            │
   │                   │◄─── PNG bytes ───            │
   │                   │ writeFile × N                │
   │                   │──────────────────────────────►
   │ ◄── { revisionId, slides: file:// paths } ──────│
```

오류 분기:
- 404 → `SlidesNotPublicError` → 가이드 모달 + PDF 대안
- 429 → 백오프 1회 → 실패 시 PDF 대안
- ENOSPC → "디스크 공간 부족" 토스트
- revisionId 변경 감지 → "슬라이드가 변경되었어요" 토스트 + 자동 재캐시

### 7.2 활동 활성화 + 응답 burst

```
Teacher UI    WS Server       Students × 40
   │ overlay-activate
   │─────────►│
   │          │ ActivateOverlay UseCase
   │          │ canActivateOverlay 검증
   │          │ broadcast overlay-activated
   │          │──────────────► × 40 동시
   │                                        │
   │                                        │ 5s 분산 응답
   │                                        │ overlay-response × 40
   │                                        │─────────►│
   │                                                   │ Zod 검증
   │                                                   │ WS↔token 바인딩 확인
   │                                                   │ SubmitStudentResponse UseCase
   │                                                   │ upsert by (overlayId, token)
   │                              ◄──── response-accepted (개별 ack)
   │ ◄── response-received (집계, P95 < 300ms)
   │
   │ overlay-deactivate { visibility }
   │─────────►│
   │          │ markDeactivated(now)
   │          │ aggregateResponses → freeze
   │          │ maskResultsForStudent (visibility별)
   │          │ broadcast overlay-deactivated
   │          │──────────────► × 40
   │
   │  (500ms grace 안에 도착한 응답은 'late'로 수락)
```

### 7.3 학생 late-join

```
Student            WS Server                LiveResponseStore
   │ join-session { sessionCode, studentName, rejoin? }
   │─────────────►│
   │              │ rejoin 검증 (60초 내 disconnect?)
   │              │ studentToken 발급 또는 재발급
   │              │ store.addStudent or markOnline
   │              │ session-joined { studentToken, sessionStatus, currentSlideIndex }
   │ ◄──────────── │
   │              │ buildLateJoinState(sessionId, studentToken)
   │              │   - activeOverlays[{id, activatedAt, deadline?}]
   │              │   - closedOverlays[{id, closedAt, results?}] (visibility 마스킹)
   │              │   - studentList: { totalOnline } (인원 수만)
   │              │   - myResponses[{overlayId, submittedAt}] (요청 token만)
   │ ◄── late-join-state
   │
   │ (UI: 응답 완료 활동은 "응답 완료" 배지, 닫힌 활동은 "이전 활동이 종료되었어요" + 결과)
```

### 7.4 교사 disconnect → reconnect

```
Teacher WS       Server                Students
                    │ teacher disconnect
                    │ start grace timer (60s)
                    │ broadcast teacher-disconnected { gracePeriodMs: 60000 }
                    │──────────────► × students
                                                  │ UI: 빨간 배너 "선생님 연결 확인 중"
                                                  │ 마지막 슬라이드 유지 (활동 상태 freeze)

  (60s 안에 재연결)
   │ join (role=teacher)
   │─────────────►│
                  │ broadcast teacher-reconnected
                  │──────────────► × students
                                                  │ 배너 사라짐, 정상 진행

  (60s 초과 시)
                  │ session.status = 'archived' 자동 전환
                  │ broadcast lesson-ended { reason: 'teacher-timeout' }
                  │──────────────► × students
                                                  │ 종료 화면 + 익명화 적용
```

### 7.5 수업 종료 + 익명화

```
Teacher       Server         SessionRepository
   │ lesson-end
   │─────────►│
   │          │ EndLessonSession UseCase
   │          │   - finalize OverlayResults (모든 활성 활동 freeze)
   │          │   - AnonymizeSession: 학생 실명 → "학생N", 매핑 별도
   │          │   - session.status = 'archived', anonymized = true
   │          │   - session.archivedAt = now
   │          │ snapshotToJson()
   │          │─────────────────►│
   │          │ broadcast lesson-ended
   │ ◄── lesson-ended
   │ (학생 화면 종료 화면 표시)
```

---

## 8. Adapters — 스토어 & UI

### 8.1 useInteractiveLessonStore (Zustand)

> 위치: `src/adapters/stores/useInteractiveLessonStore.ts`
> 책임: 수업 템플릿 CRUD, 슬라이드 소스 연결 트리거, 활동 배치/저장. **WS와 무관**.

```ts
interface InteractiveLessonStoreState {
  lessons: Record<LessonId, InteractiveLesson>;
  loading: boolean;
  error: string | null;

  // Actions
  loadAll(): Promise<void>;
  createLesson(title: string): Promise<LessonId>;
  connectGoogleSlides(lessonId: LessonId, url: string): Promise<void>; // IPC 호출
  uploadPdf(lessonId: LessonId, file: File): Promise<void>;
  addOverlay(slideId: SlideId, type: OverlayType, position: OverlayPosition, config: OverlayConfig): Promise<OverlayId>;
  updateOverlay(overlayId: OverlayId, patch: Partial<SlideOverlay>): Promise<void>;
  deleteOverlay(overlayId: OverlayId): Promise<void>;
  /** 닫고 새로 만들기 — 위치/크기/타입 복제, 새 ID, 비활성 상태 */
  cloneOverlayForRecreate(overlayId: OverlayId): Promise<OverlayId>;
}
```

### 8.2 useSlidesSessionStore (Zustand + WS client)

> 위치: `src/adapters/stores/useSlidesSessionStore.ts`
> 책임: 세션 라이프사이클 + WS 송수신. realtimeWall pattern 복제.

```ts
interface SlidesSessionStoreState {
  session: LessonSession | null;
  students: SessionStudent[];
  currentSlideIndex: number;
  activeOverlayIds: Set<OverlayId>;
  closedOverlays: Map<OverlayId, OverlayResults>;
  liveResults: Map<OverlayId, AggregatedResultData>;  // 교사 화면용
  connectionState: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

  // Teacher actions (메인 프로세스 IPC)
  startSession(lessonId: LessonId, sessionName: string, accessMode: 'lan' | 'tunnel'): Promise<void>;
  beginPresentation(): Promise<void>;       // status lobby → active
  returnToEditor(): Promise<void>;          // status active만 차단, lobby에서만 허용
  advanceSlide(targetIndex: number): Promise<void>;
  activateOverlay(overlayId: OverlayId): Promise<void>;
  deactivateOverlay(overlayId: OverlayId, visibility: ResultsVisibility): Promise<void>;
  endLesson(): Promise<void>;

  // 내부: WS 메시지 핸들러 (각 메시지 타입에 1 case)
  _handleServerMsg(msg: ServerToTeacherMsg): void;
}
```

### 8.3 학생 SPA 스토어 (`src/slides-student/store.ts`)

```ts
interface StudentSessionState {
  studentToken: StudentToken | null;
  sessionStatus: SessionStatus | null;
  currentSlideIndex: number;
  currentSlideImageUrl: string | null;
  activeOverlay: { overlay: SlideOverlay; activatedAt: number; deadline?: number } | null;
  myResponses: Map<OverlayId, { submittedAt: number }>;
  closedOverlays: Map<OverlayId, { closedAt: number; results: AggregatedResultData | null }>;
  teacherConnected: boolean;
  // ...
}
```

### 8.4 LessonEditor.tsx (React)

| 영역 | 컴포넌트 | 라이브러리 |
|------|---------|-----------|
| 슬라이드 미리보기 | `SlideThumbnailRail` | (자작) |
| 슬라이드 본체 | `SlideCanvas` (배경 이미지) | (자작) |
| 활동 박스 (배치 모드) | `react-rnd` 래핑 `OverlayHandle` | react-rnd |
| 활동 설정 패널 | `OverlayConfigDrawer` (slide-in 우측) | `Drawer.tsx` |
| 활동 추가 FAB | `IconButton` (+) | `IconButton` |
| "수업 시작" CTA | `Button` primary | `Button` |

### 8.5 LessonPresenter.tsx — 점진적 노출 컨트롤

```
┌──────────────────────────────────────────────────────────────┐
│  [슬라이드 이미지]                                            │
│                                                              │
│   ┌─── 활동 영역 (활성 시 학생 응답 + 결과 표시) ───┐        │
│   └────────────────────────────────────────────┘        │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│  [◀ 이전] [3 / 12] [다음 ▶]                                  │
│                              [활동 패널]* [수업 종료]         │
│                                                              │
│  *현재 슬라이드에 활동이 있을 때만 표시                       │
│   - 비활성: "활동 시작" 버튼 (확인 다이얼로그 동반)            │
│   - 활성: "결과 공개 모드" 라디오 (비공개/익명/전체) + "닫기"   │
│   - 닫힘: "결과 보기" 토글                                     │
└──────────────────────────────────────────────────────────────┘

상단 (조건부):
- 외부 인터넷 노출 시: 빨간 "터널 모드" 배지 + "LAN 전환"
- WS 끊김: 빨간 배너 "재연결 중..."
```

### 8.6 학생 SPA 화면

| 단계 | 화면 |
|------|------|
| 코드 입력 | 6자 입력 필드 + QR 스캐너 진입 안내 |
| 이름 입력 | "이름" + "수업 후 180일 자동 삭제됩니다" 고정 문구 |
| 로비 | "선생님이 수업을 시작하면 화면이 전환됩니다" |
| 진행중 합류 | "수업이 진행 중이에요" → 2초 후 슬라이드 뷰 |
| 슬라이드 뷰 | 배경 이미지 + 활동 영역 (있을 때) + 닫힌 활동 안내 |
| 종료 | "수업이 종료되었어요. 참여해주셔서 고마워요" |

---

## 9. 파일 구조

```
src/
├─ domain/
│  ├─ entities/InteractiveSlides.ts          (신규, 단일 파일)
│  ├─ rules/overlayRules.ts                   (신규)
│  └─ ports/
│      ├─ IGoogleSlidesPort.ts                (신규)
│      ├─ IImageCachePort.ts                  (신규)
│      ├─ ISessionRepository.ts               (신규)
│      └─ IRealtimeBroadcaster.ts             (신규)
│
├─ usecases/interactiveSlides/                (신규 디렉토리)
│  ├─ StartLessonSession.ts
│  ├─ EndLessonSession.ts
│  ├─ AdvanceSlide.ts
│  ├─ ActivateOverlay.ts
│  ├─ DeactivateOverlay.ts
│  ├─ SubmitStudentResponse.ts
│  ├─ AggregateResponses.ts
│  ├─ RestoreLateJoinState.ts
│  ├─ AnonymizeSession.ts
│  └─ PurgeExpiredSessions.ts
│
├─ adapters/
│  ├─ stores/
│  │  ├─ useInteractiveLessonStore.ts          (신규)
│  │  └─ useSlidesSessionStore.ts              (신규)
│  ├─ components/InteractiveSlides/            (신규 디렉토리)
│  │  ├─ ToolInteractiveSlides.tsx
│  │  ├─ Editor/
│  │  │  ├─ LessonEditor.tsx
│  │  │  ├─ SlideThumbnailRail.tsx
│  │  │  ├─ SlideCanvas.tsx
│  │  │  ├─ OverlayHandle.tsx
│  │  │  └─ OverlayConfigDrawer.tsx
│  │  ├─ Presenter/
│  │  │  ├─ LessonPresenter.tsx
│  │  │  ├─ PresenterControlBar.tsx
│  │  │  └─ ActivityPanel.tsx
│  │  └─ Lobby/LessonLobby.tsx
│  ├─ overlays/                                  (활동 컴포넌트, 교사·학생 공유)
│  │  ├─ PollVotingOverlay.tsx                   (ToolPoll에서 추출)
│  │  ├─ TextResponseOverlay.tsx
│  │  ├─ WordCloudOverlay.tsx
│  │  ├─ DrawOverlay.tsx                         (useFabricOverlay 사용)
│  │  └─ DraggableOverlay.tsx
│  └─ hooks/useFabricOverlay.ts                  (useChalkCanvas에서 추출)
│
├─ infrastructure/
│  ├─ googleSlides/GoogleSlidesApiClient.ts     (신규)
│  └─ storage/LocalImageCacheRepository.ts       (신규)
│
├─ shared/wsProtocol/interactiveSlides.ts        (Zod, 메인+학생 SPA 공유)
│
└─ slides-student/                               (신규 SPA 디렉토리)
    ├─ index.html
    ├─ main.tsx
    ├─ App.tsx
    ├─ store.ts
    ├─ wsClient.ts
    └─ pages/
        ├─ JoinPage.tsx
        ├─ LobbyPage.tsx
        ├─ SlidePage.tsx
        └─ EndPage.tsx

electron/
├─ ipc/
│  ├─ sessionedWebSocketServer.ts                (신규 베이스 추출)
│  ├─ interactiveSlides.ts                       (신규)
│  ├─ slidesSource.ts                            (신규 — Google/PDF IPC)
│  └─ realtimeWall.ts                            (마이그레이션 — 베이스 사용)
└─ main.ts                                        (기존 — 신규 IPC 등록 + BrowserWindow)

vite.slides-student.config.ts                    (신규, outDir = dist-slides-student)

scripts/
└─ load-test-slides.mjs                          (신규)

src/adapters/components/Tools/Chalkboard/
└─ useChalkCanvas.ts                              (개정 — useFabricOverlay 추출)

src/adapters/components/Tools/
└─ ToolPoll.tsx                                   (개정 — PollVotingOverlay 추출)

src/adapters/components/Export/
└─ PdfCanvasPreview.tsx                            (개정 — N페이지 + lazy)
```

---

## 10. 보안·개인정보 구현 명세 (Plan §11 매핑)

| Plan 조항 | 구현 위치 | 검증 |
|----------|----------|------|
| §11.1 180일 sweep | `PurgeExpiredSessions` UseCase + Electron `setInterval` 매일 0시 | 단위 테스트 + 단축 시뮬레이션 |
| §11.1 익명화 | `AnonymizeSession` UseCase (EndLessonSession에서 호출) | 단위 테스트: 실명 → "학생N" 매핑 |
| §11.1 즉시 삭제 | `ISessionRepository.delete` + UI 버튼 | 통합 테스트 |
| §11.1 GDrive/챗봇 제외 | `syncRegistry`에 등록 X (메타테스트로 보장) | MT-7 (신규) |
| §11.2 studentToken 서버 발급 | `JoinSession` 핸들러에서 `crypto.randomUUID()` | 통합 테스트 |
| §11.2 WS↔token 바인딩 | `ClientHandle.studentToken` 매칭 검증 | 통합 테스트: token mismatch drop |
| §11.2 응답 upsert | `LiveResponseStore.upsertResponse` | 단위 테스트 |
| §11.3 shortCode entropy | `SHORT_CODE_CHARSET` + `SHORT_CODE_LENGTH` | 단위 테스트: 충돌률 |
| §11.3 터널 종료 시 cleanup | `endSession` 시 `cloudflared tunnel cleanup` | 수동 검증 |
| §11.3 외부 노출 배지 | `LessonPresenter` 상단 조건부 렌더 | 시각 검증 |
| §11.4 드로잉 보존 | 응답 데이터에 포함 (180일 sweep 동시 적용) | 통합 테스트 |
| §11.5 Q&A 익명 기본 (Phase 2) | F14 설계 시 명시 | — |
| §11.6 API 키 메인 프로세스 격리 | 메인 번들에만 환경변수 주입, 렌더러 IPC만 | 메타테스트 (grep) |
| §11.7 firstRun 자체 진단 | `LessonLobby.tsx`에서 `localIP:port` self-fetch | 통합 테스트 |
| §11.7 Windows Firewall | `electron-builder.yml` NSIS `include` 스크립트 추가 | 수동 검증 |

### 10.1 메타테스트 신규 (MT-7)

```ts
// MT-7: interactive-slides 데이터가 syncRegistry에 등록되지 않음
test('interactive-slides 데이터는 GDrive 백업·챗봇 KB에 포함되지 않음', () => {
  const reg = readFileSync('src/adapters/sync/syncRegistry.ts', 'utf8');
  expect(reg).not.toMatch(/lessonSession|interactiveSlides|slides-student/);
  const ingest = readFileSync('scripts/ingest-chatbot-qa.mjs', 'utf8');
  expect(ingest).not.toMatch(/lessonSession|interactiveSlides/);
});
```

---

## 11. 검증 체크리스트 (Phase 1 완료 게이트)

### 11.1 자동 검증

- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm test -- --run` 신규 + 기존 711+ 테스트 PASS (회귀 0)
- [ ] MT-1~MT-7 모든 메타테스트 PASS
- [ ] `npx vite build` (메인 SPA) + `npx vite build --config vite.slides-student.config.ts` 모두 성공
- [ ] `node scripts/build-electron.mjs` 성공
- [ ] `node scripts/load-test-slides.mjs --students=40 --mode=lan` Phase 2/3 P95 기준 통과

### 11.2 수동 인수 (Plan §13.3 Must)

- [ ] F1~F7 인수 기준 (각 항목)
- [ ] LAN 모드 실제 Wi-Fi 환경 1회 완주 (스마트폰 2대 이상)
- [ ] 터널 모드 실제 인터넷 환경 1회 완주
- [ ] `design examples/` 참조 + 디자인 일관성 spot-check

### 11.3 보안·법적 검증

- [ ] API 키가 렌더러 번들 (asar 내 dist/)에 들어있지 않음을 grep으로 확인
- [ ] 익명화 후 F8-3 결과 조회 시 학생 실명이 표시되지 않음
- [ ] 180일 sweep 단축 시뮬레이션 (clock injection) 통과
- [ ] `docs/02-design/security-spec.md`에 PIPA Article 22 매핑표 작성됨

### 11.4 회귀 안전망

- [ ] 기존 realtimeWall 회귀 0 (`SessionedWebSocketServer` 베이스 추출 후)
- [ ] `useChalkCanvas` 추출 후 기존 칠판 도구 회귀 0
- [ ] `ToolPoll` 추출 후 기존 투표 도구 회귀 0
- [ ] `PdfCanvasPreview` N페이지 확장 후 기존 1페이지 미리보기 회귀 0

---

## 12. 위험 항목 (구현 단계에서 주의)

| 항목 | 신호 | 대응 |
|------|------|------|
| `SessionedWebSocketServer` 베이스 추출 시 realtimeWall 회귀 | 담벼락 통합 테스트 실패 | 베이스 추출은 별도 PR로 분리, realtimeWall 마이그레이션 PR 통과 후 interactive-slides 진행 |
| `useChalkCanvas` 추출 시 칠판 회귀 | Chalkboard 시각 회귀 | 추출 전후 시각 스냅샷 비교, 추출 인터페이스 최소 (pen/eraser/undo/serialize) |
| Google Slides 단명 URL TTL | 다운로드 지연 → 404 | 다운로드를 fetch 직후 즉시 실행, 동시 max 4 |
| API key 환경변수 누락 (CI) | 빌드 실패 | `process.env.GOOGLE_SLIDES_API_KEY` 부재 시 빌드 시 명확한 에러 + CI secret 등록 가이드 |
| 학생 SPA outDir 충돌 | 메인 dist 덮어쓰기 | MT-6 메타테스트로 사전 차단 |
| Windows Firewall 첫 실행 | 학생 접속 실패 | NSIS 인스톨러 firewall exception + firstRun 자체진단 토스트 |
| 디스크 풀 (이미지 캐시) | ENOSPC | 사용자 토스트 + LRU 캐시 정리 (혹은 캐시 디렉토리 크기 알림) |
| 교사 PC 슬립 | 학생 멈춤 | teacher-disconnected broadcast + 60초 grace + 학생 마지막 슬라이드 유지 |

---

## 13. 다음 단계 (Do Phase 진입 조건)

본 설계서의 §11 검증 체크리스트는 Do 종료 시점 기준이다. Do Phase 시작 시 다음을 우선 수행:

1. **S0 도메인 엔티티 + 포트 작성** (~1일) — 외부 의존 0이므로 단독으로 PR 가능
2. **S1 UseCases 10종 작성** + 단위 테스트 (~3일) — 도메인만 import
3. **S2d `SessionedWebSocketServer` 베이스 추출 + realtimeWall 마이그레이션 PR** (~3일) — interactive-slides와 별도로 main에 머지하여 회귀 차단

이후 S2a/S2b/S2c/S3/S4 병렬 진행 가능. S5~S7은 S0~S4 완료 의존.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-10 | 초기 설계서 — Plan v2 기반 | cto-lead + 4-team |
