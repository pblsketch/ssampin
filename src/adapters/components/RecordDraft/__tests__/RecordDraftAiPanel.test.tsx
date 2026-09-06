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
  useRecordAiDraftStore.setState({ records: [], loaded: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe('★구독이 없으면 요청을 보내지 않는다 (D2)', () => {
  it('연결 전에는 눌러도 안내만 하고 실행이 0회다', () => {
    panel();
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));

    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/구독 AI/)).toBeTruthy();
    expect(screen.queryByText(/쌤핀 AI 로 이어서/)).toBeNull();
  });

  it('실험실 스위치만 켜고 연결이 없으면 여전히 실행 0회다', () => {
    useAssistStore.setState({ ownAiEnabled: true });
    panel();
    fireEvent.click(screen.getByRole('button', { name: /AI로 초안 쓰기/ }));
    expect(runCalls).toHaveLength(0);
  });
});

describe('연결되면 단위를 고를 수 있다 (D8)', () => {
  beforeEach(connectClaude);

  it('남은 학생이 없으면 "이 학생만"만 보인다', () => {
    panel();
    expect(screen.getByRole('button', { name: '이 학생만' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /남은 학생 모두/ })).toBeNull();
  });

  it('남은 학생이 있으면 인원수와 함께 보인다', () => {
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    expect(screen.getByRole('button', { name: /남은 학생 모두 \(2명\)/ })).toBeTruthy();
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
    await startWith('이 학생만');

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
    await startWith('이 학생만');

    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('주제에 묶인 근거');
    expect(prompt).not.toContain('묶이지 않은 근거');
    expect(prompt).toContain('주제:');
  });
});

describe('결과는 미리보기다 — [반영] 을 눌러야 초안 칸에 들어간다 (D4)', () => {
  beforeEach(connectClaude);

  it('★답이 와도 [반영] 전에는 저장이 0회다 — 판으로만 남는다', async () => {
    const applied: Applied[] = [];
    panel({}, applied);
    await startWith('이 학생만');
    await finishWith('탐구 흐름을 이어 쓴 초안.');

    expect(screen.getByText(/미리보기/)).toBeTruthy();
    expect(applied).toHaveLength(0);
    expect(useRecordAiDraftStore.getState().records).toHaveLength(1);
  });

  it('[반영] 을 누르면 그 학생 자리에 저장되고 판에 반영 표시가 남는다', async () => {
    const applied: Applied[] = [];
    panel({}, applied);
    await startWith('이 학생만');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
    await finishWith('첫 판.');
    await startWith('이 학생만');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.appendSystemPrompt).toBe('[생기부 작성 규정 본문]');
  });

  it('★규정을 못 받아 오면 실행이 0회다 — 초안을 만들지 않고 안내만 한다', async () => {
    fetchRecordPromptL1.mockResolvedValue(null);
    panel();
    await startWith('이 학생만');
    expect(runCalls).toHaveLength(0);
    expect(screen.getByText(/규정을 서버에서 받아오지 못해/)).toBeTruthy();
  });

  it('규정을 못 받아도 학생을 잃지 않는다 — [이어 하기] 로 전원 다시 시도한다', async () => {
    fetchRecordPromptL1.mockResolvedValue(null);
    panel({ remaining: [target({ studentRef: 's2', displayName: '박서연' })] });
    await startWith(/남은 학생 모두/);
    expect(screen.getByRole('button', { name: /이어 하기 \(2명 남음\)/ })).toBeTruthy();
  });

  it('★규정 본문을 화면에 보여 주지 않는다', async () => {
    fetchRecordPromptL1.mockResolvedValue('절대로 화면에 뜨면 안 되는 규정 본문');
    const { container } = panel();
    await startWith('이 학생만');
    expect(container.textContent).not.toContain('절대로 화면에 뜨면 안 되는');
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
    await finishWith('［이름1］은 탐구 흐름을 이어 썼다.');

    expect(screen.getByText(/김지훈은 탐구 흐름을 이어 썼다/)).toBeTruthy();
    const saved = JSON.stringify(useRecordAiDraftStore.getState().records);
    expect(saved).not.toContain('［이름');
  });
});

describe('★형광펜 표식 — 저장되는 글에는 표식이 없고 역할만 따로 남는다 (ADR-085)', () => {
  beforeEach(connectClaude);

  it('[동기] 류 표식은 본문에서 빠지고 roleMarks 로 간다', async () => {
    const applied: Applied[] = [];
    panel({ highlightOn: true }, applied);
    await startWith('이 학생만');
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
    expect(runCalls[0]?.prompt).toContain('[동기] [과정] [결과] [평가]');
  });

  it('표식이 하나도 없으면 "표식 없음"을 알리고 글은 그대로 보여 준다', async () => {
    panel({ highlightOn: true });
    await startWith('이 학생만');
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

  it('실행 중인 학생들을 부모에게 알리고, 끝나면 빈 목록을 보낸다', async () => {
    const active: (readonly string[])[] = [];
    panel({
      remaining: [target({ studentRef: 's2', displayName: '박서연' })],
      onActiveChange: (refs) => active.push(refs),
    });
    await startWith(/남은 학생 모두/);
    expect(active.at(-1)).toEqual(['s1', 's2']);
    await finishWith('김지훈 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    await finishWith('박서연 초안.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '반영' }));
    });
    expect(active.at(-1)).toEqual([]);
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
    await startWith('이 학생만');
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
    await startWith('이 학생만');
    await finishWith('탐구 흐름을 이어 쓴 초안.');
    expect(screen.getByText(new RegExp(`Claude Code ${model}`))).toBeTruthy();
  });
});
