/**
 * @vitest-environment jsdom
 *
 * [AI로 초안 쓰기] — 오너 결정 D2·D4·D8 을 고정한다.
 *
 * ★가장 중요한 것: **구독이 연결돼 있지 않으면 요청을 보내지 않는다.** 생기부 초안은
 *   쌤핀 AI(Solar)로 만들지 않는다 — 폴백이 없다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';

import { RecordDraftAiButton, type DraftTarget } from '../RecordDraftAiButton';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const runCalls: { prompt: string }[] = [];
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
  runCalls.length = 0;
  eventHandler = null;
  lastRunId = '';
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      run: async (p: { prompt: string; runId: string }) => {
        runCalls.push({ prompt: p.prompt });
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

  it('실명 대신 별칭이 나가고, 금지 항목이 든 근거는 빠진다', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '이 학생만' }));

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
    fireEvent.click(screen.getByRole('button', { name: '이 학생만' }));
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
    fireEvent.click(screen.getByRole('button', { name: '이 학생만' }));
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
    fireEvent.click(screen.getByRole('button', { name: '이 학생만' }));
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
    fireEvent.click(screen.getByRole('button', { name: /남은 학생 모두/ }));

    await act(async () => {
      eventHandler?.({ type: 'error', runId: lastRunId, kind: 'usage-limit' });
    });

    expect(screen.getByText(/한도/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });
});
