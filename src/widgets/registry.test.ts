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

/**
 * 모달을 띄우지 않는 위젯 — 카드 본체에서 직접 인터랙션.
 * 2026-05-23: desktop-organize 는 Windows 위젯 모드 전용으로 모달 부적합 → 사용자 결정.
 */
const NO_MODAL_WIDGETS = new Set<string>(['desktop-organize']);

describe('WIDGET_DEFINITIONS', () => {
  it('전체 엔트리 수 21개 (memo-focus 제거 후)', () => {
    expect(allDefs).toHaveLength(21);
  });

  it('memo-focus 가 레지스트리에 존재하지 않음', () => {
    expect(allDefs.find((d) => d.id === 'memo-focus')).toBeUndefined();
  });

  it('모든 모달 위젯에 유효한 modalSize 존재 (NO_MODAL_WIDGETS 제외)', () => {
    for (const w of allDefs) {
      if (NO_MODAL_WIDGETS.has(w.id)) continue;
      expect(w.modalSize, `${w.id} modalSize 누락`).toBeDefined();
      expect(
        VALID_MODAL_SIZES.has(w.modalSize as 'sm' | 'md' | 'lg' | 'fullscreen'),
        `${w.id} modalSize 값 무효: ${w.modalSize}`,
      ).toBe(true);
    }
  });

  it('모든 모달 위젯에 유효한 modalMode 존재 (NO_MODAL_WIDGETS 제외)', () => {
    for (const w of allDefs) {
      if (NO_MODAL_WIDGETS.has(w.id)) continue;
      expect(w.modalMode, `${w.id} modalMode 누락`).toBeDefined();
      expect(
        VALID_MODAL_MODES.has(
          w.modalMode as 'view' | 'edit' | 'view+edit' | 'expanded' | 'large-only',
        ),
        `${w.id} modalMode 값 무효: ${w.modalMode}`,
      ).toBe(true);
    }
  });

  it('NO_MODAL_WIDGETS 의 위젯은 modalSize/modalMode 가 정의되지 않는다', () => {
    for (const id of NO_MODAL_WIDGETS) {
      const w = allDefs.find((d) => d.id === id);
      expect(w, `${id} 정의 누락`).toBeDefined();
      expect(w!.modalSize, `${id} modalSize 정의되면 안 됨`).toBeUndefined();
      expect(w!.modalMode, `${id} modalMode 정의되면 안 됨`).toBeUndefined();
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
