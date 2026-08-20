/**
 * 앱 시작 모습 목록 미러 테스트.
 *
 * `electron/main.ts`의 `STARTUP_MODES`는 `src/domain/entities/Settings.ts`의
 * `WindowStartupMode`를 복제한 것이다. 한쪽만 늘리면 **조용히 다른 모습으로 뜬다** —
 * 설정에서 새 항목을 골라도 main이 그 값을 모르니 기본값(전체 화면)으로 떨어진다.
 * 같은 사고가 창 닫기 동작에서 실제로 있었다(closeAction.mirror.test.ts 참조).
 *
 * 타입은 실행 시점에 확인할 수 없으므로, 양쪽 **소스를 읽어 목록을 뽑아** 비교한다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

const MAIN_TS = resolve(REPO_ROOT, 'electron/main.ts');
const SETTINGS_TS = resolve(REPO_ROOT, 'src/domain/entities/Settings.ts');

/** main.ts의 `const STARTUP_MODES = [...] as const;` 에서 값을 뽑는다 */
function readElectronStartupModes(): string[] {
  const src = readFileSync(MAIN_TS, 'utf-8');
  const m = src.match(/const STARTUP_MODES = \[([^\]]*)\] as const;/);
  if (m?.[1] === undefined) throw new Error('main.ts에서 STARTUP_MODES를 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

/** Settings.ts의 `export type WindowStartupMode = 'a' | 'b' | ...` 에서 값을 뽑는다 */
function readDomainStartupModes(): string[] {
  const src = readFileSync(SETTINGS_TS, 'utf-8');
  const m = src.match(/export type WindowStartupMode =\s*([^;]+);/);
  if (m?.[1] === undefined) throw new Error('Settings.ts에서 WindowStartupMode를 찾지 못했다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string).sort();
}

describe('앱 시작 모습 — 도메인과 electron 미러', () => {
  test('두 목록이 정확히 같다', () => {
    expect(readElectronStartupModes()).toEqual(readDomainStartupModes());
  });

  test('옆핀이 양쪽에 있다', () => {
    expect(readElectronStartupModes()).toContain('sidePin');
    expect(readDomainStartupModes()).toContain('sidePin');
  });

  test('main.ts가 기본값 아닌 모습을 실제로 처리한다 — 목록에만 있으면 조용히 전체 화면이 된다', () => {
    const src = readFileSync(MAIN_TS, 'utf-8');
    for (const mode of ['widget', 'sidePin']) {
      expect(src).toContain(`widgetOptions.startupMode === '${mode}'`);
    }
  });

  test('설정 화면 라디오가 세 가지를 모두 제공한다', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'src/adapters/components/Settings/tabs/WidgetTab.tsx'),
      'utf-8',
    );
    // 창 닫기 동작 라디오에도 같은 값들이 있으므로, 시작 모습 블록만 잘라서 본다.
    const start = src.indexOf('앱 시작 시 모습');
    const end = src.indexOf('name="startupMode"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    for (const mode of readDomainStartupModes()) {
      expect(block).toContain(`value: '${mode}' as const`);
    }
  });
});
