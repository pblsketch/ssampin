import { describe, expect, it } from 'vitest';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';
import {
  canStartMobileConflictResolution,
  canStartMobileUpload,
  firstMobileConflict,
} from '../useMobileDriveSyncStore';

const conflict: DriveSyncConflict = {
  filename: 'events',
  localModified: 'content-mismatch',
  remoteModified: '2026-07-30T03:54:24.657Z',
  localDeviceName: '현재 폰',
  remoteDeviceName: '예전 폰',
};

describe('모바일 동기화 충돌 상태', () => {
  it('다운로드 결과의 첫 충돌을 모바일 선택 UI에 전달한다', () => {
    expect(firstMobileConflict([conflict])).toEqual(conflict);
    expect(firstMobileConflict([])).toBeNull();
  });

  it('충돌 해결 중에는 반대 선택을 동시에 시작하지 않는다', () => {
    expect(canStartMobileConflictResolution('idle', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('conflict', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('error', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('syncing', conflict)).toBe(false);
    expect(canStartMobileConflictResolution('idle', null)).toBe(false);
  });

  it('사용자가 로컬/클라우드를 선택하기 전에는 자동 업로드를 막는다', () => {
    expect(canStartMobileUpload('conflict', conflict)).toBe(false);
    expect(canStartMobileUpload('syncing', null)).toBe(false);
    expect(canStartMobileUpload('error', conflict)).toBe(false);
    expect(canStartMobileUpload('idle', conflict)).toBe(false);
    expect(canStartMobileUpload('idle', null)).toBe(true);
    expect(canStartMobileUpload('error', null)).toBe(true);
  });
});
