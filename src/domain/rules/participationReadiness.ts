/**
 * participationReadiness — "왜 학생을 초대할 수 없는지"를 **선생님 말로** 돌려준다.
 *
 * `validateSession()` 의 메시지는 개발자용이다(`[문항 1(uuid)] correctChoiceIds가 …`).
 * 선생님 화면에는 **무엇을 어디에 적어야 하는지**가 나와야 한다 —
 * "3번 문항의 두 번째 보기를 입력해 주세요." 처럼.
 *
 * 각 항목은 고칠 자리를 함께 돌려주므로 화면이 그 문항으로 옮겨 가고 입력칸에 초점을 줄 수 있다.
 */

import type { MultiSurveyV2 } from '../entities/multiSurvey/MultiSurveyV2';
import type { Question } from '../entities/multiSurvey/Question';
import { isAdvancedType, type AdvancedQuestion } from '../entities/multiSurvey/AdvancedQuestion';
import { validateSession } from './multiSurveyRules';

export interface ReadinessIssue {
  /** 고칠 문항의 자리. 활동 전체 문제면 null */
  readonly questionIndex: number | null;
  /** 선생님에게 그대로 보여 줄 문장 */
  readonly message: string;
  /** 초점을 줄 입력칸의 aria-label (없으면 문항으로만 이동) */
  readonly focus?: string;
}

const ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'] as const;

function ordinal(index: number): string {
  return `${ORDINALS[index] ?? String(index + 1)} 번째`;
}

/** 이 문항이 보기를 쓰는가 — 쓴다면 그 목록 */
function choicesOf(question: Question): readonly { id: string; text: string }[] | null {
  if (question.type === 'multiple') return question.choices;
  if (question.type === 'single-choice' || question.type === 'multi-choice')
    return question.options;
  return null;
}

/** 이 문항에서 고쳐야 할 것 */
function issuesForQuestion(question: Question, index: number): ReadinessIssue[] {
  const at = index + 1;
  const found: ReadinessIssue[] = [];

  if (!question.text.trim())
    found.push({
      questionIndex: index,
      message: `${at}번 문항의 질문을 입력해 주세요.`,
      focus: '질문 또는 논제',
    });

  const choices = choicesOf(question);
  if (choices) {
    choices.forEach((choice, i) => {
      if (!choice.text.trim())
        found.push({
          questionIndex: index,
          message: `${at}번 문항의 ${ordinal(i)} 보기를 입력해 주세요.`,
          focus: `${i + 1}번 보기`,
        });
    });
    if (choices.length < 2)
      found.push({
        questionIndex: index,
        message: `${at}번 문항에는 보기가 두 개 이상 필요해요.`,
      });
  }

  if (question.type === 'multiple' && question.correctChoiceIds.length === 0)
    found.push({
      questionIndex: index,
      message: `${at}번 문항의 정답을 골라 주세요.`,
    });

  if (
    (question.type === 'short' || question.type === 'blank') &&
    question.acceptedAnswers.filter((a) => a.trim()).length === 0
  )
    found.push({
      questionIndex: index,
      message: `${at}번 문항에 인정할 정답을 입력해 주세요.`,
      focus: '인정할 정답 · 여러 개이면 줄바꿈',
    });

  if (isAdvancedType(question.type)) {
    const advanced = question as AdvancedQuestion;
    const items = advanced.settings.items;
    // 매트릭스는 항목 없이도 쓴다(학생이 자기 생각을 적어 붙인다).
    if (advanced.type !== 'quadrant' && advanced.type !== 'brainstorm') {
      items.forEach((item, i) => {
        // 가치수직선 한 줄짜리는 항목 이름이 비어 있어도 된다 — 질문 자체를 재기 때문이다.
        if (advanced.type === 'valueline' && items.length === 1) return;
        if (!item.text.trim())
          found.push({
            questionIndex: index,
            message: `${at}번 문항의 ${ordinal(i)} 항목 이름을 입력해 주세요.`,
          });
      });
      if (advanced.type !== 'valueline' && items.length === 0)
        found.push({
          questionIndex: index,
          message: `${at}번 문항에 항목을 하나 이상 추가해 주세요.`,
        });
    }
    if (advanced.type === 'pin' && !advanced.settings.imageUrl)
      found.push({
        questionIndex: index,
        message: `${at}번 문항에 위치를 표시할 이미지를 넣어 주세요.`,
      });
  }

  return found;
}

/**
 * 지금 이 활동으로 학생을 초대할 수 있는가.
 *
 * 화면이 못 잡은 문제까지 놓치지 않으려고, 마지막에 `validateSession()` 도 돌려
 * 남은 오류가 있으면 문항 단위의 일반 안내로 덧붙인다.
 */
export function participationReadiness(session: MultiSurveyV2): readonly ReadinessIssue[] {
  const found: ReadinessIssue[] = [];

  if (!session.title.trim())
    found.push({ questionIndex: null, message: '활동 제목을 입력해 주세요.', focus: '활동 제목' });

  if (session.questions.length === 0) {
    found.push({ questionIndex: null, message: '문항을 하나 이상 추가해 주세요.' });
    return found;
  }

  session.questions.forEach((q, i) => found.push(...issuesForQuestion(q, i)));

  // 화면이 아직 모르는 규칙이 있어도 "초대만 안 되고 이유는 없는" 상태가 되지 않게 한다.
  const validation = validateSession(session);
  if (!validation.ok) {
    const covered = new Set(found.map((f) => f.questionIndex));
    validation.errors.forEach((error) => {
      const match = /^\[문항 (\d+)\(/.exec(error);
      const index = match ? Number(match[1]) - 1 : null;
      if (covered.has(index)) return;
      covered.add(index);
      found.push({
        questionIndex: index,
        message:
          index === null
            ? '활동 설정을 확인해 주세요.'
            : `${index + 1}번 문항의 설정을 확인해 주세요.`,
      });
    });
  }

  return found;
}
