/**
 * BoardTemplateSeeder 라운드트립 테스트 (PDCA-3 / G005, ADR-012)
 *
 * 시더가 만든 스냅샷을 새 Y.Doc 에 적용해 학생 페이지의 yjsToExcalidraw 와
 * 동일한 방식으로 읽어, y-excalidraw 2.0.12 저장 형식(Y.Map{pos, el})과
 * Excalidraw 0.17.6 요소 필드 완전성을 검증한다.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';
import fs from 'fs';
import path from 'path';

import { BOARD_TEMPLATE_IDS } from '@domain/entities/BoardTemplate';
import { TEMPLATE_COLORS } from '@domain/rules/boardTemplateRules';

import { BoardTemplateSeeder } from './BoardTemplateSeeder';

const seeder = new BoardTemplateSeeder();

/** 학생 페이지 y-excalidraw `yjsToExcalidraw` 와 동일한 읽기 (pos 정렬 → el) */
function readLikeClient(update: Uint8Array): {
  maps: Y.Map<unknown>[];
  elements: Record<string, unknown>[];
} {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const maps = doc.getArray<Y.Map<unknown>>('elements').toArray();
  const elements = [...maps]
    .sort((a, b) => {
      const k1 = a.get('pos') as string;
      const k2 = b.get('pos') as string;
      return k1 > k2 ? 1 : k1 < k2 ? -1 : 0;
    })
    .map((m) => m.get('el') as Record<string, unknown>);
  return { maps, elements };
}

describe('BoardTemplateSeeder — 스냅샷 생성', () => {
  it('blank 는 null (시딩 생략)', () => {
    expect(seeder.buildInitialSnapshot('blank')).toBeNull();
  });

  it('blank 외 4종 모두 비어있지 않은 스냅샷을 만든다', () => {
    for (const id of BOARD_TEMPLATE_IDS) {
      if (id === 'blank') continue;
      const update = seeder.buildInitialSnapshot(id);
      expect(update, id).not.toBeNull();
      expect((update as Uint8Array).byteLength, id).toBeGreaterThan(0);
      const { elements } = readLikeClient(update as Uint8Array);
      expect(elements.length, id).toBeGreaterThan(0);
    }
  });
});

describe('BoardTemplateSeeder — y-excalidraw 저장 형식 (SP-2 확정 형식)', () => {
  const update = seeder.buildInitialSnapshot('mandalart') as Uint8Array;
  const { maps, elements } = readLikeClient(update);

  it('만다라트는 81개 요소 (AC-3.1)', () => {
    expect(elements).toHaveLength(81);
  });

  it('각 항목은 Y.Map { pos, el } 형식이다', () => {
    for (const m of maps) {
      expect(typeof m.get('pos')).toBe('string');
      expect(typeof m.get('el')).toBe('object');
    }
  });

  it('pos 키는 전부 고유하고 사전순 정렬이 배열 순서와 일치한다', () => {
    const keys = maps.map((m) => m.get('pos') as string);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it('마지막 pos 뒤에 클라이언트가 새 키를 이어 만들 수 있다 (fractional-indexing 호환)', () => {
    const keys = maps.map((m) => m.get('pos') as string);
    const last = keys[keys.length - 1]!;
    // 학생의 첫 드로잉 시 y-excalidraw 가 호출하는 경로 — throw 없이 더 큰 키가 나와야 함
    const next = generateKeyBetween(last, null);
    expect(next > last).toBe(true);
  });

  it('요소 id 는 전부 고유하다', () => {
    const ids = elements.map((el) => el.id as string);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('BoardTemplateSeeder — Excalidraw 0.17.6 요소 필드 완전성', () => {
  /** restore() 를 거치지 않고 updateScene 으로 직행하므로 전 필드 필수 */
  const REQUIRED_BASE_FIELDS = [
    'id',
    'type',
    'x',
    'y',
    'width',
    'height',
    'angle',
    'strokeColor',
    'backgroundColor',
    'fillStyle',
    'strokeWidth',
    'strokeStyle',
    'roughness',
    'opacity',
    'groupIds',
    'frameId',
    'roundness',
    'seed',
    'version',
    'versionNonce',
    'isDeleted',
    'boundElements',
    'updated',
    'link',
    'locked',
  ] as const;

  it('모든 템플릿의 모든 요소가 기본 필드를 갖춘다', () => {
    for (const id of BOARD_TEMPLATE_IDS) {
      if (id === 'blank') continue;
      const { elements } = readLikeClient(seeder.buildInitialSnapshot(id) as Uint8Array);
      for (const el of elements) {
        for (const field of REQUIRED_BASE_FIELDS) {
          expect(field in el, `${id}: ${String(el.type)} 에 ${field} 누락`).toBe(true);
        }
        expect(el.seed as number).toBeGreaterThan(0);
        expect(el.version).toBe(1);
        expect(el.isDeleted).toBe(false);
        expect(el.groupIds).toEqual([]);
      }
    }
  });

  it('모든 템플릿 요소는 locked=true + 작성자 없음 + boardTemplate 마킹 (학생 선택 차단 정합)', () => {
    for (const id of BOARD_TEMPLATE_IDS) {
      if (id === 'blank') continue;
      const { elements } = readLikeClient(seeder.buildInitialSnapshot(id) as Uint8Array);
      for (const el of elements) {
        expect(el.locked, id).toBe(true);
        const custom = el.customData as Record<string, unknown>;
        expect(custom.boardTemplate, id).toBe(id);
        expect('authorAwarenessId' in custom, id).toBe(false);
      }
    }
  });

  it('텍스트 요소는 텍스트 전용 필드를 갖춘다', () => {
    const { elements } = readLikeClient(
      seeder.buildInitialSnapshot('group-activity') as Uint8Array,
    );
    const texts = elements.filter((el) => el.type === 'text');
    expect(texts.length).toBe(6);
    for (const t of texts) {
      expect(typeof t.text).toBe('string');
      expect(t.originalText).toBe(t.text);
      expect(t.fontFamily).toBe(1);
      expect(t.containerId).toBeNull();
      expect(t.lineHeight).toBe(1.25);
      expect(t.baseline as number).toBeGreaterThan(0);
      expect(['left', 'center']).toContain(t.textAlign);
      expect(t.verticalAlign).toBe('top');
    }
  });

  it('선형 요소(선·화살표)는 points·binding 필드를 갖춘다', () => {
    const { elements } = readLikeClient(seeder.buildInitialSnapshot('flow-diagram') as Uint8Array);
    const linear = elements.filter((el) => el.type === 'arrow' || el.type === 'line');
    expect(linear.length).toBe(3);
    for (const l of linear) {
      expect(Array.isArray(l.points)).toBe(true);
      expect((l.points as unknown[]).length).toBe(2);
      expect(l.lastCommittedPoint).toBeNull();
      expect(l.startBinding).toBeNull();
      expect(l.endBinding).toBeNull();
      expect('startArrowhead' in l).toBe(true);
      expect('endArrowhead' in l).toBe(true);
    }
  });

  it('둥근 사각형은 ADAPTIVE_RADIUS(3) roundness 를 갖는다', () => {
    const { elements } = readLikeClient(seeder.buildInitialSnapshot('flow-diagram') as Uint8Array);
    const rounded = elements.filter((el) => el.type === 'rectangle' && el.roundness !== null);
    expect(rounded.length).toBe(2); // 시작 + 끝
    for (const r of rounded) {
      expect((r.roundness as { type: number }).type).toBe(3);
    }
  });
});

describe('BoardTemplateSeeder — 디자인 토큰 hex 동기 (메타테스트)', () => {
  it('TEMPLATE_COLORS 가 index.css 라이트 테마 sp-board-* 토큰과 동기', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    const expectToken = (token: string, hex: string): void => {
      const re = new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`);
      const m = css.match(re);
      expect(m, `index.css 에 --${token} 누락`).not.toBeNull();
      expect((m as RegExpMatchArray)[1]!.toLowerCase(), token).toBe(hex.toLowerCase());
    };
    expectToken('sp-board-template-cell', TEMPLATE_COLORS.cell);
    expectToken('sp-board-group-r', TEMPLATE_COLORS.groupR);
    expectToken('sp-board-group-b', TEMPLATE_COLORS.groupB);
    expectToken('sp-board-group-y', TEMPLATE_COLORS.groupY);
    expectToken('sp-board-group-g', TEMPLATE_COLORS.groupG);
    expectToken('sp-board-group-p', TEMPLATE_COLORS.groupP);
    expectToken('sp-board-group-o', TEMPLATE_COLORS.groupO);
    // 만다라트 강조 칸은 기존 sticky 토큰 hex 재사용
    expectToken('sp-board-sticky-blue', TEMPLATE_COLORS.blockCenter);
    expectToken('sp-board-sticky-yellow', TEMPLATE_COLORS.gridCenter);
  });
});
