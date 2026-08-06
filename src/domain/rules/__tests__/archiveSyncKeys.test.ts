/**
 * 아카이브 Drive 동기화 키(S4.1) — build/parse 왕복·화이트리스트 검증.
 */
import { describe, expect, it } from 'vitest';
import { ARCHIVE_SYNC_KEY_PREFIX, buildArchiveSyncKey, parseArchiveSyncKey } from '../archiveRules';

describe('buildArchiveSyncKey / parseArchiveSyncKey', () => {
  it('데이터·바이너리 relPath 왕복이 보존된다', () => {
    const dataKey = buildArchiveSyncKey('2026-1', 'students.json');
    expect(dataKey).toBe('archives/2026-1/students.json');
    expect(parseArchiveSyncKey(dataKey ?? '')).toEqual({
      term: '2026-1',
      relPath: 'students.json',
    });

    const binKey = buildArchiveSyncKey('2026-1', 'obs-attachments/x.png');
    expect(binKey).toBe('archives/2026-1/obs-attachments/x.png');
    expect(parseArchiveSyncKey(binKey ?? '')).toEqual({
      term: '2026-1',
      relPath: 'obs-attachments/x.png',
    });
  });

  it('불량 term·relPath는 build가 null을 돌려준다', () => {
    expect(buildArchiveSyncKey('../evil', 'students.json')).toBeNull();
    expect(buildArchiveSyncKey('2026-1', '../evil.json')).toBeNull();
    expect(buildArchiveSyncKey('2026-1', 'stickers/x.png')).toBeNull(); // 비화이트리스트 루트
    expect(buildArchiveSyncKey('', 'students.json')).toBeNull();
  });

  it('parse는 접두어·term·relPath 전부 검증한다(traversal·형식 불량 = null)', () => {
    expect(parseArchiveSyncKey('students.json')).toBeNull(); // 접두어 없음
    expect(parseArchiveSyncKey('archives/2026-1')).toBeNull(); // relPath 없음
    expect(parseArchiveSyncKey('archives/../evil/students.json')).toBeNull();
    expect(parseArchiveSyncKey('archives/2026-1/../evil.json')).toBeNull();
    expect(parseArchiveSyncKey('archives/2026-1/a/b/c')).toBeNull(); // 비화이트리스트 루트 3세그먼트
    expect(parseArchiveSyncKey('archives/2026-1/.staging-1')).toBeNull();
    expect(parseArchiveSyncKey('note-body--x')).toBeNull();
  });

  it('접두어 상수는 다른 동적 파일군(note-body--, obs-attachments/)과 겹치지 않는다', () => {
    expect(ARCHIVE_SYNC_KEY_PREFIX).toBe('archives/');
    expect('note-body--x'.startsWith(ARCHIVE_SYNC_KEY_PREFIX)).toBe(false);
    expect('obs-attachments/x.png'.startsWith(ARCHIVE_SYNC_KEY_PREFIX)).toBe(false);
  });
});
