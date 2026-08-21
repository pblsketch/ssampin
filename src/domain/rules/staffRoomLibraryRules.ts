/**
 * 온라인 교무실 — 자료실 규칙 (M3)
 *
 * 계획서: §3.4-다(글자 상한) · §4(미리보기 종류) · §8-C(용량 표시) · §10.6(200MB 상한)
 *
 * 여기 있는 것은 전부 **순수 판정**이다. 파일을 읽거나 네트워크를 타지 않는다.
 * 서버(`supabase/functions/_shared/staffroomLibraryAccess.ts`)에 같은 판정이 한 벌 더 있다 —
 * 화면에서 버튼을 숨기는 것은 방어가 아니기 때문이다. **한쪽만 고치면 어긋나므로 둘을 함께 고칠 것.**
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import {
  STAFFROOM_FILE_MAX_BYTES,
  STAFFROOM_FILE_NAME_MAX_LENGTH,
  STAFFROOM_PREVIEW_MAX_CHARS,
  STAFFROOM_STORAGE_WARN_RATIO,
  type StaffRoomPreviewKind,
  type StaffRoomStorageUsage,
} from '@domain/entities/StaffRoomLibrary';

// ══════════════════════════════════════════════════════════════════
// 1) 미리보기 종류 판정 (§4)
// ══════════════════════════════════════════════════════════════════

/**
 * kordoc 이 글자와 표를 뽑을 수 있는 확장자.
 *
 * 계획서 §4 의 실측 결과다 — 구형 한글(.hwp)은 `cfb`, 신형(.hwpx)은 `jszip` 으로
 * 파이썬·한컴오피스 없이 해독된다. **pptx 는 이 목록에 없다**(구글 뷰어로 간다).
 */
const TEXT_EXTENSIONS = ['hwp', 'hwpx', 'docx', 'xls', 'xlsx', 'pdf'] as const;

/** 그대로 띄우면 되는 그림 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const;

/** kordoc 이 못 읽어 구글 뷰어에 맡기는 것 (§4) */
const VIEWER_EXTENSIONS = ['ppt', 'pptx'] as const;

/** 미니앱과 같은 격리 칸에서 여는 것 (§4.2) */
const HTML_EXTENSIONS = ['html', 'htm'] as const;

/** 파일 이름에서 확장자만 소문자로 뽑는다. 없으면 빈 문자열 */
export function fileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return '';
  return trimmed.slice(dot + 1).toLowerCase();
}

/**
 * 이 파일을 어떻게 보여줄 것인가 (§4).
 *
 * 확장자로 판정한다. MIME 타입은 브라우저마다 제각각이고 한글 파일은 아예
 * `application/octet-stream` 으로 오는 일이 잦아 믿을 수 없다.
 */
export function previewKindOf(fileName: string): StaffRoomPreviewKind {
  const ext = fileExtension(fileName);
  if (!ext) return 'none';
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) return 'text';
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image';
  if ((VIEWER_EXTENSIONS as readonly string[]).includes(ext)) return 'viewer';
  if ((HTML_EXTENSIONS as readonly string[]).includes(ext)) return 'html';
  return 'none';
}

/** 올릴 때 이 파일에서 글자를 뽑아 둘 것인가 — 뽑을 수 있는 종류만 */
export function shouldExtractPreview(fileName: string): boolean {
  return previewKindOf(fileName) === 'text';
}

// ══════════════════════════════════════════════════════════════════
// 2) 올리기 전 검사 (§10.6)
// ══════════════════════════════════════════════════════════════════

/** 검사 결과 — 통과했거나, 한국어 이유와 함께 막혔거나 */
export type UploadCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly message: string };

/** 바이트를 사람이 읽는 단위로 (예: 1.5GB) */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0B';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${units[unit]}`;
}

/**
 * 이 파일을 올려도 되는가.
 *
 * ★ 크기 상한은 **올리기 전에** 막는다(§10.6). 200MB 짜리를 다 올린 뒤에 거절하면
 *   선생님의 인터넷 사용량만 버리고 관리자 드라이브도 잠깐 찼다가 돌아온다.
 */
export function checkUpload(fileName: unknown, size: unknown): UploadCheck {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return { ok: false, message: '파일 이름이 없습니다.' };
  }
  const name = fileName.trim();

  if (name.length > STAFFROOM_FILE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `파일 이름이 너무 깁니다. ${STAFFROOM_FILE_NAME_MAX_LENGTH}자까지 올릴 수 있습니다.`,
    };
  }

  // 경로 구분자가 이름에 섞이면 드라이브에서 엉뚱한 곳을 가리킬 수 있다
  if (name.includes('/') || name.includes('\\')) {
    return { ok: false, message: '파일 이름에 / 나 \\ 는 쓸 수 없습니다.' };
  }

  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return { ok: false, message: '파일 크기를 알 수 없습니다.' };
  }
  if (size === 0) {
    return { ok: false, message: '빈 파일은 올릴 수 없습니다.' };
  }
  if (size > STAFFROOM_FILE_MAX_BYTES) {
    return {
      ok: false,
      message:
        `파일 하나는 ${formatBytes(STAFFROOM_FILE_MAX_BYTES)}까지 올릴 수 있습니다. ` +
        `이 파일은 ${formatBytes(size)}입니다. 나눠서 올리거나 압축해주세요.`,
    };
  }

  return { ok: true, name };
}

// ══════════════════════════════════════════════════════════════════
// 3) 용량 표시와 경고 (§8-C · §10.6)
// ══════════════════════════════════════════════════════════════════

/** 용량 안내 단계 */
export type StorageLevel = 'ok' | 'warn' | 'full';

/** 관리자 드라이브가 얼마나 찼는가 (0~1). 총량을 모르면 0 */
export function storageRatio(usage: StaffRoomStorageUsage): number {
  if (!Number.isFinite(usage.driveLimitBytes) || usage.driveLimitBytes <= 0) return 0;
  return Math.min(1, Math.max(0, usage.driveUsedBytes / usage.driveLimitBytes));
}

/** 지금 어느 단계인가 — 80% 에서 경고, 100% 면 가득 참 */
export function storageLevel(usage: StaffRoomStorageUsage): StorageLevel {
  const ratio = storageRatio(usage);
  if (ratio >= 1) return 'full';
  if (ratio >= STAFFROOM_STORAGE_WARN_RATIO) return 'warn';
  return 'ok';
}

/**
 * 관리자에게 보여줄 용량 안내 문구.
 *
 * ★ 계획서 §10.6 의 못박은 대목 — 승인 절차를 두지 않기로 한 만큼 **안내 문구가
 *   유일한 방어선이다.** "용량이 찹니다" 같은 막연한 말이 아니라 **드라이브가 차면
 *   지메일 수신과 쌤핀 동기화도 함께 멈춘다**는 것까지 분명히 적는다.
 */
export function storageMessage(usage: StaffRoomStorageUsage): string | null {
  const level = storageLevel(usage);
  if (level === 'ok') return null;

  const used = formatBytes(usage.driveUsedBytes);
  const limit = formatBytes(usage.driveLimitBytes);

  if (level === 'full') {
    return (
      `관리자 선생님의 구글 드라이브가 가득 찼습니다(${used} / ${limit}). ` +
      '지금부터 자료실에 파일을 올릴 수 없고, **선생님의 지메일 수신과 쌤핀 동기화도 함께 멈춥니다.** ' +
      '구글 드라이브에서 필요 없는 파일을 정리하거나 용량을 늘려주세요.'
    );
  }

  return (
    `관리자 선생님의 구글 드라이브를 ${Math.round(storageRatio(usage) * 100)}% 썼습니다(${used} / ${limit}). ` +
    '자료실은 이 드라이브를 함께 쓰고 있습니다. ' +
    '드라이브가 가득 차면 자료실뿐 아니라 **선생님의 지메일 수신과 쌤핀 동기화까지 멈추므로** 미리 정리해두시는 편이 좋습니다.'
  );
}

/**
 * 부서를 만들 때 관리자에게 한 번 보여주는 안내 (§10.6).
 * "모르고 당하는 것"과 "감수하고 여는 것"은 다르다.
 */
export const STAFFROOM_STORAGE_NOTICE =
  '자료실에 올라오는 파일은 관리자 선생님의 개인 구글 드라이브(보통 15GB)에 쌓입니다. ' +
  '멤버 선생님들이 올린 파일도 마찬가지입니다. ' +
  '드라이브가 가득 차면 자료실이 멈추는 것은 물론이고 선생님의 지메일 수신과 쌤핀 동기화까지 함께 멈추므로, ' +
  '용량은 관리자 선생님이 직접 살펴주셔야 합니다. 자료실 화면에 지금 쓰고 있는 용량이 항상 보입니다.';

// ══════════════════════════════════════════════════════════════════
// 4) 미리보기 글자 자르기 (§3.4-다)
// ══════════════════════════════════════════════════════════════════

/** 잘라낸 결과 */
export interface TruncatedPreview {
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * 뽑은 글자를 5만 자에서 자른다.
 *
 * 대부분의 학교 문서는 1~2KB 라 여기 걸리지 않는다. 12만 자짜리 생기부 문서 같은
 * 예외만 잘린다 — 부서 하나가 연 300개 파일이어도 글자가 다 합쳐 1.5MB 남짓이어야
 * 각 선생님 PC 에 받아 두기에 부담이 없다.
 */
export function truncatePreview(raw: string): TruncatedPreview {
  if (raw.length <= STAFFROOM_PREVIEW_MAX_CHARS) {
    return { text: raw, truncated: false };
  }
  return { text: raw.slice(0, STAFFROOM_PREVIEW_MAX_CHARS), truncated: true };
}

// ══════════════════════════════════════════════════════════════════
// 5) 검색 (§4.1 · §8-A 부서 전체 검색)
// ══════════════════════════════════════════════════════════════════

/**
 * 검색어 다듬기.
 *
 * ★ 한국어는 조사가 붙어서 일반적인 전문검색 방식이 잘 안 듣는다(§3.4-다).
 *   그래서 낱말을 쪼개 어간을 찾는 대신 **글자 그대로 훑는다.** 받아 둔 글자가
 *   부서당 1.5MB 남짓이라 내 PC 안에서 훑어도 충분히 빠르다.
 *   느려지면 그때 색인을 얹는다 — 급하지 않은 최적화를 미리 하지 않는다.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 검색어가 쓸 만한가 — 한 글자로 찾으면 전부 걸린다 */
export function isSearchable(raw: string): boolean {
  return normalizeQuery(raw).length >= 2;
}

/**
 * 찾은 낱말 주변을 잘라 보여준다.
 *
 * 어디서 걸렸는지 보여주지 않으면 "이 파일 어딘가에 있다"는 것만 알고 끝난다.
 */
export function makeSnippet(text: string, query: string, radius = 40): string {
  const haystack = text.toLowerCase();
  const needle = normalizeQuery(query);
  const at = haystack.indexOf(needle);
  if (at < 0)
    return text
      .slice(0, radius * 2)
      .replace(/\s+/g, ' ')
      .trim();

  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();

  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/** 이 글자 뭉치에 검색어가 들어 있는가 */
export function matchesQuery(text: string, query: string): boolean {
  const needle = normalizeQuery(query);
  if (needle.length === 0) return false;
  return text.toLowerCase().includes(needle);
}

// ══════════════════════════════════════════════════════════════════
// 6) 권한 (서버 판정과 같은 규칙)
// ══════════════════════════════════════════════════════════════════

/** 지메일 비교용 정규화 */
function norm(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 이 파일을 지울 수 있는가 — 올린 사람 본인 또는 관리자.
 * 게시판의 글 지우기와 같은 기준이다(`staffRoomBoardPermission.ts`).
 */
export function canDeleteFile(
  viewerEmail: string,
  viewerRole: 'admin' | 'member',
  uploaderEmail: string,
): boolean {
  if (viewerRole === 'admin') return true;
  return norm(viewerEmail) === norm(uploaderEmail);
}

/**
 * 이 파일에 새 판을 올릴 수 있는가 (§8-C).
 *
 * 지우기와 달리 **멤버 누구나** 할 수 있다. 자료실의 새 버전은 "덮어쓰기"가 아니라
 * "다음 판 붙이기"라 이전 판이 그대로 남고(되돌릴 수 있다), 업무 문서는 보통
 * 처음 올린 사람이 아니라 그때 담당인 사람이 갱신하기 때문이다.
 */
export function canUploadVersion(viewerRole: 'admin' | 'member'): boolean {
  return viewerRole === 'admin' || viewerRole === 'member';
}
