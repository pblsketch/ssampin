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

/**
 * ⚠️ 이 테스트가 보장하는 범위를 정확히 적어 둔다 — 과장하면 통과 표시가 거짓말이 된다.
 *
 * 보장하는 것: **`relatedStaff` 데이터**가 위젯·옆핀 경로로 흐르지 않는다.
 * 보장하지 **못하는** 것: 멘션을 고르면 본문(`todo.text`)에 `@김민호` 가 남고, 본문은
 *   위젯·옆핀에 그대로 그려진다. `text` 는 로컬 전용 필드가 아니라 구글 Tasks 로도 올라간다.
 *   이건 계획서가 `applyMention` 으로 직접 지시한 설계라 구현 이탈이 아니며,
 *   "본문에 이름을 남길 것인가"는 오너 결정 사항으로 남아 있다(M3 후속).
 */
describe('옆핀 위젯 칸 — 관련인 데이터 미노출', () => {
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
