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
 * 서버가 권한 오류를 돌려준 경우에 한해, 사용자가 이해할 수 있는 문구로 throw 한다.
 * 그 밖의 실패는 이 함수가 관여하지 않는다(호출부의 기존 처리에 맡긴다).
 */
export function throwIfPermissionError(status: number, context: string): void {
  if (!isPermissionStatus(status)) return;

  throw new Error(
    `${context}을(를) 불러올 권한이 없습니다. 쌤핀을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요. ` +
      `(설정 > 앱 정보에서 업데이트를 확인할 수 있습니다)`,
  );
}

/** 이 오류가 위 안내 문구인지 판별 — 화면에서 업데이트 배너를 띄울 때 쓴다. */
export function isUpdateRequiredError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('최신 버전으로 업데이트');
}
