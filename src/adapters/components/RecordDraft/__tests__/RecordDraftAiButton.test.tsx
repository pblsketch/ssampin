/**
 * @vitest-environment jsdom
 *
 * [AI로 초안 쓰기] — 오너 결정 D2·D4·D8 을 고정한다.
 *
 * ★가장 중요한 것: **구독이 연결돼 있지 않으면 요청을 보내지 않는다.** 생기부 초안은
 *   쌤핀 AI(Solar)로 만들지 않는다 — 폴백이 없다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';

/**
 * 1층 프롬프트는 **실행 시점에 서버에서** 받아 온다(D7). 테스트에서는 그 왕복을 흉내 낸다.
 * `null` 을 주면 "규정을 못 받아 온" 상황이 된다 — 그때 초안을 만들지 않는지가 핵심이다.
 */
const fetchRecordPromptL1 = vi.hoisted(() => vi.fn());
// 컨테이너는 이 화면이 쓰는 것 **전부**를 흉내 내야 한다 — 하나라도 빠지면 훅이 터진다.
vi.mock('@adapters/di/container', () => ({
  fetchRecordPromptL1,
  fetchModelCatalog: async () => OWN_AI_MODELS,
}));

import { RecordDraftAiButton, restoreAliases, type DraftTarget } from '../RecordDraftAiButton';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const runCalls: { prompt: string; appendSystemPrompt?: string }[] = [];
let eventHandler: ((e: unknown) => void) | null = null;
/** 컴포넌트가 만든 runId — 테스트가 그 id 로 완료·오류를 흘려보낸다. */
let lastRunId = '';

function connected(): OwnAiConnection {
  return { provider: 'claude', state: 'connected', version: '2.1.258', model: '' };
}

/** 이 반 명단 — 근거 본문의 다른 학생 이름(박서연)도 이걸로 가려진다. */
const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 1 },
    { name: '박서연', studentNumber: 2 },
  ],
  [],
);

function target(over: Partial<DraftTarget> = {}): DraftTarget {
  return {
    studentRef: 's1',
    displayName: '김지훈',
    evidences: [{ id: 'e1', content: '모둠 활동에서 자료를 정리했다.' }],
    ...over,
  };
}

beforeEach(() => {
  fetchRecordPromptL1.mockReset();
  fetchRecordPromptL1.mockResolvedValue('[생기부 작성 규정 본문]');
  runCalls.length = 0;
  eventHandler = null;
  lastRunId = '';
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      run: async (p: { prompt: string; runId: string; appendSystemPrompt?: string }) => {
        runCalls.push({
          prompt: p.prompt,
          ...(p.appendSystemPrompt === undefined
            ? {}
            : { appendSystemPrompt: p.appendSystemPrompt }),
        });
        lastRunId = p.runId;
        return { ok: true };
      },
      onEvent: (fn: (e: unknown) => void) => {
        eventHandler = fn;
        return () => {
          eventHandler = null;
        };
      },
    },
  };
  useAssistStore.setState({ ownAiEnabled: false, provider: 'ssampin' });
  useOwnAiStatusStore.setState({ connections: { claude: null, codex: null } });
});

afterEach(() => {
  cleanup();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

/**
 * 생성 시작 버튼을 누른다.
 *
 * ★`fireEvent.click` 만으로는 부족하다 — 이제 눌린 뒤 **프롬프트를 받아 오는 왕복**이
 * 한 번 끼어들기 때문에, 그 약속이 풀릴 때까지 기다려야 run 이 불린다.
 */
async function startWith(name: RegExp | string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('★구독이 없으면 요청을 보내지 않는다 (D2)', () => {
  it('연결 전에는 눌러도 안내만 하고 실행이 0회다', () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/구독 AI/)).toBeTruthy();
    // 쌤핀 AI 로 대신 만들자는 말은 하지 않는다 — 초안은 폴백하지 않는다.
    expect(screen.queryByText(/쌤핀 AI 로 이어서/)).toBeNull();
  });

  it('실험실 스위치만 켜고 연결이 없으면 여전히 실행 0회다', () => {
    useAssistStore.setState({ ownAiEnabled: true });
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    expect(runCalls).toHaveLength(0);
  });
});

describe('연결되면 단위를 고를 수 있다 (D8)', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  it('남은 학생이 없으면 "이 학생만"만 보인다', () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(screen.getByRole('button', { name: '이 학생만' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /남은 학생 모두/ })).toBeNull();
  });

  it('남은 학생이 있으면 인원수와 함께 보인다', () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        remaining={[target({ studentRef: 's2', displayName: '박서연' })]}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    expect(screen.getByRole('button', { name: /남은 학생 모두 \(2명\)/ })).toBeTruthy();
  });
});

describe('★보내는 꾸러미에 실명이 없고 기재 금지가 빠진다 (ADR-072)', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  it('실명 대신 별칭이 나가고, 금지 항목이 든 근거는 빠진다', async () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target({
          evidences: [
            { id: 'e1', content: '교내 수학경시대회에서 금상을 받았다.' },
            { id: 'e2', content: '모둠에서 자료를 정리했다.' },
          ],
        })}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(runCalls).toHaveLength(1);
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('［이름1］');
    expect(prompt).not.toContain('김지훈');
    expect(prompt).not.toContain('경시대회');
    expect(prompt).toContain('모둠에서 자료를 정리했다');
  });
});

describe('결과는 미리보기다 — [반영] 을 눌러야 저장된다 (D4)', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  /** 컴포넌트가 만든 runId 를 모르므로, run 호출을 가로채 그 id 로 완료를 흘려보낸다. */
  async function finishWith(text: string): Promise<void> {
    await act(async () => {
      eventHandler?.({ type: 'done', runId: lastRunId, text });
    });
  }

  it('★답이 와도 [반영] 전에는 저장이 0회다', async () => {
    const applied: { ref: string; text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={(ref, text) => {
          applied.push({ ref, text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('탐구 흐름을 이어 쓴 초안.');

    expect(screen.getByText(/미리보기/)).toBeTruthy();
    expect(applied).toHaveLength(0);
  });

  it('[반영] 을 누르면 그 학생 자리에 저장된다', async () => {
    const applied: { ref: string; text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={(ref, text) => {
          applied.push({ ref, text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('탐구 흐름을 이어 쓴 초안.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    expect(applied).toEqual([{ ref: 's1', text: '탐구 흐름을 이어 쓴 초안.' }]);
  });

  it('기존 초안이 있으면 바꾸기·뒤에 붙이기를 고를 수 있다', async () => {
    const applied: { ref: string; text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target({ existingText: '먼저 쓴 문장.' })}
        onApply={(ref, text) => {
          applied.push({ ref, text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('새 문장.');

    expect(screen.getByRole('button', { name: '바꾸기' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '뒤에 붙이기' }));
    });
    expect(applied[0]?.text).toBe('먼저 쓴 문장.\n새 문장.');
  });

  it('★한도·오류로 멈추면 [이어 하기] 로 남은 학생부터 다시 한다 (D8)', async () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        remaining={[target({ studentRef: 's2', displayName: '박서연' })]}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith(/남은 학생 모두/);

    await act(async () => {
      eventHandler?.({ type: 'error', runId: lastRunId, kind: 'usage-limit' });
    });

    expect(screen.getByText(/한도/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });
});

describe('★생기부 규정(1층 프롬프트)은 실행할 때 서버에서 받는다 (D7)', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  it('받아 온 규정을 CLI 에 함께 보낸다 — 규정 없이 쓴 초안은 만들지 않는다', async () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.appendSystemPrompt).toBe('[생기부 작성 규정 본문]');
  });

  it('★규정을 못 받아 오면 실행이 0회다 — 초안을 만들지 않고 안내만 한다', async () => {
    fetchRecordPromptL1.mockResolvedValue(null);
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/규정을 서버에서 받아오지 못해/)).toBeTruthy();
  });

  it('규정을 못 받아도 학생을 잃지 않는다 — [이어 하기] 로 전원 다시 시도한다', async () => {
    fetchRecordPromptL1.mockResolvedValue(null);
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        remaining={[target({ studentRef: 's2', displayName: '박서연' })]}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith(/남은 학생 모두/);

    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });

  it('★규정 본문을 화면에 보여 주지 않는다 — 받아만 쓰고 흘리지 않는다', async () => {
    fetchRecordPromptL1.mockResolvedValue('절대로 화면에 뜨면 안 되는 규정 본문');
    const { container } = render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(container.textContent).not.toContain('절대로 화면에 뜨면 안 되는');
  });
});

describe('★별칭을 실제 이름으로 되돌린 뒤 저장한다', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  async function finishWith(text: string): Promise<void> {
    await act(async () => {
      eventHandler?.({ type: 'done', runId: lastRunId, text });
    });
  }

  it('되돌리기 자체 — 나온 만큼 전부 바꾼다', () => {
    const m = [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' as const }];
    expect(restoreAliases('［이름1］은 ［이름1］답게 썼다.', m)).toBe('김지훈은 김지훈답게 썼다.');
  });

  it('대응이 없으면 글을 건드리지 않는다', () => {
    expect(restoreAliases('주어 없이 쓴 문장.', [])).toBe('주어 없이 쓴 문장.');
  });

  it('★근거에 적힌 다른 학생 이름도 나갈 때 가려지고 돌아올 때 되돌아온다', async () => {
    const applied: { text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target({
          evidences: [{ id: 'e1', content: '박서연과 함께 모둠 발표를 준비했다.' }],
        })}
        onApply={(_ref, text) => {
          applied.push({ text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    // 나가는 꾸러미: 박서연이 없다
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).not.toContain('박서연');
    expect(prompt).not.toContain('김지훈');
    expect(prompt).toContain('［이름2］');

    // 모델이 별칭 그대로 써서 돌려주면 → 저장 전에 둘 다 되돌아온다
    await finishWith('［이름1］은 ［이름2］와 협력했다.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(applied[0]?.text).toBe('김지훈은 박서연와 협력했다.');
  });

  it('★초안에 ［이름1］ 이 남지 않는다 — 저장되는 글에서 확인', async () => {
    const applied: { ref: string; text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={(ref, text) => {
          applied.push({ ref, text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('［이름1］은 탐구 흐름을 이어 썼다.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    expect(applied[0]?.text).toBe('김지훈은 탐구 흐름을 이어 썼다.');
    expect(applied[0]?.text).not.toContain('［이름');
  });

  it('미리보기에도 되돌린 글을 보여 준다 — 보이는 것과 저장되는 것이 같아야 한다', async () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('［이름1］은 탐구 흐름을 이어 썼다.');

    expect(screen.getByText(/김지훈은 탐구 흐름을 이어 썼다/)).toBeTruthy();
  });

  it('뒤에 붙이기에도 되돌린 글이 붙는다', async () => {
    const applied: { ref: string; text: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target({ existingText: '먼저 쓴 문장.' })}
        onApply={(ref, text) => {
          applied.push({ ref, text });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await finishWith('［이름1］은 이어서 썼다.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '뒤에 붙이기' }));
    });

    expect(applied[0]?.text).toBe('먼저 쓴 문장.' + '\n' + '김지훈은 이어서 썼다.');
  });
});

describe('★"남은 학생 모두" 중에는 어느 칸에 저장되는지 못 박는다', () => {
  beforeEach(() => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
  });

  async function finishWith(text: string): Promise<void> {
    await act(async () => {
      eventHandler?.({ type: 'done', runId: lastRunId, text });
    });
  }

  /**
   * 누른 행은 김지훈인데 두 번째 차례는 박서연이다. 그때 미리보기는 **김지훈 칸 아래**에
   * 뜬다 — 이름만 작게 적혀 있으면 자기 학생 것으로 알고 [반영]을 누른다.
   */
  it('다른 학생 차례면 "○○ 학생 칸에 저장됩니다"를 보여 준다', async () => {
    const applied: { ref: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        remaining={[target({ studentRef: 's2', displayName: '박서연' })]}
        onApply={(ref) => {
          applied.push({ ref });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith(/남은 학생 모두/);

    // 첫 차례(김지훈)는 안내를 붙이지 않는다 — 누른 행과 같은 학생이다.
    await finishWith('김지훈 초안.');
    expect(screen.queryByText(/칸에 저장됩니다/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');

    expect(screen.getByText('박서연 학생 칸에 저장됩니다.')).toBeTruthy();
  });

  it('그렇게 저장하면 실제로도 그 학생 칸으로 간다', async () => {
    const applied: { ref: string }[] = [];
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        remaining={[target({ studentRef: 's2', displayName: '박서연' })]}
        onApply={(ref) => {
          applied.push({ ref });
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith(/남은 학생 모두/);
    await finishWith('김지훈 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    expect(applied.map((a) => a.ref)).toEqual(['s1', 's2']);
  });
});

describe('★어느 AI·모델로 쓰는지 보이고 고를 수 있다 (오너 지적 2026-09-05)', () => {
  function bothConnected() {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({
      connections: {
        claude: connected(),
        codex: { provider: 'codex', state: 'connected', version: '0.144.4', model: '' },
      },
    });
  }

  it('둘 다 연결되면 공급자를 고를 수 있다', () => {
    bothConnected();
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Codex' })).toBeTruthy();
  });

  it('고르면 그 공급자로 실행한다 — 패널을 열지 않아도 된다', async () => {
    bothConnected();
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Codex' }));
    await startWith('이 학생만');

    expect(runCalls).toHaveLength(1);
    expect(useAssistStore.getState().provider).toBe('codex');
  });

  it('하나만 연결됐으면 고르기 대신 이름만 보여 준다', () => {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    // 버튼이 아니라 표시만 — 고를 게 없으므로.
    expect(screen.queryByRole('button', { name: 'Claude Code' })).toBeNull();
    expect(screen.getByText('Claude Code')).toBeTruthy();
  });

  it('모델을 고를 수 있다', () => {
    bothConnected();
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    const select = screen.getByRole('combobox', { name: '초안에 쓸 모델 고르기' });
    fireEvent.change(select, { target: { value: 'opus' } });

    expect(useAssistStore.getState().ownAiModels.claude).toBe('opus');
  });

  it('★미리보기에 어느 AI 가 썼는지 남는다 — 결과를 보고 무엇을 바꿀지 알 수 있게', async () => {
    bothConnected();
    useAssistStore.setState({ ownAiModels: { claude: 'opus', codex: '' } });
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
        roster={ROSTER}
        target={target()}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');
    await act(async () => {
      eventHandler?.({ type: 'done', runId: lastRunId, text: '탐구 흐름을 이어 쓴 초안.' });
    });

    // 표시가 여러 <span> 으로 쪼개져 있어 문자열 매칭이 안 된다 — 머리줄 전체로 본다.
    expect(screen.getByText(/미리보기/).textContent ?? '').toContain('Claude Code opus');
  });
});
