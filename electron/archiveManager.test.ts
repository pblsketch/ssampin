/**
 * archiveManager fs 통합 테스트 (S2.1) — 실제 임시 디렉토리에서 생성·목록·읽기·삭제·
 * 백업 수집/복원을 검증한다. 핵심 AC:
 *  - AC-1: 쓰기 실패 주입 → {ok:false} + 라이브 파일 바이트 무변경 (실패 은닉 금지 — 함정 ⑪)
 *  - AC-2: traversal 전부 거부 (함정 ⑫)
 *  - AC-3: 매니페스트 체크섬 일치·불일치 시 {ok:false}
 *  - AC-4: 관찰 첨부 바이너리({userData}/obs-attachments — data/ 밖, 함정 ③)가 실제로 복사된다
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ARCHIVE_MANIFEST_FILENAME,
  collectArchivesSection,
  createArchive,
  deleteArchive,
  listArchives,
  readArchiveFile,
  restoreArchivesSection,
  validateArchiveManifest,
} from './archiveManager';

const APP_VERSION = '2.2.13-test';

let userData: string;

/** 라이브 픽스처: data/*.json + obs-attachments/*.png */
const STUDENTS_JSON = JSON.stringify({ students: [{ id: 's1' }, { id: 's2' }] }, null, 2);
const CLASSES_JSON = JSON.stringify({ classes: [{ id: 'c1' }] }, null, 2);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function seedLiveData(): void {
  fs.mkdirSync(path.join(userData, 'data'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'obs-attachments'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'data', 'students.json'), STUDENTS_JSON, 'utf-8');
  fs.writeFileSync(path.join(userData, 'data', 'teaching-classes.json'), CLASSES_JSON, 'utf-8');
  fs.writeFileSync(path.join(userData, 'obs-attachments', 'att-1.png'), PNG_BYTES);
}

function liveSnapshot(): Record<string, Buffer> {
  return {
    students: fs.readFileSync(path.join(userData, 'data', 'students.json')),
    classes: fs.readFileSync(path.join(userData, 'data', 'teaching-classes.json')),
    attachment: fs.readFileSync(path.join(userData, 'obs-attachments', 'att-1.png')),
  };
}

function expectLiveUnchanged(before: Record<string, Buffer>): void {
  const after = liveSnapshot();
  for (const key of Object.keys(before)) {
    expect(after[key]?.equals(before[key] as Buffer), `라이브 파일 무변경: ${key}`).toBe(true);
  }
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-archive-'));
  seedLiveData();
});

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

describe('createArchive', () => {
  test('데이터 + 관찰 첨부 바이너리를 복사하고 매니페스트(건수·체크섬)를 만든다 (AC-3·AC-4)', () => {
    const result = createArchive(userData, APP_VERSION, '2026-1', [
      'students',
      'teaching-classes',
      'obs-attachments/att-1.png',
    ]);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.entryCount).toBe(3);
    expect(result.label).toBe('2026학년도 1학기');

    const termDir = path.join(userData, 'data', 'archives', '2026-1');
    // 바이트 사본 확인 — 관찰 첨부는 data/ 밖 원본에서 온다 (함정 ③)
    expect(fs.readFileSync(path.join(termDir, 'students.json'), 'utf-8')).toBe(STUDENTS_JSON);
    expect(
      fs.readFileSync(path.join(termDir, 'obs-attachments', 'att-1.png')).equals(PNG_BYTES),
    ).toBe(true);

    // 매니페스트: 유효 + 파일별 건수 + 체크섬으로 읽기 검증 통과
    const manifestRaw = fs.readFileSync(path.join(termDir, ARCHIVE_MANIFEST_FILENAME), 'utf-8');
    const validated = validateArchiveManifest(JSON.parse(manifestRaw));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.manifest.appVersion).toBe(APP_VERSION);
    const studentsEntry = validated.manifest.entries.find((e) => e.path === 'students.json');
    expect(studentsEntry?.records).toBe(2); // 파일별 건수
    expect(
      validated.manifest.entries.find((e) => e.path === 'obs-attachments/att-1.png')?.kind,
    ).toBe('binary');

    const read = readArchiveFile(userData, '2026-1', 'students.json');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.content).toBe(STUDENTS_JSON);
    const readBin = readArchiveFile(userData, '2026-1', 'obs-attachments/att-1.png');
    expect(readBin.ok).toBe(true);
    if (readBin.ok) {
      expect(readBin.encoding).toBe('base64');
      expect(Buffer.from(readBin.content, 'base64').equals(PNG_BYTES)).toBe(true);
    }
  });

  test('존재하지 않는 데이터 키는 건너뛴다(오류 아님)', () => {
    const result = createArchive(userData, APP_VERSION, '2026-1', ['students', 'never-existed']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entryCount).toBe(1);
  });

  test('traversal 시도 전부 거부 + 아무것도 쓰지 않는다 (AC-2)', () => {
    const before = liveSnapshot();
    const badTerms = ['../evil', '..', 'a/b', '/abs', 'C:\\evil', '.staging-x'];
    for (const term of badTerms) {
      const result = createArchive(userData, APP_VERSION, term, ['students']);
      expect(result.ok, `term 거부되어야 함: ${term}`).toBe(false);
    }
    const badKeys = ['../evil', 'obs-attachments/../evil', 'a/b/c', '/etc/passwd', 'manifest'];
    for (const key of badKeys) {
      const result = createArchive(userData, APP_VERSION, '2026-1', [key]);
      expect(result.ok, `fileKey 거부되어야 함: ${key}`).toBe(false);
    }
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2026-1'))).toBe(false);
    expectLiveUnchanged(before);
  });

  test('원본 JSON 손상 → {ok:false} + 최종 위치·스테이징 잔재 없음 + 라이브 무변경 (AC-1)', () => {
    fs.writeFileSync(path.join(userData, 'data', 'broken.json'), '{oops', 'utf-8');
    const before = liveSnapshot();
    const result = createArchive(userData, APP_VERSION, '2026-1', ['students', 'broken']);
    expect(result.ok).toBe(false);
    const archivesRoot = path.join(userData, 'data', 'archives');
    expect(fs.existsSync(path.join(archivesRoot, '2026-1'))).toBe(false);
    if (fs.existsSync(archivesRoot)) {
      expect(fs.readdirSync(archivesRoot)).toEqual([]); // 스테이징 정리 확인
    }
    expectLiveUnchanged(before);
  });

  test('쓰기 실패 주입(archives 자리에 파일) → {ok:false} + 라이브 무변경 (AC-1)', () => {
    // data/archives 경로에 "파일"을 만들어 mkdir가 실패하게 한다 — 디스크 오류 모의
    fs.writeFileSync(path.join(userData, 'data', 'archives'), 'not-a-dir', 'utf-8');
    const before = liveSnapshot();
    const result = createArchive(userData, APP_VERSION, '2026-1', ['students']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('보관함 생성에 실패했어요');
    expectLiveUnchanged(before);
  });

  test('F10a: 같은 학기 재보관은 새 회차 디렉토리를 만든다(불변 유지·막다른 길 해소)', () => {
    const first = createArchive(userData, APP_VERSION, '2026-1', ['students']);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.archiveId).toBe('2026-1');
    expect(first.round).toBe(1);

    // 라이브를 다시 채우고(복원 후 재마무리 시나리오) 2회차 보관
    fs.writeFileSync(
      path.join(userData, 'data', 'students.json'),
      JSON.stringify([{ id: 's2' }], null, 2),
      'utf-8',
    );
    const second = createArchive(userData, APP_VERSION, '2026-1', ['students']);
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    expect(second.archiveId).toBe('2026-1-2');
    expect(second.round).toBe(2);

    const third = createArchive(userData, APP_VERSION, '2026-1', ['students']);
    expect(third.ok && third.archiveId).toBe('2026-1-3');

    // 디렉토리 3개가 독립 존재하고, 1회차 사본은 덮이지 않았다(불변 계약)
    const root = path.join(userData, 'data', 'archives');
    expect(fs.readdirSync(root).sort()).toEqual(['2026-1', '2026-1-2', '2026-1-3']);
    expect(fs.readFileSync(path.join(root, '2026-1', 'students.json'), 'utf-8')).toBe(
      STUDENTS_JSON,
    );

    // 목록: 학기 내림차순 → 회차 내림차순(최신 보관이 위) + term/round 분리
    const listed = listArchives(userData);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.archives.map((a) => a.archiveId)).toEqual(['2026-1-3', '2026-1-2', '2026-1']);
    expect(listed.archives.every((a) => a.term === '2026-1')).toBe(true);
    expect(listed.archives.map((a) => a.round)).toEqual([3, 2, 1]);

    // 각 회차가 독립적으로 열람/삭제된다
    const read2 = readArchiveFile(userData, '2026-1-2', 'students.json');
    expect(read2.ok && JSON.parse(read2.content)).toEqual([{ id: 's2' }]);
    expect(deleteArchive(userData, '2026-1-2')).toEqual({ ok: true, existed: true });
    expect(fs.existsSync(path.join(root, '2026-1'))).toBe(true);
    expect(fs.existsSync(path.join(root, '2026-1-3'))).toBe(true);
  });

  test('F10a: 회차 매니페스트가 term(논리 학기)과 archiveId(디렉토리)를 분리 보관한다', () => {
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    const read = readArchiveFile(userData, '2026-1-2', ARCHIVE_MANIFEST_FILENAME);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const manifest = JSON.parse(read.content) as { term: string; archiveId?: string };
    expect(manifest.term).toBe('2026-1');
    expect(manifest.archiveId).toBe('2026-1-2');
  });
});

describe('listArchives', () => {
  test('아카이브 0개 → 빈 목록 (오류 아님)', () => {
    const result = listArchives(userData);
    expect(result).toEqual({ ok: true, archives: [] });
  });

  test('학기별 요약을 최신 학기부터 반환하고, 손상 매니페스트는 숨기지 않고 표시한다', () => {
    expect(createArchive(userData, APP_VERSION, '2025-2', ['students']).ok).toBe(true);
    expect(
      createArchive(userData, APP_VERSION, '2026-1', ['students', 'teaching-classes']).ok,
    ).toBe(true);
    // 손상 아카이브 시드
    const brokenDir = path.join(userData, 'data', 'archives', '2024-1');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, ARCHIVE_MANIFEST_FILENAME), '{oops', 'utf-8');

    const result = listArchives(userData);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.archives.map((a) => a.term)).toEqual(['2026-1', '2025-2', '2024-1']);
    const ok2026 = result.archives.find((a) => a.term === '2026-1');
    expect(ok2026?.manifestOk).toBe(true);
    expect(ok2026?.entryCount).toBe(2);
    expect(ok2026?.label).toBe('2026학년도 1학기');
    const broken = result.archives.find((a) => a.term === '2024-1');
    expect(broken?.manifestOk).toBe(false);
    expect(broken?.error).toBeTruthy();
  });
});

describe('readArchiveFile', () => {
  test('체크섬 불일치(파일 변조) → {ok:false} (AC-3)', () => {
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    const target = path.join(userData, 'data', 'archives', '2026-1', 'students.json');
    fs.writeFileSync(target, '{"students":[]}', 'utf-8'); // 변조
    const result = readArchiveFile(userData, '2026-1', 'students.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('체크섬');
  });

  test('매니페스트에 없는 파일·traversal 경로는 거부한다 (AC-2)', () => {
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    expect(readArchiveFile(userData, '2026-1', 'teaching-classes.json').ok).toBe(false);
    for (const bad of ['../../settings.json', '..', 'obs-attachments/../x', '/abs']) {
      expect(readArchiveFile(userData, '2026-1', bad).ok, `거부되어야 함: ${bad}`).toBe(false);
    }
    expect(readArchiveFile(userData, '../evil', 'students.json').ok).toBe(false);
  });

  test('manifest.json 자체 읽기는 유효성 검증 후 반환한다', () => {
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    const result = readArchiveFile(userData, '2026-1', ARCHIVE_MANIFEST_FILENAME);
    expect(result.ok).toBe(true);
    if (result.ok) expect(validateArchiveManifest(JSON.parse(result.content)).ok).toBe(true);
  });
});

describe('deleteArchive', () => {
  test('해당 학기 디렉토리만 지우고 라이브·다른 학기는 무변경', () => {
    expect(createArchive(userData, APP_VERSION, '2025-2', ['students']).ok).toBe(true);
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    const before = liveSnapshot();
    const result = deleteArchive(userData, '2025-2');
    expect(result).toEqual({ ok: true, existed: true });
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2025-2'))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'data', 'archives', '2026-1'))).toBe(true);
    expectLiveUnchanged(before);
  });

  test('없는 학기는 existed:false, traversal은 거부', () => {
    expect(deleteArchive(userData, '2030-1')).toEqual({ ok: true, existed: false });
    for (const bad of ['../data', '..', 'a/b']) {
      expect(deleteArchive(userData, bad).ok, `거부되어야 함: ${bad}`).toBe(false);
    }
    // traversal 거부가 실제로 아무것도 지우지 않았는지
    expect(fs.existsSync(path.join(userData, 'data', 'students.json'))).toBe(true);
  });
});

describe('collect/restoreArchivesSection — 수동 백업 왕복 (S2.1b)', () => {
  test('두 학년도 수집 → 다른 PC(빈 userData) 복원 → 바이트 동일 + 체크섬 검증 통과 (AC-1·AC-2)', () => {
    expect(createArchive(userData, APP_VERSION, '2025-2', ['teaching-classes']).ok).toBe(true);
    expect(
      createArchive(userData, APP_VERSION, '2026-1', ['students', 'obs-attachments/att-1.png']).ok,
    ).toBe(true);
    const collected = collectArchivesSection(userData);
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    expect(collected.termCount).toBe(2); // 두 학년도 모두 백업에 담긴다 (S2.1b AC-1)
    expect(Object.keys(collected.archives).sort()).toEqual(['2025-2', '2026-1']);
    expect(collected.totalBytes).toBeGreaterThan(0); // export 예상 크기 정보

    // "다른 PC" — 아카이브가 없는 새 userData에 복원
    const otherPc = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-otherpc-'));
    try {
      const restored = restoreArchivesSection(otherPc, collected.archives);
      expect(restored.ok, JSON.stringify(restored)).toBe(true);
      if (!restored.ok) return;
      expect([...restored.restoredTerms].sort()).toEqual(['2025-2', '2026-1']);
      expect(restored.skippedTerms).toEqual([]);

      // 바이트 동일 — 복원 후에도 매니페스트 체크섬이 그대로 맞아야 한다
      const srcBytes = fs.readFileSync(
        path.join(userData, 'data', 'archives', '2026-1', 'students.json'),
      );
      const dstBytes = fs.readFileSync(
        path.join(otherPc, 'data', 'archives', '2026-1', 'students.json'),
      );
      expect(dstBytes.equals(srcBytes)).toBe(true);
      const binRestored = readArchiveFile(otherPc, '2026-1', 'obs-attachments/att-1.png');
      expect(binRestored.ok).toBe(true); // 체크섬 검증 경유 — 불일치면 실패했을 것
      const listed = listArchives(otherPc);
      expect(listed.ok && listed.archives[0]?.manifestOk).toBe(true);
    } finally {
      fs.rmSync(otherPc, { recursive: true, force: true });
    }
  });

  test('이미 있는 학기는 덮어쓰지 않고 건너뛴다(아카이브 불변)', () => {
    expect(createArchive(userData, APP_VERSION, '2026-1', ['students']).ok).toBe(true);
    const collected = collectArchivesSection(userData);
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    const localBytes = fs.readFileSync(
      path.join(userData, 'data', 'archives', '2026-1', 'students.json'),
    );
    const restored = restoreArchivesSection(userData, collected.archives);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.restoredTerms).toEqual([]);
    expect(restored.skippedTerms).toEqual(['2026-1']);
    expect(
      fs
        .readFileSync(path.join(userData, 'data', 'archives', '2026-1', 'students.json'))
        .equals(localBytes),
    ).toBe(true);
  });

  test('불량 섹션(traversal 등)은 아무것도 쓰지 않고 거부한다', () => {
    const bad = { '../evil': { 'students.json': { format: 'utf8' as const, content: '{}' } } };
    const result = restoreArchivesSection(userData, bad);
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(userData, 'data', 'archives'))).toBe(false);
  });

  test('아카이브가 하나도 없으면 빈 섹션 (백업에 archives 미포함 경로)', () => {
    const collected = collectArchivesSection(userData);
    expect(collected).toEqual({ ok: true, archives: {}, termCount: 0, totalBytes: 0 });
  });
});
