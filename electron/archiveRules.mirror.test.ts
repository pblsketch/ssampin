/**
 * 미러 동치 테스트 (계획 S2.1 AC-5 · 함정 ⑤) — 도메인 정본 `src/domain/rules/archiveRules.ts`와
 * electron 미러 `electron/archiveManager.ts`(MIRROR 블록)가 같은 입력에 같은 답을 내는지 강제한다.
 *
 * electron은 rootDir 제약으로 @domain을 import할 수 없어 순수 함수를 의도적으로 복제한다
 * (backupRules ↔ backupManager 선례). 이 테스트가 빨간불이면 한쪽만 고친 것이다 —
 * 정본(src/domain/rules/archiveRules.ts)을 먼저 고치고 미러를 맞출 것.
 */
import { describe, expect, test } from 'vitest';
import * as domain from '../src/domain/rules/archiveRules';
import * as mirror from './archiveManager';

const SHA = 'b'.repeat(64);

/** 이름·경로 코퍼스 — 정상/경계/공격 패턴을 섞는다. */
const NAME_CORPUS: readonly string[] = [
  '2026-1',
  '2026-2',
  'students',
  'teaching-classes',
  'legacy_term.v1',
  'manifest',
  'manifest.json',
  'students.json',
  'obs-attachments/x.png',
  'obs-attachments/../evil',
  'obs-attachments/..',
  'obs-attachments/.hidden',
  'obs-attachments/a/b',
  'stickers/x.png',
  'data/students',
  '..',
  '.',
  '../evil',
  '..\\evil',
  'a/b/c',
  'a\\b',
  '/absolute',
  '/etc/passwd',
  'C:\\evil',
  'C:/evil',
  '.staging-123',
  '.hidden',
  '한글',
  ' ',
  '',
];

const PARSED_CORPUS: readonly unknown[] = [
  [1, 2, 3],
  [],
  { records: [1, 2], categories: [1] },
  { classes: [] },
  { theme: 'dark', nested: { arr: [1] } },
  {},
  null,
  'raw',
  42,
  undefined,
];

const TERM_CORPUS: readonly string[] = ['2026-1', '2026-2', '1999-1', 'unknown', '2026-3', ''];

describe('archiveRules ↔ archiveManager 미러 동치', () => {
  test('상수가 동일하다', () => {
    expect(mirror.ARCHIVE_SCHEMA_VERSION).toBe(domain.ARCHIVE_SCHEMA_VERSION);
    expect(mirror.ARCHIVE_DIRNAME).toBe(domain.ARCHIVE_DIRNAME);
    expect(mirror.ARCHIVE_MANIFEST_FILENAME).toBe(domain.ARCHIVE_MANIFEST_FILENAME);
    expect([...mirror.ARCHIVE_BINARY_ROOTS]).toEqual([...domain.ARCHIVE_BINARY_ROOTS]);
  });

  test('isValidArchiveName / isValidArchiveTerm 동치', () => {
    for (const name of NAME_CORPUS) {
      expect(mirror.isValidArchiveName(name), `isValidArchiveName(${JSON.stringify(name)})`).toBe(
        domain.isValidArchiveName(name),
      );
      expect(mirror.isValidArchiveTerm(name), `isValidArchiveTerm(${JSON.stringify(name)})`).toBe(
        domain.isValidArchiveTerm(name),
      );
    }
  });

  test('classifyArchiveCreateKey 동치', () => {
    for (const key of NAME_CORPUS) {
      expect(
        mirror.classifyArchiveCreateKey(key),
        `classifyArchiveCreateKey(${JSON.stringify(key)})`,
      ).toEqual(domain.classifyArchiveCreateKey(key));
    }
  });

  test('isValidArchiveRelPath 동치', () => {
    for (const relPath of NAME_CORPUS) {
      expect(
        mirror.isValidArchiveRelPath(relPath),
        `isValidArchiveRelPath(${JSON.stringify(relPath)})`,
      ).toBe(domain.isValidArchiveRelPath(relPath));
    }
  });

  test('countArchiveRecords 동치', () => {
    for (const parsed of PARSED_CORPUS) {
      expect(mirror.countArchiveRecords(parsed), JSON.stringify(parsed) ?? 'undefined').toBe(
        domain.countArchiveRecords(parsed),
      );
    }
  });

  test('defaultArchiveLabel 동치 (정본은 academicCalendar.formatTermKo 파생)', () => {
    for (const term of TERM_CORPUS) {
      expect(mirror.defaultArchiveLabel(term), `defaultArchiveLabel(${term})`).toBe(
        domain.defaultArchiveLabel(term),
      );
    }
  });

  test('buildArchiveManifest 동치', () => {
    const input = {
      term: '2026-1',
      label: '2026학년도 1학기',
      archivedAt: '2026-08-06T00:00:00.000Z',
      appVersion: '2.2.13',
      entries: [
        { path: 'students.json', kind: 'data' as const, bytes: 10, sha256: SHA, records: 2 },
        { path: 'obs-attachments/x.png', kind: 'binary' as const, bytes: 5, sha256: SHA },
      ],
    };
    expect(mirror.buildArchiveManifest(input)).toEqual(domain.buildArchiveManifest(input));
  });

  test('validateArchiveManifest 동치 (정상·불량 샘플)', () => {
    const valid = domain.buildArchiveManifest({
      term: '2026-1',
      label: 'L',
      archivedAt: '2026-08-06T00:00:00.000Z',
      appVersion: '1',
      entries: [{ path: 'students.json', kind: 'data', bytes: 1, sha256: SHA, records: 0 }],
    });
    const samples: unknown[] = [
      JSON.parse(JSON.stringify(valid)),
      { ...valid, schemaVersion: 999 },
      { ...valid, term: '../evil' },
      { ...valid, entries: [{ path: '../e.json', kind: 'data', bytes: 1, sha256: SHA }] },
      { ...valid, entries: [{ path: 'a.json', kind: 'data', bytes: 1, sha256: 'zz' }] },
      null,
      [],
      'x',
    ];
    for (const raw of samples) {
      expect(mirror.validateArchiveManifest(raw)).toEqual(domain.validateArchiveManifest(raw));
    }
  });

  test('validateArchivesSection 동치 (정상·불량 샘플)', () => {
    const samples: unknown[] = [
      {},
      {
        '2026-1': {
          'students.json': { format: 'utf8', content: '{}' },
          'obs-attachments/x.png': { format: 'base64', content: 'AAAA' },
        },
      },
      { '../evil': {} },
      { '2026-1': { '../evil.json': { format: 'utf8', content: '' } } },
      { '2026-1': { 'students.json': { format: 'hex', content: '' } } },
      { '2026-1': 'not-object' },
      null,
      [],
    ];
    for (const raw of samples) {
      expect(mirror.validateArchivesSection(raw)).toEqual(domain.validateArchivesSection(raw));
    }
  });
});
