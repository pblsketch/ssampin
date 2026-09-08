/**
 * @vitest-environment jsdom
 *
 * 분량 조절 섹션 — 화면과 배선의 계약(ADR-088).
 *
 * ★이 파일이 진짜 방어선이다. 여기서 지키는 것들은 **검증 게이트 4종이 전부 초록인 채로도
 *   깨질 수 있는** 종류다. 계획서 §E 의 연결부가 여기 하나씩 대응한다.
 *
 * 1. 조절 대상이 **저장된 글**이 되면, 한도를 넘겨 저장이 거부된 글은 조절할 길이 없어진다.
 * 2. 한도를 넘긴 결과에 [이 글로 바꾸기]가 남으면 눌러도 저장이 거부된다(죽은 버튼).
 * 3. 조절안 판에 [뒤에 붙이기]가 남으면 합산이 한도를 넘어 또 거부된다.
 * 4. 기재 금지 항목이 든 본문이 **묻지 않고** 나간다.
 * 5. 조절을 시작한 뒤 고친 글이 조용히 덮인다.
 * 6. 근거 0건인데 보충하기를 눌러 지어내기를 부른다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { neisByteLength } from '@domain/entities/RecordDraft';
import { useRecordAiRunStore } from '@adapters/stores/useRecordAiRunStore';
import { RecordDraftLengthPanel } from '../RecordDraftLengthPanel';
import type { LengthAdjustCandidate } from '../lengthAdjustRun';
import type { LengthAdjustOutcome } from '../RecordDraftLengthPanel';

const OVER_LIMIT = '가'.repeat(600); // 1,800바이트 — 한도 1,500 초과
const SAVED = '저장되어 있던 짧은 글.';

function candidate(text: string, over: Partial<LengthAdjustCandidate> = {}): LengthAdjustCandidate {
  return {
    attempt: 1,
    paragraphs: [{ role: null, text }],
    bytes: neisByteLength(text),
    insufficient: false,
    excluded: '',
    includedCount: 0,
    nonDraft: false,
    nonDraftReason: '',
    ...over,
  };
}

function outcome(
  texts: readonly string[],
  sourceText: string,
  prohibited: readonly string[] = [],
): LengthAdjustOutcome {
  return {
    candidates: texts.map((t, i) => candidate(t, { attempt: (i + 1) as 1 | 2 })),
    sourceText,
    sourceProhibited: prohibited,
  };
}

type PanelOver = Partial<Parameters<typeof RecordDraftLengthPanel>[0]>;

function panel(over: PanelOver = {}) {
  const props = {
    runKey: 'sA:autonomy:',
    area: 'autonomy' as const,
    level: 'high' as const,
    areaLimit: 1500,
    areaLimitVerified: true,
    getSourceText: () => OVER_LIMIT,
    detectProhibited: () => [],
    evidenceCount: 3,
    lockedByOther: false,
    onRun: async () => outcome(['줄인 글.'], OVER_LIMIT),
    onApply: async () => {},
    onInsertOnly: () => {},
    ...over,
  };
  return { ...render(<RecordDraftLengthPanel {...props} />), props };
}

/** 섹션을 펼친다 — 이미 펼쳐져 있으면(한도 초과 원문이면 저절로 펼쳐진다, R-4) 건드리지 않는다. */
function openSection(): void {
  const header = screen.getByRole('button', { name: /분량 조절/ });
  if (header.getAttribute('aria-expanded') !== 'true') fireEvent.click(header);
}

/** 섹션을 펼치고 [조절안 만들기]까지 누른다. */
async function openAndRun(): Promise<void> {
  await act(async () => {
    openSection();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '조절안 만들기' }));
  });
}

afterEach(() => {
  cleanup();
  // 단계는 스토어에 있다(ADR-093) — 테스트 사이에 결과가 새지 않게 비운다.
  useRecordAiRunStore.getState().reset();
});

describe('★단계·결과는 스토어가 든다 — 학생을 바꿨다 돌아와도 결과가 있다 (ADR-093, P7)', () => {
  it('같은 runKey 로 다시 만들면 결과가 그대로 있고, 다른 runKey 는 아무것도 모른다', async () => {
    const r = panel();
    await openAndRun();
    expect(screen.getByTestId('length-adjust-preview').textContent).toBe('줄인 글.');
    r.unmount();
    // 다른 학생(runKey) 화면 — 결과가 보이지 않는다.
    panel({ runKey: 'sB:autonomy:' });
    expect(screen.queryByTestId('length-adjust-preview')).toBeNull();
    cleanup();
    // 원래 학생으로 돌아오면 결과가 있다.
    panel();
    expect(screen.getByTestId('length-adjust-preview').textContent).toBe('줄인 글.');
  });

  it('실행 중에 패널이 새로 만들어져도 "조절 중"이 보이고, 결과가 오면 새 인스턴스에 뜬다', async () => {
    let resolve: ((o: LengthAdjustOutcome) => void) | null = null;
    const r = panel({
      onRun: () =>
        new Promise<LengthAdjustOutcome>((res) => {
          resolve = res;
        }),
    });
    await openAndRun();
    expect(screen.getByText(/1차 조절 중이에요/)).toBeTruthy();
    r.unmount();
    panel();
    expect(screen.getByText(/1차 조절 중이에요/)).toBeTruthy();
    await act(async () => {
      resolve?.(outcome(['늦게 온 결과.'], OVER_LIMIT));
    });
    expect(screen.getByTestId('length-adjust-preview').textContent).toBe('늦게 온 결과.');
  });
});

describe('★조절 대상은 화면의 현재 글이다 (저장된 글이 아니다)', () => {
  it('저장이 거부된 초과 글을 그대로 조절 대상으로 넘긴다', async () => {
    const seen: string[] = [];
    panel({
      // 등록부가 돌려주는 값 = 저장이 거부돼 디스크에 없는 글
      getSourceText: () => OVER_LIMIT,
      onRun: async () => {
        seen.push(OVER_LIMIT);
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    await openAndRun();
    expect(seen[0]).toBe(OVER_LIMIT);
    expect(seen[0]).not.toBe(SAVED);
  });

  it('글이 비어 있으면 조절 UI 자체를 그리지 않는다', async () => {
    panel({ getSourceText: () => '   ' });
    await act(async () => {
      openSection();
    });
    expect(screen.getByText(/이 칸에 쓴 글이 없어서/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '조절안 만들기' })).toBeNull();
  });
});

describe('★한도를 넘긴 결과는 버리지 않고 회수한다', () => {
  it('[이 글로 바꾸기] 대신 [편집칸에 넣기]가 나오고, 얼마나 줄여야 하는지 알려 준다', async () => {
    const inserted: string[] = [];
    const over = '나'.repeat(520); // 1,560바이트 — 여전히 한도 초과
    panel({
      onRun: async () => outcome([over], OVER_LIMIT),
      onInsertOnly: (t) => inserted.push(t),
    });
    await openAndRun();

    expect(screen.queryByRole('button', { name: '이 글로 바꾸기' })).toBeNull();
    expect(screen.getByText(/저장하려면 60바이트를 더 줄여야 해요/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /편집칸에 넣기/ }));
    });
    expect(inserted).toEqual([over]);
  });

  it('한도 이내면 [이 글로 바꾸기]가 나온다', async () => {
    panel({ onRun: async () => outcome(['짧게 줄인 글.'], OVER_LIMIT) });
    await openAndRun();
    expect(screen.getByRole('button', { name: '이 글로 바꾸기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /편집칸에 넣기/ })).toBeNull();
  });
});

describe('★기재 금지 항목은 보내기 전에 묻는다 (지우지 않는다)', () => {
  it('묻기 전에는 실행이 0회다', async () => {
    let runs = 0;
    panel({
      detectProhibited: () => ['대회·수상'],
      onRun: async () => {
        runs += 1;
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    await openAndRun();

    expect(runs).toBe(0); // ★확인 전에는 나가지 않는다
    expect(
      screen.getByText(/기재 금지 항목\(대회·수상\)이 들어 있는 문장이 함께 나갑니다/),
    ).toBeTruthy();
  });

  it('[그대로 보내기]를 눌러야 실행된다', async () => {
    let runs = 0;
    panel({
      detectProhibited: () => ['대회·수상'],
      onRun: async () => {
        runs += 1;
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    await openAndRun();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '그대로 보내기' }));
    });
    expect(runs).toBe(1);
  });

  it('[먼저 지우러 가기]를 누르면 실행하지 않고 대기로 돌아간다', async () => {
    let runs = 0;
    panel({
      detectProhibited: () => ['질병·건강'],
      onRun: async () => {
        runs += 1;
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    await openAndRun();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '먼저 지우러 가기' }));
    });
    expect(runs).toBe(0);
    expect(screen.getByRole('button', { name: '조절안 만들기' })).toBeTruthy();
  });
});

describe('★조절을 시작한 뒤 글을 고쳤으면 바로 덮지 않는다', () => {
  it('되묻고, [그래도 이 글로 바꾸기]를 눌러야 반영된다', async () => {
    let source = OVER_LIMIT;
    const applied: string[] = [];
    panel({
      getSourceText: () => source,
      onRun: async () => outcome(['줄인 글.'], OVER_LIMIT),
      onApply: async (picked) => {
        applied.push(picked.paragraphs[0]?.text ?? '');
      },
    });
    await openAndRun();

    // 결과가 뜬 뒤 선생님이 편집 칸을 더 고쳤다.
    source = `${OVER_LIMIT} 방금 더 쓴 문장.`;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 글로 바꾸기' }));
    });
    expect(applied).toHaveLength(0); // ★바로 덮지 않는다
    expect(screen.getByText('그 사이에 글을 고치셨어요.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '그래도 이 글로 바꾸기' }));
    });
    expect(applied).toEqual(['줄인 글.']);
  });

  it('글이 그대로면 되묻지 않고 바로 반영한다', async () => {
    const applied: string[] = [];
    panel({
      onRun: async () => outcome(['줄인 글.'], OVER_LIMIT),
      onApply: async (picked) => {
        applied.push(picked.paragraphs[0]?.text ?? '');
      },
    });
    await openAndRun();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 글로 바꾸기' }));
    });
    expect(applied).toEqual(['줄인 글.']);
  });
});

describe('★근거가 없으면 보충하기를 누를 수 없다 (지어내기를 부르는 자리)', () => {
  it('짧은 글인데 근거 0건이면 [조절안 만들기]가 잠기고 이유가 보인다', async () => {
    panel({ evidenceCount: 0, getSourceText: () => SAVED });
    await act(async () => {
      openSection();
    });
    const run = screen.getByRole('button', { name: '조절안 만들기' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(screen.getByTestId('length-adjust-plan').textContent).toContain(
      '근거가 없어서 채울 수 없어요',
    );
  });
});

describe('★방향은 고르지 않는다 — 목표가 정한다 (2026-09-08 오너 결정)', () => {
  it('목표보다 길면 "줄입니다"라고 말하고 shrink 로 실행한다', async () => {
    const kinds: string[] = [];
    panel({
      onRun: async (kind) => {
        kinds.push(kind);
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    expect(screen.getByTestId('length-adjust-plan').textContent).toContain('많아 줄입니다');
    expect(screen.queryByRole('button', { name: '줄이기' })).toBeNull();
    await openAndRun();
    expect(kinds).toEqual(['shrink']);
  });

  it('목표보다 짧고 근거가 있으면 "채웁니다"라고 말하고 expand 로 실행한다', async () => {
    const kinds: string[] = [];
    panel({
      getSourceText: () => SAVED,
      evidenceCount: 3,
      onRun: async (kind) => {
        kinds.push(kind);
        return outcome(['근거로 채운 글.'], SAVED);
      },
    });
    await act(async () => {
      openSection();
    });
    expect(screen.getByTestId('length-adjust-plan').textContent).toContain(
      '적어 근거 자료로 채웁니다',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조절안 만들기' }));
    });
    expect(kinds).toEqual(['expand']);
  });

  it('이미 목표 안이면 조절할 것이 없다고 말하고 버튼이 잠긴다', async () => {
    const onTarget = '가'.repeat(490); // 1,470바이트 — 하한 1,425 ~ 목표 1,500 안
    panel({ getSourceText: () => onTarget });
    await act(async () => {
      openSection();
    });
    expect(screen.getByTestId('length-adjust-plan').textContent).toContain('이미 목표 안');
    expect(
      (screen.getByRole('button', { name: '조절안 만들기' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('대상 라벨과 바이트를 한 줄로 보여 준다 — 판 미리보기의 숫자와 같은 계산', async () => {
    panel({ sourceVersionLabel: 'AI 초안 v1' });
    expect(screen.getByTestId('length-adjust-source-bytes').textContent).toContain(
      'AI 초안 v1 1,800바이트',
    );
  });
});

describe('★결과 두 개면 골라서 반영한다 (재조정이 돌았을 때)', () => {
  it('탭이 두 개 뜨고, 고른 쪽이 반영된다', async () => {
    const applied: number[] = [];
    panel({
      onRun: async () => outcome(['1차로 줄인 글.', '2차로 더 줄인 글.'], OVER_LIMIT),
      onApply: async (picked) => {
        applied.push(picked.attempt);
      },
    });
    await openAndRun();

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    // 기본은 마지막(2차)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 글로 바꾸기' }));
    });
    expect(applied).toEqual([2]);

    // 1차를 골라도 반영된다 — "아까 그 판이 더 나았는데"를 살린다.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('tab')[0]!);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 글로 바꾸기' }));
    });
    expect(applied).toEqual([2, 1]);
  });
});

describe('★목표는 확인된 한도를 넘지 못한다', () => {
  it('2,000을 쳐도 1,500으로 되돌려지고 이유가 보인다', async () => {
    panel();
    await act(async () => {
      openSection();
    });
    const input = screen.getByLabelText('목표 분량(바이트)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2000' } });
    fireEvent.blur(input);

    expect(input.value).toBe('1500');
    expect(screen.getByText(/이 영역 한도는 1,500바이트예요/)).toBeTruthy();
  });
});

describe('★근거 부족·무변화·실패는 정직하게 말한다', () => {
  it('근거가 부족했으면 그렇게 알린다', async () => {
    panel({
      onRun: async () => ({
        candidates: [candidate('짧은 글.', { insufficient: true })],
        sourceText: OVER_LIMIT,
        sourceProhibited: [],
      }),
    });
    await openAndRun();
    expect(screen.getByText('근거가 부족해 목표보다 짧게 작성했어요.')).toBeTruthy();
  });

  it('원문이 그대로 돌아오면 사실만 말한다 (원인을 추측하지 않는다)', async () => {
    panel({ onRun: async () => outcome([OVER_LIMIT], OVER_LIMIT) });
    await openAndRun();
    expect(screen.getByText('분량이 바뀌지 않았어요.')).toBeTruthy();
  });

  it('실행이 실패하면 이유를 띄우고 다시 시도할 수 있다', async () => {
    panel({
      onRun: async () => {
        throw new Error('연결이 끊겼어요. 다시 시도해 주세요.');
      },
    });
    await openAndRun();
    expect(screen.getByText('연결이 끊겼어요. 다시 시도해 주세요.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(screen.getByRole('button', { name: '조절안 만들기' })).toBeTruthy();
  });
});

describe('★중복 실행은 참조로 막는다', () => {
  it('[조절안 만들기]를 연달아 눌러도 실행은 1회다', async () => {
    let runs = 0;
    panel({
      onRun: async () => {
        runs += 1;
        return outcome(['줄인 글.'], OVER_LIMIT);
      },
    });
    await act(async () => {
      openSection();
    });
    await act(async () => {
      const b = screen.getByRole('button', { name: '조절안 만들기' });
      fireEvent.click(b);
      fireEvent.click(b);
      fireEvent.click(b);
    });
    expect(runs).toBe(1);
  });
});

describe('다른 AI 작업이 도는 중이면 잠근다', () => {
  it('입력과 버튼이 비활성이고 이유가 보인다', async () => {
    panel({ lockedByOther: true });
    await act(async () => {
      openSection();
    });
    expect(screen.getByText('다른 AI 작업이 끝나면 이어서 할 수 있어요.')).toBeTruthy();
    // ★`fieldset disabled` 는 안의 컨트롤을 한꺼번에 끄고 스크린 리더에도 전달된다.
    //   (버튼의 `.disabled` 속성 자체는 켜지지 않는다 - 브라우저 규칙이 그렇다.)
    const fieldset = screen
      .getByRole('button', { name: '조절안 만들기' })
      .closest('fieldset') as HTMLFieldSetElement | null;
    expect(fieldset).not.toBeNull();
    expect(fieldset?.disabled).toBe(true);
  });
});

describe('메타 — 화면 문구 규칙', () => {
  it('이 섹션 문구에 em 대시가 없다 (쌍점을 쓴다)', async () => {
    panel();
    await act(async () => {
      openSection();
    });
    expect(document.body.textContent ?? '').not.toContain('—');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('★대상이 이미 한도를 넘었으면 접혀 있어도 펼친다 (2026-09-08 R-4)', () => {
  it('한도 초과 원문이면 처음부터 펼쳐져 있다', () => {
    panel({ getSourceText: () => OVER_LIMIT });
    expect(screen.getByRole('button', { name: /분량 조절/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('한도 안이면 접힌 채 시작한다(예전과 같다)', () => {
    panel({ getSourceText: () => SAVED });
    expect(screen.getByRole('button', { name: /분량 조절/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
});

describe('★설명문(거절)은 저장 후보로 내놓지 않는다 (2026-09-08 R-3)', () => {
  it('전부 설명문이면 실패로 말하고 [편집칸에 넣기]·[이 글로 바꾸기]가 없다', async () => {
    const refusal = candidate(
      '이 요청은 그대로 수행하기 어렵습니다. 추가 근거를 알려주시면 작성하겠습니다.',
      {
        nonDraft: true,
        nonDraftReason: 'AI가 초안 대신 설명(거절·되묻기)을 보냈어요.',
      },
    );
    panel({
      onRun: async () => ({ candidates: [refusal], sourceText: OVER_LIMIT, sourceProhibited: [] }),
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조절안 만들기' }));
    });
    expect(screen.getByRole('status').textContent).toContain('설명');
    expect(screen.queryByRole('button', { name: /편집칸에 넣기/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '이 글로 바꾸기' })).toBeNull();
    expect(screen.getByTestId('length-adjust-non-draft').textContent).toContain(
      '수행하기 어렵습니다',
    );
  });

  it('설명문과 초안이 섞였으면 초안만 후보로 남긴다', async () => {
    const refusal = candidate('추가 근거를 알려주시면 작성하겠습니다.', {
      attempt: 2,
      nonDraft: true,
      nonDraftReason: '설명',
    });
    const good = candidate('줄인 글.', { attempt: 1 });
    panel({
      onRun: async () => ({
        candidates: [good, refusal],
        sourceText: OVER_LIMIT,
        sourceProhibited: [],
      }),
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조절안 만들기' }));
    });
    expect(screen.getByTestId('length-adjust-preview').textContent).toBe('줄인 글.');
    expect(screen.queryByRole('tab', { name: /2차/ })).toBeNull();
  });
});
