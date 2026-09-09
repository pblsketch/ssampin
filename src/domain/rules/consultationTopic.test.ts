import { describe, expect, it } from 'vitest';
import {
  MAX_TOPIC_OPTIONS,
  MAX_TOPIC_OPTION_LENGTH,
  composeConsultationTopic,
  formatConsultationTopicLine,
  normalizeTopicOptions,
  parseConsultationTopic,
} from './consultationTopic';

describe('normalizeTopicOptions', () => {
  it('앞뒤 공백을 지우고 빈 항목을 버린다', () => {
    expect(normalizeTopicOptions([' 학교생활 ', '', '   ', '교우관계'])).toEqual([
      '학교생활',
      '교우관계',
    ]);
  });

  it('같은 주제를 두 번 담지 않는다 (공백만 다른 것도 같은 것)', () => {
    expect(normalizeTopicOptions(['학교생활', '학교생활 ', ' 학교생활'])).toEqual(['학교생활']);
  });

  it(`한 항목은 ${MAX_TOPIC_OPTION_LENGTH}자까지만 남긴다`, () => {
    const long = '가'.repeat(MAX_TOPIC_OPTION_LENGTH + 5);
    expect(normalizeTopicOptions([long])).toEqual(['가'.repeat(MAX_TOPIC_OPTION_LENGTH)]);
  });

  it('구분자와 같은 모양(가운뎃점 앞뒤 공백)은 항목 안에 남기지 않는다', () => {
    // 남겨 두면 예약자가 고른 뒤 "진로"와 "진학" 두 개로 쪼개져 보인다.
    expect(normalizeTopicOptions(['진로 · 진학'])).toEqual(['진로·진학']);
    const composed = composeConsultationTopic(normalizeTopicOptions(['진로 · 진학']), '');
    expect(parseConsultationTopic(composed).topics).toEqual(['진로·진학']);
  });

  it('줄바꿈은 한 칸으로 눕힌다 (첫 줄만 주제로 읽혀 나머지가 새는 것을 막는다)', () => {
    expect(normalizeTopicOptions(['학교\n생활'])).toEqual(['학교 생활']);
    const composed = composeConsultationTopic(normalizeTopicOptions(['학교\n생활']), '메모');
    expect(parseConsultationTopic(composed)).toEqual({ topics: ['학교 생활'], note: '메모' });
  });

  it(`선택지는 ${MAX_TOPIC_OPTIONS}개를 넘지 않는다`, () => {
    const many = Array.from({ length: MAX_TOPIC_OPTIONS + 4 }, (_, i) => `주제${i}`);
    expect(normalizeTopicOptions(many)).toHaveLength(MAX_TOPIC_OPTIONS);
  });
});

describe('composeConsultationTopic ↔ parseConsultationTopic', () => {
  it('고른 주제만 있으면 접두사 한 줄로 담긴다', () => {
    const composed = composeConsultationTopic(['학교생활', '교우관계'], '');
    expect(composed).toBe('[주제] 학교생활 · 교우관계');
    expect(parseConsultationTopic(composed)).toEqual({
      topics: ['학교생활', '교우관계'],
      note: '',
    });
  });

  it('직접 적은 글만 있으면 접두사를 붙이지 않는다', () => {
    const composed = composeConsultationTopic([], '요즘 친구 문제로 힘들어합니다.');
    expect(composed).toBe('요즘 친구 문제로 힘들어합니다.');
    expect(parseConsultationTopic(composed)).toEqual({
      topics: [],
      note: '요즘 친구 문제로 힘들어합니다.',
    });
  });

  it('둘 다 있으면 첫 줄이 주제, 나머지가 직접 적은 글이다', () => {
    const composed = composeConsultationTopic(['진로·진학'], '2학기 선택과목을 상의하고 싶습니다.');
    expect(parseConsultationTopic(composed)).toEqual({
      topics: ['진로·진학'],
      note: '2학기 선택과목을 상의하고 싶습니다.',
    });
  });

  it('직접 적은 글이 여러 줄이어도 통째로 살린다', () => {
    const note = '첫 줄입니다.\n둘째 줄입니다.';
    const composed = composeConsultationTopic(['학습·성적'], note);
    expect(parseConsultationTopic(composed).note).toBe(note);
  });

  it('둘 다 비면 빈 문자열 — 호출부가 암호화 자체를 건너뛰는 신호다', () => {
    expect(composeConsultationTopic([], '   ')).toBe('');
    expect(parseConsultationTopic('')).toEqual({ topics: [], note: '' });
    expect(parseConsultationTopic(undefined)).toEqual({ topics: [], note: '' });
  });

  it('이 기능 이전에 들어온 예약(접두사 없는 자유 글)도 그대로 열린다', () => {
    expect(parseConsultationTopic('아이가 학교에서 어떻게 지내는지 궁금합니다')).toEqual({
      topics: [],
      note: '아이가 학교에서 어떻게 지내는지 궁금합니다',
    });
  });
});

describe('formatConsultationTopicLine', () => {
  it('엑셀·캘린더용으로 줄바꿈 없이 한 줄로 눕힌다', () => {
    const composed = composeConsultationTopic(['학교생활', '교우관계'], '친구 문제');
    const line = formatConsultationTopicLine(composed);
    expect(line).toBe('학교생활, 교우관계 / 친구 문제');
    expect(line).not.toContain('\n');
  });

  it('한쪽만 있으면 구분자를 남기지 않는다', () => {
    expect(formatConsultationTopicLine('[주제] 학교생활')).toBe('학교생활');
    expect(formatConsultationTopicLine('직접 적은 글')).toBe('직접 적은 글');
    expect(formatConsultationTopicLine('')).toBe('');
  });
});
