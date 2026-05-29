/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

/**
 * StudentPiiSection PII gate test
 *
 * Acceptance: 'PII masked when locked, revealed when unlocked, edit writes audit entry'
 * + Decision 9: 위젯 윈도우에서 PII 컴포넌트 마운트 자체 차단.
 *
 * SSR-friendly snapshot: usePiiOverlayEditor를 mock하여 3-state(widget/locked/unlocked) 출력 검증.
 */

const editorMock = vi.hoisted(() => ({
  state: {
    locked: true,
    widget: false,
    overlay: null as null | { studentId: string; gender?: 'M' | 'F'; academicLevel?: 'A' | 'B' | 'C' | 'D' | 'E' },
    saving: false,
    error: null as string | null,
    updateGender: vi.fn(async () => undefined),
    updateAcademicLevel: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
  },
}));

vi.mock('@adapters/hooks/usePiiOverlayEditor', () => ({
  usePiiOverlayEditor: () => editorMock.state,
}));

beforeEach(() => {
  editorMock.state.locked = true;
  editorMock.state.widget = false;
  editorMock.state.overlay = null;
  editorMock.state.saving = false;
  editorMock.state.error = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('StudentPiiSection — Decision 9 + PII gate', () => {
  it('widget context: returns null (component not mounted)', async () => {
    editorMock.state.widget = true;
    const { StudentPiiSection } = await import('./StudentPiiSection');
    const html = renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' }));
    expect(html).toBe('');
  });

  it('locked state: shows "PIN 해제 후 입력할 수 있습니다." + 영구 배지', async () => {
    editorMock.state.locked = true;
    const { StudentPiiSection } = await import('./StudentPiiSection');
    const html = renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' }));
    expect(html).toContain('🔒 민감 정보 — 로컬에만 저장됩니다');
    expect(html).toContain('PIN 해제 후 입력할 수 있습니다.');
    // 컨트롤 미노출
    expect(html).not.toContain('학업성취도');
  });

  it('unlocked state: renders gender + academicLevel controls', async () => {
    editorMock.state.locked = false;
    editorMock.state.overlay = { studentId: 's1' };
    const { StudentPiiSection } = await import('./StudentPiiSection');
    const html = renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' }));
    expect(html).toContain('성별');
    expect(html).toContain('학업성취도');
    // Gender 라벨
    expect(html).toContain('남');
    expect(html).toContain('여');
    // Level 라벨
    for (const lv of ['A', 'B', 'C', 'D', 'E']) {
      expect(html).toContain(`>${lv}<`);
    }
  });

  it('unlocked with overlay: aria-pressed 표시', async () => {
    editorMock.state.locked = false;
    editorMock.state.overlay = { studentId: 's1', gender: 'M', academicLevel: 'A' };
    const { StudentPiiSection } = await import('./StudentPiiSection');
    const html = renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' }));
    // M, A에 aria-pressed="true" — 정확한 출현 형태 확인
    const mMatches = html.match(/aria-pressed="true"/g);
    expect(mMatches).not.toBeNull();
    expect((mMatches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('영구 배지는 widget을 제외한 모든 상태에 항상 표시', async () => {
    // 잠금 상태
    editorMock.state.locked = true;
    const { StudentPiiSection } = await import('./StudentPiiSection');
    expect(
      renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' })),
    ).toContain('민감 정보 — 로컬에만 저장됩니다');

    // 해제 상태
    editorMock.state.locked = false;
    editorMock.state.overlay = { studentId: 's1' };
    expect(
      renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' })),
    ).toContain('민감 정보 — 로컬에만 저장됩니다');
  });

  it('error 상태: role="alert" 메시지 노출', async () => {
    editorMock.state.locked = false;
    editorMock.state.overlay = { studentId: 's1' };
    editorMock.state.error = '잠금 상태 — 편집 권한 없음';
    const { StudentPiiSection } = await import('./StudentPiiSection');
    const html = renderToStaticMarkup(React.createElement(StudentPiiSection, { studentId: 's1' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('편집 권한 없음');
  });
});
