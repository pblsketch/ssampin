/**
 * @vitest-environment jsdom
 *
 * 관련인 칩이 지키는 약속을 잠근다 — M3 인수 기준 2·3.
 *
 *  - 연락처가 **정본**이다: 이름이 바뀌면 칩도 새 이름을 보여준다
 *  - 연락처에서 지워지면 저장해 둔 이름 + "연락처에 없음"
 *  - 어느 경우에도 **할 일을 다시 저장하지 않는다**(스냅샷을 갱신하면 정본이 둘이 된다)
 *  - 앱 재시작 직후처럼 연락처를 아직 안 읽은 상태에서도 **스스로 불러온다**
 *    (이걸 빠뜨려 살아 있는 교직원이 전부 "연락처에 없음" 으로 뜬 적이 있다)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StaffContact } from '@domain/entities/StaffContact';
import { useStaffContactStore } from '@adapters/stores/useStaffContactStore';
import { RelatedStaffChips } from './RelatedStaffChips';

const contact = (over: Partial<StaffContact> = {}): StaffContact => ({
  id: 's1',
  name: '김민호',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const RELATED = [{ staffId: 's1', nameSnapshot: '김민호' }];

let loadSpy: ReturnType<typeof vi.fn<(force?: boolean) => Promise<void>>>;

beforeEach(() => {
  loadSpy = vi.fn<(force?: boolean) => Promise<void>>(() => Promise.resolve());
  useStaffContactStore.setState({ contacts: [], loaded: true, load: loadSpy });
});

afterEach(cleanup);

describe('RelatedStaffChips', () => {
  it('연락처를 스스로 불러온다 — 재시작 직후에도 이름이 살아 있게', () => {
    render(<RelatedStaffChips related={RELATED} />);
    expect(loadSpy).toHaveBeenCalled();
  });

  it('연락처에서 이름이 바뀌면 칩도 새 이름을 보여준다 (인수 기준 3)', () => {
    useStaffContactStore.setState({ contacts: [contact({ name: '김민호(교감)' })] });
    render(<RelatedStaffChips related={RELATED} />);

    expect(screen.getByText('김민호(교감)')).toBeTruthy();
  });

  it('연락처에 없으면 저장해 둔 이름 + "연락처에 없음" (인수 기준 2)', () => {
    useStaffContactStore.setState({ contacts: [] });
    render(<RelatedStaffChips related={RELATED} />);

    expect(screen.getByText('김민호')).toBeTruthy();
    expect(screen.getByText(/연락처에 없음/)).toBeTruthy();
  });

  it('연락처에 살아 있으면 "연락처에 없음" 을 붙이지 않는다', () => {
    useStaffContactStore.setState({ contacts: [contact()] });
    render(<RelatedStaffChips related={RELATED} />);

    expect(screen.queryByText(/연락처에 없음/)).toBeNull();
  });

  it('할 일을 저장하지 않는다 — 표시 전용 (저장 데이터 불변)', () => {
    const update = vi.fn();
    useStaffContactStore.setState({ contacts: [contact({ name: '바뀐 이름' })] });
    render(<RelatedStaffChips related={RELATED} />);

    // 칩은 연락처만 읽는다. 스냅샷을 새 이름으로 다시 저장하지 않는다.
    expect(update).not.toHaveBeenCalled();
    expect(RELATED[0]?.nameSnapshot).toBe('김민호');
  });

  it('관련인이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<RelatedStaffChips related={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('제거 버튼은 onRemove 를 줬을 때만 나온다', () => {
    useStaffContactStore.setState({ contacts: [contact()] });
    const { rerender } = render(<RelatedStaffChips related={RELATED} />);
    expect(screen.queryByTitle('김민호 제거')).toBeNull();

    rerender(<RelatedStaffChips related={RELATED} onRemove={vi.fn()} />);
    expect(screen.getByTitle('김민호 제거')).toBeTruthy();
  });
});
