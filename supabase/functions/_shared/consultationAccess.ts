/**
 * 상담·설문 교사 접근 판정 — 순수 함수만 (ADR-095, 계획서 §6 S2)
 *
 * 왜 별도 모듈인가: `supabase/functions/**` 는 vitest·tsc 대상이 아니다. 판정 로직을
 * index.ts 안에 두면 **테스트가 한 줄도 돌지 않는다.** 순수 함수만 여기 모아 두고
 * `src/infrastructure/supabase/__tests__/` 에서 상대경로로 불러 검증한다
 * (온라인 교무실의 `_shared/staffroomAccess.ts` 선례와 같은 방식).
 *
 * 판정에 쓰는 "지금"은 **반드시 인자로 받는다.** 함수 안에서 Date.now() 를 부르면
 * 기한 판정을 테스트할 방법이 사라진다(기기 시계를 돌리는 것은 서버 시각 판정에서
 * 아무 의미가 없다).
 */

/** 거부 사유 — 화면 문구는 앱이 이 코드로 고른다 */
export type DenialReason =
  /** 구글 계정 확인이 안 됐다(토큰 없음·만료·다른 앱 토큰) */
  | 'not_connected'
  /** 확인은 됐는데 이 일정을 만든 계정이 아니다 */
  | 'different_account'
  /** 소유자가 없는 옛 일정인데 유예 기한이 지났다 */
  | 'legacy_closed'
  /** 소유자가 없는 옛 일정인데 관리 키가 틀리다 */
  | 'key_mismatch';

/** 판정에 필요한 행 정보만 추린 것 */
export interface OwnedRow {
  /** 서버가 검증해 박은 소유자 이메일. null 이면 소유자 미정 */
  readonly ownerEmail: string | null;
  /** 이 일정·설문의 관리 키 */
  readonly adminKey: string;
  /** 유예 만료일 'YYYY-MM-DD'. null 이면 전역 기한만 적용한다 */
  readonly legacyGraceUntil: string | null;
}

export type AccessDecision =
  | { readonly ok: true; readonly mode: 'owner' | 'legacy' }
  | { readonly ok: false; readonly reason: DenialReason };

/** 지메일 정규화 — 비교는 항상 이 함수를 거친다 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 실제로 적용되는 유예 만료일.
 *
 * 행에 박힌 값과 전역 기한 중 **이른 쪽**이다. 행 값이 비어 있으면 전역 기한만 쓴다
 * (072 전까지는 구버전 앱이 소유자 없는 일정을 계속 만들 수 있는데, 그 행은 유예일이
 * 빈 채로 들어올 수 있다 — 그때 "기한 없음"이 되면 안 된다).
 */
export function effectiveGraceUntil(rowValue: string | null, globalDeadline: string): string {
  if (!rowValue) return globalDeadline;
  return rowValue < globalDeadline ? rowValue : globalDeadline;
}

/**
 * 서버 시각을 'YYYY-MM-DD' 로 — 판정은 날짜 단위다.
 *
 * 한국 시간(UTC+9)으로 환산한 뒤 자른다. 기한에 박히는 날짜는 "11월 30일"처럼 한국
 * 학교 달력의 날짜라, UTC 로 자르면 한국의 자정부터 오전 9시까지 아홉 시간 동안
 * 하루 전 날짜로 판정된다(기한 마지막 날 아침에 조용히 하루 더 열리는 셈이다).
 */
export function toDateKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 유예 만료일 계산 — 마이그레이션 071 의 SQL 과 **같은 공식**이다.
 *
 *   min(전역 기한, 마지막 상담일 + 30일),  날짜를 모르면 전역 기한만
 *
 * 071 은 이 값을 한 번 계산해 칸에 박아 둔다(스냅샷). 여기 둔 것은 그 공식이
 * 무엇인지 테스트로 못 박기 위해서다. 조회할 때마다 다시 세지 않는다 — 그러면
 * 먼 미래 시간대를 하나 끼워 넣는 것만으로 기한이 밀린다.
 */
export function computeGraceUntil(
  lastConsultationDate: string | null,
  globalDeadline: string,
): string {
  if (!lastConsultationDate) return globalDeadline;
  const d = new Date(`${lastConsultationDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  const perSchedule = d.toISOString().slice(0, 10);
  return perSchedule < globalDeadline ? perSchedule : globalDeadline;
}

/**
 * 명단 조회 판정.
 *
 * @param identityEmail 구글이 확인해 준 이메일. **null 은 "확인 실패"** 이고,
 *                      토큰이 없을 때·만료됐을 때·다른 앱 토큰일 때를 모두 포함한다.
 */
export function decideReadAccess(params: {
  readonly row: OwnedRow;
  readonly identityEmail: string | null;
  readonly providedAdminKey: string | null;
  readonly now: Date;
  readonly globalDeadline: string;
}): AccessDecision {
  const { row, identityEmail, providedAdminKey, now, globalDeadline } = params;

  // 1) 구글 확인이 먼저다.
  //
  //    ★ 이 한 줄이 "링크만 가진 사람은 새 문으로 못 들어온다"를 만든다. 학부모
  //      브라우저는 쌤핀 구글 토큰을 만들 수 없으므로, 관리 키를 알아도 여기서 멈춘다.
  //      유예 경로(아래 3번)에도 예외를 두지 않는 이유가 이것이다.
  if (!identityEmail) return { ok: false, reason: 'not_connected' };

  const viewer = normalizeEmail(identityEmail);

  // 2) 소유자가 정해진 일정 — 그 계정만.
  if (row.ownerEmail) {
    return normalizeEmail(row.ownerEmail) === viewer
      ? { ok: true, mode: 'owner' }
      : { ok: false, reason: 'different_account' };
  }

  // 3) 소유자가 없는 옛 일정 — 기한 안에서, 관리 키가 맞으면.
  //
  //    ★ 기한을 키보다 **먼저** 본다. 기한이 지나면 이 문은 통째로 닫힌 것이라,
  //      키가 맞았는지 틀렸는지는 더 이상 의미가 없다. 순서를 뒤집으면 기한이 지난
  //      뒤에도 "키는 맞다/틀리다"를 알려 주게 되고, 안내 문구도 엉뚱해진다.
  if (toDateKey(now) > effectiveGraceUntil(row.legacyGraceUntil, globalDeadline)) {
    return { ok: false, reason: 'legacy_closed' };
  }
  if (!providedAdminKey || providedAdminKey !== row.adminKey) {
    return { ok: false, reason: 'key_mismatch' };
  }
  return { ok: true, mode: 'legacy' };
}

/**
 * 수정 판정 — 조회와 **같은 규칙**을 쓴다.
 *
 * 처음에는 "수정은 소유자만"으로 좁히려 했다가 되돌렸다. 그러면 소유자가 없는 옛
 * 일정을 앱이 새 문으로만 부르게 되는 S4 이후에 **선생님이 자기 옛 일정을 마감도
 * 보관도 못 하게 된다.** 옛 일정은 지금 운영에 200건 넘게 있다.
 *
 * 유예 경로를 열어도 지금보다 약해지지 않는다 — 오늘 이 수정 경로에는 신원 확인이
 * 아예 없고(앱이 anon 권한으로 표를 직접 고친다), 새 문은 최소한 **구글 확인을
 * 통과한 사람**만 들여보낸다. 옛 문을 닫는 것은 072 몫이다.
 */
export function decideWriteAccess(params: {
  readonly row: OwnedRow;
  readonly identityEmail: string | null;
  readonly providedAdminKey: string | null;
  readonly now: Date;
  readonly globalDeadline: string;
}): AccessDecision {
  return decideReadAccess(params);
}
