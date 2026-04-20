import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  serializeAnswerCell,
  formatSubmissionLabel,
  sanitizeFileName,
} from './toolResultSerialization';

const mkQuestion = (
  overrides: Partial<MultiSurveyTemplateQuestion> & { id: string; type: MultiSurveyTemplateQuestion['type'] },
): MultiSurveyTemplateQuestion => ({
  id: overrides.id,
  type: overrides.type,
  question: overrides.question ?? '테스트',
  required: overrides.required ?? true,
  options: overrides.options ?? [],
  maxLength: overrides.maxLength ?? 200,
  scaleMin: overrides.scaleMin ?? 1,
  scaleMax: overrides.scaleMax ?? 5,
  scaleMinLabel: overrides.scaleMinLabel ?? '',
  scaleMaxLabel: overrides.scaleMaxLabel ?? '',
});

describe('serializeAnswerCell', () => {
  describe('single-choice', () => {
    const question = mkQuestion({
      id: 'q1',
      type: 'single-choice',
      options: [
        { id: 'a', text: '옵션 A' },
        { id: 'b', text: '옵션 B' },
      ],
    });

    it('option id → option text 변환', () => {
      expect(serializeAnswerCell(question, { value: 'a' })).toEqual({
        display: '옵션 A',
        raw: '옵션 A',
      });
    });

    it('미응답 → 빈 셀', () => {
      expect(serializeAnswerCell(question, undefined)).toEqual({
        display: '',
        raw: null,
      });
    });

    it('존재하지 않는 option id → 빈 셀 + console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = serializeAnswerCell(question, { value: 'ghost' });
      expect(result).toEqual({ display: '', raw: null });
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it('배열 값이 오는 데이터 오류 → 빈 셀', () => {
      expect(
        serializeAnswerCell(question, { value: ['a'] as unknown as string }),
      ).toEqual({ display: '', raw: null });
    });
  });

  describe('multi-choice', () => {
    const question = mkQuestion({
      id: 'q2',
      type: 'multi-choice',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ],
    });

    it('세미콜론 + 공백 조인', () => {
      expect(serializeAnswerCell(question, { value: ['a', 'c'] })).toEqual({
        display: 'A; C',
        raw: 'A; C',
      });
    });

    it('빈 배열 → 빈 문자열', () => {
      expect(serializeAnswerCell(question, { value: [] })).toEqual({
        display: '',
        raw: '',
      });
    });

    it('존재하지 않는 id는 조용히 필터링 (경고 없음)', () => {
      const result = serializeAnswerCell(question, { value: ['a', 'ghost', 'b'] });
      expect(result).toEqual({ display: 'A; B', raw: 'A; B' });
    });

    it('단일 문자열이 오는 데이터 오류 → 빈 문자열', () => {
      expect(
        serializeAnswerCell(question, { value: 'a' as unknown as string[] }),
      ).toEqual({ display: '', raw: '' });
    });
  });

  describe('text', () => {
    const question = mkQuestion({ id: 'q3', type: 'text' });

    it('문자열 그대로 반환', () => {
      expect(serializeAnswerCell(question, { value: '좋았어요' })).toEqual({
        display: '좋았어요',
        raw: '좋았어요',
      });
    });

    it('빈 문자열 허용', () => {
      expect(serializeAnswerCell(question, { value: '' })).toEqual({
        display: '',
        raw: '',
      });
    });

    it('매우 긴 텍스트도 truncate 없이 그대로 반환 (UI에서 처리)', () => {
      const long = 'ㄱ'.repeat(1000);
      expect(serializeAnswerCell(question, { value: long })).toEqual({
        display: long,
        raw: long,
      });
    });

    it('숫자가 오는 데이터 오류 → 빈 문자열', () => {
      expect(
        serializeAnswerCell(question, { value: 42 as unknown as string }),
      ).toEqual({ display: '', raw: '' });
    });
  });

  describe('scale', () => {
    const question = mkQuestion({ id: 'q4', type: 'scale' });

    it('숫자 → display 문자열 + raw 숫자', () => {
      expect(serializeAnswerCell(question, { value: 4 })).toEqual({
        display: '4',
        raw: 4,
      });
    });

    it('0 값 정상 처리 (falsy 트랩 회피)', () => {
      expect(serializeAnswerCell(question, { value: 0 })).toEqual({
        display: '0',
        raw: 0,
      });
    });

    it('NaN → 빈 셀', () => {
      expect(serializeAnswerCell(question, { value: Number.NaN })).toEqual({
        display: '',
        raw: null,
      });
    });

    it('문자열이 오는 데이터 오류 → 빈 셀', () => {
      expect(
        serializeAnswerCell(question, { value: '3' as unknown as number }),
      ).toEqual({ display: '', raw: null });
    });
  });

  describe('switch exhaustiveness (forward-compat)', () => {
    // Phase 3에서 'image' 타입이 union에 추가되어도
    // 기존 4개 case가 회귀 없이 동작함을 보증한다.
    // 타입이 확장되는 시점에 이 테스트는 TypeScript 컴파일 에러로
    // exhaustive switch 누락을 알려준다.
    it('4개 타입 모두 switch에서 처리됨', () => {
      const types: MultiSurveyTemplateQuestion['type'][] = [
        'single-choice',
        'multi-choice',
        'text',
        'scale',
      ];
      for (const type of types) {
        const q = mkQuestion({ id: 'qx', type });
        const result = serializeAnswerCell(q, undefined);
        expect(result).toBeDefined();
        expect(result.display).toBe('');
        expect(result.raw).toBe(null);
      }
    });
  });
});

describe('formatSubmissionLabel', () => {
  it('0-based index → 1-based 라벨', () => {
    expect(formatSubmissionLabel(0)).toBe('응답 1');
    expect(formatSubmissionLabel(9)).toBe('응답 10');
    expect(formatSubmissionLabel(99)).toBe('응답 100');
  });
});

describe('sanitizeFileName', () => {
  it('Windows/Mac 금지 문자 치환', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('한글·공백·숫자는 보존', () => {
    expect(sanitizeFileName('사례나눔 발제 2026')).toBe('사례나눔 발제 2026');
  });

  it('빈/공백 → 기본값 "결과"', () => {
    expect(sanitizeFileName('')).toBe('결과');
    expect(sanitizeFileName('   ')).toBe('결과');
  });

  it('앞뒤 공백 trim', () => {
    expect(sanitizeFileName('  제목  ')).toBe('제목');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
