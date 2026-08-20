/**
 * 사진 명렬표 파싱 결과 값객체.
 *
 * 나이스 "사진 명렬표"는 포맷마다 사진의 저장 위치·좌표계가 전혀 다르다
 * (최신 한글 = 표 밖에 떠 있는 개체 + 페이지 절대좌표 / 엑셀 = 셀에 고정된 앵커).
 * 그래서 **좌표계를 파서가 흡수하고**, 도메인에는 `pairKey` 라는 하나의 문자열로만 넘긴다.
 * 같은 pairKey 를 가진 사진과 이름이 같은 학생이다.
 *
 * 이 경계 덕분에 검산 규칙(`photoRosterPairing`)은 포맷을 전혀 몰라도 되고,
 * 새 포맷이 생겨도 규칙은 그대로 쓸 수 있다.
 */

/** 명렬표에서 읽어 낸 학생 이름 1건 */
export interface RosterNameCandidate {
  /** 같은 학생의 사진과 맞물리는 격자 키 (예: 'r7:c12') */
  readonly pairKey: string;
  readonly studentNumber: number;
  readonly name: string;
  /**
   * 학년·반 — **수업반(교과) 명렬표에만 있다.**
   *
   * 담임 명렬표는 한 반이라 이름 칸이 `1번  강나영` 이지만,
   * 수업반은 여러 반 학생이 섞이므로 `3학년 1반 2번  권지민` 처럼 소속이 함께 적힌다.
   * 이 조합(학년-반-번호)이 앱이 수업반 학생을 구분할 때 이미 쓰는 키와 정확히 같다.
   */
  readonly grade?: number;
  readonly classNum?: number;
}

/** 명렬표에서 읽어 낸 사진 1장 */
export interface RosterPhotoCandidate {
  readonly pairKey: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/** 짝짓기가 확정된 학생 1명 */
export interface RosterPairedStudent {
  readonly studentNumber: number;
  readonly name: string;
  readonly photo: RosterPhotoCandidate;
}

/**
 * 자동 짝짓기를 포기한 사유.
 *
 * 베타 사용자가 사유 코드만 알려 줘도 원인이 특정돼야 한다 —
 * 그래서 "실패"라는 뭉뚱그린 코드를 두지 않고 원인별로 나눈다.
 */
export type RosterPairFailureReason =
  /** 사진은 있는데 같은 자리에 이름이 없다 (또는 그 반대) */
  | 'PHOTO_ANCHOR_MISMATCH'
  /** 사진 수와 이름 수가 다르다 */
  | 'PHOTO_COUNT_MISMATCH'
  /** 같은 자리에 사진이 2장 이상이다 */
  | 'PHOTO_DUPLICATE_ANCHOR'
  /** 사진 격자와 이름 격자의 모양(행별 인원)이 다르다 */
  | 'PHOTO_GRID_MISMATCH'
  /** 파일에 그림이 한 장도 없다 (사진 없는 명렬표) */
  | 'NO_PHOTOS';

export const ROSTER_PAIR_FAILURE_MESSAGES: Record<RosterPairFailureReason, string> = {
  PHOTO_ANCHOR_MISMATCH: '사진이 놓인 자리와 이름 자리가 맞지 않아요.',
  PHOTO_COUNT_MISMATCH: '사진 수와 이름 수가 달라요.',
  PHOTO_DUPLICATE_ANCHOR: '같은 자리에 사진이 여러 장 있어요.',
  PHOTO_GRID_MISMATCH: '사진이 놓인 모양과 이름이 놓인 모양이 달라요.',
  NO_PHOTOS: '파일에 사진이 들어 있지 않아요.',
};

/**
 * 짝짓기 결과.
 *
 * 실패해도 이름은 살아 있다 — 사진만 포기하고 이름은 그대로 가져간 뒤
 * 사용자가 직접 사진을 맞춰 주는 보정 화면으로 넘긴다.
 * "사진 못 가져옴"이 아니라 "직접 맞춰 주세요"가 되어야 기능이 죽지 않는다.
 */
export type RosterPairingResult =
  | { readonly ok: true; readonly pairs: readonly RosterPairedStudent[] }
  | {
      readonly ok: false;
      readonly reason: RosterPairFailureReason;
      /** 사람이 읽을 수 있는 상세 (진단용) */
      readonly detail: string;
    };

/** 지원하는(또는 식별만 하는) 명렬표 파일 형식 */
export type RosterFileFormat =
  /** 최신 나이스 한글 — 겉은 .hwp 지만 실체는 평문 XML */
  | 'hwpml'
  /** 최신 나이스 엑셀 */
  | 'xlsx'
  /** 구형 한글 (OLE2 복합문서) — 지원하지 않음 */
  | 'hwp-ole2'
  /** 구형 엑셀 (BIFF8) — 지원하지 않음 */
  | 'xls-biff8'
  /** 한글 표준 압축 포맷 — 지원하지 않음 */
  | 'hwpx'
  /** 무엇인지 알 수 없음 */
  | 'unknown';

/** 이 앱이 실제로 사진까지 읽어 낼 수 있는 형식 */
export const SUPPORTED_ROSTER_FORMATS: readonly RosterFileFormat[] = ['hwpml', 'xlsx'];

export function isSupportedRosterFormat(format: RosterFileFormat): boolean {
  return SUPPORTED_ROSTER_FORMATS.includes(format);
}

/**
 * 지원하지 않는 형식일 때 사용자에게 보여 줄 안내.
 *
 * ⚠️ "열 수 없는 파일입니다"로 끝내면 안 된다 — 무엇을 어떻게 하면 되는지 말해야 한다.
 * 구형 형식 지원 계획이 없으므로(오너 확정) 이 문구가 영구적인 최종 답이다.
 */
export const UNSUPPORTED_ROSTER_GUIDE: Record<
  Exclude<RosterFileFormat, 'hwpml' | 'xlsx'>,
  string
> = {
  'hwp-ole2':
    '예전 방식으로 저장된 한글 파일이에요. 나이스에서 사진 명렬표를 다시 내려받아 주세요. 요즘 나이스에서 받은 파일은 그대로 열립니다.',
  'xls-biff8':
    '예전 방식의 엑셀 파일(.xls)이에요. 나이스에서 사진 명렬표를 한글 또는 최신 엑셀(.xlsx)로 다시 내려받아 주세요.',
  hwpx: '한글 .hwpx 파일은 아직 읽지 못해요. 나이스에서 사진 명렬표를 한글(.hwp) 또는 엑셀(.xlsx)로 다시 내려받아 주세요.',
  unknown:
    '사진 명렬표 파일이 아닌 것 같아요. 나이스에서 내려받은 사진 명렬표(한글 또는 엑셀)를 넣어 주세요.',
};

/** 파일 하나를 읽어 낸 결과 (짝짓기 성공 여부와 무관하게 이름은 항상 들어 있다) */
export interface PhotoRosterParseResult {
  readonly format: RosterFileFormat;
  readonly names: readonly RosterNameCandidate[];
  readonly photos: readonly RosterPhotoCandidate[];
  readonly pairing: RosterPairingResult;
}

/** 파서 호출 결과 — 형식 자체를 지원하지 않으면 파싱을 시도하지 않는다 */
export type PhotoRosterParseOutcome =
  | { readonly ok: true; readonly result: PhotoRosterParseResult }
  | {
      readonly ok: false;
      readonly format: RosterFileFormat;
      /** 사용자에게 그대로 보여 줄 안내 문구 */
      readonly guide: string;
    };
