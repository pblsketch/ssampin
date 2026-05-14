/**
 * renderAnswerPreview 단위 테스트 — Design §5.3.2 라이브 카드 미리보기 헬퍼.
 *
 * 문항 타입별로 답변을 한 줄 문자열로 요약한다.
 *  - single-choice: 옵션 텍스트
 *  - multi-choice: 옵션 텍스트들을 ", "로 join
 *  - text: trim된 입력 텍스트 (빈 답변 fallback)
 *  - scale: "값/scaleMax"
 *  - undefined: "—"
 */
import { describe, expect, it } from 'vitest';
import { renderAnswerPreview } from './ToolMultiSurvey';

type EditableQuestion = Parameters<typeof renderAnswerPreview>[0];

const baseQ: EditableQuestion = {
  id: 'q1',
  type: 'text',
  question: '아무거나',
  required: false,
  options: [],
  maxLength: 200,
  scaleMin: 1,
  scaleMax: 5,
  scaleMinLabel: '',
  scaleMaxLabel: '',
};

describe('renderAnswerPreview', () => {
  describe('text 문항', () => {
    it('정상 텍스트 답변은 그대로 반환', () => {
      expect(renderAnswerPreview({ ...baseQ, type: 'text' }, '안녕하세요')).toBe('안녕하세요');
    });

    it('빈 문자열은 "(빈 답변)"으로 표시', () => {
      expect(renderAnswerPreview({ ...baseQ, type: 'text' }, '')).toBe('(빈 답변)');
    });

    it('공백만 있는 답변도 "(빈 답변)"', () => {
      expect(renderAnswerPreview({ ...baseQ, type: 'text' }, '   ')).toBe('(빈 답변)');
    });
  });

  describe('single-choice 문항', () => {
    const q: EditableQuestion = {
      ...baseQ,
      type: 'single-choice',
      options: [
        { id: 'opt-A', text: '찬성' },
        { id: 'opt-B', text: '반대' },
      ],
    };

    it('옵션 ID → 옵션 텍스트', () => {
      expect(renderAnswerPreview(q, 'opt-A')).toBe('찬성');
      expect(renderAnswerPreview(q, 'opt-B')).toBe('반대');
    });

    it('알 수 없는 옵션 ID는 fallback', () => {
      expect(renderAnswerPreview(q, 'unknown')).toBe('(선택값 없음)');
    });
  });

  describe('multi-choice 문항', () => {
    const q: EditableQuestion = {
      ...baseQ,
      type: 'multi-choice',
      options: [
        { id: 'a', text: '사과' },
        { id: 'b', text: '바나나' },
        { id: 'c', text: '체리' },
      ],
    };

    it('배열 → ", "로 join', () => {
      expect(renderAnswerPreview(q, ['a', 'c'])).toBe('사과, 체리');
    });

    it('빈 배열은 "(선택값 없음)"', () => {
      expect(renderAnswerPreview(q, [])).toBe('(선택값 없음)');
    });

    it('알 수 없는 ID는 필터링 → 모두 무효 시 "(선택값 없음)"', () => {
      expect(renderAnswerPreview(q, ['unknown'])).toBe('(선택값 없음)');
    });

    it('일부만 유효해도 유효분만 join', () => {
      expect(renderAnswerPreview(q, ['a', 'unknown', 'b'])).toBe('사과, 바나나');
    });

    it('단일 값(string)도 배열처럼 처리', () => {
      expect(renderAnswerPreview(q, 'a' as unknown as string[])).toBe('사과');
    });
  });

  describe('scale 문항', () => {
    const q: EditableQuestion = { ...baseQ, type: 'scale', scaleMax: 5 };

    it('값/최대 형식', () => {
      expect(renderAnswerPreview(q, 4)).toBe('4/5');
    });

    it('scaleMax 10이면 값/10', () => {
      expect(renderAnswerPreview({ ...q, scaleMax: 10 }, 7)).toBe('7/10');
    });
  });

  describe('undefined 답변', () => {
    it('값이 없으면 "—"', () => {
      expect(renderAnswerPreview({ ...baseQ, type: 'text' }, undefined)).toBe('—');
      expect(renderAnswerPreview({ ...baseQ, type: 'single-choice' }, undefined)).toBe('—');
      expect(renderAnswerPreview({ ...baseQ, type: 'scale' }, undefined)).toBe('—');
    });
  });
});
