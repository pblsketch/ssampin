/**
 * 저장 조정 — 원본 → 첨부 → 근거·주제 연결 (계획 §5.1-8, AC-06·09).
 *
 * ★핵심 계약: **성공한 단계는 재시도가 다시 하지 않는다.** 재시도가 원본을 또 만들면
 *   같은 기록이 두 벌 생긴다. 체크포인트의 확정 id 로 그 단계를 건너뛴다.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { PendingAttachmentItem } from '../observationAttachmentCommit';
import {
  runObservationEvidenceSave,
  type ObservationEvidenceSaveDeps,
  type ObservationEvidenceSaveInput,
} from '../observationEvidenceSave';

const file = (key: string): PendingAttachmentItem => ({
  pendingKey: key,
  file: new File(['x'], `${key}.png`),
  source: 'teacher',
});

const baseInput = (
  over: Partial<ObservationEvidenceSaveInput> = {},
): ObservationEvidenceSaveInput => ({
  studentRef: 'tc:c1:1-2-3',
  areas: ['subject'],
  content: '근거를 들어 반박했다',
  sourceType: 'observation',
  attachments: [],
  ...over,
});

function deps(over: Partial<ObservationEvidenceSaveDeps> = {}): ObservationEvidenceSaveDeps {
  return {
    saveSource: vi.fn(async () => 'src-1'),
    addAttachment: vi.fn(async () => ({ id: 'att-1' }) as unknown as ObservationAttachment),
    ensureEvidence: vi.fn(async () => ({ evidenceId: 'ev-1' })),
    ...over,
  };
}

describe('성공 경로', () => {
  it('원본 → 근거 순서로 저장하고 체크포인트에 확정 id 를 남긴다', async () => {
    const d = deps();
    const r = await runObservationEvidenceSave(baseInput(), d);
    expect(r.ok).toBe(true);
    expect(r.failedStage).toBeNull();
    expect(r.checkpoint.sourceId).toBe('src-1');
    expect(r.checkpoint.evidenceId).toBe('ev-1');
  });

  it('첨부가 없으면 첨부 저장을 부르지 않는다', async () => {
    const d = deps();
    await runObservationEvidenceSave(baseInput(), d);
    expect(d.addAttachment).not.toHaveBeenCalled();
  });

  it('주제를 고르면 그대로 연결 관문에 넘긴다', async () => {
    const d = deps();
    await runObservationEvidenceSave(baseInput({ threadId: 'thr-1' }), d);
    expect(d.ensureEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thr-1', sourceId: 'src-1' }),
    );
  });

  it('주제를 안 고르면 threadId 없이 넘긴다(미선택이 저장을 막지 않는다)', async () => {
    const d = deps();
    await runObservationEvidenceSave(baseInput(), d);
    const arg = (d.ensureEvidence as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect('threadId' in (arg as object)).toBe(false);
  });
});

describe('AC-06 원본 저장 실패', () => {
  it('원본이 실패하면 첨부·연결로 넘어가지 않는다', async () => {
    const d = deps({
      saveSource: vi.fn(async () => {
        throw new Error('디스크 오류');
      }),
    });
    const r = await runObservationEvidenceSave(baseInput({ attachments: [file('k1')] }), d);
    expect(r.ok).toBe(false);
    expect(r.failedStage).toBe('source');
    expect(r.checkpoint.sourceId).toBeNull();
    expect(d.addAttachment).not.toHaveBeenCalled();
    expect(d.ensureEvidence).not.toHaveBeenCalled();
  });

  it('★재시도는 원본을 새로 만들지 않는다 — 확정 id 가 있으면 그 단계를 건너뛴다', async () => {
    const d = deps();
    const first = await runObservationEvidenceSave(baseInput(), d);
    expect(d.saveSource).toHaveBeenCalledTimes(1);

    // 같은 체크포인트로 다시 실행(연결 다시 시도 상황)
    await runObservationEvidenceSave(baseInput(), d, first.checkpoint);
    expect(d.saveSource).toHaveBeenCalledTimes(1); // 늘지 않았다
  });

  it('다른 학생의 체크포인트는 이어받지 않는다 — 남의 원본에 붙지 않게', async () => {
    const d = deps();
    const first = await runObservationEvidenceSave(baseInput(), d);
    await runObservationEvidenceSave(baseInput({ studentRef: 'tc:c1:9-9-9' }), d, first.checkpoint);
    expect(d.saveSource).toHaveBeenCalledTimes(2); // 새 학생은 새로 저장한다
  });
});

describe('AC-06 첨부 부분 실패', () => {
  it('★2번째 파일만 실패해도 연결까지 간다. 성공한 파일 id 는 보존된다', async () => {
    let n = 0;
    const d = deps({
      addAttachment: vi.fn(async () => {
        n += 1;
        if (n === 2) throw new Error('용량 초과');
        return { id: `att-${n}` } as unknown as ObservationAttachment;
      }),
    });
    const r = await runObservationEvidenceSave(
      baseInput({ attachments: [file('k1'), file('k2'), file('k3')] }),
      d,
    );
    expect(d.ensureEvidence).toHaveBeenCalledTimes(1); // 첨부 실패가 연결을 막지 않는다
    expect(r.checkpoint.evidenceId).toBe('ev-1');
    expect(r.failedStage).toBe('attachments');
    expect(r.attachments?.succeeded.map((s) => s.pendingKey)).toEqual(['k1', 'k3']);
    expect(r.checkpoint.attachmentsPending.map((i) => i.pendingKey)).toEqual(['k2']);
  });

  it('★재시도는 실패한 파일만 다시 올린다', async () => {
    let n = 0;
    const d = deps({
      addAttachment: vi.fn(async () => {
        n += 1;
        if (n === 2) throw new Error('용량 초과');
        return { id: `att-${n}` } as unknown as ObservationAttachment;
      }),
    });
    const first = await runObservationEvidenceSave(
      baseInput({ attachments: [file('k1'), file('k2'), file('k3')] }),
      d,
    );
    expect(d.addAttachment).toHaveBeenCalledTimes(3);

    const retry = await runObservationEvidenceSave(
      baseInput({ attachments: [file('k1'), file('k2'), file('k3')] }),
      d,
      first.checkpoint,
    );
    expect(d.addAttachment).toHaveBeenCalledTimes(4); // 실패분 1개만 추가로
    expect(retry.ok).toBe(true);
    expect(retry.checkpoint.attachmentsPending).toEqual([]);
  });
});

describe('AC-09 연결 실패', () => {
  it('연결이 실패해도 원본은 저장된 채로 남는다 — 되돌리지 않는다', async () => {
    const d = deps({
      ensureEvidence: vi.fn(async () => {
        throw new Error('마친 주제입니다');
      }),
    });
    const r = await runObservationEvidenceSave(baseInput({ threadId: 'thr-1' }), d);
    expect(r.ok).toBe(false);
    expect(r.failedStage).toBe('link');
    expect(r.checkpoint.sourceId).toBe('src-1'); // 원본은 살아 있다
    expect(r.checkpoint.evidenceId).toBeNull();
  });

  it('★연결만 다시 시도하면 원본도 첨부도 다시 하지 않는다', async () => {
    let fail = true;
    const d = deps({
      ensureEvidence: vi.fn(async () => {
        if (fail) throw new Error('일시 실패');
        return { evidenceId: 'ev-1' };
      }),
    });
    const first = await runObservationEvidenceSave(baseInput({ attachments: [file('k1')] }), d);
    expect(first.failedStage).toBe('link');

    fail = false;
    const retry = await runObservationEvidenceSave(
      baseInput({ attachments: [file('k1')] }),
      d,
      first.checkpoint,
    );
    expect(retry.ok).toBe(true);
    expect(d.saveSource).toHaveBeenCalledTimes(1); // 원본 1회
    expect(d.addAttachment).toHaveBeenCalledTimes(1); // 첨부도 1회 — 성공분을 또 올리지 않는다
    expect(retry.checkpoint.evidenceId).toBe('ev-1');
  });
});
