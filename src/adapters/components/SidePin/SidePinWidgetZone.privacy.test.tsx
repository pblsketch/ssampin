/**
 * 옆핀에 **관련인이 새지 않는다** — 여기가 진짜 무방비 표면이다.
 *
 * 대시보드·바탕화면 위젯 모드의 할일 타일은 `PIN_FEATURE_MAP.todo` 로 이미 잠긴다.
 * 그런데 **옆핀에는 PIN 가드가 없다** — 옆핀은 `WidgetCard` 를 거치지 않고 위젯 본문을
 * 직접 그리기 때문이다(전 위젯 공통의 기존 구멍). 할일 위젯은
 * `registry.ts` 에서 `sidePin.eligible: true` 라 옆핀에 올릴 수 있다.
 *
 * 그래서 "관련인을 읽는 코드를 넣지 않는다"가 옆핀에서는 **유일한 방어선**이다.
 *
 * ★ 이미 쓰이는 기능을 회수하지 않는다 — `sidePin.eligible` 을 false 로 내리지 않는다
 *   (계획서 M3). 대신 노출될 데이터를 애초에 만들지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SIDEPIN_ZONE = 'src/adapters/components/SidePin/SidePinWidgetZone.tsx';
const TODO_WIDGET_ENTRY = 'src/widgets/items/TodoWidget.tsx';
const REGISTRY = 'src/widgets/registry.ts';

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('옆핀 위젯 칸 — 관련인 미노출', () => {
  it('옆핀 위젯 칸이 relatedStaff 를 읽지 않는다', () => {
    expect(sourceOf(SIDEPIN_ZONE)).not.toContain('relatedStaff');
  });

  it('옆핀에 올라가는 할일 위젯 진입점도 relatedStaff 를 읽지 않는다', () => {
    expect(sourceOf(TODO_WIDGET_ENTRY)).not.toContain('relatedStaff');
  });

  it('할일 위젯 진입점 파일이 그대로 있다 — 지우면 registry 가 깨진다', () => {
    const registry = sourceOf(REGISTRY);
    expect(registry).toContain("from './items/TodoWidget'");
    expect(registry).toContain('component: TodoWidget');
  });

  it('할일 위젯의 옆핀 사용 가능 설정을 회수하지 않았다', () => {
    const registry = sourceOf(REGISTRY);
    const todoBlock = registry.slice(registry.indexOf("id: 'todo',"));
    expect(todoBlock.slice(0, 200)).toContain('eligible: true');
  });
});
