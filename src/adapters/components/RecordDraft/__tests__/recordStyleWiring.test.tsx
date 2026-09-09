/**
 * @vitest-environment jsdom
 *
 * 작성 방식 → 실제 요청서 배선 (ADR-099 §8·§11).
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

describe('고른 구성이 실제 요청서에 실린다 (AC-01·AC-02)', () => {
  it('기본값이면 「작성 구성」이 안 붙고 옛 문장이 그대로다', async () => {
    connectClaude();
    panel();
    await startDraft();
    expect(runCalls[0]).not.toContain('작성 구성');
    expect(runCalls[0]).toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
  });

  it('초점·시작 방식을 고르면 그 구성이 나가고 교사 판단이 맨 뒤로 간다', async () => {
    connectClaude();
    setStyle('feedbackRevise', { opening: 'performance', grouping: 'single' });
    panel();
    await startDraft();
    const sent = runCalls[0] ?? '';
    expect(sent).toContain('작성 구성');
    expect(sent).toContain('1. [과정] 첫 수행의 특징');
    expect(sent).toContain('교사 평가는 마지막 문단입니다.');
    expect(sent).not.toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
  });

  it('추가 지시는 선생님 지시 블록으로 나가고 실명은 가려진다 (AC-06)', async () => {
    connectClaude();
    setStyle('collaborate', { instruction: '김지훈이 자료를 맡은 대목을 살려 주세요.' });
    panel();
    await startDraft();
    const sent = runCalls[0] ?? '';
    expect(sent).toContain('선생님 지시:');
    expect(sent).not.toContain('김지훈');
  });
});

describe('규정 판본 문지기 (AC-13)', () => {
  it('서버가 판본 2 를 주면 고른 구성 대신 기존형이 나간다', async () => {
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

  it('되돌린 뒤에는 화면이 그 사실을 적는다', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[옛 규정]',
      version: 2,
      stale: false,
    });
    connectClaude();
    setStyle('designCreate');
    panel();
    await startDraft();
    await finish('[평가] 어떤 학생임.');
    expect(screen.getByTestId('style-version-warning').textContent).toContain('기존 방식');
  });

  it('판에는 되돌린 뒤의 구성이 남는다 (AC-08 재현 정보)', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[옛 규정]',
      version: 2,
      stale: false,
    });
    connectClaude();
    setStyle('designCreate');
    panel();
    await startDraft();
    await finish('[평가] 어떤 학생임.\n\n[동기] 물음이 있었음.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(rec?.style?.focus).toBe('legacyInquiry');
    expect(rec?.style?.moduleIds?.[0]).toBe('teacherJudgement');
    expect(rec?.promptVersion).toBe(2);
  });

  it('판본 3 이면 고른 초점이 그대로 판에 남고 지시 본문은 저장되지 않는다', async () => {
    connectClaude();
    setStyle('collaborate', { instruction: '비밀 지시' });
    panel();
    await startDraft();
    await finish('[과정] 자료를 맡았음.\n\n[평가] 어떤 학생임.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(rec?.style?.focus).toBe('collaborate');
    expect(rec?.style?.hadInstruction).toBe(true);
    expect(JSON.stringify(rec)).not.toContain('비밀 지시');
  });
});

describe('실행 중 설정을 바꿔도 진행 중 요청은 안 바뀐다 (AC-09)', () => {
  it('시작 뒤에 설정을 바꿔도 그 실행은 시작 시점 구성으로 간다', async () => {
    connectClaude();
    setStyle('collaborate');
    panel();
    await startDraft();
    // 실행 중에 설정을 갈아치운다.
    await act(async () => {
      setStyle('designCreate');
    });
    await finish('[과정] 자료를 맡았음.\n\n[평가] 어떤 학생임.');
    const rec = useRecordAiDraftStore.getState().records[0];
    expect(runCalls[0]).toContain('공동 과제');
    expect(runCalls[0]).not.toContain('목적·조건');
    expect(rec?.style?.focus).toBe('collaborate');
  });

  it('실행 중에는 고르개가 잠긴다', async () => {
    connectClaude();
    panel();
    await startDraft();
    expect((screen.getByTestId('record-style-picker') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
