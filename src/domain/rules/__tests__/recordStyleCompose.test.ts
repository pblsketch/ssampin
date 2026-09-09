/**
 * 작성 방식 조합·검사 — ADR-099.
 *
 * 여기서 지키는 것: 기본값이면 아무것도 안 바뀐다 · 시작 방식이 교사 판단의 자리를 정한다 ·
 * 검사는 앱이 실제로 셀 수 있는 것만 본다 · 규정 판본이 모자라면 되돌리고 그 사실을 말한다.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import { RECORD_FOCUSES, RECORD_MODULES, focusById } from '@domain/rules/recordStyleCatalog';
import {
  applyPromptVersionGate,
  buildStyleInstruction,
  checkStyleReadiness,
  isDefaultStyle,
  normalizeWritingStyle,
  resolveComposition,
  summarizeComposition,
} from '@domain/rules/recordStyleCompose';

const base = (over: Partial<RecordWritingStyle> = {}): RecordWritingStyle => ({
  ...DEFAULT_RECORD_WRITING_STYLE,
  ...over,
});

describe('카탈로그 자체의 정합', () => {
  it('초점이 가리키는 요소는 모두 사전에 있다', () => {
    for (const f of RECORD_FOCUSES) {
      for (const id of [...f.body, ...f.extras]) {
        expect(RECORD_MODULES[id], `${f.id} → ${id}`).toBeDefined();
      }
    }
  });

  it('교사 판단은 어느 초점의 본문에도 들어 있지 않다 — 자리는 시작 방식이 정한다', () => {
    for (const f of RECORD_FOCUSES) {
      expect(f.body).not.toContain('teacherJudgement');
      expect(f.extras).not.toContain('teacherJudgement');
    }
  });

  it('모든 요소의 색은 형광펜 4종 안에 있다 — 어휘를 늘리지 않는다', () => {
    for (const m of Object.values(RECORD_MODULES)) {
      expect(['evaluation', 'motive', 'process', 'result']).toContain(m.role);
    }
  });

  it('모르는 초점을 물으면 기존형을 돌려준다', () => {
    expect(focusById('없는초점').id).toBe('legacyInquiry');
  });

  it('초점은 7종이다 - 겹치는 것을 합쳤다(2026-09-09)', () => {
    expect(RECORD_FOCUSES).toHaveLength(7);
    expect(RECORD_FOCUSES.map((f) => f.id)).toEqual([
      'legacyInquiry',
      'compareJudge',
      'feedbackRevise',
      'designCreate',
      'collaborate',
      'interestExplore',
      'lifeRelation',
    ]);
  });

  it('사전에 있는 요소는 모두 어느 초점엔가 쓰인다 - 죽은 항목을 남기지 않는다', () => {
    const used = new Set<string>(['teacherJudgement']);
    for (const f of RECORD_FOCUSES) for (const id of [...f.body, ...f.extras]) used.add(id);
    expect(Object.keys(RECORD_MODULES).filter((id) => !used.has(id))).toEqual([]);
  });
});

describe('없어진 옛 초점은 표를 거쳐 기존형이 된다 (저장된 설정 호환)', () => {
  it('별칭 표에 적힌 세 값이 기존형으로 옮겨진다', () => {
    for (const old of ['achievement', 'conceptApply', 'questionVerify']) {
      expect(focusById(old).id).toBe('legacyInquiry');
      expect(normalizeWritingStyle(base({ focus: old as never })).focus).toBe('legacyInquiry');
    }
  });

  it('옛 초점 + 기본 시작·묶기는 "기본값"이 되어 요청서가 예전과 같아진다', () => {
    const old = base({ focus: 'achievement' as never });
    expect(isDefaultStyle(old)).toBe(true);
    expect(resolveComposition(old).shouldEmitComposition).toBe(false);
  });

  it('카탈로그에 없는 옛 요소 id 는 버린다', () => {
    const r = normalizeWritingStyle(
      base({
        focus: 'compareJudge',
        disabledModules: ['realQuestion' as never, 'ownConclusion'],
        extraModules: ['applyProcess' as never],
      }),
    );
    expect(r.disabledModules).toEqual(['ownConclusion']);
    expect(r.extraModules).toBeUndefined();
  });
});

describe('기본값 — 고르지 않은 선생님에게는 아무 변화가 없다', () => {
  it('기본값이면 구성 블록을 붙이지 않는다', () => {
    const r = resolveComposition(base());
    expect(isDefaultStyle(base())).toBe(true);
    expect(r.shouldEmitComposition).toBe(false);
  });

  it('초점만 바꿔도 구성 블록이 붙는다', () => {
    expect(resolveComposition(base({ focus: 'collaborate' })).shouldEmitComposition).toBe(true);
  });

  it('추가 지시만 적은 것은 기본값을 깨지 않는다 — 지시는 따로 나가는 블록이다', () => {
    expect(isDefaultStyle(base({ instruction: '문장을 짧게' }))).toBe(true);
  });
});

describe('시작 방식이 교사 판단의 자리를 정한다', () => {
  it('교사 판단 먼저 — 맨 앞이고 어미를 요구한다', () => {
    const r = resolveComposition(base({ focus: 'collaborate', opening: 'evaluation' }));
    expect(r.modules[0]?.id).toBe('teacherJudgement');
    expect(r.firstIsEvaluation).toBe(true);
    expect(buildStyleInstruction(r)).toContain('~하는 학생임.');
  });

  it('수행 먼저 — 교사 판단이 맨 뒤로 가고 어미 요구가 사라진다', () => {
    const r = resolveComposition(base({ focus: 'collaborate', opening: 'performance' }));
    expect(r.modules[0]?.id).toBe('sharedTask');
    expect(r.modules[r.modules.length - 1]?.id).toBe('teacherJudgement');
    expect(r.firstIsEvaluation).toBe(false);
    expect(buildStyleInstruction(r)).not.toContain('~하는 학생임.');
  });

  it('질문 먼저 — 동기 역할 요소를 맨 앞으로 끌어올린다', () => {
    const r = resolveComposition(base({ focus: 'compareJudge', opening: 'question' }));
    expect(r.modules[0]?.role).toBe('motive');
    expect(r.modules[r.modules.length - 1]?.id).toBe('teacherJudgement');
  });

  it('질문 먼저인데 동기 요소가 없는 초점이면 순서를 바꾸지 않는다', () => {
    const r = resolveComposition(base({ focus: 'feedbackRevise', opening: 'question' }));
    expect(r.modules[0]?.id).toBe('firstAttempt');
  });
});

describe('요소 조정', () => {
  it('뺀 요소는 구성에서 사라진다', () => {
    const r = resolveComposition(
      base({ focus: 'compareJudge', disabledModules: ['counterReview', 'ownConclusion'] }),
    );
    expect(r.modules.map((m) => m.id)).not.toContain('ownConclusion');
  });

  it('교사 판단은 뺄 수 없다 — 뺀 것으로 저장돼 있어도 되살린다', () => {
    const r = resolveComposition(
      base({ focus: 'feedbackRevise', disabledModules: ['teacherJudgement'] }),
    );
    expect(r.modules.map((m) => m.id)).toContain('teacherJudgement');
  });

  it('그 초점이 허락하지 않은 추가 요소는 버린다', () => {
    const r = resolveComposition(
      base({ focus: 'feedbackRevise', extraModules: ['counterReview'] }),
    );
    expect(r.modules.map((m) => m.id)).not.toContain('counterReview');
  });

  it('수업 맥락은 맨 앞(교사 판단 다음)에 붙는다', () => {
    const r = resolveComposition(
      base({ focus: 'feedbackRevise', extraModules: ['lessonContext'], opening: 'evaluation' }),
    );
    expect(r.modules.map((m) => m.id).slice(0, 2)).toEqual(['teacherJudgement', 'lessonContext']);
  });

  it('요소를 다 빼도 교사 판단 하나는 남는다', () => {
    const f = focusById('feedbackRevise');
    const r = resolveComposition(base({ focus: 'feedbackRevise', disabledModules: [...f.body] }));
    expect(r.modules.map((m) => m.id)).toEqual(['teacherJudgement']);
  });
});

describe('구성 문장', () => {
  it('번호 · 색 표식 · 필요한 근거 · 하지 말 것을 함께 적는다', () => {
    const r = resolveComposition(base({ focus: 'feedbackRevise' }));
    const text = buildStyleInstruction(r);
    expect(text).toContain('작성 구성');
    expect(text).toContain('1. [평가] 교사 판단');
    expect(text).toContain('필요한 근거:');
    expect(text).toContain('교사가 고쳐 준 것을 학생이 스스로 해결한 것으로 바꾸지 않습니다.');
  });

  it('묶는 방식 문장이 들어가고, 성취별 묶기는 하나로 잇지 말라고 말한다', () => {
    const text = buildStyleInstruction(
      resolveComposition(base({ focus: 'collaborate', grouping: 'byAchievement' })),
    );
    expect(text).toContain('하나의 이야기로 잇지 않습니다');
  });

  it('평가 자리는 강점·역량을 낱말로 적으라고 말한다 (오너 지적 2026-09-09)', () => {
    const text = buildStyleInstruction(resolveComposition(base({ focus: 'collaborate' })));
    expect(text).toContain('강점이나 역량을 낱말로');
    expect(text).toContain('무엇을 했는지만 길게 풀어 놓고 끝내면');
  });

  it('문장 잇는 법을 말하되 "필요한 자리에만" 을 함께 말한다 (한쪽으로 쏠리지 않게)', () => {
    const text = buildStyleInstruction(resolveComposition(base({ focus: 'collaborate' })));
    expect(text).toContain('필요한 자리에만');
    expect(text).toContain('한 문단에 한두 번이면 충분합니다');
    expect(text).toContain('무엇을 하는 문장인지');
  });

  it('근거를 이유 없이 빠뜨리지 말라고 한다. 다만 「대표 장면 하나」에는 안 붙인다', () => {
    const many = buildStyleInstruction(
      resolveComposition(base({ focus: 'lifeRelation', grouping: 'connected' })),
    );
    expect(many).toContain('이유 없이 빠뜨리지 마세요');
    const single = buildStyleInstruction(
      resolveComposition(base({ focus: 'lifeRelation', grouping: 'single' })),
    );
    expect(single).not.toContain('이유 없이 빠뜨리지 마세요');
  });

  it('화면 요약과 요청서가 같은 값에서 나온다', () => {
    const r = resolveComposition(base({ focus: 'collaborate', opening: 'performance' }));
    const summary = summarizeComposition(r);
    expect(summary.startsWith('공동 과제')).toBe(true);
    expect(summary.endsWith('교사 판단')).toBe(true);
  });
});

describe('검사 — 막지 않고 알린다', () => {
  const check = (over: Partial<Parameters<typeof checkStyleReadiness>[0]> = {}) =>
    checkStyleReadiness({
      style: base(),
      evidenceCount: 3,
      distinctDateCount: 3,
      area: 'subject',
      ...over,
    }).map((w) => w.kind);

  it('근거가 초점이 요구하는 수보다 적으면 알린다', () => {
    expect(check({ style: base({ focus: 'compareJudge' }), evidenceCount: 1 })).toContain(
      'few-evidence',
    );
  });

  it('피드백·수정인데 날짜가 하나뿐이면 변화를 쓰지 않는다고 알린다', () => {
    expect(
      check({ style: base({ focus: 'feedbackRevise' }), evidenceCount: 3, distinctDateCount: 1 }),
    ).toContain('no-before-after');
  });

  it('질문 시작인데 질문 자리가 없는 초점이면 알린다', () => {
    expect(check({ style: base({ focus: 'feedbackRevise', opening: 'question' }) })).toContain(
      'question-opening-unfit',
    );
  });

  it('이어진 과정인데 근거가 하나면 알린다', () => {
    expect(check({ evidenceCount: 1 })).toContain('connected-single-evidence');
  });

  it('행특에 수업 초점을 고르면 알린다', () => {
    expect(check({ area: 'behavior', style: base({ focus: 'collaborate' }) })).toContain(
      'area-focus-mismatch',
    );
  });

  it('세특에 생활·관계 종합을 고르면 알린다', () => {
    expect(check({ area: 'subject', style: base({ focus: 'lifeRelation' }) })).toContain(
      'area-focus-mismatch',
    );
  });

  it('맞는 조합에는 경고가 없다', () => {
    expect(check({ area: 'behavior', style: base({ focus: 'lifeRelation' }) })).toEqual([]);
    expect(check({ style: base({ focus: 'collaborate' }) })).toEqual([]);
  });

  it('근거가 0건이어도 "적다" 경고를 내지 않는다 — 아직 고르는 중일 수 있다', () => {
    expect(check({ style: base({ focus: 'compareJudge' }), evidenceCount: 0 })).not.toContain(
      'few-evidence',
    );
  });
});

describe('규정 판본 문지기', () => {
  it('판본이 모자라고 기본형이 아니면 경고한다', () => {
    const w = checkStyleReadiness({
      style: base({ focus: 'collaborate' }),
      evidenceCount: 3,
      distinctDateCount: 3,
      area: 'subject',
      promptVersion: 2,
    });
    expect(w.map((x) => x.kind)).toContain('prompt-version');
  });

  it('판본이 모자라도 기본형이면 경고하지 않는다', () => {
    const w = checkStyleReadiness({
      style: base(),
      evidenceCount: 3,
      distinctDateCount: 3,
      area: 'subject',
      promptVersion: 2,
    });
    expect(w.map((x) => x.kind)).not.toContain('prompt-version');
  });

  it('판본 2 에서는 고른 구성을 기존형으로 되돌리고 되돌렸다고 알린다', () => {
    const picked = base({ focus: 'designCreate', opening: 'performance', instruction: '짧게' });
    const gated = applyPromptVersionGate(picked, 2);
    expect(gated.downgraded).toBe(true);
    expect(isDefaultStyle(gated.style)).toBe(true);
    // 추가 지시는 살린다 — 구성과 달리 규정과 충돌하지 않는다.
    expect(gated.style.instruction).toBe('짧게');
  });

  it('판본 3 이상이면 그대로 간다', () => {
    const picked = base({ focus: 'designCreate' });
    expect(applyPromptVersionGate(picked, 3).downgraded).toBe(false);
    expect(applyPromptVersionGate(picked, 3).style.focus).toBe('designCreate');
  });

  it('판본을 아직 못 받았으면 되돌리지 않는다 — 실행 직전에 다시 본다', () => {
    const picked = base({ focus: 'designCreate' });
    expect(applyPromptVersionGate(picked, undefined).downgraded).toBe(false);
  });
});

describe('교사의 해석을 요구한다 (오너 지적 2026-09-09, codex 실측)', () => {
  const text = () =>
    buildStyleInstruction(
      resolveComposition(base({ focus: 'lifeRelation', grouping: 'connected' })),
    );

  it('사실만 옮기지 말고 그 일에서 읽은 것을 함께 쓰라고 말한다', () => {
    expect(text()).toContain('교사가 읽은 것을 함께 씁니다');
    expect(text()).toContain('~확인됨');
  });

  it('★해석을 요구하면서 지어내기·되풀이도 함께 막는다 (한쪽으로 쏠리지 않게)', () => {
    const t = text();
    expect(t).toContain('곧바로 읽히는 것만');
    expect(t).toContain('성격 전체나 미래를 넘겨짚지 않습니다');
    expect(t).toContain('맨 앞 교사 판단을 되풀이하지 않습니다');
    expect(t).toContain('해석 문장을 쓰지 않고 사실만 남깁니다');
    expect(t).toContain('다시 모아 요약하는 항목을 덧붙이지 않습니다');
  });
});
