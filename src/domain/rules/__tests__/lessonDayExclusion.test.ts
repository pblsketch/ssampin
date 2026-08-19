import { describe, it, expect } from 'vitest';
import {
  classifyLessonDayExclusion,
  collectLessonDayNotices,
  type LessonDayEvent,
} from '../lessonDayExclusion';

const DATE = '2026-10-09';

function evt(title: string, group: LessonDayEvent['group']): LessonDayEvent {
  return { title, group };
}

/** 시간표에 2교시가 있는 평범한 수업일 기본값. */
const LESSON_DAY = { date: DATE, scheduledPeriodCount: 2 } as const;

describe('classifyLessonDayExclusion — 평범한 수업일', () => {
  it('아무 사유가 없으면 수업일이다 (null)', () => {
    expect(classifyLessonDayExclusion({ ...LESSON_DAY })).toBeNull();
  });

  it('시간표에 수업이 없으면 제외한다', () => {
    const got = classifyLessonDayExclusion({ date: DATE, scheduledPeriodCount: 0 });
    expect(got?.reason).toBe('noScheduledLesson');
  });

  it('시간표가 0교시인 날은 되살릴 수 없다 — 버튼을 막아야 한다', () => {
    const got = classifyLessonDayExclusion({ date: DATE, scheduledPeriodCount: 0 });
    expect(got?.userOverridable).toBe(false);
  });
});

describe('classifyLessonDayExclusion — 자동 제외 대상', () => {
  it('공휴일은 제외하고 근거를 남긴다', () => {
    const got = classifyLessonDayExclusion({ ...LESSON_DAY, holidayName: '한글날' });
    expect(got?.reason).toBe('holiday');
    expect(got?.sourceLabel).toBe('한글날');
    expect(got?.userOverridable).toBe(true);
  });

  it('학사일정의 공휴일 분류도 제외한다', () => {
    const got = classifyLessonDayExclusion({
      ...LESSON_DAY,
      events: [evt('개천절', 'holiday')],
    });
    expect(got?.reason).toBe('holiday');
  });

  it('방학은 제외한다', () => {
    const got = classifyLessonDayExclusion({
      ...LESSON_DAY,
      events: [evt('여름방학', 'vacation')],
    });
    expect(got?.reason).toBe('vacation');
    expect(got?.sourceLabel).toBe('여름방학');
  });
});

describe('classifyLessonDayExclusion — A-a13: 방학식·종업식은 자동 제외하지 않는다', () => {
  it('여름방학식은 등교일이라 제외되지 않는다', () => {
    // 이 행사는 학기 종료일 후보(termEndFromSchedule)로도 쓰인다.
    // 자동 제외하면 학기 마지막 등교일이 사라지면서 동시에 종료일이 되는 자기 모순이 된다.
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('여름방학식', 'vacation')] }),
    ).toBeNull();
  });

  it('겨울방학식도 마찬가지다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('겨울방학식', 'vacation')] }),
    ).toBeNull();
  });

  it('공백이 섞여도 같은 처리', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('여름 방학식', 'vacation')] }),
    ).toBeNull();
  });

  it('뒤에 뭐가 붙어도 방학식이면 제외하지 않는다', () => {
    // '…으로 끝나는가'로 판정하면 여기서 뚫린다. 뚫리면 그 날이 방학으로 자동 제외되면서
    // 동시에 학기 종료일 후보로 올라가, 이 규칙이 피하려던 자기 모순이 되살아난다.
    for (const title of ['여름방학식(1~2학년)', '여름방학식 및 방과후 안내', '겨울방학식·종업식']) {
      expect(
        classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt(title, 'vacation')] }),
        title,
      ).toBeNull();
    }
  });

  it('종업식도 접미가 붙어도 제외되지 않는다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('종업식(전학년)', 'vacation')] }),
    ).toBeNull();
  });

  it('방학식과 진짜 방학이 같은 날 있으면 방학이 이겨 제외된다', () => {
    const got = classifyLessonDayExclusion({
      ...LESSON_DAY,
      events: [evt('여름방학식', 'vacation'), evt('여름방학', 'vacation')],
    });
    expect(got?.reason).toBe('vacation');
    expect(got?.sourceLabel).toBe('여름방학');
  });
});

describe('classifyLessonDayExclusion — 시험·행사는 자동 제외하지 않는다 (오너 확정)', () => {
  it('시험기간은 수업일로 남는다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('중간고사', 'exam')] }),
    ).toBeNull();
  });

  it("'수행평가 주간'처럼 정상 수업일에 붙는 이름도 당연히 남는다", () => {
    // 자동 제외였다면 이 날들이 조용히 사라졌을 자리다.
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('수행평가 주간', 'exam')] }),
    ).toBeNull();
  });

  it('체육대회·수학여행 같은 행사도 수업일로 남는다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('체육대회', 'event')] }),
    ).toBeNull();
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('수학여행', 'event')] }),
    ).toBeNull();
  });

  it('기타(etc) 분류도 제외하지 않는다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, events: [evt('학부모 상담주간', 'etc')] }),
    ).toBeNull();
  });
});

describe('classifyLessonDayExclusion — 우선순위: 사용자 정정이 가장 세다', () => {
  it('공휴일이어도 "수업했어요"면 수업일이 된다', () => {
    expect(
      classifyLessonDayExclusion({ ...LESSON_DAY, holidayName: '한글날', adjustment: 'hasLesson' }),
    ).toBeNull();
  });

  it('방학이어도 "수업했어요"면 수업일이 된다', () => {
    expect(
      classifyLessonDayExclusion({
        ...LESSON_DAY,
        events: [evt('여름방학', 'vacation')],
        adjustment: 'hasLesson',
      }),
    ).toBeNull();
  });

  it('평범한 수업일이어도 "수업 없었어요"면 제외된다', () => {
    const got = classifyLessonDayExclusion({ ...LESSON_DAY, adjustment: 'noLesson' });
    expect(got?.reason).toBe('userMarkedNoLesson');
  });

  it('시간표가 0교시면 "수업했어요"를 눌러도 되살아나지 않는다', () => {
    // 되살릴 교시가 없다. 화면은 이 경우 버튼 자체를 막고 사유를 안내해야 한다.
    const got = classifyLessonDayExclusion({
      date: DATE,
      scheduledPeriodCount: 0,
      adjustment: 'hasLesson',
      holidayName: '한글날',
    });
    expect(got?.reason).toBe('noScheduledLesson');
    expect(got?.userOverridable).toBe(false);
  });

  it('사용자 정정이 공휴일보다 먼저 판정된다 (순서 고정)', () => {
    const got = classifyLessonDayExclusion({
      ...LESSON_DAY,
      holidayName: '한글날',
      events: [evt('여름방학', 'vacation')],
      adjustment: 'noLesson',
    });
    expect(got?.reason).toBe('userMarkedNoLesson');
  });

  it('공휴일이 방학보다 먼저 판정된다 (순서 고정)', () => {
    const got = classifyLessonDayExclusion({
      ...LESSON_DAY,
      holidayName: '설날',
      events: [evt('겨울방학', 'vacation')],
    });
    expect(got?.reason).toBe('holiday');
  });

  it('방학이 시간표보다 먼저 판정된다 (순서 고정)', () => {
    const got = classifyLessonDayExclusion({
      date: DATE,
      scheduledPeriodCount: 0,
      events: [evt('겨울방학', 'vacation')],
    });
    expect(got?.reason).toBe('vacation');
  });
});

describe('classifyLessonDayExclusion — 이상한 입력에도 예외를 던지지 않는다', () => {
  it('교시 수가 음수면 0으로 본다', () => {
    const got = classifyLessonDayExclusion({ date: DATE, scheduledPeriodCount: -3 });
    expect(got?.reason).toBe('noScheduledLesson');
  });

  it('교시 수가 NaN이면 0으로 본다', () => {
    const got = classifyLessonDayExclusion({ date: DATE, scheduledPeriodCount: Number.NaN });
    expect(got?.reason).toBe('noScheduledLesson');
  });

  it('공휴일 이름이 빈 문자열이면 공휴일이 아니다', () => {
    expect(classifyLessonDayExclusion({ ...LESSON_DAY, holidayName: '' })).toBeNull();
  });
});

describe('collectLessonDayNotices — 확인 필요 표시', () => {
  it('시험과 행사를 표시로 모은다', () => {
    const got = collectLessonDayNotices([evt('중간고사', 'exam'), evt('체육대회', 'event')]);
    expect(got.map((n) => n.kind)).toEqual(['exam', 'event']);
    expect(got[0]?.sourceLabel).toBe('중간고사');
  });

  it('공휴일·방학·기타는 표시 대상이 아니다 (이미 제외되었거나 무관)', () => {
    expect(
      collectLessonDayNotices([
        evt('개천절', 'holiday'),
        evt('여름방학', 'vacation'),
        evt('상담주간', 'etc'),
      ]),
    ).toEqual([]);
  });

  it('일정이 없으면 빈 배열', () => {
    expect(collectLessonDayNotices(undefined)).toEqual([]);
    expect(collectLessonDayNotices([])).toEqual([]);
  });
});
