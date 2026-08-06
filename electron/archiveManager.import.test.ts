/**
 * importArchive(S4.1 — archive:import) fs 통합 테스트.
 *
 * 계약:
 *  - 이미 있는 학기는 **바이트 무변경 스킵**(아카이브 불변 — 절대 덮어쓰기 금지).
 *  - manifest.json 필수 + term 일치 + 항목 전건 존재 + SHA-256 전건 일치일 때만 배치.
 *  - 낯선 파일(매니페스트 밖) 혼입 거부.
 *  - 실패 시 최종 위치(archives/{term})에 부분 결과물 0 (스테이징 + rename).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildArchiveManifest,
  createArchive,
  importArchive,
  listArchives,
  readArchiveFile,
  type ArchiveManifestEntry,
} from './archiveManager';

let userData: string;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-archive-import-'));
});

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

function sha256(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const STUDENTS = JSON.stringify({ students: [{ id: 's1', name: '김학생' }] });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

/** 유효한 학기 1개 분량 파일 묶음(base64 — Drive 다운로드 경로와 동일 형태). */
function makeValidFiles(term: string): Record<string, { format: 'base64'; content: string }> {
  const entries: ArchiveManifestEntry[] = [
    {
      path: 'students.json',
      kind: 'data',
      bytes: Buffer.byteLength(STUDENTS),
      sha256: sha256(STUDENTS),
      records: 1,
    },
    { path: 'obs-attachments/a.png', kind: 'binary', bytes: PNG.byteLength, sha256: sha256(PNG) },
  ];
  const manifest = JSON.stringify(
    buildArchiveManifest({
      term,
      label: `${term} 라벨`,
      archivedAt: '2026-08-06T00:00:00.000Z',
      appVersion: '2.2.13-test',
      entries,
    }),
  );
  return {
    'manifest.json': {
      format: 'base64',
      content: Buffer.from(manifest, 'utf-8').toString('base64'),
    },
    'students.json': {
      format: 'base64',
      content: Buffer.from(STUDENTS, 'utf-8').toString('base64'),
    },
    'obs-attachments/a.png': { format: 'base64', content: PNG.toString('base64') },
  };
}

describe('importArchive', () => {
  test('유효한 묶음을 원자적으로 배치하고 목록·읽기(체크섬 검증)가 통한다', () => {
    const result = importArchive(userData, '2025-2', makeValidFiles('2025-2'));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);
    expect(result.entryCount).toBe(2);

    const listed = listArchives(userData);
    expect(listed.ok && listed.archives.some((a) => a.term === '2025-2' && a.manifestOk)).toBe(
      true,
    );
    const read = readArchiveFile(userData, '2025-2', 'students.json');
    expect(read.ok && read.content).toBe(STUDENTS);
    const bin = readArchiveFile(userData, '2025-2', 'obs-attachments/a.png');
    expect(bin.ok && bin.encoding === 'base64' && bin.content).toBe(PNG.toString('base64'));
  });

  test('불변 계약 — 이미 있는 학기는 바이트 무변경 스킵(절대 덮어쓰기 금지)', () => {
    // 로컬에 같은 학기를 먼저 만든다(다른 내용).
    fs.mkdirSync(path.join(userData, 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(userData, 'data', 'students.json'),
      JSON.stringify({ students: [{ id: 'local-only' }] }),
      'utf-8',
    );
    const created = createArchive(userData, '1.0-test', '2025-2', ['students']);
    expect(created.ok).toBe(true);
    const before = fs.readFileSync(
      path.join(userData, 'data', 'archives', '2025-2', 'students.json'),
    );

    const result = importArchive(userData, '2025-2', makeValidFiles('2025-2'));
    expect(result.ok && result.skipped).toBe(true);

    const after = fs.readFileSync(
      path.join(userData, 'data', 'archives', '2025-2', 'students.json'),
    );
    expect(after.equals(before), '기존 아카이브 바이트 무변경').toBe(true);
  });

  test('체크섬 불일치 — 거부 + 최종 위치에 부분 결과물 0', () => {
    const files = makeValidFiles('2025-2');
    files['students.json'] = {
      format: 'base64',
      content: Buffer.from('{"students":[]}', 'utf-8').toString('base64'), // 매니페스트와 다른 내용
    };
    const result = importArchive(userData, '2025-2', files);
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2025-2'))).toBe(false);
  });

  test('매니페스트 부재·항목 누락·낯선 파일·term 불일치 전부 거부', () => {
    // 매니페스트 부재
    const noManifest = makeValidFiles('2025-2');
    delete (noManifest as Record<string, unknown>)['manifest.json'];
    expect(importArchive(userData, '2025-2', noManifest).ok).toBe(false);

    // 항목 누락
    const missingEntry = makeValidFiles('2025-2');
    delete (missingEntry as Record<string, unknown>)['obs-attachments/a.png'];
    expect(importArchive(userData, '2025-2', missingEntry).ok).toBe(false);

    // 낯선 파일 혼입
    const stray = makeValidFiles('2025-2');
    stray['extra.json'] = {
      format: 'base64',
      content: Buffer.from('{}', 'utf-8').toString('base64'),
    };
    expect(importArchive(userData, '2025-2', stray).ok).toBe(false);

    // term 불일치(매니페스트는 2025-2인데 대상 디렉토리는 2026-1)
    expect(importArchive(userData, '2026-1', makeValidFiles('2025-2')).ok).toBe(false);

    // 전부 최종 위치 무생성
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2025-2'))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2026-1'))).toBe(false);
  });

  test('traversal·불량 이름 거부', () => {
    expect(importArchive(userData, '../evil', makeValidFiles('2025-2')).ok).toBe(false);
    const badPath = makeValidFiles('2025-2');
    badPath['../evil.json'] = {
      format: 'base64',
      content: Buffer.from('{}', 'utf-8').toString('base64'),
    };
    expect(importArchive(userData, '2025-2', badPath).ok).toBe(false);
  });
});
