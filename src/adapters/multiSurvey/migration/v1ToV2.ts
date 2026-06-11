/**
 * v1 → v2 순방향 변환 어댑터 (Design §4.1, worker-2 영역).
 *
 * - v1 MultiSurvey(formatVersion 없음) → MultiSurveyV2(formatVersion: 2)
 * - questions[].question → text (worker-1 open issue #2)
 * - v1.submissions[], v1.isOpen DISCARD (휘발성)
 * - createdAt: epoch ms → ISO string
 * - opts 3그룹 기본값 주입
 */

import type {
  MultiSurveyV2,
  PresentationOpts,
  ResponseOpts,
  DisplayOpts,
} from '../../../domain/entities/multiSurvey/MultiSurveyV2.ts';
import type {
  Question,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  TextQuestion,
  ScaleQuestion,
} from '../../../domain/entities/multiSurvey/Question.ts';
import { FORMAT_VERSION_V2 } from '../../../domain/entities/multiSurvey/MultiSurveyV2.ts';

// ──────────────────────────────────────────────
// v1 shape (read-only reference from MultiSurvey.ts)
// ──────────────────────────────────────────────

type V1QuestionType = 'single-choice' | 'multi-choice' | 'text' | 'scale';

interface V1Question {
  readonly id: string;
  readonly type: V1QuestionType;
  readonly question: string; // v2에서 text로 rename
  readonly required: boolean;
  readonly options?: readonly { readonly id: string; readonly text: string }[];
  readonly scaleMin?: number;
  readonly scaleMax?: number;
  readonly scaleMinLabel?: string;
  readonly scaleMaxLabel?: string;
  readonly maxLength?: number;
}

interface V1Survey {
  readonly id: string;
  readonly title: string;
  readonly questions: readonly V1Question[];
  readonly submissions: readonly unknown[];
  readonly isOpen: boolean;
  readonly createdAt: number; // epoch ms
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

function assertV1Shape(input: unknown): asserts input is V1Survey {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid v1 MultiSurvey input: expected object, got ' + typeof input);
  }
  const v = input as Record<string, unknown>;
  if (typeof v['id'] !== 'string' || v['id'].length === 0) {
    throw new Error('Invalid v1 MultiSurvey input: missing or empty id');
  }
  if (typeof v['title'] !== 'string') {
    throw new Error('Invalid v1 MultiSurvey input: missing title');
  }
  if (!Array.isArray(v['questions'])) {
    throw new Error('Invalid v1 MultiSurvey input: questions must be an array');
  }
  if (typeof v['createdAt'] !== 'number') {
    throw new Error('Invalid v1 MultiSurvey input: createdAt must be a number (epoch ms)');
  }
}

const V1_SURVEY_TYPES: ReadonlySet<string> = new Set([
  'single-choice',
  'multi-choice',
  'text',
  'scale',
]);

function assertV1QuestionType(type: unknown, idx: number): asserts type is V1QuestionType {
  if (typeof type !== 'string' || !V1_SURVEY_TYPES.has(type)) {
    throw new Error(
      `Invalid v1 MultiSurvey input: questions[${idx}].type "${String(type)}" is not a valid v1 type`,
    );
  }
}

// ──────────────────────────────────────────────
// Per-type question mapper
// ──────────────────────────────────────────────

const DEFAULT_TIMER_SECONDS = 20;
const DEFAULT_SCORE = 10;

function mapV1Question(q: V1Question, idx: number): Question {
  assertV1QuestionType(q.type, idx);

  const base = {
    id: q.id,
    text: q.question,
    timerSeconds: DEFAULT_TIMER_SECONDS,
    score: DEFAULT_SCORE,
    mediaUrl: undefined,
    explanation: undefined,
  } as const;

  switch (q.type) {
    case 'single-choice': {
      const mapped: SingleChoiceQuestion = {
        ...base,
        type: 'single-choice',
        options: q.options ?? [],
      };
      return mapped;
    }
    case 'multi-choice': {
      const mapped: MultiChoiceQuestion = {
        ...base,
        type: 'multi-choice',
        options: q.options ?? [],
      };
      return mapped;
    }
    case 'text': {
      const mapped: TextQuestion = {
        ...base,
        type: 'text',
        ...(q.maxLength !== undefined ? { maxLength: q.maxLength } : {}),
      };
      return mapped;
    }
    case 'scale': {
      const mapped: ScaleQuestion = {
        ...base,
        type: 'scale',
        scaleMin: q.scaleMin ?? 1,
        scaleMax: q.scaleMax ?? 5,
        ...(q.scaleMinLabel !== undefined ? { scaleMinLabel: q.scaleMinLabel } : {}),
        ...(q.scaleMaxLabel !== undefined ? { scaleMaxLabel: q.scaleMaxLabel } : {}),
      };
      return mapped;
    }
  }
}

// ──────────────────────────────────────────────
// Default opts (Design §4.1)
// ──────────────────────────────────────────────

const DEFAULT_PRESENTATION_OPTS: PresentationOpts = {
  showCumulativeScore: false,
  revealExplanation: false,
  allowReentry: true, // 재입장만 true per Design §4.1
};

const DEFAULT_RESPONSE_OPTS: ResponseOpts = {
  explicitSubmitButton: false,
  autoAdvance: false,
  fastSolveBonus: false,
  streakBonus: false,
  randomBonus: false,
};

const DEFAULT_DISPLAY_OPTS: DisplayOpts = {
  teacherFocusMode: false,
  showPerQuestionScore: false,
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * v1 MultiSurvey → MultiSurveyV2 순방향 변환.
 * Pure function. I/O 없음.
 *
 * @throws Error if input is not a valid v1 MultiSurvey shape
 */
export function migrateV1ToV2(v1: unknown): MultiSurveyV2 {
  assertV1Shape(v1);

  const questions: Question[] = v1.questions.map((q, idx) => mapV1Question(q, idx));

  const result: MultiSurveyV2 = {
    id: v1.id,
    formatVersion: FORMAT_VERSION_V2,
    title: v1.title,
    createdAt: new Date(v1.createdAt).toISOString(),
    updatedAt: new Date().toISOString(),
    questions,
    presentationOpts: DEFAULT_PRESENTATION_OPTS,
    responseOpts: DEFAULT_RESPONSE_OPTS,
    displayOpts: DEFAULT_DISPLAY_OPTS,
  };

  return result;
}
