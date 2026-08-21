/**
 * 쿨메신저 쪽지 날짜 파서 테스트.
 *
 * 원본 `coolm-helper/tests/test_date_parser.py`의 케이스를 전량 옮기고,
 * 원본이 **주석으로만** 남겨둔 오탐 방지 규칙을 테스트로 고정했다.
 * (목록 번호 `2. 3`, `1-2교시`, `1:` 조각 — 실사용에서 발견된 함정들)
 */
import { describe, it, expect } from 'vitest';
import {
  extractCoolEvents,
  normalize,
  stripCoolDateExpressions,
} from '@domain/rules/coolMessageDateParser';

/** 2026-07-16 17:00 — 목요일 */
const BASE = new Date(2026, 6, 16, 17, 0);

/** 지역시간 기준 표기 (UTC 변환으로 날짜가 하루 밀리는 걸 피한다) */
function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

describe('기준일 자체 확인', () => {
  it('2026-07-16은 목요일이다 (다른 테스트들의 전제)', () => {
    expect(BASE.getDay()).toBe(4); // 0=일 … 4=목
  });
});

describe('절대 날짜', () => {
  it('7월 21일(화) 14:00 — 날짜와 시간을 함께 잡는다', () => {
    const evs = extractCoolEvents('7월 21일(화) 14:00 학폭위 심의', BASE);
    expect(evs).toHaveLength(1);
    expect(fmt(evs[0]!.start)).toBe('2026-07-21 14:00');
    expect(evs[0]!.allDay).toBe(false);
  });

  it('7/21 오후 2시 — 슬래시 날짜 + 오후 보정', () => {
    const evs = extractCoolEvents('회의는 7/21 오후 2시입니다', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-07-21 14:00');
  });

  it('7.21(화) — 시간이 없으면 종일 일정', () => {
    const evs = extractCoolEvents('7.21(화) 현장체험학습', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-07-21 00:00');
    expect(evs[0]!.allDay).toBe(true);
  });

  it('2026-09-01 09:00 — 연도까지 있는 형식', () => {
    const evs = extractCoolEvents('2026-09-01 09:00 개학식', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-09-01 09:00');
  });

  it('9시 30분 — 한국어 시/분', () => {
    const evs = extractCoolEvents('9월 1일 9시 30분 개학식', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-09-01 09:30');
  });

  it('2시반 — "반"은 30분', () => {
    const evs = extractCoolEvents('7월 21일 2시반 상담', BASE);
    expect(evs[0]!.start.getMinutes()).toBe(30);
  });

  it('저녁 7시 — 오후로 보정한다', () => {
    const evs = extractCoolEvents('7월 21일 저녁 7시 학부모 모임', BASE);
    expect(evs[0]!.start.getHours()).toBe(19);
  });

  it('12월에 받은 쪽지의 "1월 10일"은 이듬해다', () => {
    const evs = extractCoolEvents('1월 10일 방학식', new Date(2026, 11, 20));
    expect(fmt(evs[0]!.start)).toBe('2027-01-10 00:00');
  });
});

describe('상대 날짜 — 기준은 오늘이 아니라 쪽지 받은 날', () => {
  it('내일 10시', () => {
    const evs = extractCoolEvents('내일 10시 부장회의', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-07-17 10:00');
  });

  it('다음 주 화요일 (목요일에 받은 쪽지 → 7/21)', () => {
    const evs = extractCoolEvents('다음 주 화요일 14:00 회의', BASE);
    expect(fmt(evs[0]!.start)).toBe('2026-07-21 14:00');
  });

  it('★ 지난 쪽지의 "내일"은 그 쪽지 기준이다 — 오늘 기준이 아니다', () => {
    const oldBase = new Date(2026, 6, 1, 9, 0);
    const evs = extractCoolEvents('내일 오전 9시 제출', oldBase);
    expect(fmt(evs[0]!.start)).toBe('2026-07-02 09:00');
  });
});

describe('기간 · 기한 · 중복', () => {
  it('7/21~7/25 — 기간 하나로 합친다', () => {
    const evs = extractCoolEvents('7/21(월)~7/25(금) 여름방학 캠프', BASE);
    expect(evs).toHaveLength(1);
    expect(fmt(evs[0]!.start)).toBe('2026-07-21 00:00');
    expect(fmt(evs[0]!.end!)).toBe('2026-07-25 00:00');
  });

  it('"까지 제출"은 기한으로 표시한다 (할일로 추천하는 근거)', () => {
    const evs = extractCoolEvents('7월 21일까지 제출 바랍니다', BASE);
    expect(evs[0]!.isDeadline).toBe(true);
  });

  it('날짜가 없으면 빈 배열', () => {
    expect(extractCoolEvents('안녕하세요 감사합니다', BASE)).toEqual([]);
  });

  it('본문에 같은 날짜가 두 번 나와도 하나로 합친다', () => {
    const evs = extractCoolEvents('7월 21일 회의. 다시 안내: 7월 21일 회의', BASE);
    expect(evs).toHaveLength(1);
  });
});

describe('★ 오탐 방지 — 실사용에서 발견된 함정', () => {
  it('"2. 3" 같은 목록 번호를 날짜로 보지 않는다', () => {
    expect(extractCoolEvents('1. 준비물 안내\n2. 3학년 대상\n3. 문의처', BASE)).toEqual([]);
  });

  it('"1-2교시"를 날짜로 보지 않는다', () => {
    expect(extractCoolEvents('1-2교시에 진행합니다', BASE)).toEqual([]);
  });

  it('연도 없는 점·붙임표 날짜는 요일이나 "일" 표기가 있어야 인정한다', () => {
    expect(extractCoolEvents('7.21 행사', BASE)).toEqual([]); // 표기 없음 → 무시
    expect(extractCoolEvents('7.21(화) 행사', BASE)).toHaveLength(1); // 요일 있음 → 인정
    expect(extractCoolEvents('7.21일 행사', BASE)).toHaveLength(1); // '일' 있음 → 인정
  });

  it('"1:" 같은 조각을 시간으로 보지 않는다 — 분까지 있어야 한다', () => {
    const evs = extractCoolEvents('7월 21일 준비물 1: 필기구', BASE);
    expect(evs[0]!.allDay).toBe(true);
  });

  it('날짜 안의 숫자를 시간으로 다시 잡지 않는다 ("21일"의 21)', () => {
    const evs = extractCoolEvents('7월 21일 행사', BASE);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.allDay).toBe(true);
  });

  it('달력에 없는 날짜는 버린다', () => {
    expect(extractCoolEvents('2월 30일 회의', BASE)).toEqual([]);
  });
});

describe('보조 함수', () => {
  it('전각 문자를 반각으로 바꾼다', () => {
    expect(normalize('１４：００')).toBe('14:00');
  });

  it('normalize는 길이를 바꾸지 않는다 (span 위치 보존)', () => {
    const src = '７월 ２１일（화） １４：００';
    expect(normalize(src)).toHaveLength(src.length);
  });

  it('제목에서 날짜·시간 표현을 걷어낸다', () => {
    const t = stripCoolDateExpressions('[7월 21일(화) 14:00] 학폭위 심의', BASE);
    expect(t).not.toContain('7월');
    expect(t).toContain('학폭위');
    expect(t).toBe('학폭위 심의');
  });
});
