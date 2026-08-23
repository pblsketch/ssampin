/**
 * 쌤핀 AI — 도구 실행기 (옵션 A, 브릿지 동등화 Phase 1)
 *
 * ★모델 인자는 항상 불신한다 — 여기의 방어가 뚫리면 모델이 실행기의 입력을
 * 마음대로 정하는 셈이 된다. 깨진 JSON·이상한 날짜·모르는 도구를 전부 다룬다.
 */
import { describe, expect, it } from 'vitest';

import { executeAssistTool, type ExecutorSources } from '../AssistDockContainer';

const SRC: ExecutorSources = {
  students: [],
  classes: [],
  todos: [],
  records: [],
  meals: [
    { date: '20260824', mealType: '중식', dishes: [{ name: '차조밥' }], calorie: '690 Kcal' },
  ],
  events: [],
  ddays: [{ title: '수능', targetDate: '2026-11-19', pinned: true }],
};

describe('executeAssistTool', () => {
  it('레지스트리에 없는 도구는 무시한다 — 모델이 지어낸 이름', () => {
    expect(executeAssistTool('made_up_tool', '{}', SRC)).toBeNull();
  });

  it('깨진 JSON 인자는 기본값으로 방어한다', () => {
    const card = executeAssistTool('get_ddays', '{{{not json', SRC);

    expect(card?.tool).toBe('get_ddays');
    const items = (card?.data as { items?: readonly { title?: string }[] }).items;
    expect(items?.[0]?.title).toBe('수능');
  });

  it('이상한 날짜 인자는 버리고 기본 기간을 쓴다', () => {
    const card = executeAssistTool('get_meals', '{"from":"내일부터","to":123}', SRC);

    expect(card?.tool).toBe('get_meals');
    // 기본값 = 오늘~+6일. 픽스처 날짜가 기간 밖일 수 있으므로 형태만 확인한다.
    expect(card?.data).toHaveProperty('period');
    expect(card?.data).toHaveProperty('items');
  });

  it('정상 인자는 그대로 쓴다 — 급식 기간 조회', () => {
    const card = executeAssistTool('get_meals', '{"from":"2026-08-24","to":"2026-08-28"}', SRC);

    const data = card?.data as { period?: string; items?: readonly { dishes?: string }[] };
    expect(data.period).toBe('2026-08-24 ~ 2026-08-28');
    expect(data.items?.[0]?.dishes).toBe('차조밥');
  });

  it('기존 도구(할 일 등)도 실행기에서 부를 수 있다 — 정규식 build 재사용', () => {
    const card = executeAssistTool('get_my_todos', '{}', SRC);

    expect(card?.tool).toBe('get_my_todos');
    expect(card?.data).toHaveProperty('undone');
  });
});
