/**
 * 명단만으로 만드는 이름 학습용 격자.
 *
 * 얼굴 보고 이름 맞히기는 자리와 상관이 없는데, 지금까지는 자리배치를 먼저 만들어야만
 * 학습 모드에 도달할 수 있었다. 학기 초 첫 주가 이 기능이 가장 필요한 때인데 말이다.
 */
import { describe, it, expect } from 'vitest';
import { buildRosterLearningGrid, ROSTER_GRID_MAX_COLS } from '@domain/rules/rosterLearningGrid';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe('buildRosterLearningGrid', () => {
  it('22명이면 6열 4줄로 채우고 마지막 줄은 빈 칸으로 남는다', () => {
    const grid = buildRosterLearningGrid(ids(22));
    expect(grid.cols).toBe(6);
    expect(grid.rows).toBe(4);
    expect(grid.seats).toHaveLength(4);
    expect(grid.seats[0]).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(grid.seats[3]).toEqual(['s19', 's20', 's21', 's22', null, null]);
  });

  it('모든 학생이 정확히 한 번씩 들어간다', () => {
    const grid = buildRosterLearningGrid(ids(28));
    const placed = grid.seats.flat().filter((v): v is string => v !== null);
    expect(placed).toHaveLength(28);
    expect(new Set(placed).size).toBe(28);
  });

  it('명단 순서를 왼쪽 위부터 그대로 따른다', () => {
    const grid = buildRosterLearningGrid(['a', 'b', 'c']);
    expect(grid.seats[0]).toEqual(['a', 'b', 'c']);
  });

  it('인원이 최대 열보다 적으면 한 줄로 놓는다', () => {
    const grid = buildRosterLearningGrid(ids(3));
    expect(grid.rows).toBe(1);
    expect(grid.cols).toBe(3);
  });

  it('한 명이어도 격자가 성립한다', () => {
    const grid = buildRosterLearningGrid(['only']);
    expect(grid).toEqual({ rows: 1, cols: 1, seats: [['only']] });
  });

  it('명단이 비면 빈 격자를 준다 (화면이 "학생이 없습니다"를 띄운다)', () => {
    expect(buildRosterLearningGrid([])).toEqual({ rows: 0, cols: 0, seats: [] });
  });

  it('열 수를 조절할 수 있고, 0 이하를 줘도 1열은 보장한다', () => {
    expect(buildRosterLearningGrid(ids(10), 4).cols).toBe(4);
    expect(buildRosterLearningGrid(ids(3), 0).cols).toBe(1);
  });

  it('기본 열 수가 6이다 (카드가 너무 작아지지 않는 선)', () => {
    expect(ROSTER_GRID_MAX_COLS).toBe(6);
    expect(buildRosterLearningGrid(ids(30)).cols).toBe(6);
  });
});
