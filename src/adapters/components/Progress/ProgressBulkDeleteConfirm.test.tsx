import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProgressBulkDeleteConfirm } from './ProgressBulkDeleteConfirm';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';

/**
 * 여러 건 삭제 확인 창 계약.
 *
 * 이 창은 **되돌릴 수 없는 삭제 앞의 유일한 방어선**이다. 진도 목록에는 성격이 전혀 다른 둘이
 * 섞여 있다 — 계획을 깔아 둔 빈 '예정' 칸과, 실제로 한 수업의 '완료'·'미실시' 기록.
 * 개수만 보여주면 계획을 정리하려다 학기 내내 적어 둔 기록을 함께 날린다.
 */

function entry(id: string, status: ProgressStatus, date = '2026-09-07'): ProgressEntry {
  return {
    id,
    classId: 'tc-1',
    date,
    period: 3,
    unit: '',
    lesson: '',
    status,
    note: '',
  };
}

function render(entries: readonly ProgressEntry[]): string {
  return renderToString(
    <ProgressBulkDeleteConfirm entries={entries} onCancel={() => {}} onConfirm={() => {}} />,
  );
}

describe('ProgressBulkDeleteConfirm — 무엇이 지워지는지 나눠 보여준다', () => {
  it('건수를 제목에 보여준다', () => {
    const html = render([entry('a', 'planned'), entry('b', 'planned')]);
    expect(html).toContain('2');
    expect(html).toContain('지울까요');
  });

  it('상태별 개수를 나눠 보여준다', () => {
    const html = render([
      entry('a', 'planned'),
      entry('b', 'planned'),
      entry('c', 'completed'),
      entry('d', 'skipped'),
    ]);
    expect(html).toContain('예정');
    expect(html).toContain('완료');
    expect(html).toContain('미실시');
  });

  it('없는 상태는 표시하지 않는다', () => {
    const html = render([entry('a', 'planned')]);
    expect(html).toContain('예정');
    expect(html).not.toContain('미실시');
  });

  it('날짜 범위를 보여준다', () => {
    const html = render([entry('a', 'planned', '2026-09-07'), entry('b', 'planned', '2026-11-11')]);
    expect(html).toContain('2026-09-07');
    expect(html).toContain('2026-11-11');
  });

  it('하루짜리면 범위 대신 그 날짜만', () => {
    const html = render([entry('a', 'planned', '2026-09-07'), entry('b', 'planned', '2026-09-07')]);
    expect(html).toContain('2026-09-07');
    expect(html).not.toContain('~');
  });
});

describe('ProgressBulkDeleteConfirm — 실제 기록이 섞이면 반드시 말한다', () => {
  it("'완료'가 있으면 실제 수업 기록이 사라진다고 경고한다", () => {
    const html = render([entry('a', 'planned'), entry('b', 'completed')]);
    expect(html).toContain('실제로 하신 수업 기록');
    expect(html).toContain('되돌릴 수 없');
  });

  it("'미실시'도 실제 기록으로 센다", () => {
    // 미실시는 "그날 수업이 있었는데 진도를 못 나갔다"는 기록이다. 빈 칸이 아니다.
    const html = render([entry('a', 'skipped')]);
    expect(html).toContain('실제로 하신 수업 기록');
  });

  it('완료 2 + 미실시 1이면 3건이라고 말한다', () => {
    const html = render([
      entry('a', 'planned'),
      entry('b', 'completed'),
      entry('c', 'completed'),
      entry('d', 'skipped'),
    ]);
    expect(html).toMatch(/실제로 하신 수업 기록 3건|기록 <!-- -->3<!-- -->건/);
  });

  it("모두 '예정'이면 겁주지 않고 안심시킨다", () => {
    const html = render([entry('a', 'planned'), entry('b', 'planned')]);
    expect(html).toContain('기록은 사라지지 않아요');
    expect(html).not.toContain('실제로 하신 수업 기록');
  });

  it('되돌릴 수 없다는 사실을 항상 알린다', () => {
    // 되돌리기가 없으므로 이 확인 창이 유일한 방어선이다.
    expect(render([entry('a', 'planned')])).toContain('되돌리기는 없어요');
    expect(render([entry('a', 'completed')])).toContain('되돌리기는 없어요');
  });
});
