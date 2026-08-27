/*
  과제수합 — 서버에 보관된 교사 구글 연결 갱신 가드.

  배경: 사용자 신고 2026-08-27 —
  "과제수합에서 교사 계정유효기간만료. 로그아웃후 다시 로그인 해봤으나 안됨".

  원인: 학생이 낸 파일은 학생 브라우저가 아니라 **서버(submit-assignment)가 교사 토큰으로
  대신** 드라이브에 올린다. 그런데 그 토큰이 **과제를 만들 때 딱 한 번만** 저장되고
  다시 저장하는 길이 없었다. 서버가 리프레시 토큰으로 스스로 늘려 쓰지만 그게 무효가 되면
  끝이었고, 앱에서 아무리 다시 로그인해도 서버는 옛 토큰을 그대로 들고 있었다.
  게다가 연결 해제는 리프레시 토큰을 revoke 하므로 "로그아웃 후 재로그인"은
  서버 사본을 확정 무효화하기만 했다.
  제출 현황 조회(get-submissions)는 이 토큰을 쓰지 않아 교사 화면은 멀쩡해 보였다.

  이 테스트가 잡는 회귀:
   1) 과제수합을 열 때 서버 토큰을 갱신하지 않는 것 (신고 상태로 되돌아감)
   2) 리프레시 토큰 없이 저장하는 것 (한 시간 뒤 같은 사고가 난다)
   3) 과제가 하나도 없는 교사의 토큰까지 서버에 올리는 것 (기존 프라이버시 수준 이탈)
   4) 갱신 실패가 조용히 묻히는 것 ([Google 계정 연결하기]가 성공한 척하면 신고가 반복된다)
   5) 목록을 열 때마다 서버를 왕복하는 것 (동기화·온라인 복귀·새로고침이 모두 부른다)
   6) "서버 저장 실패"를 "구글 로그인 필요"로 뭉뚱그리는 것
      — 이미 로그인한 교사에게 또 로그인하라고 시키는 헛수고가 되고, 그 안내가 앱을
        껐다 켤 때까지 남는다 (수정 과정에서 실제로 한 번 만들어진 회귀다)
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface SavedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const saveTeacherToken = vi.fn(async (_tokens: SavedTokens) => {});

let connected = true;
let refreshToken: string | null = 'refresh-abc';
let expiresAtMs: number | null = Date.parse('2026-08-27T12:00:00.000Z');
let accessTokenError: Error | null = null;
let currentEmail: string | null = 'kim@school.kr';
let assignmentList: Array<{ id: string; target: { type: string }; teacherEmail?: string }> = [
  { id: 'a-1', target: { type: 'class' }, teacherEmail: 'kim@school.kr' },
];

vi.mock('@adapters/di/container', () => ({
  assignmentServicePort: { saveTeacherToken },
  assignmentSupabaseClient: { startPolling: () => () => {} },
  assignmentRepository: {
    getAssignments: async () => ({ assignments: assignmentList }),
    saveAssignments: async () => {},
  },
  shortLinkClient: { createShortLink: async (url: string) => url },
  createAssignmentUseCases: () => ({
    getAssignments: { execute: async () => assignmentList },
    getSubmissions: { execute: async () => [] },
    createAssignment: {
      execute: async () => ({ id: 'a-1', deadline: '2026-09-01T00:00:00.000Z' }),
    },
    deleteAssignment: { execute: async () => {} },
    copyMissingList: { execute: async () => '' },
  }),
  authenticateGoogle: {
    isConnected: async () => connected,
    getValidAccessToken: async () => {
      if (accessTokenError) throw accessTokenError;
      return 'access-xyz';
    },
    getRefreshToken: async () => refreshToken,
    getExpiresAt: async () => expiresAtMs,
    getEmail: async () => currentEmail,
  },
}));

const { useAssignmentStore } = await import('../useAssignmentStore');

beforeEach(() => {
  saveTeacherToken.mockClear();
  saveTeacherToken.mockImplementation(async () => {});
  connected = true;
  refreshToken = 'refresh-abc';
  expiresAtMs = Date.parse('2026-08-27T12:00:00.000Z');
  accessTokenError = null;
  currentEmail = 'kim@school.kr';
  assignmentList = [{ id: 'a-1', target: { type: 'class' }, teacherEmail: 'kim@school.kr' }];
  useAssignmentStore.setState({
    assignments: [],
    error: null,
    needsGoogleConnect: false,
    connectNotice: null,
    lastTokenPush: null,
  });
});

/** 뒤에서 도는 갱신이 끝나도록 한 틱 넘긴다 */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('과제수합을 열 때 서버의 구글 연결을 다시 맞춘다', () => {
  it('★ 과제가 있으면 목록을 열 때 서버 토큰을 지금 것으로 갱신한다', async () => {
    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
    expect(saveTeacherToken).toHaveBeenCalledWith({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
      expiresAt: '2026-08-27T12:00:00.000Z',
    });
  });

  it('★ 과제가 하나도 없으면 올리지 않는다 (안 쓰는 교사의 토큰을 서버에 두지 않는다)', async () => {
    assignmentList = [];
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).not.toHaveBeenCalled();
  });

  it('구글이 안 이어져 있으면 저장하지 않는다', async () => {
    connected = false;
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).not.toHaveBeenCalled();
  });

  it('★ 리프레시 토큰이 없으면 저장하지 않는다 (한 시간짜리를 넣어 두면 같은 사고가 난다)', async () => {
    refreshToken = null;
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).not.toHaveBeenCalled();
  });

  it('★ 토큰이 폐기돼(INVALID_GRANT) 읽기부터 실패하면 저장하지 않는다', async () => {
    // 실제로 가장 흔한 상태: isConnected 는 true 인데(토큰 파일이 남아 있으므로)
    // 구글이 권한을 회수해 갱신이 INVALID_GRANT 로 터진다.
    accessTokenError = new Error('INVALID_GRANT: Google 인증이 만료되었습니다.');
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).not.toHaveBeenCalled();
  });

  it('만료 시각을 모르면 한 시간 뒤로 채워 보낸다', async () => {
    expiresAtMs = null;
    const before = Date.now();
    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
    const sent = saveTeacherToken.mock.calls[0]?.[0];
    const gap = Date.parse(sent?.expiresAt ?? '') - before;
    expect(gap).toBeGreaterThan(3500 * 1000);
    expect(gap).toBeLessThan(3700 * 1000);
  });

  it('★ 연달아 열어도 서버를 매번 왕복하지 않는다 (동기화·새로고침이 자주 부른다)', async () => {
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
  });

  it('★★ 토큰이 바뀌었으면 간격이 남아 있어도 즉시 올린다 (연결 해제 → 재연결 복구)', async () => {
    // 신고 그대로의 흐름: 열어 보고(1회 올림) → 설정에서 연결 해제 → 다시 연결 →
    // 10분 안에 과제수합으로 돌아온다. 시간만 보고 건너뛰면 서버는 폐기된 토큰을 계속
    // 들고 있고, 학생은 그대로 못 낸다. 지문이 달라졌으므로 즉시 다시 올려야 한다.
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).toHaveBeenCalledTimes(1);

    refreshToken = 'refresh-NEW-after-reconnect';

    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(saveTeacherToken).toHaveBeenCalledTimes(2);
    expect(saveTeacherToken).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshToken: 'refresh-NEW-after-reconnect' }),
    );
  });

  it('★ 갱신이 실패하면 다음에 열 때 곧바로 다시 시도한다 (실패를 성공으로 기억하지 않는다)', async () => {
    saveTeacherToken.mockRejectedValueOnce(new Error('network down'));
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).toHaveBeenCalledTimes(1);

    await useAssignmentStore.getState().loadAssignments();
    await settle();
    expect(saveTeacherToken).toHaveBeenCalledTimes(2);
  });

  it('갱신이 실패해도 목록 조회 자체는 성공으로 남는다', async () => {
    saveTeacherToken.mockRejectedValueOnce(new Error('network down'));
    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(useAssignmentStore.getState().error).toBeNull();
    expect(useAssignmentStore.getState().assignments).toHaveLength(1);
  });

  it('★ 목록을 제대로 불러오면 "연결이 필요합니다" 안내를 내린다 (경고가 눌어붙지 않는다)', async () => {
    useAssignmentStore.setState({ needsGoogleConnect: true });

    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(false);
  });
});

describe('[Google 계정 연결하기] 단추', () => {
  it('★ 눌렀을 때 서버 토큰을 갱신하고 성공을 알린다', async () => {
    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(true);
    expect(saveTeacherToken).toHaveBeenCalledWith({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
      expiresAt: '2026-08-27T12:00:00.000Z',
    });
    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(false);
  });

  it('구글이 안 이어져 있으면 실패를 알리고 로그인이 필요하다고 표시한다', async () => {
    connected = false;

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(false);
    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(true);
    expect(useAssignmentStore.getState().error).toContain('Google 계정');
  });

  it('★ 방금 자동 갱신했더라도 단추는 간격을 무시하고 즉시 올린다', async () => {
    await useAssignmentStore.getState().loadAssignments();
    await settle();
    saveTeacherToken.mockClear();

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(true);
    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
  });

  it('★ 서버 저장이 실패하면 성공한 척하지 않는다', async () => {
    saveTeacherToken.mockRejectedValueOnce(new Error('500'));

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(false);
    expect(useAssignmentStore.getState().error).toBeTruthy();
  });

  it('★★ 서버가 401 을 주면(구글 권한 회수) 재시도가 아니라 다시 로그인하라고 안내한다', async () => {
    // 이 신고의 주된 원인이다. "인터넷을 확인하세요"로 안내하면 엉뚱한 처방이 된다.
    const revoked: Error & { status?: number } = new Error('인증에 실패했습니다');
    revoked.status = 401;
    saveTeacherToken.mockRejectedValueOnce(revoked);

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(false);
    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(true);
    expect(useAssignmentStore.getState().error).toContain('Google 계정');
  });

  it('★ 서버 저장만 실패한 것을 "구글 로그인 필요"로 뭉뚱그리지 않는다', async () => {
    // 구글 로그인은 멀쩡한데 엣지 함수가 500 을 냈다. 여기서 needsGoogleConnect 를 올리면
    // 이미 로그인한 교사에게 또 로그인하라고 시키고, 새 과제 단추까지 사라진 채 남는다.
    saveTeacherToken.mockRejectedValueOnce(new Error('500'));

    await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(false);
    expect(useAssignmentStore.getState().error).toContain('다시 시도');
  });
});

describe('과제를 만들 때도 같은 경로로 토큰을 맞춘다', () => {
  const params = {
    title: '독후감',
    deadline: '2026-09-01T00:00:00.000Z',
    targetName: '1학년 1반',
  } as never;

  it('★ 리프레시 토큰이 없으면 과제 생성 경로에서도 저장하지 않는다', async () => {
    refreshToken = null;
    await useAssignmentStore.getState().createAssignment(params);
    await settle();
    expect(saveTeacherToken).not.toHaveBeenCalled();
  });

  it('★ 토큰 저장이 실패해도 과제 생성 자체는 끝까지 진행된다', async () => {
    saveTeacherToken.mockRejectedValueOnce(new Error('500'));

    const created = await useAssignmentStore.getState().createAssignment(params);

    expect(created).toBeTruthy();
    expect(useAssignmentStore.getState().error).toBeNull();
  });
});

describe('서버가 학생 파일을 못 올리는 상태를 선생님에게 알린다', () => {
  it('★★ 자동 갱신이 "로그인 필요"로 끝나면 연결 안내를 띄운다 (단추가 보이게)', async () => {
    // 이 신고의 핵심 — 앱은 "연결됨"이라 단추도 경고도 없고, 학생만 조용히 막혔다.
    connected = false;

    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(true);
    expect(useAssignmentStore.getState().connectNotice).toContain('Google 계정');
  });

  it('일시 장애(서버 저장 실패)로는 연결 안내를 띄우지 않는다', async () => {
    saveTeacherToken.mockRejectedValueOnce(new Error('network down'));

    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(false);
  });
});

describe('다른 구글 계정으로 갈아탄 것을 잡아낸다', () => {
  it('★★ 과제를 만든 계정과 지금 계정이 다르면 성공했다고 하지 않는다', async () => {
    currentEmail = 'lee@school.kr'; // 과제는 kim@school.kr 로 만들었다

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(false);
    expect(saveTeacherToken).not.toHaveBeenCalled();
    const notice = useAssignmentStore.getState().connectNotice ?? '';
    expect(notice).toContain('kim@school.kr');
    expect(notice).toContain('lee@school.kr');
  });

  it('★ 목록을 열 때도 계정 어긋남을 알리고 토큰을 올리지 않는다', async () => {
    currentEmail = 'lee@school.kr';

    await useAssignmentStore.getState().loadAssignments();
    await settle();

    expect(saveTeacherToken).not.toHaveBeenCalled();
    expect(useAssignmentStore.getState().needsGoogleConnect).toBe(true);
    expect(useAssignmentStore.getState().connectNotice).toContain('kim@school.kr');
  });

  it('계정이 같으면 평소대로 올린다', async () => {
    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(true);
    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
  });

  it('★ 계정을 모르는 옛 과제(v2.4.5 이하)는 대조를 건너뛴다 (멀쩡한 복구를 막지 않는다)', async () => {
    assignmentList = [{ id: 'a-old', target: { type: 'class' } }];
    currentEmail = 'lee@school.kr';

    const ok = await useAssignmentStore.getState().reconnectGoogleDrive();

    expect(ok).toBe(true);
    expect(saveTeacherToken).toHaveBeenCalledTimes(1);
  });
});
