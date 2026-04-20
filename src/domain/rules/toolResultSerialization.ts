import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';

/**
 * 테이블 뷰 · Excel Sheet 2 공통 셀 값 변환 규칙.
 * 순수 함수 — React/ExcelJS 의존 없음.
 *
 * 타입 참고:
 * - MultiSurveyTemplateQuestion.options는 non-optional readonly 배열
 * - text/scale 질문에서는 빈 배열이 올 수 있음 (유효한 상태)
 */

export interface SerializedCell {
  /** 화면·Excel 셀에 표시할 문자열 */
  readonly display: string;
  /** Excel 정렬·필터 기준 원시 값 (숫자는 number, 그 외 문자열 또는 null) */
  readonly raw: string | number | null;
}

type AnswerInput = { readonly value: string | string[] | number } | undefined;

/**
 * 단일 응답 셀 직렬화.
 * - single-choice: option id → text
 * - multi-choice: option ids → text[] → '; ' 조인
 * - text: 문자열 그대로
 * - scale: number → 숫자 셀
 * - 미응답(undefined): 빈 셀
 */
export function serializeAnswerCell(
  question: MultiSurveyTemplateQuestion,
  answer: AnswerInput,
): SerializedCell {
  if (!answer) return { display: '', raw: null };

  switch (question.type) {
    case 'single-choice': {
      if (typeof answer.value !== 'string') return { display: '', raw: null };
      const opt = question.options.find((o) => o.id === answer.value);
      if (!opt) {
        // 데이터 불일치 (옵션 id 타이포 등) — 경고 후 빈 표시
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(
            `[serializeAnswerCell] single-choice option id not found: ${answer.value} in question ${question.id}`,
          );
        }
        return { display: '', raw: null };
      }
      return { display: opt.text, raw: opt.text };
    }
    case 'multi-choice': {
      const ids = Array.isArray(answer.value) ? answer.value : [];
      const texts = ids
        .map((id) => question.options.find((o) => o.id === id)?.text)
        .filter((t): t is string => typeof t === 'string');
      const joined = texts.join('; ');
      return { display: joined, raw: joined };
    }
    case 'text': {
      const text = typeof answer.value === 'string' ? answer.value : '';
      return { display: text, raw: text };
    }
    case 'scale': {
      const n = typeof answer.value === 'number' && !Number.isNaN(answer.value)
        ? answer.value
        : null;
      return { display: n !== null ? String(n) : '', raw: n };
    }
  }
}

/**
 * 제출 순서 기반 응답자 라벨.
 * Phase 1은 로그인 기능 없음 → 파라미터 단순화.
 * Phase 2+ 로그인 도입 시 `formatRespondentLabel(index, { anonymous, submittedBy })`로 확장.
 */
export function formatSubmissionLabel(submissionIndex: number): string {
  return `응답 ${submissionIndex + 1}`;
}

/**
 * Excel 파일명 안전 문자열.
 * Windows/Mac 파일시스템 금지 문자 제거 + 경로 주입 방지 (§7 보안 요건).
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || '결과';
}
