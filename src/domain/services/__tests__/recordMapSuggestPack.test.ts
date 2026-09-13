import { describe, expect, it } from 'vitest';

import type { InquiryThread } from '../../entities/InquiryThread';
import type { RecordEvidence } from '../../entities/RecordEvidence';
import type { RecordMapScaffoldPolicy } from '../../entities/RecordMapProposal';
import { validateRecordMapProposal } from '../../rules/recordMapProposal';
import { rosterFrom } from '../../rules/redactOutbound';
import { buildRecordMapSuggestPack, parseRecordMapSuggestion } from '../recordMapSuggestPack';

const NOW = 1_700_000_000_000;
const CONTEXT = {
  studentRef: 'student-1',
  classId: 'class-korean',
  subjectId: 'korean',
  area: 'subject' as const,
  term: '2026-1',
};
const POLICY: RecordMapScaffoldPolicy = {
  kind: 'fixed',
  scaffold: {
    id: 'fixed-1',
    name: '김지훈 질문형',
    frame: 'inquiry',
    scenes: [{ role: 'motive', moduleId: 'issueQuestion', label: '질문 장면' }],
  },
};

const evidence = (
  id: string,
  content: string,
  over: Partial<RecordEvidence> = {},
): RecordEvidence => ({
  id,
  studentRef: 'student-1',
  classId: 'class-korean',
  areas: ['subject'],
  content,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const thread: InquiryThread = {
  id: 'thread-1',
  studentRef: 'student-1',
  classId: 'class-korean',
  title: '김지훈의 자료 탐구',
  keywords: [],
  status: 'open',
  term: '2026-1',
  scenes: [
    {
      id: 'scene-1',
      role: 'motive',
      moduleId: 'issueQuestion',
      note: '김지훈이 세운 질문',
      evidenceIds: ['safe'],
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

function build(evidences: readonly RecordEvidence[], threads: readonly InquiryThread[] = [thread]) {
  return buildRecordMapSuggestPack({
    studentName: '김지훈',
    roster: rosterFrom([
      { name: '김지훈', studentNumber: 1 },
      { name: '박서연', studentNumber: 2 },
    ]),
    context: CONTEXT,
    evidences,
    threads,
    scaffoldPolicy: POLICY,
  });
}

describe('buildRecordMapSuggestPack', () => {
  it('한 학생의 전체 지도 요청에서 실명과 다른 학생 이름을 같은 세션으로 가린다', () => {
    const pack = build([
      evidence('safe', '김지훈이 박서연과 자료를 비교함', { note: '김지훈의 질문이 분명함' }),
    ]);
    expect(pack.canCallAi).toBe(true);
    expect(pack.includedCount).toBe(1);
    expect(pack.text).not.toContain('김지훈');
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).toContain('［이름');
    expect(pack.numberedEvidenceIds).toEqual(['safe']);
  });

  it('교사 제외·빈 내용·기재 금지 근거를 보내지 않고 제외 근거의 장면 메모도 우회하지 않는다', () => {
    const pack = build(
      [
        evidence('safe', '자료를 비교해 차이를 설명함'),
        evidence('teacher', '보내면 안 되는 교사 제외 원문', { excludedFromAi: true }),
        evidence('empty', '   '),
        evidence('prohibited', '교내 백일장에서 장려상을 받음'),
      ],
      [
        {
          ...thread,
          scenes: [
            {
              id: 'unsafe-scene',
              role: 'process',
              note: '보내면 안 되는 장면 메모',
              evidenceIds: ['teacher'],
            },
          ],
        },
      ],
    );
    expect(pack.numberedEvidenceIds).toEqual(['safe', 'teacher']);
    expect(pack.includedCount).toBe(1);
    expect(pack.exclusions.map((item) => item.reason)).toEqual(
      expect.arrayContaining(['teacher', 'empty', 'prohibited']),
    );
    expect(pack.text).not.toContain('보내면 안 되는 교사 제외 원문');
    expect(pack.text).not.toContain('보내면 안 되는 장면 메모');
    expect(pack.text).not.toContain('장려상');
  });

  it('근거 메모에만 금지 항목이 있으면 근거는 보내고 메모만 뺀다', () => {
    const pack = build([
      evidence('safe', '자료를 비교해 차이를 설명함', { note: '토익 850점을 취득함' }),
    ]);
    expect(pack.includedCount).toBe(1);
    expect(pack.suppressedMemoCount).toBe(1);
    expect(pack.text).not.toContain('토익');
  });

  it('연락처가 든 근거와 메모를 개인정보 규칙으로 밖에 보내지 않는다', () => {
    const pack = build([
      evidence('phone-content', '보호자 010-1234-5678로 연락함'),
      evidence('phone-note', '자료를 비교함', { note: '문의 010-9876-5432' }),
    ]);
    expect(pack.numberedEvidenceIds).toEqual(['phone-note']);
    expect(pack.suppressedMemoCount).toBe(1);
    expect(pack.text).not.toContain('010-');
  });

  it('학생·수업반·영역 경계 밖 근거는 요청서에 싣지 않는다', () => {
    const pack = build([
      evidence('safe', '현재 과목 근거'),
      evidence('student', '다른 학생 비밀', { studentRef: 'student-2' }),
      evidence('class', '다른 과목 비밀', { classId: 'class-math' }),
      evidence('area', '다른 영역 비밀', { areas: ['career'] }),
    ]);
    expect(pack.numberedEvidenceIds).toEqual(['safe']);
    expect(pack.text).not.toContain('비밀');
  });

  it('보낼 수 있는 근거가 0건이면 AI 호출용 글을 만들지 않는다', () => {
    const pack = build([
      evidence('empty', ' '),
      evidence('teacher', '숨김', { excludedFromAi: true }),
    ]);
    expect(pack.canCallAi).toBe(false);
    expect(pack.text).toBe('');
    expect(pack.includedCount).toBe(0);
  });

  it('분량 제한으로 빠진 근거 수를 별도 계약으로 돌려준다', () => {
    const pack = build([
      evidence('large', '가'.repeat(12_001)),
      evidence('small', '짧지만 충분한 관찰'),
    ]);
    expect(pack.canCallAi).toBe(true);
    expect(pack.numberedEvidenceIds).toEqual(['small']);
    expect(pack.tooLongCount).toBe(1);
    expect(pack.text).toContain('분량 제한으로 보내지 못한 근거: 1건');
  });

  it('기존 정책은 빈 평가 장면과 moduleId를 이름 붙인 JSON으로 보내고 제외 근거 위치를 잠근다', () => {
    const existingPolicy: RecordMapScaffoldPolicy = {
      kind: 'existing',
      defaultScaffold: POLICY.kind === 'fixed' ? POLICY.scaffold : neverScaffold(),
    };
    const pack = buildRecordMapSuggestPack({
      studentName: '김지훈',
      roster: rosterFrom([{ name: '김지훈', studentNumber: 1 }]),
      context: CONTEXT,
      evidences: [
        evidence('safe', '자료를 비교해 질문함'),
        evidence('locked', 'AI에 보내지 않을 원문', { excludedFromAi: true, threadId: 'thread-1' }),
      ],
      threads: [
        {
          ...thread,
          scenes: [
            {
              id: 'empty-eval',
              role: 'evaluation',
              moduleId: 'teacherJudgement',
              evidenceIds: [],
            },
            {
              id: 'locked-scene',
              role: 'motive',
              moduleId: 'issueQuestion',
              label: '질문 장면',
              evidenceIds: ['safe', 'locked'],
            },
          ],
        },
      ],
      scaffoldPolicy: existingPolicy,
    });

    expect(pack.includedCount).toBe(1);
    expect(pack.numberedEvidenceIds).toEqual(['safe', 'locked']);
    expect(pack.text).toContain(
      '"id":"empty-eval","role":"evaluation","moduleId":"teacherJudgement"',
    );
    expect(pack.text).toContain('"evidenceNumbers":[]');
    expect(pack.text).toContain('"moduleId":"issueQuestion","label":"질문 장면"');
    expect(pack.text).toContain('"evidenceNumbers":[1,2],"lockedEvidenceNumbers":[2]');
    expect(pack.text).not.toContain('AI에 보내지 않을 원문');
    expect(pack.text).toContain('기존 주제의 모든 현재 장면을 빠짐없이 같은 차례로 반환하세요');
  });

  it('뼈대 후보도 role뿐 아니라 moduleId와 label을 JSON 필드로 명시한다', () => {
    const pack = build([evidence('safe', '자료를 비교함')]);
    expect(pack.text).toContain(
      '"order":1,"role":"motive","moduleId":"issueQuestion","label":"질문 장면"',
    );
  });

  it('저장 label이 없는 내장 뼈대는 label null과 별도 화면 이름을 보낸다', () => {
    const pack = buildRecordMapSuggestPack({
      studentName: '김지훈',
      roster: rosterFrom([{ name: '김지훈', studentNumber: 1 }]),
      context: CONTEXT,
      evidences: [evidence('safe', '자료를 비교함')],
      threads: [],
      scaffoldPolicy: {
        kind: 'fixed',
        scaffold: {
          id: 'builtin-like',
          name: '기본형',
          frame: 'inquiry',
          scenes: [{ role: 'evaluation', moduleId: 'teacherJudgement' }],
        },
      },
    });
    expect(pack.text).toContain(
      '"moduleId":"teacherJudgement","label":null,"displayName":"교사 판단"',
    );
  });
});

describe('parseRecordMapSuggestion', () => {
  const base = {
    runId: 'run-1',
    attemptId: 'attempt-1',
    context: CONTEXT,
    sourceFingerprint: 'fp-1',
    numberedEvidenceIds: ['e1', 'e2'],
    mappings: [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' as const }],
    now: NOW,
  };

  it('JSON 객체 하나를 읽고 번호를 실제 근거 ID로 바꾸며 별칭을 복원한다', () => {
    const answer = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:1',
          title: '［이름1］의 질문',
          status: 'open',
          scaffold: { scaffoldId: 'fixed-1', reason: '1번에서 질문이 보임' },
          scenes: [
            {
              id: 'tmp-scene:1',
              role: 'motive',
              moduleId: 'issueQuestion',
              label: '질문 장면',
              note: '［이름1］의 1번 질문',
              evidenceNumbers: [1, 1],
            },
          ],
        },
      ],
      unplacedEvidence: [{ evidenceNumber: 2, reason: '관련이 약함' }],
      warnings: [],
    });
    const result = parseRecordMapSuggestion(answer, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failure);
    expect(result.proposal.topics[0]?.title).toBe('김지훈의 질문');
    expect(result.proposal.topics[0]?.scenes[0]?.evidenceIds).toEqual(['e1']);
    expect(result.proposal.unplacedEvidence).toEqual([{ evidenceId: 'e2', reason: '관련이 약함' }]);
  });

  it('실제 Codex 응답처럼 선택 필드가 null이어도 생략값으로 안전하게 읽는다', () => {
    const answer = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:1',
          existingThreadId: null,
          title: '자료 비교',
          status: 'open',
          scaffold: { scaffoldId: null, reason: null },
          scenes: [
            {
              id: 'tmp-scene:1',
              role: 'process',
              moduleId: null,
              label: '',
              note: null,
              leadIn: '',
              evidenceNumbers: [1],
            },
          ],
          link: null,
        },
      ],
      unplacedEvidence: [],
      warnings: [],
    });

    const result = parseRecordMapSuggestion(answer, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failure);
    expect(result.proposal.topics[0]).toMatchObject({
      id: 'tmp:1',
      scaffold: { scaffoldId: null },
      scenes: [{ role: 'process', evidenceIds: ['e1'] }],
    });
    expect(result.proposal.topics[0]?.existingThreadId).toBeUndefined();
    expect(result.proposal.topics[0]?.link).toBeUndefined();
    expect(result.proposal.topics[0]?.scaffold.reason).toBeUndefined();
    expect(result.proposal.topics[0]?.scenes[0]?.moduleId).toBeUndefined();
    expect(result.proposal.topics[0]?.scenes[0]?.label).toBeUndefined();
    expect(result.proposal.topics[0]?.scenes[0]?.note).toBeUndefined();
    expect(result.proposal.topics[0]?.scenes[0]?.leadIn).toBeUndefined();
  });

  it('실제 fixed 응답처럼 새 장면 id가 없으면 주제와 순번으로 충돌 없는 임시 id를 만든다', () => {
    const answer = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:fixed-topic',
          existingThreadId: null,
          title: '자료 비교',
          status: 'open',
          scaffold: { scaffoldId: 'fixed-1', reason: null },
          scenes: [
            {
              role: 'motive',
              moduleId: 'issueQuestion',
              label: '질문 장면',
              evidenceNumbers: [1],
            },
            {
              role: 'process',
              moduleId: null,
              label: null,
              evidenceNumbers: [2],
            },
          ],
          link: null,
        },
      ],
      unplacedEvidence: [],
      warnings: [],
    });

    const result = parseRecordMapSuggestion(answer, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failure);
    expect(result.proposal.topics[0]?.scenes.map((scene) => scene.id)).toEqual([
      'tmp:fixed-topic:scene:1',
      'tmp:fixed-topic:scene:2',
    ]);
  });

  it('existing 응답이 기존 장면 id를 생략하면 생성 ID로 읽되 기존 구조 검증은 계속 거절한다', () => {
    const answer = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:existing',
          existingThreadId: 'thread-1',
          title: thread.title,
          status: 'open',
          scaffold: { scaffoldId: null },
          scenes: [
            {
              role: 'motive',
              moduleId: 'issueQuestion',
              label: null,
              evidenceNumbers: [1],
            },
          ],
        },
      ],
      unplacedEvidence: [],
      warnings: [],
    });
    const result = parseRecordMapSuggestion(answer, base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failure);
    const existingThread = {
      ...thread,
      scenes: [{ ...thread.scenes![0]!, evidenceIds: ['e1'] }],
    };
    const validation = validateRecordMapProposal({
      proposal: result.proposal,
      evidences: [evidence('e1', '자료를 비교함', { threadId: 'thread-1' })],
      threads: [existingThread],
      scaffoldPolicy: {
        kind: 'existing',
        defaultScaffold: POLICY.kind === 'fixed' ? POLICY.scaffold : neverScaffold(),
      },
    });
    expect(validation.issues.map((issue) => issue.code)).toContain('existing-scene-changed');
  });

  it('머리말·코드 울타리·범위 밖 번호·임의 moduleId를 엄격히 거부한다', () => {
    const valid = JSON.stringify({
      schemaVersion: 1,
      topics: [],
      unplacedEvidence: [],
      warnings: [],
    });
    expect(parseRecordMapSuggestion(`설명\n${valid}`, base)).toEqual({
      ok: false,
      failure: 'invalid-json',
    });
    expect(parseRecordMapSuggestion(`\`\`\`json\n${valid}\n\`\`\``, base)).toEqual({
      ok: false,
      failure: 'invalid-json',
    });
    const badNumber = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:1',
          title: '주제',
          status: 'open',
          scaffold: { scaffoldId: 'fixed-1' },
          scenes: [{ id: 's1', role: 'motive', evidenceNumbers: [99] }],
        },
      ],
      unplacedEvidence: [],
      warnings: [],
    });
    expect(parseRecordMapSuggestion(badNumber, base)).toEqual({
      ok: false,
      failure: 'invalid-reference',
    });
    const badModule = badNumber
      .replace('[99]', '[1]')
      .replace('"evidenceNumbers"', '"moduleId":"invented","evidenceNumbers"');
    expect(parseRecordMapSuggestion(badModule, base)).toEqual({
      ok: false,
      failure: 'invalid-reference',
    });
  });

  it('선택 필드의 null은 받지만 숫자·객체 같은 잘못된 타입은 계속 거부한다', () => {
    const invalidOptional = JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          id: 'tmp:1',
          existingThreadId: 123,
          title: '주제',
          status: 'open',
          scaffold: { scaffoldId: null, reason: { text: '이유' } },
          scenes: [{ id: 's1', role: 'motive', moduleId: null, note: 7, evidenceNumbers: [1] }],
          link: [],
        },
      ],
      unplacedEvidence: [],
      warnings: [],
    });
    expect(parseRecordMapSuggestion(invalidOptional, base)).toEqual({
      ok: false,
      failure: 'invalid-reference',
    });
  });

  it('scene id를 생략하거나 null로 둘 수 있지만 숫자 id는 거부한다', () => {
    const answerWith = (id: unknown) =>
      JSON.stringify({
        schemaVersion: 1,
        topics: [
          {
            id: 'tmp:1',
            title: '주제',
            status: 'open',
            scaffold: { scaffoldId: 'fixed-1' },
            scenes: [{ id, role: 'motive', moduleId: 'issueQuestion', evidenceNumbers: [1] }],
          },
        ],
        unplacedEvidence: [],
        warnings: [],
      });
    const nullResult = parseRecordMapSuggestion(answerWith(null), base);
    expect(nullResult.ok).toBe(true);
    if (!nullResult.ok) throw new Error(nullResult.failure);
    expect(nullResult.proposal.topics[0]?.scenes[0]?.id).toBe('tmp:1:scene:1');
    expect(parseRecordMapSuggestion(answerWith(7), base)).toEqual({
      ok: false,
      failure: 'invalid-reference',
    });
  });
});

function neverScaffold(): never {
  throw new Error('unreachable');
}

it('preserves cross-area location as a locked reference without sending its content', () => {
  const mixed = {
    ...thread,
    scenes: [{ id: 'mixed', role: 'process' as const, evidenceIds: ['safe', 'other-area'] }],
  };
  const pack = build(
    [
      evidence('safe', 'allowed'),
      evidence('other-area', 'DO_NOT_SEND_AREA_CONTENT', {
        areas: ['behavior'],
        threadId: thread.id,
      }),
    ],
    [mixed],
  );
  expect(pack.numberedEvidenceIds).toEqual(['safe', 'other-area']);
  expect(pack.includedCount).toBe(1);
  expect(pack.text).not.toContain('DO_NOT_SEND_AREA_CONTENT');
});
