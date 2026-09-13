/**
 * @vitest-environment jsdom
 *
 * 오른쪽 패널 「AI 초안」 — 오너 결정 D2·D4·D8 + ADR-085(판 보존·버리기=삭제·되돌리기)를 고정한다.
 *
 * ★가장 중요한 것: **구독이 연결돼 있지 않으면 요청을 보내지 않는다.** 생기부 초안은
 *   쌤핀 AI(Solar)로 만들지 않는다 — 폴백이 없다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act, within } from '@testing-library/react';

const fetchRecordPromptL1 = vi.hoisted(() => vi.fn());
// 컨테이너는 이 화면이 쓰는 것 **전부**를 흉내 내야 한다 — 하나라도 빠지면 훅이 터진다.
vi.mock('@adapters/di/container', () => ({
  fetchRecordPromptL1,
  fetchModelCatalog: async () => OWN_AI_MODELS,
  recordAiDraftRepository: {
    getRecordAiDrafts: async () => null,
    saveRecordAiDrafts: async () => {},
  },
}));

import { RecordDraftAiPanel, restoreAliases, type DraftTarget } from '../RecordDraftAiPanel';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import { activeStudentRefsOf, useRecordAiRunStore } from '@adapters/stores/useRecordAiRunStore';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';
import type { RoleMark } from '@domain/rules/narrativeParagraphs';

const runCalls: { prompt: string; appendSystemPrompt?: string }[] = [];
let eventHandler: ((e: unknown) => void) | null = null;
let lastRunId = '';

function connected(): OwnAiConnection {
  return { provider: 'claude', state: 'connected', version: '2.1.258', model: '' };
}

const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 1 },
    { name: '박서연', studentNumber: 2 },
  ],
  [],
);

const KEY = { area: 'subject' as const, studentRef: 's1', subject: '수학' };

function target(over: Partial<DraftTarget> = {}): DraftTarget {
  return {
    studentRef: 's1',
    displayName: '김지훈',
    evidences: [{ id: 'e1', content: '모둠 활동에서 자료를 정리했다.' }],
    ...over,
  };
}

type Applied = { ref: string; text: string; marks: readonly RoleMark[] | null };

function panel(
  over: Partial<Parameters<typeof RecordDraftAiPanel>[0]> = {},
  applied: Applied[] = [],
) {
  return render(
    <RecordDraftAiPanel
      areaLabel="교과 세특"
      roster={ROSTER}
      target={target()}
      draftKey={KEY}
      onApply={(ref, text, marks) => {
        applied.push({ ref, text, marks });
      }}
      {...over}
    />,
  );
}

function connectClaude(): void {
  useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
  useOwnAiStatusStore.setState({ connections: { claude: connected(), codex: null } });
}

async function startWith(name: RegExp | string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

async function finishWith(text: string): Promise<void> {
  await act(async () => {
    eventHandler?.({ type: 'done', runId: lastRunId, text });
  });
}

beforeEach(() => {
  fetchRecordPromptL1.mockReset();
  fetchRecordPromptL1.mockResolvedValue({
    ok: true,
    prompt: '[생기부 작성 규정 본문]',
    version: 1,
    stale: false,
  });
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
  useRecordAiDraftStore.setState({ records: [], loaded: true });
  // 실행 단계는 스토어에 있다(ADR-093) — 테스트 사이에 큐가 새지 않게 비운다.
  useRecordAiRunStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe('★구독이 없으면 요청을 보내지 않는다 (D2)', () => {
  it('연결 전에는 눌러도 안내만 하고 실행이 0회다', () => {
    panel();
    const btn = screen.getByRole('button', { name: '이 학생 초안 쓰기' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // 무엇을 눌러야 하는지는 보이되, 연결 전엔 잠겨 있다
    fireEvent.click(btn);
    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/구독 AI/)).toBeTruthy();
    expect(screen.queryByText(/쌤핀 AI 로 이어서/)).toBeNull();
  });

  it('실험실 스위치만 켜고 연결이 없으면 여전히 실행 0회다', () => {
    useAssistStore.setState({ ownAiEnabled: true });
    panel();
    fireEvent.click(screen.getByRole('button', { name: '이 학생 초안 쓰기' }));
    expect(runCalls).toHaveLength(0);
  });
});

describe('연결되면 단위를 고를 수 있다 (D8)', () => {
  beforeEach(connectClaude);

  it('남은 학생이 없으면 "이 학생 초안 쓰기"만 보인다', () => {
    panel();
    expect(screen.getByRole('button', { name: '이 학생 초안 쓰기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /남은 학생 모두/ })).toBeNull();
  });

  it('남은 학생이 있으면 인원수와 함께 보인다', () => {
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    expect(screen.getByRole('button', { name: /남은 학생 모두 초안 쓰기 \(2명\)/ })).toBeTruthy();
  });
});

describe('테라·루나 구체적인 서술 기본 지시', () => {
  it.each(['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'])(
    '%s 선택이 실제 전송 요청서에 반영된다',
    async (model) => {
      useAssistStore.setState({
        ownAiEnabled: true,
        provider: 'codex',
        ownAiModels: { claude: '', codex: model },
      });
      useOwnAiStatusStore.setState({
        connections: {
          claude: null,
          codex: { provider: 'codex', state: 'connected', model, version: 'test' },
        },
      });
      panel({
        target: target({
          evidences: [
            {
              id: 'rich',
              content: '자료에 쓰인 처리 조건을 확인해 근거를 바꾸고 판정함. '.repeat(30),
            },
          ],
        }),
      });
      await startWith('이 학생 초안 쓰기');
      expect(runCalls).toHaveLength(1);
      expect(runCalls[0]?.prompt.includes('구체적으로 쓰기:')).toBe(model !== 'gpt-5.6-sol');
      await finishWith('[평가] 자료의 조건을 확인하는 학생임.');
      useAssistStore.setState({ ownAiModels: { claude: '', codex: '' } });
    },
  );
});

describe('★서사(장면)로 쓰기 — 관문과 큐 (ADR-103)', () => {
  beforeEach(() => {
    connectClaude();
    // ★서버 규정이 판본 3 이어야 서사 구성이 나간다. 기본 모의값은 판본 1 이라 문지기가 막는다.
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[생기부 작성 규정 본문]',
      version: 3,
      stale: false,
    });
  });

  const EV = { id: 'e1', content: '쿠폰 질문을 했다' };

  const SCENES = [
    {
      id: 'sc-eval',
      role: 'evaluation' as const,
      moduleId: 'teacherJudgement' as const,
      evidenceIds: [],
    },
    {
      id: 'sc-motive',
      role: 'motive' as const,
      moduleId: 'legacyMotive' as const,
      evidenceIds: ['e1'],
    },
  ];

  const threadWithScenes = (over: Record<string, unknown> = {}) => ({
    id: 'thr-1',
    studentRef: 's1',
    title: '할인 문구와 선택',
    keywords: [],
    status: 'open' as const,
    scenes: SCENES,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

  /** 장면이 가리키는 근거를 화면 재료(`target`)와 주제 재료 양쪽에 같은 id 로 둔다. */
  const narrativePanel = (over: Record<string, unknown> = {}) =>
    panel({
      area: 'subject',
      target: target({ evidences: [EV] }),
      threads: [threadWithScenes()],
      studentEvidences: [{ ...EV, threadId: 'thr-1' }],
      ...over,
    });

  it('장면이 있는 주제가 하나면 그 서사로 요청서를 만든다', async () => {
    narrativePanel();
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('작성 구성');
    expect(prompt).toContain('1. 쿠폰 질문을 했다'); // 장면 경로는 번호를 붙인다
    expect(prompt).toContain('근거: 1');
  });

  it('지도 차례를 어긴 답은 판으로 저장하지 않고 사유를 보여 준다', async () => {
    narrativePanel();
    await startWith('이 학생 초안 쓰기');
    await finishWith('[장면 2] [동기] 질문함.\n\n[장면 1] [평가] 근거를 확인하는 학생임.');
    expect(useRecordAiDraftStore.getState().records).toHaveLength(0);
    expect(screen.getByText(/장면 순서나 장면 표식을 지키지 않아/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '반영' })).toBeNull();
  });

  it('지도 순서와 번호는 보관하고 생성 본문의 가운데 점만 쉼표로 바꾼다', async () => {
    narrativePanel();
    await startWith('이 학생 초안 쓰기');
    await finishWith(
      '[장면 1] [평가] 조건을 확인하는 학생임.\n\n[장면 2] [동기] PLA·PHA·PBAT의 분해 조건을 질문함.',
    );
    const saved = useRecordAiDraftStore.getState().records[0];
    expect(saved?.paragraphs.map((p) => p.sceneIndex)).toEqual([1, 2]);
    expect(saved?.paragraphs[1]?.text).toContain('PLA, PHA, PBAT');
    expect(saved?.paragraphs[1]?.text).not.toContain('[장면');
    expect(screen.getByRole('button', { name: '반영' })).toBeTruthy();
  });

  it('★규정 판본이 모자라면 서사를 아예 안 보내고 화면이 말한다', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[생기부 작성 규정 본문]',
      version: 2,
      stale: false,
    });
    narrativePanel();
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).not.toContain('작성 구성');
    expect(prompt).toContain('- 쿠폰 질문을 했다'); // 예전 줄 형식으로 돌아간다
    expect(screen.getByText(/기존 방식으로 만들어집니다/)).toBeTruthy();
  });

  it('장면이 없으면 요청서가 예전 그대로다', async () => {
    narrativePanel({ threads: [threadWithScenes({ scenes: undefined })] });
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).not.toContain('작성 구성');
    expect(prompt).toContain('- 쿠폰 질문을 했다');
  });

  it('장면 메모가 구성 줄 아래에 실린다', async () => {
    narrativePanel({
      threads: [
        threadWithScenes({
          scenes: [SCENES[0], { ...SCENES[1], note: '질문이 출발점이었다' }],
        }),
      ],
    });
    await startWith('이 학생 초안 쓰기');
    expect(runCalls[0]?.prompt ?? '').toContain('선생님이 읽은 것: 질문이 출발점이었다');
  });

  it('★큐의 다른 학생에게는 이 학생의 서사가 가지 않는다', async () => {
    narrativePanel({
      threads: [
        threadWithScenes({
          scenes: [SCENES[0], { ...SCENES[1], note: '오직 이 학생의 메모' }],
        }),
      ],
      remaining: [target({ studentRef: 's2', displayName: '박서연' })],
    });
    await startWith(/남은 학생 모두/);
    expect(runCalls[0]?.prompt ?? '').toContain('오직 이 학생의 메모');
    // 다음 학생으로 넘어가도 그 메모가 따라가지 않는다.
    await finishWith('[장면 1] [평가] 성실한 학생임. ');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    const second = runCalls[1]?.prompt ?? '';
    expect(second.length).toBeGreaterThan(0);
    expect(second).not.toContain('오직 이 학생의 메모');
    expect(second).not.toContain('작성 구성');
  });
});
describe('★보내는 꾸러미에 실명이 없고 기재 금지가 빠진다 (ADR-072)', () => {
  beforeEach(connectClaude);

  it('실명 대신 별칭이 나가고, 금지 항목이 든 근거는 빠진다', async () => {
    panel({
      target: target({
        evidences: [
          { id: 'e1', content: '교내 수학경시대회에서 금상을 받았다.' },
          { id: 'e2', content: '모둠에서 자료를 정리했다.' },
        ],
      }),
    });
    await startWith('이 학생 초안 쓰기');

    expect(runCalls).toHaveLength(1);
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('［이름1］');
    expect(prompt).not.toContain('김지훈');
    expect(prompt).not.toContain('경시대회');
    expect(prompt).toContain('모둠에서 자료를 정리했다');
  });

  it('주제를 고르면 그 주제의 근거만 나간다', async () => {
    panel({
      threads: [
        {
          id: 'thr-1',
          studentRef: 's1',
          title: '할인 문구와 선택',
          keywords: [],
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      studentEvidences: [
        { id: 'e1', content: '주제에 묶인 근거', threadId: 'thr-1' },
        { id: 'e2', content: '묶이지 않은 근거' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택' }));
    await startWith('이 학생 초안 쓰기');

    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('주제에 묶인 근거');
    expect(prompt).not.toContain('묶이지 않은 근거');
    expect(prompt).toContain('주제:');
  });

  it('주제에 적어 둔 키워드·역량·다음 메모까지 함께 나간다 (P0)', async () => {
    panel({
      threads: [
        {
          id: 'thr-1',
          studentRef: 's1',
          title: '할인 문구와 선택',
          keywords: ['기회비용'],
          competencyKeywords: ['경제 현상에 대한 자료 해석력'],
          nextNotes: '광고 문구 규제를 2학기에 이어 볼 것',
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      studentEvidences: [{ id: 'e1', content: '주제에 묶인 근거', threadId: 'thr-1' }],
    });
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택' }));
    await startWith('이 학생 초안 쓰기');

    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('주제 키워드: 기회비용');
    expect(prompt).toContain('선생님이 본 역량: 경제 현상에 대한 자료 해석력');
    expect(prompt).toContain('다음 탐구 메모: 광고 문구 규제를 2학기에 이어 볼 것');
  });
});

describe('결과는 미리보기다 — [반영] 을 눌러야 초안 칸에 들어간다 (D4)', () => {
  beforeEach(connectClaude);

  it('★답이 와도 [반영] 전에는 저장이 0회다 — 판으로만 남는다', async () => {
    const applied: Applied[] = [];
    panel({}, applied);
    await startWith('이 학생 초안 쓰기');
    await finishWith('탐구 흐름을 이어 쓴 초안.');

    expect(screen.getByText(/미리보기/)).toBeTruthy();
    expect(applied).toHaveLength(0);
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);
  });

  it('[반영] 을 누르면 그 학생 자리에 저장되고 판에 반영 표시가 남는다', async () => {
    const applied: Applied[] = [];
    panel({}, applied);
    await startWith('이 학생 초안 쓰기');
    await finishWith('탐구 흐름을 이어 쓴 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    expect(applied.map((a) => [a.ref, a.text])).toEqual([['s1', '탐구 흐름을 이어 쓴 초안.']]);
    expect(useRecordAiDraftStore.getState().records[0]?.appliedAt).toBeTypeOf('number');
  });

  it('기존 초안이 있으면 바꾸기·뒤에 붙이기를 고를 수 있다', async () => {
    const applied: Applied[] = [];
    panel({ target: target({ existingText: '먼저 쓴 문장.' }) }, applied);
    await startWith('이 학생 초안 쓰기');
    await finishWith('새 문장.');

    expect(screen.getByRole('button', { name: '바꾸기' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '뒤에 붙이기' }));
    });
    // ★생기부는 한 덩어리 글이다 — 뒤에 붙일 때도 빈 줄이 아니라 공백 하나로 잇는다.
    expect(applied[0]?.text).toBe('먼저 쓴 문장. 새 문장.');
    expect(applied[0]?.text).not.toContain('\n');
  });

  it('★[버리기]는 삭제다 — 그 판이 목록에서 사라진다', async () => {
    panel();
    await startWith('이 학생 초안 쓰기');
    await finishWith('버릴 초안.');
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    });
    expect(useRecordAiDraftStore.getState().records).toHaveLength(0);
    expect(screen.queryByText(/미리보기/)).toBeNull();
  });

  it('★한도·오류로 멈추면 [이어 하기] 로 남은 학생부터 다시 한다 (D8)', async () => {
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);
    await act(async () => {
      eventHandler?.({ type: 'error', runId: lastRunId, kind: 'usage-limit' });
    });

    expect(screen.getByText(/한도/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });
});

describe('판(버전)을 남기고 비교한다 (ADR-085)', () => {
  beforeEach(connectClaude);

  it('두 번 만들면 v1·v2 탭이 생기고 최신이 기본이다', async () => {
    panel();
    await startWith('이 학생 초안 쓰기');
    await finishWith('첫 판.');
    await startWith('이 학생 초안 쓰기');
    await finishWith('둘째 판.');

    const tabs = within(screen.getByRole('tablist', { name: 'AI 초안 판' }));
    expect(tabs.getAllByRole('tab')).toHaveLength(2);
    expect(tabs.getByRole('tab', { name: 'v2' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('둘째 판.')).toBeTruthy();

    fireEvent.click(tabs.getByRole('tab', { name: 'v1' }));
    expect(screen.getByText('첫 판.')).toBeTruthy();
  });

  it('[내 글과 비교]는 내 글과 고른 판을 나란히 놓는다', async () => {
    panel({ target: target({ existingText: '내가 쓴 문단.' }) });
    await startWith('이 학생 초안 쓰기');
    await finishWith('AI 가 쓴 문단.');
    fireEvent.click(screen.getByRole('button', { name: '내 글과 비교' }));

    const grid = screen.getByLabelText('내 글과 비교');
    expect(within(grid).getByText('내가 쓴 문단.')).toBeTruthy();
    expect(within(grid).getByText('AI 가 쓴 문단.')).toBeTruthy();
  });

  it('★[바꾸기] 뒤 30초 안에 [되돌리기]를 누르면 이전 글이 돌아온다 — 30초가 지나면 사라진다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const applied: Applied[] = [];
    panel({ target: target({ existingText: '이전 글.' }) }, applied);
    await startWith('이 학생 초안 쓰기');
    await finishWith('새 글.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    });
    expect(applied.at(-1)?.text).toBe('새 글.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    });
    expect(applied.at(-1)?.text).toBe('이전 글.');
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();

    // 다시 바꾸고 30초를 흘려보내면 되돌리기가 사라진다.
    await startWith('이 학생 초안 쓰기');
    await finishWith('또 새 글.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
  });
});

describe('★생기부 규정(1층 프롬프트)은 실행할 때 서버에서 받는다 (D7)', () => {
  beforeEach(connectClaude);

  it('받아 온 규정을 CLI 에 함께 보낸다', async () => {
    panel();
    await startWith('이 학생 초안 쓰기');
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.appendSystemPrompt).toBe('[생기부 작성 규정 본문]');
  });

  it('★규정을 못 받아 오면 실행이 0회다 — 초안을 만들지 않고 안내만 한다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'unavailable' });
    panel();
    await startWith('이 학생 초안 쓰기');
    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/규정을 서버에서 받아오지 못해/)).toBeTruthy();
  });

  it('규정을 못 받아도 학생을 잃지 않는다 — [이어 하기] 로 전원 다시 시도한다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'unavailable' });
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);
    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });

  it('★규정 본문을 화면에 보여 주지 않는다', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '절대로 화면에 뜨면 안 되는 규정 본문',
      version: 1,
      stale: false,
    });
    const { container } = panel();
    await startWith('이 학생 초안 쓰기');
    expect(container.textContent).not.toContain('절대로 화면에 뜨면 안 되는');
  });

  // ── 배급 한도(ADR-089) ────────────────────────────────────────────────
  //
  // ★분당·일간 안내가 달라야 한다. "인터넷을 확인하라"고 말하면 선생님이 인터넷을 의심해
  //   계속 다시 눌러 요청이 더 몰린다.

  it('분당 한도에 걸리면 "1분 뒤" 로 안내한다 — 인터넷 탓을 하지 않는다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'rate-limited-minute' });
    panel();
    await startWith('이 학생 초안 쓰기');
    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/1분 뒤에 다시 눌러/)).toBeTruthy();
    expect(screen.queryByText(/인터넷 연결을 확인/)).toBeNull();
  });

  it('일간 한도는 분당과 다른 안내다 — "내일" 이라고 말한다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'rate-limited-day' });
    panel();
    await startWith('이 학생 초안 쓰기');
    expect(screen.getByText(/내일 다시 눌러/)).toBeTruthy();
  });

  it('★한도로 멈추면 [이어 하기] 가 잠긴다 — 안 잠그면 눌러서 요청이 더 몰린다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'rate-limited-minute' });
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);

    const btn = screen.getByRole('button', { name: /초 뒤에 이어 할 수 있어요/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('한도가 아닌 실패에는 잠그지 않는다 — 바로 이어 할 수 있다', async () => {
    fetchRecordPromptL1.mockResolvedValue({ ok: false, reason: 'unavailable' });
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);

    const btn = screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('★만료된 규정으로도 초안은 만들어진다 — 서버가 죽었다고 멈추지 않는다', async () => {
    fetchRecordPromptL1.mockResolvedValue({
      ok: true,
      prompt: '[조금 낡은 규정 본문]',
      version: 1,
      stale: true,
    });
    panel();
    await startWith('이 학생 초안 쓰기');
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.appendSystemPrompt).toBe('[조금 낡은 규정 본문]');
  });
});

describe('★별칭을 실제 이름으로 되돌린 뒤 저장한다', () => {
  beforeEach(connectClaude);

  it('되돌리기 자체 — 나온 만큼 전부 바꾼다', () => {
    const m = [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' as const }];
    expect(restoreAliases('［이름1］은 ［이름1］답게 썼다.', m)).toBe('김지훈은 김지훈답게 썼다.');
  });

  it('★근거에 적힌 다른 학생 이름도 나갈 때 가려지고 돌아올 때 되돌아온다', async () => {
    const applied: Applied[] = [];
    panel(
      {
        target: target({
          evidences: [{ id: 'e1', content: '박서연과 함께 모둠 발표를 준비했다.' }],
        }),
      },
      applied,
    );
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).not.toContain('박서연');
    expect(prompt).not.toContain('김지훈');
    expect(prompt).toContain('［이름2］');

    await finishWith('［이름1］은 ［이름2］와 협력했다.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(applied[0]?.text).toBe('김지훈은 박서연와 협력했다.');
  });

  it('★판에도 미리보기에도 ［이름1］ 이 남지 않는다', async () => {
    panel();
    await startWith('이 학생 초안 쓰기');
    await finishWith('［이름1］은 탐구 흐름을 이어 썼다.');

    expect(screen.getByText(/김지훈은 탐구 흐름을 이어 썼다/)).toBeTruthy();
    const saved = JSON.stringify(useRecordAiDraftStore.getState().records);
    expect(saved).not.toContain('［이름');
  });
});

describe('★형광펜 표식 — 저장되는 글에는 표식이 없고 역할만 따로 남는다 (ADR-085)', () => {
  beforeEach(connectClaude);

  it('장면 번호가 있는 미수정 본문은 다시 표시해도 번호를 잃지 않는다', async () => {
    const remarked: RoleMark[][] = [];
    const marks: RoleMark[] = [{ role: 'process', sceneIndex: 3, text: '자료를 비교함.' }];
    panel({
      highlightOn: true,
      target: target({ existingText: '자료를 비교함.' }),
      existingRoleMarks: marks,
      onRemark: (_ref, next) => {
        remarked.push([...next]);
      },
    });
    await startWith('다시 표시');
    expect(remarked).toEqual([marks]);
    expect(runCalls).toHaveLength(0);
  });

  it('뒤에 붙일 때 판별 중복 장면 번호를 본문 전체 차례로 바꾼다', async () => {
    const applied: Applied[] = [];
    panel(
      {
        target: target({ existingText: '앞의 조사.' }),
        existingRoleMarks: [{ role: 'process', sceneIndex: 1, text: '앞의 조사.' }],
      },
      applied,
    );
    await startWith('이 학생 초안 쓰기');
    await finishWith('[장면 1] [과정] 뒤의 발표.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '뒤에 붙이기' }));
    });
    expect(applied[0]?.marks?.map((p) => p.sceneIndex)).toEqual([1, 2]);
    expect(applied[0]?.text).toBe('앞의 조사. 뒤의 발표.');
  });

  it('[동기] 류 표식은 본문에서 빠지고 roleMarks 로 간다', async () => {
    const applied: Applied[] = [];
    panel({ highlightOn: true }, applied);
    await startWith('이 학생 초안 쓰기');
    await finishWith('[동기] 왜 그런지 물었다.\n\n[과정] 자료를 모았다.\n\n[결과] 답을 찾았다.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    // ★저장되는 생기부 본문에는 줄바꿈이 없다(NEIS 는 한 덩어리 글). 문단의 흔적은 roleMarks 에만 남는다.
    expect(applied[0]?.text).toBe('왜 그런지 물었다. 자료를 모았다. 답을 찾았다.');
    expect(applied[0]?.text).not.toContain('\n');
    expect(applied[0]?.text).not.toMatch(/\[(동기|과정|결과|평가)\]/);
    expect(applied[0]?.marks?.map((m) => m.role)).toEqual(['motive', 'process', 'result']);
    // 프롬프트가 표식을 요구한다.
    expect(runCalls[0]?.prompt).toContain('[평가] [동기] [과정] [결과]');
  });

  it('표식이 하나도 없으면 "표식 없음"을 알리고 글은 그대로 보여 준다', async () => {
    panel({ highlightOn: true });
    await startWith('이 학생 초안 쓰기');
    await finishWith('표식 없는 초안.');
    expect(screen.getByText(/표식 없음/)).toBeTruthy();
    expect(screen.getByText('표식 없는 초안.')).toBeTruthy();
  });

  it('[다시 표시]는 본문이 그대로일 때만 표식을 받고, 문장이 바뀌면 버린다', async () => {
    const remarked: RoleMark[][] = [];
    panel({
      highlightOn: true,
      target: target({ existingText: '첫 문단.\n\n둘째 문단.' }),
      onRemark: (_ref, marks) => {
        remarked.push([...marks]);
      },
    });
    await startWith('다시 표시');
    // 근거는 싣지 않는다 — 글만 나간다.
    expect(runCalls[0]?.prompt).not.toContain('근거 자료:');
    await finishWith('[동기] 첫 문단.\n\n[결과] 둘째 문단을 고쳤다.');
    expect(remarked).toHaveLength(0);
    expect(screen.getByText(/문장을 바꿔 보내/)).toBeTruthy();

    await startWith('다시 표시');
    await finishWith('[동기] 첫 문단.\n\n[결과] 둘째 문단.');
    expect(remarked[0]?.map((m) => m.role)).toEqual(['motive', 'result']);
  });
});

describe('★"남은 학생 모두" 중에는 어느 칸에 저장되는지 못 박는다', () => {
  beforeEach(connectClaude);

  it('다른 학생 차례면 "○○ 학생 칸에 저장됩니다"를 보여 주고 실제로도 그 칸으로 간다', async () => {
    const applied: Applied[] = [];
    const focused: string[] = [];
    panel(
      {
        remaining: [target({ studentRef: 's2', displayName: '박서연' })],
        onFocusStudent: (ref) => focused.push(ref),
      },
      applied,
    );
    await startWith(/남은 학생 모두/);
    await finishWith('김지훈 초안.');
    expect(screen.queryByText(/칸에 저장됩니다/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');
    expect(screen.getByText('박서연 학생 칸에 저장됩니다.')).toBeTruthy();
    expect(focused).toEqual(['s2']);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(applied.map((a) => a.ref)).toEqual(['s1', 's2']);
  });

  it('★실행 중인 학생들은 스토어의 큐에서 읽힌다(ADR-093) — 끝나면 비어 있다', async () => {
    const active = (): readonly string[] =>
      activeStudentRefsOf(useRecordAiRunStore.getState().draftPhaseFor('homeroom:subject:수학'));
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);
    expect(active()).toEqual(['s1', 's2']);
    await finishWith('김지훈 초안.');
    // 미리보기 중: 김지훈(보는 중) + 박서연(남음)
    expect(active()).toEqual(['s1', 's2']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(active()).toEqual([]);
  });

  it('★패널이 다시 만들어져도(학생 전환) 큐가 산다 — 스토어가 들기 때문', async () => {
    const applied: Applied[] = [];
    const r = panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] }, applied);
    await startWith(/남은 학생 모두/);
    await finishWith('김지훈 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');
    // 부모가 선택을 박서연으로 옮겨 패널을 새로 만든 상황을 흉내 낸다.
    r.unmount();
    panel(
      {
        target: target({ studentRef: 's2', displayName: '박서연' }),
        draftKey: { ...KEY, studentRef: 's2' },
      },
      applied,
    );
    // 새 인스턴스가 박서연 미리보기를 그대로 보여 준다(큐가 죽지 않았다).
    expect(screen.getByText(/박서연: 미리보기/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(applied.map((a) => a.ref)).toEqual(['s1', 's2']);
    expect(useRecordAiRunStore.getState().draftPhaseFor('homeroom:subject:수학').kind).toBe('idle');
  });
});

describe('★고른 N명 — 체크한 학생만 차례로 쓴다 (오너 요청 2026-09-08)', () => {
  beforeEach(connectClaude);

  it('고른 학생이 있으면 [고른 N명] 단추가 뜨고, 누르면 그 학생들만 큐에 든다', async () => {
    const cleared: number[] = [];
    panel({
      remaining: [target({ studentRef: 's3', displayName: '이도윤' })],
      picked: [
        target({ studentRef: 's2', displayName: '박서연' }),
        target({ studentRef: 's4', displayName: '최민준' }),
      ],
      onClearPicked: () => cleared.push(1),
    });
    expect(screen.queryByTestId('picked-overwrite-notice')).toBeNull();
    await startWith('고른 2명 초안 쓰기');
    expect(cleared).toHaveLength(1);
    const phase = useRecordAiRunStore.getState().draftPhaseFor('homeroom:subject:수학');
    expect(phase.kind).toBe('running');
    expect(activeStudentRefsOf(phase)).toEqual(['s2', 's4']);
    expect(runCalls).toHaveLength(1);
  });

  it('고른 학생 중 이미 초안이 있으면 먼저 알린다 — 소리 없이 덮지 않는다', () => {
    panel({
      picked: [
        target({ studentRef: 's2', displayName: '박서연', existingText: '이미 쓴 글.' }),
        target({ studentRef: 's4', displayName: '최민준' }),
      ],
    });
    expect(screen.getByTestId('picked-overwrite-notice').textContent).toContain(
      '1명은 이미 초안이',
    );
  });

  it('고른 학생이 없으면 단추가 없다', () => {
    panel();
    expect(screen.queryByRole('button', { name: /고른 \d+명/ })).toBeNull();
  });
});

describe('★어느 AI·모델로 쓰는지 보이고 고를 수 있다 (ADR-084)', () => {
  function bothConnected() {
    useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
    useOwnAiStatusStore.setState({
      connections: {
        claude: connected(),
        codex: { provider: 'codex', state: 'connected', version: '0.144.4', model: '' },
      },
    });
  }

  it('둘 다 연결되면 공급자를 고를 수 있고, 고르면 그 공급자로 실행한다', async () => {
    bothConnected();
    panel();
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }));
    await startWith('이 학생 초안 쓰기');
    expect(runCalls).toHaveLength(1);
    expect(useAssistStore.getState().provider).toBe('codex');
  });

  it('하나만 연결됐으면 고르기 대신 이름만 보여 준다', () => {
    connectClaude();
    panel();
    expect(screen.queryByRole('button', { name: 'Claude Code' })).toBeNull();
    expect(screen.getByText('Claude Code')).toBeTruthy();
  });

  it('모델을 고를 수 있다', () => {
    bothConnected();
    panel();
    const select = screen.getByRole('combobox', { name: '초안에 쓸 모델 고르기' });
    const pick = OWN_AI_MODELS.claude[1]?.id ?? '';
    fireEvent.change(select, { target: { value: pick } });
    expect(useAssistStore.getState().ownAiModels.claude).toBe(pick);
  });

  it('★미리보기에 어느 AI 가 썼는지 남는다', async () => {
    bothConnected();
    const model = OWN_AI_MODELS.claude[1]?.id ?? '';
    useAssistStore.setState({ ownAiModels: { claude: model, codex: '' } });
    panel();
    await startWith('이 학생 초안 쓰기');
    await finishWith('탐구 흐름을 이어 쓴 초안.');
    // ★내부 이름(claude-sonnet-5)이 아니라 선택 상자와 같은 이름(Sonnet 5)으로 보인다(2026-09-08 R-8).
    const label = OWN_AI_MODELS.claude[1]?.label ?? '';
    expect(screen.getByText(new RegExp(`Claude Code ${label.split(' — ')[0]}`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(`Claude Code ${model}`))).toBeNull();
  });
});

describe('★C0 (ㄱ) 반영이 실패하면 실패라고 말한다', () => {
  beforeEach(connectClaude);

  /**
   * `applyVersion` 에 try/catch 가 없어서, `onApply` 가 한도 초과로 던지면 그 뒤의
   * `markApplied` 도 `continueQueue` 도 실행되지 않았다. 즉 **아무 일도 안 일어나고
   * 아무 안내도 없다.** 선생님은 눌렀는데 반응이 없는 화면만 본다.
   * ★이 결함은 검증 게이트 4종이 전부 초록인 채 존재했다.
   */
  it('한도 초과로 저장이 거부되면 이유가 뜨고, 판은 반영 표시가 붙지 않는다', async () => {
    panel({
      onApply: () => {
        throw new Error('1,782바이트로 한도 1,500바이트를 넘었습니다.');
      },
    });
    await startWith('이 학생 초안 쓰기');
    await finishWith('한도를 넘긴 긴 초안.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });

    expect(screen.getByText(/반영하지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/한도 1,500바이트를 넘었습니다/)).toBeTruthy();
    // ★반영되지 않았으므로 판에 반영 표시가 붙으면 안 된다(붙으면 다시 시도할 길이 흐려진다).
    expect(useRecordAiDraftStore.getState().records[0]?.appliedAt).toBeUndefined();
    // 미리보기는 그대로 남아 있어야 한다 — 결과를 잃지 않는다.
    expect(screen.getByText(/미리보기/)).toBeTruthy();
  });
});

describe('★C0 (ㄷ) 중복 실행 잠금은 참조로 막는다', () => {
  beforeEach(connectClaude);

  /**
   * 상태(`useState`)로 만든 잠금은 갱신이 비동기라 빠르게 두 번 누르면 두 호출이
   * **같은 옛 값**을 보고 둘 다 통과한다(이 저장소에서 실제로 뚫린 전례가 있다).
   */
  it('[다시 표시]를 연달아 눌러도 실행은 1회다', async () => {
    panel({
      highlightOn: true,
      target: target({ existingText: '이미 쓴 초안 본문.' }),
      onRemark: () => {},
    });

    // 한 번의 act 안에서 연달아 누른다 — 상태 갱신이 아직 반영되기 전이다.
    await act(async () => {
      const btn = screen.getByRole('button', { name: /다시 표시/ });
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    expect(runCalls).toHaveLength(1);
  });
});

describe('분량 목표와 흐름 보기에서 온 주제 (오너 요청 2026-09-11)', () => {
  beforeEach(connectClaude);

  it('칩을 누르면 목표를 바꾸고, 맨 끝 칩은 한도라고 적힌다', () => {
    const onChange = vi.fn();
    panel({ area: 'subject', level: 'high', targetBytes: 1500, onChangeTargetBytes: onChange });
    fireEvent.click(screen.getByRole('button', { name: '750B' }));
    expect(onChange).toHaveBeenCalledWith(750);
    expect(screen.getByRole('button', { name: '한도 1,500B' })).toBeTruthy();
  });

  it('★요청서에 늘 분량 줄이 실린다 — 목표가 한도와 같아도(ADR-110)', async () => {
    panel({ area: 'subject', level: 'high', targetBytes: 750, onChangeTargetBytes: () => {} });
    await startWith('이 학생 초안 쓰기');
    expect(runCalls[0]?.prompt ?? '').toContain(
      '분량: 공백을 포함해 750바이트(한글 약 250자)를 넘기지 마세요.',
    );
    expect(runCalls[0]?.prompt ?? '').toContain('근거가 넉넉하면 713~750바이트');

    cleanup();
    runCalls.length = 0;
    useRecordAiRunStore.getState().reset();
    panel({ area: 'subject', level: 'high', targetBytes: 1500, onChangeTargetBytes: () => {} });
    await startWith('이 학생 초안 쓰기');
    // 예전에는 한도와 같으면 빠졌다 — 1층 규정에 바이트 한도가 없어 모델은 분량을 전혀 몰랐다.
    expect(runCalls[0]?.prompt ?? '').toContain('근거가 넉넉하면 1,425~1,500바이트');
    // 근거 한 줄뿐인 학생 — 목표를 채우지 말라는 신호가 숫자와 함께 간다(보강 2).
    expect(runCalls[0]?.prompt ?? '').toContain('목표 분량의 절반에 못 미칩니다');
  });

  it('★[이 흐름으로 초안 쓰기]로 온 주제를 골라 둔다', () => {
    panel({
      threads: [
        {
          id: 'thr-1',
          studentRef: 's1',
          title: '할인 문구와 선택',
          keywords: [],
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      studentEvidences: [{ id: 'e1', content: '주제에 묶인 근거', threadId: 'thr-1' }],
      requestedThread: { threadId: 'thr-1', chain: false, nonce: 1 },
    });
    expect(
      screen.getByRole('button', { name: '할인 문구와 선택' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('근거 지도에서 고른 근거로 초안 쓰기 (ADR-106)', () => {
  const EVIDENCES = [
    {
      id: 'e1',
      content: '쿠폰 질문을 했다',
      date: '2026-05-01',
      links: [{ toId: 'e3', note: '뒷받침' }],
    },
    { id: 'e2', content: '고르지 않은 근거', date: '2026-05-02' },
    { id: 'e3', content: '보고서를 썼다', date: '2026-05-03' },
    { id: 'e4', content: '보내지 않기로 한 근거', date: '2026-05-04', excludedFromAi: true },
  ];

  it('★화면의 「초안에 쓸 근거 N건」과 요청서에 실리는 근거가 같고, 연결 줄이 함께 나간다', async () => {
    connectClaude();
    panel({
      target: target({ evidences: EVIDENCES }),
      studentEvidences: EVIDENCES,
      requestedSelection: { evidenceIds: ['e3', 'e1', 'e4', 'ghost'], nonce: 1 },
    });
    expect(screen.getByRole('button', { name: '고른 근거 3건' })).toBeTruthy();
    expect(screen.getByTestId('evidence-count-summary').textContent).toContain(
      '초안에 쓸 근거 2건 · 빠진 근거 1건',
    );
    expect(screen.getByTestId('composition-summary').textContent).toContain(
      '지도에서 고른 근거 3건으로 씁니다.',
    );
    expect(screen.getByTestId('composition-summary').textContent).toContain(
      '근거 사이 연결 1건을 따라 차례를 정합니다.',
    );
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('1. (2026-05-01) 쿠폰 질문을 했다');
    expect(prompt).toContain('2. (2026-05-03) 보고서를 썼다');
    expect(prompt).not.toContain('고르지 않은 근거');
    expect(prompt).not.toContain('보내지 않기로 한 근거');
    expect(prompt).toContain('- 1 → 2: 뒷받침');
  });

  it('주제 칩이나 [전체 근거]를 누르면 고른 근거가 풀린다', () => {
    connectClaude();
    panel({
      target: target({ evidences: EVIDENCES }),
      studentEvidences: EVIDENCES,
      threads: [
        {
          id: 'thr-1',
          studentRef: 's1',
          title: '할인 문구와 선택',
          keywords: [],
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      requestedSelection: { evidenceIds: ['e1'], nonce: 1 },
    });
    expect(screen.getByRole('button', { name: '고른 근거 1건' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '전체 근거' }));
    expect(screen.queryByRole('button', { name: /고른 근거/ })).toBeNull();
    expect(screen.getByTestId('evidence-count-summary').textContent).toContain(
      '초안에 쓸 근거 3건',
    );
  });

  it('없는 id 만 왔으면 받지 않는다 — 빈 선택으로 초안을 만들지 않는다', () => {
    panel({
      target: target({ evidences: EVIDENCES }),
      studentEvidences: EVIDENCES,
      requestedSelection: { evidenceIds: ['ghost'], nonce: 1 },
    });
    expect(screen.queryByRole('button', { name: /고른 근거/ })).toBeNull();
  });
});

describe('★초안이 목표를 10% 넘게 넘기면 앱이 한 번 줄인다 (ADR-110, 오너: 1,700 이상이 문제)', () => {
  beforeEach(connectClaude);
  const SENT = '탐구 과정에서 자료를 체계적으로 정리함. ';
  /** 57B 문장 30개 = 1,709B — 목표 1,500 의 110%(1,650)를 넘는다. */
  const LONG = `[평가] ${SENT.repeat(30).trim()}`;
  /** 25개 = 1,424B. */
  const SHORT = `[평가] ${SENT.repeat(25).trim()}`;
  const open1500 = (): void => {
    panel({ area: 'subject', level: 'high', targetBytes: 1500, onChangeTargetBytes: () => {} });
  };

  it('줄이기를 한 번 더 보내고, 처음 판과 줄인 판을 둘 다 남긴 뒤 줄인 판을 보여 준다', async () => {
    open1500();
    await startWith('이 학생 초안 쓰기');
    await finishWith(LONG);

    expect(runCalls).toHaveLength(2);
    const second = runCalls[1]?.prompt ?? '';
    expect(second).toContain('줄일 글:');
    // 문단 역할(형광펜 색)을 지키려고 표식을 붙여 보낸다.
    expect(second).toContain('[평가] 탐구 과정에서');
    expect(second).toMatch(/문장으로 치면 약 \d+문장/);
    expect(second).not.toContain('김지훈');
    expect(runCalls[1]?.appendSystemPrompt).toBe('[생기부 작성 규정 본문]');
    expect(
      screen.getByText(/1,709B로 목표\(1,500B\)보다 길어서 자동으로 한 번 줄이고 있어요/),
    ).toBeTruthy();

    await finishWith(SHORT);
    expect(useRecordAiDraftStore.getState().records).toHaveLength(2);
    expect(screen.getByText(/자동으로 한 번 줄였어요/).textContent).toContain('v1 탭');
    expect(screen.getByRole('tab', { name: 'v2' }).getAttribute('aria-selected')).toBe('true');
  });

  it('조금 넘친 것(10% 이내)은 그대로 둔다 — 줄이기를 부르지 않는다', async () => {
    open1500();
    await startWith('이 학생 초안 쓰기');
    await finishWith(`[평가] ${SENT.repeat(28).trim()}`); // 1,595B
    expect(runCalls).toHaveLength(1);
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);
    expect(screen.queryByText(/자동으로 한 번/)).toBeNull();
  });

  it('줄인 글이 줄지 않았으면 처음 판만 남기고 그렇게 말한다', async () => {
    open1500();
    await startWith('이 학생 초안 쓰기');
    await finishWith(LONG);
    await finishWith(LONG);
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);
    expect(screen.getByText(/자동으로 줄이지 못해 처음 판을 그대로/)).toBeTruthy();
  });

  it('★줄이는 중에 [중단]을 눌러도 처음 초안은 버리지 않는다', async () => {
    open1500();
    await startWith('이 학생 초안 쓰기');
    await finishWith(LONG);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '중단' }));
    });
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);
    expect(screen.getByText(/자동 줄이기를 멈췄어요/)).toBeTruthy();
  });
});

describe('★분량은 1,500 에 묶이지 않는다 — 진로 2,100 · 직접 정한 한도 (오너 확인 2026-09-11)', () => {
  beforeEach(connectClaude);
  /** 57B 문장 — n 개면 57n - 1 바이트. */
  const SENT = '탐구 과정에서 자료를 체계적으로 정리함. ';
  const draftOf = (n: number): string => `[평가] ${SENT.repeat(n).trim()}`;

  it('진로활동(2,100B)은 요청서도 자동 줄이기 기준도 2,100 을 쓴다', async () => {
    panel({ area: 'career', level: 'high', targetBytes: 2100, onChangeTargetBytes: () => {} });
    expect(screen.getByRole('button', { name: '한도 2,100B' })).toBeTruthy();
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('분량: 공백을 포함해 2,100바이트(한글 약 700자)를 넘기지 마세요.');
    expect(prompt).toContain('근거가 넉넉하면 1,995~2,100바이트');
    // 2,279B — 1,500 이 기준이었다면 줄였을 길이지만 2,100 의 110%(2,310) 안이라 그대로 둔다.
    await finishWith(draftOf(40));
    expect(runCalls).toHaveLength(1);
  });

  it('진로활동에서 2,310B 를 넘으면 목표 2,100 으로 한 번 줄인다', async () => {
    panel({ area: 'career', level: 'high', targetBytes: 2100, onChangeTargetBytes: () => {} });
    await startWith('이 학생 초안 쓰기');
    await finishWith(draftOf(42)); // 2,393B
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1]?.prompt ?? '').toContain('목표 분량: 1,995 ~ 2,100바이트');
    expect(screen.getByText(/목표\(2,100B\)보다 길어서/)).toBeTruthy();
  });

  it('선생님이 한도를 2,000 으로 정했으면 요청서가 2,000 을 말하고, 칩 끝도 「한도 2,000B」다', async () => {
    panel({
      area: 'subject',
      level: 'high',
      targetBytes: 2000,
      limitOverride: 2000,
      onChangeTargetBytes: () => {},
    });
    expect(screen.getByRole('button', { name: '한도 2,000B' })).toBeTruthy();
    await startWith('이 학생 초안 쓰기');
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('분량: 공백을 포함해 2,000바이트(한글 약 667자)를 넘기지 마세요.');
    expect(prompt).toContain('근거가 넉넉하면 1,900~2,000바이트');
    expect(prompt).toContain('기재요령 기본 한도(1,500바이트)보다 깁니다');
    await finishWith(draftOf(37)); // 2,108B — 2,000 의 110%(2,200) 안
    expect(runCalls).toHaveLength(1);
  });
});
