/**
 * 원본 기록의 주제 소속 판정 (계획 §4.3).
 *
 * ★소속의 정본은 저장된 근거다. 원본에 남은 옛 threadId 를 믿으면 지금 상태를 잘못 말한다.
 */
import { describe, it, expect } from 'vitest';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import { resolveRecordTopic } from '../recordTopicLabel';

const ev = (p: Partial<RecordEvidence> & Pick<RecordEvidence, 'id'>): RecordEvidence => ({
  studentRef: 'tc:c1:1-2-3',
  areas: ['subject'],
  content: '내용',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

const th = (p: Partial<InquiryThread> & Pick<InquiryThread, 'id'>): InquiryThread => ({
  studentRef: 'tc:c1:1-2-3',
  title: `주제 ${p.id}`,
  keywords: [],
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

const REF = 'tc:c1:1-2-3';

describe('resolveRecordTopic', () => {
  it('근거로 올린 적이 없으면 미지정이다', () => {
    expect(resolveRecordTopic('obs-1', REF, [], [])).toEqual({ kind: 'none' });
  });

  it('근거는 있지만 미분류면 미지정이다', () => {
    const e = [ev({ id: 'e1', sourceId: 'obs-1' })];
    expect(resolveRecordTopic('obs-1', REF, e, [])).toEqual({ kind: 'none' });
  });

  it('주제에 묶여 있으면 그 이름을 준다', () => {
    const e = [ev({ id: 'e1', sourceId: 'obs-1', threadId: 't1' })];
    const t = [th({ id: 't1', title: '할인 문구와 선택' })];
    expect(resolveRecordTopic('obs-1', REF, e, t)).toEqual({
      kind: 'thread',
      threadId: 't1',
      title: '할인 문구와 선택',
    });
  });

  it('★주제를 찾을 수 없으면 "없다"가 아니라 "확인 중"이다', () => {
    // 다른 기기에서 지웠거나 아직 동기화가 안 왔을 수 있다. 단정하지 않는다.
    const e = [ev({ id: 'e1', sourceId: 'obs-1', threadId: 'gone' })];
    expect(resolveRecordTopic('obs-1', REF, e, [])).toEqual({
      kind: 'unknown-thread',
      threadId: 'gone',
    });
  });

  it('★다른 학생의 근거는 집지 않는다', () => {
    const e = [ev({ id: 'e1', sourceId: 'obs-1', threadId: 't1', studentRef: 'tc:c1:9-9-9' })];
    const t = [th({ id: 't1' })];
    expect(resolveRecordTopic('obs-1', REF, e, t)).toEqual({ kind: 'none' });
  });

  it('다른 원본의 근거는 집지 않는다', () => {
    const e = [ev({ id: 'e1', sourceId: 'obs-9', threadId: 't1' })];
    expect(resolveRecordTopic('obs-1', REF, e, [th({ id: 't1' })])).toEqual({ kind: 'none' });
  });
});
