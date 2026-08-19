/**
 * 사진 명렬표 파서 — 합성 픽스처로 검증.
 *
 * ⚠️ **실물 명렬표는 학생 개인정보라 저장소에 커밋할 수 없다**(회귀 규칙 #52).
 * 그래서 실물의 구조만 그대로 본뜬 가짜 파일을 코드로 만들어 시험한다.
 * 실물 2종(HWPML·`.xlsx`)에 대해서는 개발 중 로컬에서 22쌍 짝짓기를 확인했다.
 *
 * 이 파일이 고정하는 함정:
 * 1. `.hwp` 확장자에 두 포맷이 온다 → 매직 바이트로 갈라야 한다
 * 2. `.xlsx` 의 **자기닫힘 빈 셀이 뒤 셀을 삼킨다** (실물에서 이름 2명이 사라졌다)
 * 3. HWPML 은 **한 줄이 각각 별도의 표**라 `RowAddr` 가 전부 1이다 (그대로 묶으면 뭉개진다)
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parsePhotoRosterFile } from './PhotoRosterParserAdapter';

const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const NAMES = ['강나영', '김가영', '김나연', '김드보라'];
/** 실물과 같은, 띄엄띄엄한 열 배치 */
const COLS = [1, 3, 6, 8];

// ────────────────────────────────── .xlsx 합성

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

interface XlsxOptions {
  /** 사진을 붙이지 않을 열 (사진 누락 재현) */
  readonly skipPhotoCols?: readonly number[];
  /** 격자 밖에 사진 1장을 더 붙인다 (학교 로고 혼입 재현) */
  readonly strayPhotoAt?: { readonly row: number; readonly col: number };
}

function buildXlsx(options: XlsxOptions = {}): Uint8Array {
  const photoRow = 7; // 0 기준
  const nameRow = photoRow + 1;

  const sharedStrings =
    `<?xml version="1.0"?><sst count="${NAMES.length}" uniqueCount="${NAMES.length}">` +
    NAMES.map((name, i) => `<si><t>${i + 1}번  ${name}</t></si>`).join('') +
    `</sst>`;

  // ⚠️ 이름 칸 사이에 자기닫힘 빈 셀을 일부러 끼워 넣는다 — 실물과 같은 모양이다.
  const cells = COLS.map((col, i) => {
    const emptyBefore = `<c r="${columnLetter(col - 1)}${nameRow + 1}" s="12"/>`;
    const nameCell = `<c r="${columnLetter(col)}${nameRow + 1}" t="s" s="13"><v>${i}</v></c>`;
    return emptyBefore + nameCell;
  }).join('');
  const sheet =
    `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="${nameRow + 1}">${cells}</row>` +
    `</sheetData></worksheet>`;

  const anchors = COLS.filter((col) => !options.skipPhotoCols?.includes(col)).map(
    (col, i) =>
      `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
      `<xdr:row>${photoRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:pic><xdr:blipFill><a:blip r:embed="rId${i + 1}"/></xdr:blipFill></xdr:pic>` +
      `</xdr:twoCellAnchor>`,
  );
  if (options.strayPhotoAt) {
    anchors.push(
      `<xdr:twoCellAnchor><xdr:from><xdr:col>${options.strayPhotoAt.col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${options.strayPhotoAt.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:pic><xdr:blipFill><a:blip r:embed="rId${anchors.length + 1}"/></xdr:blipFill></xdr:pic>` +
        `</xdr:twoCellAnchor>`,
    );
  }
  const drawing = `<?xml version="1.0"?><xdr:wsDr>${anchors.join('')}</xdr:wsDr>`;

  const drawingRels =
    `<?xml version="1.0"?><Relationships>` +
    anchors
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="image" Target="../media/image${i + 1}.jpeg"/>`,
      )
      .join('') +
    `</Relationships>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/sharedStrings.xml': strToU8(sharedStrings),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/worksheets/_rels/sheet1.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    ),
    'xl/drawings/drawing1.xml': strToU8(drawing),
    'xl/drawings/_rels/drawing1.xml.rels': strToU8(drawingRels),
  };
  anchors.forEach((_, i) => {
    files[`xl/media/image${i + 1}.jpeg`] = FAKE_JPEG;
  });
  return zipSync(files);
}

// ────────────────────────────────── HWPML 합성

interface HwpmlOptions {
  /** 격자 밖에 그림 1장을 더 넣는다 (학교 로고 혼입 재현) */
  readonly withLogo?: boolean;
  /** 사진을 넣지 않을 학생 번호(1부터) */
  readonly skipPhotoFor?: number;
}

function buildHwpml(options: HwpmlOptions = {}): Uint8Array {
  const base64 = 'AAAA';
  const pictures: string[] = [];
  let binId = 0;

  if (options.withLogo) {
    binId += 1;
    // 로고는 학생 사진 줄과 전혀 다른 높이에 놓인다
    pictures.push(picture(binId, 1000, 1000));
  }
  NAMES.forEach((_, i) => {
    if (options.skipPhotoFor === i + 1) return;
    binId += 1;
    pictures.push(picture(binId, 13680, 6667 + i * 7000));
  });

  const binaries = Array.from(
    { length: binId },
    (_, i) => `<BINDATA Id="${i + 1}" Size="3" Encoding="Base64">${base64}</BINDATA>`,
  ).join('');

  // ⚠️ 실물처럼 **한 줄이 하나의 표**다 — 모든 셀의 RowAddr 이 1이다.
  const table =
    `<TABLE>` +
    NAMES.map(
      (name, i) =>
        `<CELL ColAddr="${COLS[i]}" RowAddr="1" ColSpan="1" RowSpan="1">` +
        `<PARALIST><P><TEXT><CHAR>${i + 1}번  ${name}</CHAR></TEXT></P></PARALIST></CELL>`,
    ).join('') +
    `</TABLE>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" Version="2.1">` +
    `<BODY>${pictures.join('')}${table}</BODY>` +
    `<BINDATASTORAGE>${binaries}</BINDATASTORAGE></HWPML>`;

  const body = new TextEncoder().encode(xml);
  const out = new Uint8Array(3 + body.length);
  out.set([0xef, 0xbb, 0xbf], 0); // 실물과 같은 UTF-8 BOM
  out.set(body, 3);
  return out;
}

function picture(binItem: number, vert: number, horz: number): string {
  return (
    `<PICTURE><SHAPEOBJECT><POSITION TreatAsChar="false" VertRelTo="Page" HorzRelTo="Page"` +
    ` VertOffset="${vert}" HorzOffset="${horz}"/></SHAPEOBJECT>` +
    `<IMAGE Bright="0" Contrast="0" Effect="RealPic" BinItem="${binItem}"/></PICTURE>`
  );
}

// ────────────────────────────────── 시험

describe('parsePhotoRosterFile — .xlsx', () => {
  it('사진과 이름이 자리대로 맞물린다', () => {
    const outcome = parsePhotoRosterFile(buildXlsx());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.format).toBe('xlsx');
    expect(outcome.result.pairing.ok).toBe(true);
    if (!outcome.result.pairing.ok) return;
    expect(outcome.result.pairing.pairs.map((p) => p.name)).toEqual(NAMES);
  });

  it('★자기닫힘 빈 셀이 뒤 셀을 삼키지 않는다 (실물에서 이름 2명이 사라졌던 함정)', () => {
    const outcome = parsePhotoRosterFile(buildXlsx());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 빈 셀이 삼켰다면 4명이 아니라 2명만 읽힌다
    expect(outcome.result.names).toHaveLength(NAMES.length);
    expect(outcome.result.names.map((n) => n.studentNumber)).toEqual([1, 2, 3, 4]);
  });

  it('사진 1장이 빠지면 자동 짝짓기를 포기하되 이름은 살린다', () => {
    const outcome = parsePhotoRosterFile(buildXlsx({ skipPhotoCols: [6] }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pairing.ok).toBe(false);
    if (outcome.result.pairing.ok) return;
    expect(outcome.result.pairing.reason).toBe('PHOTO_COUNT_MISMATCH');
    // ★ 이름은 그대로 남아 있어야 한다 — 사진만 포기하고 보정 화면으로 넘어간다
    expect(outcome.result.names).toHaveLength(4);
  });

  it('★로고 혼입 + 사진 누락: 개수는 맞아도 자리가 어긋나면 잡는다', () => {
    const outcome = parsePhotoRosterFile(
      buildXlsx({ skipPhotoCols: [6], strayPhotoAt: { row: 0, col: 0 } }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.photos).toHaveLength(outcome.result.names.length);
    expect(outcome.result.pairing.ok).toBe(false);
    if (outcome.result.pairing.ok) return;
    expect(outcome.result.pairing.reason).toBe('PHOTO_ANCHOR_MISMATCH');
  });
});

describe('parsePhotoRosterFile — HWPML', () => {
  it('떠 있는 사진의 페이지 좌표로 격자를 복원해 이름과 맞물린다', () => {
    const outcome = parsePhotoRosterFile(buildHwpml());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.format).toBe('hwpml');
    expect(outcome.result.pairing.ok).toBe(true);
    if (!outcome.result.pairing.ok) return;
    expect(outcome.result.pairing.pairs.map((p) => p.name)).toEqual(NAMES);
  });

  it('★학교 로고가 그림 목록에 섞여 있으면 자동 짝짓기를 포기한다', () => {
    // 그림 번호는 문서 전체가 공유하므로 로고도 같은 번호 공간을 쓴다.
    // 로고 1장 + 사진 1장 누락이면 개수는 그대로라 개수 검산만으로는 못 잡는다.
    const outcome = parsePhotoRosterFile(buildHwpml({ withLogo: true, skipPhotoFor: 2 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.photos).toHaveLength(outcome.result.names.length);
    expect(outcome.result.pairing.ok).toBe(false);
  });
});

describe('parsePhotoRosterFile — 지원하지 않는 형식', () => {
  const cases: ReadonlyArray<[string, Uint8Array]> = [
    [
      'hwp-ole2',
      new Uint8Array([
        0xd0,
        0xcf,
        0x11,
        0xe0,
        0xa1,
        0xb1,
        0x1a,
        0xe1,
        ...new TextEncoder().encode([...'BodyText'].map((c) => `${c}\0`).join('')),
      ]),
    ],
    [
      'xls-biff8',
      new Uint8Array([
        0xd0,
        0xcf,
        0x11,
        0xe0,
        0xa1,
        0xb1,
        0x1a,
        0xe1,
        ...new TextEncoder().encode([...'Workbook'].map((c) => `${c}\0`).join('')),
      ]),
    ],
    ['hwpx', new TextEncoder().encode('PKmimetypeapplication/hwp+zip')],
    ['unknown', new TextEncoder().encode('아무 텍스트')],
  ];

  it.each(cases)('%s 는 조용히 실패하지 않고 안내 문구를 준다', (format, bytes) => {
    const outcome = parsePhotoRosterFile(bytes);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.format).toBe(format);
    // "열 수 없습니다"로 끝내지 않고 무엇을 하면 되는지 알려 줘야 한다
    expect(outcome.guide.length).toBeGreaterThan(10);
    expect(outcome.guide).toMatch(/나이스|명렬표/);
  });
});

/**
 * ★ QA 발견 C1 — 같은 줄 안에서 사진이 밀리는 경우.
 *
 * 좌표를 논리 격자로 **압축**하면 절대 위치가 사라져서, 검산이 사실상
 * "줄별 인원수가 같은가"로 약해진다. 같은 줄에 로고가 1장 끼고 학생 사진이 1장 빠지면
 * 개수가 그대로라 **경고 없이 전원이 한 칸씩 밀린다** — 이 기능의 유일한 치명 실패다.
 */
describe('parsePhotoRosterFile — HWPML 같은 줄 밀림 (C1)', () => {
  /** 한 줄에 사진을 직접 배치한다. gaps 로 간격을 흐트러뜨릴 수 있다. */
  function buildHwpmlRow(horzOffsets: readonly number[]): Uint8Array {
    const pics = horzOffsets.map((h, i) => picture(i + 1, 13680, h)).join('');
    const binaries = horzOffsets
      .map((_, i) => `<BINDATA Id="${i + 1}" Size="3" Encoding="Base64">AAAA</BINDATA>`)
      .join('');
    const table =
      `<TABLE>` +
      NAMES.map(
        (name, i) =>
          `<CELL ColAddr="${COLS[i]}" RowAddr="1" ColSpan="1" RowSpan="1">` +
          `<PARALIST><P><TEXT><CHAR>${i + 1}번  ${name}</CHAR></TEXT></P></PARALIST></CELL>`,
      ).join('') +
      `</TABLE>`;
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" Version="2.1">` +
      `<BODY>${pics}${table}</BODY><BINDATASTORAGE>${binaries}</BINDATASTORAGE></HWPML>`;
    const body = new TextEncoder().encode(xml);
    const out = new Uint8Array(3 + body.length);
    out.set([0xef, 0xbb, 0xbf], 0);
    out.set(body, 3);
    return out;
  }

  /** 실물처럼 일정한 간격(7000)으로 4장 */
  const EVEN = [6667, 13667, 20667, 27667];

  it('간격이 고른 정상 파일은 그대로 통과한다', () => {
    const outcome = parsePhotoRosterFile(buildHwpmlRow(EVEN));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pairing.ok).toBe(true);
  });

  it('★1번 사진이 빠지고 같은 줄에 로고가 끼면 개수는 맞지만 반드시 걸러야 한다', () => {
    // 1번 자리 사진이 없고, 3번과 4번 사이(간격 밖)에 로고가 한 장 들어갔다.
    // 개수는 4장 그대로라 "줄별 인원수" 검산만으로는 통과해 버린다.
    const withLogo = [13667, 20667, 24000, 27667];
    const outcome = parsePhotoRosterFile(buildHwpmlRow(withLogo));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.photos).toHaveLength(outcome.result.names.length); // 개수는 맞는 상황
    expect(
      outcome.result.pairing.ok,
      '간격이 흐트러졌는데 자동 짝짓기를 통과시키면 얼굴이 밀린 채 저장된다',
    ).toBe(false);
  });

  it('★사진 한 장이 빠져 간격이 두 배가 되면 걸러야 한다', () => {
    const missing = [6667, 20667, 27667, 34667]; // 두 번째가 빠져 첫 간격이 2배
    const outcome = parsePhotoRosterFile(buildHwpmlRow(missing));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pairing.ok).toBe(false);
  });
});
