/**
 * archiveRules 단위 테스트 — 학년도 보관함 도메인 정본 (S2.1).
 * 이름·경로 화이트리스트(traversal 거부), 매니페스트 스키마, 백업 archives 섹션 검증.
 * electron 미러와의 동치는 electron/archiveRules.mirror.test.ts가 별도로 강제한다.
 */
import { describe, expect, test } from 'vitest';
import {
  ARCHIVE_BINARY_ROOTS,
  ARCHIVE_DIRNAME,
  ARCHIVE_MANIFEST_FILENAME,
  ARCHIVE_SCHEMA_VERSION,
  buildArchiveManifest,
  classifyArchiveCreateKey,
  countArchiveRecords,
  defaultArchiveLabel,
  isValidArchiveRelPath,
  isValidArchiveTerm,
  validateArchiveManifest,
  validateArchivesSection,
  type ArchiveManifestEntry,
} from '../archiveRules';
import { validateBackupFile } from '../backupRules';

const SHA = 'a'.repeat(64);

describe('archiveRules — 이름/경로 화이트리스트', () => {
  test('정상 학기 이름을 허용한다', () => {
    expect(isValidArchiveTerm('2026-1')).toBe(true);
    expect(isValidArchiveTerm('2026-2')).toBe(true);
    expect(isValidArchiveTerm('legacy_term.v1')).toBe(true);
  });

  test('traversal·구분자·숨김 이름을 전부 거부한다 (계획 S2.1 AC-2)', () => {
    for (const bad of [
      '..',
      '.',
      '../evil',
      '..\\evil',
      'a/b',
      'a\\b',
      '/absolute',
      'C:\\evil',
      'C:/evil',
      '',
      ' ',
      '한글',
      '.staging-123',
      '.hidden',
    ]) {
      expect(isValidArchiveTerm(bad), `거부되어야 함: ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  test('classifyArchiveCreateKey — 데이터 키는 data/{base}.json → {base}.json 사본', () => {
    expect(classifyArchiveCreateKey('students')).toEqual({
      kind: 'data',
      base: 'students',
      relPath: 'students.json',
    });
    expect(classifyArchiveCreateKey('teaching-classes')).toEqual({
      kind: 'data',
      base: 'teaching-classes',
      relPath: 'teaching-classes.json',
    });
  });

  test('classifyArchiveCreateKey — 관찰 첨부(바이너리, data/ 밖 — 함정 ③)를 허용한다', () => {
    expect(classifyArchiveCreateKey('obs-attachments/abc-1.png')).toEqual({
      kind: 'binary',
      root: 'obs-attachments',
      name: 'abc-1.png',
      relPath: 'obs-attachments/abc-1.png',
    });
  });

  test('classifyArchiveCreateKey — 불량 키 전부 거부', () => {
    for (const bad of [
      'manifest', // manifest.json 충돌
      'students.json', // 이중 확장 방지
      '../../evil',
      '..',
      'obs-attachments/../evil',
      'obs-attachments/..',
      'obs-attachments/a/b',
      'stickers/x.png', // 화이트리스트 밖 루트
      'data/students', // 화이트리스트 밖 루트
      '/etc/passwd',
      'C:\\evil.json',
      'obs-attachments\\evil.png',
      '',
    ]) {
      expect(classifyArchiveCreateKey(bad), `거부되어야 함: ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  test('isValidArchiveRelPath — 저장 상대 경로 규칙', () => {
    expect(isValidArchiveRelPath('students.json')).toBe(true);
    expect(isValidArchiveRelPath(ARCHIVE_MANIFEST_FILENAME)).toBe(true);
    expect(isValidArchiveRelPath('obs-attachments/x.png')).toBe(true);
    for (const bad of [
      '../x.json',
      'obs-attachments/../x',
      'a/b/c',
      'stickers/x.png',
      '.hidden',
      'obs-attachments/.hidden',
      'a\\b',
      '',
    ]) {
      expect(isValidArchiveRelPath(bad), `거부되어야 함: ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe('archiveRules — 건수·라벨', () => {
  test('countArchiveRecords — 배열/봉투/문서/원시값', () => {
    expect(countArchiveRecords([1, 2, 3])).toBe(3);
    expect(countArchiveRecords({ records: [1, 2], categories: [1] })).toBe(3); // 최상위 배열 합
    expect(countArchiveRecords({ classes: [] })).toBe(0);
    expect(countArchiveRecords({ theme: 'dark', lang: 'ko' })).toBe(1); // 설정류 문서 1건
    expect(countArchiveRecords(null)).toBe(0);
    expect(countArchiveRecords('raw')).toBe(0);
  });

  test('defaultArchiveLabel — formatTermKo 파생 + 비형식 폴백', () => {
    expect(defaultArchiveLabel('2026-1')).toBe('2026학년도 1학기');
    expect(defaultArchiveLabel('2026-2')).toBe('2026학년도 2학기');
    expect(defaultArchiveLabel('unknown')).toBe('unknown');
  });
});

describe('archiveRules — 매니페스트 스키마', () => {
  const entries: ArchiveManifestEntry[] = [
    { path: 'students.json', kind: 'data', bytes: 10, sha256: SHA, records: 2 },
    { path: 'obs-attachments/x.png', kind: 'binary', bytes: 5, sha256: SHA },
  ];
  const manifest = buildArchiveManifest({
    term: '2026-1',
    label: '2026학년도 1학기',
    archivedAt: '2026-08-06T00:00:00.000Z',
    appVersion: '2.2.13',
    entries,
  });

  test('buildArchiveManifest — totalBytes는 entries에서 파생', () => {
    expect(manifest.schemaVersion).toBe(ARCHIVE_SCHEMA_VERSION);
    expect(manifest.totalBytes).toBe(15);
  });

  test('build → validate 왕복이 성립한다', () => {
    const result = validateArchiveManifest(JSON.parse(JSON.stringify(manifest)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest).toEqual(manifest);
  });

  test('미래 스키마 버전은 거부한다', () => {
    const result = validateArchiveManifest({ ...manifest, schemaVersion: 999 });
    expect(result.ok).toBe(false);
  });

  test('불량 매니페스트 전부 거부 (traversal 경로·체크섬 형식·자기 참조)', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      { ...manifest, term: '../evil' },
      { ...manifest, entries: [{ ...entries[0], path: '../evil.json' }] },
      { ...manifest, entries: [{ ...entries[0], sha256: 'zzz' }] },
      { ...manifest, entries: [{ ...entries[0], path: ARCHIVE_MANIFEST_FILENAME }] },
      { ...manifest, entries: [{ ...entries[0], kind: 'exe' }] },
      { ...manifest, entries: [{ ...entries[0], bytes: -1 }] },
      { ...manifest, entries: 'not-array' },
    ];
    for (const raw of bad) {
      const result = validateArchiveManifest(raw);
      expect(result.ok, `거부되어야 함: ${JSON.stringify(raw)?.slice(0, 80)}`).toBe(false);
    }
  });
});

describe('archiveRules — 백업 archives 섹션 (S2.1b)', () => {
  test('정상 섹션을 통과시킨다 (빈 객체 포함)', () => {
    expect(validateArchivesSection({}).ok).toBe(true);
    const result = validateArchivesSection({
      '2026-1': {
        'students.json': { format: 'utf8', content: '{"students":[]}' },
        'manifest.json': { format: 'utf8', content: '{}' },
        'obs-attachments/x.png': { format: 'base64', content: 'AAAA' },
      },
    });
    expect(result.ok).toBe(true);
  });

  test('불량 섹션 전부 거부 (term·경로·항목 형식)', () => {
    const bad: unknown[] = [
      null,
      [],
      { '../evil': {} },
      { '2026-1': { '../evil.json': { format: 'utf8', content: '' } } },
      { '2026-1': { 'students.json': { format: 'hex', content: '' } } },
      { '2026-1': { 'students.json': { format: 'utf8' } } },
      { '2026-1': 'not-object' },
    ];
    for (const raw of bad) {
      expect(validateArchivesSection(raw).ok, `거부되어야 함: ${JSON.stringify(raw)}`).toBe(false);
    }
  });

  test('실측 고정: 도메인 validateBackupFile은 최상위 archives 추가 키를 거부하지 않는다', () => {
    // S2.1b의 전제(스키마 버전 유지 + 추가 키 방식)가 무너지면 이 테스트가 먼저 빨간불이 된다.
    const result = validateBackupFile({
      metadata: {
        schemaVersion: 1,
        appVersion: '2.2.13',
        exportedAt: '2026-08-06T00:00:00.000Z',
        platform: 'win32',
        entryCount: 1,
      },
      data: { students: { students: [] } },
      archives: { '2026-1': { 'students.json': { format: 'utf8', content: '{}' } } },
    });
    expect(result.ok).toBe(true);
  });
});

describe('archiveRules — 상수', () => {
  test('디렉토리·바이너리 루트 상수', () => {
    expect(ARCHIVE_DIRNAME).toBe('archives');
    expect(ARCHIVE_BINARY_ROOTS).toContain('obs-attachments');
  });
});
