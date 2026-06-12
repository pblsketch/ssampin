/**
 * boardSnapshotCodec — 보드 Y.Doc 스냅샷 ↔ Excalidraw 요소 배열 (PDCA-4 / G006)
 *
 * y-excalidraw 2.0.12 저장 형식(ADR-012, SP-2 확정): Y.Array('elements') 안에
 * Y.Map { pos: fractional-index 문자열, el: 요소 평면 객체 }.
 *
 * - extractElements: 학생 페이지의 yjsToExcalidraw 와 동일하게 pos 정렬 후
 *   el 을 꺼낸다. isDeleted=true(soft delete 잔재)는 템플릿에 싣지 않는다.
 * - buildSnapshot: 요소를 verbatim 으로 새 Y.Doc 에 패킹. pos 는 반드시
 *   fractional-indexing 유효 키 — 클라이언트가 이후 요소를 추가할 때
 *   `generateKeyBetween(마지막 pos, null)` 을 호출하므로 임의 문자열 금지.
 *
 * BoardTemplateSeeder(내장 템플릿)와 ManageUserTemplates(내 템플릿)가 공유.
 */
import * as Y from 'yjs';
import { generateNKeysBetween } from 'fractional-indexing';

import type { OpaqueBoardElement } from '@domain/entities/UserTemplate';
import type { IBoardSnapshotCodec } from '@domain/ports/IBoardSnapshotCodec';

export class BoardSnapshotCodec implements IBoardSnapshotCodec {
  extractElements(snapshot: Uint8Array): OpaqueBoardElement[] {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, snapshot);
      const maps = doc.getArray<Y.Map<unknown>>('elements').toArray();
      return [...maps]
        .sort((a, b) => {
          const k1 = String(a.get('pos') ?? '');
          const k2 = String(b.get('pos') ?? '');
          return k1 > k2 ? 1 : k1 < k2 ? -1 : 0;
        })
        .map((m) => m.get('el') as OpaqueBoardElement)
        .filter((el) => el != null && typeof el === 'object' && el.isDeleted !== true);
    } finally {
      doc.destroy();
    }
  }

  buildSnapshot(elements: ReadonlyArray<OpaqueBoardElement>): Uint8Array {
    const doc = new Y.Doc();
    try {
      const yElements = doc.getArray<Y.Map<unknown>>('elements');
      if (elements.length > 0) {
        doc.transact(() => {
          const keys = generateNKeysBetween(null, null, elements.length);
          yElements.push(
            elements.map((el, i) => new Y.Map<unknown>(Object.entries({ pos: keys[i], el }))),
          );
        });
      }
      return Y.encodeStateAsUpdate(doc);
    } finally {
      doc.destroy();
    }
  }
}
