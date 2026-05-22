/**
 * registry.test.ts — G003-registry-schema
 *
 * WIDGET_DEFINITIONS 스키마 검증:
 * - 엔트리 수, modalSize/modalMode 존재, 스팟 체크 3건
 */
import { describe, expect, it } from 'vitest';
import { WIDGET_DEFINITIONS } from './registry';

const VALID_MODAL_SIZES = new Set(['sm', 'md', 'lg', 'fullscreen'] as const);
const VALID_MODAL_MODES = new Set(['view', 'edit', 'view+edit', 'expanded', 'large-only'] as const);

// G008: memo-focus 영구 제거 완료
const allDefs = WIDGET_DEFINITIONS;

describe('WIDGET_DEFINITIONS', () => {
  it('전체 엔트리 수 21개 (memo-focus 제거 후)', () => {
    expect(allDefs).toHaveLength(21);
  });

  it('memo-focus 가 레지스트리에 존재하지 않음', () => {
    expect(allDefs.find((d) => d.id === 'memo-focus')).toBeUndefined();
  });

  it('모든 활성 위젯에 유효한 modalSize 존재', () => {
    for (const w of allDefs) {
      expect(w.modalSize, `${w.id} modalSize 누락`).toBeDefined();
      expect(
        VALID_MODAL_SIZES.has(w.modalSize as 'sm' | 'md' | 'lg' | 'fullscreen'),
        `${w.id} modalSize 값 무효: ${w.modalSize}`,
      ).toBe(true);
    }
  });

  it('모든 활성 위젯에 유효한 modalMode 존재', () => {
    for (const w of allDefs) {
      expect(w.modalMode, `${w.id} modalMode 누락`).toBeDefined();
      expect(
        VALID_MODAL_MODES.has(
          w.modalMode as 'view' | 'edit' | 'view+edit' | 'expanded' | 'large-only',
        ),
        `${w.id} modalMode 값 무효: ${w.modalMode}`,
      ).toBe(true);
    }
  });

  describe('스팟 체크', () => {
    it('memo: lg + view+edit + inplaceCapable=true', () => {
      const w = allDefs.find((d) => d.id === 'memo');
      expect(w).toBeDefined();
      expect(w!.modalSize).toBe('lg');
      expect(w!.modalMode).toBe('view+edit');
      expect(w!.inplaceCapable).toBe(true);
      expect(w!.requiresExplicitCancel).toBeUndefined();
    });

    it('seating: fullscreen + expanded + requiresExplicitCancel=true', () => {
      const w = allDefs.find((d) => d.id === 'seating');
      expect(w).toBeDefined();
      expect(w!.modalSize).toBe('fullscreen');
      expect(w!.modalMode).toBe('expanded');
      expect(w!.requiresExplicitCancel).toBe(true);
      expect(w!.inplaceCapable).toBeUndefined();
    });

    it('image-sticker-1: md + large-only', () => {
      const w = allDefs.find((d) => d.id === 'image-sticker-1');
      expect(w).toBeDefined();
      expect(w!.modalSize).toBe('md');
      expect(w!.modalMode).toBe('large-only');
    });
  });
});
