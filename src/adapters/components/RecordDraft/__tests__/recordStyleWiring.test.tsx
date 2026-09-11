/**
 * @vitest-environment jsdom
 *
 * 폴백(장면 없음) 경로 → 실제 요청서 배선 (ADR-099 §8·§11 → ADR-103 §4-5).
 *
 * ★2026-09-10(ADR-103): 작성 방식 고르개 네 축이 화면에서 사라졌다. 그래서 여기서 지키는 것이
 *   **뒤집혔다** — 예전에는 "고른 값이 정말 나가는가"였고, 지금은 **"저장돼 있던 옛 값이 절대
 *   안 나가는가"** 다. 화면에서 못 보는 값이 요청서를 가르면 선생님은 초안이 왜 달라졌는지
 *   진단할 수 없다(보이지 않는 설정 금지).
 *
 * 순수 함수 테스트만으로는 못 잡는 것을 여기서 잡는다: 화면이 고른 값이 **정말 모델에게 가는지**,
 * 규정 판본이 모자랄 때 **정말 되돌려 나가는지**, 큐가 도는 중 설정을 바꿔도 **진행 중 요청이 안 바뀌는지**.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const fetchRecordPromptL1 = vi.hoisted(() => vi.fn());
const savedSettings = vi.hoisted(() => [] as unknown[]);
vi.mock('@adapters/di/container', () => ({
  fetchRecordPromptL1,
  fetchModelCatalog: async () => OWN_AI_MODELS,
  recordAiDraftRepository: {
    getRecordAiDrafts: async () => null,
    saveRecordAiDrafts: async () => {},
  },
  settingsRepository: {
    getSettings: async () => null,
    saveSettings: async (s: unknown) => {
      savedSettings.push(s);
    },
  },
}));

import { RecordDraftAiPanel, type DraftTarget } from '../RecordDraftAiPanel';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import { useRecordAiRunStore } from '@adapters/stores/useRecordAiRunStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordFocusId,
} from '@domain/entities/RecordWritingStyle';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const runCalls: string[] = [];
let eventHandler: ((e: unknown) => void) | null = null;
let lastRunId = '';

const ROSTER = rosterFromAll([{ name: '김지훈', studentNumber: 1 }], []);
const KEY = { area: 'subject' as const, studentRef: 's1', subject: '국어' };

function target(over: Partial<DraftTarget> = {}): DraftTarget {
  return {
    studentRef: 's1',
    displayName: '김지훈',
    evidences: [
      { id: 'e1', content: '주장하는 글 초안을 냈다.', date: '2026-05-01' },
      { id: 'e2', content: '동료 의견을 받아 결론을 고쳤다.', date: '2026-05-20' },
    ],
    ...over,
  };
}

function panel(over: Partial<Parameters<typeof RecordDraftAiPanel>[0]> = {}) {
  return render(
    <RecordDraftAiPanel
      areaLabel="교과 세특"
      roster={ROSTER}
      target={target()}
      draftKey={KEY}
      area="subject"
      onApply={() => {}}
      {...over}
    />,
  );
}

function connectClaude(): void {
  const c: OwnAiConnection = {
    provider: 'claude',
    state: 'connected',
    version: '2.1.258',
    model: '',
  };
  useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
  useOwnAiStatusStore.setState({ connections: { claude: c, codex: null } });
}

async function startDraft(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '이 학생 초안 쓰기' }));
  });
}

async function finish(text: string): Promise<void> {
  await act(async () => {
    eventHandler?.({ type: 'done', runId: lastRunId, text });
  });
}

beforeEach(() => {
  fetchRecordPromptL1.mockReset();
  fetchRecordPromptL1.mockResolvedValue({
    ok: true,
    prompt: '[생기부 작성 규정 본문]',
    version: 3,
    stale: false,
  });
  runCalls.length = 0;
  savedSettings.length = 0;
  eventHandler = null;
  lastRunId = '';
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      run: async (p: { prompt: string; runId: string }) => {
        runCalls.push(p.prompt);
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
  useRecordAiDraftStore.setState({ records: [], loaded: true });
  useRecordAiRunStore.getState().reset();
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, recordWritingStyles: undefined, recordStylePresets: undefined },
  }));
});

afterEach(() => {
  cleanup();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

function setStyle(focus: RecordFocusId, over: Record<string, unknown> = {}): void {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      recordWritingStyles: {
        subject: { ...DEFAULT_RECORD_WRITING_STYLE, focus, ...over },
      },
    },
  }));
}

describe('★폴백은 기본값으로 고정된다 (ADR-103 §4-5)', () => {
  it('아무것도 저장돼 있지 않으면 옛 문장이 그대로다', async () => {
    connectClaude();
    panel();
    await startDraft();
    expect(runCalls[0]).not.toContain('작성 구성');
    expect(runCalls[0]).toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
  });

  it('★옛 작성 방식이 설정에 남아 있어도 요청서는 기본값 그대로다 (보이지 않는 설정 금지)', async () => {
    connectClaude();
    setStyle('feedbackRevise', { opening: 'performance', grouping: 'single' });
    panel();
    await startDraft();
    const sent = runCalls[0] ?? '';
    expect(sent).not.toContain('작성 구성');
    expect(sent).not.toContain('첫 수행의 특징');
    expect(sent).toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
  });

  it('★옛 추가 지시도 따라 나가지 않는다 — 지운 적 없는 값이 조용히 실리면 안 된다', async () => {
    connectClaude();
    setStyle('collaborate', { instruction: '옛날에 적어 둔 지시' });
    panel();
    await startDraft();
    expect(runCalls[0] ?? '').not.toContain('옛날에 적어 둔 지시');
  });

  it('판에도 기본 구성이 남는다', async () => {
    connectClaude();
    setStyle('designCreate', { opening: 'question' });
    panel();
    await startDraft();
    await finish('[평가] 어떤 학생임.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(rec?.style?.focus).toBe('legacyInquiry');
    expect(rec?.style?.moduleIds?.[0]).toBe('teacherJudgement');
  });
});

describe('「+ 한마디」는 그 실행에만 붙는다 (AC-06)', () => {
  it('적은 한마디는 선생님 지시 블록으로 나가고 실명은 가려진다', async () => {
    connectClaude();
    panel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ 한마디 덧붙이기' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('이 초안에 덧붙일 한마디'), {
        target: { value: '김지훈이 자료를 맡은 대목을 살려 주세요.' },
      });
    });
    await startDraft();
    const sent = runCalls[0] ?? '';
    expect(sent).toContain('선생님 지시:');
    expect(sent).not.toContain('김지훈');
  });

  it('★한마디 본문은 판에 저장되지 않는다 — 판 파일은 드라이브로 동기화된다', async () => {
    connectClaude();
    panel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ 한마디 덧붙이기' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('이 초안에 덧붙일 한마디'), {
        target: { value: '비밀 지시' },
      });
    });
    await startDraft();
    await finish('[평가] 어떤 학생임.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(rec?.style?.hadInstruction).toBe(true);
    expect(JSON.stringify(rec)).not.toContain('비밀 지시');
  });
});

describe('규정 판본 문지기 (AC-13)', () => {
  it('서버가 판본 2 를 주어도 폴백이라 나가는 글은 같다', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[옛 규정]',
      version: 2,
      stale: false,
    });
    connectClaude();
    setStyle('designCreate', { opening: 'question' });
    panel();
    await startDraft();
    const sent = runCalls[0] ?? '';
    expect(sent).not.toContain('작성 구성');
    expect(sent).toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
  });

  it('판에 그 판본이 남는다 (AC-08 재현 정보)', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[옛 규정]',
      version: 2,
      stale: false,
    });
    connectClaude();
    panel();
    await startDraft();
    await finish('[평가] 어떤 학생임.\n\n[동기] 물음이 있었음.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(rec?.style?.focus).toBe('legacyInquiry');
    expect(rec?.promptVersion).toBe(2);
  });
});

describe('화면이 지금 나갈 차례를 말한다 (보이지 않는 설정 금지)', () => {
  it('장면이 없으면 폴백이 강제하는 순서를 그대로 적는다', () => {
    connectClaude();
    panel();
    expect(screen.getByTestId('composition-summary').textContent).toContain(
      '교사 평가 → 동기·질문 → 과정 → 결과',
    );
  });
});

describe('요청서에 함께 실리는 것을 말한다 — 메모가 나가는지 선생님이 알 수 있게', () => {
  it('메모가 하나도 없으면 줄을 그리지 않는다', () => {
    connectClaude();
    panel();
    expect(screen.queryByTestId('pack-contents')).toBeNull();
  });

  it('★근거 메모 수와, 금지어(학원 등) 때문에 조용히 빠질 메모 수를 미리 적는다', () => {
    connectClaude();
    panel({
      target: target({
        evidences: [
          {
            id: 'e1',
            content: '주장하는 글 초안을 냈다.',
            date: '2026-05-01',
            note: '질문이 출발점이었다',
          },
          {
            id: 'e2',
            content: '동료 의견을 받아 결론을 고쳤다.',
            date: '2026-05-20',
            note: '학원에서 배운 것',
          },
        ],
      }),
    });
    const line = screen.getByTestId('pack-contents').textContent ?? '';
    expect(line).toContain('근거 2건');
    expect(line).toContain('근거 메모 2');
    expect(line).toContain('장면 메모 0');
    expect(line).toContain('금지어가 들어 빠지는 메모 1');
  });
});
