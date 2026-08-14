/**
 * Supabase 응답의 권한 오류(401/403)를 "앱 업데이트 안내"로 바꿔주는 공통 장치.
 *
 * 왜 필요한가 (2026-08-14, 계획서 P0-3):
 *   상담 예약·설문 응답 테이블은 학생·학부모 화면뿐 아니라 **교사 데스크톱 앱도
 *   같은 anon 키로 직접 읽는다.** 보안 정리를 위해 서버에서 이 테이블의 익명
 *   SELECT 권한을 회수하면, 아직 업데이트하지 않은 버전은 401/403 을 받는다.
 *
 *   이때 화면이 "예약 없음" 같은 **빈 상태로 보이면 최악**이다. 선생님은 자료가
 *   사라졌다고 판단한다(설문 쪽에는 2026-05-14 실제 신고 사례가 주석으로 남아 있다).
 *   그래서 권한 오류만큼은 빈 값으로 삼키지 않고, 무엇을 해야 하는지 알려준다.
 */

/** 권한 오류로 판단되는 HTTP 상태 */
function isPermissionStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * 관리 키 불일치 RPC 응답의 표식.
 *
 * 마이그레이션 046 의 교사용 RPC 는 admin_key 가 틀리면
 * ERRCODE 42501 로 예외를 던지고, PostgREST 는 이를 **401** 로 내려준다
 * (046 주석엔 403 이라 적었으나 실측은 401).
 *
 * 401 이라는 이유만으로 "앱을 업데이트하세요"라고 안내하면 엉뚱한 처방이 된다.
 * 그래서 본문의 사유 문구까지 보고 두 경우를 갈라낸다.
 */
const ADMIN_KEY_MISMATCH_MARK = '관리 키가 일치하지 않습니다';

/**
 * 서버가 권한 오류를 돌려준 경우에 한해, 사용자가 이해할 수 있는 문구로 throw 한다.
 * 그 밖의 실패는 이 함수가 관여하지 않는다(호출부의 기존 처리에 맡긴다).
 *
 * @param body 응답 본문(있으면 관리 키 불일치와 권한 회수를 구분하는 데 쓴다)
 */
export function throwIfPermissionError(status: number, context: string, body?: string): void {
  if (!isPermissionStatus(status)) return;

  // 관리 키 불일치 — 업데이트해도 해결되지 않는다. 서버가 준 사유를 그대로 전한다.
  if (body && body.includes(ADMIN_KEY_MISMATCH_MARK)) {
    throw new Error(
      `${context}을(를) 불러오지 못했습니다. ${ADMIN_KEY_MISMATCH_MARK}. ` +
        `이 일정·설문을 만든 기기에서 다시 시도해 주세요.`,
    );
  }

  throw new Error(
    `${context}을(를) 불러올 권한이 없습니다. 쌤핀을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요. ` +
      `(설정 > 앱 정보에서 업데이트를 확인할 수 있습니다)`,
  );
}

/** 이 오류가 위 안내 문구인지 판별 — 화면에서 업데이트 배너를 띄울 때 쓴다. */
export function isUpdateRequiredError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('최신 버전으로 업데이트');
}
