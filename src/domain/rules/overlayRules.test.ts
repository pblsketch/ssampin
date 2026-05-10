import { describe, it, expect } from 'vitest';
import {
  aggregateResponses,
  anonymizeStudents,
  canActivateOverlay,
  canReturnToEditor,
  finalizeOverlayResults,
  generateShortCode,
  isResponseDataMatchingOverlay,
  maskResultsForStudent,
  transitionSessionToActive,
  transitionSessionToArchived,
} from './overlayRules';
import type {
  AggregatedResultData,
  LessonSession,
  OverlayResults,
  PollOption,
  SessionStudent,
  Slide,
  SlideOverlay,
  StudentResponse,
} from '@domain/entities/InteractiveSlides';
import {
  asLessonId,
  asOverlayId,
  asResponseId,
  asSessionId,
  asShortCode,
  asSlideId,
  asStudentToken,
  isShortCode,
  SHORT_CODE_CHARSET,
  SHORT_CODE_LENGTH,
  type OverlayId,
} from '@domain/valueObjects/InteractiveSlidesIds';

// ─────────────────────────────────────────────────────────────
// 결정론적 PRNG (테스트용)
// ─────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────
const slideId = asSlideId('slide-1');
const overlayId = asOverlayId('ov-1');

const pollOptions: readonly PollOption[] = [
  { id: 'A', label: '첫번째' },
  { id: 'B', label: '두번째' },
  { id: 'C', label: '세번째' },
];

const pollOverlay: SlideOverlay = {
  id: overlayId,
  slideId,
  type: 'poll',
  position: { xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 20 },
  autoActivate: false,
  config: {
    type: 'poll',
    question: '어떤 거?',
    options: pollOptions,
    multiSelect: false,
  },
  createdAt: 1000,
};

const slide: Slide = {
  id: slideId,
  pageNumber: 1,
  imagePath: 'file:///cache/slide-1.png',
  overlays: [pollOverlay],
};

const sessionFixture = (overrides: Partial<LessonSession> = {}): LessonSession => ({
  id: asSessionId('sess-1'),
  lessonId: asLessonId('lesson-1'),
  sessionName: '2반 1교시',
  shortCode: asShortCode('ACDEFG'),
  status: 'lobby',
  currentSlideIndex: 0,
  resultsVisibility: 'anonymous',
  accessMode: 'lan',
  startedAt: 1000,
  archivedAt: null,
  anonymized: false,
  ...overrides,
});

const studentFixture = (
  i: number,
  presence: 'online' | 'offline' = 'online',
): SessionStudent => ({
  studentToken: asStudentToken(`tok-${i}`),
  displayName: `홍길동${i}`,
  originalName: null,
  joinedAt: 1000 + i,
  presence,
});

const pollResponse = (token: string, optionId: string): StudentResponse => ({
  id: asResponseId(`resp-${token}-${optionId}`),
  sessionId: asSessionId('sess-1'),
  slideId,
  overlayId,
  studentToken: asStudentToken(token),
  clientResponseId: `c-${token}-${optionId}`,
  data: { type: 'poll', selectedOptionIds: [optionId] },
  submittedAt: 2000,
});

// ─────────────────────────────────────────────────────────────
describe('canActivateOverlay (Phase 1: 슬라이드당 동시 1개)', () => {
  it('빈 active set에서 활성화 가능', () => {
    const r = canActivateOverlay(slide, overlayId, new Set());
    expect(r.allowed).toBe(true);
  });

  it('이미 활성 오버레이가 있으면 차단', () => {
    const r = canActivateOverlay(
      slide,
      overlayId,
      new Set<OverlayId>([asOverlayId('other')]),
    );
    expect(r).toEqual({ allowed: false, reason: 'already-active-on-slide' });
  });

  it('존재하지 않는 overlayId는 not-found', () => {
    const r = canActivateOverlay(slide, asOverlayId('missing'), new Set());
    expect(r).toEqual({ allowed: false, reason: 'overlay-not-found' });
  });
});

// ─────────────────────────────────────────────────────────────
describe('aggregateResponses', () => {
  it('poll: 옵션별 카운트', () => {
    const responses = [
      pollResponse('1', 'A'),
      pollResponse('2', 'A'),
      pollResponse('3', 'B'),
    ];
    const r = aggregateResponses(pollOverlay, responses, [
      studentFixture(1),
      studentFixture(2),
      studentFixture(3),
    ]);
    expect(r.type).toBe('poll');
    if (r.type === 'poll') {
      expect(r.counts).toEqual({ A: 2, B: 1, C: 0 });
      expect(r.totalVotes).toBe(3);
    }
  });

  it('poll: 알 수 없는 optionId는 무시', () => {
    const bad: StudentResponse = {
      ...pollResponse('1', 'A'),
      data: { type: 'poll', selectedOptionIds: ['ZZ'] },
    };
    const r = aggregateResponses(pollOverlay, [bad], [studentFixture(1)]);
    if (r.type === 'poll') {
      expect(r.totalVotes).toBe(0);
      expect(r.counts).toEqual({ A: 0, B: 0, C: 0 });
    }
  });

  it('text: 최신순 정렬', () => {
    const textOverlay: SlideOverlay = {
      ...pollOverlay,
      type: 'text',
      config: { type: 'text', prompt: '의견', maxLength: 200 },
    };
    const responses: StudentResponse[] = [
      {
        ...pollResponse('1', 'A'),
        data: { type: 'text', value: '첫번째' },
        submittedAt: 1000,
      },
      {
        ...pollResponse('2', 'A'),
        data: { type: 'text', value: '두번째' },
        submittedAt: 2000,
      },
    ];
    const r = aggregateResponses(textOverlay, responses, [
      studentFixture(1),
      studentFixture(2),
    ]);
    if (r.type === 'text') {
      expect(r.entries.map((e) => e.value)).toEqual(['두번째', '첫번째']);
    }
  });

  it('wordcloud: 정규화(소문자 + trim) + 누적', () => {
    const wcOverlay: SlideOverlay = {
      ...pollOverlay,
      type: 'wordcloud',
      config: { type: 'wordcloud', prompt: '키워드', maxKeywords: 5 },
    };
    const responses: StudentResponse[] = [
      {
        ...pollResponse('1', 'A'),
        data: { type: 'wordcloud', keywords: ['Apple', '  apple ', 'banana'] },
      },
      {
        ...pollResponse('2', 'A'),
        data: { type: 'wordcloud', keywords: ['Apple', ''] },
      },
    ];
    const r = aggregateResponses(wcOverlay, responses, [
      studentFixture(1),
      studentFixture(2),
    ]);
    if (r.type === 'wordcloud') {
      expect(r.tally.apple).toBe(3);
      expect(r.tally.banana).toBe(1);
      expect(r.tally['']).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('maskResultsForStudent (visibility)', () => {
  const pollResults: AggregatedResultData = {
    type: 'poll',
    counts: { A: 2, B: 1, C: 0 },
    totalVotes: 3,
  };

  it('hidden: null 반환', () => {
    expect(maskResultsForStudent(pollResults, 'hidden')).toBeNull();
  });

  it('full: 그대로', () => {
    expect(maskResultsForStudent(pollResults, 'full')).toEqual(pollResults);
  });

  it('anonymous + poll: 그대로 (집계는 이미 익명)', () => {
    expect(maskResultsForStudent(pollResults, 'anonymous')).toEqual(pollResults);
  });

  it('anonymous + text: token/이름 제거', () => {
    const text: AggregatedResultData = {
      type: 'text',
      entries: [
        {
          studentToken: asStudentToken('tok-1'),
          displayName: '홍길동',
          value: '의견',
          submittedAt: 100,
        },
      ],
    };
    const r = maskResultsForStudent(text, 'anonymous');
    if (r && r.type === 'text') {
      expect(r.entries[0]!.studentToken).toBe('');
      expect(r.entries[0]!.displayName).toBe('');
      expect(r.entries[0]!.value).toBe('의견');
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('generateShortCode', () => {
  it('6자, charset 안의 문자만 사용', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const code = generateShortCode(rng);
      expect(code.length).toBe(SHORT_CODE_LENGTH);
      for (const ch of code) {
        expect(SHORT_CODE_CHARSET.includes(ch)).toBe(true);
      }
    }
  });

  it('isShortCode: 헷갈림 문자(B/0/1 등) 거부', () => {
    expect(isShortCode('ACDEFG')).toBe(true);
    expect(isShortCode('ABCDEF')).toBe(false); // B 포함
    expect(isShortCode('012345')).toBe(false);
    expect(isShortCode('12345')).toBe(false); // 길이 부족
    expect(isShortCode('ACDEFGH')).toBe(false); // 길이 초과
  });
});

// ─────────────────────────────────────────────────────────────
describe('anonymizeStudents (PIPA §11.1)', () => {
  it('학생N으로 매핑 + originalName 보존', () => {
    const students = [studentFixture(1), studentFixture(2), studentFixture(3)];
    const { anonymized, mapping } = anonymizeStudents(students);

    expect(anonymized.map((s) => s.displayName)).toEqual([
      '학생1',
      '학생2',
      '학생3',
    ]);
    // originalName이 null이면 displayName(원본) 보존
    expect(anonymized[0]!.originalName).toBe('홍길동1');
    // 매핑 테이블
    expect(mapping[students[0]!.studentToken]).toBe('학생1');
  });

  it('이미 익명화된 입력에도 안전하게 다시 적용', () => {
    const students = [studentFixture(1)];
    const once = anonymizeStudents(students);
    const twice = anonymizeStudents(once.anonymized);
    expect(twice.anonymized[0]!.displayName).toBe('학생1');
  });
});

// ─────────────────────────────────────────────────────────────
describe('isResponseDataMatchingOverlay', () => {
  it('타입 일치 → true', () => {
    const ok = isResponseDataMatchingOverlay(
      { type: 'poll', selectedOptionIds: ['A'] },
      pollOverlay,
    );
    expect(ok).toBe(true);
  });

  it('타입 불일치 → false (도메인 안전망)', () => {
    const bad = isResponseDataMatchingOverlay(
      { type: 'text', value: 'x' },
      pollOverlay,
    );
    expect(bad).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('finalizeOverlayResults (idempotent)', () => {
  const draft: OverlayResults = {
    overlayId,
    type: 'poll',
    aggregated: { type: 'poll', counts: { A: 1 }, totalVotes: 1 },
    respondCount: 1,
    totalCount: 5,
    finalizedAt: null,
  };

  it('null이면 finalizedAt 설정', () => {
    const r = finalizeOverlayResults(draft, 9999);
    expect(r.finalizedAt).toBe(9999);
  });

  it('이미 finalize된 결과는 그대로 (idempotent)', () => {
    const finalized: OverlayResults = { ...draft, finalizedAt: 5000 };
    const r = finalizeOverlayResults(finalized, 9999);
    expect(r.finalizedAt).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────
describe('세션 상태 전이', () => {
  it('lobby → active 전이', () => {
    const s = sessionFixture({ status: 'lobby' });
    const r = transitionSessionToActive(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.status).toBe('active');
  });

  it('active → active 시도는 invalid-transition', () => {
    const s = sessionFixture({ status: 'active' });
    const r = transitionSessionToActive(s);
    expect(r).toEqual({ ok: false, reason: 'invalid-transition' });
  });

  it('archive 전이는 archivedAt 기록', () => {
    const s = sessionFixture({ status: 'active' });
    const r = transitionSessionToArchived(s, 9999);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.status).toBe('archived');
      expect(r.session.archivedAt).toBe(9999);
    }
  });

  it('이미 archived → idempotent', () => {
    const s = sessionFixture({ status: 'archived', archivedAt: 5000 });
    const r = transitionSessionToArchived(s, 9999);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.archivedAt).toBe(5000);
  });

  it('canReturnToEditor: lobby에서만 true', () => {
    expect(canReturnToEditor(sessionFixture({ status: 'lobby' }))).toBe(true);
    expect(canReturnToEditor(sessionFixture({ status: 'active' }))).toBe(false);
    expect(canReturnToEditor(sessionFixture({ status: 'archived' }))).toBe(false);
  });
});
