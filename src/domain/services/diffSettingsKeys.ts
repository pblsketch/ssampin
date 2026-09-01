/**
 * 설정 저장 시 **무엇이 달라졌는지**를 항목 이름으로만 추려 낸다.
 *
 * ★왜 필요한가 (2026-09-01)
 * 그 전까지 설정 저장 기록에는 "어느 탭에서 저장을 눌렀다"만 남았다. 그래서
 * **실험실 기능(쌤핀 AI·온라인 교무실)을 몇 명이 켰는지 셀 수 없었다.** 저장 버튼을
 * 누른 사람 수는 알아도, 그 사람이 무엇을 켰는지는 알 수 없었다.
 *
 * ★값은 절대 담지 않는다 — 이름만.
 * 설정 안에는 학교명·반 이름·교사 이름·구글 토큰까지 들어 있다. 값을 담기 시작하면
 * 그 순간 통계 테이블이 개인정보 저장소가 된다. 그래서 이 함수는 **키 경로만** 돌려준다.
 *
 * ★한 단계만 파고든다.
 * `widget.opacity` 처럼 한 겹까지는 유용하지만, 더 깊이 들어가면 `periodTimes.3.start`
 * 같은 것이 수십 개씩 쏟아져 통계가 잡음으로 덮인다.
 */

/** 통계 한 건에 담을 최대 항목 수. 넘치면 잘라 낸다 — 통계는 목록이 아니라 신호다. */
const MAX_KEYS = 25;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // 객체·배열은 모양으로 견준다. 설정 값은 JSON 으로 저장되는 자료라 이 비교로 충분하다.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * @param before 저장 전 설정
 * @param after  저장할 설정
 * @returns 달라진 항목 이름들 (`'staffRoomEnabled'`, `'widget.opacity'` 꼴). 정렬됨.
 */
export function diffSettingsKeys(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): string[] {
  const changed: string[] = [];
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const name of names) {
    const a = before[name];
    const b = after[name];
    if (sameValue(a, b)) continue;

    if (isPlainObject(a) && isPlainObject(b)) {
      const inner = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const child of inner) {
        if (!sameValue(a[child], b[child])) changed.push(`${name}.${child}`);
      }
      continue;
    }

    changed.push(name);
  }

  return changed.sort().slice(0, MAX_KEYS);
}
