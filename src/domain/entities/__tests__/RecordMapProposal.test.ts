import { describe, expect, it } from 'vitest';

import {
  isRecordMapReviewStatus,
  isRecordMapRunStatus,
  RECORD_MAP_REVIEW_STATUSES,
  RECORD_MAP_RUN_STATUSES,
} from '../RecordMapProposal';

describe('RecordMapProposal 상태 계약', () => {
  it('실행 상태와 검토 상태를 서로 섞지 않는다', () => {
    expect(RECORD_MAP_RUN_STATUSES).toEqual([
      'queued',
      'generating',
      'generated',
      'failed',
      'skipped',
      'cancelled',
    ]);
    expect(RECORD_MAP_REVIEW_STATUSES).toEqual([
      'unreviewed',
      'reviewed',
      'held',
      'source-changed',
      'applying',
      'applied',
      'save-failed',
    ]);
    expect(isRecordMapRunStatus('generated')).toBe(true);
    expect(isRecordMapRunStatus('reviewed')).toBe(false);
    expect(isRecordMapReviewStatus('reviewed')).toBe(true);
    expect(isRecordMapReviewStatus('generated')).toBe(false);
  });

  it('문자열이 아닌 값과 임의 상태를 거부한다', () => {
    expect(isRecordMapRunStatus('done')).toBe(false);
    expect(isRecordMapReviewStatus(null)).toBe(false);
  });
});
