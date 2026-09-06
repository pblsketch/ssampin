/**
 * 첨부 커밋 계약 — 파일별 성공/실패를 구별한다(계획 §5.1-2, AC-06).
 *
 * 이전 동작: 실패를 토스트로 흘리고 `void` 반환. 화면은 "3개 중 2개만 붙었다"를 알 수 없었고,
 * 성공한 파일까지 대기 목록에서 지워지거나 재시도가 성공분을 또 올렸다.
 *
 * ★식별은 pendingKey 로 한다. 같은 이름 파일을 두 번 고르는 일이 흔하고, 일부만 성공한 뒤
 *   목록에서 빼면 배열 위치가 밀린다.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import {
  commitObservationAttachments,
  keepFailed,
  newPendingKey,
  partialAttachmentMessage,
  type PendingAttachmentItem,
} from '../observationAttachmentCommit';

const item = (pendingKey: string, name: string): PendingAttachmentItem => ({
  pendingKey,
  file: new File(['x'], name),
  source: 'teacher',
});

const saved = (id: string): ObservationAttachment => ({ id }) as unknown as ObservationAttachment;

describe('commitObservationAttachments', () => {
  it('전부 성공하면 실패 0건이고 attachmentId 를 파일별로 돌려준다', async () => {
    const add = vi.fn(async () => saved('a1'));
    const r = await commitObservationAttachments('rec-1', [item('k1', 'a.png')], add);
    expect(r.failed).toEqual([]);
    expect(r.succeeded).toEqual([{ pendingKey: 'k1', attachmentId: 'a1' }]);
  });

  it('★3개 중 2번째만 실패해도 나머지는 계속 붙이고, 성공/실패를 구별해 돌려준다', async () => {
    let n = 0;
    const add = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error('용량 초과');
      return saved(`a${n}`);
    });
    const items = [item('k1', 'a.png'), item('k2', 'b.png'), item('k3', 'c.png')];
    const r = await commitObservationAttachments('rec-1', items, add);

    expect(add).toHaveBeenCalledTimes(3); // 중간 실패가 뒤를 멈추지 않는다
    expect(r.succeeded.map((s) => s.pendingKey)).toEqual(['k1', 'k3']);
    expect(r.failed).toEqual([{ pendingKey: 'k2', message: '용량 초과' }]);
  });

  it('★재시도 대상은 실패한 파일뿐이다 — 성공분을 또 올리지 않는다', async () => {
    const items = [item('k1', 'a.png'), item('k2', 'b.png'), item('k3', 'c.png')];
    const r = {
      succeeded: [
        { pendingKey: 'k1', attachmentId: 'a1' },
        { pendingKey: 'k3', attachmentId: 'a3' },
      ],
      failed: [{ pendingKey: 'k2', message: '용량 초과' }],
    };
    expect(keepFailed(items, r).map((i) => i.pendingKey)).toEqual(['k2']);
  });

  it('★같은 이름 파일이 둘이어도 pendingKey 로 정확히 실패분만 남는다', async () => {
    // 이름으로 식별하면 여기서 둘 다 남거나 둘 다 사라진다.
    const items = [item('k1', '사진.png'), item('k2', '사진.png')];
    let n = 0;
    const add = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('실패');
      return saved('a2');
    });
    const r = await commitObservationAttachments('rec-1', items, add);
    const remaining = keepFailed(items, r);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.pendingKey).toBe('k1');
  });

  it('빈 목록이면 저장을 부르지 않는다', async () => {
    const add = vi.fn(async () => saved('a1'));
    const r = await commitObservationAttachments('rec-1', [], add);
    expect(add).not.toHaveBeenCalled();
    expect(r).toEqual({ succeeded: [], failed: [] });
  });
});

describe('partialAttachmentMessage — 부분 성공을 "저장됨"으로 뭉뚱그리지 않는다', () => {
  it('전부 성공이면 별도 문구가 없다', () => {
    expect(partialAttachmentMessage({ succeeded: [], failed: [] })).toBeNull();
  });

  it('일부 실패면 기록은 저장됐음과 실패 건수를 함께 말한다', () => {
    const msg = partialAttachmentMessage({
      succeeded: [{ pendingKey: 'k1', attachmentId: 'a1' }],
      failed: [{ pendingKey: 'k2', message: 'x' }],
    });
    expect(msg).toContain('기록은 저장됐습니다');
    expect(msg).toContain('첨부 1개');
  });
});

describe('newPendingKey', () => {
  it('한 세션 안에서 겹치지 않는다', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newPendingKey()));
    expect(keys.size).toBe(50);
  });
});
