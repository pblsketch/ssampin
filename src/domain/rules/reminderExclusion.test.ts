import { describe, it, expect } from 'vitest';
import {
  activeExclusionKeys,
  exclusionUntil,
  homeroomExclusionKey,
  pruneExpiredExclusions,
  subjectExclusionKey,
  withExclusion,
  withLatestExclusions,
  withoutExclusion,
} from './reminderExclusion';

describe('빼기 key — 누른 카드의 반에서만', () => {
  it('담임반은 학생 id, 수업반은 반+학생 키', () => {
    expect(homeroomExclusionKey('stu-1')).toBe('stu-1');
    expect(subjectExclusionKey('class-a', '2-3-15')).toBe('subject:class-a:2-3-15');
    expect(subjectExclusionKey('class-a', '15')).not.toBe(subjectExclusionKey('class-b', '15'));
  });
});

describe('빼는 기간의 마지막 날', () => {
  it('2주 = 오늘 포함 14일', () => {
    expect(exclusionUntil('twoWeeks', '2026-09-23', '2027-02-28')).toBe('2026-10-06');
  });

  it('한 달 = 다음 달 같은 날의 전날', () => {
    expect(exclusionUntil('oneMonth', '2026-09-23', '2027-02-28')).toBe('2026-10-22');
    expect(exclusionUntil('oneMonth', '2026-12-15', '2027-02-28')).toBe('2027-01-14');
    // 1월 31일 → 2월에 31일이 없으니 2월 마지막 날의 전날
    expect(exclusionUntil('oneMonth', '2027-01-31', '2027-02-28')).toBe('2027-02-27');
  });

  it('이번 학기 끝까지 = 학기 마지막 날', () => {
    expect(exclusionUntil('termEnd', '2026-09-23', '2027-02-28')).toBe('2027-02-28');
  });
});

describe('오늘 빠져 있는 학생', () => {
  const settings = {
    excludedStudentIds: ['legacy-1'],
    exclusions: [
      { key: 'stu-1', until: '2026-09-30' },
      { key: 'subject:c:3', until: '2026-09-20' },
    ],
  };

  it('기간 안이면 빠져 있고, 마지막 날까지 포함한다', () => {
    expect(activeExclusionKeys(settings, '2026-09-30').has('stu-1')).toBe(true);
    expect(activeExclusionKeys(settings, '2026-10-01').has('stu-1')).toBe(false);
  });

  it('기간이 지나면 저절로 다시 들어온다', () => {
    expect(activeExclusionKeys(settings, '2026-09-23').has('subject:c:3')).toBe(false);
  });

  it('옛 excludedStudentIds 는 기간 없는 빼기로 읽는다', () => {
    expect(activeExclusionKeys(settings, '2030-01-01').has('legacy-1')).toBe(true);
  });

  it('exclusions 가 없는 옛 설정도 읽는다', () => {
    expect([...activeExclusionKeys({ excludedStudentIds: [] }, '2026-09-23')]).toEqual([]);
  });
});

describe('빼기·다시 넣기 목록 바꾸기', () => {
  it('같은 학생을 다시 빼면 기간만 바뀐다', () => {
    const list = withExclusion(
      [{ key: 'a', until: '2026-10-01' }],
      'a',
      '2026-12-01',
      '2026-09-23',
    );
    expect(list).toEqual([{ key: 'a', until: '2026-12-01' }]);
  });

  it('다시 넣으면 목록에서 빠지고, 지난 항목도 정리된다', () => {
    const list = withoutExclusion(
      [
        { key: 'a', until: '2026-10-01' },
        { key: 'old', until: '2026-01-01' },
        { key: 'b', until: '2026-10-01' },
      ],
      'a',
      '2026-09-23',
    );
    expect(list).toEqual([{ key: 'b', until: '2026-10-01' }]);
  });

  it('지난 항목만 정리한다', () => {
    expect(pruneExpiredExclusions([{ key: 'x', until: '2026-09-22' }], '2026-09-23')).toEqual([]);
    expect(pruneExpiredExclusions(undefined, '2026-09-23')).toEqual([]);
  });
});

describe('설정 화면 [저장] — 즉시 저장된 빼기 목록을 덮지 않는다', () => {
  const draft = {
    enabled: true,
    exclusions: [{ key: 'old', until: '2026-10-01' }],
    excludedStudentIds: ['legacy'],
  };

  it('지금 저장된 목록을 쓰고, 다른 값은 초안 그대로', () => {
    const merged = withLatestExclusions(draft, {
      exclusions: [{ key: 'new', until: '2026-10-05' }],
      excludedStudentIds: [],
    });
    expect(merged).toEqual({
      enabled: true,
      exclusions: [{ key: 'new', until: '2026-10-05' }],
      excludedStudentIds: [],
    });
  });

  it('저장된 값이 없으면 초안 그대로', () => {
    expect(withLatestExclusions(draft, undefined)).toBe(draft);
  });
});
