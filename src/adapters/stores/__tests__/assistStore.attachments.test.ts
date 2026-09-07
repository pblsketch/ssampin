/**
 * 쌤핀 AI — 이미지 첨부(ADR-090)는 **"내 AI"를 고른 질문에만 실린다.**
 *
 * 쌤핀 AI(Solar) 는 중계 서버가 글만 받고 사진 속 이름·얼굴은 가릴 수 없다. 그래서
 * 스토어는 (1) Solar 를 고른 동안 붙이기를 거부하고, (2) Solar 로 돌리는 순간 내려놓고,
 * (3) 포트에는 "내 AI"일 때만 싣는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import type { AssistAttachment } from '@domain/entities/AssistAttachment';
import { ASSIST_ATTACHMENT_LIMITS } from '@domain/entities/AssistAttachment';
import { useAssistStore } from '@adapters/stores/useAssistStore';

function png(id: string, bytes = 100): AssistAttachment {
  return { id, name: `${id}.png`, mediaType: 'image/png', bytes, dataBase64: 'iVBORw0KGgo=' };
}

function fakePort(): AssistPort & { calls: AssistRequestPayload[] } {
  const calls: AssistRequestPayload[] = [];
  return {
    calls,
    ask: vi.fn(async (payload: AssistRequestPayload) => {
      calls.push(payload);
      return { text: '표에는 3명이 있어요.', degraded: null };
    }),
  };
}

beforeEach(() => {
  useAssistStore.setState({
    enabled: true,
    ownAiEnabled: true,
    provider: 'claude',
    open: true,
    turns: [],
    draft: '',
    attachments: [],
  });
});

describe('붙이기', () => {
  it('내 AI 를 고른 동안 붙는다 — 통과한 것만, 거절 사유는 첫 번째 것', () => {
    const r = useAssistStore
      .getState()
      .addAttachments([
        png('a'),
        { ...png('b'), mediaType: 'image/png', bytes: ASSIST_ATTACHMENT_LIMITS.maxBytesEach + 1 },
        png('c'),
      ]);
    expect(r).toBe('too-large');
    expect(useAssistStore.getState().attachments.map((a) => a.id)).toEqual(['a', 'c']);
  });

  it('★쌤핀 AI 를 고른 동안에는 아무것도 붙지 않는다 — 붙여넣기 경로도 여기서 막힌다', () => {
    useAssistStore.setState({ provider: 'ssampin' });
    expect(useAssistStore.getState().addAttachments([png('a')])).toBeNull();
    expect(useAssistStore.getState().attachments).toEqual([]);
  });

  it('하나 빼기·전부 비우기', () => {
    useAssistStore.getState().addAttachments([png('a'), png('b')]);
    useAssistStore.getState().removeAttachment('a');
    expect(useAssistStore.getState().attachments.map((a) => a.id)).toEqual(['b']);
    useAssistStore.getState().clearAttachments();
    expect(useAssistStore.getState().attachments).toEqual([]);
  });
});

describe('내려놓는 순간', () => {
  it('답하는 AI 를 쌤핀 AI 로 돌리면 비운다', () => {
    useAssistStore.getState().addAttachments([png('a')]);
    useAssistStore.getState().setProvider('ssampin');
    expect(useAssistStore.getState().attachments).toEqual([]);
  });

  it('내 AI 끼리 바꾸면 남는다', () => {
    useAssistStore.getState().addAttachments([png('a')]);
    useAssistStore.getState().setProvider('codex');
    expect(useAssistStore.getState().attachments).toHaveLength(1);
  });

  it('"내 AI로 실행" 스위치를 끄면 비운다', () => {
    useAssistStore.getState().addAttachments([png('a')]);
    useAssistStore.getState().setOwnAiEnabled(false);
    expect(useAssistStore.getState().attachments).toEqual([]);
  });

  it('[새 대화] 도 비운다', () => {
    useAssistStore.getState().addAttachments([png('a')]);
    useAssistStore.getState().clearConversation();
    expect(useAssistStore.getState().attachments).toEqual([]);
  });
});

describe('보내기', () => {
  it('★포트에는 모델이 볼 것만 실리고(id·크기 제외), 턴에는 미리보기가 남고, 입력칸은 비워진다', async () => {
    useAssistStore.getState().addAttachments([png('a'), png('b')]);
    const port = fakePort();
    await useAssistStore.getState().ask(port, '이 표에 몇 명이야?', [], []);

    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]?.attachments).toEqual([
      { name: 'a.png', mediaType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
      { name: 'b.png', mediaType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
    ]);
    const turn = useAssistStore.getState().turns[0];
    expect(turn?.attachments?.map((a) => a.id)).toEqual(['a', 'b']);
    expect(turn?.status).toBe('done');
    expect(useAssistStore.getState().attachments).toEqual([]);
  });

  it('첨부가 없으면 payload 에 attachments 칸 자체가 없다(예전 모양 그대로)', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '할 일 몇 건?', [], []);
    expect('attachments' in (port.calls[0] ?? {})).toBe(false);
  });

  it('★쌤핀 AI 로 물어볼 때는 상태에 남아 있어도 싣지 않는다', async () => {
    useAssistStore.getState().addAttachments([png('a')]);
    // setProvider 를 거치지 않고 상태만 바뀐 경우(재수화 등)를 흉내 낸다.
    useAssistStore.setState({ provider: 'ssampin' });
    const port = fakePort();
    await useAssistStore.getState().ask(port, '할 일 몇 건?', [], []);
    expect(port.calls[0]?.attachments).toBeUndefined();
  });
});
