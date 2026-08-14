/**
 * 메모 편집 상태 목록 미러 테스트.
 *
 * `electron/main.ts`의 `MEMO_EDITOR_ACTIVITIES`는 `src/domain/entities/SidePinRuntimeState.ts`의
 * `MemoEditorActivity`를 복제한 것이다. main은 화면이 보내온 값을 이 목록으로 걸러
 * 모르는 값은 버린다 — 그래서 **한쪽만 늘리면 그 상태가 조용히 무시된다.**
 *
 * 무시되면 무슨 일이 벌어지는지가 중요하다. 이 신호는 "지금 메모를 쓰는 중이니 접지 말라"는
 * 뜻이다. 값이 걸러져 버려지면 **타이핑하는 도중 패널이 접혀 쓰던 글이 사라진다.**
 * 화면에는 아무 오류도 뜨지 않으므로 사람이 알아채기 어렵다.
 *
 * `npx tsc --noEmit`은 `electron/`을 검사하지 않아(tsconfig `include: ["src"]`) 타입으로는
 * 못 막는다. 그래서 양쪽 **소스를 읽어 목록을 뽑아** 비교한다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

/** main.ts의 `const MEMO_EDITOR_ACTIVITIES = [...] as const;` 에서 값을 뽑는다 */
function readElectronActivities(): string[] {
  const src = readFileSync(resolve(REPO_ROOT, 'electron/main.ts'), 'utf-8');
  const m = src.match(/const MEMO_EDITOR_ACTIVITIES = \[([^\]]*)\] as const;/);
  if (m?.[1] === undefined) throw new Error('main.ts에서 MEMO_EDITOR_ACTIVITIES를 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

/** SidePinRuntimeState.ts의 `export type MemoEditorActivity = 'a' | 'b' | ...` 에서 값을 뽑는다 */
function readDomainActivities(): string[] {
  const src = readFileSync(
    resolve(REPO_ROOT, 'src/domain/entities/SidePinRuntimeState.ts'),
    'utf-8',
  );
  const m = src.match(/export type MemoEditorActivity =\s*([^;]+);/);
  if (m?.[1] === undefined)
    throw new Error('SidePinRuntimeState.ts에서 MemoEditorActivity를 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

describe('메모 편집 상태 — 도메인과 electron 미러', () => {
  test('두 목록이 정확히 같다', () => {
    expect(readElectronActivities()).toEqual(readDomainActivities());
  });

  test('빈 목록을 통과로 착각하지 않는다', () => {
    // 정규식이 빗나가 빈 배열끼리 비교하면 위 테스트가 의미 없이 통과한다.
    expect(readDomainActivities().length).toBeGreaterThan(0);
  });

  test('main이 이 목록으로 실제로 값을 거른다', () => {
    // 목록만 있고 걸러 쓰지 않으면 미러를 맞춰 둘 이유가 없다.
    const src = readFileSync(resolve(REPO_ROOT, 'electron/main.ts'), 'utf-8');
    expect(src).toContain('isMemoEditorActivity');
    expect(src).toContain("ipcMain.on('sidePin:editor-activity'");
  });
});
