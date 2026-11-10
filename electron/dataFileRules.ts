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
 * main.ts의 data:read가 `dataFileRead.ts` 를 거쳐 이 함수를 경유한다
 * (dataFileRules.test.ts가 경유를 grep으로 고정).
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

/**
 * 원본·백업이 함께 깨졌을 때 **비우고 다시 시작해도 되는** 상태 파일.
 *
 * 여기 있는 파일은 내용을 잃어도 다시 만들 수 있다 — `tasks-sync-state` 는 연동 켜짐·고른 목록·
 * 마지막 동기화 시각뿐이고(구글 ID 연결은 `todos` 의 각 할 일에 있다), `drive-sync-device-state` 는
 * 화면에 보이는 "마지막 동기화 시각" 하나다. 이런 파일이 깨지면 `data:read` 가 계속 오류를 던져
 * 그 기능이 알림 없이 꺼진 채 굳는다 — 그래서 깨진 파일을 옆으로 치우고(지우지 않는다) 비운다.
 *
 * ★사용자 자료와, 잃으면 판정이 달라지는 동기화 장부(`calendar-sync`·`calendar-sync-queue`·
 *   `drive-sync-manifest`)는 **절대 넣지 않는다.** 그런 파일을 "없음"으로 돌려주면 저장 경로가
 *   빈 파일로 오인해 기존 자료를 덮어쓴다(QA2 H3). 넣기 전에 "이 파일이 없어져도 다시 만들 수
 *   있는가"를 확인할 것.
 */
const REBUILDABLE_STATE_FILES: ReadonlySet<string> = new Set([
  'tasks-sync-state',
  'drive-sync-device-state',
]);

/** 깨졌을 때 격리하고 비워도 되는 파일인가. 이름이 목록과 정확히 같을 때만 참. */
export function isRebuildableStateFile(filename: string): boolean {
  return REBUILDABLE_STATE_FILES.has(filename);
}

/**
 * 격리한 파일의 이름: `<원래 파일 이름>.corrupt-<시각>`.
 *
 * `.json` 으로 끝나지 않게 한다 — 데이터 폴더의 `*.json` 을 모으는 백업·동기화가 깨진 파일을
 * 자료로 주워 가지 않도록. 시각은 UTC 이고 Windows 파일 이름에 못 쓰는 `:` 을 `-` 로 바꾼다.
 */
export function quarantineFileName(fileName: string, now: Date): string {
  return `${fileName}.corrupt-${now.toISOString().replace(/[:.]/g, '-')}`;
}
