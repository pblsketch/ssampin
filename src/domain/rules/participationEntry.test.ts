/**
 * 학생이 **어떤 주소로 들어오는가**를 정하는 규칙.
 *
 * 옛 동작은 서버가 뜨자마자 같은 Wi-Fi 주소를 먼저 띄우고 인터넷 주소가 나오면
 * 조용히 갈아치우는 것이었다. 그 사이 선생님이 **되지도 않을 주소를 불러 줄 수 있었다**
 * (휴대전화 데이터를 쓰는 학생은 같은 Wi-Fi 주소로 못 들어온다).
 * 여기서 고정하는 것은 "준비 중에는 안내하지 않는다"와 "보조 경로에는 경고가 붙는다"이다.
 */

import { describe, expect, it } from 'vitest';
import {
  canInviteStudents,
  entryAccessClassroomNote,
  entryAccessLabel,
  entryAccessWarning,
  ENTRY_PREPARING_HINT,
  type EntryAccessKind,
} from './participationEntry';

const ALL: readonly EntryAccessKind[] = ['preparing', 'internet', 'local'];

describe('학생 입장 주소', () => {
  it('준비 중에는 학생에게 안내하지 않는다', () => {
    expect(canInviteStudents({ kind: 'preparing', url: '', code: null })).toBe(false);
  });

  it('준비 중이면 주소가 어쩌다 들어 있어도 안내하지 않는다', () => {
    // 이전 세션의 주소가 남아 있는 것일 수 있다 — 단계가 먼저다.
    expect(canInviteStudents({ kind: 'preparing', url: 'http://10.0.0.2:5000', code: null })).toBe(
      false,
    );
  });

  it('인터넷 주소가 나오면 안내한다', () => {
    expect(
      canInviteStudents({ kind: 'internet', url: 'https://ssampin.app/s/ABCD', code: 'ABCD' }),
    ).toBe(true);
  });

  it('같은 Wi-Fi 주소도 안내는 한다 — 막지 않고 경고만 붙인다', () => {
    expect(canInviteStudents({ kind: 'local', url: 'http://192.168.0.5:63108', code: null })).toBe(
      true,
    );
  });

  it('주소가 비어 있으면 어떤 종류든 안내하지 않는다', () => {
    for (const kind of ALL) {
      expect(canInviteStudents({ kind, url: '', code: null })).toBe(false);
    }
  });

  it('같은 Wi-Fi 주소에는 한계를 말해 주는 경고가 붙는다', () => {
    const warning = entryAccessWarning('local');
    expect(warning).not.toBeNull();
    // 선생님이 주소를 부르기 전에 읽어야 하는 두 가지 — 같은 Wi-Fi 조건과 데이터 사용 학생.
    expect(warning).toContain('같은 Wi-Fi');
    expect(warning).toContain('데이터');
  });

  it('인터넷 주소에는 경고를 붙이지 않는다 — 없는 걱정을 만들지 않는다', () => {
    expect(entryAccessWarning('internet')).toBeNull();
    expect(entryAccessWarning('preparing')).toBeNull();
  });

  it('교실 화면 한 줄은 뒷자리에서 읽히도록 짧게 쓴다', () => {
    expect(entryAccessClassroomNote('internet')).toBeNull();
    const local = entryAccessClassroomNote('local');
    const preparing = entryAccessClassroomNote('preparing');
    expect(local).not.toBeNull();
    expect(preparing).not.toBeNull();
    expect((local ?? '').length).toBeLessThan(40);
    expect((preparing ?? '').length).toBeLessThan(40);
    // 선생님용 경고문을 그대로 띄우면 뒷자리에서 안 읽힌다.
    expect(local).not.toBe(entryAccessWarning('local'));
  });

  it('모든 종류에 화면 제목이 있다', () => {
    for (const kind of ALL) {
      expect(entryAccessLabel(kind).length).toBeGreaterThan(0);
    }
    expect(entryAccessLabel('preparing')).not.toBe(entryAccessLabel('internet'));
  });

  it('기다리는 동안 보여 줄 안내는 왜 오래 걸리는지 말한다', () => {
    expect(ENTRY_PREPARING_HINT).toContain('처음');
  });
});
