/**
 * 학기 시작·끝 날짜를 **사람이 손으로 넣을 때** 걸러야 하는 것들.
 *
 * 두 날짜는 서로 다른 화면에서 들어온다 — 개학일은 설정과 8월 팝업에서, 마지막 수업일은 설정과
 * 진도 화면 팝업에서. 판단을 화면마다 적으면 한쪽에서만 막히고 다른 쪽으로는 그대로 들어간다.
 * 그래서 "무엇이 잘못된 입력인가"는 여기 한 곳에만 둔다.
 *
 * ⚠️ 이건 ADR-037이 금지한 "앱이 학사 구간을 단정하는 것"이 아니다. 날짜를 **지어내지 않고**,
 * 사용자가 준 두 값이 서로 앞뒤가 맞는지만 본다.
 */

/**
 * 끝이 시작보다 앞서는가 — 둘 다 있을 때만 판단한다.
 *
 * 이 조합이 저장되면 진도 화면이 계산을 포기하는 상태(`invalidTerm`)가 된다. 숫자가 조금
 * 어긋나는 정도가 아니라 화면이 아예 숫자를 못 내므로, 저장 전에 막는 쪽이 낫다.
 */
export function isEndBeforeStart(startIso: string, endIso: string): boolean {
  if (startIso === '' || endIso === '') return false;
  return endIso < startIso;
}

/**
 * 그 학년도 범위(3월 1일 ~ 다음 해 2월 말) 밖의 날짜인가. 빈 값은 잘못된 입력이 아니다.
 *
 * 막지는 않고 알려만 준다 — 학년도 경계에 걸친 학사 운영을 앱이 다 알 수 없으므로, 사용자가
 * 알고도 그렇게 넣는 경우까지 가로막지는 않는다.
 */
export function isOutsideSchoolYear(iso: string, schoolYear: number): boolean {
  if (iso === '') return false;
  return iso < `${schoolYear}-03-01` || iso > `${schoolYear + 1}-02-29`;
}
