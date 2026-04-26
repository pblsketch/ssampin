import { app, BrowserWindow, ipcMain } from 'electron';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { generateRealtimeWallHTML } from './realtimeWallHTML';
import { closeTunnel, installTunnel, isTunnelAvailable, openTunnel } from './tunnel';
import {
  addStudentComment,
  approvalModeFromModerationMode,
  createWallPost,
  removeStudentComment,
  toggleStudentLike,
} from '../../src/domain/rules/realtimeWallRules';
import type {
  RealtimeWallColumn,
  RealtimeWallComment,
  RealtimeWallPost,
  StudentCommentInput,
  WallApprovalMode,
} from '../../src/domain/entities/RealtimeWall';
import type { RealtimeWallBoardSettings } from '../../src/domain/entities/RealtimeWallBoardSettings';
import {
  DEFAULT_WALL_BOARD_THEME,
  WALL_BOARD_BACKGROUND_PRESET_IDS,
} from '../../src/domain/entities/RealtimeWallBoardTheme';

/**
 * v2.1 student-ux 회귀 fix (2026-04-24): 디버그 로깅 게이트.
 *
 * 학교 환경 진단을 위해 production 빌드에서도 활성. 양은 매우 적음 (이벤트 단위
 * 1줄, payload는 size만). 민감한 base64 본문은 로깅하지 않음.
 */
const RWALL_DEBUG = true;
function rwallLog(tag: string, payload?: Record<string, unknown>): void {
  if (!RWALL_DEBUG) return;
  try {
    if (payload) {
      console.log(`[realtime-wall] ${tag}`, payload);
    } else {
      console.log(`[realtime-wall] ${tag}`);
    }
  } catch {
    // noop
  }
}

interface RealtimeWallSubmission {
  id: string;
  nickname: string;
  text: string;
  linkUrl?: string;
  submittedAt: number;
  // v2.1 신규 (Phase B) — 이미지 다중 / PDF / 색상 / sessionToken / pinHash
  images?: readonly string[];
  pdfUrl?: string;
  pdfFilename?: string;
  color?: 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange' | 'gray' | 'white';
  ownerSessionToken?: string;
  studentPinHash?: string;
  /**
   * v2.1 student-ux — 학생이 Kanban 컬럼별 + 버튼으로 진입한 경우 columnId.
   * 교사 측 createWallPost가 이 columnId를 우선 사용해 카드를 해당 컬럼에 배치.
   */
  columnId?: string;
}

/**
 * 패들렛 모드 v1.14: renderer에서 보내는 broadcast 메시지 타입.
 * Design §4.3 서버→클라이언트 메시지 union과 동일 구조.
 *
 * src/usecases/realtimeWall/BroadcastWallState.ts의 `BroadcastableServerMessage`와
 * structural 일치 — electron 번들은 src/를 import 못하므로 duplicate 정의. 스키마 변경 시
 * 두 파일 동기 필수.
 *
 * P2 메시지 3종(like-toggled / comment-added / comment-removed) 추가.
 */
type BroadcastableServerMessage =
  | { type: 'wall-state'; board: unknown }
  | { type: 'post-added'; post: unknown }
  | { type: 'post-updated'; postId: string; patch: unknown }
  | { type: 'post-removed'; postId: string }
  | { type: 'closed' }
  | { type: 'error'; message: string }
  // P2
  | { type: 'like-toggled'; postId: string; likes: number; likedBy: readonly string[] }
  | { type: 'comment-added'; postId: string; comment: RealtimeWallComment }
  | { type: 'comment-removed'; postId: string; commentId: string }
  // P3
  | { type: 'student-form-locked'; locked: boolean }
  // v2.1 (Phase B 도메인 선언, Phase A/D 활용)
  | { type: 'boardSettings-changed'; settings: unknown }
  | { type: 'nickname-changed'; postIds: readonly string[]; newNickname: string };

// v2.1 Phase D — 본인 단일수신 메시지 (broadcast 아님, 송신자 1인 응답)
type SingleClientServerMessage =
  | { type: 'pin-verified'; ok: true }
  | { type: 'pin-mismatch'; ok: false };

/**
 * 클라이언트 → 서버 입력 Zod 스키마. Design §4.2 / §9 보안 규정.
 *
 * 모든 외부 입력은 신뢰 불가 — 런타임 검증으로 사전 차단.
 *
 * v2.1 (Phase B) 신규/확장:
 *   - StudentSubmitSchema: images? (max 3) + pdfUrl? + pdfFilename? + color? 추가
 *   - StudentCommentV2Schema: 댓글 v2 (이미지 1장 첨부)
 *   - PIN 평문 절대 X — `pinHash` (SHA-256 hex 64자리)만 (회귀 위험 #9)
 */

// 공통 — 이미지 data URL.
// v2.1 student-ux 회귀 fix (2026-04-24): 단일 이미지 raw 10MB → base64 ~13.4MB + 여유.
const ImageDataUrlSchema = z.string().startsWith('data:image/').max(14_000_000);

// 공통 — 카드 색상 8색
const ColorSchema = z.enum([
  'yellow',
  'pink',
  'blue',
  'green',
  'purple',
  'orange',
  'gray',
  'white',
]);

// 공통 — SHA-256 hex 64자리 (PIN 평문 X — 회귀 위험 #9)
const PinHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

const StudentJoinSchema = z.object({
  type: z.literal('join'),
  sessionToken: z.string().min(1).max(100),
});

const StudentSubmitSchema = z.object({
  type: z.literal('submit'),
  sessionToken: z.string().min(1).max(100),
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(1000),
  linkUrl: z.string().max(500).optional(),
  // v2.1 신규 (Phase B)
  images: z.array(ImageDataUrlSchema).max(5).optional(),
  /**
   * PDF data URL (base64) — 학생은 브라우저에서 base64로 송신.
   * Main이 magic byte 검증 후 임시 디렉토리 저장 + file:// URL 발급 → broadcast 시 URL로 교체.
   * 학생 첨부 path: data:application/pdf;base64,...
   * 서버 발급 후 카드 저장 path: file:///...
   */
  pdfUrl: z.string().max(15_000_000).optional(), // 10MB raw → ~13.4MB base64 + 여유
  pdfFilename: z.string().min(1).max(200).optional(),
  color: ColorSchema.optional(),
  // PIN hash (PIN 설정 학생만 첨부 — Phase D 활용, Phase B에서는 무시)
  pinHash: PinHashSchema.optional(),
  /**
   * v2.1 student-ux — Kanban 컬럼별 + 버튼 진입 시 학생이 선택한 columnId (Padlet 패턴).
   *
   * - 미지정: 교사 측 createWallPost가 첫 컬럼 default 사용
   * - 지정: server는 submission에 첨부 → 교사 IPC 전달 → createWallPost가 해당 컬럼에 카드 배치
   * - 외부 입력 신뢰 불가 — 길이 제한 (KanbanPositionSchema와 동일)
   */
  columnId: z.string().min(1).max(100).optional(),
});

const StudentLikeSchema = z.object({
  type: z.literal('student-like'),
  sessionToken: z.string().min(1).max(100),
  postId: z.string().min(1).max(100),
});

const StudentCommentSchema = z.object({
  type: z.literal('student-comment'),
  sessionToken: z.string().min(1).max(100),
  postId: z.string().min(1).max(100),
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(200),
});

// v2.1 신규 — 댓글 v2 (이미지 1장 첨부 가능)
const StudentCommentV2Schema = z.object({
  type: z.literal('submit-comment-v2'),
  sessionToken: z.string().min(1).max(100),
  postId: z.string().min(1).max(100),
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(200),
  images: z.array(ImageDataUrlSchema).max(1).optional(),
  pinHash: PinHashSchema.optional(),
});

// ============================================================
// v2.1 Phase D — 학생 자기 카드 수정/삭제 + PIN + 교사 닉네임 변경
// Design v2.1 §4.2 / §4.6 — 회귀 위험 #9 (PIN 평문 절대 X)
// ============================================================

// Phase D — 학생 자기 카드 수정 (submit-edit)
// linkUrl/pdfUrl/pdfFilename은 nullable (null = 첨부 제거 의도)
// images는 빈 배열 = 첨부 제거 의도
const StudentSubmitEditSchema = z.object({
  type: z.literal('submit-edit'),
  sessionToken: z.string().min(1).max(100),
  pinHash: PinHashSchema.optional(),
  postId: z.string().min(1).max(100),
  text: z.string().min(1).max(1000).optional(),
  linkUrl: z.string().max(500).nullable().optional(),
  images: z.array(ImageDataUrlSchema).max(5).optional(),
  pdfUrl: z.string().max(15_000_000).nullable().optional(),
  pdfFilename: z.string().min(1).max(200).nullable().optional(),
  color: ColorSchema.optional(),
});

// Phase D — 학생 자기 카드 삭제 (submit-delete) — soft delete (status='hidden-by-author')
const StudentSubmitDeleteSchema = z.object({
  type: z.literal('submit-delete'),
  sessionToken: z.string().min(1).max(100),
  pinHash: PinHashSchema.optional(),
  postId: z.string().min(1).max(100),
});

// Phase D — PIN 등록 (submit-pin-set)
// 회귀 위험 #9: PIN 평문 X — pinHash (SHA-256 hex 64자리)만
const SubmitPinSetSchema = z.object({
  type: z.literal('submit-pin-set'),
  sessionToken: z.string().min(1).max(100),
  pinHash: PinHashSchema,
});

// Phase D — PIN 검증 (submit-pin-verify)
const SubmitPinVerifySchema = z.object({
  type: z.literal('submit-pin-verify'),
  sessionToken: z.string().min(1).max(100),
  pinHash: PinHashSchema,
});

// Phase D — 교사 닉네임 변경 / 일괄 숨김 / 복원 등 (update-nickname)
// 단일 카드 또는 sessionToken/pinHash 기준 일괄 적용
const UpdateNicknameSchema = z.object({
  type: z.literal('update-nickname'),
  sessionToken: z.string().min(1).max(100),
  postId: z.string().min(1).max(100).optional(),
  ownerSessionToken: z.string().min(1).max(100).optional(),
  ownerPinHash: PinHashSchema.optional(),
  newNickname: z.string().min(1).max(20),
});

// ============================================================
// v2.1 Phase C — 학생 자기 카드 위치 변경 (submit-move)
// Design v2.1 §4.2 — sessionToken/PIN hash 양방향 매칭 + 좌표 검증
// ============================================================

const FreeformPositionSchema = z.object({
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
  w: z.number().int().min(100).max(2000),
  h: z.number().int().min(100).max(2000),
  zIndex: z.number().int().min(0).max(100000).optional(),
});

const KanbanPositionSchema = z.object({
  columnId: z.string().min(1).max(100),
  order: z.number().int().min(0).max(10000),
});

// z.discriminatedUnion는 bare ZodObject(.shape 접근 가능)만 허용하므로
// base를 union에 넣고 freeform/kanban 존재 검증은 union 외부에서 수행.
const StudentSubmitMoveSchema = z.object({
  type: z.literal('submit-move'),
  sessionToken: z.string().min(1).max(100),
  pinHash: PinHashSchema.optional(),
  postId: z.string().min(1).max(100),
  freeform: FreeformPositionSchema.optional(),
  kanban: KanbanPositionSchema.optional(),
});

const ClientMessageSchema = z
  .discriminatedUnion('type', [
    StudentJoinSchema,
    StudentSubmitSchema,
    StudentLikeSchema,
    StudentCommentSchema,
    StudentCommentV2Schema,
    StudentSubmitEditSchema,
    StudentSubmitDeleteSchema,
    SubmitPinSetSchema,
    SubmitPinVerifySchema,
    UpdateNicknameSchema,
    StudentSubmitMoveSchema,
  ])
  .refine(
    (m) => m.type !== 'submit-move' || m.freeform !== undefined || m.kanban !== undefined,
    { message: 'either freeform or kanban must be provided' },
  );

// ============================================================
// v1.16.x (Phase 1, Design §3.5) — WallBoardTheme Zod 검증
// 학생 메시지에는 theme 변경 권한 X — 본 스키마는 교사 broadcast(boardSettings-changed)
// 페이로드 정규화에만 사용. electron 번들이 src/usecases import 못하므로 duplicate.
// ============================================================
const WallBoardThemeSchemaIpc = z.object({
  colorScheme: z.enum(['light', 'dark']),
  background: z.object({
    type: z.enum(['solid', 'gradient', 'pattern']),
    presetId: z.enum(
      WALL_BOARD_BACKGROUND_PRESET_IDS as unknown as readonly [string, ...string[]],
    ),
  }),
  // accent — hex 6자리만 (CSS injection 차단, 회귀 위험 #10)
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const RealtimeWallBoardSettingsSchemaIpc = z.object({
  version: z.literal(1),
  moderation: z.enum(['off', 'manual']),
  theme: WallBoardThemeSchemaIpc.optional(),
});

type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * Per-(sessionToken, type) sliding-window rate limit.
 * Design §9.3.
 *
 * - submit: 5회/분
 * - student-like: 30회/분
 * - student-comment: 5회/분
 * - join: 30회/분 (재연결 폭주 방어)
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<ClientMessage['type'], number> = {
  join: 30,
  submit: 5,
  'student-like': 30,
  'student-comment': 5,
  // v2.1 — 댓글 v2는 v1과 같은 5/분 (이미지 첨부로 부담 증가하지만 학생 1인 다중 카드 흡수)
  // Plan §4.6 — submit 5/분, comment-v2 10/분으로 완화
  // 단 'student-comment' (v1 호환)은 5/분 유지
  'submit-comment-v2': 10,
  // v2.1 Phase D — 학생 자기 카드 수정/삭제 + PIN + 교사 닉네임 변경
  'submit-edit': 10,
  'submit-delete': 5,
  'submit-pin-set': 5, // PIN 변경 폭주 방지
  'submit-pin-verify': 30, // brute force 방지 (10000개 PIN을 30/분 = 5시간 소요)
  'update-nickname': 10,
  // v2.1 Phase C — 학생 자기 카드 위치 변경 (드래그 빈번 → 60/분)
  'submit-move': 60,
};

const rateLimitBuckets = new Map<string, number[]>();

function rateLimitKey(sessionToken: string, type: ClientMessage['type']): string {
  return `${sessionToken}:${type}`;
}

function isRateLimited(sessionToken: string, type: ClientMessage['type'], now: number): boolean {
  const key = rateLimitKey(sessionToken, type);
  const limit = RATE_LIMITS[type];
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = rateLimitBuckets.get(key) ?? [];
  // window 밖 timestamp 제거
  const fresh = existing.filter((t) => t >= windowStart);
  if (fresh.length >= limit) {
    rateLimitBuckets.set(key, fresh);
    return true;
  }
  fresh.push(now);
  rateLimitBuckets.set(key, fresh);
  return false;
}

interface RealtimeWallSession {
  server: http.Server;
  wss: WebSocketServer;
  title: string;
  maxTextLength: number;
  submissions: Map<string, RealtimeWallSubmission>;
  clients: Set<WebSocket>;
  /**
   * 마지막 'wall-state' broadcast 스냅샷. 신규 join 시 즉시 송신해
   * 학생이 current 보드 상태로 렌더 가능하도록 한다.
   */
  lastWallState: BroadcastableServerMessage | null;
  /**
   * v1.14 P2 — 좋아요/댓글 처리를 위한 in-memory post cache.
   *
   * 교사가 broadcast한 wall-state의 post들을 postId → RealtimeWallPost로 보관.
   * 학생 like/comment 도착 시 도메인 규칙으로 업데이트한 뒤 broadcast.
   * 교사 renderer가 stage-dirty IPC로 영속화하므로, 서버 재시작 시 캐시 손실 OK.
   */
  postsCache: Map<string, RealtimeWallPost>;
  /**
   * v1.14 P3 — 학생 카드 추가 잠금 플래그.
   *
   * 교사가 BoardSettingsDrawer에서 토글. true면 submit 요청을 거부하고
   * error 메시지를 반환. 기본값 false.
   * wall-state broadcast 시 WallBoardSnapshotForStudent.studentFormLocked에 동기화.
   */
  studentFormLocked: boolean;
}

/**
 * 학생 SPA 정적 파일 루트. prod 환경에서만 존재.
 * - Win/Linux: `app.getAppPath()/dist-student`
 * - Dev 환경에서는 존재하지 않으며 기존 fallback HTML이 서빙됨.
 */
function getStudentDistRoot(): string {
  return path.join(app.getAppPath(), 'dist-student');
}

function getStudentAssetContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function serveStudentAsset(
  pathname: string,
  res: http.ServerResponse,
): boolean {
  const distRoot = getStudentDistRoot();
  if (!fs.existsSync(distRoot)) return false;

  // 디렉토리 탈출 방지 — resolve 후 prefix 검사
  const requested = path.normalize(pathname).replace(/^[\\/]+/, '');
  const target = path.resolve(distRoot, requested);
  if (!target.startsWith(distRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;

  try {
    const data = fs.readFileSync(target);
    res.writeHead(200, { 'Content-Type': getStudentAssetContentType(target) });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function serveStudentIndexHtml(res: http.ServerResponse): boolean {
  // Vite student 빌드 산출물은 `student.html`로 나온다 (입력 파일명 유지).
  // `index.html` 이름을 쓰는 경우도 fallback으로 시도.
  const candidates = ['student.html', 'index.html'];
  for (const name of candidates) {
    const indexPath = path.join(getStudentDistRoot(), name);
    if (!fs.existsSync(indexPath)) continue;
    try {
      const html = fs.readFileSync(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

let session: RealtimeWallSession | null = null;

function generateSubmissionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generateCommentId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `c-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function normalizeLink(raw: unknown): { valid: boolean; value?: string } {
  if (typeof raw !== 'string') return { valid: true };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: true };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false };
    }
    return { valid: true, value: url.toString() };
  } catch {
    return { valid: false };
  }
}

// ============================================================
// v2.1 (Phase B) — 이미지 다중 / PDF / 댓글 v2 / 도메인 검증 헬퍼
// Design v2.1 §3.5 / §3.6 / §9.2
// ============================================================

// v2.1 student-ux 회귀 fix (2026-04-24): 3 → 5장, 5MB → 15MB 합계, 5MB → 10MB 단일.
// 도메인 상수와 동일 값 유지 — electron 번들이 src/ import 가능하지만 duplicate로
// 직접 의존 없이 IPC 단독 검증.
const REALTIME_WALL_MAX_IMAGES_PER_POST = 5;
const REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES = 15 * 1024 * 1024;
const REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

type ImageValidationReason =
  | 'too-many-images'
  | 'total-too-large'
  | 'too-large'
  | 'invalid-format'
  | 'svg-not-allowed'
  | 'magic-byte-mismatch'
  | 'invalid-data-url';

interface ImagesArrayValidationResult {
  ok: boolean;
  reason?: ImageValidationReason;
  index?: number;
}

function approximateRawBytesFromDataUrl(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  const padding =
    dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.floor((base64Len * 3) / 4) - padding;
}

function decodeBase64HeadServer(dataUrl: string): Buffer | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const head = dataUrl.slice(commaIdx + 1, commaIdx + 1 + 16);
  try {
    return Buffer.from(head, 'base64');
  } catch {
    return null;
  }
}

function matchesImageMagicByteServer(mime: string, head: Buffer): boolean {
  if (head.length < 4) return false;
  if (mime === 'image/png') {
    return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (mime === 'image/gif') {
    return head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
  }
  if (mime === 'image/webp') {
    if (head.length < 12) return false;
    const isRiff = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const isWebp = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

function validateSingleImageServerSide(
  dataUrl: string,
): { ok: true } | { ok: false; reason: ImageValidationReason } {
  const dataUrlMatch = /^data:(image\/[a-z+\-.]+);base64,/i.exec(dataUrl);
  if (!dataUrlMatch || !dataUrlMatch[1]) {
    return { ok: false, reason: 'invalid-data-url' };
  }
  const mime = dataUrlMatch[1].toLowerCase();
  if (mime === 'image/svg+xml' || mime === 'image/svg') {
    return { ok: false, reason: 'svg-not-allowed' };
  }
  if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
    return { ok: false, reason: 'invalid-format' };
  }
  const rawBytes = approximateRawBytesFromDataUrl(dataUrl);
  if (rawBytes > REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  const head = decodeBase64HeadServer(dataUrl);
  if (head === null) {
    return { ok: false, reason: 'invalid-data-url' };
  }
  if (!matchesImageMagicByteServer(mime, head)) {
    return { ok: false, reason: 'magic-byte-mismatch' };
  }
  return { ok: true };
}

/**
 * 이미지 다중 검증 (서버 사이드).
 * - max 3장 (또는 options.max)
 * - 합계 5MB
 * - 각 이미지 magic byte / SVG 차단
 *
 * 도메인 규칙(`validateImages`)과 동일 로직 — electron 번들이 src/ import 못함 (duplicate).
 */
function validateImagesServerSide(
  images: readonly string[],
  options: { max?: number; totalMax?: number } = {},
): ImagesArrayValidationResult {
  const max = options.max ?? REALTIME_WALL_MAX_IMAGES_PER_POST;
  const totalMax = options.totalMax ?? REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES;

  if (images.length > max) {
    return { ok: false, reason: 'too-many-images' };
  }
  let totalBytes = 0;
  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i];
    if (typeof dataUrl !== 'string') {
      return { ok: false, reason: 'invalid-data-url', index: i };
    }
    const single = validateSingleImageServerSide(dataUrl);
    if (!single.ok) {
      return { ok: false, reason: single.reason, index: i };
    }
    totalBytes += approximateRawBytesFromDataUrl(dataUrl);
  }
  if (totalBytes > totalMax) {
    return { ok: false, reason: 'total-too-large' };
  }
  return { ok: true };
}

function translateImageErrorKo(reason?: string): string {
  switch (reason) {
    case 'too-many-images':
      return '이미지는 최대 5장까지 첨부할 수 있어요.';
    case 'total-too-large':
      return '이미지 합계 용량이 너무 커요. (최대 15MB)';
    case 'too-large':
      return '이미지 한 장이 너무 커요. (최대 10MB)';
    case 'svg-not-allowed':
      return 'SVG 이미지는 업로드할 수 없어요.';
    case 'invalid-format':
      return 'PNG / JPEG / GIF / WebP 이미지만 업로드할 수 있어요.';
    case 'magic-byte-mismatch':
      return '올바른 이미지 파일이 아니에요.';
    case 'invalid-data-url':
    default:
      return '이미지를 추가하지 못했어요.';
  }
}

/**
 * v2.1 — 댓글 v2 추가 (이미지 1장 첨부 가능).
 * `addStudentComment` (도메인 규칙) 호출 후 마지막 댓글에 images 부착.
 *
 * 도메인 규칙은 이미지 비포함 — Phase B에서는 댓글 entity의 images 필드만 활용.
 */
function addStudentCommentV2(
  post: RealtimeWallPost,
  input: StudentCommentInput,
  commentId: string,
  now: number,
): RealtimeWallPost {
  const updated = addStudentComment(post, input, commentId, now);
  if (!input.images || input.images.length === 0) return updated;
  const beforeLen = (post.comments ?? []).length;
  const afterLen = (updated.comments ?? []).length;
  if (afterLen === beforeLen) return updated; // 거부됨

  const newComments = (updated.comments ?? []).map((c, idx) =>
    idx === afterLen - 1 ? { ...c, images: input.images } : c,
  );
  return { ...updated, comments: newComments };
}

// ============================================================
// v2.1 (Phase B) — PDF base64 → file:// URL 변환 (Design v2.1 §7.1 / §9.7)
// ============================================================

const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,';
const REALTIME_WALL_MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

interface PersistPdfResult {
  ok: boolean;
  fileUrl?: string;
  filename?: string;
  message?: string;
}

function sanitizePdfFilename(filename: string): string {
  const cleaned = filename.replace(/[^\w가-힣.\-]/g, '_').slice(0, 100);
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

/**
 * v2.1 student-ux 회귀 fix (2026-04-24, Bug 3) — PDF broadcast URL prefix.
 *
 * 학생 카드의 `pdfUrl` 필드는 학생 브라우저가 cloudflared 터널 너머 HTTPS로
 * 직접 다운로드해야 하므로 file:// (로컬 파일 URL) 대신 **HTTP 서버 상대경로**
 * `/pdf/<uuid-filename>`을 사용한다.
 *
 * 학생 페이지가 `https://abc.trycloudflare.com/`에서 서빙되므로 브라우저가
 * `<a href="/pdf/...">`를 자동으로 같은 origin의 절대 URL로 변환 → 정상
 * 다운로드. file://은 (1) cloudflared 너머 학생 브라우저 보안 정책으로 차단,
 * (2) 교사 Electron renderer도 보안 정책으로 차단됐었음.
 */
const PDF_HTTP_PATH_PREFIX = '/pdf/';

function pdfHttpPathForFilename(safeFilename: string): string {
  // safeFilename은 이미 sanitize + UUID prefix 되어 있음.
  // 한글 등 비ASCII 문자는 encodeURIComponent로 escape — 클라이언트가
  // 그대로 fetch해도 같은 path가 path.basename에 의해 복원됨.
  return `${PDF_HTTP_PATH_PREFIX}${encodeURIComponent(safeFilename)}`;
}

/**
 * 학생이 보낸 PDF base64 data URL을 검증 + 임시 디렉토리 저장 + file:// URL 발급.
 *
 * 보안 (Design §9.7):
 *   - magic byte `%PDF-` 검증 (svg/script/exe 거부)
 *   - max 10MB
 *   - 파일명 sanitize (path traversal 방지)
 *   - UUID prefix
 *   - 임시 디렉토리만 사용
 */
async function persistStudentPdfFromDataUrl(
  dataUrl: string,
  filename: string,
): Promise<PersistPdfResult> {
  if (!dataUrl.startsWith(PDF_DATA_URL_PREFIX)) {
    return { ok: false, message: 'PDF 형식이 올바르지 않아요.' };
  }
  const base64 = dataUrl.slice(PDF_DATA_URL_PREFIX.length);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, message: 'PDF 데이터를 읽지 못했어요.' };
  }
  if (bytes.length < PDF_MAGIC_BYTES.length) {
    return { ok: false, message: '올바른 PDF 파일이 아니에요.' };
  }
  if (bytes.length > REALTIME_WALL_MAX_PDF_BYTES) {
    return { ok: false, message: `PDF는 최대 ${REALTIME_WALL_MAX_PDF_BYTES / 1024 / 1024}MB까지 첨부할 수 있어요.` };
  }
  const head = bytes.subarray(0, PDF_MAGIC_BYTES.length);
  if (!head.equals(PDF_MAGIC_BYTES)) {
    return { ok: false, message: '올바른 PDF 파일이 아니에요.' };
  }

  const safeFilename = `${crypto.randomUUID()}-${sanitizePdfFilename(filename)}`;
  const tempDir = path.join(app.getPath('temp'), 'ssampin-realtime-wall-pdf');
  const fullPath = path.join(tempDir, safeFilename);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(fullPath, bytes);
  } catch {
    return { ok: false, message: 'PDF 저장에 실패했어요.' };
  }

  return {
    ok: true,
    // v2.1 student-ux 회귀 fix (Bug 3): file:// X — HTTP 서버 상대경로.
    // 학생 브라우저가 cloudflared 터널 origin 기준 절대 URL로 자동 변환.
    fileUrl: pdfHttpPathForFilename(safeFilename),
    filename: safeFilename,
  };
}

function closeSession(): void {
  if (!session) return;

  closeTunnel();

  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ type: 'closed' }));
      } catch {
        // noop
      }
      client.close();
    }
  }

  session.wss.close();
  session.server.close();
  session = null;
  // rate-limit 버킷도 세션 단위로 초기화 — 다음 세션에 토큰 누적 영향 X
  rateLimitBuckets.clear();
}

function emitConnectionCount(mainWindow: BrowserWindow, current: RealtimeWallSession): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('realtime-wall:connection-count', {
    count: current.clients.size,
  });
}

/**
 * 모든 연결된 학생 클라이언트에 메시지 송신.
 * 개별 client 실패는 swallow — 한 명 때문에 broadcast가 멈추지 않게.
 */
function broadcastToStudents(msg: BroadcastableServerMessage): void {
  if (!session) return;
  const payload = JSON.stringify({ ...msg, sentAt: Date.now() });
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // noop
      }
    }
  }
}

/**
 * lastWallState 캐시 안의 post 1건 갱신 + postsCache 동기화.
 *
 * P2에서 학생 like/comment 처리 시, 교사 renderer를 거치지 않고 서버가 직접
 * post 상태를 갱신해야 다음 join 학생에게 정확한 wall-state를 줄 수 있다.
 */
function updateCachedPost(updated: RealtimeWallPost): void {
  if (!session) return;
  session.postsCache.set(updated.id, updated);
  if (session.lastWallState && session.lastWallState.type === 'wall-state') {
    const board = session.lastWallState.board as { posts?: RealtimeWallPost[] } | null;
    if (board && Array.isArray(board.posts)) {
      const nextPosts = board.posts.map((p) => (p.id === updated.id ? updated : p));
      session.lastWallState = {
        type: 'wall-state',
        board: { ...board, posts: nextPosts },
      };
    }
  }
}

/**
 * lastWallState 캐시에서 단일 post 추출. P2 like/comment 시 starting point.
 */
function getCachedPost(postId: string): RealtimeWallPost | null {
  if (!session) return null;
  const cached = session.postsCache.get(postId);
  if (cached) return cached;
  // 캐시에 없으면 lastWallState에서 찾아 캐시 보강
  if (session.lastWallState && session.lastWallState.type === 'wall-state') {
    const board = session.lastWallState.board as { posts?: RealtimeWallPost[] } | null;
    if (board && Array.isArray(board.posts)) {
      const found = board.posts.find((p) => p.id === postId);
      if (found) {
        session.postsCache.set(postId, found);
        return found;
      }
    }
  }
  return null;
}

/**
 * lastWallState 갱신 시 postsCache 전체 재구성.
 * 교사가 broadcast wall-state 호출 시 호출.
 */
function rebuildPostsCacheFromWallState(msg: BroadcastableServerMessage): void {
  if (!session) return;
  if (msg.type !== 'wall-state') return;
  const board = msg.board as { posts?: RealtimeWallPost[] } | null;
  session.postsCache.clear();
  if (board && Array.isArray(board.posts)) {
    for (const p of board.posts) {
      if (p && typeof p.id === 'string') {
        session.postsCache.set(p.id, p);
      }
    }
  }
}

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'error', message }));
  } catch {
    // noop
  }
}

export function registerRealtimeWallHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'realtime-wall:start',
    async (
      _event,
      args: { title: string; maxTextLength: number },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        closeSession();

        const title = args.title.trim() || '실시간 담벼락';
        const maxTextLength = Math.max(80, Math.min(args.maxTextLength, 1000));
        const html = generateRealtimeWallHTML(title, maxTextLength);

        const server = http.createServer((req, res) => {
          const pathname = req.url?.split('?')[0] ?? '/';

          if (pathname === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
          }

          // v2.1 student-ux 회귀 fix (Bug 3): /pdf/<uuid-filename> 학생 PDF 서빙.
          //
          // 보안:
          //   - decodeURIComponent로 한글 파일명 복원
          //   - path.basename으로 디렉토리 traversal 차단 ("../" 모두 제거됨)
          //   - 임시 디렉토리 (`<userTemp>/ssampin-realtime-wall-pdf/`) 외부는 접근 불가
          //   - Content-Type을 application/pdf로 고정해 학생 브라우저가
          //     `<a download>` 또는 인라인 뷰어로 안전하게 처리
          //   - 파일이 없으면 404 (path traversal 시도 시 동일하게 404)
          if (pathname.startsWith(PDF_HTTP_PATH_PREFIX)) {
            try {
              const requestedNameRaw = pathname.slice(PDF_HTTP_PATH_PREFIX.length);
              if (requestedNameRaw.length === 0) {
                res.writeHead(404);
                res.end('Not Found');
                return;
              }
              let decoded: string;
              try {
                decoded = decodeURIComponent(requestedNameRaw);
              } catch {
                res.writeHead(400);
                res.end('Bad Request');
                return;
              }
              // path traversal 방지: basename으로 디렉토리 부분을 모두 제거.
              const safeBasename = path.basename(decoded);
              if (
                safeBasename.length === 0 ||
                safeBasename === '.' ||
                safeBasename === '..' ||
                safeBasename !== decoded
              ) {
                res.writeHead(404);
                res.end('Not Found');
                return;
              }
              const tempDir = path.join(app.getPath('temp'), 'ssampin-realtime-wall-pdf');
              const target = path.join(tempDir, safeBasename);
              // 추가 방어 — resolve 후 prefix 검사
              const resolved = path.resolve(target);
              const resolvedDir = path.resolve(tempDir);
              if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
                res.writeHead(404);
                res.end('Not Found');
                return;
              }
              if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
                res.writeHead(404);
                res.end('Not Found');
                return;
              }
              const data = fs.readFileSync(resolved);
              // RFC 5987 — 한글 등 비ASCII filename 안전 표기
              const utf8Filename = encodeURIComponent(safeBasename);
              res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Length': String(data.length),
                'Content-Disposition': `inline; filename*=UTF-8''${utf8Filename}`,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
              });
              res.end(data);
            } catch {
              res.writeHead(500);
              res.end('Internal Server Error');
            }
            return;
          }

          // v1.14 P1: 학생 SPA dist-student/index.html 우선 서빙.
          // prod 번들에 dist-student가 포함되면 이 경로가 활성화되고,
          // dev/fallback 환경에서는 기존 legacy HTML로 내려간다.
          if (pathname === '/' || pathname === '/index.html') {
            if (serveStudentIndexHtml(res)) return;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }

          // SPA 정적 자산 (/assets/*.js, /assets/*.css 등)
          if (pathname.startsWith('/assets/')) {
            if (serveStudentAsset(pathname, res)) return;
          }

          // favicon/ico 등 루트 직계 파일도 dist-student에서 시도
          if (pathname.startsWith('/')) {
            if (serveStudentAsset(pathname, res)) return;
          }

          res.writeHead(404);
          res.end('Not Found');
        });

        // v2.1 student-ux 회귀 fix (2026-04-24): maxPayload 20MB.
        // 이미지 합계 15MB(raw) → base64 ~20MB + 메타. ws의 기본 maxPayload(100MiB)도
        // 이론상 통과하나 명시 설정으로 의도 고정 + 너무 큰 첨부는 즉시 거부.
        const wss = new WebSocketServer({
          server,
          maxPayload: 20 * 1024 * 1024,
        });

        session = {
          server,
          wss,
          title,
          maxTextLength,
          submissions: new Map(),
          clients: new Set(),
          lastWallState: null,
          postsCache: new Map(),
          studentFormLocked: false,
        };

        wss.on('connection', (ws: WebSocket) => {
          if (!session) {
            ws.close();
            return;
          }

          session.clients.add(ws);
          emitConnectionCount(mainWindow, session);

          ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
            if (!session) return;

            let parsed: unknown;
            try {
              const raw = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
              parsed = JSON.parse(raw);
            } catch {
              return;
            }

            // Zod 검증 — 외부 입력 신뢰 불가 (Design §9.2/§9.6).
            const result = ClientMessageSchema.safeParse(parsed);
            if (!result.success) {
              sendError(ws, '잘못된 요청입니다.');
              return;
            }
            const msg = result.data;
            const now = Date.now();

            // Rate limit (Design §9.3)
            if (isRateLimited(msg.sessionToken, msg.type, now)) {
              sendError(ws, '너무 빠릅니다. 잠시 후 다시 시도해주세요.');
              return;
            }

            switch (msg.type) {
              case 'join': {
                // v1.14 P1: 패들렛 모드 — already_submitted로 차단하지 않음.
                // 학생은 계속 보드를 읽을 수 있어야 함 (Design §0.1 동일 뷰 원칙).

                if (ws.readyState === WebSocket.OPEN) {
                  // 1) legacy 'wall' 메시지 — 구 HTML 폴백 경로 호환.
                  ws.send(JSON.stringify({
                    type: 'wall',
                    title: session.title,
                    maxTextLength: session.maxTextLength,
                  }));

                  // 2) 패들렛 모드: 캐시된 wall-state 스냅샷 즉시 송신.
                  //
                  // Bug fix (v2.1 student-ux): 교사 broadcast가 1회도 도착 전에
                  // 학생이 join하거나, 교사가 ToolRealtimeWall 페이지를 떠나 broadcast
                  // useEffect가 cleanup된 상태에서 학생이 재접속하면 lastWallState가 null인
                  // 채로 남아 있어 학생 화면이 "담벼락을 불러오는 중이에요"에서 무한 대기.
                  // 빈 wall-state라도 즉시 송신해 최소한 빈 보드 상태로 진입하게 한다.
                  // 이후 교사가 broadcast하면 자연스럽게 갱신.
                  if (session.lastWallState) {
                    try {
                      ws.send(JSON.stringify({ ...session.lastWallState, sentAt: Date.now() }));
                    } catch {
                      // noop
                    }
                  } else {
                    try {
                      const fallbackWallState: BroadcastableServerMessage = {
                        type: 'wall-state',
                        board: {
                          title: session.title,
                          layoutMode: 'kanban',
                          columns: [],
                          posts: [],
                          studentFormLocked: session.studentFormLocked,
                          // v1.16.x — theme 항상 정의 (회귀 #8 mitigation: 학생 첫 페인트 default)
                          settings: {
                            version: 1,
                            moderation: 'off',
                            theme: DEFAULT_WALL_BOARD_THEME,
                          },
                        },
                      };
                      ws.send(JSON.stringify({ ...fallbackWallState, sentAt: Date.now() }));
                    } catch {
                      // noop
                    }
                  }
                }
                return;
              }

              case 'submit': {
                // v1.14 P3 — 패들렛 모드 카드 추가.
                //
                // v1.13 이전의 "1회 제출 전용" 차단(already_submitted) 제거.
                // 학생은 라이브 세션 동안 여러 장의 카드를 자유롭게 올릴 수 있음.
                //
                // v2.1 student-ux 회귀 fix (2026-04-24) — 옵션 A 적용:
                //   기존: 서버는 submission 객체만 만들고, 교사 renderer가 createWallPost로
                //         최종 카드를 생성 → setPosts → broadcast wall-state useEffect.
                //         교사가 ToolRealtimeWall 화면을 떠나면 IPC 수신/broadcast가 모두
                //         정지되어 학생 카드가 영영 보드에 안 나타남 (Bug A).
                //         또한 renderer가 input 객체에서 images/pdf/color/owner/pinHash를
                //         모두 누락한 채 createWallPost를 호출 (Bug B).
                //   수정: 서버가 도메인 createWallPost를 직접 호출 + lastWallState 업데이트
                //         + broadcast wall-state. 교사 renderer는 화면이 마운트된 경우만
                //         소비하며 보조 sync. 교사가 다른 페이지에 있어도 학생들 사이에서
                //         보드가 살아있도록 함 (Plan §7.2 결정 #4 'auto' 기본 정합).
                rwallLog('submit:received', {
                  sessionToken: msg.sessionToken.slice(0, 8) + '...',
                  textLen: msg.text?.length ?? 0,
                  hasImages: Boolean(msg.images?.length),
                  imagesCount: msg.images?.length ?? 0,
                  hasPdf: Boolean(msg.pdfUrl),
                  hasColor: Boolean(msg.color),
                  hasColumnId: Boolean(msg.columnId),
                });

                if (session.studentFormLocked) {
                  sendError(ws, '선생님이 카드 추가를 잠깐 멈췄어요.');
                  return;
                }

                const text = msg.text.trim().slice(0, session.maxTextLength);
                if (text.length === 0) {
                  sendError(ws, '내용을 입력해주세요.');
                  return;
                }

                const link = normalizeLink(msg.linkUrl);
                if (!link.valid) {
                  sendError(ws, '링크는 http 또는 https 주소만 사용할 수 있습니다.');
                  return;
                }

                // v2.1 — 이미지 다중 검증 (max 5 / 합계 15MB / magic byte)
                if (msg.images && msg.images.length > 0) {
                  const imageResult = validateImagesServerSide(msg.images);
                  if (!imageResult.ok) {
                    rwallLog('submit:image-rejected', {
                      reason: imageResult.reason,
                      index: imageResult.index,
                    });
                    sendError(ws, translateImageErrorKo(imageResult.reason));
                    return;
                  }
                }

                // v2.1 — PDF 처리: base64 → magic byte 검증 → file:// URL 발급
                let resolvedPdfUrl: string | undefined;
                let resolvedPdfFilename: string | undefined;
                if (msg.pdfUrl) {
                  // v2.1 student-ux 회귀 fix (Bug 3): 기존 발급된 PDF URL은
                  // /pdf/ 상대경로(신규) 또는 file://(이전 캐시 호환)을 그대로 통과.
                  if (
                    msg.pdfUrl.startsWith(PDF_HTTP_PATH_PREFIX) ||
                    msg.pdfUrl.startsWith('file://')
                  ) {
                    resolvedPdfUrl = msg.pdfUrl;
                    resolvedPdfFilename = msg.pdfFilename;
                  } else if (msg.pdfUrl.startsWith('data:application/pdf;base64,')) {
                    const pdfResult = await persistStudentPdfFromDataUrl(
                      msg.pdfUrl,
                      msg.pdfFilename ?? 'document.pdf',
                    );
                    if (!pdfResult.ok) {
                      rwallLog('submit:pdf-rejected', { message: pdfResult.message });
                      sendError(ws, pdfResult.message);
                      return;
                    }
                    resolvedPdfUrl = pdfResult.fileUrl;
                    resolvedPdfFilename = pdfResult.filename;
                  } else {
                    sendError(ws, 'PDF 형식이 올바르지 않아요.');
                    return;
                  }
                }

                // v2.1 student-ux 회귀 fix — 서버 직접 카드 생성 (옵션 A).
                // lastWallState에서 columns / 기존 posts / settings 복원. 부재 시 안전 default.
                const submissionId = generateSubmissionId();
                const ownerSessionToken = msg.sessionToken;
                const studentPinHashOpt = msg.pinHash;
                const submittedAt = Date.now();

                const currentBoard =
                  session.lastWallState && session.lastWallState.type === 'wall-state'
                    ? (session.lastWallState.board as {
                        title?: string;
                        layoutMode?: string;
                        columns?: readonly RealtimeWallColumn[];
                        posts?: readonly RealtimeWallPost[];
                        studentFormLocked?: boolean;
                        settings?: RealtimeWallBoardSettings;
                      } | null)
                    : null;
                const existingPosts: readonly RealtimeWallPost[] = currentBoard?.posts ?? [];
                const existingColumns: readonly RealtimeWallColumn[] =
                  currentBoard?.columns ?? [];
                const moderation = currentBoard?.settings?.moderation ?? 'off';
                const approvalMode: WallApprovalMode = approvalModeFromModerationMode(moderation);

                // 도메인 createWallPost — pending/approved 상태 + kanban order + freeform position
                // 모두 자동 계산. images/pdf/color/owner/pinHash가 모두 통과되어야 하므로
                // domain RealtimeWallStudentSubmission interface도 v2.1 fix로 확장됨.
                const newPost: RealtimeWallPost = createWallPost(
                  {
                    id: submissionId,
                    nickname: msg.nickname.trim(),
                    text,
                    ...(link.value ? { linkUrl: link.value } : {}),
                    submittedAt,
                    ...(msg.columnId ? { columnId: msg.columnId } : {}),
                    ...(msg.images && msg.images.length > 0 ? { images: msg.images } : {}),
                    ...(resolvedPdfUrl ? { pdfUrl: resolvedPdfUrl } : {}),
                    ...(resolvedPdfFilename ? { pdfFilename: resolvedPdfFilename } : {}),
                    ...(msg.color ? { color: msg.color } : {}),
                    // ownerSessionToken은 ws 세션 토큰을 강제 주입 (위조 방지)
                    ownerSessionToken,
                    ...(studentPinHashOpt ? { studentPinHash: studentPinHashOpt } : {}),
                  },
                  existingPosts,
                  existingColumns,
                  approvalMode,
                );

                // lastWallState 갱신 — 차회 join 학생도 즉시 새 카드 포함된 보드 수신.
                // 교사가 화면을 떠나도 학생 broadcast 흐름 유지.
                //
                // 회귀 위험 #1 정합: lastWallState.board.posts는 학생용 스냅샷이므로
                // 'approved' 상태일 때만 추가. 'pending' 카드는 postsCache에만 보관 →
                // 교사가 후속으로 승인하면 renderer가 createWallPost와 동일 규칙으로
                // wall-state를 다시 broadcast (기존 useEffect 경로).
                if (session.lastWallState && session.lastWallState.type === 'wall-state') {
                  const board = session.lastWallState.board as {
                    posts?: readonly RealtimeWallPost[];
                    [k: string]: unknown;
                  };
                  if (newPost.status === 'approved') {
                    const nextPosts = [...(board.posts ?? []), newPost];
                    session.lastWallState = {
                      type: 'wall-state',
                      board: { ...board, posts: nextPosts },
                    };
                  }
                } else if (newPost.status === 'approved') {
                  // 교사 broadcast가 1회도 없었던 edge case — 최소 빈 보드를 만들고 새 카드만 포함.
                  // v1.16.x — theme도 default 주입 (회귀 #8: 학생 첫 페인트 default 보장).
                  session.lastWallState = {
                    type: 'wall-state',
                    board: {
                      title: session.title,
                      layoutMode: 'kanban',
                      columns: existingColumns,
                      posts: [newPost],
                      studentFormLocked: session.studentFormLocked,
                      settings: {
                        version: 1,
                        moderation,
                        theme: DEFAULT_WALL_BOARD_THEME,
                      },
                    },
                  };
                }
                // postsCache는 status 무관 (승인/수정/이동 핸들러가 모두 참조).
                session.postsCache.set(newPost.id, newPost);

                // 기존 호환: submissions Map (이벤트 로그 용도)
                session.submissions.set(msg.sessionToken, {
                  id: submissionId,
                  nickname: newPost.nickname,
                  text: newPost.text,
                  submittedAt,
                  ...(newPost.linkUrl ? { linkUrl: newPost.linkUrl } : {}),
                  ...(newPost.images ? { images: newPost.images } : {}),
                  ...(newPost.pdfUrl ? { pdfUrl: newPost.pdfUrl } : {}),
                  ...(newPost.pdfFilename ? { pdfFilename: newPost.pdfFilename } : {}),
                  ...(newPost.color ? { color: newPost.color } : {}),
                  ownerSessionToken,
                  ...(studentPinHashOpt ? { studentPinHash: studentPinHashOpt } : {}),
                  ...(msg.columnId ? { columnId: msg.columnId } : {}),
                });

                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'submitted' }));
                }

                // 학생들에게 차분 push — approved 상태일 때만 보임 (회귀 위험 #1 정합).
                // - post-added: useRealtimeWallSyncStore.applyMessage가 board.posts에 append.
                // - pending이면 학생에게는 보이지 않아야 하므로 broadcast 안 함.
                //   (교사가 승인하면 renderer 측 useEffect가 wall-state 재broadcast)
                if (newPost.status === 'approved') {
                  rwallLog('submit:broadcast post-added', {
                    postId: newPost.id,
                    columnId: newPost.kanban.columnId,
                    nickname: newPost.nickname.slice(0, 4),
                  });
                  broadcastToStudents({ type: 'post-added', post: newPost });
                } else {
                  rwallLog('submit:pending (no student broadcast)', { postId: newPost.id });
                }

                // 교사 renderer에 도착 이벤트 통지 — full post 첨부.
                // 마운트된 경우 renderer는 createWallPost를 다시 부르지 않고 이 post를
                // 그대로 setPosts에 merge (id 중복 시 skip).
                if (!mainWindow.isDestroyed()) {
                  rwallLog('submit:notify renderer', { postId: newPost.id });
                  mainWindow.webContents.send('realtime-wall:student-submitted', {
                    post: newPost,
                    totalSubmissions: session.submissions.size,
                  });
                }
                return;
              }

              case 'student-like': {
                // P2 — 학생 좋아요 토글
                const cached = getCachedPost(msg.postId);
                if (!cached) {
                  // 보드에 없는 postId — 무시 (race 또는 invalid)
                  return;
                }
                const updated = toggleStudentLike(cached, msg.sessionToken);
                updateCachedPost(updated);

                broadcastToStudents({
                  type: 'like-toggled',
                  postId: updated.id,
                  likes: updated.likes ?? 0,
                  likedBy: updated.likedBy ?? [],
                });

                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-like', {
                    postId: updated.id,
                    likes: updated.likes ?? 0,
                    likedBy: updated.likedBy ?? [],
                  });
                }
                return;
              }

              case 'student-comment': {
                // P2 — 학생 댓글 추가
                const cached = getCachedPost(msg.postId);
                if (!cached) {
                  return;
                }
                const input: StudentCommentInput = {
                  nickname: msg.nickname,
                  text: msg.text,
                  sessionToken: msg.sessionToken,
                };
                const commentId = generateCommentId();
                const updated = addStudentComment(cached, input, commentId, now);

                // addStudentComment는 실패 시 원본 그대로 반환 — 길이 비교로 판정
                const beforeLen = (cached.comments ?? []).length;
                const afterLen = (updated.comments ?? []).length;
                if (afterLen === beforeLen) {
                  if (beforeLen >= 50) {
                    sendError(ws, '댓글이 가득 찼어요. (최대 50개)');
                  } else {
                    sendError(ws, '댓글을 추가하지 못했어요. 입력을 확인해 주세요.');
                  }
                  return;
                }

                const newComment = (updated.comments ?? [])[afterLen - 1];
                if (!newComment) return;

                updateCachedPost(updated);
                broadcastToStudents({
                  type: 'comment-added',
                  postId: updated.id,
                  comment: newComment,
                });

                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-comment', {
                    postId: updated.id,
                    comment: newComment,
                  });
                }
                return;
              }

              case 'submit-edit': {
                // v2.1 Phase D — 학생 자기 카드 수정
                // 회귀 위험 #4: rate limit 통과 후 처리. 도메인 isOwnCard 양방향 매칭 검증.
                const cached = getCachedPost(msg.postId);
                if (!cached) {
                  sendError(ws, '카드를 찾을 수 없어요.');
                  return;
                }
                // 자기 카드 검증 — sessionToken OR PIN hash 양방향
                const ownerSt = cached.ownerSessionToken;
                const ownerPh = cached.studentPinHash;
                const matchesSession = ownerSt && ownerSt.length > 0 && ownerSt === msg.sessionToken;
                const matchesPin =
                  msg.pinHash && ownerPh && ownerPh.length > 0 && ownerPh === msg.pinHash;
                if (!matchesSession && !matchesPin) {
                  sendError(ws, '본인 카드만 수정할 수 있어요.');
                  return;
                }
                if (cached.status === 'hidden-by-author') {
                  sendError(ws, '이미 삭제된 카드는 수정할 수 없어요.');
                  return;
                }

                // 검증
                if (msg.text !== undefined) {
                  const trimmedText = msg.text.trim();
                  if (
                    trimmedText.length === 0 ||
                    trimmedText.length > session.maxTextLength
                  ) {
                    sendError(ws, '내용을 다시 확인해주세요.');
                    return;
                  }
                }
                let resolvedLink: string | null | undefined = undefined;
                if (msg.linkUrl !== undefined) {
                  if (msg.linkUrl === null || msg.linkUrl.trim().length === 0) {
                    resolvedLink = null;
                  } else {
                    const link = normalizeLink(msg.linkUrl);
                    if (!link.valid) {
                      sendError(ws, '링크는 http 또는 https 주소만 사용할 수 있어요.');
                      return;
                    }
                    resolvedLink = link.value ?? null;
                  }
                }
                if (msg.images !== undefined && msg.images.length > 0) {
                  const imageResult = validateImagesServerSide(msg.images);
                  if (!imageResult.ok) {
                    sendError(ws, translateImageErrorKo(imageResult.reason));
                    return;
                  }
                }
                let resolvedPdfUrl: string | null | undefined = undefined;
                let resolvedPdfFilename: string | null | undefined = undefined;
                if (msg.pdfUrl !== undefined) {
                  if (msg.pdfUrl === null || msg.pdfUrl.trim().length === 0) {
                    resolvedPdfUrl = null;
                    resolvedPdfFilename = null;
                  } else if (
                    msg.pdfUrl.startsWith(PDF_HTTP_PATH_PREFIX) ||
                    msg.pdfUrl.startsWith('file://')
                  ) {
                    // v2.1 student-ux 회귀 fix (Bug 3): /pdf/ 상대경로(신규) 또는
                    // file://(이전 호환)을 그대로 통과. 이미 서버가 발급한 URL.
                    resolvedPdfUrl = msg.pdfUrl;
                    resolvedPdfFilename = msg.pdfFilename ?? cached.pdfFilename ?? null;
                  } else if (msg.pdfUrl.startsWith('data:application/pdf;base64,')) {
                    const pdfResult = await persistStudentPdfFromDataUrl(
                      msg.pdfUrl,
                      msg.pdfFilename ?? 'document.pdf',
                    );
                    if (!pdfResult.ok) {
                      sendError(ws, pdfResult.message);
                      return;
                    }
                    resolvedPdfUrl = pdfResult.fileUrl ?? null;
                    resolvedPdfFilename = pdfResult.filename ?? null;
                  } else {
                    sendError(ws, 'PDF 형식이 올바르지 않아요.');
                    return;
                  }
                }

                // 적용 — 변경된 필드만 patch (회귀 위험 #8 보호 — hard delete X)
                const updated: RealtimeWallPost = { ...cached, edited: true };
                const patch: Record<string, unknown> = { edited: true };

                if (msg.text !== undefined) {
                  const trimmedText = msg.text.trim();
                  Object.assign(updated, { text: trimmedText });
                  patch['text'] = trimmedText;
                }
                if (msg.color !== undefined) {
                  Object.assign(updated, { color: msg.color });
                  patch['color'] = msg.color;
                }
                if (resolvedLink !== undefined) {
                  if (resolvedLink === null) {
                    delete (updated as { linkUrl?: string }).linkUrl;
                    delete (updated as { linkPreview?: unknown }).linkPreview;
                    patch['linkUrl'] = null;
                    patch['linkPreview'] = null;
                  } else {
                    Object.assign(updated, { linkUrl: resolvedLink });
                    patch['linkUrl'] = resolvedLink;
                  }
                }
                if (msg.images !== undefined) {
                  if (msg.images.length === 0) {
                    delete (updated as { images?: readonly string[] }).images;
                    patch['images'] = null;
                  } else {
                    Object.assign(updated, { images: msg.images });
                    patch['images'] = msg.images;
                  }
                }
                if (resolvedPdfUrl !== undefined) {
                  if (resolvedPdfUrl === null) {
                    delete (updated as { pdfUrl?: string }).pdfUrl;
                    delete (updated as { pdfFilename?: string }).pdfFilename;
                    patch['pdfUrl'] = null;
                    patch['pdfFilename'] = null;
                  } else {
                    Object.assign(updated, { pdfUrl: resolvedPdfUrl });
                    patch['pdfUrl'] = resolvedPdfUrl;
                    if (resolvedPdfFilename) {
                      Object.assign(updated, { pdfFilename: resolvedPdfFilename });
                      patch['pdfFilename'] = resolvedPdfFilename;
                    }
                  }
                }

                updateCachedPost(updated);
                broadcastToStudents({
                  type: 'post-updated',
                  postId: msg.postId,
                  patch,
                });
                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-edit', {
                    postId: msg.postId,
                    post: updated,
                  });
                }
                return;
              }

              case 'submit-delete': {
                // v2.1 Phase D — 학생 자기 카드 삭제 (soft delete only)
                // 회귀 위험 #8: posts.filter X — status='hidden-by-author' 갱신만
                const cached = getCachedPost(msg.postId);
                if (!cached) {
                  sendError(ws, '카드를 찾을 수 없어요.');
                  return;
                }
                const ownerSt = cached.ownerSessionToken;
                const ownerPh = cached.studentPinHash;
                const matchesSession = ownerSt && ownerSt.length > 0 && ownerSt === msg.sessionToken;
                const matchesPin =
                  msg.pinHash && ownerPh && ownerPh.length > 0 && ownerPh === msg.pinHash;
                if (!matchesSession && !matchesPin) {
                  sendError(ws, '본인 카드만 삭제할 수 있어요.');
                  return;
                }
                if (cached.status === 'hidden-by-author') {
                  return; // already deleted (idempotent)
                }
                const updated: RealtimeWallPost = {
                  ...cached,
                  status: 'hidden-by-author',
                };
                updateCachedPost(updated);
                broadcastToStudents({
                  type: 'post-updated',
                  postId: msg.postId,
                  patch: { status: 'hidden-by-author' },
                });
                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-delete', {
                    postId: msg.postId,
                  });
                }
                return;
              }

              case 'submit-pin-set': {
                // v2.1 Phase D — PIN 등록 (학생이 SHA-256 hash만 송신)
                // 서버는 hash만 수신하고 본인에게 ack만 (broadcast 없음 — PIPA)
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(
                      JSON.stringify({
                        type: 'pin-verified',
                        ok: true,
                        sentAt: Date.now(),
                      }),
                    );
                  } catch {
                    // noop
                  }
                }
                return;
              }

              case 'submit-pin-verify': {
                // v2.1 Phase D — PIN 검증 (학생이 같은 PC/탭에서 PIN 재입력)
                // 서버는 보드 내 모든 카드의 studentPinHash와 비교 → 매칭 1건이라도 있으면 ok
                let matched = false;
                if (session.lastWallState && session.lastWallState.type === 'wall-state') {
                  const board = session.lastWallState.board as { posts?: RealtimeWallPost[] } | null;
                  if (board && Array.isArray(board.posts)) {
                    for (const p of board.posts) {
                      if (p.studentPinHash && p.studentPinHash === msg.pinHash) {
                        matched = true;
                        break;
                      }
                    }
                  }
                }
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(
                      JSON.stringify({
                        type: matched ? 'pin-verified' : 'pin-mismatch',
                        ok: matched,
                        sentAt: Date.now(),
                      }),
                    );
                  } catch {
                    // noop
                  }
                }
                return;
              }

              case 'update-nickname': {
                // v2.1 Phase D — 교사 닉네임 변경 (단일 또는 일괄)
                // 교사 권한 — sessionToken은 학생 토큰과 다른 식별자(현재 미강제, 향후 teacherToken 도입 시 분리)
                // 학생 측 broadcast: nickname-changed (postIds 일괄)
                const trimmed = msg.newNickname.trim().slice(0, 20);
                if (trimmed.length === 0) {
                  sendError(ws, '닉네임을 입력해 주세요.');
                  return;
                }
                if (!session.lastWallState || session.lastWallState.type !== 'wall-state') {
                  return;
                }
                const board = session.lastWallState.board as { posts?: RealtimeWallPost[] } | null;
                if (!board || !Array.isArray(board.posts)) return;

                const targetIds = new Set<string>();
                for (const p of board.posts) {
                  let match = false;
                  if (msg.postId && p.id === msg.postId) match = true;
                  if (
                    msg.ownerSessionToken &&
                    p.ownerSessionToken &&
                    p.ownerSessionToken === msg.ownerSessionToken
                  ) {
                    match = true;
                  }
                  if (
                    msg.ownerPinHash &&
                    p.studentPinHash &&
                    p.studentPinHash === msg.ownerPinHash
                  ) {
                    match = true;
                  }
                  if (match) targetIds.add(p.id);
                }
                if (targetIds.size === 0) return;

                const nextPosts = board.posts.map((p) =>
                  targetIds.has(p.id) ? { ...p, nickname: trimmed } : p,
                );
                session.lastWallState = {
                  type: 'wall-state',
                  board: { ...board, posts: nextPosts },
                };
                for (const id of targetIds) {
                  const updated = nextPosts.find((p) => p.id === id);
                  if (updated) session.postsCache.set(id, updated);
                }
                broadcastToStudents({
                  type: 'nickname-changed',
                  postIds: Array.from(targetIds),
                  newNickname: trimmed,
                });
                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:nickname-changed', {
                    postIds: Array.from(targetIds),
                    newNickname: trimmed,
                  });
                }
                return;
              }

              case 'submit-comment-v2': {
                // v2.1 — 댓글 v2 (이미지 1장 첨부 가능)
                const cached = getCachedPost(msg.postId);
                if (!cached) return;

                // 이미지 검증 (max 1장)
                if (msg.images && msg.images.length > 0) {
                  const imageResult = validateImagesServerSide(msg.images, { max: 1 });
                  if (!imageResult.ok) {
                    sendError(ws, translateImageErrorKo(imageResult.reason));
                    return;
                  }
                }

                const input: StudentCommentInput = {
                  nickname: msg.nickname,
                  text: msg.text,
                  sessionToken: msg.sessionToken,
                  ...(msg.images && msg.images.length > 0 ? { images: msg.images } : {}),
                };
                const commentId = generateCommentId();
                const updated = addStudentCommentV2(cached, input, commentId, now);

                const beforeLen = (cached.comments ?? []).length;
                const afterLen = (updated.comments ?? []).length;
                if (afterLen === beforeLen) {
                  if (beforeLen >= 50) {
                    sendError(ws, '댓글이 가득 찼어요. (최대 50개)');
                  } else {
                    sendError(ws, '댓글을 추가하지 못했어요. 입력을 확인해 주세요.');
                  }
                  return;
                }

                const newComment = (updated.comments ?? [])[afterLen - 1];
                if (!newComment) return;

                updateCachedPost(updated);
                broadcastToStudents({
                  type: 'comment-added',
                  postId: updated.id,
                  comment: newComment,
                });

                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-comment', {
                    postId: updated.id,
                    comment: newComment,
                  });
                }
                return;
              }

              case 'submit-move': {
                // v2.1 Phase C — 학생 자기 카드 위치 변경 (Design v2.1 §4.2)
                //
                // 검증 흐름:
                //   1. 캐시에서 카드 조회 (없으면 무시)
                //   2. sessionToken OR PIN hash 양방향 매칭 (isOwnCard 동등)
                //   3. status='hidden-by-author' 카드는 이동 불가
                //   4. 좌표 sane 범위는 Zod 스키마에서 이미 검증됨
                //   5. 차분 patch (freeform 또는 kanban) broadcast
                //
                // 회귀 위험 #8 보호: posts.filter X — patch만 broadcast.
                rwallLog('submit-move received', {
                  postId: msg.postId,
                  sessionTokenPrefix: msg.sessionToken
                    ? `${msg.sessionToken.slice(0, 8)}...`
                    : '(missing)',
                  hasPinHash: Boolean(msg.pinHash),
                  hasKanban: Boolean(msg.kanban),
                  hasFreeform: Boolean(msg.freeform),
                });
                const cached = getCachedPost(msg.postId);
                if (!cached) {
                  // not-found: silent (학생 broadcast 도착 전 race 가능)
                  rwallLog('submit-move post-not-found-in-cache', { postId: msg.postId });
                  return;
                }
                const ownerSt = cached.ownerSessionToken;
                const ownerPh = cached.studentPinHash;
                const matchesSession =
                  ownerSt && ownerSt.length > 0 && ownerSt === msg.sessionToken;
                const matchesPin =
                  msg.pinHash && ownerPh && ownerPh.length > 0 && ownerPh === msg.pinHash;
                rwallLog('submit-move owner match check', {
                  postId: msg.postId,
                  matchesSession: Boolean(matchesSession),
                  matchesPin: Boolean(matchesPin),
                  cachedOwnerSessionPrefix: ownerSt
                    ? `${ownerSt.slice(0, 8)}...`
                    : '(missing)',
                  cachedHasPinHash: Boolean(ownerPh),
                });
                if (!matchesSession && !matchesPin) {
                  rwallLog('submit-move REJECTED: owner mismatch', { postId: msg.postId });
                  sendError(ws, '본인 카드만 옮길 수 있어요.');
                  return;
                }
                if (cached.status === 'hidden-by-author') {
                  // 삭제된 카드는 이동 불가 (idempotent — 별도 error 안 보냄)
                  return;
                }

                // 적용 — freeform 또는 kanban 부분만 patch
                const updated: RealtimeWallPost = { ...cached };
                const patch: Record<string, unknown> = {};

                if (msg.freeform) {
                  const nextFreeform = {
                    ...cached.freeform,
                    x: msg.freeform.x,
                    y: msg.freeform.y,
                    w: msg.freeform.w,
                    h: msg.freeform.h,
                    ...(msg.freeform.zIndex !== undefined
                      ? { zIndex: msg.freeform.zIndex }
                      : {}),
                  };
                  Object.assign(updated, { freeform: nextFreeform });
                  patch['freeform'] = nextFreeform;
                }
                if (msg.kanban) {
                  const nextKanban = {
                    ...cached.kanban,
                    columnId: msg.kanban.columnId,
                    order: msg.kanban.order,
                  };
                  Object.assign(updated, { kanban: nextKanban });
                  patch['kanban'] = nextKanban;
                }

                updateCachedPost(updated);
                rwallLog('submit-move broadcast post-updated', {
                  postId: msg.postId,
                  patchKeys: Object.keys(patch),
                });
                broadcastToStudents({
                  type: 'post-updated',
                  postId: msg.postId,
                  patch,
                });
                if (!mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('realtime-wall:student-move', {
                    postId: msg.postId,
                    post: updated,
                  });
                }
                return;
              }

              default: {
                // exhaustive check
                const _exhaustive: never = msg;
                void _exhaustive;
                return;
              }
            }
          });

          ws.on('close', () => {
            if (!session) return;
            session.clients.delete(ws);
            emitConnectionCount(mainWindow, session);
          });
        });

        try {
          server.listen(0, '0.0.0.0', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
              reject(new Error('Failed to get server address'));
              return;
            }

            resolve({
              port: address.port,
              localIPs: [],
            });
          });
        } catch (error) {
          reject(error);
        }
      });
    },
  );

  ipcMain.handle('realtime-wall:stop', (): void => {
    closeSession();
  });

  /**
   * v1.14 P1 — 교사 → 학생 broadcast 채널.
   * renderer에서 posts/columns/layoutMode/title 변경 시 wall-state를 push.
   * Main은 모든 연결된 학생에게 JSON 송신하고, 'wall-state' 타입이면 lastWallState 캐시 갱신
   * + postsCache 재구성.
   */
  ipcMain.handle(
    'realtime-wall:broadcast',
    (_event, msg: BroadcastableServerMessage): void => {
      if (!session) return;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      // v1.16.x (Phase 1, Design §3.5) — boardSettings-changed 페이로드 Zod 검증.
      // 교사 renderer 변조 가정 — settings.theme의 presetId / accent 화이트리스트 통과만 broadcast.
      // 검증 실패 시 broadcast 차단 (학생 화면 깨짐 0).
      if (msg.type === 'boardSettings-changed') {
        const result = RealtimeWallBoardSettingsSchemaIpc.safeParse(
          (msg as { settings?: unknown }).settings,
        );
        if (!result.success) {
          rwallLog('broadcast boardSettings-changed REJECTED: zod failed', {
            error: result.error.errors[0]?.message,
          });
          return;
        }
        // 정규화된 settings로 교체 — 학생 SPA가 신뢰할 수 있는 값만 수신.
        const sanitizedMsg: BroadcastableServerMessage = {
          type: 'boardSettings-changed',
          settings: result.data as RealtimeWallBoardSettings,
        };
        rwallLog('broadcast boardSettings-changed from teacher', {
          hasTheme: result.data.theme !== undefined,
          presetId: result.data.theme?.background.presetId,
          colorScheme: result.data.theme?.colorScheme,
        });
        // lastWallState의 settings도 갱신해 신규 join 학생에게 즉시 동기화.
        if (session.lastWallState && session.lastWallState.type === 'wall-state') {
          const board = session.lastWallState.board as Record<string, unknown> | null;
          if (board) {
            session.lastWallState = {
              type: 'wall-state',
              board: { ...board, settings: result.data },
            };
          }
        }
        broadcastToStudents(sanitizedMsg);
        return;
      }

      // wall-state 메시지는 캐시로 보관 — 신규 join 시 자동 송신.
      if (msg.type === 'wall-state') {
        const board = (msg as { board?: { posts?: unknown[] } }).board;
        rwallLog('broadcast wall-state from teacher', {
          postsCount: Array.isArray(board?.posts) ? board.posts.length : 0,
        });
        session.lastWallState = msg;
        rebuildPostsCacheFromWallState(msg);
      } else {
        rwallLog(`broadcast ${msg.type} from teacher`);
      }

      broadcastToStudents(msg);
    },
  );

  /**
   * v2.1 Phase D — 교사가 placeholder 카드 복원 (status='hidden-by-author' → 'approved').
   *
   * renderer에서 호출 → Main이 broadcast post-updated patch: { status: 'approved' }.
   * 클라이언트 측은 RealtimeWallCard placeholder 분기에서 다시 일반 카드로 복귀.
   */
  ipcMain.handle(
    'realtime-wall:restore-card',
    (_event, args: { postId: string }): void => {
      if (!session) return;
      if (!args || typeof args.postId !== 'string') return;
      const cached = getCachedPost(args.postId);
      if (!cached) return;
      if (cached.status !== 'hidden-by-author') return;
      const updated: RealtimeWallPost = { ...cached, status: 'approved' };
      updateCachedPost(updated);
      broadcastToStudents({
        type: 'post-updated',
        postId: args.postId,
        patch: { status: 'approved' },
      });
    },
  );

  /**
   * v1.14 P2 — 교사가 학생 댓글 삭제 (status='hidden' 전환).
   *
   * renderer에서 호출 → Main이 도메인 규칙 적용 + 캐시 갱신 + broadcast.
   */
  ipcMain.handle(
    'realtime-wall:remove-comment',
    (_event, args: { postId: string; commentId: string }): void => {
      if (!session) return;
      if (!args || typeof args.postId !== 'string' || typeof args.commentId !== 'string') return;
      const cached = getCachedPost(args.postId);
      if (!cached) return;
      const updated = removeStudentComment(cached, args.commentId);
      if (updated === cached) return; // commentId 미존재
      updateCachedPost(updated);
      broadcastToStudents({
        type: 'comment-removed',
        postId: args.postId,
        commentId: args.commentId,
      });
    },
  );

  /**
   * v1.14 P3 — 교사가 학생 카드 추가 잠금 토글.
   *
   * BoardSettingsDrawer에서 호출. 세션 상태를 갱신하고,
   * 모든 연결된 학생에게 `student-form-locked` 메시지를 broadcast.
   * 잠금 상태는 lastWallState 다음 broadcast 시 스냅샷에도 반영되므로
   * 신규 join 학생도 즉시 올바른 FAB 비활성 상태를 받는다.
   */
  ipcMain.handle(
    'realtime-wall:student-form-locked',
    (_event, locked: boolean): void => {
      if (!session) return;
      const nextLocked = Boolean(locked);
      if (session.studentFormLocked === nextLocked) return;
      session.studentFormLocked = nextLocked;
      broadcastToStudents({ type: 'student-form-locked', locked: nextLocked });
    },
  );

  ipcMain.handle('realtime-wall:tunnel-available', (): boolean => {
    return isTunnelAvailable();
  });

  ipcMain.handle('realtime-wall:tunnel-install', async (): Promise<void> => {
    await installTunnel();
  });

  ipcMain.handle('realtime-wall:tunnel-start', async (): Promise<{ tunnelUrl: string }> => {
    if (!session) throw new Error('실시간 담벼락 세션이 없습니다');
    const address = session.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('서버가 준비되지 않았습니다');
    }
    const tunnelUrl = await openTunnel(address.port);
    return { tunnelUrl };
  });
}
