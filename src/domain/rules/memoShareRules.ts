import type { Memo } from '../entities/Memo';
import type { MemoShareBoard } from '../entities/MemoShareBoard';
import type {
  MemoShareAttention,
  MemoShareBoardFile,
  MemoShareItemSnapshot,
  MemoShareTtsVoice,
} from '../entities/MemoShareItem';
import type { MemoShareImageUpload } from '../ports/IMemoShareClient';
import { MEMO_COLORS } from '../valueObjects/MemoColor';
import { MEMO_FONT_SIZES } from '../valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '../valueObjects/MemoImage';

/**
 * 메모 교실 공유 — 순수 비즈니스 규칙 (plan.md v2 B-1).
 *
 * 외부/Node 내장 의존 0 — 해시는 순수 TS(FNV-1a)로 계산한다.
 * 모든 함수는 부수효과 없는 순수 함수.
 */

/** 보드 1개에 담을 수 있는 최대 포스트잇 수 */
export const MAX_ITEMS = 50;

/** 교실 페이지 공유 URL 베이스 */
export const MEMO_SHARE_BASE_URL = 'https://ssampin.com/memo';

/** Drive json fileId → 교실 페이지 공유 URL */
export function buildShareUrl(fileId: string): string {
  return `${MEMO_SHARE_BASE_URL}/${fileId}`;
}

// ============================================================
// dataUrl 분리 헬퍼
// ============================================================

/** dataUrl 분리 결과 — mime + base64 본문 */
export interface DataUrlParts {
  readonly mime: string;
  readonly base64: string;
}

/**
 * `data:image/png;base64,...` 형태의 dataUrl을 mime/base64로 분리한다.
 * 형식이 아니면 null (방어적 — 손상된 이미지 데이터로 크래시 금지).
 */
export function splitDataUrl(dataUrl: string): DataUrlParts | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  if (!mime || !base64) return null;
  return { mime, base64 };
}

// ============================================================
// 해시 (FNV-1a 32bit — 순수 TS, 외부 의존 0)
// ============================================================

/** FNV-1a 32bit 해시 → 8자리 hex 문자열 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 공유 항목 해시 — content+color+fontSize+image(dataUrl) 기반.
 *
 * 형식: `{본문 해시}-{이미지 해시}` (이미지 없으면 '0').
 * 두 파트로 나눠 두면 diffForSync가 "텍스트만 변경"과 "이미지 변경"을
 * 구분해 불필요한 이미지 재업로드를 막을 수 있다.
 *
 * 위치(x/y)·rotation·archived·width/height는 해시에 포함하지 않는다
 * — 포스트잇을 옮기기만 해도 push가 발생하는 일을 막기 위함.
 */
export function computeItemHash(memo: Memo): string {
  // \u0000 구분자 — content에 color/fontSize 문자열이 섞여도 충돌하지 않도록
  const textPart = fnv1a(`${memo.content}\u0000${memo.color}\u0000${memo.fontSize}`);
  const imagePart = memo.image ? fnv1a(memo.image.dataUrl) : '0';
  return `${textPart}-${imagePart}`;
}

/** 해시 문자열에서 이미지 파트만 추출 (없거나 형식 불일치 시 '0') */
function imageHashPart(hash: string): string {
  const idx = hash.indexOf('-');
  return idx >= 0 ? hash.slice(idx + 1) : '0';
}

// ============================================================
// 보드 파일 생성
// ============================================================

/** buildBoardFile의 선택 확장 — 보드 기본 음성 + 1회성 주목 신호 */
export interface BoardFileExtras {
  readonly ttsVoice?: MemoShareTtsVoice;
  readonly attention?: MemoShareAttention;
}

/**
 * 선택된 메모 목록 → Drive 보드 JSON (`MemoShareBoardFile`).
 *
 * - sortOrder는 전달 순서(index)
 * - image.fileId는 빈 문자열 — infra(MemoShareDriveClient)가 업로드 후 치환
 * - 위치(x/y)·rotation·archived는 스냅샷에 포함하지 않음 (공유 대상 아님)
 * - MAX_ITEMS(50) 초과 시 Error
 * - extras.attention은 "이번 업로드 1회"에만 싣는다 — 다음 일반 동기화에서 자연 소멸
 */
export function buildBoardFile(
  memos: readonly Memo[],
  title: string,
  now: string,
  extras?: BoardFileExtras,
): MemoShareBoardFile {
  if (memos.length > MAX_ITEMS) {
    throw new Error(`공유 가능한 포스트잇은 최대 ${MAX_ITEMS}개입니다.`);
  }
  const items: MemoShareItemSnapshot[] = memos.map((memo, index) => ({
    id: memo.id,
    content: memo.content,
    color: memo.color,
    fontSize: memo.fontSize,
    sortOrder: index,
    updatedAt: memo.updatedAt,
    ...(memo.image
      ? {
          image: {
            fileId: '', // infra가 업로드 후 실제 Drive fileId로 치환
            width: memo.image.width,
            height: memo.image.height,
          },
        }
      : {}),
  }));
  return {
    version: 1,
    title,
    updatedAt: now,
    items,
    ...(extras?.ttsVoice ? { ttsVoice: extras.ttsVoice } : {}),
    ...(extras?.attention ? { attention: extras.attention } : {}),
  };
}

/**
 * 이미지가 있는 메모에서 업로드 목록을 추출한다.
 * dataUrl 형식이 깨졌거나 허용 mime이 아니면 해당 항목은 제외(방어적 skip).
 */
export function extractImageUploads(memos: readonly Memo[]): MemoShareImageUpload[] {
  const uploads: MemoShareImageUpload[] = [];
  for (const memo of memos) {
    if (!memo.image) continue;
    const parts = splitDataUrl(memo.image.dataUrl);
    if (!parts || !isAllowedMemoImageMime(parts.mime)) continue;
    uploads.push({ itemId: memo.id, dataUrl: memo.image.dataUrl, mime: parts.mime });
  }
  return uploads;
}

// ============================================================
// 동기화 diff
// ============================================================

/** diffForSync 판정 결과 */
export interface MemoShareSyncDiff {
  /** 신규/교체 업로드해야 할 이미지 목록 */
  readonly imagesToUpload: readonly MemoShareImageUpload[];
  /** Drive에서 삭제해야 할 이미지 fileId 목록 (항목 제거·이미지 제거·이미지 교체) */
  readonly imageFileIdsToDelete: readonly string[];
  /** JSON 재업로드(updateBoard) 필요 여부 — false면 포트 호출 자체를 skip */
  readonly needsJsonUpload: boolean;
}

/**
 * 마지막 동기화 상태(board.items의 lastSyncedHash)와 현재 메모 목록을 비교해
 * 이미지 증분 업로드/삭제 목록과 JSON 재업로드 필요 여부를 판정한다.
 *
 * - 텍스트만 변경: JSON 재업로드만 (이미지 업로드/삭제 없음)
 * - 항목 추가: JSON + (이미지 있으면) 업로드
 * - 항목 제거: JSON + (이미지 있었으면) 삭제
 * - 이미지 교체: JSON + 신규 업로드 + 기존 fileId 삭제
 * - 순서 변경: JSON만
 * - 모두 동일: needsJsonUpload=false (포트 미호출)
 *
 * 위치(x/y)·rotation 변경은 해시에 미포함이므로 자연스럽게 "변경 없음" 처리된다.
 */
export function diffForSync(
  board: MemoShareBoard,
  currentMemos: readonly Memo[],
): MemoShareSyncDiff {
  const linkByMemoId = new Map(board.items.map((link) => [link.memoId, link]));
  const currentIds = new Set(currentMemos.map((memo) => memo.id));

  const imagesToUpload: MemoShareImageUpload[] = [];
  const imageFileIdsToDelete: string[] = [];
  let needsJsonUpload = false;

  currentMemos.forEach((memo, index) => {
    const link = linkByMemoId.get(memo.id);

    if (!link) {
      // 신규 항목
      needsJsonUpload = true;
      imagesToUpload.push(...extractImageUploads([memo]));
      return;
    }

    // 순서 변경도 JSON 재업로드 대상
    if (link.sortOrder !== index) {
      needsJsonUpload = true;
    }

    const nextHash = computeItemHash(memo);
    if (nextHash === link.lastSyncedHash) return; // 변경 없음 — skip

    needsJsonUpload = true;

    // 이미지 파트 해시가 달라졌을 때만 이미지 증분 처리 (텍스트만 변경 → JSON만)
    const imageChanged = imageHashPart(nextHash) !== imageHashPart(link.lastSyncedHash);
    if (!imageChanged) return;

    if (memo.image) {
      imagesToUpload.push(...extractImageUploads([memo]));
    }
    if (link.imageFileId) {
      // 이미지 교체(신규 업로드 + 기존 삭제) 또는 이미지 제거(기존 삭제만)
      imageFileIdsToDelete.push(link.imageFileId);
    }
  });

  // 제거된 항목 — 보드에는 있는데 현재 목록에 없음
  for (const link of board.items) {
    if (currentIds.has(link.memoId)) continue;
    needsJsonUpload = true;
    if (link.imageFileId) {
      imageFileIdsToDelete.push(link.imageFileId);
    }
  }

  return { imagesToUpload, imageFileIdsToDelete, needsJsonUpload };
}

// ============================================================
// 보드 파일 파싱·검증 (Electron·landing 공용 규칙)
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSnapshot(value: unknown): value is MemoShareItemSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value['id'] !== 'string' || value['id'].length === 0) return false;
  if (typeof value['content'] !== 'string') return false;
  if (!(MEMO_COLORS as readonly string[]).includes(value['color'] as string)) return false;
  if (!(MEMO_FONT_SIZES as readonly string[]).includes(value['fontSize'] as string)) return false;
  if (typeof value['sortOrder'] !== 'number') return false;
  if (typeof value['updatedAt'] !== 'string') return false;
  if (value['image'] !== undefined) {
    const image = value['image'];
    if (!isRecord(image)) return false;
    if (typeof image['fileId'] !== 'string') return false;
    if (typeof image['width'] !== 'number') return false;
    if (typeof image['height'] !== 'number') return false;
  }
  return true;
}

/**
 * Drive에서 받은 unknown JSON → `MemoShareBoardFile` 검증 파싱.
 *
 * version=1·필수 필드·enum(color/fontSize)·MAX_ITEMS를 가드하고,
 * 하나라도 어긋나면 null (스키마 드리프트 시 페이지가 안전하게 오류 화면).
 */
export function parseBoardFile(raw: unknown): MemoShareBoardFile | null {
  if (!isRecord(raw)) return null;
  if (raw['version'] !== 1) return null;
  if (typeof raw['title'] !== 'string') return null;
  if (typeof raw['updatedAt'] !== 'string') return null;
  const items = raw['items'];
  if (!Array.isArray(items)) return null;
  if (items.length > MAX_ITEMS) return null;
  if (!items.every(isValidSnapshot)) return null;

  // 선택 필드 — 형식이 어긋나면 보드 전체를 거부하지 않고 해당 필드만 무시한다
  // (구버전 페이지/앱과의 상호 호환: 모르는 필드 때문에 보드가 안 보이면 안 됨)
  const ttsVoice = parseTtsVoice(raw['ttsVoice']);
  const attention = parseAttention(raw['attention']);

  return {
    version: 1,
    title: raw['title'],
    updatedAt: raw['updatedAt'],
    items: items as MemoShareItemSnapshot[],
    ...(ttsVoice ? { ttsVoice } : {}),
    ...(attention ? { attention } : {}),
  };
}

/** 새 값은 'default'만 사용한다. 기존 'male'/'female' 보드는 기본 음성으로 흡수한다. */
function parseTtsVoice(raw: unknown): MemoShareTtsVoice | undefined {
  if (raw === 'default' || raw === 'male' || raw === 'female') return 'default';
  return undefined;
}

/** 주목 신호 검증 — kind·nonce 필수, tts면 itemId 필수 */
function parseAttention(raw: unknown): MemoShareAttention | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = raw['kind'];
  if (kind !== 'chime' && kind !== 'tts') return undefined;
  if (typeof raw['nonce'] !== 'string' || raw['nonce'].length === 0) return undefined;
  if (typeof raw['requestedAt'] !== 'string') return undefined;
  const itemId = raw['itemId'];
  if (kind === 'tts' && (typeof itemId !== 'string' || itemId.length === 0)) return undefined;
  return {
    kind,
    requestedAt: raw['requestedAt'],
    nonce: raw['nonce'],
    ...(typeof itemId === 'string' && itemId.length > 0 ? { itemId } : {}),
  };
}
