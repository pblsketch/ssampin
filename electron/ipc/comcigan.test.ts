/**
 * 컴시간 통신 위임 — 세션 쿠키와 요청 토큰.
 *
 * 2026-11-09 무렵부터 컴시간은 /st 가 내려 준 쿠키와 페이지의 요청 토큰을 검색·시간표 요청에
 * 함께 받는다. 메인이 쿠키를 받아 두었다가 붙이고, 토큰은 renderer 가 넘긴 값을 형식만 확인해
 * 싣는다. renderer 가 넘긴 글자가 머리말에 그대로 들어가므로 형식 검사가 곧 방어선이다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
const safeFetchBytes = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
  },
}));
vi.mock('../security/safeFetch', () => ({
  safeFetchBytes: (...args: unknown[]) => safeFetchBytes(...args),
}));

import { buildComciganHeaders, parseSessionCookies, registerComciganHandlers } from './comcigan';

const TOKEN = '45DCA2C21A6D030AEB0E7E8AE08C5E6C7A48C5C48EA32E8CA4EE8CB44A6DF67B';

function okResponse(setCookie: string[] = []) {
  return {
    body: new Uint8Array([1, 2, 3]),
    contentType: 'text/html',
    contentDisposition: null,
    finalUrl: 'http://comci.net:4082/st',
    status: 200,
    setCookie,
  };
}

describe('parseSessionCookies', () => {
  it('Set-Cookie 에서 이름=값만 뽑고 속성은 버린다', () => {
    expect(
      parseSessionCookies([`HourSession4082S=${TOKEN}; Path=/; HttpOnly; SameSite=Strict`]),
    ).toEqual([`HourSession4082S=${TOKEN}`]);
  });

  it('머리말을 깨뜨릴 수 있는 글자가 든 쿠키는 버린다', () => {
    expect(parseSessionCookies(['a=b\r\nX-Evil: 1', 'bad name=1', '=novalue', 'ok=1'])).toEqual([
      'ok=1',
    ]);
  });
});

describe('buildComciganHeaders', () => {
  it('/st 를 받을 때는 아무것도 붙이지 않는다(새 세션을 여는 요청)', () => {
    expect(buildComciganHeaders('/st', TOKEN, ['HourSession4082S=abc'])).toEqual({});
  });

  it('다른 요청에는 쿠키·토큰·Referer 를 붙인다', () => {
    expect(buildComciganHeaders('/176147?abc', TOKEN, ['HourSession4082S=abc'])).toEqual({
      Referer: 'http://comci.net:4082/st',
      Cookie: 'HourSession4082S=abc',
      'X-Hour-Token': TOKEN,
    });
  });

  it('형식이 어긋난 토큰은 싣지 않는다', () => {
    for (const bad of ['short', `${TOKEN}\r\nX-Evil: 1`, 'has space in token 0123456789', 12345]) {
      expect(buildComciganHeaders('/176147?abc', bad, [])).toEqual({
        Referer: 'http://comci.net:4082/st',
      });
    }
  });
});

describe("'comcigan:fetch' 처리기", () => {
  beforeEach(() => {
    handlers.clear();
    safeFetchBytes.mockReset();
    registerComciganHandlers();
  });

  const call = (args: unknown) => handlers.get('comcigan:fetch')!({}, args);

  it('/st 응답의 쿠키를 받아 두었다가 뒤이은 요청에 토큰과 함께 붙인다', async () => {
    safeFetchBytes.mockResolvedValueOnce(
      okResponse([`HourSession4082S=${TOKEN}; Path=/; HttpOnly`]),
    );
    safeFetchBytes.mockResolvedValueOnce(okResponse());

    await call({ path: '/st' });
    await call({ path: '/176147?abc', hourToken: TOKEN });

    expect(safeFetchBytes.mock.calls[0]?.[1]).toMatchObject({ extraHeaders: {} });
    expect(safeFetchBytes.mock.calls[1]?.[0]).toBe('http://comci.net:4082/176147?abc');
    expect(safeFetchBytes.mock.calls[1]?.[1]).toMatchObject({
      allowedHosts: ['comci.net'],
      extraHeaders: {
        Referer: 'http://comci.net:4082/st',
        Cookie: `HourSession4082S=${TOKEN}`,
        'X-Hour-Token': TOKEN,
      },
    });
  });

  it('새 /st 가 쿠키를 주지 않으면(옛 형식) 들고 있던 쿠키를 비운다', async () => {
    safeFetchBytes.mockResolvedValueOnce(okResponse(['HourSession4082S=old; Path=/']));
    safeFetchBytes.mockResolvedValueOnce(okResponse([]));
    safeFetchBytes.mockResolvedValueOnce(okResponse());

    await call({ path: '/st' });
    await call({ path: '/st' });
    await call({ path: '/36179?17384l' });

    expect(safeFetchBytes.mock.calls[2]?.[1]).toMatchObject({
      extraHeaders: { Referer: 'http://comci.net:4082/st' },
    });
  });

  it('다른 호스트로 나가는 경로는 거절한다', async () => {
    expect(await call({ path: '//evil.example/st' })).toMatchObject({ status: 'error' });
    expect(await call({ path: 'http://evil.example/st' })).toMatchObject({ status: 'error' });
    expect(safeFetchBytes).not.toHaveBeenCalled();
  });
});
