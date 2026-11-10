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
async function encryptEnc2(plain: string, keyHex = TEST_KEY_HEX, prefix = 'enc2'): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, new TextEncoder().encode(plain)),
  );
  const head = `${prefix}:${bytesToBase64(iv)}:${bytesToBase64(cipher)}`;
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

/* ── 2026-11-09 무렵 형식(실측 2026-11-10): 두 겹 난독화 · base64 검색 주소 · enc5 · 조각난 열쇠 · 요청 토큰 ──
 *
 * v2.5.8 을 낸 지 사흘 만에 컴시간이 다시 바꿔, 모든 사용자의 컴시간 불러오기·자동 동기화가
 * "mainRoute 코드를 찾지 못했어요"로 멈췄다. 화면에는 "검색 결과가 없어요"·"컴시간에 연결하지
 * 못했어요"로만 보였다(2026-11-09 신고 3건). 아래 픽스처는 실제 페이지에서 본 꼴을 그대로 흉내 낸다.
 */

const HOUR_TOKEN = '45DCA2C21A6D030AEB0E7E8AE08C5E6C7A48C5C48EA32E8CA4EE8CB44A6DF67B';

/** 열쇠를 네 조각으로 나눠 `a[2]+a[1]+a[3]+a[0]` 순서로 다시 잇게 한다 */
function splitKeyExpression(keyHex: string): string {
  const quarter = keyHex.length / 4;
  // 원래 순서 q0 q1 q2 q3 를 a[2]+a[1]+a[3]+a[0] 로 되살리려면 배열은 [q3, q1, q0, q2] 다.
  const q = [0, 1, 2, 3].map((i) => keyHex.slice(i * quarter, (i + 1) * quarter));
  const shuffled = [q[3], q[1], q[0], q[2]].map((part) => `'${part}'`).join(',');
  return `CryptoJS.enc.Hex.parse((function(a){return a[2]+a[1]+a[3]+a[0];})([${shuffled}]))`;
}

/** 안쪽 층 — 요청 함수와 복호화 함수 */
function innerScript(main: string, search: string): string {
  return [
    'function QAjaxSchool(sc, success) {',
    `    return $.ajax({ url:'./${main}?'+encodeURIComponent(btoa('${search}l'+encodeURIComponent(sc)+'_enc5')),`,
    "        headers:{'X-Hour-Token':window.__HourRequestToken || ''}, dataType:'text', success:success });}",
    'function QAjaxTimetable(sc, sc2, da1, r, success) { var s7=sc+sc2;',
    `    return $.ajax({ url:'./${main}?'+btoa(s7+'_'+da1+'_'+r+'_enc5'),`,
    "        headers:{'X-Hour-Token':window.__HourRequestToken || ''}, dataType:'text', success:success });}",
    `function HChange(data){ var key=${splitKeyExpression(TEST_KEY_HEX)}; }`,
  ].join('\n');
}

/** 감춘 블록 하나(실행 함수 + 자료) — obfuscatedPage 와 같은 XOR 규칙 */
function obfuscatedBlock(script: string, key: number): string {
  let hex = '';
  for (let i = 0; i < script.length; i++) {
    hex += (script.charCodeAt(i) ^ ((key + i * 13) & 255)).toString(16).padStart(4, '0');
  }
  const runner =
    "(function(a,k){var s='',i,j,b;for(i=0;i<a.length;i++){if(a[i][0]){s+=a[i][1];continue;}" +
    'b=a[i][1];for(j=0;j<b.length;j+=4){s+=String.fromCharCode(parseInt(b.substr(j,4),16)^((k+(j/4)*13)&255));}}(0,eval)(s);})';
  return `${runner}(${JSON.stringify([[0, hex]])},${key})`;
}

/** 바깥 층 — 화면 함수들 + 안쪽 층을 감춘 블록 */
function nestedPage(main: string, search: string, route: string): string {
  const outer = [
    'function 학교명단_출력하기(학교명단){var r=Math.floor(학교명단[i][0]/6347)+2;}',
    `function nal_change(){sc_data('${route}_',storage.sc,r,'0');}`,
    `/* hour-ajax-obfuscated-v1 */${obfuscatedBlock(innerScript(main, search), 41)}`,
    '원자료=Q자료(자료.자료166[학년][반][요일][교시]);일일자료=Q자료(자료.자료174[학년][반][요일][교시]);',
    '성명=Q성명(자료.자료191[th]);과목명=Q과목명(자료.자료102[sb]);',
  ].join('\n');
  return [
    '<html>',
    `<script>window.__HourRequestToken='${HOUR_TOKEN}';</script>`,
    `<script>/* hour-obfuscated-v2 */${obfuscatedBlock(outer, 83)}</script>`,
    '</html>',
  ].join('');
}

function nestedTransport(codes: readonly [string, string, string] = ['176147', '19164', '89614']) {
  const requests: { path: string; hourToken: string | null | undefined }[] = [];
  const [main, search, route] = codes;
  return {
    requests,
    async fetchRaw(path: string, hourToken?: string | null): Promise<ArrayBuffer> {
      requests.push({ path, hourToken });
      if (path === '/st') return toBuf(encodeEucKrBytes(nestedPage(main, search, route)));
      // 실제 서버처럼 토큰이 없으면 내용을 주지 않는다
      if (hourToken !== HOUR_TOKEN) return utf8WithPadding('. ');
      const searchPath = `/${main}?${encodeURIComponent(
        btoa(`${search}l${encodeURIComponent('온양여자고')}_enc5`),
      )}`;
      if (path === searchPath) {
        return utf8WithPadding(await encryptEnc2(NEW_SEARCH_JSON, TEST_KEY_HEX, 'enc5'));
      }
      if (path === `/${main}?${btoa(`${route}_77367_0_1_enc5`)}`) {
        return utf8WithPadding(await encryptEnc2(NEW_TIMETABLE_JSON, TEST_KEY_HEX, 'enc5'));
      }
      return utf8WithPadding('. ');
    },
  };
}

describe('revealComciganScripts — 겹쳐 감춘 층', () => {
  it('풀어낸 스크립트 안에 또 감춘 블록이 있으면 끝까지 풀고, 안쪽 층을 앞에 둔다', () => {
    const inner = "function QAjaxSchool(){return './176147?';}";
    const outer = `var outer=1;${obfuscatedBlock(inner, 41)}var tail=2;`;
    const page = `<script>${obfuscatedBlock(outer, 83)}</script>`;

    const revealed = revealComciganScripts(page);

    expect(revealed.startsWith(inner)).toBe(true);
    expect(revealed).toContain('var outer=1;');
    expect(revealed).toContain('var tail=2;');
  });
});

describe('ComciganApiClient — 2026-11-09 무렵 형식', () => {
  it('학교 검색: 안쪽 층에서 주소를 읽고, UTF-8 검색어를 base64 로 감싸 토큰과 함께 요청한다', async () => {
    const transport = nestedTransport();
    const client = new ComciganApiClient(transport);

    const schools = await client.searchSchools('온양여자고');

    expect(schools).toEqual([{ regionName: '충남', name: '온양여자고등학교', code: 77367 }]);
    expect(transport.requests[0]).toEqual({ path: '/st', hourToken: undefined });
    expect(transport.requests[1]).toEqual({
      path: `/176147?${encodeURIComponent(btoa(`19164l${encodeURIComponent('온양여자고')}_enc5`))}`,
      hourToken: HOUR_TOKEN,
    });
  });

  it('시간표: enc5 응답을 조각난 열쇠로 풀어 원자료·일일자료를 넘긴다', async () => {
    const transport = nestedTransport();
    const client = new ComciganApiClient(transport);

    const data = await client.getSchoolData(77367);

    expect(transport.requests[1]).toEqual({
      path: `/176147?${btoa('89614_77367_0_1_enc5')}`,
      hourToken: HOUR_TOKEN,
    });
    expect(data.schoolName).toBe('컴시간중');
    expect(data.teachers).toEqual(['', '박지*']);
    expect(data.baseGrid).toEqual([[], [[], [[], [2, 1001]]]]);
    expect(data.dailyGrid).toEqual([[], [[], [[], [2, 1001]]]]);
  });

  it('표식 숫자가 또 바뀌어도(enc7) base64 로 풀린다 — enc1 만 16진수다', async () => {
    const encrypted = await encryptEnc2('{"a":1}', TEST_KEY_HEX, 'enc7');
    expect(await decryptComciganText(encrypted, TEST_KEY_HEX)).toBe('{"a":1}');
  });
});
