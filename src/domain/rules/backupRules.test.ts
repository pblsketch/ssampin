import { describe, it, expect } from 'vitest';
import {
  selectBackupCandidates,
  buildBackupMetadata,
  validateBackupFile,
  selectRestoreCandidates,
  buildDefaultBackupFilename,
} from './backupRules';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '@domain/entities/Backup';

describe('selectBackupCandidates', () => {
  it('정상 .json 파일들을 정렬된 base 이름으로 돌려준다', () => {
    const result = selectBackupCandidates([
      'settings.json',
      'memos.json',
      'todos.json',
    ]);
    expect(result).toEqual(['memos', 'settings', 'todos']);
  });

  it('.backup.json / .tmp.json 부산물을 제외한다', () => {
    const result = selectBackupCandidates([
      'settings.json',
      'settings.backup.json',
      'todos.tmp.json',
    ]);
    expect(result).toEqual(['settings']);
  });

  it('환경 의존 파일(widget-bounds, icon-bounds)을 제외한다', () => {
    const result = selectBackupCandidates([
      'widget-bounds.json',
      'icon-bounds.json',
      'settings.json',
    ]);
    expect(result).toEqual(['settings']);
  });

  it('json 외 파일은 무시한다', () => {
    const result = selectBackupCandidates([
      'profile.png',
      'doc.hwpx',
      'memos.json',
    ]);
    expect(result).toEqual(['memos']);
  });

  it('허용되지 않은 문자가 포함된 파일명을 거부한다 (path traversal 방어)', () => {
    const result = selectBackupCandidates([
      '../etc/passwd.json',
      'good.json',
      'bad name.json',
    ]);
    expect(result).toEqual(['good']);
  });

  it('중복 base 이름은 한 번만 포함한다', () => {
    const result = selectBackupCandidates(['settings.json', 'settings.json']);
    expect(result).toEqual(['settings']);
  });
});

describe('buildBackupMetadata', () => {
  it('현재 schemaVersion으로 metadata를 만든다', () => {
    const meta = buildBackupMetadata({
      appVersion: '2.0.2',
      platform: 'win32',
      exportedAt: '2026-05-04T10:00:00.000Z',
      entryCount: 5,
    });
    expect(meta.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(meta.appVersion).toBe('2.0.2');
    expect(meta.platform).toBe('win32');
    expect(meta.entryCount).toBe(5);
    expect(meta.exportedAt).toBe('2026-05-04T10:00:00.000Z');
  });
});

describe('validateBackupFile', () => {
  const validBackup = {
    metadata: {
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      appVersion: '2.0.2',
      exportedAt: '2026-05-04T10:00:00.000Z',
      platform: 'win32',
      entryCount: 1,
    },
    data: {
      settings: { schoolName: '테스트고' },
    },
  };

  it('정상 백업 파일을 통과시킨다', () => {
    const result = validateBackupFile(validBackup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.metadata.appVersion).toBe('2.0.2');
      expect(Object.keys(result.backup.data)).toEqual(['settings']);
    }
  });

  it('null 입력을 invalid-structure로 거부한다', () => {
    const result = validateBackupFile(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-structure');
    }
  });

  it('배열 입력을 invalid-structure로 거부한다', () => {
    const result = validateBackupFile([1, 2, 3]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-structure');
    }
  });

  it('metadata 누락을 invalid-structure로 거부한다', () => {
    const result = validateBackupFile({ data: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-structure');
    }
  });

  it('미래 버전을 unsupported-future-version으로 거부한다', () => {
    const future = {
      ...validBackup,
      metadata: {
        ...validBackup.metadata,
        schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION + 1,
      },
    };
    const result = validateBackupFile(future);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-future-version');
    }
  });

  it('빈 data를 empty-data로 거부한다', () => {
    const empty = { ...validBackup, data: {} };
    const result = validateBackupFile(empty);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('empty-data');
    }
  });

  it('허용되지 않은 키 이름이 있으면 invalid-structure로 거부한다', () => {
    const malicious = {
      ...validBackup,
      data: { '../etc/passwd': {} },
    };
    const result = validateBackupFile(malicious);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-structure');
    }
  });

  it('알 수 없는 platform 값을 unknown으로 정규화한다', () => {
    const exotic = {
      ...validBackup,
      metadata: { ...validBackup.metadata, platform: 'sunOS' },
    };
    const result = validateBackupFile(exotic);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.metadata.platform).toBe('unknown');
    }
  });
});

describe('selectRestoreCandidates', () => {
  it('백업 안의 keys 중 환경 파일을 제거한다', () => {
    const result = selectRestoreCandidates([
      'settings',
      'widget-bounds',
      'memos',
    ]);
    expect(result).toEqual(['memos', 'settings']);
  });
});

describe('buildDefaultBackupFilename', () => {
  it('ISO 시각으로 안전한 파일명을 만든다', () => {
    const filename = buildDefaultBackupFilename('2026-05-04T12:34:56.789Z');
    expect(filename).toBe('ssampin-backup-20260504-123456.ssampin-backup.json');
  });

  it('밀리초가 없는 시각도 처리한다', () => {
    const filename = buildDefaultBackupFilename('2026-05-04T12:34:56Z');
    expect(filename).toMatch(
      /^ssampin-backup-20260504-123456\.ssampin-backup\.json$/,
    );
  });
});
