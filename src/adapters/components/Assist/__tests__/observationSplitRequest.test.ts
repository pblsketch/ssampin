/**
 * 말로 쓴 글 "학생별로 나누기" 통로 — 규칙 테스트.
 *
 * 이 통로가 조용히 틀리면 두 가지가 난다.
 *  1. 지시문에서 쓰기 의도를 나타내는 말이 빠지면 **모델에게 도구 목록이 안 나가서**
 *     제안이 아예 만들어지지 않는다(useAssistStore 의 wantsToolSelection).
 *     실제로 학생 쓰기 3종을 열 때 이 문턱만 옛 말투로 남아 기능이 안 됐던 적이 있다.
 *  2. 구독을 안 풀면 창을 껐다 켤 때마다 같은 요청이 여러 번 나간다.
 */
import { describe, it, expect, vi } from 'vitest';
import { mentionsWriteIntent } from '@domain/rules/assistWriteIntent';
import {
  OBSERVATION_SPLIT_MIN_LENGTH,
  buildSplitQuestion,
  isSplitWorthwhile,
  requestObservationSplit,
  subscribeObservationSplit,
} from '../observationSplitRequest';

const LONG_MEMO =
  '3번은 삼투압 실험에서 농도를 왜 그렇게 잡았는지 되물었고, 12번은 그래프 축을 바꿔 다시 그려 왔다.';

describe('지시문', () => {
  it('쓰기 의도로 읽힌다 — 이게 아니면 모델에게 도구 목록이 나가지 않는다', () => {
    expect(mentionsWriteIntent(buildSplitQuestion(LONG_MEMO))).toBe(true);
  });

  it('받아쓴 원문을 그대로 담는다', () => {
    expect(buildSplitQuestion(LONG_MEMO)).toContain(LONG_MEMO);
  });

  it('"짓지 말고 옮기라"를 명시한다 (ADR-074 결정 2)', () => {
    const q = buildSplitQuestion(LONG_MEMO);
    expect(q).toContain('새로 짓지 말고');
    expect(q).toContain('그대로 옮겨');
  });

  it('앞뒤 공백은 다듬어 보낸다', () => {
    expect(buildSplitQuestion(`  ${LONG_MEMO}  `)).toContain(LONG_MEMO);
    expect(buildSplitQuestion(`  ${LONG_MEMO}  `).endsWith(' ')).toBe(false);
  });
});

describe('언제 권하는가', () => {
  it('짧은 글에는 권하지 않는다 — 한 명 이야기 한 줄을 AI 에 태울 이유가 없다', () => {
    expect(isSplitWorthwhile('오늘 발표 잘함')).toBe(false);
  });

  it('여러 학생이 섞일 만큼 길면 권한다', () => {
    expect(isSplitWorthwhile(LONG_MEMO)).toBe(true);
  });

  it('공백만 채운 글은 길어도 권하지 않는다', () => {
    expect(isSplitWorthwhile(' '.repeat(OBSERVATION_SPLIT_MIN_LENGTH + 10))).toBe(false);
  });
});

describe('구독', () => {
  it('구독자에게 원문이 그대로 간다', () => {
    const seen = vi.fn();
    const off = subscribeObservationSplit(seen);
    requestObservationSplit(LONG_MEMO);
    expect(seen).toHaveBeenCalledWith(LONG_MEMO);
    off();
  });

  it('구독을 풀면 더 이상 받지 않는다 — 창을 껐다 켜도 중복 요청이 없다', () => {
    const seen = vi.fn();
    subscribeObservationSplit(seen)();
    requestObservationSplit(LONG_MEMO);
    expect(seen).not.toHaveBeenCalled();
  });

  it('짧은 글이면 아무에게도 알리지 않는다', () => {
    const seen = vi.fn();
    const off = subscribeObservationSplit(seen);
    requestObservationSplit('짧음');
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});
