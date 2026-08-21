/**
 * 대시보드 할일 위젯에 **관련인이 새지 않는다**.
 *
 * 왜 필요한가: 할일 위젯은 대시보드와 바탕화면 위젯 모드에 늘 떠 있다. 거기에 동료
 * 교직원 이름이 뜨면 화면 공유나 옆자리 눈에 그대로 노출된다. 관련인은 **본 화면에서만**
 * 보여준다는 것이 이 기능의 범위 결정이었다(계획서 M3).
 *
 * ★ 검사 방식이 렌더가 아니라 **원본 코드 훑기**인 이유
 *   계획서가 정책 이행 수단으로 정한 것이 *"관련인을 읽는 코드를 넣지 않는 것"* 이다.
 *   렌더 결과만 보면 "지금은 안 뜨는데 조건이 하나 바뀌면 뜨는" 상태를 놓친다.
 *   코드에 아예 없으면 어떤 데이터가 와도 뜰 수 없다 — 더 강한 보장이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DASHBOARD_TODO = 'src/adapters/components/Dashboard/DashboardTodo.tsx';

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('대시보드 할일 위젯 — 관련인 미노출', () => {
  it('relatedStaff 를 읽지 않는다', () => {
    expect(sourceOf(DASHBOARD_TODO)).not.toContain('relatedStaff');
  });

  it('관련인 칩 컴포넌트를 import 하지 않는다', () => {
    expect(sourceOf(DASHBOARD_TODO)).not.toContain('RelatedStaffChips');
  });

  it('관련인 인원수를 세는 코드도 없다 — 이름을 가려도 인원수는 정보다', () => {
    const src = sourceOf(DASHBOARD_TODO);
    expect(src).not.toMatch(/relatedStaff[\s\S]{0,40}length/);
  });

  it('참고: 이 위젯은 PIN 잠금 대상이다 — 그래도 관련인은 넣지 않는다', () => {
    const pinMap = sourceOf('src/widgets/utils/pinFeatureMap.ts');
    expect(pinMap).toContain("todo: 'todo'");
  });
});
