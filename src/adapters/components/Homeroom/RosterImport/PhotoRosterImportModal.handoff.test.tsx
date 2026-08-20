// @vitest-environment jsdom
/**
 * PhotoRosterImportModal — "인계"와 "취소"를 구분한다.
 *
 * ## 이 파일이 막는 결함 (실제로 터졌다, 2026-08-20)
 *
 * 서로 다른 두 수정이 부딪혔다.
 * - "취소하면 아직 반영 안 된 사진을 버린다" (부모의 `onClose`)
 * - "충돌 창이 뜨면 이 창을 닫는다" (모달이 `onClose` 호출)
 *
 * 그래서 이름이 다른 학생이 있어 충돌 창이 뜨는 경로에서 **사진이 먼저 버려져** 0장이
 * 저장됐다. 증상은 "이름은 들어가는데 사진만 안 들어감"이었고, 자동 검증은 전부 초록불이었다.
 *
 * ⚠️ **판정 규칙을 여기서 다시 구현하지 않는다.** 규칙을 베껴 쓰면 결함까지 같이 베껴져
 * 그물이 아무것도 못 잡는다(이 저장소에 전례가 있다). 실제 창을 파일 선택부터 조작한다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { PhotoRosterParseResult } from '@domain/valueObjects/PhotoRoster';

const PHOTO = { pairKey: 'r0:c0', bytes: new Uint8Array([0xff, 0xd8]), mimeType: 'image/jpeg' };
const RESULT: PhotoRosterParseResult = {
  format: 'hwpml',
  names: [{ pairKey: 'r0:c0', studentNumber: 1, name: '강나영' }],
  photos: [PHOTO],
  pairing: { ok: true, pairs: [{ studentNumber: 1, name: '강나영', photo: PHOTO }] },
};

vi.mock('@adapters/di/container', () => ({
  photoRosterParser: { parse: () => ({ ok: true, result: RESULT }) },
}));
vi.mock('@adapters/stores/useToastStore', () => ({
  useToastStore: (selector: (s: { show: () => void }) => unknown) => selector({ show: () => {} }),
}));

const { PhotoRosterImportModal } = await import('./PhotoRosterImportModal');

beforeEach(() => {
  // 미리보기가 Blob URL 을 만든다 — jsdom 에는 없다
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

/** 파일 선택 → 확인 단계 → 체크 두 개 → [명단에 반영] 까지 실제로 몰고 간다 */
async function driveToApply(props: {
  onClose: () => void;
  onHandOff?: () => void;
  onConfirm: (r: PhotoRosterParseResult) => Promise<boolean | void>;
}) {
  const { container } = render(
    <PhotoRosterImportModal
      isOpen
      ownerKind="homeroom"
      ownerKey="homeroom"
      currentStudentCount={1}
      {...props}
    />,
  );

  const input = container.querySelector('input[type="file"]')!;
  const file = new File([new Uint8Array([1, 2, 3])], '명렬표.hwp');
  // jsdom 의 File 에는 arrayBuffer 가 없다
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(3) });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(screen.getByText(/학생 수/)).toBeTruthy());
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
  fireEvent.click(screen.getByRole('button', { name: /명단에 반영/ }));
}

describe('PhotoRosterImportModal — 인계와 취소를 구분한다', () => {
  it('★충돌 해결로 넘어가면(onConfirm 이 false) onHandOff 를 부르고 onClose 는 부르지 않는다', async () => {
    const onClose = vi.fn();
    const onHandOff = vi.fn();
    await driveToApply({ onClose, onHandOff, onConfirm: vi.fn().mockResolvedValue(false) });

    await waitFor(() => expect(onHandOff).toHaveBeenCalledTimes(1));
    // ★ 여기가 핵심 — onClose 가 불리면 부모가 사진을 버려 0장이 저장된다
    expect(onClose).not.toHaveBeenCalled();
  });

  it('반영이 끝나면(true) 완료 화면으로 가고 둘 다 부르지 않는다', async () => {
    const onClose = vi.fn();
    const onHandOff = vi.fn();
    await driveToApply({ onClose, onHandOff, onConfirm: vi.fn().mockResolvedValue(true) });

    await waitFor(() => expect(screen.getByText('명단에 반영했어요')).toBeTruthy());
    expect(onHandOff).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('onHandOff 를 안 넘기면 onClose 로 물러난다 (선택 항목이므로 하위 호환)', async () => {
    const onClose = vi.fn();
    await driveToApply({ onClose, onConfirm: vi.fn().mockResolvedValue(false) });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
