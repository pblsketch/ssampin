import { describe, it, expect } from 'vitest';
import { parseQuickInput, hasRecognizedTokens } from './koreanDateParser';

// 고정 today = 2026-06-24(수요일, getDay()=3) — 결정적 테스트.
const TODAY = new Date(2026, 5, 24);

describe('parseQuickInput — 날짜', () => {
  it('오늘/내일/모레/글피', () => {
    expect(parseQuickInput('오늘 회의', TODAY).dueDate).toBe('2026-06-24');
    expect(parseQuickInput('내일 회의', TODAY).dueDate).toBe('2026-06-25');
    expect(parseQuickInput('모레 회의', TODAY).dueDate).toBe('2026-06-26');
    expect(parseQuickInput('글피 회의', TODAY).dueDate).toBe('2026-06-27');
  });

  it('N일 뒤/후', () => {
    expect(parseQuickInput('3일 뒤 제출', TODAY).dueDate).toBe('2026-06-27');
    expect(parseQuickInput('10일 후 시험', TODAY).dueDate).toBe('2026-07-04');
  });

  it('N월 N일 — 미래는 올해, 지난 날짜는 내년', () => {
    expect(parseQuickInput('7월 3일 출장', TODAY).dueDate).toBe('2026-07-03');
    expect(parseQuickInput('1월 5일 결재', TODAY).dueDate).toBe('2027-01-05');
  });

  it('이번주/다음주/다다음주 요일', () => {
    // 이번주 금요일(금=5): (5-3+7)%7=2 → 06-26
    expect(parseQuickInput('이번주 금요일 마감', TODAY).dueDate).toBe('2026-06-26');
    // 다음주 월요일: base=(1-3+7)%7=5, +7 → 06-24+12 = 07-06
    const nextMon = parseQuickInput('다음주 월요일 회의', TODAY).dueDate;
    expect(nextMon).toBe('2026-07-06');
    expect(new Date(nextMon + 'T00:00:00').getDay()).toBe(1);
    // 다다음주 수요일
    const w = parseQuickInput('다다음주 수요일 보고', TODAY).dueDate;
    expect(w).toBe('2026-07-08');
    expect(new Date(w + 'T00:00:00').getDay()).toBe(3);
  });

  it('수식어 없는 단독 요일 — 다음 도래(오늘이면 오늘)', () => {
    // 금요일(5): 06-26
    expect(parseQuickInput('금요일 청소', TODAY).dueDate).toBe('2026-06-26');
    // 수요일(오늘) → 오늘
    expect(parseQuickInput('수요일 점검', TODAY).dueDate).toBe('2026-06-24');
  });
});

describe('parseQuickInput — 시간', () => {
  it('맨 N시: 1~6시는 오후로, 7~12시는 그대로', () => {
    expect(parseQuickInput('내일 3시 회의', TODAY).time).toBe('15:00');
    expect(parseQuickInput('9시 조회', TODAY).time).toBe('09:00');
  });
  it('오전/오후 N시(반)', () => {
    expect(parseQuickInput('오후 2시 상담', TODAY).time).toBe('14:00');
    expect(parseQuickInput('오전 9시 출근', TODAY).time).toBe('09:00');
    expect(parseQuickInput('오후 3시 반 회의', TODAY).time).toBe('15:30');
    expect(parseQuickInput('오전 12시 마감', TODAY).time).toBe('00:00');
  });
  it('HH:MM 직접', () => {
    expect(parseQuickInput('14:30 미팅', TODAY).time).toBe('14:30');
  });
  it('프리셋(아침/점심/저녁/밤)', () => {
    expect(parseQuickInput('아침 운동', TODAY).time).toBe('08:00');
    expect(parseQuickInput('저녁 회식', TODAY).time).toBe('18:00');
  });
});

describe('parseQuickInput — 우선순위', () => {
  it('!높음/!중간/!낮음', () => {
    expect(parseQuickInput('보고 !높음', TODAY).priority).toBe('high');
    expect(parseQuickInput('정리 !중간', TODAY).priority).toBe('medium');
    expect(parseQuickInput('메모 !낮음', TODAY).priority).toBe('low');
  });
  it('!1/!2/!3', () => {
    expect(parseQuickInput('A !1', TODAY).priority).toBe('high');
    expect(parseQuickInput('B !2', TODAY).priority).toBe('medium');
    expect(parseQuickInput('C !3', TODAY).priority).toBe('low');
  });
});

describe('parseQuickInput — 카테고리', () => {
  it('#태그 → categoryHint', () => {
    expect(parseQuickInput('수업 준비 #업무', TODAY).categoryHint).toBe('업무');
    expect(parseQuickInput('#수업 교재 정리', TODAY).categoryHint).toBe('수업');
  });
});

describe('parseQuickInput — 반복', () => {
  it('매주 월수금 → weekly daysOfWeek [1,3,5]', () => {
    const r = parseQuickInput('운동 매주 월수금', TODAY).recurrence;
    expect(r).toEqual({ type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] });
  });
  it('매주 월요일 → weekly [1]', () => {
    const r = parseQuickInput('교무회의 매주 월요일', TODAY).recurrence;
    expect(r).toEqual({ type: 'weekly', interval: 1, daysOfWeek: [1] });
  });
  it('매일/격주/매월/매년/평일', () => {
    expect(parseQuickInput('약 매일', TODAY).recurrence).toEqual({ type: 'daily', interval: 1 });
    expect(parseQuickInput('정산 격주', TODAY).recurrence).toEqual({ type: 'weekly', interval: 2 });
    expect(parseQuickInput('월보고 매월', TODAY).recurrence).toEqual({
      type: 'monthly',
      interval: 1,
    });
    expect(parseQuickInput('생일 매년', TODAY).recurrence).toEqual({ type: 'yearly', interval: 1 });
    expect(parseQuickInput('조회 매주 평일', TODAY).recurrence).toEqual({
      type: 'weekdays',
      interval: 1,
    });
  });
  it('매주(요일 없음) → weekly interval 1', () => {
    expect(parseQuickInput('정기모임 매주', TODAY).recurrence).toEqual({
      type: 'weekly',
      interval: 1,
    });
  });
});

describe('parseQuickInput — 본문 추출 / 통합 / 폴백', () => {
  it('복합: "내일 3시 학년부 회의 !높음 #업무 매주 월수금"', () => {
    const r = parseQuickInput('내일 3시 학년부 회의 !높음 #업무 매주 월수금', TODAY);
    expect(r.text).toBe('학년부 회의');
    expect(r.dueDate).toBe('2026-06-25');
    expect(r.time).toBe('15:00');
    expect(r.priority).toBe('high');
    expect(r.categoryHint).toBe('업무');
    expect(r.recurrence).toEqual({ type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] });
  });

  it('인식 토큰 없으면 전체를 text 로 보존(데이터 손실 0)', () => {
    const r = parseQuickInput('그냥 평범한 할 일', TODAY);
    expect(r.text).toBe('그냥 평범한 할 일');
    expect(r.dueDate).toBeUndefined();
    expect(r.time).toBeUndefined();
    expect(r.priority).toBeUndefined();
    expect(r.categoryHint).toBeUndefined();
    expect(r.recurrence).toBeUndefined();
    expect(hasRecognizedTokens(r)).toBe(false);
  });

  it('빈 본문(토큰만) → 원문 트림으로 폴백(addTodo 빈 text 거부 회피)', () => {
    const r = parseQuickInput('내일', TODAY);
    expect(r.dueDate).toBe('2026-06-25');
    expect(r.text).toBe('내일');
  });

  it('hasRecognizedTokens — 토큰 있으면 true', () => {
    expect(hasRecognizedTokens(parseQuickInput('내일 회의', TODAY))).toBe(true);
  });
});
