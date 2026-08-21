import { describe, expect, it } from 'vitest';
import { toClassSummaries } from '../toClassSummaries';
import type { ClassLike } from '../toClassSummaries';

describe('toClassSummaries', () => {
  it('학급 목록을 표시용 최소 정보로 변환한다', () => {
    const classes: ClassLike[] = [
      { id: 'c1', name: '1학년 2반', grade: 1, classNum: 2 },
      { id: 'c2', name: '수학 심화반' },
    ];

    const result = toClassSummaries(classes);

    expect(result).toEqual({
      classes: [
        { id: 'c1', name: '1학년 2반', grade: 1, classNum: 2 },
        { id: 'c2', name: '수학 심화반', grade: 0, classNum: 0 },
      ],
    });
  });

  it('빈 배열이면 예외 없이 빈 classes를 반환한다', () => {
    const result = toClassSummaries([]);

    expect(result).toEqual({ classes: [] });
  });

  it('반환 객체와 각 항목에 스키마 밖 키가 없다', () => {
    const result = toClassSummaries([{ id: 'c1', name: '1반', grade: 1, classNum: 2 }]);

    expect(Object.keys(result).sort()).toEqual(['classes'].sort());
    expect(Object.keys(result.classes[0]!).sort()).toEqual(
      ['classNum', 'grade', 'id', 'name'].sort(),
    );
  });
});
