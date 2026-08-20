// @vitest-environment jsdom
/**
 * 수업반 사진 명렬표 미리보기 — 같은 번호가 겹쳐도 얼굴이 섞이지 않는다.
 *
 * ## 실제 신고 (2026-08-20)
 *
 * 수업반 사진 명렬표를 넣었더니 **여러 학생에게 같은 얼굴**이 떴다
 * (`5번 박지효`·`5번 김예림` 이 같은 사진, `14번` 세 명이 같은 사진).
 * 원인은 미리보기가 사진을 **번호만으로** 기억한 것 — 수업반은 여러 반이 섞여 번호가
 * 겹치므로 뒤 학생이 앞 학생의 사진을 덮어썼다.
 * 같은 신고에 "수업반은 `#학년 #반 #번 이름` 이 모두 떠야 한다"도 함께 들어왔다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { PhotoRosterParseResult } from '@domain/valueObjects/PhotoRoster';

/** 3학년 1·2반이 섞인 수업반 — 5번이 두 명, 14번이 세 명 */
const ROSTER = [
  { grade: 3, classNum: 1, studentNumber: 5, name: '박지효' },
  { grade: 3, classNum: 2, studentNumber: 5, name: '김예림' },
  { grade: 3, classNum: 1, studentNumber: 14, name: '이수아' },
  { grade: 3, classNum: 2, studentNumber: 14, name: '이유경' },
  { grade: 3, classNum: 3, studentNumber: 14, name: '이나연' },
];

const RESULT: PhotoRosterParseResult = {
  format: 'xlsx',
  names: ROSTER.map((r, i) => ({ ...r, pairKey: `r0:c${i}` })),
  photos: ROSTER.map((_, i) => ({
    pairKey: `r0:c${i}`,
    bytes: new Uint8Array([0xff, 0xd8, i]),
    mimeType: 'image/jpeg',
  })),
  pairing: {
    ok: true,
    pairs: ROSTER.map((r, i) => ({
      ...r,
      photo: {
        pairKey: `r0:c${i}`,
        bytes: new Uint8Array([0xff, 0xd8, i]),
        mimeType: 'image/jpeg',
      },
    })),
  },
};

vi.mock('@adapters/di/container', () => ({
  photoRosterParser: { parse: () => ({ ok: true, result: RESULT }) },
}));
vi.mock('@adapters/stores/useToastStore', () => ({
  useToastStore: (selector: (s: { show: () => void }) => unknown) => selector({ show: () => {} }),
}));

const { PhotoRosterImportModal } = await import('./PhotoRosterImportModal');

let urlSeq = 0;
beforeEach(() => {
  urlSeq = 0;
  // 사진마다 다른 URL 을 준다 — 겹치면 화면에서도 같은 얼굴이 된다
  globalThis.URL.createObjectURL = vi.fn(() => `blob:photo-${urlSeq++}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

async function showPreview() {
  const { container } = render(
    <PhotoRosterImportModal
      isOpen
      onClose={() => {}}
      ownerKind="teaching-class"
      ownerKey="tc-1"
      currentStudentCount={0}
      onConfirm={vi.fn().mockResolvedValue(true)}
    />,
  );
  const input = container.querySelector('input[type="file"]')!;
  const file = new File([new Uint8Array([1])], '수업반.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(1) });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/학생 수/)).toBeTruthy());
  return container;
}

describe('수업반 사진 명렬표 미리보기', () => {
  it('★학생 5명에게 서로 다른 사진 5장이 붙는다 (같은 얼굴이 겹치지 않는다)', async () => {
    const container = await showPreview();
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));

    expect(sources).toHaveLength(5);
    expect(new Set(sources).size).toBe(5);
  });

  it('★이름표에 학년·반·번호·이름이 모두 뜬다', async () => {
    await showPreview();
    expect(screen.getByText('3학년 1반 5번 박지효')).toBeTruthy();
    expect(screen.getByText('3학년 2반 5번 김예림')).toBeTruthy();
    expect(screen.getByText('3학년 3반 14번 이나연')).toBeTruthy();
  });

  it('★첫 줄 확인 문구에도 소속이 뜬다 (번호만 보면 무엇을 확인하는지 모른다)', async () => {
    await showPreview();
    expect(screen.getByText('3학년 1반 5번')).toBeTruthy();
  });

  it('학년 → 반 → 번호 순으로 늘어선다', async () => {
    const container = await showPreview();
    const labels = [...container.querySelectorAll('img')].map((img) => img.getAttribute('alt'));
    expect(labels).toEqual([
      '3학년 1반 5번 박지효',
      '3학년 1반 14번 이수아',
      '3학년 2반 5번 김예림',
      '3학년 2반 14번 이유경',
      '3학년 3반 14번 이나연',
    ]);
  });
});
