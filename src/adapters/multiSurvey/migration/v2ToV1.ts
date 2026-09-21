/**
 * v2 → v1 역방향 변환 어댑터 (Design §4.2, worker-2 영역).
 *
 * 라운드트립 검증용 — lossy (v2-only opts 손실, v1 공유 필드 무손실).
 * quiz 타입(ox/multiple/short/blank/description)은 v1 역변환 불가 — throw.
 * 의견 수집 2종(wordcloud/qna)은 v1에 대응 유형이 없어 '주관식(text)'으로 근사 변환한다
 * (문구 보존 우선 — throw 하지 않는다).
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
  //                            | 'wordcloud' | 'qna' (의견 수집 2종)
  const base: Pick<MultiSurveyQuestion, 'id' | 'question' | 'required'> = {
    id: q.id,
    question: q.text, // v2 text → v1 question
    required: true, // v1 had this but v2 dropped it; default true
  };

  switch (q.type) {
    case 'single-choice':
    case 'multi-choice': {
      return {
        ...base,
        type: q.type,
        options: q.options,
      };
    }
    case 'text': {
      return {
        ...base,
        type: 'text',
        ...(q.maxLength !== undefined ? { maxLength: q.maxLength } : {}),
      };
    }
    case 'scale': {
      return {
        ...base,
        type: 'scale',
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        ...(q.scaleMinLabel !== undefined ? { scaleMinLabel: q.scaleMinLabel } : {}),
        ...(q.scaleMaxLabel !== undefined ? { scaleMaxLabel: q.scaleMaxLabel } : {}),
      };
    }
    // 의견 수집 2종은 v1에 대응 유형이 없다. 질문 문구를 잃지 않는 쪽을 택해
    // v1 '주관식(text)'으로 **근사 변환**한다. 표시 방식(단어 구름·익명 질문)은 v1에 없으므로
    // 되돌린 뒤에는 그냥 주관식 문항으로 보인다 — 라운드트립 테스트에 이 사실을 고정해 둔다.
    case 'wordcloud': {
      return {
        ...base,
        type: 'text',
        maxLength: q.maxWords * (q.maxWordLength + 2),
      };
    }
    case 'qna': {
      return {
        ...base,
        type: 'text',
        maxLength: q.maxLength,
      };
    }
    default: {
      // 알 수 없는 유형 — 문구만 보존한 주관식으로 남긴다(변환 중단 대신).
      return { ...base, type: 'text' };
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
