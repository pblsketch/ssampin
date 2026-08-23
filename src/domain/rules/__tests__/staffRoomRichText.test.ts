/**
 * 온라인 교무실 — 서식 본문 읽기 테스트 (ADR-069)
 *
 * 이 파일은 **보안 경계를 지키는 테스트**다. 교무실은 남이 쓴 글이 내 화면에
 * 펼쳐지는 기능이라, "아는 것만 통과시킨다"가 무너지면 바로 사고가 된다.
 */
import { describe, expect, it } from 'vitest';
import {
  parseStaffRoomRichText,
  staffRoomRichTextToPlain,
  STAFFROOM_TEXT_COLORS,
  STAFFROOM_TEXT_SIZES,
} from '@domain/rules/staffRoomRichText';

/** 편집기가 저장하는 모양대로 만든다 */
function doc(...paragraphs: unknown[][]): string {
  return JSON.stringify({
    root: {
      type: 'root',
      children: paragraphs.map((children) => ({ type: 'paragraph', children })),
    },
  });
}

function text(t: string, extra: Record<string, unknown> = {}) {
  return { type: 'text', text: t, format: 0, style: '', ...extra };
}

describe('서식 본문 — 글자와 꾸밈을 읽는다', () => {
  it('맨 글자를 읽는다', () => {
    const blocks = parseStaffRoomRichText(doc([text('안녕하세요')]));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.spans[0]!.text).toBe('안녕하세요');
  });

  it('굵게·기울임·밑줄·취소선을 각각 읽는다', () => {
    // Lexical 은 꾸밈을 숫자 하나에 비트로 얹는다: 굵게1 기울임2 취소선4 밑줄8
    const blocks = parseStaffRoomRichText(
      doc([
        text('가', { format: 1 }),
        text('나', { format: 2 }),
        text('다', { format: 4 }),
        text('라', { format: 8 }),
      ]),
    );
    const [가, 나, 다, 라] = blocks[0]!.spans;
    expect(가!.bold).toBe(true);
    expect(나!.italic).toBe(true);
    expect(다!.strikethrough).toBe(true);
    expect(라!.underline).toBe(true);
  });

  it('꾸밈을 겹쳐 쓴 것도 읽는다 (굵게 + 밑줄 = 9)', () => {
    const span = parseStaffRoomRichText(doc([text('필독', { format: 9 })]))[0]!.spans[0]!;
    expect(span.bold).toBe(true);
    expect(span.underline).toBe(true);
    expect(span.italic).toBe(false);
  });

  it('문단이 여러 개면 그대로 나뉜다', () => {
    const blocks = parseStaffRoomRichText(doc([text('첫 줄')], [text('둘째 줄')]));
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.spans[0]!.text).toBe('둘째 줄');
  });
});

describe('서식 본문 — 색과 크기는 정해진 목록만', () => {
  it('목록에 있는 색을 알아본다', () => {
    const span = parseStaffRoomRichText(
      doc([text('중요', { style: STAFFROOM_TEXT_COLORS.error })]),
    )[0]!.spans[0]!;
    expect(span.color).toBe('error');
  });

  it('색과 크기를 함께 쓴 것도 각각 알아본다', () => {
    const style = `${STAFFROOM_TEXT_COLORS.accent}; ${STAFFROOM_TEXT_SIZES.large}`;
    const span = parseStaffRoomRichText(doc([text('제목', { style })]))[0]!.spans[0]!;
    expect(span.color).toBe('accent');
    expect(span.size).toBe('large');
  });

  it('띄어쓰기가 달라도 같은 값으로 알아본다 (편집기가 저장하는 모양 차이 흡수)', () => {
    for (const style of [
      'color:var(--sp-error)',
      'color:   var(--sp-error)',
      '  COLOR : var(--sp-error) ',
      'color: var(--sp-error);',
    ]) {
      const span = parseStaffRoomRichText(doc([text('중요', { style })]))[0]!.spans[0]!;
      expect(span.color, style).toBe('error');
    }
  });

  it('목록에 없는 색은 기본으로 떨어진다', () => {
    const span = parseStaffRoomRichText(doc([text('빨강', { style: 'color: red' })]))[0]!.spans[0]!;
    expect(span.color).toBe('default');
  });

  it('🔒 위험한 꾸밈이 섞여 있어도 통째로 버리고 글자는 살린다', () => {
    const span = parseStaffRoomRichText(
      doc([
        text('공지', {
          style: 'color: red; background: url(javascript:alert(1)); position: fixed; top: 0',
        }),
      ]),
    )[0]!.spans[0]!;
    expect(span.color).toBe('default');
    expect(span.size).toBe('normal');
    // 글을 통째로 거부하지 않는다 — 선생님에게는 "안 보인다"가 더 나쁘다
    expect(span.text).toBe('공지');
  });

  it('🔒 허용 값에 다른 것을 덧붙인 꾸밈은 통과하지 못한다', () => {
    const sneaky = `${STAFFROOM_TEXT_COLORS.error} !important; behavior: url(#x)`;
    const span = parseStaffRoomRichText(doc([text('시도', { style: sneaky })]))[0]!.spans[0]!;
    expect(span.color).toBe('default');
  });
});

describe('서식 본문 — 깨진 값이 와도 화면을 무너뜨리지 않는다', () => {
  it('JSON 이 아니면 빈 목록', () => {
    expect(parseStaffRoomRichText('이건 그냥 글자입니다')).toEqual([]);
  });

  it('빈 문자열이어도 던지지 않는다', () => {
    expect(parseStaffRoomRichText('')).toEqual([]);
  });

  it('모양이 다른 JSON 이어도 던지지 않는다', () => {
    expect(parseStaffRoomRichText('{"뭔가":123}')).toEqual([]);
    expect(parseStaffRoomRichText('[1,2,3]')).toEqual([]);
    expect(parseStaffRoomRichText('null')).toEqual([]);
  });

  it('모르는 종류의 조각은 건너뛰되 안쪽 글자는 살린다', () => {
    const weird = JSON.stringify({
      root: {
        type: 'root',
        children: [{ type: '아직-없는-종류', children: [text('안쪽 글자')] }],
      },
    });
    expect(parseStaffRoomRichText(weird)[0]!.spans[0]!.text).toBe('안쪽 글자');
  });

  it('글자가 아닌 값이 text 자리에 와도 무시한다', () => {
    const blocks = parseStaffRoomRichText(
      doc([{ type: 'text', text: 12345, format: 0 }, text('진짜 글자')]),
    );
    expect(blocks[0]!.spans).toHaveLength(1);
    expect(blocks[0]!.spans[0]!.text).toBe('진짜 글자');
  });
});

describe('서식 본문 — 순수 글자 뽑기', () => {
  it('꾸밈을 빼고 글자만 잇는다', () => {
    const body = doc([text('학년부 ', { format: 1 }), text('회의')], [text('목요일')]);
    expect(staffRoomRichTextToPlain(body)).toBe('학년부 회의\n목요일');
  });

  it('읽을 수 없는 본문은 빈 문자열 — JSON 속 낱말이 새어 나오지 않는다', () => {
    // 이게 새면 검색이 "paragraph" 같은 낱말을 찾아내는 우스운 일이 생긴다
    expect(staffRoomRichTextToPlain('{"root":')).toBe('');
  });
});
