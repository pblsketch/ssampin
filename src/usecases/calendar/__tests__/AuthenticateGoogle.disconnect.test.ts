/**
 * 연결 해제 — 서버 보관분 삭제 → 구글 폐기 → 로컬 삭제 (ADR-136 D4)
 *
 * ★순서가 계약이다. 구글에서 폐기한 뒤에는 access token 이 죽어 서버에 본인 확인을 못 하므로,
 * 서버 보관분을 **먼저** 지워야 한다. 실패는 조용히 삼키지 않고 결과로 돌려준다.
 */
import { describe, it, expect } from 'vitest';
import type { GoogleAuthTokens, IGoogleAuthPort } from '@domain/ports/IGoogleAuthPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { IServerTokenCustodyPort } from '@domain/ports/IServerTokenCustodyPort';
import { AuthenticateGoogle } from '../AuthenticateGoogle';

const TOKENS: GoogleAuthTokens = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 60 * 60 * 1000,
  email: 'teacher@example.com',
  grantedScopes: ['scope-a'],
};

function setup(opts: { serverFails?: boolean; revokeFails?: boolean; noTokens?: boolean } = {}) {
  const calls: string[] = [];
  let stored: GoogleAuthTokens | null = opts.noTokens === true ? null : TOKENS;

  const authPort = {
    getRequiredScopes: () => ['scope-a'],
    revokeTokens: async (token: string) => {
      calls.push(`revoke:${token}`);
      if (opts.revokeFails === true) throw new Error('offline');
    },
  } as unknown as IGoogleAuthPort;

  const syncRepo = {
    getAuthTokens: async () => stored,
    saveAuthTokens: async (t: GoogleAuthTokens) => {
      stored = t;
    },
    deleteAuthTokens: async () => {
      calls.push('local-delete');
      stored = null;
    },
  } as unknown as ICalendarSyncRepository;

  const serverTokens: IServerTokenCustodyPort = {
    deleteMine: async (accessToken) => {
      calls.push(`server-delete:${accessToken}`);
      if (opts.serverFails === true) throw new Error('offline');
    },
  };

  return { useCase: new AuthenticateGoogle(authPort, syncRepo, serverTokens), calls };
}

describe('AuthenticateGoogle.disconnect', () => {
  it('서버 보관분을 먼저 지우고(살아 있는 토큰으로 본인 확인), 그다음 폐기·로컬 삭제', async () => {
    const { useCase, calls } = setup();
    const outcome = await useCase.disconnect();
    expect(calls).toEqual(['server-delete:access-1', 'revoke:refresh-1', 'local-delete']);
    expect(outcome).toEqual({ serverCleared: true, revoked: true });
  });

  it('서버 삭제가 실패해도 폐기·로컬 삭제는 하고, 실패를 알린다', async () => {
    const { useCase, calls } = setup({ serverFails: true });
    const outcome = await useCase.disconnect();
    expect(calls).toContain('revoke:refresh-1');
    expect(calls).toContain('local-delete');
    expect(outcome).toEqual({ serverCleared: false, revoked: true });
  });

  it('구글 폐기가 실패해도 로컬은 지우고, 실패를 알린다(예전엔 조용히 삼켰다)', async () => {
    const { useCase, calls } = setup({ revokeFails: true });
    const outcome = await useCase.disconnect();
    expect(calls).toContain('local-delete');
    expect(outcome).toEqual({ serverCleared: true, revoked: false });
  });

  it('저장된 토큰이 없으면 서버·구글에 묻지 않는다', async () => {
    const { useCase, calls } = setup({ noTokens: true });
    const outcome = await useCase.disconnect();
    expect(calls).toEqual(['local-delete']);
    expect(outcome).toEqual({ serverCleared: true, revoked: true });
  });
});
