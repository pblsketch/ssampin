import { describe, it, expect } from 'vitest';
import { ComciganApiClient, type ComciganTransport } from './ComciganApiClient';
import { encodeEucKrBytes, encodeEucKrPercent } from './eucKr';
import { revealComciganScripts } from './comciganPage';
import { decryptComciganText } from './comciganCipher';
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
  일과시간: ['1(08:40)', '2(09:40)'],
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
    // 일과시간(교시별 시각)도 함께 통과된다
    expect(data.dayTimes).toEqual(['1(08:40)', '2(09:40)']);
    const ttPath = transport.requestedPaths.find((p) => p.startsWith('/36179_T?'));
    expect(ttPath).toBe(`/36179_T?${btoa('73629_77367_0_1')}`);
  });

  it('이번 주 일일자료(자료147)가 있으면 dailyGrid 로 함께 넘긴다', async () => {
    const transport = fixtureTransport({
      timetableBody: JSON.stringify({
        학교명: 'X',
        분리: 1000,
        자료446: ['', '박지*'],
        자료492: ['', '국어', '언매'],
        자료481: [[], [[], [[], [2, 1001, 0]]]],
        // 화요일 2교시가 보강으로 생김 — 컴시간은 바뀐 칸을 '>' 접두로 표시한다
        자료147: [[], [[], [[], [2, 1001, '>2001']]]],
      }),
    });
    const client = new ComciganApiClient(transport);
    const data = await client.getSchoolData(77367);
    expect(data.dailyGrid).toEqual([[], [[], [[], [2, 1001, '>2001']]]]);
    // 기본 편성표는 그대로(무회귀)
    expect(data.baseGrid).toEqual([[], [[], [[], [2, 1001, 0]]]]);
  });

  it('응답에 일일자료가 없으면 dailyGrid 를 비워 두고(undefined) 기본 편성표만 넘긴다', async () => {
    const transport = fixtureTransport();
    const client = new ComciganApiClient(transport);
    const data = await client.getSchoolData(77367);
    expect(data.dailyGrid).toBeUndefined();
    expect(Array.isArray(data.baseGrid)).toBe(true);
  });

  it('페이지에서 일일자료 코드를 못 찾아도 에러 없이 기본 편성표만 받는다', async () => {
    const stPage = ST_PAGE_FIXTURE.replace(
      ';일일자료=Q자료(자료.자료147[학년][반][요일][교시]);',
      ';',
    );
    const transport = fixtureTransport({
      stPage,
      timetableBody: JSON.stringify({
        학교명: 'X',
        분리: 1000,
        자료446: ['', '박지*'],
        자료492: ['', '국어'],
        자료481: [[], [[], [[], [2, 1001]]]],
        자료147: [[], [[], [[], [2, 1001]]]],
      }),
    });
    const client = new ComciganApiClient(transport);
    const data = await client.getSchoolData(77367);
    expect(data.dailyGrid).toBeUndefined();
    expect(data.teachers).toEqual(['', '박지*']);
  });

  it('일과시간이 없는 학교는 dayTimes 를 미제공(undefined)으로 둔다', async () => {
    const transport = fixtureTransport({
      timetableBody: JSON.stringify({
        학교명: 'X',
        분리: 1000,
        자료446: ['', '박지*'],
        자료492: ['', '국어'],
        자료481: [[], [[], [[], [2, 1001]]]],
      }),
    });
    const client = new ComciganApiClient(transport);
    const data = await client.getSchoolData(77367);
    expect(data.dayTimes).toBeUndefined();
    // 교사·과목 등 기존 필드는 그대로 (무회귀)
    expect(data.teachers).toEqual(['', '박지*']);
    expect(data.subjects).toEqual(['', '국어']);
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

/* ── 2026-11 형식: 난독화 페이지 + 암호화 응답 + 섞인 학교 번호 ── */

const TEST_KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

/** 컴시간 페이지와 같은 XOR 규칙으로 스크립트를 감춘 /st 페이지를 만든다 */
function obfuscatedPage(script: string, key = 83): string {
  let hex = '';
  for (let i = 0; i < script.length; i++) {
    hex += (script.charCodeAt(i) ^ ((key + i * 13) & 255)).toString(16).padStart(4, '0');
  }
  const runner =
    "(function(a,k){var s='',i,j,b;for(i=0;i<a.length;i++){if(a[i][0]){s+=a[i][1];continue;}" +
    'b=a[i][1];for(j=0;j<b.length;j+=4){s+=String.fromCharCode(parseInt(b.substr(j,4),16)^((k+(j/4)*13)&255));}}(0,eval)(s);})';
  return `<html><script>/* hour-obfuscated-v2 */${runner}(${JSON.stringify([[0, hex]])},${key})</script></html>`;
}

function newFormatScript(main: string, search: string, route: string): string {
  return [
    `function school_ra(sc){$.ajax({ url:'./${main}?${search}l'+sc+'_enc2'});}`,
    'function 학교명단_출력하기(학교명단){var r=Math.floor(학교명단[i][0]/6347)+2;}',
    `sc_data('${route}_',sc,1,'0');`,
    "var sc3='./" + main + "?'+btoa(s7+'_'+da1+'_'+r+'_enc2');",
    `var key=CryptoJS.enc.Hex.parse('${TEST_KEY_HEX}');`,
    '원자료=Q자료(자료.자료166[학년][반][요일][교시]);일일자료=Q자료(자료.자료174[학년][반][요일][교시]);',
    '성명=Q성명(자료.자료191[th]);과목명=Q과목명(자료.자료102[sb]);',
  ].join('\n');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** 컴시간 enc2 형식으로 암호화한다(AES-256-CBC + HMAC-SHA256) */
async function encryptEnc2(plain: string, keyHex = TEST_KEY_HEX): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, new TextEncoder().encode(plain)),
  );
  const head = `enc2:${bytesToBase64(iv)}:${bytesToBase64(cipher)}`;
  const macKey = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const tag = new Uint8Array(
    await crypto.subtle.sign('HMAC', macKey, new TextEncoder().encode(head)),
  );
  return `${head}:${bytesToBase64(tag)}`;
}

// 첫 칸 12694 → floor(12694/6347)+2 = 4번 칸이 진짜 번호. 3·5번 칸은 가짜다.
const NEW_SEARCH_JSON = JSON.stringify({
  학교검색: [[12694, '충남', '온양여자고등학교', 61566, 77367, 79097]],
});

const NEW_TIMETABLE_JSON = JSON.stringify({
  학교명: '컴시간중',
  분리: 1000,
  자료191: ['', '박지*'],
  자료102: ['', '국어'],
  자료166: [[], [[], [[], [2, 1001]]]],
  자료174: [[], [[], [[], [2, 1001]]]],
});

/** 라우트 묶음(main/search/route)별로 서버를 흉내 낸다. 현재 묶음이 아닌 요청엔 '.' 을 준다 */
function newFormatTransport(routeSets: readonly (readonly [string, string, string])[]) {
  const requestedPaths: string[] = [];
  let stCount = 0;
  let current = routeSets[0]!;
  return {
    requestedPaths,
    /** 서버가 라우트를 바꾼 상황을 만든다 */
    rotate(index: number) {
      current = routeSets[index]!;
    },
    async fetchRaw(path: string): Promise<ArrayBuffer> {
      requestedPaths.push(path);
      if (path === '/st') {
        stCount += 1;
        return toBuf(encodeEucKrBytes(obfuscatedPage(newFormatScript(...current))));
      }
      const [main, search, route] = current;
      if (path.startsWith(`/${main}?${search}l`) && path.endsWith('_enc2')) {
        return utf8WithPadding(await encryptEnc2(NEW_SEARCH_JSON));
      }
      if (path === `/${main}?${btoa(`${route}_77367_0_1_enc2`)}`) {
        return utf8WithPadding(await encryptEnc2(NEW_TIMETABLE_JSON));
      }
      return utf8WithPadding('. ');
    },
    get stCount() {
      return stCount;
    },
  };
}

describe('revealComciganScripts — 난독화 해제', () => {
  it('XOR 로 감춘 스크립트를 실행 없이 원문으로 되돌린다', () => {
    const script = "var a='./289153?31487l';원자료=Q자료(자료.자료166);";
    expect(revealComciganScripts(obfuscatedPage(script, 100))).toBe(script);
  });

  it('평문 조각은 그대로 잇는다', () => {
    const page = '(function(a,k){x((j/4)*13);(0,eval)(s);})([[1,"var x=1;"],[1,"var y=2;"]],5)';
    expect(revealComciganScripts(page)).toBe('var x=1;var y=2;');
  });

  it('감춘 블록이 없으면 빈 문자열을 돌려준다', () => {
    expect(revealComciganScripts('<html>평문 페이지</html>')).toBe('');
  });
});

describe('ComciganApiClient — 2026-11 암호화 형식', () => {
  it('학교 검색: 난독화 페이지에서 코드를 읽고, _enc2 로 요청해 응답을 풀고, 진짜 번호 칸을 고른다', async () => {
    const transport = newFormatTransport([['289153', '31487', '60392']]);
    const client = new ComciganApiClient(transport);

    const schools = await client.searchSchools('온양여자고');

    expect(schools).toEqual([{ regionName: '충남', name: '온양여자고등학교', code: 77367 }]);
    expect(transport.requestedPaths[1]).toBe(
      `/289153?31487l${encodeEucKrPercent('온양여자고')}_enc2`,
    );
  });

  it('시간표: _T 없이 _enc2 쿼리로 요청하고 풀어서 원자료·일일자료를 넘긴다', async () => {
    const transport = newFormatTransport([['289153', '31487', '60392']]);
    const client = new ComciganApiClient(transport);

    const data = await client.getSchoolData(77367);

    expect(transport.requestedPaths[1]).toBe(`/289153?${btoa('60392_77367_0_1_enc2')}`);
    expect(data.teachers).toEqual(['', '박지*']);
    expect(data.subjects).toEqual(['', '국어']);
    expect(data.baseGrid).toEqual([[], [[], [[], [2, 1001]]]]);
    expect(data.dailyGrid).toEqual([[], [[], [[], [2, 1001]]]]);
  });

  it('컴시간이 라우트를 바꾸면 캐시를 버리고 페이지를 다시 읽어 한 번 더 시도한다', async () => {
    const transport = newFormatTransport([
      ['289153', '31487', '60392'],
      ['656669', '55852', '83621'],
    ]);
    const client = new ComciganApiClient(transport);
    await client.searchSchools('온양');
    transport.rotate(1);

    const data = await client.getSchoolData(77367);

    expect(data.teachers).toEqual(['', '박지*']);
    expect(transport.stCount).toBe(2);
    expect(transport.requestedPaths.at(-1)).toBe(`/656669?${btoa('83621_77367_0_1_enc2')}`);
  });

  it('방금 읽은 라우트로도 실패하면 재시도 없이 SERVICE_CHANGED 로 던진다', async () => {
    const transport = newFormatTransport([['289153', '31487', '60392']]);
    const client = new ComciganApiClient(transport);

    await expect(client.getSchoolData(12345)).rejects.toMatchObject({
      errorType: 'SERVICE_CHANGED',
    });
    expect(transport.stCount).toBe(1);
  });

  it('인증값이 맞지 않는 암호문은 풀지 않고 SERVICE_CHANGED 로 던진다', async () => {
    const forged = await encryptEnc2(NEW_SEARCH_JSON);
    const parts = forged.split(':');
    const tampered = [...parts.slice(0, 3), bytesToBase64(new Uint8Array(32))].join(':');
    await expect(decryptComciganText(tampered, TEST_KEY_HEX)).rejects.toMatchObject({
      errorType: 'SERVICE_CHANGED',
    });
  });

  it('열쇠가 다르면 SERVICE_CHANGED 로 던진다', async () => {
    const other = 'ff'.repeat(32);
    await expect(
      decryptComciganText(await encryptEnc2(NEW_SEARCH_JSON), other),
    ).rejects.toMatchObject({ errorType: 'SERVICE_CHANGED' });
  });

  it('접두사가 없는 응답은 평문으로 그대로 돌려준다', async () => {
    expect(await decryptComciganText('{"a":1}\0\0', null)).toBe('{"a":1}');
  });
});
