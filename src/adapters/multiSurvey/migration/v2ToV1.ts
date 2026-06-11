/**
 * v2 → v1 역방향 변환 어댑터 (Design §4.2, worker-2 영역).
 *
 * 라운드트립 검증용 — lossy (v2-only opts 손실, v1 공유 필드 무손실).
 * quiz 타입(ox/multiple/short/blank/description)은 v1 역변환 불가 — throw.
 */

import type { MultiSurveyV2 } from '../../../domain/entities/multiSurvey/MultiSurveyV2.ts';
import { isQuizType } from '../../../domain/entities/multiSurvey/Question.ts';
import type { MultiSurvey, MultiSurveyQuestion } from '../../../domain/entities/MultiSurvey.ts';

// ──────────────────────────────────────────────
// Per-question reverse mapper
// ──────────────────────────────────────────────

function reverseMapQuestion(q: MultiSurveyV2['questions'][number]): MultiSurveyQuestion {
  if (isQuizType(q.type)) {
    throw new Error(
      'v2ToV1 cannot reverse quiz type: ' + q.type + '. Caller must pre-filter quiz questions.',
    );
  }

  // q.type is now narrowed to 'single-choice' | 'multi-choice' | 'text' | 'scale'
  const base: Pick<MultiSurveyQuestion, 'id' | 'type' | 'question' | 'required'> = {
    id: q.id,
    type: q.type,
    question: q.text, // v2 text → v1 question
    required: true, // v1 had this but v2 dropped it; default true
  };

  switch (q.type) {
    case 'single-choice':
    case 'multi-choice': {
      return {
        ...base,
        options: q.options,
      };
    }
    case 'text': {
      return {
        ...base,
        ...(q.maxLength !== undefined ? { maxLength: q.maxLength } : {}),
      };
    }
    case 'scale': {
      return {
        ...base,
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        ...(q.scaleMinLabel !== undefined ? { scaleMinLabel: q.scaleMinLabel } : {}),
        ...(q.scaleMaxLabel !== undefined ? { scaleMaxLabel: q.scaleMaxLabel } : {}),
      };
    }
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * MultiSurveyV2 → v1 MultiSurvey 역방향 변환.
 * Pure function. I/O 없음.
 * v2-only 필드(opts 3그룹, formatVersion)는 손실됨 (Design §4.2 명시 허용).
 *
 * @throws Error if any question has a quiz type (v2-only, not reversible)
 */
export function migrateV2ToV1(v2: MultiSurveyV2): MultiSurvey {
  const questions: MultiSurveyQuestion[] = v2.questions.map((q) => reverseMapQuestion(q));

  return {
    id: v2.id,
    title: v2.title,
    questions,
    submissions: [], // 휘발성 — forward에서 discard했으므로 항상 빈 배열
    isOpen: false,
    createdAt: new Date(v2.createdAt).getTime(), // ISO → epoch ms
  };
}
