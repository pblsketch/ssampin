/**
 * 창 닫기 동작 목록 미러 테스트.
 *
 * `electron/main.ts`의 `CLOSE_ACTIONS`는 `src/domain/entities/Settings.ts`의
 * `WidgetSettings['closeAction']`을 복제한 것이다. 한쪽만 늘리면 **조용히 다른 동작이 된다** —
 * 설정에서 새 항목을 골라도 main이 그 값을 모르니 기본값(위젯 모드)으로 떨어진다.
 * 실제로 옆핀을 추가할 때 이 일이 벌어졌고, 그래서 이 테스트를 둔다.
 *
 * 타입은 실행 시점에 확인할 수 없으므로, 양쪽 **소스를 읽어 목록을 뽑아** 비교한다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

/** main.ts의 `const CLOSE_ACTIONS = [...] as const;` 에서 값을 뽑는다 */
function readElectronCloseActions(): string[] {
  const src = readFileSync(resolve(REPO_ROOT, 'electron/main.ts'), 'utf-8');
  const m = src.match(/const CLOSE_ACTIONS = \[([^\]]*)\] as const;/);
  if (m?.[1] === undefined) throw new Error('main.ts에서 CLOSE_ACTIONS를 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

/** Settings.ts의 `closeAction?: 'a' | 'b' | ...` 에서 값을 뽑는다 */
function readDomainCloseActions(): string[] {
  const src = readFileSync(resolve(REPO_ROOT, 'src/domain/entities/Settings.ts'), 'utf-8');
  const m = src.match(/readonly closeAction\?:\s*([^;]+);/);
  if (m?.[1] === undefined) throw new Error('Settings.ts에서 closeAction을 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

/**
 * useSettingsStore.ts의 `explicit === '...'` 허용 목록에서 값을 뽑는다.
 *
 * 목록이 여기에도 한 벌 더 있다. 화면이 설정을 읽을 때 이 목록에 없는 값은 조용히
 * 기본값으로 떨어지고, 그 상태로 다시 저장되면 **사용자의 선택이 사라진다**.
 * 실제로 'sidePin' 이 빠져 있어서 "옆핀으로 접기" 가 다음 실행에 위젯으로 돌아갔다.
 */
function readStoreCloseActions(): string[] {
  const src = readFileSync(resolve(REPO_ROOT, 'src/adapters/stores/useSettingsStore.ts'), 'utf-8');
  const values = [...src.matchAll(/explicit === '([^']+)'/g)].map((x) => x[1] as string);
  if (values.length === 0)
    throw new Error('useSettingsStore.ts에서 closeAction 허용 목록을 찾지 못했다');
  return [...new Set(values)].sort();
}

describe('창 닫기 동작 — 도메인과 electron 미러', () => {
  test('두 목록이 정확히 같다', () => {
    expect(readElectronCloseActions()).toEqual(readDomainCloseActions());
  });

  test('옆핀이 양쪽에 있다', () => {
    expect(readElectronCloseActions()).toContain('sidePin');
    expect(readDomainCloseActions()).toContain('sidePin');
  });

  test('설정을 읽는 화면(스토어)도 같은 목록을 안다 — 빠진 값은 조용히 기본값으로 되돌아간다', () => {
    expect(readStoreCloseActions()).toEqual(readDomainCloseActions());
  });

  test('main.ts가 모든 동작을 실제로 처리한다 — 목록에만 있고 분기가 없으면 조용히 기본값으로 떨어진다', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'electron/main.ts'), 'utf-8');
    // 'ask'는 다이얼로그를 띄우고, 'tray'는 else 분기라 이름으로 검사하지 않는다.
    for (const action of ['widget', 'icon', 'sidePin', 'quit']) {
      expect(src).toContain(`opts.closeAction === '${action}'`);
    }
  });
});
