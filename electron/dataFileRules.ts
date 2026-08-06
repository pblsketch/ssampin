/**
 * data:read 손상 판정 규칙 (F7a — QA-A RB1 구조 수정).
 *
 * 배경: 기존 `raw.length < 5` 휴리스틱은 유효한 빈 구조값(`[]` 2바이트, `{}` 2바이트)까지
 * "손상"으로 오판해 .backup.json에서 옛 데이터를 부활시켰다. 이 오탐 때문에
 * 학년도 전환(S2.4)이 배열 루트 파일(students 등)을 "빈 값 쓰기"로 리셋하지 못하고
 * remove에 의존했고, 그 결과 리모트가 옛 명렬을 영원히 실어날랐다(qa3-D 계열의 근본 원인).
 *
 * 정밀화: 5바이트 미만이라도 **JSON.parse가 성공하고 결과가 구조값(배열/객체)**이면
 * 정상 데이터로 취급한다(치유 안 함). 파스 실패·원시값(숫자/문자열/불리언/null)은
 * 기존대로 손상 취급 — 데이터 파일 루트는 항상 구조값이고, 대형 JSON의 절단이
 * 유효 JSON 구조값이 되는 경우는 사실상 없다(오탐만 제거, 미탐 증가 없음).
 *
 * electron 모듈 import 없음 — vitest 단위 테스트 가능(archiveManager 선례).
 * main.ts의 data:read가 이 함수를 경유한다(dataFileRules.test.ts가 경유를 grep으로 고정).
 */

/** 짧은 파일(5바이트 미만)이 손상인지 판정. 5바이트 이상은 이 규칙의 대상이 아니다(false). */
export function isCorruptShortDataFile(raw: string): boolean {
  if (raw.length >= 5) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    // 구조값(배열/객체)이면 정상 — `[]`·`{}`·`[1]` 등. 원시값(null 포함)은 손상 취급.
    return parsed === null || typeof parsed !== 'object';
  } catch {
    return true; // 파스 실패(`{"` 등 절단 잔재) — 기존 치유 유지
  }
}
