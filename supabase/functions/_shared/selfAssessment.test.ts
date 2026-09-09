import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_ANSWER_LENGTH,
  mergeSelfAssessment,
  mergeSubmission,
  readQuestions,
  sanitizeAnswers,
  sanitizeQuestions,
} from './selfAssessment.ts';

const QUESTIONS = [
  { id: 'q1', prompt: '무엇이 궁금했나요?', slot: '질문' },
  { id: 'q2', prompt: '무엇을 시도했나요?', slot: '시도' },
];

Deno.test('sanitizeQuestions: 배열이 아니면 null', () => {
  assertEquals(sanitizeQuestions(undefined), null);
  assertEquals(sanitizeQuestions('문항'), null);
  assertEquals(sanitizeQuestions({ id: 'q1' }), null);
});

Deno.test('sanitizeQuestions: 빈 물음·겹친 id 를 버리고, 다 버려지면 null', () => {
  assertEquals(sanitizeQuestions([{ id: 'a', prompt: '  ' }]), null);
  const out = sanitizeQuestions([
    { id: 'a', prompt: '첫 물음' },
    { id: 'a', prompt: '같은 id' },
  ]);
  assertEquals(out?.length, 1);
  assertEquals(out?.[0].prompt, '첫 물음');
});

Deno.test('sanitizeQuestions: 6개를 넘으면 잘라 낸다', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, prompt: `물음 ${i}` }));
  assertEquals(sanitizeQuestions(many)?.length, 6);
});

Deno.test('sanitizeAnswers: 과제가 자기평가를 안 받으면 학생이 보내도 저장 안 함', () => {
  const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '답' }]), null);
  assertEquals(r.answers, null);
  assertEquals(r.error, undefined);
});

Deno.test('sanitizeAnswers: 문항에 없는 questionId 는 버린다 — 브라우저를 고쳐 보낸 값', () => {
  const r = sanitizeAnswers(
    JSON.stringify([
      { questionId: 'q1', answer: '분모가 궁금했다' },
      { questionId: '침입', answer: '아무 값' },
    ]),
    QUESTIONS,
  );
  assertEquals(r.answers?.length, 1);
  assertEquals(r.answers?.[0].questionId, 'q1');
});

Deno.test('sanitizeAnswers: 문항 원문·슬롯은 저장된 정의에서 복사한다', () => {
  const r = sanitizeAnswers(
    JSON.stringify([
      { questionId: 'q1', prompt: '학생이 지어낸 물음', slot: '위조', answer: '답' },
    ]),
    QUESTIONS,
  );
  assertEquals(r.answers?.[0].prompt, '무엇이 궁금했나요?');
  assertEquals(r.answers?.[0].slot, '질문');
});

Deno.test('sanitizeAnswers: 학생이 보낸 순서가 아니라 문항 순서로 돌려준다', () => {
  const r = sanitizeAnswers(
    JSON.stringify([
      { questionId: 'q2', answer: '두번째' },
      { questionId: 'q1', answer: '첫번째' },
    ]),
    QUESTIONS,
  );
  assertEquals(
    r.answers?.map((a) => a.questionId),
    ['q1', 'q2'],
  );
});

Deno.test('sanitizeAnswers: 빈 답은 버리고, 전부 비면 null', () => {
  const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '   ' }]), QUESTIONS);
  assertEquals(r.answers, null);
});

Deno.test('sanitizeAnswers: 길이는 거절이 아니라 자르기 — 학생 글을 통째로 잃지 않는다', () => {
  const long = 'ㄱ'.repeat(MAX_ANSWER_LENGTH + 100);
  const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: long }]), QUESTIONS);
  assertEquals(Array.from(r.answers![0].answer).length, MAX_ANSWER_LENGTH);
  assertEquals(r.error, undefined);
});

Deno.test('sanitizeAnswers: 문항별 상한이 있으면 그것을 쓴다', () => {
  const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '가'.repeat(50) }]), [
    { id: 'q1', prompt: '한 줄로', maxLength: 10 },
  ]);
  assertEquals(Array.from(r.answers![0].answer).length, 10);
});

Deno.test('sanitizeAnswers: 깨진 JSON 은 사유를 돌려준다', () => {
  const r = sanitizeAnswers('{{{', QUESTIONS);
  assertEquals(r.answers, null);
  assertEquals(typeof r.error, 'string');
});

Deno.test('sanitizeAnswers: 안 보낸 경우는 오류가 아니다', () => {
  assertEquals(sanitizeAnswers(null, QUESTIONS).answers, null);
  assertEquals(sanitizeAnswers(null, QUESTIONS).error, undefined);
  assertEquals(sanitizeAnswers('', QUESTIONS).answers, null);
});

Deno.test(
  'readQuestions: 저장된 값이 6개를 넘어도 6개로 자른다 (방어를 한 겹에만 두지 않는다)',
  () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, prompt: `물음 ${i}` }));
    assertEquals(readQuestions(many).length, 6);
    assertEquals(readQuestions('배열 아님').length, 0);
  },
);

Deno.test('clip 은 코드 포인트 기준이라 반쪽 글자를 남기지 않는다', () => {
  // 이모지 3개를 2개로 자른다. String.slice(0,2) 였다면 반쪽 글자가 남아 jsonb 저장이 깨진다.
  const r = sanitizeAnswers(JSON.stringify([{ questionId: 'q1', answer: '🙂🙂🙂' }]), [
    { id: 'q1', prompt: '한 줄로', maxLength: 2 },
  ]);
  assertEquals(r.answers![0].answer, '🙂🙂');
  assertEquals(Array.from(r.answers![0].answer).length, 2);
});

Deno.test('sanitizeAnswers: 같은 문항에 답이 두 개 오면 첫 것만', () => {
  const r = sanitizeAnswers(
    JSON.stringify([
      { questionId: 'q1', answer: '첫 답' },
      { questionId: 'q1', answer: '둘째 답' },
    ]),
    QUESTIONS,
  );
  assertEquals(r.answers?.length, 1);
  assertEquals(r.answers?.[0].answer, '첫 답');
});

/* ── 재제출 병합 (3차 리뷰 지적: 이 규칙을 덮는 테스트가 한 건도 없었다) ────────────── */

const EXISTING = {
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

const NOTHING_NEW = {
  studentId: null,
  fileName: null,
  fileSize: null,
  driveFileId: null,
  textContent: null,
  selfAssessment: null,
  isLate: true,
  selfAssessmentOnly: false,
};

Deno.test('★돌아보기만 다시 내도 월요일에 낸 파일과 글이 살아남는다', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      selfAssessment: [{ questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '새 답1' }],
    },
    QUESTIONS,
  );
  assertEquals(m.file_name, '보고서.hwp');
  assertEquals(m.drive_file_id, 'drive-1');
  assertEquals(m.text_content, '월요일에 낸 글');
});

Deno.test('★한 문항만 고쳐 써도 나머지 문항의 옛 답이 안 사라진다', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      selfAssessment: [{ questionId: 'q1', prompt: '무엇이 궁금했나요?', answer: '새 답1' }],
    },
    QUESTIONS,
  );
  assertEquals(m.self_assessment?.length, 2);
  assertEquals(m.self_assessment?.[0].answer, '새 답1'); // 덮임
  assertEquals(m.self_assessment?.[1].answer, '옛 답2'); // 보존
});

Deno.test('★파일만 다시 내도 돌아보기가 살아남는다', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      fileName: '보고서-v2.hwp',
      fileSize: 5678,
      driveFileId: 'drive-2',
      isLate: false,
    },
    QUESTIONS,
  );
  assertEquals(m.self_assessment?.length, 2);
  assertEquals(m.file_name, '보고서-v2.hwp');
  assertEquals(m.file_size, 5678);
});

Deno.test('★마감 뒤 돌아보기 한 줄에 제때 낸 제출이 지각으로 뒤집히지 않는다', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      selfAssessment: [{ questionId: 'q1', prompt: 'p', answer: 'x' }],
      isLate: true,
    },
    QUESTIONS,
  );
  assertEquals(m.is_late, false);
});

Deno.test('파일이나 글을 새로 내면 지각 여부를 다시 잰다', () => {
  const m = mergeSubmission(
    EXISTING,
    { ...NOTHING_NEW, textContent: '늦게 낸 글', isLate: true },
    QUESTIONS,
  );
  assertEquals(m.is_late, true);
  assertEquals(m.text_content, '늦게 낸 글');
});

Deno.test('★0바이트 파일이 옛 크기로 되살아나지 않는다 (?? 와 || 의 차이)', () => {
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
  assertEquals(m.file_size, 0);
});

Deno.test('첫 제출(기존 행 없음)은 보낸 그대로', () => {
  const m = mergeSubmission(
    null,
    {
      ...NOTHING_NEW,
      textContent: '첫 글',
      isLate: true,
    },
    QUESTIONS,
  );
  assertEquals(m.text_content, '첫 글');
  assertEquals(m.file_name, null);
  assertEquals(m.file_size, 0);
  assertEquals(m.self_assessment, null);
  assertEquals(m.is_late, true);
});

Deno.test('mergeSelfAssessment: 옛 값이 배열이 아니면 무시한다', () => {
  assertEquals(mergeSelfAssessment('망가진 값', null, []), null);
  assertEquals(
    mergeSelfAssessment(null, [{ questionId: 'q1', prompt: 'p', answer: 'x' }], [])?.length,
    1,
  );
});

Deno.test('★빈 문자열로 온 글은 "지우기"가 아니다 — 옛 글이 살아남는다 (H-1 재발 방지)', () => {
  const m = mergeSubmission(EXISTING, { ...NOTHING_NEW, textContent: '', isLate: true }, QUESTIONS);
  assertEquals(m.text_content, '월요일에 낸 글');
  assertEquals(m.is_late, false); // 새 내용이 없으므로 지각도 다시 안 잰다
});

Deno.test('빈 문자열 파일 이름도 "안 보냄"으로 본다', () => {
  const m = mergeSubmission(EXISTING, { ...NOTHING_NEW, fileName: '', isLate: true }, QUESTIONS);
  assertEquals(m.file_name, '보고서.hwp');
  assertEquals(m.is_late, false);
});

Deno.test('파일을 새로 내면 지각 여부를 다시 잰다 (fileName 갈래)', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      fileName: '늦은.hwp',
      fileSize: 1,
      driveFileId: 'd',
      isLate: true,
    },
    QUESTIONS,
  );
  assertEquals(m.is_late, true);
});

Deno.test('070 이전 행처럼 is_late 가 null 이면 이번 값을 쓴다', () => {
  const m = mergeSubmission(
    { ...EXISTING, is_late: null },
    {
      ...NOTHING_NEW,
      selfAssessment: [{ questionId: 'q1', prompt: 'p', answer: 'x' }],
      isLate: true,
    },
    QUESTIONS,
  );
  assertEquals(m.is_late, true);
});

Deno.test('prompt 없는 옛 답은 버린다 (타입 단언을 사실로 만든다)', () => {
  const m = mergeSelfAssessment([{ questionId: 'q9', answer: '옛 답' }], null, []);
  assertEquals(m, null);
});

Deno.test('★학생 id 도 재제출에 지워지지 않는다 (L-5)', () => {
  const m = mergeSubmission(
    EXISTING,
    {
      ...NOTHING_NEW,
      selfAssessment: [{ questionId: 'q1', prompt: 'p', answer: 'x' }],
    },
    QUESTIONS,
  );
  assertEquals(m.student_id, 'stu-1');
});
