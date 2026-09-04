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
vi.mock('@adapters/di/container', () => ({ fetchRecordPromptL1 }));

import { RecordDraftAiButton, type DraftTarget } from '../RecordDraftAiButton';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const runCalls: { prompt: string; appendSystemPrompt?: string }[] = [];
let eventHandler: ((e: unknown) => void) | null = null;
/** 컴포넌트가 만든 runId — 테스트가 그 id 로 완료·오류를 흘려보낸다. */
let lastRunId = '';

function connected(): OwnAiConnection {
  return { provider: 'claude', state: 'connected', version: '2.1.258', model: '' };
}

function target(over: Partial<DraftTarget> = {}): DraftTarget {
  return {
    studentRef: 's1',
    studentAlias: '［이름1］',
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
    render(<RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/구독 AI/)).toBeTruthy();
    // 쌤핀 AI 로 대신 만들자는 말은 하지 않는다 — 초안은 폴백하지 않는다.
    expect(screen.queryByText(/쌤핀 AI 로 이어서/)).toBeNull();
  });

  it('실험실 스위치만 켜고 연결이 없으면 여전히 실행 0회다', () => {
    useAssistStore.setState({ ownAiEnabled: true });
    render(<RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />);

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
    render(<RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(screen.getByRole('button', { name: '이 학생만' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /남은 학생 모두/ })).toBeNull();
  });

  it('남은 학생이 있으면 인원수와 함께 보인다', () => {
    render(
      <RecordDraftAiButton
        areaLabel="교과 세특"
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
    render(<RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.appendSystemPrompt).toBe('[생기부 작성 규정 본문]');
  });

  it('★규정을 못 받아 오면 실행이 0회다 — 초안을 만들지 않고 안내만 한다', async () => {
    fetchRecordPromptL1.mockResolvedValue(null);
    render(<RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />);
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
      <RecordDraftAiButton areaLabel="교과 세특" target={target()} onApply={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    await startWith('이 학생만');

    expect(container.textContent).not.toContain('절대로 화면에 뜨면 안 되는');
  });
});
