/**
 * 교실 메모 보드 — Google Drive 읽기 전용 API 래퍼 (plan.md C-3 R1~R3)
 *
 * 비로그인 교실 페이지는 referrer 제한된 공개 API 키만 사용한다.
 * 교사 OAuth 토큰은 이 경로에 절대 존재하지 않는다 (SC-4).
 */

const DRIVE_FILES_BASE = 'https://www.googleapis.com/drive/v3/files';

export const MAX_BOARD_ITEMS = 50;

export type MemoColor = 'yellow' | 'pink' | 'green' | 'blue';
export type MemoFontSize = 'sm' | 'base' | 'lg' | 'xl';

const MEMO_COLORS: readonly MemoColor[] = ['yellow', 'pink', 'green', 'blue'];
const MEMO_FONT_SIZES: readonly MemoFontSize[] = ['sm', 'base', 'lg', 'xl'];

export interface MemoShareItemImage {
  readonly fileId: string;
  readonly width: number;
  readonly height: number;
}

export interface MemoShareItemSnapshot {
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;
  readonly fontSize: MemoFontSize;
  readonly sortOrder: number;
  readonly updatedAt: string;
  readonly image?: MemoShareItemImage;
}

/** 보드 기본 TTS 음성 (src/domain/entities/MemoShareItem.ts `MemoShareTtsVoice` 미러) */
export type MemoTtsVoice = 'default';

/**
 * 교사 → 교실 화면 1회성 주목 신호 (domain `MemoShareAttention` 미러).
 * 페이지는 "처음 보는 nonce"일 때만 1회 재생한다.
 */
export interface MemoAttention {
  /** chime = 알림음만 / tts = 해당 포스트잇 팝업 + 낭독 */
  readonly kind: 'chime' | 'tts';
  /** kind='tts'일 때 낭독 대상 항목 id */
  readonly itemId?: string;
  /** ISO 8601 — 참고용 (판별 키는 nonce) */
  readonly requestedAt: string;
  /** 클릭마다 새로 발급되는 값 — 중복 재생 판별 키 */
  readonly nonce: string;
}

export interface MemoShareBoardFile {
  readonly version: 1;
  readonly title: string;
  readonly updatedAt: string;
  readonly items: readonly MemoShareItemSnapshot[];
  /** 보드 기본 TTS 음성 — 없으면 페이지가 기본 음성을 사용 (하위 호환 optional) */
  readonly ttsVoice?: MemoTtsVoice;
  /** 1회성 주목 신호 — 형식 위반 시 이 필드만 무시하고 보드는 유효 처리 */
  readonly attention?: MemoAttention;
}

export interface BoardMeta {
  readonly version: string;
  readonly modifiedTime: string;
}

/**
 * 오류 분류:
 * - 'gone'        → 404/403: 선생님이 공유를 중지했거나 파일이 삭제됨
 * - 'missing-key' → NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY 미설정 (배포 설정 오류)
 * - 'invalid'     → 응답 JSON이 보드 스키마(version=1)와 불일치
 * - 'network'     → 일시적 네트워크/서버 오류 (백오프 재시도 대상)
 */
export type DriveBoardErrorKind = 'gone' | 'missing-key' | 'invalid' | 'network';

export class DriveBoardError extends Error {
  readonly kind: DriveBoardErrorKind;

  constructor(kind: DriveBoardErrorKind, message: string) {
    super(message);
    this.name = 'DriveBoardError';
    this.kind = kind;
  }
}

export function getDriveApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY;
  if (typeof key !== 'string' || key.trim().length === 0) return null;
  return key.trim();
}

function requireApiKey(): string {
  const key = getDriveApiKey();
  if (key === null) {
    throw new DriveBoardError('missing-key', 'Google Drive 읽기 키가 설정되지 않았습니다.');
  }
  return key;
}

async function driveFetch(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new DriveBoardError('network', '네트워크 요청에 실패했습니다.');
  }
  if (res.status === 403) {
    // 같은 403이라도 "API 키 referrer 차단"은 보드 삭제가 아니라 설정 문제다.
    // (실사례: 키 허용 목록에 www.ssampin.com 누락 → 전 보드가 "공유 중지"로 오표시)
    const body = await res.text().catch(() => '');
    if (/referer|api key|keyInvalid|ipRefererBlocked|API_KEY/i.test(body)) {
      throw new DriveBoardError(
        'missing-key',
        '읽기 키가 이 주소에서 차단되었습니다. (키 허용 목록 확인 필요)',
      );
    }
    throw new DriveBoardError('gone', '보드를 더 이상 읽을 수 없습니다. (공유 중지 또는 삭제)');
  }
  if (res.status === 404) {
    throw new DriveBoardError('gone', '보드를 더 이상 읽을 수 없습니다. (공유 중지 또는 삭제)');
  }
  if (!res.ok) {
    throw new DriveBoardError('network', `Drive 응답 오류 (HTTP ${res.status})`);
  }
  return res;
}

/** R1 — 변경 감지용 메타데이터 (응답 ~100B). version 변화 시에만 본문을 다시 가져온다. */
export async function getBoardMeta(fileId: string): Promise<BoardMeta> {
  const key = requireApiKey();
  const url = `${DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?fields=version%2CmodifiedTime&key=${encodeURIComponent(key)}`;
  const res = await driveFetch(url);

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new DriveBoardError('invalid', '메타데이터 응답을 해석할 수 없습니다.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new DriveBoardError('invalid', '메타데이터 형식이 올바르지 않습니다.');
  }
  const record = raw as Record<string, unknown>;
  const version = record.version;
  const modifiedTime = record.modifiedTime;
  if (typeof version !== 'string' || version.length === 0) {
    throw new DriveBoardError('invalid', '메타데이터에 version이 없습니다.');
  }
  return {
    version,
    modifiedTime: typeof modifiedTime === 'string' ? modifiedTime : '',
  };
}

/** R2 — 보드 본문 JSON. 스키마 검증 실패 시 'invalid' 오류를 던진다. */
export async function getBoardFile(fileId: string): Promise<MemoShareBoardFile> {
  const key = requireApiKey();
  const url = `${DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(key)}`;
  const res = await driveFetch(url);

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new DriveBoardError('invalid', '보드 파일을 해석할 수 없습니다.');
  }

  const board = parseBoardFile(raw);
  if (board === null) {
    throw new DriveBoardError('invalid', '보드 파일이 알 수 없는 형식입니다.');
  }
  return board;
}

/** R3 — 이미지 URL 빌더. `<img src>`로 직접 사용 (CORS 불필요). */
export function buildImageUrl(imageFileId: string): string {
  const key = getDriveApiKey() ?? '';
  return `${DRIVE_FILES_BASE}/${encodeURIComponent(imageFileId)}?alt=media&key=${encodeURIComponent(key)}`;
}

function isMemoColor(value: unknown): value is MemoColor {
  return typeof value === 'string' && (MEMO_COLORS as readonly string[]).includes(value);
}

function isMemoFontSize(value: unknown): value is MemoFontSize {
  return typeof value === 'string' && (MEMO_FONT_SIZES as readonly string[]).includes(value);
}

function parseItemImage(raw: unknown): MemoShareItemImage | null {
  // domain isValidSnapshot의 image 규칙과 동일 — fileId는 빈 문자열도 허용(업로드 전 placeholder)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.fileId !== 'string') return null;
  if (typeof record.width !== 'number' || typeof record.height !== 'number') return null;
  return { fileId: record.fileId, width: record.width, height: record.height };
}

function parseItem(raw: unknown): MemoShareItemSnapshot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (typeof record.content !== 'string') return null;
  if (!isMemoColor(record.color)) return null;
  if (!isMemoFontSize(record.fontSize)) return null;
  if (typeof record.sortOrder !== 'number') return null;
  if (typeof record.updatedAt !== 'string') return null;

  const item: MemoShareItemSnapshot = {
    id: record.id,
    content: record.content,
    color: record.color,
    fontSize: record.fontSize,
    sortOrder: record.sortOrder,
    updatedAt: record.updatedAt,
  };

  if (record.image !== undefined && record.image !== null) {
    const image = parseItemImage(record.image);
    if (image === null) return null;
    return { ...item, image };
  }
  return item;
}

/**
 * 보드 JSON 검증 (plan.md C-2와 동일 규칙: version=1 · 필수 필드 · enum · items≤50).
 * 검증 실패 시 null — 호출 측이 안전한 오류 화면으로 빠진다.
 */
export function parseBoardFile(raw: unknown): MemoShareBoardFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (record.version !== 1) return null;
  if (typeof record.title !== 'string') return null;
  if (typeof record.updatedAt !== 'string') return null;
  if (!Array.isArray(record.items)) return null;
  if (record.items.length > MAX_BOARD_ITEMS) return null;

  const items: MemoShareItemSnapshot[] = [];
  for (const rawItem of record.items) {
    const item = parseItem(rawItem);
    if (item === null) return null;
    items.push(item);
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder);

  // 선택 필드 — 형식이 어긋나면 보드 전체를 거부하지 않고 해당 필드만 무시한다
  // (domain memoShareRules.parseBoardFile과 동일 규칙 — 구버전 페이지/앱 상호 호환)
  const ttsVoice = parseTtsVoice(record.ttsVoice);
  const attention = parseAttention(record.attention);

  return {
    version: 1,
    title: record.title,
    updatedAt: record.updatedAt,
    items,
    ...(ttsVoice ? { ttsVoice } : {}),
    ...(attention ? { attention } : {}),
  };
}

/** 새 값은 'default'만 사용한다. 기존 'male'/'female' 보드는 기본 음성으로 흡수한다. */
function parseTtsVoice(raw: unknown): MemoTtsVoice | undefined {
  if (raw === 'default' || raw === 'male' || raw === 'female') return 'default';
  return undefined;
}

/** 주목 신호 검증 — kind·nonce 필수, tts면 itemId 필수 (domain parseAttention 미러) */
function parseAttention(raw: unknown): MemoAttention | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== 'chime' && kind !== 'tts') return undefined;
  if (typeof record.nonce !== 'string' || record.nonce.length === 0) return undefined;
  if (typeof record.requestedAt !== 'string') return undefined;
  const itemId = record.itemId;
  if (kind === 'tts' && (typeof itemId !== 'string' || itemId.length === 0)) return undefined;
  return {
    kind,
    requestedAt: record.requestedAt,
    nonce: record.nonce,
    ...(typeof itemId === 'string' && itemId.length > 0 ? { itemId } : {}),
  };
}
