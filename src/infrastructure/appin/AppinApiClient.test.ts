import { describe, it, expect } from 'vitest';
import { AppinApiClient, type AppinTransport } from './AppinApiClient';

/** 경로+메서드별 응답 문자열을 스텁하는 transport (네트워크 없음). ASCII 픽스처는 UTF-8/EUC-KR 동일. */
function fixtureTransport(map: Record<string, string>): {
  transport: AppinTransport;
  calls: { path: string; method: string; body?: string }[];
} {
  const calls: { path: string; method: string; body?: string }[] = [];
  const transport: AppinTransport = {
    async fetchBytes(path, init) {
      const method = init?.method ?? 'GET';
      calls.push({ path, method, body: init?.body });
      const content = map[`${method} ${path}`];
      if (content === undefined) throw new Error(`no fixture for ${method} ${path}`);
      return new TextEncoder().encode(content).buffer as ArrayBuffer;
    },
  };
  return { transport, calls };
}

describe('AppinApiClient — 학교조회·원소표·시간표·파일목록', () => {
  it('resolveSchool: getupdir 성공 응답 파싱 (webdir + date)', async () => {
    const { transport, calls } = fixtureTransport({
      'POST /tm/getupdir.php': '1&9999&75&20270220&1',
    });
    const client = new AppinApiClient(transport);
    const school = await client.resolveSchool('서울', '테스트고등학교');
    expect(school).toEqual({
      webdir: '9999',
      name: '테스트고등학교',
      city: '서울',
      date: '20270220',
    });
    // UTF-8 form-urlencoded 본문으로 POST
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toContain('hgsj=');
    expect(calls[0]!.body).toContain('hgm=');
  });

  it('resolveSchool: 미등록(nothing)이면 null', async () => {
    const { transport } = fixtureTransport({ 'POST /tm/getupdir.php': '1&nothing' });
    const client = new AppinApiClient(transport);
    expect(await client.resolveSchool('서울', '없는학교')).toBeNull();
  });

  it('getElements: dnele 응답에서 학급·교사번호·특별실 파싱', async () => {
    const { transport } = fixtureTransport({
      // field: status & 학급 & 교사번호 & 특별실 & 버전
      'POST /tm/dnele.php': '2&1-1,1-2,2-1&1,2,3&Room1,Room2&34',
    });
    const client = new AppinApiClient(transport);
    const ele = await client.getElements('9999');
    expect(ele.elements).toEqual(['1-1', '1-2', '2-1']);
    expect(ele.teacherNumbers).toEqual(['1', '2', '3']);
    expect(ele.movementRooms).toEqual(['Room1', 'Room2']);
  });

  it('getWeekFileText: 정적 파일 원문 반환', async () => {
    const { transport, calls } = fixtureTransport({
      'GET /tm/9999/h20.txt': 'Math^^Eng,PE',
    });
    const client = new AppinApiClient(transport);
    expect(await client.getWeekFileText('9999', 'h20.txt')).toBe('Math^^Eng,PE');
    expect(calls[0]!.method).toBe('GET');
  });

  it('listFiles: 디렉터리 인덱스에서 파일명·수정일 파싱', async () => {
    const html =
      '<tr><td valign="top"></td><td><a href="ele.txt">ele.txt</a></td>' +
      '<td align="right">2026-04-08 13:11  </td><td align="right">187</td></tr>' +
      '<tr><td valign="top"></td><td><a href="h20.txt">h20.txt</a></td>' +
      '<td align="right">2026-07-07 10:29  </td><td align="right">8.2k</td></tr>';
    const { transport } = fixtureTransport({ 'GET /tm/9999/': html });
    const client = new AppinApiClient(transport);
    const files = await client.listFiles('9999');
    expect(files).toEqual([
      { name: 'ele.txt', modified: '2026-04-08T13:11:00', size: '187' },
      { name: 'h20.txt', modified: '2026-07-07T10:29:00', size: '8.2k' },
    ]);
  });
});
