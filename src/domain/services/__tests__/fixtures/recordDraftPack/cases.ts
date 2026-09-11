/**
 * 요청서 기준선 픽스처의 **입력 정본** — 서사 그래프(P0~P5) 내내 "요청서가 조용히 바뀌지 않았는가"를
 * 재는 자다.
 *
 * ★두 벌을 둔다.
 *   - `pre/`  : P0(정렬·주제 정보) 적용 **직전** 출력. 증거로만 보관하고 대조하지 않는다.
 *   - `base/` : P0 적용 **후** 같은 커밋에서 뜬 출력. 이후 모든 단계가 이것과 대조한다.
 *   두 벌이 필요한 이유: P0 자신이 근거 순서를 바꾸므로, P0 이전에 뜬 파일을 계속 기준선으로 쓰면
 *   P0 직후부터 반드시 깨진다(그러면 기준선이 아니라 잡음이 된다).
 *
 * ★입력은 **완전히 결정적**이어야 한다. `Date.now()`·`Math.random()`·스토어 조회 금지.
 *   별칭(［이름1］)은 마스킹 세션이 만나는 순서대로 매기므로 같은 입력이면 같은 글자가 나온다.
 *
 * 다시 뜨는 법(둘 다 같은 커밋 안에서):
 *   PACK_FIXTURE_WRITE=pre  npx vitest run src/domain/services/__tests__/recordDraftPackBaseline.test.ts
 *   PACK_FIXTURE_WRITE=base npx vitest run src/domain/services/__tests__/recordDraftPackBaseline.test.ts
 */
import type { DraftPackInput } from '../../../recordDraftPack';
import type { RecordWritingStyle } from '../../../../entities/RecordWritingStyle';

/** 이 학생과 같은 반 아이들 — 근거 본문에 섞인 다른 학생 이름도 가려지는지 함께 본다. */
const ROSTER = [{ label: '이름', values: ['흐름다솜', '강준서', '민하윤'] }];

/** 12,000자 상한을 확실히 넘기기 위한 긴 본문(같은 글자만 반복해 결정적으로 만든다). */
function longBody(marker: string, chars: number): string {
  return `${marker} ` + '가'.repeat(Math.max(1, chars - marker.length - 1));
}

const BASE: Omit<DraftPackInput, 'evidences'> = {
  studentName: '흐름다솜',
  roster: ROSTER,
  areaLabel: '교과학습발달상황',
  subject: '통합사회',
};

/** 「수업 맥락」을 더하고 질문으로 시작하는 비기본 구성 — 카탈로그 role 을 읽는 자리를 함께 잠근다. */
const STYLE_LESSON_CONTEXT_QUESTION: RecordWritingStyle = {
  focus: 'legacyInquiry',
  opening: 'question',
  grouping: 'connected',
  extraModules: ['lessonContext'],
};

/** 행동특성 초점 — 생활 틀로 옮겨도 폴백 요청서가 그대로인지 잠근다. */
const STYLE_LIFE_RELATION: RecordWritingStyle = {
  focus: 'lifeRelation',
  opening: 'evaluation',
  grouping: 'connected',
};

export interface PackFixtureCase {
  readonly name: string;
  readonly input: DraftPackInput;
}

export const PACK_FIXTURE_CASES: readonly PackFixtureCase[] = [
  {
    // 근거 0건 — "보낼 수 있는 근거가 없습니다" 자리.
    name: 'empty',
    input: { ...BASE, evidences: [] },
  },
  {
    // 무날짜 2건이 **뒤로** 가고, 그 둘끼리는 `createdAt` 오름차순으로 고정되는지 본다.
    // 입력 배열은 일부러 뒤죽박죽으로 둔다 — 정렬이 없으면 이 순서 그대로 나간다.
    name: 'nodate',
    input: {
      ...BASE,
      evidences: [
        { id: 'e-nodate-late', content: '날짜 없는 기록(나중에 적음)', createdAt: 2_000 },
        {
          id: 'e-0918',
          content: '순서 효과를 발견해 2차 조사를 설계함',
          date: '2026-09-18',
          createdAt: 9_000,
        },
        { id: 'e-nodate-early', content: '날짜 없는 기록(먼저 적음)', createdAt: 1_000 },
        {
          id: 'e-0902',
          content: '쿠폰이 있으면 왜 필요 없는 물건도 사게 되냐고 물음',
          date: '2026-09-02',
          createdAt: 8_000,
        },
        {
          id: 'e-0911',
          content: '강준서와 함께 학급 30명 간이 설문을 설계함',
          date: '2026-09-11',
          createdAt: 3_000,
        },
      ],
    },
  },
  {
    // 낱말만 걸린 근거는 대체어로 살리고(체육대회 → 체육행사), 정말 못 쓸 근거는 뺀다.
    name: 'prohibited',
    input: {
      ...BASE,
      areaLabel: '창의적 체험활동 자율활동',
      evidences: [
        {
          id: 'e-p1',
          content: '체육대회 준비물을 스스로 챙겨 오고 진행 순서를 정리함',
          date: '2026-05-04',
          createdAt: 1_100,
        },
        {
          id: 'e-p2',
          content: '학원에서 미리 배웠다고 말하며 친구 질문에 답해 줌',
          date: '2026-05-11',
          createdAt: 1_200,
        },
        { id: 'e-p3', content: '', date: '2026-05-12', createdAt: 1_300 },
        {
          id: 'e-p4',
          content: '민하윤이 맡은 일을 대신 챙겨 마무리함',
          date: '2026-05-18',
          createdAt: 1_400,
          excludedFromAi: true,
        },
        {
          id: 'e-p5',
          content: '남은 준비물을 정리해 다음 반에 넘겨줌',
          date: '2026-05-20',
          createdAt: 1_500,
        },
      ],
    },
  },
  {
    // 12,000자 상한 — 어느 근거가 잘리는지가 정렬 변경으로 달라진다(그 변화를 diff 로 남긴다).
    name: 'overflow',
    input: {
      ...BASE,
      evidences: [
        { id: 'e-of-c', content: longBody('세 번째', 5_000), date: '2026-06-20', createdAt: 3_100 },
        { id: 'e-of-a', content: longBody('첫 번째', 5_000), date: '2026-04-02', createdAt: 3_200 },
        { id: 'e-of-d', content: longBody('네 번째', 5_000), date: '2026-07-01', createdAt: 3_300 },
        { id: 'e-of-b', content: longBody('두 번째', 5_000), date: '2026-05-06', createdAt: 3_400 },
        {
          id: 'e-of-short',
          content: '짧은 기록이라 상한을 넘긴 뒤에도 실린다',
          date: '2026-08-08',
          createdAt: 3_500,
        },
      ],
    },
  },
  {
    // 비기본 구성 + 주제 — 「작성 구성」 블록과 표식 지시가 함께 나가는 경로.
    name: 'lessonContext-question',
    input: {
      ...BASE,
      threadTitle: '할인 문구와 선택',
      standardKeywords: ['합리적 선택', '기회비용'],
      style: STYLE_LESSON_CONTEXT_QUESTION,
      teacherPrompt: '탐구 과정을 조금 더 자세히 적어 주세요.',
      evidences: [
        {
          id: 'e-lc-1',
          content: '기회비용과 매몰비용 수업에서 사례를 되물음',
          date: '2026-09-02',
          createdAt: 4_100,
        },
        {
          id: 'e-lc-2',
          content: '프레이밍 효과를 언급하며 직접 확인해 보겠다고 함',
          date: '2026-09-04',
          createdAt: 4_200,
        },
        {
          id: 'e-lc-3',
          content: '표본의 한계를 먼저 밝히고 결과를 해석함',
          date: '2026-09-27',
          createdAt: 4_300,
        },
      ],
    },
  },
  {
    // 행동특성 초점 — 영역·초점이 함께 바뀌는 경로.
    name: 'lifeRelation',
    input: {
      studentName: '흐름다솜',
      roster: ROSTER,
      areaLabel: '행동특성 및 종합의견',
      style: STYLE_LIFE_RELATION,
      evidences: [
        {
          id: 'e-lr-1',
          content: '아침마다 교실 창을 열고 칠판을 정리함',
          date: '2026-03-09',
          createdAt: 5_100,
        },
        {
          id: 'e-lr-2',
          content: '모둠에서 말수가 적은 친구에게 먼저 역할을 물어봄',
          date: '2026-06-15',
          createdAt: 5_200,
        },
        {
          id: 'e-lr-3',
          content: '1학기에는 발표를 피했으나 2학기에는 먼저 손을 듦',
          date: '2026-11-02',
          createdAt: 5_300,
        },
      ],
    },
  },
];
