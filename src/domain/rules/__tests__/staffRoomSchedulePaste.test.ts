/**
 * 부서 일정 표 붙여넣기 파서
 *
 * 막으려는 사고: 20줄을 붙여넣었는데 12줄만 들어가고 **아무도 모르는 것**.
 * 그래서 날짜를 못 읽은 줄은 버리되 반드시 수를 세고, 없는 날짜(2월 31일)는
 * 통과시키지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePastedDate,
  parsePastedSchedule,
  STAFFROOM_PASTE_MAX_ROWS,
} from '@domain/rules/staffRoomSchedulePaste';

const YEAR = 2026; // 2026학년도

describe('날짜 읽기 — 학교 표에서 실제로 오는 모양들', () => {
  it.each([
    ['2026-03-02', '2026-03-02'],
    ['2026.3.2', '2026-03-02'],
    ['2026/3/2', '2026-03-02'],
    ['2026년 3월 2일', '2026-03-02'],
    ['3월 2일', '2026-03-02'],
    ['3/2', '2026-03-02'],
    ['3.2', '2026-03-02'],
    ['  3월 2일  ', '2026-03-02'],
  ])('%s → %s', (raw, expected) => {
    expect(parsePastedDate(raw, YEAR)).toBe(expected);
  });

  it('★ 1월·2월은 다음 해다 — 2026학년도 졸업식은 2027년 2월', () => {
    expect(parsePastedDate('2월 10일', YEAR)).toBe('2027-02-10');
    expect(parsePastedDate('1월 5일', YEAR)).toBe('2027-01-05');
    // 3월부터는 그해
    expect(parsePastedDate('3월 1일', YEAR)).toBe('2026-03-01');
    expect(parsePastedDate('12월 31일', YEAR)).toBe('2026-12-31');
  });

  it('연도가 적혀 있으면 학년도를 따지지 않는다 — 적힌 그대로', () => {
    expect(parsePastedDate('2025년 2월 10일', YEAR)).toBe('2025-02-10');
  });

  it('★ 없는 날짜는 통과시키지 않는다', () => {
    expect(parsePastedDate('2월 31일', YEAR)).toBe('');
    expect(parsePastedDate('2026-02-30', YEAR)).toBe('');
    expect(parsePastedDate('13월 1일', YEAR)).toBe('');
  });

  it('★ 윤년은 살린다 — 2028년 2월 29일은 있는 날이다', () => {
    expect(parsePastedDate('2028-02-29', YEAR)).toBe('2028-02-29');
    expect(parsePastedDate('2027-02-29', YEAR)).toBe('');
  });

  it('날짜가 아니면 빈 문자열', () => {
    expect(parsePastedDate('날짜', YEAR)).toBe('');
    expect(parsePastedDate('', YEAR)).toBe('');
  });
});

describe('표 읽기 — 칸 수로 뜻을 정한다', () => {
  it('2칸이면 날짜와 제목', () => {
    const r = parsePastedSchedule('3월 2일\t입학식', YEAR);
    expect(r.rows).toEqual([{ startsOn: '2026-03-02', title: '입학식', place: '', memo: '' }]);
  });

  it('3칸이면 장소까지', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\t체육관', YEAR);
    expect(r.rows[0]).toEqual({
      startsOn: '2026-03-02',
      title: '입학식',
      place: '체육관',
      memo: '',
    });
  });

  it('4칸 넘으면 나머지는 메모로 합친다', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\t체육관\t8시 30분\t학부모 참석', YEAR);
    expect(r.rows[0]?.memo).toBe('8시 30분 학부모 참석');
  });

  it('쉼표로도 읽는다 — 탭이 없는 표', () => {
    const r = parsePastedSchedule('3월 2일,입학식,체육관', YEAR);
    expect(r.rows[0]?.title).toBe('입학식');
  });

  it('★ 탭이 있으면 탭이 먼저다 — 제목에 쉼표가 있어도 안 갈린다', () => {
    const r = parsePastedSchedule('3월 2일\t입학식, 시업식\t체육관', YEAR);
    expect(r.rows[0]?.title).toBe('입학식, 시업식');
  });
});

describe('★ 읽지 못한 줄은 조용히 버리지 않는다', () => {
  it('날짜를 못 읽은 줄을 센다', () => {
    const text = ['날짜\t내용', '3월 2일\t입학식', '아무 글', '3월 5일\t학부모총회'].join('\n');
    const r = parsePastedSchedule(text, YEAR);
    expect(r.rows).toHaveLength(2);
    expect(r.droppedLines).toBe(2); // 표 머리글 + 아무 글
  });

  it('빈 줄은 버린 것으로 세지 않는다 — 표 끝의 빈 줄로 겁주지 않는다', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\n\n\n', YEAR);
    expect(r.rows).toHaveLength(1);
    expect(r.droppedLines).toBe(0);
  });

  it('날짜만 있고 내용이 없으면 일정이 아니다', () => {
    const r = parsePastedSchedule('3월 2일\t\t', YEAR);
    expect(r.rows).toHaveLength(0);
    expect(r.droppedLines).toBe(1);
  });
});

describe('중복 — 표를 두 번 붙여넣어도 한 번만', () => {
  it('같은 날 같은 제목은 하나로', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\n3월 2일\t입학식', YEAR);
    expect(r.rows).toHaveLength(1);
  });

  it('★ 장소가 다르면 먼저 온 것을 남긴다 — 미리보기와 저장된 것이 달라지면 안 된다', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\t체육관\n3월 2일\t입학식\t운동장', YEAR);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.place).toBe('체육관');
  });

  it('제목이 다르면 둘 다 남는다', () => {
    const r = parsePastedSchedule('3월 2일\t입학식\n3월 2일\t시업식', YEAR);
    expect(r.rows).toHaveLength(2);
  });
});

describe('상한', () => {
  it(`${STAFFROOM_PASTE_MAX_ROWS}줄에서 멈춘다`, () => {
    const lines = Array.from({ length: 300 }, (_, i) => `3월 2일\t행사 ${i}`).join('\n');
    expect(parsePastedSchedule(lines, YEAR).rows).toHaveLength(STAFFROOM_PASTE_MAX_ROWS);
  });

  it('제목이 아주 길어도 잘라서 담는다', () => {
    const long = 'ㄱ'.repeat(500);
    const r = parsePastedSchedule(`3월 2일\t${long}`, YEAR);
    expect(r.rows[0]?.title.length).toBe(100);
  });
});
