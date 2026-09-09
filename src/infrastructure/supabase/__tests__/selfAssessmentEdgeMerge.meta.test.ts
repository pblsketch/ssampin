/**
 * 메타 테스트 — **엣지 함수의 재제출 병합 규칙을 게이트 4종 안으로 끌어온다.**
 *
 * 배경(아키텍처 검토 지적): 병합 규칙을 `_shared/selfAssessment.ts` 의 순수 함수로 뺀 이유가
 * "게이트가 보게 하려고"였는데, **그 게이트가 실재하지 않았다.** `deno test` 는
 * CI(.github/workflows) 에 없고, `vitest.config.ts` 의 include 도 `src/**`·`electron/**` 뿐이다.
 * (`npm run test:edge` 는 나중에 넣었고 로컬 deno 2.7.11 로 **37건** 통과한다 — 그중 `_shared/selfAssessment.test.ts` 가 29건. **못 도는 게 아니라
 * 자동으로 안 도는 것**이다 — 기기마다 deno 유무가 갈리므로 게이트로 삼지 않는다.)
 * 코드 주석과 계획서는 "Deno 테스트가 고정한다"고 적혀 있었으니, **검증이 있다고 믿게 만드는
 * 거짓 진술**이었다 — 이 저장소가 반복해 겪은 "게이트 초록인 채 존재하는 결함"과 같은 모양이다.
 *
 * ★자리: `src/infrastructure/supabase/__tests__/` — `supabase/` 를 가리키는 테스트의 기존 동네다.
 *   `domain/` 아래 두면 상대 경로 탈출 모양을 도메인에 심게 된다.
 *
 * 해결: `_shared/selfAssessment.ts` 는 **import 0건 · `Deno.` 전역 0건인 순수 TypeScript** 라
 * vitest 가 그대로 가져올 수 있다. 그래서 여기서 직접 부른다. 이제 `npm run test` 가 병합
 * 규칙을 실제로 돌린다.
 *
 * ★Deno 쪽 테스트(`_shared/selfAssessment.test.ts`)는 그대로 둔다 — 그쪽은 `sanitize*` 까지
 *   더 넓게 보고, 엣지 런타임에서 도는 것을 확인하는 값이 있다. 다만 **게이트는 이 파일이다.**
 * ★이 파일이 깨지면 상대 경로를 의심할 것. `supabase/` 는 vitest include 밖이라 파일을 옮기면
 *   조용히 사라지는 게 아니라 import 오류로 즉시 터진다(그게 의도다).
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ANSWER_LENGTH,
  droppedAnswerCount,
  mergeSelfAssessment,
  mergeSubmission,
  readQuestions,
  sanitizeAnswers,
  sanitizeQuestions,
  type ExistingSubmissionRow,
  type IncomingSubmission,
  type SelfAssessmentAnswer,
} from '../../../../supabase/functions/_shared/selfAssessment';

/**
 * ★병합뿐 아니라 **보안 검사(`sanitize*`)도 여기서 돈다.** 처음엔 병합만 가져왔는데,
 *   아키텍처 재검토가 "이 파일의 존재 이유인 조작된 브라우저 방어는 아직 게이트 밖"이라고
 *   짚었다 — 그쪽 테스트는 게이트가 아닌 Deno 에만 있었다. 같은 구멍이 자리만 옮긴 셈이라
 *   함께 끌어왔다.
 */
const QUESTIONS = [
  { id: 'q1', prompt: '무엇이 궁금했나요?', slot: '질문' },
  { id: 'q2', prompt: '무엇을 시도했나요?', slot: '시도' },
];

const EXISTING: ExistingSubmissionRow = {
  student_id: 'stu-1',
  file_name: '보고서.hwp',
  file_size: 1234,
  drive_file_id: 'drive-1',
  text_content: '월요일에 낸 글',
  self_assessment: [
    { questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '옛 답1' },
    { questionId: 'q2', prompt: '무엇을 시도했나요?', answer: '옛 답2' },
  ],
  is_late: false,
};

const NOTHING_NEW: IncomingSubmission = {
  studentId: null,
  fileName: null,
  fileSize: null,
  driveFileId: null,
  textContent: null,
  selfAssessment: null,
  isLate: true,
  selfAssessmentOnly: false,
};

function mk(prefix: string, n: number, answerPrefix = '답'): SelfAssessmentAnswer[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `${prefix}${i + 1}`,
    prompt: `${prefix} 물음 ${i + 1}`,
    answer: `${answerPrefix} ${i + 1}`,
  }));
}

function qdefs(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    prompt: `${prefix} 물음 ${i + 1}`,
  }));
}

describe('재제출 병합 — 안 보낸 칸은 지우지 않는다', () => {
  it('★돌아보기만 다시 내도 파일·글·학생 id 가 살아남는다', () => {
    const m = mergeSubmission(
      EXISTING,
      {
        ...NOTHING_NEW,
        selfAssessment: [{ questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '새 답1' }],
      },
      QUESTIONS,
    );
    expect(m.file_name).toBe('보고서.hwp');
    expect(m.drive_file_id).toBe('drive-1');
    expect(m.text_content).toBe('월요일에 낸 글');
    expect(m.student_id).toBe('stu-1');
  });

  it('★빈 문자열은 "지우기"가 아니다 — 옛 글이 살아남는다', () => {
    const m = mergeSubmission(
      EXISTING,
      { ...NOTHING_NEW, textContent: '', isLate: true },
      QUESTIONS,
    );
    expect(m.text_content).toBe('월요일에 낸 글');
    // 새 내용이 없으므로 지각도 다시 안 잰다.
    expect(m.is_late).toBe(false);
  });

  it('★한 문항만 고쳐 써도 나머지 문항의 옛 답이 안 사라진다', () => {
    const m = mergeSubmission(
      EXISTING,
      {
        ...NOTHING_NEW,
        selfAssessment: [{ questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '새 답1' }],
      },
      QUESTIONS,
    );
    expect(m.self_assessment).toHaveLength(2);
    expect(m.self_assessment?.[0]?.answer).toBe('새 답1');
    expect(m.self_assessment?.[1]?.answer).toBe('옛 답2');
  });

  it('★마감 뒤 돌아보기 한 줄에 제때 낸 제출이 지각으로 뒤집히지 않는다', () => {
    const m = mergeSubmission(
      EXISTING,
      {
        ...NOTHING_NEW,
        selfAssessment: [{ questionId: 'q1', prompt: 'p', answer: 'x' }],
        isLate: true,
      },
      QUESTIONS,
    );
    expect(m.is_late).toBe(false);
  });

  it('파일이나 글을 새로 내면 지각 여부를 다시 잰다', () => {
    expect(
      mergeSubmission(EXISTING, { ...NOTHING_NEW, textContent: '늦은 글', isLate: true }, QUESTIONS)
        .is_late,
    ).toBe(true);
    expect(
      mergeSubmission(
        EXISTING,
        { ...NOTHING_NEW, fileName: '늦은.hwp', fileSize: 1, driveFileId: 'd', isLate: true },
        QUESTIONS,
      ).is_late,
    ).toBe(true);
  });

  it('★0바이트 파일이 옛 크기로 되살아나지 않는다 (?? 와 || 의 차이)', () => {
    const m = mergeSubmission(
      EXISTING,
      {
        ...NOTHING_NEW,
        fileName: '빈파일.txt',
        fileSize: 0,
        driveFileId: 'drive-3',
        isLate: false,
      },
      QUESTIONS,
    );
    expect(m.file_size).toBe(0);
  });

  it('첫 제출(기존 행 없음)은 보낸 그대로', () => {
    const m = mergeSubmission(
      null,
      { ...NOTHING_NEW, textContent: '첫 글', isLate: true },
      QUESTIONS,
    );
    expect(m.text_content).toBe('첫 글');
    expect(m.file_name).toBeNull();
    expect(m.file_size).toBe(0);
    expect(m.self_assessment).toBeNull();
    expect(m.is_late).toBe(true);
  });

  it('070 이전 행처럼 is_late 가 null 이면 이번 값을 쓴다', () => {
    const m = mergeSubmission(
      { ...EXISTING, is_late: null },
      { ...NOTHING_NEW, selfAssessment: [{ questionId: 'q1', prompt: 'p', answer: 'x' }] },
      QUESTIONS,
    );
    expect(m.is_late).toBe(true);
  });
});

describe('★이음매 — mergeSubmission 이 문항 정의를 정렬 함수로 실제로 흘려보낸다', () => {
  // ★이 테스트가 지키는 것: `mergeSubmission` → `mergeSelfAssessment` 로 문항 순서가 **전달되는가**.
  //   정렬 함수 자체를 직접 부르는 테스트(아래 describe)는 "정렬이 정렬을 한다"만 본다.
  //   세 번째 인자를 지우거나 호출부(`submit-assignment/index.ts`)가 안 넘기면 이 테스트만 깨진다.
  //   아키텍처 3차 검토가 "이음매가 무주공산"이라고 짚은 자리다.
  it('월요일 q1 · 수요일 q2 를 쓰면 [q1, q2] 로 저장된다 (세 번째 인자가 없으면 [q2, q1] 로 뒤집힌다)', () => {
    const m = mergeSubmission(
      { ...EXISTING, self_assessment: [{ questionId: 'q1', prompt: 'p1', answer: '월요일' }] },
      { ...NOTHING_NEW, selfAssessment: [{ questionId: 'q2', prompt: 'p2', answer: '수요일' }] },
      QUESTIONS,
    );
    expect(m.self_assessment?.map((a) => a.questionId)).toEqual(['q1', 'q2']);
  });

  it('문항 정의가 없는 과제(null)면 정렬 없이 그대로 둔다', () => {
    const m = mergeSubmission(
      { ...EXISTING, self_assessment: [{ questionId: 'q1', prompt: 'p1', answer: '월요일' }] },
      { ...NOTHING_NEW, selfAssessment: [{ questionId: 'q2', prompt: 'p2', answer: '수요일' }] },
      null,
    );
    // ★길이만 세면 정렬이 켜져도 꺼져도 2 라서 판별이 안 된다. 순서를 그대로 박는다.
    expect(m.self_assessment?.map((a) => a.questionId)).toEqual(['q2', 'q1']);
  });
});

describe('자기평가만 받는 과제 — 돌아보기를 다시 쓰면 지각을 다시 잰다 (코드 리뷰 M-1)', () => {
  // 파일·글 과제에서는 "돌아보기 한 줄에 제때 낸 제출이 지각으로 뒤집히면 안 된다"가 맞다.
  // 하지만 돌아보기가 제출의 전부인 과제에서는, 다시 쓰는 것이 곧 다시 내는 것이다.
  it('★마감 전에 한 줄만 써 둔 학생이 마감 뒤 통째로 다시 쓰면 지각으로 잡힌다', () => {
    const m = mergeSubmission(
      { ...EXISTING, file_name: null, text_content: null, is_late: false },
      {
        ...NOTHING_NEW,
        selfAssessment: [
          { questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '제대로 쓴 답' },
        ],
        isLate: true,
        selfAssessmentOnly: true,
      },
      QUESTIONS,
    );
    expect(m.is_late).toBe(true);
  });

  it('같은 상황이어도 파일·글 과제라면 제때 낸 제출이 지각으로 뒤집히지 않는다', () => {
    const m = mergeSubmission(
      { ...EXISTING, is_late: false },
      {
        ...NOTHING_NEW,
        selfAssessment: [
          { questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '나중에 쓴 답' },
        ],
        isLate: true,
        selfAssessmentOnly: false,
      },
      QUESTIONS,
    );
    expect(m.is_late).toBe(false);
  });

  it('자기평가 전용이어도 이번에 답을 안 보냈으면 옛 판정을 그대로 둔다', () => {
    const m = mergeSubmission(
      { ...EXISTING, file_name: null, text_content: null, is_late: false },
      { ...NOTHING_NEW, isLate: true, selfAssessmentOnly: true },
      QUESTIONS,
    );
    expect(m.is_late).toBe(false);
  });
});

describe('병합 결과는 표가 받아 주는 개수를 넘지 않는다 (코드 리뷰 M-2)', () => {
  // 넘기면 CHECK 위반으로 upsert 가 통째로 실패해 학생이 방금 쓴 글을 잃는다(500).
  // 상한은 문항 수(6)가 아니라 **저장 가능한 답 수**(MAX_STORED_ANSWERS = 12)다 — 답은 쌓이는 칸이라
  // 문항을 갈아 끼우면 6을 넘는 것이 정상이기 때문이다. 표의 submissions 쪽 CHECK 도 12 다.
  it('★교사가 문항을 두 번 갈아 끼워 옛 답 8 + 새 답 6 이 되어도 12개로 자른다', () => {
    const old = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      questionId: `옛${i}`,
      prompt: `옛 물음 ${i}`,
      answer: `옛 답 ${i}`,
    }));
    const fresh = [1, 2, 3, 4, 5, 6].map((i) => ({
      questionId: `새${i}`,
      prompt: `새 물음 ${i}`,
      answer: `새 답 ${i}`,
    }));
    const m = mergeSubmission(
      { ...EXISTING, self_assessment: old },
      { ...NOTHING_NEW, selfAssessment: fresh },
      fresh.map((a) => ({ id: a.questionId, prompt: a.prompt })),
    );
    expect(m.self_assessment).toHaveLength(12);
    // 떨어지는 것은 교사가 이미 지운 문항의 옛 답부터다 — 새 답 6개는 전부 남는다.
    expect(m.self_assessment?.map((a) => a.questionId)).toEqual([
      '새1',
      '새2',
      '새3',
      '새4',
      '새5',
      '새6',
      '옛1',
      '옛2',
      '옛3',
      '옛4',
      '옛5',
      '옛6',
    ]);
  });

  it('문항 정의가 없는 과제에서도 12개를 넘기지 않는다', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      questionId: `q${i}`,
      prompt: `물음 ${i}`,
      answer: `답 ${i}`,
    }));
    const m = mergeSubmission({ ...EXISTING, self_assessment: many }, NOTHING_NEW, null);
    expect(m.self_assessment).toHaveLength(12);
  });
});

describe('잘린 건수 세기 — 정상 재제출에는 0 이어야 한다', () => {
  // ★리뷰가 잡은 거짓 경고: 호출부에서 "옛 답 수 + 새 답 수 − 저장된 수"로 세면 병합의 중복
  //   제거 때문에 **평범한 재제출마다** 양수가 나온다. 그러면 "답이 없어졌다"는 진짜 신고를
  //   조사할 때 로그가 늘 울고 있어 쓸모가 없다.
  it('★같은 문항을 고쳐 쓴 평범한 재제출은 0 건이다 (거짓 경고 방지)', () => {
    const three = [1, 2, 3].map((i) => ({
      questionId: `q${i}`,
      prompt: `물음 ${i}`,
      answer: `옛 답 ${i}`,
    }));
    const again = [1, 2, 3].map((i) => ({
      questionId: `q${i}`,
      prompt: `물음 ${i}`,
      answer: `새 답 ${i}`,
    }));
    const questions = three.map((a) => ({ id: a.questionId, prompt: a.prompt }));
    expect(droppedAnswerCount(three, again, questions)).toBe(0);
  });

  it('아무것도 안 보낸 재제출도 0 건이다', () => {
    expect(droppedAnswerCount(EXISTING.self_assessment, null, QUESTIONS)).toBe(0);
  });

  it('★실제로 상한을 넘겨 버린 경우에만 그 수를 센다', () => {
    const old = Array.from({ length: 10 }, (_, i) => ({
      questionId: `옛${i}`,
      prompt: `옛 물음 ${i}`,
      answer: `옛 답 ${i}`,
    }));
    const fresh = [1, 2, 3, 4].map((i) => ({
      questionId: `새${i}`,
      prompt: `새 물음 ${i}`,
      answer: `새 답 ${i}`,
    }));
    const questions = fresh.map((a) => ({ id: a.questionId, prompt: a.prompt }));
    // 옛 10 + 새 4 = 14 → 저장 상한 12 → 2건이 잘린다.
    expect(droppedAnswerCount(old, fresh, questions)).toBe(2);
  });
});

describe('★불변식 — 저장된 수 + 잘린 수 = 병합 결과 수', () => {
  // ★이 불변식이 잠그는 것은 **개수**다 — "저장된 수 + 잘린 수"가 병합 합집합과 어긋나면
  //   경고가 거짓말을 한다.
  // ⚠️ 문항 **순서**가 갈리는 것은 이걸로 못 잡는다. 다만 그건 이 테스트가 약해서가 아니라
  //   자르기 건수가 순서와 **수학적으로 무관**해서다(`sortByQuestions` 는 쪼갠 뒤 다시 붙이므로
  //   길이가 언제나 `min(n, 12)`). 순서는 위 「★이음매」 describe 가 지킨다.
  //   ★앞서 여기에 "정렬 기준을 비워도 전부 통과했으니 판별력이 없다"고 적었는데, 그 변이는
  //   애초에 **관측 불가능한 변이**(equivalent mutant)라 테스트에 대해 아무것도 증명하지 않는다.
  //   변이가 통과했다는 사실만으로 테스트를 탓하지 말 것.
  const CASES: ReadonlyArray<
    [string, SelfAssessmentAnswer[], SelfAssessmentAnswer[] | null, unknown]
  > = [
    ['평범한 재제출', mk('q', 3), mk('q', 3, '새'), QUESTIONS],
    ['문항을 갈아 끼움', mk('옛', 10), mk('새', 4), qdefs('새', 4)],
    ['문항 정의 없음', mk('q', 8), mk('q', 2, '새'), null],
    ['이번엔 안 보냄', mk('q', 5), null, QUESTIONS],
    ['옛 답 없음', [], mk('q', 2), QUESTIONS],
  ];

  it.each(CASES)('%s', (_이름, old, incoming, questions) => {
    const merged = mergeSubmission(
      { ...EXISTING, self_assessment: old },
      { ...NOTHING_NEW, selfAssessment: incoming },
      questions,
    );
    const stored = merged.self_assessment?.length ?? 0;
    const dropped = droppedAnswerCount(old, incoming, questions);
    // 병합 전 합집합 크기(문항 id 기준 중복 제거)와 정확히 맞아야 한다.
    const union = new Set([
      ...(incoming ?? []).map((a) => a.questionId),
      ...old.map((a) => a.questionId),
    ]);
    expect(stored + dropped).toBe(union.size);
  });
});

describe('mergeSelfAssessment', () => {
  it('옛 값이 배열이 아니면 무시한다', () => {
    expect(mergeSelfAssessment('망가진 값', null, [])).toBeNull();
  });

  it('prompt 없는 옛 답은 버린다 — 타입 단언을 사실로 만든다', () => {
    expect(mergeSelfAssessment([{ questionId: 'q9', answer: '옛 답' }], null, [])).toBeNull();
  });

  it('새 답만 있으면 그대로', () => {
    expect(
      mergeSelfAssessment(null, [{ questionId: 'q1', prompt: 'p', answer: 'x' }], []),
    ).toHaveLength(1);
  });
});

describe('학생 입력 방어 — 브라우저가 보낸 값을 믿지 않는다', () => {
  it('★문항에 없는 questionId 는 버린다', () => {
    const r = sanitizeAnswers(
      JSON.stringify([
        { questionId: 'q1', answer: '분모가 궁금했다' },
        { questionId: '침입', answer: '아무 값' },
      ]),
      QUESTIONS,
    );
    expect(r.answers?.map((a) => a.questionId)).toEqual(['q1']);
  });

  it('★문항 원문·갈래는 학생이 보낸 값이 아니라 저장된 정의에서 복사한다', () => {
    const r = sanitizeAnswers(
      JSON.stringify([
        { questionId: 'q1', prompt: '학생이 지어낸 물음', slot: '위조', answer: '답' },
      ]),
      QUESTIONS,
    );
    expect(r.answers?.[0]?.prompt).toBe('무엇이 궁금했나요?');
    expect(r.answers?.[0]?.slot).toBe('질문');
  });

  it('결과는 학생이 보낸 순서가 아니라 문항 순서다', () => {
    const r = sanitizeAnswers(
      JSON.stringify([
        { questionId: 'q2', answer: '두번째' },
        { questionId: 'q1', answer: '첫번째' },
      ]),
      QUESTIONS,
    );
    expect(r.answers?.map((a) => a.questionId)).toEqual(['q1', 'q2']);
  });

  it('★길이는 거절이 아니라 자르기 — 학생 글을 통째로 잃지 않는다', () => {
    const long = 'ㄱ'.repeat(MAX_ANSWER_LENGTH + 100);
    const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: long }]), QUESTIONS);
    expect(Array.from(r.answers![0]!.answer)).toHaveLength(MAX_ANSWER_LENGTH);
    expect(r.error).toBeUndefined();
  });

  it('★이모지를 반쪽으로 자르지 않는다 (jsonb 저장 실패 방지)', () => {
    const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '🙂🙂🙂' }]), [
      { id: 'q1', prompt: '한 줄로', maxLength: 2 },
    ]);
    expect(r.answers?.[0]?.answer).toBe('🙂🙂');
  });

  it('자기평가를 안 받는 과제면 학생이 보내도 저장하지 않는다', () => {
    expect(
      sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '답' }]), null).answers,
    ).toBeNull();
  });

  it('빈 답은 버리고, 깨진 JSON 은 사유를 돌려준다', () => {
    expect(
      sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '  ' }]), QUESTIONS).answers,
    ).toBeNull();
    expect(typeof sanitizeAnswers('{{{', QUESTIONS).error).toBe('string');
    // 안 보낸 경우는 오류가 아니다.
    expect(sanitizeAnswers(null, QUESTIONS).error).toBeUndefined();
  });

  it('문항 정의도 6개로 자르고, 빈 물음·겹친 id 를 버린다', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, prompt: `물음 ${i}` }));
    expect(sanitizeQuestions(many)).toHaveLength(6);
    expect(readQuestions(many)).toHaveLength(6);
    expect(sanitizeQuestions([{ id: 'a', prompt: '  ' }])).toBeNull();
    expect(
      sanitizeQuestions([
        { id: 'a', prompt: '첫 물음' },
        { id: 'a', prompt: '같은 id' },
      ]),
    ).toHaveLength(1);
    expect(sanitizeQuestions('배열 아님')).toBeNull();
  });
});

describe('병합 뒤 답변 순서 — 문항 순서를 따른다', () => {
  it('★q1 을 먼저 쓰고 나중에 q2 를 써도 [q1, q2] 다', () => {
    const order = ['q1', 'q2', 'q3'];
    const first = mergeSelfAssessment(
      null,
      [{ questionId: 'q1', prompt: 'p1', answer: 'a1' }],
      order,
    );
    const second = mergeSelfAssessment(
      first,
      [{ questionId: 'q2', prompt: 'p2', answer: 'a2' }],
      order,
    );
    expect(second?.map((a) => a.questionId)).toEqual(['q1', 'q2']);
  });

  it('★q1·q3 을 먼저 쓰고 q2 를 채워도 [q1, q2, q3] 다', () => {
    const order = ['q1', 'q2', 'q3'];
    const first = mergeSelfAssessment(
      null,
      [
        { questionId: 'q1', prompt: 'p1', answer: 'a1' },
        { questionId: 'q3', prompt: 'p3', answer: 'a3' },
      ],
      order,
    );
    const second = mergeSelfAssessment(
      first,
      [{ questionId: 'q2', prompt: 'p2', answer: 'a2' }],
      order,
    );
    expect(second?.map((a) => a.questionId)).toEqual(['q1', 'q2', 'q3']);
  });

  it('교사가 지운 문항의 옛 답은 버리지 않고 뒤에 둔다', () => {
    const out = mergeSelfAssessment(
      [{ questionId: '지워진문항', prompt: 'p', answer: '옛 답' }],
      [{ questionId: 'q1', prompt: 'p1', answer: 'a1' }],
      ['q1', 'q2'],
    );
    expect(out?.map((a) => a.questionId)).toEqual(['q1', '지워진문항']);
  });
});
