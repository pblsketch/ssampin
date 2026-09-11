/**
 * 근거 관문(ADR-103) — 장면이 요청서의 근거 줄·번호·「작성 구성」을 어떻게 바꾸는가.
 *
 * 여기서 지키는 것:
 *  - 배치가 0건이면 **예전 코드 경로**(줄 형식·순서·머리가 전부 같다)
 *  - 번호는 **실린 줄에만** 붙는다 — 빠진 근거를 가리키는 지시를 보내지 않는다
 *  - 장면 메모·이음말은 가림을 거친다
 *  - 메모에 금지어가 남으면 **메모만** 빠지고 근거는 실린다
 *  - 이어진 흐름은 예산을 나눠 뒤 주제가 통째로 빠지지 않는다
 */
import { describe, it, expect } from 'vitest';
import {
  buildRecordDraftPack,
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  EVALUATION_SYNTHESIZE_REF,
  type DraftPackEvidence,
  type DraftPackInput,
  type DraftPackScene,
} from '@domain/services/recordDraftPack';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { resolveCompositionFromScenes } from '@domain/rules/narrativeComposition';
import { makeScene } from '@domain/rules/narrativeScenes';
import type { NarrativeScene } from '@domain/entities/InquiryThread';

const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 15 },
    { name: '박서연', studentNumber: 3 },
  ],
  [],
);

function ev(p: Partial<DraftPackEvidence> & { id: string }): DraftPackEvidence {
  return { content: `${p.id} 본문`, ...p };
}

function input(p: Partial<DraftPackInput> = {}): DraftPackInput {
  return {
    studentName: '김지훈',
    roster: ROSTER,
    areaLabel: '교과 세부능력 및 특기사항',
    evidences: [ev({ id: 'e1' })],
    ...p,
  };
}

/** 장면 정의 → 요청서용 장면 + 구성. 화면이 하는 일과 같은 순서로 만든다. */
function withScenes(
  saved: readonly NarrativeScene[],
  map: Record<string, readonly string[]>,
): {
  scenes: DraftPackScene[];
  composition: NonNullable<ReturnType<typeof resolveCompositionFromScenes>>;
} {
  const resolved = saved.map((s) => ({ ...s, evidenceIds: [...(map[s.id] ?? [])] }));
  const composition = resolveCompositionFromScenes({
    saved: resolved,
    resolved,
    frame: 'inquiry',
    chained: false,
    placedCount: Object.values(map).flat().length,
  });
  if (composition === null) throw new Error('테스트 전제: 구성이 만들어져야 한다');
  return {
    scenes: resolved.map((s) => ({
      sceneId: s.id,
      mark: s.role,
      label: s.label ?? s.role,
      ...(s.note === undefined ? {} : { note: s.note }),
      ...(s.leadIn === undefined ? {} : { leadIn: s.leadIn }),
      evidenceIds: s.evidenceIds,
    })),
    composition,
  };
}

const SCENES: NarrativeScene[] = [
  makeScene('sc1', 'evaluation', { moduleId: 'teacherJudgement' }),
  makeScene('sc2', 'motive', { moduleId: 'legacyMotive' }),
  makeScene('sc3', 'process', { moduleId: 'legacyProcess' }),
];

describe('근거 관문 — 배치가 0건이면 예전 경로 그대로', () => {
  it('장면을 안 넘기면 근거 줄이 `- ` 로 시작한다', () => {
    const text = buildRecordDraftPack(input()).text;
    expect(text).toContain('- e1 본문');
    expect(text).not.toContain('1. e1 본문');
  });

  it('장면을 넘겨도 배치가 0건이면 근거 줄 형식이 그대로다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc2: ['없는근거'] });
    const text = buildRecordDraftPack(input({ scenes, composition })).text;
    expect(text).toContain('- e1 본문');
    expect(text).not.toContain('그 밖의 근거:');
  });
});

describe('번호는 실린 줄에만 붙는다', () => {
  it('장면 순서대로 번호가 매겨지고 구성이 그 번호를 가리킨다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc2: ['e1'], sc3: ['e2'] });
    const text = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e2' }), ev({ id: 'e1' })], scenes, composition }),
    ).text;
    expect(text).toContain('1. e1 본문');
    expect(text).toContain('2. e2 본문');
    expect(text).toMatch(/근거: 1/);
    expect(text).toMatch(/근거: 2/);
  });

  it('★빠진 근거를 가리키는 번호를 만들지 않는다 (금지어로 빠진 경우)', () => {
    const { scenes, composition } = withScenes(SCENES, { sc2: ['bad'], sc3: ['ok'] });
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'bad', content: '학원에서 미리 배웠다고 말함' }),
          ev({ id: 'ok', content: '수업에서 질문을 자주 함' }),
        ],
        scenes,
        composition,
      }),
    );
    // 빠진 장면은 "건너뜁니다" 라고 말하고, 실린 근거는 1번 하나뿐이다.
    expect(pack.text).toContain('근거: (제외됨 - 이 문단은 건너뜁니다)');
    expect(pack.text).toContain('1. 수업에서 질문을 자주 함');
    expect(pack.text).not.toContain('근거: 2');
    expect(pack.exclusions.some((x) => x.evidenceId === 'bad' && x.reason === 'prohibited')).toBe(
      true,
    );
  });

  it('어느 장면에도 없는 근거는 "그 밖의 근거" 로 가고, 문단을 새로 만들지 말라고 말한다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc2: ['e1'] });
    const text = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1' }), ev({ id: 'e9' })], scenes, composition }),
    ).text;
    expect(text).toContain('그 밖의 근거:');
    expect(text).toContain('문단을 새로 만들지 말고');
  });
});

describe('장면 메모', () => {
  it('메모가 구성 줄 아래에 붙고 가림을 거친다', () => {
    const saved = SCENES.map((s) => (s.id === 'sc2' ? { ...s, note: '박서연과 함께 물었다' } : s));
    const { scenes, composition } = withScenes(saved, { sc2: ['e1'] });
    const text = buildRecordDraftPack(input({ scenes, composition })).text;
    expect(text).toContain('선생님이 읽은 것:');
    expect(text).not.toContain('박서연');
  });
});

describe('장면 이음말(ADR-108) — 앞 장면에서 이 장면으로', () => {
  it('둘째 장면부터 「앞 장면에서 이어짐」 줄이 붙고 가림을 거친다. 첫 장면의 이음말은 싣지 않는다', () => {
    const saved = SCENES.map((s) =>
      s.id === 'sc2'
        ? { ...s, leadIn: '박서연의 질문이 실험으로' }
        : s.id === SCENES[0]!.id
          ? { ...s, leadIn: '첫 장면엔 뜻 없음' }
          : s,
    );
    const { scenes, composition } = withScenes(saved, { sc2: ['e1'] });
    const text = buildRecordDraftPack(input({ scenes, composition })).text;
    expect(text).toContain('앞 장면에서 이어짐:');
    expect(text).not.toContain('박서연');
    expect(text).not.toContain('첫 장면엔 뜻 없음');
  });
});

describe('근거 메모 — 근거보다 약하게 다룬다', () => {
  it('메모가 근거 줄 뒤에 붙는다', () => {
    const text = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', note: '질문이 출발점이었다' })] }),
    ).text;
    expect(text).toContain('(교사 메모: 질문이 출발점이었다)');
  });

  it('메모의 실명도 가린다', () => {
    const text = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', note: '박서연이 먼저 물었다' })] }),
    ).text;
    expect(text).not.toContain('박서연');
  });

  it('★금지어가 남으면 메모만 빠지고 근거는 실린다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [ev({ id: 'e1', content: '수업에서 질문함', note: '학원에서 배웠다고 함' })],
      }),
    );
    expect(pack.text).toContain('수업에서 질문함');
    expect(pack.text).not.toContain('학원');
    expect(pack.droppedNoteCount).toBe(1);
    // 근거 자체는 제외되지 않았다.
    expect(pack.exclusions).toEqual([]);
  });
});

describe('이어진 흐름 — 예산을 나눈다', () => {
  const long = (marker: string, chars: number): string => `${marker} ` + '가'.repeat(chars);

  it('★앞 주제가 근거를 잔뜩 갖고 있어도 뒤 주제가 통째로 빠지지 않는다', () => {
    // 앞 주제만으로 상한(12,000자)을 채울 수 있는 상황. 한 덩어리로 앞에서부터 채우면
    // 뒤 주제는 한 줄도 못 싣는다 — 그러면 "이어 쓰기"의 뜻이 없어진다.
    const pack = buildRecordDraftPack(
      input({
        evidences: [],
        chain: [
          {
            threadTitle: '기초 탐구',
            scenes: [],
            evidences: [1, 2, 3, 4, 5, 6].map((i) =>
              ev({ id: `a${i}`, content: long(`앞${i}`, 2_000), date: `2026-03-0${i}` }),
            ),
          },
          {
            threadTitle: '심화 탐구',
            linkNote: '기초에서 확장',
            scenes: [],
            evidences: [ev({ id: 'b1', content: long('뒤', 3_000), date: '2026-06-01' })],
          },
        ],
      }),
    );
    expect(pack.text).toContain('주제 1: 기초 탐구');
    expect(pack.text).toContain('주제 2: 심화 탐구');
    expect(pack.text).toContain('이음: 기초에서 확장');
    // 앞도 일부 실리고, 뒤는 반드시 실린다.
    expect(pack.text).toContain('앞1');
    expect(pack.text).toContain('뒤 ');
    // 앞 주제가 자기 몫(1/2)을 넘겨 먹지 않았다 — 빠진 것은 too-long 으로 보고된다.
    expect(
      pack.exclusions.some((x) => x.reason === 'too-long' && x.evidenceId.startsWith('a')),
    ).toBe(true);
    expect(pack.exclusions.some((x) => x.evidenceId === 'b1')).toBe(false);
    expect(pack.text.length).toBeLessThan(DRAFT_PACK_MAX_EVIDENCE_CHARS + 6_000);
  });

  it('이음말도 가림을 거친다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [],
        chain: [
          { threadTitle: '앞', scenes: [], evidences: [ev({ id: 'a' })] },
          {
            threadTitle: '뒤',
            linkNote: '박서연 사례에서 이어짐',
            scenes: [],
            evidences: [ev({ id: 'b' })],
          },
        ],
      }),
    );
    expect(pack.text).not.toContain('박서연');
  });

  it('사슬이 3개를 넘으면 먼 쪽부터 떨어뜨린다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [],
        chain: ['하나', '둘', '셋', '넷'].map((t) => ({
          threadTitle: t,
          scenes: [],
          evidences: [ev({ id: t })],
        })),
      }),
    );
    expect(pack.text).not.toContain('주제 1: 하나');
    expect(pack.text).toContain('넷');
  });
});

/** 번호 줄 `n. [` 부터 다음 번호 줄·빈 줄 앞까지 — 「작성 구성」에서 한 장면의 지시 묶음. */
function sceneBlock(text: string, n: number): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${n}. [`));
  if (start < 0) return '';
  const out = [lines[start] as string];
  for (const l of lines.slice(start + 1)) {
    if (/^\d+\. \[/.test(l) || l.trim().length === 0) break;
    out.push(l);
  }
  return out.join('\n');
}

describe('★평가 자리는 비어 있어도 건너뛰지 않는다 (ADR-109, 오너 요청 2026-09-11)', () => {
  it('근거 없는 평가 장면은 근거 전체를 종합해 쓰라고 말한다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc2: ['e1'] });
    const block = sceneBlock(buildRecordDraftPack(input({ scenes, composition })).text, 1);
    expect(block).toContain('[평가]');
    expect(block).toContain(EVALUATION_SYNTHESIZE_REF);
    expect(block).not.toContain('건너뜁니다');
  });

  it('평가를 뒤로 옮겨도 그 자리를 알아본다 — 역할은 차례가 아니라 요소에서 읽는다', () => {
    const moved = [SCENES[1], SCENES[2], SCENES[0]] as NarrativeScene[];
    const { scenes, composition } = withScenes(moved, { sc2: ['e1'] });
    const text = buildRecordDraftPack(input({ scenes, composition })).text;
    expect(sceneBlock(text, 3)).toContain('[평가]');
    expect(sceneBlock(text, 3)).toContain(EVALUATION_SYNTHESIZE_REF);
    // 비어 있는 과정 자리는 예전처럼 건너뛴다 — 예외는 평가 하나뿐이다.
    expect(sceneBlock(text, 2)).toContain('근거: (제외됨 - 이 문단은 건너뜁니다)');
  });

  it('평가에 놓은 근거가 금지어로 빠져도 평가 문단은 남는다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc1: ['bad'], sc2: ['ok'] });
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'bad', content: '학원에서 미리 배웠다고 말함' }),
          ev({ id: 'ok', content: '수업에서 질문을 자주 함' }),
        ],
        scenes,
        composition,
      }),
    );
    expect(sceneBlock(pack.text, 1)).toContain(EVALUATION_SYNTHESIZE_REF);
    expect(sceneBlock(pack.text, 2)).toContain('근거: 1');
  });

  it('평가에 근거를 놓았으면 예전처럼 그 번호를 가리킨다', () => {
    const { scenes, composition } = withScenes(SCENES, { sc1: ['e1'], sc2: ['e2'] });
    const text = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1' }), ev({ id: 'e2' })], scenes, composition }),
    ).text;
    expect(sceneBlock(text, 1)).toContain('근거: 1');
    expect(text).not.toContain(EVALUATION_SYNTHESIZE_REF);
  });

  it('빈 평가에 적은 선생님 메모는 종합 지시와 함께 실린다', () => {
    const saved = SCENES.map((s) => (s.id === 'sc1' ? { ...s, note: '끝까지 따져 묻는 학생' } : s));
    const { scenes, composition } = withScenes(saved, { sc2: ['e1'] });
    const block = sceneBlock(buildRecordDraftPack(input({ scenes, composition })).text, 1);
    expect(block).toContain(EVALUATION_SYNTHESIZE_REF);
    expect(block).toContain('선생님이 읽은 것: 끝까지 따져 묻는 학생');
  });
});
