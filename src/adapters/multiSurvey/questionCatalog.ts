import type { Question } from '@domain/entities/multiSurvey/Question';
import {
  isAdvancedType,
  type AdvancedQuestionType,
} from '@domain/entities/multiSurvey/AdvancedQuestion';

export type ParticipationFormat =
  | AdvancedQuestionType
  | 'ox'
  | 'multiple'
  | 'short'
  | 'blank'
  | 'single-choice'
  | 'multi-choice'
  | 'text'
  | 'scale'
  | 'description'
  | 'trafficlight'
  | 'valueline'
  | 'wordcloud'
  | 'qna';

/**
 * 유형 목록. 순서는 화면에 그대로 나온다 — **퀴즈 → 토론 → 설문**.
 * 무리는 `questionTypeStyle.ts` 가 정한다(색·아이콘과 같은 표를 쓴다).
 *
 * 객관식은 **정답을 쓰는 것과 쓰지 않는 것을 따로 둔다.** 저장되는 유형 자체가 다르고
 * (`multiple` ↔ `single-choice`), 선생님이 고를 때 하는 고민도 다르다.
 * 추가한 뒤에도 편집 화면의 [정답 사용]으로 서로 오갈 수 있다.
 */
export const questionCatalog: readonly {
  type: ParticipationFormat;
  name: string;
  description: string;
}[] = [
  // ── 퀴즈 ──
  {
    type: 'multiple',
    name: '객관식 퀴즈',
    description: '보기 중 정답을 고르게 합니다. 정답을 여러 개 둘 수도 있어요.',
  },
  { type: 'ox', name: 'OX', description: 'O와 X 중 하나를 고릅니다.' },
  { type: 'short', name: '단답형', description: '짧은 답을 직접 입력합니다.' },
  { type: 'blank', name: '빈칸 채우기', description: '질문 속 빈칸에 들어갈 말을 입력합니다.' },
  {
    type: 'order',
    name: '순서 배열',
    description: '카드를 순서대로 옮깁니다. 정답 순서를 설정할 수 있어요.',
  },
  {
    type: 'pin',
    name: '이미지 위치 표시',
    description: '이미지의 한 지점을 누릅니다. 정답 영역을 설정할 수 있어요.',
  },
  {
    type: 'numeric',
    name: '숫자 입력·추정',
    description: '숫자를 입력하거나 슬라이더로 고릅니다. 정답과 허용 오차를 설정할 수 있어요.',
  },
  // ── 토론 ──
  {
    type: 'valueline',
    name: '가치수직선',
    description:
      '양 끝 입장 사이에서 자신의 자리를 고릅니다. 재고 싶은 항목을 여러 개 두거나 기준을 두 개(가로·세로)로 늘릴 수 있어요.',
  },
  {
    type: 'quadrant',
    name: '2×2 매트릭스',
    description:
      '가로·세로 두 기준으로 나눈 네 칸에 점을 놓습니다. 점마다 짧은 글을 함께 받을 수 있어요.',
  },
  {
    type: 'trafficlight',
    name: '신호등',
    description: '찬성·보류·반대 중 자신의 입장을 고릅니다.',
  },
  {
    type: 'brainstorm',
    name: '아이디어·질문 모으기',
    description:
      '아이디어나 궁금한 점을 적습니다. 공개한 뒤 투표(공감)를 받을지 문항을 만들 때 고를 수 있어요.',
  },
  { type: 'text', name: '서술형', description: '생각과 그 까닭을 문장으로 적습니다.' },
  {
    type: 'wordcloud',
    name: '워드클라우드',
    description: '단어를 모읍니다. 많이 나온 단어가 크게 표시됩니다.',
  },
  // ── 설문 ──
  {
    type: 'single-choice',
    name: '객관식 투표',
    description: '보기 중 하나를 고르게 하고 분포를 봅니다. 정답은 없어요.',
  },
  { type: 'multi-choice', name: '복수 선택', description: '해당하는 보기를 여러 개 고릅니다.' },
  {
    type: 'ranking',
    name: '순위 매기기',
    description: '선호하거나 중요하다고 생각하는 순서로 카드를 배열합니다.',
  },
  {
    type: 'allocation',
    name: '점수 배분',
    description: '정해진 총점을 여러 항목에 나눠 배분합니다.',
  },
];

export function createParticipationQuestion(
  format: ParticipationFormat,
  text = '',
  id: string = crypto.randomUUID(),
): Question {
  const base = { id, text, timerSeconds: 60, score: 0 };
  const items = Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), text: '' }));
  if (isAdvancedType(format))
    return {
      ...base,
      type: format,
      settings: {
        // 가치수직선은 질문 자체를 재는 항목 하나로 시작한다(이름 없이).
        items:
          format === 'valueline'
            ? [{ id: crypto.randomUUID(), text: '' }]
            : format === 'quadrant'
              ? []
              : items,
        min: format === 'valueline' ? 1 : 0,
        max: format === 'numeric' ? 100 : format === 'valueline' ? 10 : 5,
        step: 1,
        total: 100,
        unit: '',
        xLabel: format === 'valueline' ? '' : '중요도',
        yLabel: format === 'valueline' ? '' : '실현 가능성',
        imageUrl: '',
        maxIdeas: 3,
        ...(format === 'valueline' ? { xMinLabel: '반대', xMaxLabel: '찬성' } : {}),
        ...(format === 'quadrant'
          ? {
              // 세로는 위가 yMaxLabel 이다(좌표는 왼쪽 위가 0,0).
              xLabel: '실현 가능성',
              xMinLabel: '어려움',
              xMaxLabel: '쉬움',
              yLabel: '중요도',
              yMinLabel: '낮음',
              yMaxLabel: '높음',
              maxPoints: 1,
              collectPointText: false,
            }
          : {}),
        ...(format === 'brainstorm' ? { allowVoting: true } : {}),
      },
    };
  switch (format) {
    case 'ox':
      return { ...base, type: 'ox', score: 10, correctAnswer: 'O' };
    case 'multiple':
      return { ...base, type: 'multiple', score: 10, choices: items, correctChoiceIds: [] };
    case 'short':
      return { ...base, type: 'short', score: 10, acceptedAnswers: [], caseSensitive: false };
    case 'blank':
      return { ...base, type: 'blank', score: 10, acceptedAnswers: [], isHangulInitial: false };
    case 'single-choice':
    case 'multi-choice':
      return { ...base, type: format, options: items };
    case 'trafficlight':
      return {
        ...base,
        type: 'single-choice',
        presentation: 'trafficlight',
        options: [
          { id: 'agree', text: '찬성' },
          { id: 'unsure', text: '보류' },
          { id: 'disagree', text: '반대' },
        ],
      };
    case 'scale':
      return {
        ...base,
        type: 'scale',
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: '매우 낮음',
        scaleMaxLabel: '매우 높음',
      };
    case 'wordcloud':
      return { ...base, type: 'wordcloud', maxWords: 3, maxWordLength: 10 };
    case 'qna':
      return { ...base, type: 'qna', maxLength: 500 };
    case 'description':
      return { ...base, type: 'description', minLength: 0, maxLength: 1000 };
    case 'text':
      return { ...base, type: 'text', maxLength: 1000 };
  }
}
