/**
 * BoardSnapshotCodec 라운드트립 테스트 (PDCA-4 / G006)
 *
 * "내 템플릿"의 핵심 보증: 보드 스냅샷 → 요소 추출 → 새 스냅샷 재시딩이
 * 요소를 verbatim 보존(id 포함 — containerId/boundElements 참조 유지)하고,
 * isDeleted 잔재는 싣지 않으며, pos 키는 fractional-indexing 호환이어야 한다.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import { BoardSnapshotCodec } from './boardSnapshotCodec';
import { BoardTemplateSeeder } from './BoardTemplateSeeder';

const codec = new BoardSnapshotCodec();
const seeder = new BoardTemplateSeeder();

function makeElement(id: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    isDeleted: false,
    version: 3,
    customData: { authorAwarenessId: 'aw-1', authorName: '김민수' },
    ...extra,
  };
}

describe('BoardSnapshotCodec — extract ↔ build 라운드트립', () => {
  it('요소를 id 포함 verbatim 으로 보존한다 (재시딩 후 동일)', () => {
    const elements = [
      makeElement('el-a'),
      makeElement('el-b', { boundElements: [{ id: 'el-c', type: 'text' }] }),
      makeElement('el-c', { type: 'text', containerId: 'el-b', text: '라벨' }),
    ];
    const snapshot = codec.buildSnapshot(elements);
    const out = codec.extractElements(snapshot);
    expect(out).toEqual(elements);
    // bound text 참조가 살아있는지 명시 확인
    const text = out.find((el) => el.id === 'el-c');
    expect(text?.containerId).toBe('el-b');
  });

  it('isDeleted=true 요소는 추출에서 제외한다', () => {
    const snapshot = codec.buildSnapshot([
      makeElement('alive'),
      makeElement('ghost', { isDeleted: true }),
    ]);
    const out = codec.extractElements(snapshot);
    expect(out.map((el) => el.id)).toEqual(['alive']);
  });

  it('빈 배열도 유효한 빈 스냅샷을 만든다', () => {
    const snapshot = codec.buildSnapshot([]);
    expect(codec.extractElements(snapshot)).toEqual([]);
  });

  it('pos 키는 정렬·고유·fractional-indexing 호환이다', () => {
    const snapshot = codec.buildSnapshot(
      Array.from({ length: 100 }, (_, i) => makeElement(`el-${i}`)),
    );
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot);
    const keys = doc
      .getArray<Y.Map<unknown>>('elements')
      .toArray()
      .map((m) => m.get('pos') as string);
    expect(new Set(keys).size).toBe(100);
    expect([...keys].sort()).toEqual(keys);
    const next = generateKeyBetween(keys[keys.length - 1]!, null);
    expect(next > keys[keys.length - 1]!).toBe(true);
  });

  it('추출은 pos 정렬 순서를 따른다 (배열 삽입 순서가 아니라)', () => {
    // 일부러 pos 역순으로 직접 패킹
    const doc = new Y.Doc();
    const yElements = doc.getArray<Y.Map<unknown>>('elements');
    const keys = generateNKeysBetween(null, null, 2);
    doc.transact(() => {
      yElements.push([
        new Y.Map<unknown>(Object.entries({ pos: keys[1], el: makeElement('second') })),
        new Y.Map<unknown>(Object.entries({ pos: keys[0], el: makeElement('first') })),
      ]);
    });
    const out = codec.extractElements(Y.encodeStateAsUpdate(doc));
    expect(out.map((el) => el.id)).toEqual(['first', 'second']);
  });

  it('내장 템플릿 시더 산출물도 그대로 추출·재시딩된다 (시더 ↔ 코덱 정합)', () => {
    const seeded = seeder.buildInitialSnapshot('mandalart') as Uint8Array;
    const elements = codec.extractElements(seeded);
    expect(elements).toHaveLength(81);
    const rebuilt = codec.buildSnapshot(elements);
    expect(codec.extractElements(rebuilt)).toEqual(elements);
  });
});
