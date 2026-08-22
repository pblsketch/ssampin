/*
  온라인 교무실 — 서버에 보관된 관리자 구글 연결 갱신 가드.

  배경: 사용자 신고 2026-08-22 — "구글 로그인 다시 했는데도 자료실이 열리지 않아".

  원인: 자료실·갤러리는 서버가 관리자 토큰으로 대신 읽어 주는 구조인데(계획서 §3.2.1),
  그 토큰이 **부서를 만들 때 딱 한 번만** 저장되고 다시 저장하는 길이 없었다.
  서버가 리프레시 토큰으로 스스로 늘려 쓰지만 그게 무효가 되면 끝이었고,
  앱에서 아무리 다시 로그인해도 서버는 옛 토큰을 그대로 들고 있었다.
  실제 DB 확인: 부서 생성 시각(8/21 09:54) 이후 30시간 넘게 updated_at 이 그대로였다.

  이 테스트가 잡는 회귀:
   1) 관리자가 부서를 열 때 서버 토큰을 갱신하지 않는 것 (신고 상태로 되돌아감)
   2) 일반 멤버의 토큰을 관리자 자리에 덮어쓰는 것 (남의 드라이브로 자료가 갈 수 있다)
   3) 리프레시 토큰 없이 저장하는 것 (한 시간 뒤 같은 사고가 난다)
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';

const saveAdminToken = vi.fn(async () => {});

let connected = true;
let refreshToken: string | null = 'refresh-abc';

const department = {
  id: 'dept-1',
  name: '2학년부',
  description: null,
  ownerEmail: 'kim@school.kr',
  createdAt: '2026-08-01T00:00:00.000Z',
  myRole: 'admin' as 'admin' | 'member',
  memberCount: 1,
  unreadCount: 0,
};

vi.mock('@adapters/di/container', () => ({
  staffRoomPort: {
    getDepartment: async () => ({ department, board: null }),
    listMembers: async () => [],
    listInvites: async () => [],
    saveAdminToken,
  },
  authenticateGoogle: {
    isConnected: async () => connected,
    getValidAccessToken: async () => 'access-xyz',
    getRefreshToken: async () => refreshToken,
    getExpiresAt: async () => Date.parse('2026-08-22T12:00:00.000Z'),
  },
}));

const { useStaffRoomStore } = await import('../useStaffRoomStore');

beforeEach(() => {
  saveAdminToken.mockClear();
  connected = true;
  refreshToken = 'refresh-abc';
  department.myRole = 'admin';
  useStaffRoomStore.setState({ currentDepartment: null, error: null, needsGoogleConnect: false });
});

/** 뒤에서 도는 갱신이 끝나도록 한 틱 넘긴다 */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('부서를 열 때 서버의 구글 연결을 다시 맞춘다', () => {
  it('★ 관리자가 부서를 열면 서버 토큰을 지금 것으로 갱신한다', async () => {
    await useStaffRoomStore.getState().openDepartment('dept-1');
    await settle();

    expect(saveAdminToken).toHaveBeenCalledTimes(1);
    expect(saveAdminToken).toHaveBeenCalledWith('dept-1', {
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
      expiresAt: '2026-08-22T12:00:00.000Z',
    });
  });

  it('★ 일반 멤버가 열 때는 저장하지 않는다 (남의 드라이브로 자료가 가면 안 된다)', async () => {
    department.myRole = 'member';
    await useStaffRoomStore.getState().openDepartment('dept-1');
    await settle();
    expect(saveAdminToken).not.toHaveBeenCalled();
  });

  it('구글이 안 이어져 있으면 저장하지 않는다', async () => {
    connected = false;
    await useStaffRoomStore.getState().openDepartment('dept-1');
    await settle();
    expect(saveAdminToken).not.toHaveBeenCalled();
  });

  it('★ 리프레시 토큰이 없으면 저장하지 않는다 (한 시간짜리를 넣어 두면 같은 사고가 난다)', async () => {
    refreshToken = null;
    await useStaffRoomStore.getState().openDepartment('dept-1');
    await settle();
    expect(saveAdminToken).not.toHaveBeenCalled();
  });
});

describe('"구글 다시 잇기" 단추', () => {
  it('★ 눌렀을 때 서버 토큰을 갱신하고 성공을 알린다', async () => {
    useStaffRoomStore.setState({ currentDepartment: department });
    saveAdminToken.mockClear();

    const ok = await useStaffRoomStore.getState().reconnectAdminDrive();

    expect(ok).toBe(true);
    expect(saveAdminToken).toHaveBeenCalledWith('dept-1', {
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
      expiresAt: '2026-08-22T12:00:00.000Z',
    });
  });

  it('구글이 안 이어져 있으면 실패를 알리고 로그인이 필요하다고 표시한다', async () => {
    useStaffRoomStore.setState({ currentDepartment: department });
    connected = false;

    const ok = await useStaffRoomStore.getState().reconnectAdminDrive();

    expect(ok).toBe(false);
    expect(useStaffRoomStore.getState().needsGoogleConnect).toBe(true);
    expect(useStaffRoomStore.getState().error).toMatch(/구글/);
  });

  it('부서에 들어가 있지 않으면 아무것도 하지 않는다', async () => {
    useStaffRoomStore.setState({ currentDepartment: null });
    const ok = await useStaffRoomStore.getState().reconnectAdminDrive();
    expect(ok).toBe(false);
    expect(saveAdminToken).not.toHaveBeenCalled();
  });
});
