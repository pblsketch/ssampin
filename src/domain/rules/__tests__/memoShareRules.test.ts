import { describe, it, expect } from 'vitest';
import type { Memo } from '@domain/entities/Memo';
import type { MemoImage } from '@domain/valueObjects/MemoImage';
import type { MemoShareBoard, MemoShareItemLink } from '@domain/entities/MemoShareBoard';
import {
  MAX_ITEMS,
  buildShareUrl,
  splitDataUrl,
  computeItemHash,
  buildBoardFile,
  extractImageUploads,
  diffForSync,
  parseBoardFile,
} from '../memoShareRules';

// ============================================================
// 테스트 픽스처
// ============================================================

const NOW = '2026-06-11T09:00:00.000Z';

function mkImage(overrides: Partial<MemoImage> = {}): MemoImage {
  return {
    dataUrl: 'data:image/png;base64,QUFBQQ==',
    fileName: 'photo.png',
    mimeType: 'image/png',
    width: 400,
    height: 300,
    originalSize: 1234,
    ...overrides,
  };
}

function mkMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: 'memo-1',
    content: '내일 준비물: 색연필',
    color: 'yellow',
    x: 100,
    y: 200,
    width: 280,
    height: 220,
    rotation: 1,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    archived: false,
    fontSize: 'base',
    ...overrides,
  };
}

function mkLink(memo: Memo, overrides: Partial<MemoShareItemLink> = {}): MemoShareItemLink {
  return {
    memoId: memo.id,
    sortOrder: 0,
    lastSyncedAt: NOW,
    lastSyncedHash: computeItemHash(memo),
    ...overrides,
  };
}

function mkBoard(items: readonly MemoShareItemLink[]): MemoShareBoard {
  return {
    id: 'drive-file-id-123',
    title: '우리 반 메모',
    shareUrl: buildShareUrl('drive-file-id-123'),
    items,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ============================================================
// computeItemHash
// ============================================================

describe('computeItemHash', () => {
  it('동일 입력이면 동일 해시를 반환한다', () => {
    const a = mkMemo();
    const b = mkMemo();
    expect(computeItemHash(a)).toBe(computeItemHash(b));
  });

  it('content·color·fontSize 변경 시 해시가 달라진다', () => {
    const base = mkMemo();
    expect(computeItemHash(mkMemo({ content: '다른 내용' }))).not.toBe(computeItemHash(base));
    expect(computeItemHash(mkMemo({ color: 'pink' }))).not.toBe(computeItemHash(base));
    expect(computeItemHash(mkMemo({ fontSize: 'xl' }))).not.toBe(computeItemHash(base));
  });

  it('이미지 변경 시 해시가 달라진다 (추가·교체·제거)', () => {
    const noImage = mkMemo();
    const withImage = mkMemo({ image: mkImage() });
    const replacedImage = mkMemo({
      image: mkImage({ dataUrl: 'data:image/jpeg;base64,QkJCQg==' }),
    });
    expect(computeItemHash(withImage)).not.toBe(computeItemHash(noImage));
    expect(computeItemHash(replacedImage)).not.toBe(computeItemHash(withImage));
  });

  it('위치(x,y)·rotation·archived·크기 변경은 해시에 영향이 없다', () => {
    const base = mkMemo();
    const moved = mkMemo({
      x: 999,
      y: -50,
      rotation: -3,
      archived: true,
      width: 500,
      height: 400,
      updatedAt: '2026-06-12T00:00:00.000Z',
    });
    expect(computeItemHash(moved)).toBe(computeItemHash(base));
  });
});

// ============================================================
// splitDataUrl
// ============================================================

describe('splitDataUrl', () => {
  it('dataUrl을 mime/base64로 분리한다', () => {
    expect(splitDataUrl('data:image/png;base64,QUFBQQ==')).toEqual({
      mime: 'image/png',
      base64: 'QUFBQQ==',
    });
  });

  it('dataUrl 형식이 아니면 null을 반환한다', () => {
    expect(splitDataUrl('https://example.com/a.png')).toBeNull();
    expect(splitDataUrl('data:image/png;base64,')).toBeNull();
    expect(splitDataUrl('')).toBeNull();
  });
});

// ============================================================
// buildBoardFile
// ============================================================

describe('buildBoardFile', () => {
  it('memo → 스냅샷 매핑: dataUrl 미포함 + image.fileId는 빈 문자열 자리', () => {
    const memos = [mkMemo({ id: 'm1', image: mkImage() }), mkMemo({ id: 'm2', content: '둘째' })];
    const file = buildBoardFile(memos, '우리 반 메모', NOW);

    expect(file.version).toBe(1);
    expect(file.title).toBe('우리 반 메모');
    expect(file.updatedAt).toBe(NOW);
    expect(file.items).toHaveLength(2);

    const first = file.items[0]!;
    expect(first.id).toBe('m1');
    expect(first.content).toBe('내일 준비물: 색연필');
    expect(first.color).toBe('yellow');
    expect(first.fontSize).toBe('base');
    expect(first.image).toEqual({ fileId: '', width: 400, height: 300 });
    // dataUrl·파일명 등 이미지 원본 데이터는 스냅샷에 포함되지 않는다
    expect(JSON.stringify(file)).not.toContain('base64');

    const second = file.items[1]!;
    expect(second.image).toBeUndefined();
  });

  it('위치(x/y)·rotation·archived는 스냅샷에 포함하지 않는다', () => {
    const file = buildBoardFile([mkMemo()], '제목', NOW);
    const json = JSON.stringify(file);
    expect(json).not.toContain('"x"');
    expect(json).not.toContain('"rotation"');
    expect(json).not.toContain('"archived"');
  });

  it('sortOrder는 전달 순서를 따른다', () => {
    const memos = [mkMemo({ id: 'b' }), mkMemo({ id: 'a' }), mkMemo({ id: 'c' })];
    const file = buildBoardFile(memos, '제목', NOW);
    expect(file.items.map((item) => [item.id, item.sortOrder])).toEqual([
      ['b', 0],
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('MAX_ITEMS(50) 초과 시 Error를 던진다', () => {
    const memos = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => mkMemo({ id: `m${i}` }));
    expect(() => buildBoardFile(memos, '제목', NOW)).toThrow();
    // 정확히 50개는 허용
    expect(buildBoardFile(memos.slice(0, MAX_ITEMS), '제목', NOW).items).toHaveLength(MAX_ITEMS);
  });
});

// ============================================================
// extractImageUploads
// ============================================================

describe('extractImageUploads', () => {
  it('이미지 있는 메모만 업로드 목록으로 추출한다', () => {
    const memos = [
      mkMemo({ id: 'm1', image: mkImage() }),
      mkMemo({ id: 'm2' }),
      mkMemo({ id: 'm3', image: mkImage({ dataUrl: 'data:image/webp;base64,Q0NDQw==' }) }),
    ];
    expect(extractImageUploads(memos)).toEqual([
      { itemId: 'm1', dataUrl: 'data:image/png;base64,QUFBQQ==', mime: 'image/png' },
      { itemId: 'm3', dataUrl: 'data:image/webp;base64,Q0NDQw==', mime: 'image/webp' },
    ]);
  });

  it('dataUrl이 손상되었거나 허용 mime이 아니면 제외한다', () => {
    const memos = [
      mkMemo({ id: 'm1', image: mkImage({ dataUrl: 'broken' }) }),
      mkMemo({ id: 'm2', image: mkImage({ dataUrl: 'data:image/gif;base64,QUFBQQ==' }) }),
    ];
    expect(extractImageUploads(memos)).toEqual([]);
  });
});

// ============================================================
// diffForSync
// ============================================================

describe('diffForSync', () => {
  it('변경 없음 → needsJsonUpload=false, 업로드/삭제 목록 비어 있음', () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);
    const diff = diffForSync(board, [memo]);
    expect(diff).toEqual({ imagesToUpload: [], imageFileIdsToDelete: [], needsJsonUpload: false });
  });

  it('위치(x/y)·rotation만 변경 → 변경 없음으로 판정한다', () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);
    const moved = mkMemo({ id: 'm1', x: 777, y: 888, rotation: -2 });
    expect(diffForSync(board, [moved]).needsJsonUpload).toBe(false);
  });

  it('텍스트만 변경 → JSON 재업로드만 (이미지 업로드/삭제 없음)', () => {
    const memo = mkMemo({ id: 'm1', image: mkImage() });
    const board = mkBoard([mkLink(memo, { sortOrder: 0, imageFileId: 'img-file-1' })]);
    const edited = mkMemo({ id: 'm1', image: mkImage(), content: '수정된 내용' });
    const diff = diffForSync(board, [edited]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([]);
    expect(diff.imageFileIdsToDelete).toEqual([]);
  });

  it('항목 추가 → 신규 이미지 업로드 목록 + JSON 재업로드', () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);
    const added = mkMemo({ id: 'm2', image: mkImage() });
    const diff = diffForSync(board, [memo, added]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([
      { itemId: 'm2', dataUrl: 'data:image/png;base64,QUFBQQ==', mime: 'image/png' },
    ]);
    expect(diff.imageFileIdsToDelete).toEqual([]);
  });

  it('항목 제거 → 해당 imageFileId 삭제 목록 + JSON 재업로드', () => {
    const kept = mkMemo({ id: 'm1' });
    const removed = mkMemo({ id: 'm2', image: mkImage() });
    const board = mkBoard([
      mkLink(kept, { sortOrder: 0 }),
      mkLink(removed, { sortOrder: 1, imageFileId: 'img-file-2' }),
    ]);
    const diff = diffForSync(board, [kept]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([]);
    expect(diff.imageFileIdsToDelete).toEqual(['img-file-2']);
  });

  it('이미지 교체 → 신규 업로드 + 기존 fileId 삭제', () => {
    const memo = mkMemo({ id: 'm1', image: mkImage() });
    const board = mkBoard([mkLink(memo, { sortOrder: 0, imageFileId: 'img-old' })]);
    const replaced = mkMemo({
      id: 'm1',
      image: mkImage({ dataUrl: 'data:image/jpeg;base64,QkJCQg==' }),
    });
    const diff = diffForSync(board, [replaced]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([
      { itemId: 'm1', dataUrl: 'data:image/jpeg;base64,QkJCQg==', mime: 'image/jpeg' },
    ]);
    expect(diff.imageFileIdsToDelete).toEqual(['img-old']);
  });

  it('이미지 제거(메모는 유지) → 기존 fileId만 삭제', () => {
    const memo = mkMemo({ id: 'm1', image: mkImage() });
    const board = mkBoard([mkLink(memo, { sortOrder: 0, imageFileId: 'img-old' })]);
    const withoutImage = mkMemo({ id: 'm1' });
    const diff = diffForSync(board, [withoutImage]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([]);
    expect(diff.imageFileIdsToDelete).toEqual(['img-old']);
  });

  it('순서만 변경 → JSON 재업로드 (이미지 증분 없음)', () => {
    const first = mkMemo({ id: 'm1' });
    const second = mkMemo({ id: 'm2', content: '둘째' });
    const board = mkBoard([mkLink(first, { sortOrder: 0 }), mkLink(second, { sortOrder: 1 })]);
    const diff = diffForSync(board, [second, first]);
    expect(diff.needsJsonUpload).toBe(true);
    expect(diff.imagesToUpload).toEqual([]);
    expect(diff.imageFileIdsToDelete).toEqual([]);
  });
});

// ============================================================
// parseBoardFile
// ============================================================

describe('parseBoardFile', () => {
  const validItem = {
    id: 'm1',
    content: '내용',
    color: 'yellow',
    fontSize: 'base',
    sortOrder: 0,
    updatedAt: NOW,
  };
  const validFile = { version: 1, title: '우리 반 메모', updatedAt: NOW, items: [validItem] };

  it('유효한 보드 JSON을 파싱한다 (이미지 포함)', () => {
    const withImage = {
      ...validFile,
      items: [{ ...validItem, image: { fileId: 'img-1', width: 400, height: 300 } }],
    };
    const parsed = parseBoardFile(withImage);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]!.image).toEqual({ fileId: 'img-1', width: 400, height: 300 });
  });

  it('version이 1이 아니면 거부한다', () => {
    expect(parseBoardFile({ ...validFile, version: 2 })).toBeNull();
    expect(parseBoardFile({ ...validFile, version: '1' })).toBeNull();
  });

  it('필수 필드 누락 시 거부한다', () => {
    expect(parseBoardFile({ version: 1, updatedAt: NOW, items: [] })).toBeNull(); // title 누락
    expect(parseBoardFile({ version: 1, title: 't', items: [] })).toBeNull(); // updatedAt 누락
    expect(parseBoardFile({ version: 1, title: 't', updatedAt: NOW })).toBeNull(); // items 누락
    expect(
      parseBoardFile({ ...validFile, items: [{ ...validItem, content: undefined }] }),
    ).toBeNull();
  });

  it('enum 위반(color·fontSize) 시 거부한다', () => {
    expect(parseBoardFile({ ...validFile, items: [{ ...validItem, color: 'purple' }] })).toBeNull();
    expect(
      parseBoardFile({ ...validFile, items: [{ ...validItem, fontSize: 'huge' }] }),
    ).toBeNull();
  });

  it('객체가 아니거나 items가 배열이 아니면 거부한다', () => {
    expect(parseBoardFile(null)).toBeNull();
    expect(parseBoardFile('문자열')).toBeNull();
    expect(parseBoardFile({ ...validFile, items: '배열 아님' })).toBeNull();
  });

  it('MAX_ITEMS(50) 초과 시 거부한다', () => {
    const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({
      ...validItem,
      id: `m${i}`,
      sortOrder: i,
    }));
    expect(parseBoardFile({ ...validFile, items: tooMany })).toBeNull();
    expect(parseBoardFile({ ...validFile, items: tooMany.slice(0, MAX_ITEMS) })).not.toBeNull();
  });
});

// ============================================================
// buildShareUrl
// ============================================================

describe('buildShareUrl', () => {
  it('ssampin.com/memo/{fileId} 형식의 URL을 만든다', () => {
    expect(buildShareUrl('abc123')).toBe('https://ssampin.com/memo/abc123');
  });
});

// ============================================================
// ttsVoice · attention (주목/낭독 신호 — 선택 필드, 하위 호환)
// ============================================================

describe('parseBoardFile — ttsVoice/attention 선택 필드', () => {
  const item = {
    id: 'm1',
    content: '내용',
    color: 'yellow',
    fontSize: 'base',
    sortOrder: 0,
    updatedAt: '2026-06-12T00:00:00.000Z',
  };
  const base = { version: 1, title: '보드', updatedAt: '2026-06-12T00:00:00.000Z', items: [item] };

  it('ttsVoice male/female을 보존하고, 그 외 값은 필드만 무시한다(보드는 유효)', () => {
    expect(parseBoardFile({ ...base, ttsVoice: 'male' })?.ttsVoice).toBe('male');
    expect(parseBoardFile({ ...base, ttsVoice: 'female' })?.ttsVoice).toBe('female');
    const dropped = parseBoardFile({ ...base, ttsVoice: 'robot' });
    expect(dropped).not.toBeNull();
    expect(dropped?.ttsVoice).toBeUndefined();
  });

  it('유효한 attention(chime/tts)을 보존한다', () => {
    const chime = { kind: 'chime', requestedAt: '2026-06-12T01:00:00.000Z', nonce: 'n-1' };
    expect(parseBoardFile({ ...base, attention: chime })?.attention).toEqual(chime);
    const tts = {
      kind: 'tts',
      itemId: 'm1',
      requestedAt: '2026-06-12T01:00:00.000Z',
      nonce: 'n-2',
    };
    expect(parseBoardFile({ ...base, attention: tts })?.attention).toEqual(tts);
  });

  it('깨진 attention은 필드만 무시한다 — tts인데 itemId 없음 / nonce 빈 값 / kind 불명', () => {
    const cases = [
      { kind: 'tts', requestedAt: '2026-06-12T01:00:00.000Z', nonce: 'n-3' },
      { kind: 'chime', requestedAt: '2026-06-12T01:00:00.000Z', nonce: '' },
      { kind: 'siren', requestedAt: '2026-06-12T01:00:00.000Z', nonce: 'n-4' },
      '문자열',
    ];
    for (const attention of cases) {
      const parsed = parseBoardFile({ ...base, attention });
      expect(parsed).not.toBeNull();
      expect(parsed?.attention).toBeUndefined();
    }
  });
});

describe('buildBoardFile — extras(ttsVoice/attention)', () => {
  const memo: Memo = {
    id: 'm1',
    content: '내용',
    color: 'yellow',
    x: 0,
    y: 0,
    width: 280,
    height: 220,
    rotation: 0,
    createdAt: '2026-06-12T00:00:00.000Z',
    updatedAt: '2026-06-12T00:00:00.000Z',
    archived: false,
    fontSize: 'base',
  };

  it('extras 미전달 시 ttsVoice/attention 키 자체가 없다 (구버전 페이지 호환)', () => {
    const file = buildBoardFile([memo], '보드', '2026-06-12T02:00:00.000Z');
    expect('ttsVoice' in file).toBe(false);
    expect('attention' in file).toBe(false);
  });

  it('extras를 그대로 싣고, 산출물이 parseBoardFile 라운드트립을 통과한다', () => {
    const attention = {
      kind: 'tts' as const,
      itemId: 'm1',
      requestedAt: '2026-06-12T02:00:00.000Z',
      nonce: 'n-5',
    };
    const file = buildBoardFile([memo], '보드', '2026-06-12T02:00:00.000Z', {
      ttsVoice: 'male',
      attention,
    });
    expect(file.ttsVoice).toBe('male');
    expect(file.attention).toEqual(attention);
    const roundTrip = parseBoardFile(JSON.parse(JSON.stringify(file)));
    expect(roundTrip?.ttsVoice).toBe('male');
    expect(roundTrip?.attention).toEqual(attention);
  });
});
