/**
 * Interactive Slides WS 프로토콜 Zod 스키마.
 *
 * Plan §3 + Design §6 매핑. 메인 프로세스 + 학생 SPA 양쪽이 import.
 *
 * 모든 외부 입력은 신뢰 불가 — 베이스 서버가 parse 실패 시
 * `connection.close(1008, 'invalid-payload')`로 종료.
 *
 * **메타테스트 MT-1**: 13종 client-to-server 메시지 타입 모두 스키마 정의 필수.
 * **메타테스트 MT-3**: PROTOCOL_VERSION 상수가 학생 SPA와 일치해야 함.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// 공통
// ─────────────────────────────────────────────────────────────

/** 학생 SPA + 메인 프로세스가 공유하는 프로토콜 버전 (스키마 변경 시 bump) */
export const PROTOCOL_VERSION = '1.0.0' as const;

/**
 * shortCode (Plan §11.3): 6자리 영숫자 대문자, charset 고정.
 * `ACDEFGHJKLMNPQRTUVWXY3479` (헷갈리는 문자 제거).
 */
export const ShortCodeSchema = z
  .string()
  .regex(/^[ACDEFGHJKLMNPQRTUVWXY3479]{6}$/);

/** UUID v4 — studentToken 등 서버 발급 ID */
export const UuidV4Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

/** 학생 이름 — 공백 trim, 1~20자 */
const StudentNameSchema = z.string().trim().min(1).max(20);

/** 클라이언트 idempotency key */
const ClientResponseIdSchema = z.string().min(1).max(64);

/**
 * 드로잉 PNG base64 데이터 한도 (Plan §3 페이로드 한도).
 * - 권장: 400KB (1280×720 압축)
 * - 한도: 700KB base64 인코딩 (raw ~520KB)
 * - WS maxPayload는 별도로 2MB로 강제 (베이스 서버 옵션)
 */
const DRAW_PNG_BASE64_MAX = 700_000;

// ─────────────────────────────────────────────────────────────
// Overlay Config (학생/교사 송신 양쪽에서 사용 — discriminated union)
// ─────────────────────────────────────────────────────────────

const PollOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(200),
});

const DraggableItemSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(200),
});

const DraggableTargetSchema = DraggableItemSchema;

export const OverlayConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('poll'),
    question: z.string().max(500),
    options: z.array(PollOptionSchema).min(2).max(10),
    multiSelect: z.boolean(),
  }),
  z.object({
    type: z.literal('text'),
    prompt: z.string().max(500),
    maxLength: z.number().int().positive().max(2000),
  }),
  z.object({
    type: z.literal('wordcloud'),
    prompt: z.string().max(500),
    maxKeywords: z.number().int().positive().max(20),
  }),
  z.object({
    type: z.literal('draw'),
    strokeWidthPx: z.number().positive().max(40),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(20),
  }),
  z.object({
    type: z.literal('draggable'),
    items: z.array(DraggableItemSchema).min(1).max(20),
    targets: z.array(DraggableTargetSchema).min(1).max(20),
  }),
]);

// ─────────────────────────────────────────────────────────────
// Overlay Position (% 기반)
// ─────────────────────────────────────────────────────────────

export const OverlayPositionSchema = z.object({
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  widthPercent: z.number().positive().max(100),
  heightPercent: z.number().positive().max(100),
});

// ─────────────────────────────────────────────────────────────
// Student Response Data (overlay type별 discriminated union)
// ─────────────────────────────────────────────────────────────

export const StudentResponseDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('poll'),
    selectedOptionIds: z.array(z.string().min(1).max(64)).max(10),
  }),
  z.object({
    type: z.literal('text'),
    value: z.string().max(2000),
  }),
  z.object({
    type: z.literal('wordcloud'),
    keywords: z.array(z.string().min(1).max(50)).max(10),
  }),
  z.object({
    type: z.literal('draw'),
    pngBase64: z.string().max(DRAW_PNG_BASE64_MAX),
    widthPx: z.number().int().positive().max(4096),
    heightPx: z.number().int().positive().max(4096),
  }),
  z.object({
    type: z.literal('draggable'),
    placements: z
      .array(
        z.object({
          itemId: z.string().min(1).max(64),
          targetId: z.string().min(1).max(64).nullable(),
        }),
      )
      .max(50),
  }),
]);

// ─────────────────────────────────────────────────────────────
// Client → Server (6 종)
// ─────────────────────────────────────────────────────────────

export const SlideAdvanceSchema = z.object({
  type: z.literal('slide-advance'),
  sessionCode: ShortCodeSchema,
  slideIndex: z.number().int().nonnegative(),
  timestamp: z.number(),
});

export const OverlayActivateSchema = z.object({
  type: z.literal('overlay-activate'),
  sessionCode: ShortCodeSchema,
  overlayId: UuidV4Schema,
});

export const OverlayDeactivateSchema = z.object({
  type: z.literal('overlay-deactivate'),
  sessionCode: ShortCodeSchema,
  overlayId: UuidV4Schema,
  showResults: z.enum(['hidden', 'anonymous', 'full']),
});

export const LessonEndSchema = z.object({
  type: z.literal('lesson-end'),
  sessionCode: ShortCodeSchema,
});

export const JoinSessionSchema = z.object({
  type: z.literal('join-session'),
  sessionCode: ShortCodeSchema,
  studentName: StudentNameSchema,
  rejoin: z
    .object({
      previousToken: UuidV4Schema,
    })
    .optional(),
});

export const OverlayResponseSchema = z.object({
  type: z.literal('overlay-response'),
  sessionCode: ShortCodeSchema,
  overlayId: UuidV4Schema,
  studentToken: UuidV4Schema,
  clientResponseId: ClientResponseIdSchema,
  data: StudentResponseDataSchema,
});

export const ClientToServerMsgSchema = z.discriminatedUnion('type', [
  SlideAdvanceSchema,
  OverlayActivateSchema,
  OverlayDeactivateSchema,
  LessonEndSchema,
  JoinSessionSchema,
  OverlayResponseSchema,
]);

export type ClientToServerMsg = z.infer<typeof ClientToServerMsgSchema>;

// ─────────────────────────────────────────────────────────────
// Server → Student (10 종, broadcast + ack)
// ─────────────────────────────────────────────────────────────

/**
 * 서버 → 학생 메시지 union.
 *
 * 클라이언트 측 검증용. 서버 코드는 typed object로 직접 보내므로 보통
 * 직접 검증할 필요는 없지만 학생 SPA가 들어오는 메시지를 검증할 때 사용.
 */
export const ServerToStudentMsgSchema = z.discriminatedUnion('type', [
  // broadcast
  z.object({
    type: z.literal('slide-changed'),
    slideIndex: z.number().int().nonnegative(),
    slide: z.unknown(), // Slide 구조 — 양쪽 신뢰 환경이라 unknown 처리
  }),
  z.object({
    type: z.literal('overlay-activated'),
    overlayId: UuidV4Schema,
    config: OverlayConfigSchema,
    position: OverlayPositionSchema,
    activatedAt: z.number(),
  }),
  z.object({
    type: z.literal('overlay-deactivated'),
    overlayId: UuidV4Schema,
    results: z.unknown().nullable(), // AggregatedResultData — 직렬화 후 검증
  }),
  z.object({
    type: z.literal('lesson-ended'),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('teacher-disconnected'),
    gracePeriodMs: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('teacher-reconnected'),
  }),
  z.object({
    type: z.literal('overlay-deadline'),
    overlayId: UuidV4Schema,
    deadline: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
  // 개별 ack
  z.object({
    type: z.literal('session-joined'),
    studentToken: UuidV4Schema,
    sessionStatus: z.enum(['lobby', 'active', 'archived']),
    currentSlideIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('late-join-state'),
    state: z.unknown(), // LateJoinState 직렬화 — 학생 SPA 측 typed mapping
  }),
  z.object({
    type: z.literal('response-accepted'),
    overlayId: UuidV4Schema,
    status: z.enum(['recorded', 'late', 'rejected']),
  }),
]);

export type ServerToStudentMsg = z.infer<typeof ServerToStudentMsgSchema>;

// ─────────────────────────────────────────────────────────────
// Server → Teacher (5 종)
// ─────────────────────────────────────────────────────────────

export const ServerToTeacherMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response-received'),
    overlayId: UuidV4Schema,
    aggregated: z.unknown(),
    respondCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('student-joined'),
    studentToken: UuidV4Schema,
    studentName: z.string(),
    totalCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('student-presence-changed'),
    studentToken: UuidV4Schema,
    online: z.boolean(),
    totalOnline: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('overlay-finalized'),
    results: z.unknown(),
  }),
  z.object({
    type: z.literal('session-archived'),
    sessionId: z.string(),
  }),
]);

export type ServerToTeacherMsg = z.infer<typeof ServerToTeacherMsgSchema>;

// ─────────────────────────────────────────────────────────────
// Rate limit policy (Plan §3 메시지 검증 절)
// ─────────────────────────────────────────────────────────────

/**
 * 학생당 overlay당 1초 5회 (Plan: "1초 5회 sliding window").
 * 본 모듈은 정책만 export — 실제 제한은 SessionedWebSocketServer.isRateLimited 호출.
 */
export const RATE_LIMIT_WINDOW_MS = 1000;
export const RATE_LIMIT_LIMIT = 5;

// ─────────────────────────────────────────────────────────────
// Type guards (학생 SPA 측 추론 도우미)
// ─────────────────────────────────────────────────────────────

export type ClientMessageType = ClientToServerMsg['type'];

export const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
  'slide-advance',
  'overlay-activate',
  'overlay-deactivate',
  'lesson-end',
  'join-session',
  'overlay-response',
] as const;
