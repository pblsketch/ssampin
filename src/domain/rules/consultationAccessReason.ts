/**
 * 상담·설문 접근 거부 사유 (ADR-095)
 *
 * 명단 조회의 신분증이 관리 키에서 구글 계정 확인으로 바뀌면서, 거부가 일상적으로
 * 생긴다. 이 파일은 **그 사유를 무엇이라 부르고 화면에 뭐라고 쓸지**만 정한다 —
 * 서버와 통신하는 방법은 모른다(그래서 domain 에 둔다).
 *
 * 서버 쪽 같은 이름표는 `supabase/functions/_shared/consultationAccess.ts` 에 있다.
 * 두 곳의 값이 어긋나면 화면이 사유를 못 알아본다.
 */

/** 거부 사유 — 화면 문구를 고르는 열쇠 */
export type ConsultationDenialReason =
  /** 구글 계정 확인이 안 됐다(토큰 없음·만료·다른 앱 토큰) */
  | 'not_connected'
  /** 확인은 됐는데 이 일정을 만든 계정이 아니다 */
  | 'different_account'
  /** 소유자가 없는 옛 일정인데 유예 기한이 지났다 */
  | 'legacy_closed'
  /** 소유자가 없는 옛 일정인데 관리 키가 틀리다 */
  | 'key_mismatch'
  /** 소유자가 정해진 일정을 옛 경로로 열려 했다 — 마이그레이션 071 이 hint 로 알려 준다 */
  | 'owner_bound';

/** 사유가 붙은 접근 거부 */
export class ConsultationAccessError extends Error {
  constructor(
    readonly reason: ConsultationDenialReason,
    message: string,
  ) {
    super(message);
    this.name = 'ConsultationAccessError';
  }
}

/**
 * 사유별 안내 문구.
 *
 * "실패했습니다"로 끝내지 않고 **무엇을 하면 되는지**까지 적는다. 다음 세 가지를
 * 디자인 검토(2026-09-09)에서 고쳤다.
 *
 * 1. `owner_bound` 의 "그 기기도 업데이트하세요"는 **반대로 읽혔다.** 이 거부를 받는
 *    쪽은 옛 경로로 물어본 그 기기 자신인데, 문장은 "다른 어딘가의 기기"를 가리키는
 *    것처럼 보여 엉뚱한 기기를 만지게 된다. "이 기기"로 못 박는다.
 * 2. `legacy_closed` 에 "사본으로 확인해 주세요"를 적었더니, 사본이 없는 기기에서는
 *    가리키는 대상이 없는 막다른 안내가 됐다. 사본이 있으면 화면이 알아서 펴 주므로
 *    "있으면 아래에 보인다"로 바꿨다.
 * 3. `different_account` 만 설정 위치를 안 짚어 줘서, 같은 종류의 문제인데 한쪽만
 *    친절했다. 위치를 똑같이 적는다.
 */
export const CONSULTATION_DENIAL_TEXT: Record<ConsultationDenialReason, string> = {
  not_connected:
    '구글 계정 연결이 필요합니다. 설정 > 구글 연결에서 계정을 연결한 뒤 다시 열어 주세요.',
  different_account:
    '이 일정을 만든 계정과 같은 구글 계정으로 연결해 주세요. 설정 > 구글 연결에서 계정을 바꿀 수 있습니다.',
  legacy_closed:
    '이 일정을 예전 방식으로 여는 기간이 끝났습니다. 이 기기에 받아 둔 사본이 있으면 아래에 표시됩니다.',
  key_mismatch: '관리 키가 일치하지 않습니다. 이 일정·설문을 만든 기기에서 다시 시도해 주세요.',
  owner_bound:
    '이 일정은 만든 선생님의 구글 계정으로 열립니다. 이 화면이 계속 뜬다면 이 기기의 쌤핀을 최신 버전으로 업데이트한 뒤 다시 열어 주세요.',
};

const REASONS = Object.keys(CONSULTATION_DENIAL_TEXT) as ConsultationDenialReason[];

/**
 * 서버 응답 본문에서 사유를 찾는다.
 *
 * 두 자리를 본다 — 엣지 함수는 `{ reason }` 으로, 마이그레이션 071 이 고친 옛 RPC 는
 * PostgREST 의 `{ hint }` 로 알려 준다. 한국어 문구를 문자열로 비교하지 않는 이유는
 * 문구를 다듬을 때마다 판별이 조용히 깨지기 때문이다.
 */
export function readDenialReason(body: string | undefined): ConsultationDenialReason | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown; hint?: unknown };
    for (const candidate of [parsed.reason, parsed.hint]) {
      if (typeof candidate === 'string' && (REASONS as string[]).includes(candidate)) {
        return candidate as ConsultationDenialReason;
      }
    }
  } catch {
    // JSON 이 아니면 사유가 없는 것이다
  }
  return null;
}

/** 화면에서 사유별 안내를 고를 때 쓴다. 사유가 없으면 null. */
export function accessDenialReasonOf(e: unknown): ConsultationDenialReason | null {
  return e instanceof ConsultationAccessError ? e.reason : null;
}

/**
 * 실패를 화면에 쓸 한 문장으로 바꾼다.
 *
 * 사유가 있으면 사유별 안내를, 없으면 원래 메시지를 그대로 쓴다. 화면이 "빈 명단"이
 * 아니라 **무엇이 잘못됐고 무엇을 하면 되는지**를 말하게 하려는 것이다(수용 기준 #5).
 */
export function describeAccessFailure(e: unknown): string {
  const reason = accessDenialReasonOf(e);
  if (reason) return CONSULTATION_DENIAL_TEXT[reason];
  return e instanceof Error && e.message
    ? e.message
    : '명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
