import { describe, it, expect } from 'vitest';
import { ComciganApiClient, type ComciganTransport } from './ComciganApiClient';
import { encodeEucKrBytes, encodeEucKrPercent } from './eucKr';
import { ComciganError } from '@domain/entities/ComciganTimetable';

/* ── EUC-KR 인코더 ── */

describe('eucKr — TextDecoder 역테이블 인코더', () => {
  it("'가'를 EUC-KR 표준 바이트 B0A1 로 인코딩한다", () => {
    expect([...encodeEucKrBytes('가')]).toEqual([0xb0, 0xa1]);
  });

  it('한글 문자열이 디코더와 왕복 일치한다', () => {
    const text = '온양여자고등학교';
    const bytes = encodeEucKrBytes(text);
    expect(new TextDecoder('euc-kr').decode(bytes)).toBe(text);
  });

  it('ASCII 는 1바이트 그대로 통과한다', () => {
    expect([...encodeEucKrBytes('ab1')]).toEqual([0x61, 0x62, 0x31]);
  });

  it('퍼센트 인코딩은 모든 바이트를 %xx 2자리로 표기한다', () => {
    expect(encodeEucKrPercent('가')).toBe('%b0%a1');
  });
});

/* ── ComciganApiClient — 픽스처 transport ── */

/** 2026-07 실측 구조를 재현한 /st 페이지 조각 (EUC-KR 인코딩되어 제공됨) */
const ST_PAGE_FIXTURE = [
  "var sc_url='./36179?17384l';",
  "var route='73629_';",
  '원자료=Q자료(자료.자료481[학년][반][요일][교시]);일일자료=Q자료(자료.자료147[학년][반][요일][교시]);',
  '성명=Q성명(자료.자료446[th]);과목명=Q과목명(자료.자료492[sb]);',
].join('\n');

const SEARCH_JSON = JSON.stringify({
  학교검색: [[24, '충남', '온양여자고등학교', 77367]],
});

const TIMETABLE_JSON = JSON.stringify({
  학교명: '온양여자고등학교',
  분리: 1000,
  자료446: ['', '박지*', '백순*'],
  자료492: ['', '국어', '언매'],
  자료481: [[], [[], [[], [2, 2002, 1001]]]],
});

function toBuf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function utf8WithPadding(text: string): ArrayBuffer {
  return toBuf(new TextEncoder().encode(`${text}\0\0\0`));
}

function fixtureTransport(overrides?: {
  stPage?: string;
  timetableBody?: string;
}): ComciganTransport & { requestedPaths: string[] } {
  const requestedPaths: string[] = [];
  return {
    requestedPaths,
    async fetchRaw(path: string): Promise<ArrayBuffer> {
      requestedPaths.push(path);
      if (path === '/st') {
        return toBuf(encodeEucKrBytes(overrides?.stPage ?? ST_PAGE_FIXTURE));
      }
      if (path.startsWith('/36179_T?')) {
        return utf8WithPadding(overrides?.timetableBody ?? TIMETABLE_JSON);
      }
      if (path.startsWith('/36179?17384l')) {
        return utf8WithPadding(SEARCH_JSON);
      }
      throw new Error(`unexpected path: ${path}`);
    },
  };
}

describe('ComciganApiClient — 라우트 추출·검색·시간표 수신', () => {
  it('학교 검색: /st 라우트 추출 → EUC-KR 쿼리로 검색 → 결과 매핑', async () => {
    const transport = fixtureTransport();
    const client = new ComciganApiClient(transport);

    const schools = await client.searchSchools('온양여자고등학교');

    expect(schools).toEqual([{ regionName: '충남', name: '온양여자고등학교', code: 77367 }]);
    const searchPath = transport.requestedPaths.find((p) => p.startsWith('/36179?'));
    expect(searchPath).toBe(`/36179?17384l${encodeEucKrPercent('온양여자고등학교')}`);
  });

  it('빈 검색어는 통신 없이 빈 배열을 반환한다', async () => {
    const transport = fixtureTransport();
    const client = new ComciganApiClient(transport);
    expect(await client.searchSchools('   ')).toEqual([]);
    expect(transport.requestedPaths).toHaveLength(0);
  });

  it('학교 데이터: base64 쿼리로 요청하고 \\0 패딩을 제거해 필드를 추출한다', async () => {
    const transport = fixtureTransport();
    const client = new ComciganApiClient(transport);

    const data = await client.getSchoolData(77367);

    expect(data.schoolName).toBe('온양여자고등학교');
    expect(data.separator).toBe(1000);
    expect(data.teachers).toEqual(['', '박지*', '백순*']);
    expect(data.subjects).toEqual(['', '국어', '언매']);
    expect(Array.isArray(data.baseGrid)).toBe(true);
    const ttPath = transport.requestedPaths.find((p) => p.startsWith('/36179_T?'));
    expect(ttPath).toBe(`/36179_T?${btoa('73629_77367_0_1')}`);
  });

  it('라우트 코드는 캐시되어 /st 를 한 번만 요청한다', async () => {
    const transport = fixtureTransport();
    const client = new ComciganApiClient(transport);
    await client.searchSchools('온양');
    await client.getSchoolData(77367);
    expect(transport.requestedPaths.filter((p) => p === '/st')).toHaveLength(1);
  });

  it('컴시간 페이지 구조가 바뀌면 SERVICE_CHANGED 에러를 던진다', async () => {
    const transport = fixtureTransport({ stPage: '<html>구조가 완전히 바뀐 페이지</html>' });
    const client = new ComciganApiClient(transport);
    await expect(client.searchSchools('온양')).rejects.toMatchObject({
      name: 'ComciganError',
      errorType: 'SERVICE_CHANGED',
    });
  });

  it('시간표 응답이 JSON 이 아니면 SERVICE_CHANGED 에러를 던진다', async () => {
    const transport = fixtureTransport({ timetableBody: '<html>점검 중</html>' });
    const client = new ComciganApiClient(transport);
    await expect(client.getSchoolData(77367)).rejects.toBeInstanceOf(ComciganError);
  });

  it('필수 자료 키가 빠진 응답은 SERVICE_CHANGED 로 판정한다', async () => {
    const transport = fixtureTransport({
      timetableBody: JSON.stringify({ 학교명: 'X', 분리: 1000 }),
    });
    const client = new ComciganApiClient(transport);
    await expect(client.getSchoolData(77367)).rejects.toMatchObject({
      errorType: 'SERVICE_CHANGED',
    });
  });
});
