/**
 * 사진 명렬표가 **2쪽 이상**인 경우.
 *
 * ## 왜 따로 다루나
 *
 * 한 반이 28명이 넘거나 여러 반이 섞인 수업반이면 명렬표가 한 쪽에 안 들어간다.
 * 그런데 두 포맷 모두 "쪽이 넘어가면 좌표가 처음으로 되돌아가는" 성질이 있다.
 *
 * | 포맷 | 2쪽에서 무슨 일이 일어나나 |
 * |---|---|
 * | 한글(HWPML) | 사진 위치가 `VertRelTo="Page"` — **쪽 기준**이라 2쪽 첫 줄의 세로값이 1쪽 첫 줄과 똑같다 |
 * | 엑셀(.xlsx) | 시트가 나뉘면 `(행, 열)` 이 시트마다 처음부터 다시 시작한다 |
 *
 * 둘 다 그대로 두면 **다른 줄의 사진이 같은 자리로 뭉개진다.** 검산이 잡아 주므로 얼굴이
 * 뒤바뀌지는 않지만(그건 이 기능의 유일한 치명 실패다), 2쪽짜리 파일은 **사진을 통째로
 * 못 쓰게 된다.** 선생님 입장에서는 "되는 반과 안 되는 반"이 갈리는 셈이다.
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parsePhotoRosterFile } from './PhotoRosterParserAdapter';

const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/**
 * 실물과 같은 배치 — **한 쪽에 세 줄**, 한 줄에 최대 8명.
 * 1쪽 24명(8·8·8) + 2쪽 14명(8·6) = 38명.
 *
 * ⚠️ 쪽마다 줄이 하나뿐인 파일로 시험하면 안 된다. 그런 파일에는 "쪽이 넘어갔다"는
 * 단서가 좌표에 남지 않는데(세로값이 줄지 않는다), 실물에서는 한 쪽이 한 줄로 끝나면
 * 애초에 2쪽이 생기지 않으므로 있을 수 없는 모양이다.
 */
const PAGE1_ROWS = [
  ['강나영', '김가영', '김나연', '김도윤', '김서준', '김지우', '박민서', '박서연'],
  ['배하윤', '서준호', '송지아', '신예린', '오하람', '유서진', '윤도현', '이가온'],
  ['이서준', '이수아', '이유진', '임하늘', '장민준', '정예은', '조하린', '차우진'],
];
const PAGE2_ROWS = [
  ['최지훈', '한소율', '홍시우', '황보름', '구본우', '남지호', '도하윤', '류시온'],
  ['문가람', '민서우', '반예솔', '설유나', '심재현', '안도경'],
];
const ROW_VERTS = [13680, 27352, 41025];
const COLS = [1, 3, 6, 8, 12, 16, 19, 24];
const ALL_NAMES = [...PAGE1_ROWS, ...PAGE2_ROWS].flat();

/* ────────────────────────────────── 한글(HWPML) 2쪽 */

function picture(binItem: number, vert: number, horz: number): string {
  return (
    `<PICTURE><SHAPEOBJECT><POSITION TreatAsChar="false" VertRelTo="Page" HorzRelTo="Page"` +
    ` VertOffset="${vert}" HorzOffset="${horz}"/></SHAPEOBJECT>` +
    `<IMAGE Bright="0" Contrast="0" Effect="RealPic" BinItem="${binItem}"/></PICTURE>`
  );
}

function table(names: readonly string[], startNumber: number): string {
  return (
    `<TABLE>` +
    names
      .map(
        (name, i) =>
          `<CELL ColAddr="${COLS[i]}" RowAddr="1" ColSpan="1" RowSpan="1">` +
          `<PARALIST><P><TEXT><CHAR>${startNumber + i}번  ${name}</CHAR></TEXT></P></PARALIST></CELL>`,
      )
      .join('') +
    `</TABLE>`
  );
}

/**
 * 2쪽짜리 한글 명렬표.
 *
 * ⚠️ 핵심: **2쪽의 세로 좌표가 1쪽 값을 그대로 다시 쓴다.** 실물이 그렇다 —
 * 좌표가 쪽 기준(`VertRelTo="Page"`)이라 새 쪽이 시작되면 맨 위부터 다시 센다.
 */
function buildTwoPageHwpml(): Uint8Array {
  let binId = 0;
  let number = 1;
  const parts: string[] = [];

  for (const page of [PAGE1_ROWS, PAGE2_ROWS]) {
    page.forEach((names, rowIndex) => {
      const pictures = names.map((_, i) => {
        binId += 1;
        return picture(binId, ROW_VERTS[rowIndex]!, 6667 + i * 7000);
      });
      parts.push(pictures.join(''));
      parts.push(table(names, number));
      number += names.length;
    });
  }

  const binaries = Array.from(
    { length: binId },
    (_, i) => `<BINDATA Id="${i + 1}" Size="3" Encoding="Base64">AAAA</BINDATA>`,
  ).join('');

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" Version="2.1">` +
    `<BODY>${parts.join('')}</BODY>` +
    `<BINDATASTORAGE>${binaries}</BINDATASTORAGE></HWPML>`;

  const body = new TextEncoder().encode(xml);
  const out = new Uint8Array(3 + body.length);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

/* ────────────────────────────────── 엑셀 2쪽 */

function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface SheetSpec {
  readonly names: readonly string[];
  readonly startNumber: number;
  readonly photoRow: number;
}

/** 시트가 여러 장인 엑셀 (인쇄 2쪽이 시트 2장으로 나온 경우) */
function buildMultiSheetXlsx(sheets: readonly SheetSpec[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const allStrings: string[] = [];
  let mediaIndex = 0;

  sheets.forEach((sheet, sheetIdx) => {
    const cells = sheet.names.map((name, i) => `${sheet.startNumber + i}번  ${name}`);
    const base = allStrings.length;
    allStrings.push(...cells);

    const nameRow = sheet.photoRow + 1;
    const rowXml =
      `<row r="${nameRow + 1}">` +
      sheet.names
        .map(
          (_, i) => `<c r="${columnLetter(COLS[i]!)}${nameRow + 1}" t="s"><v>${base + i}</v></c>`,
        )
        .join('') +
      `</row>`;

    files[`xl/worksheets/sheet${sheetIdx + 1}.xml`] = strToU8(
      `<worksheet><sheetData>${rowXml}</sheetData>` + `<drawing r:id="rId1"/></worksheet>`,
    );
    files[`xl/worksheets/_rels/sheet${sheetIdx + 1}.xml.rels`] = strToU8(
      `<Relationships><Relationship Id="rId1" Target="../drawings/drawing${sheetIdx + 1}.xml"/></Relationships>`,
    );

    const anchors = sheet.names
      .map(
        (_, i) =>
          `<xdr:twoCellAnchor><xdr:from><xdr:col>${COLS[i]}</xdr:col><xdr:colOff>0</xdr:colOff>` +
          `<xdr:row>${sheet.photoRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
          `<xdr:pic><xdr:blipFill><a:blip r:embed="rId${i + 1}"/></xdr:blipFill></xdr:pic>` +
          `</xdr:twoCellAnchor>`,
      )
      .join('');
    files[`xl/drawings/drawing${sheetIdx + 1}.xml`] = strToU8(`<xdr:wsDr>${anchors}</xdr:wsDr>`);
    files[`xl/drawings/_rels/drawing${sheetIdx + 1}.xml.rels`] = strToU8(
      `<Relationships>` +
        sheet.names
          .map((_, i) => {
            mediaIndex += 1;
            return `<Relationship Id="rId${i + 1}" Target="../media/image${mediaIndex}.jpeg"/>`;
          })
          .join('') +
        `</Relationships>`,
    );
  });

  for (let i = 1; i <= mediaIndex; i++) files[`xl/media/image${i}.jpeg`] = FAKE_JPEG;
  files['xl/sharedStrings.xml'] = strToU8(
    `<sst>${allStrings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
  );
  files['[Content_Types].xml'] = strToU8('<Types/>');
  return zipSync(files);
}

/* ────────────────────────────────── 시험 */

describe('2쪽짜리 사진 명렬표 — 한글(HWPML)', () => {
  it('★2쪽의 세로 좌표가 1쪽과 겹쳐도 학생 38명과 사진 38장이 제대로 짝지어진다', () => {
    const outcome = parsePhotoRosterFile(buildTwoPageHwpml());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.names).toHaveLength(38);
    expect(outcome.result.photos).toHaveLength(38);
    // ★ 여기가 핵심 — 좌표가 겹쳐 뭉개지면 짝짓기가 실패한다
    expect(outcome.result.pairing.ok).toBe(true);
  });

  it('★2쪽 학생의 이름이 그대로 살아 있다 (밀리면 다른 사람 얼굴이 된다)', () => {
    const outcome = parsePhotoRosterFile(buildTwoPageHwpml());
    if (!outcome.ok || !outcome.result.pairing.ok) throw new Error('짝짓기 실패');

    const pairs = outcome.result.pairing.pairs;
    // 학번 순으로 정렬되므로 파일에 적힌 순서와 같아야 한다 — 한 명이라도 밀리면 전부 어긋난다
    expect(pairs.map((p) => p.name)).toEqual(ALL_NAMES);
  });

  it('★마지막 줄이 덜 차 있어도 된다 (2쪽 둘째 줄은 6명뿐이다)', () => {
    const outcome = parsePhotoRosterFile(buildTwoPageHwpml());
    if (!outcome.ok || !outcome.result.pairing.ok) throw new Error('짝짓기 실패');
    expect(outcome.result.pairing.pairs.at(-1)!.name).toBe('안도경');
  });
});

describe('2쪽짜리 사진 명렬표 — 엑셀(.xlsx)', () => {
  it('★한 시트 안에서 줄이 더 이어지는 경우 (인쇄만 2쪽)', () => {
    // 같은 시트에 사진 줄이 둘 — 행 번호가 계속 커지므로 원래 문제없이 돌아야 한다
    const bytes = buildMultiSheetXlsx([{ names: PAGE1_ROWS[0]!, startNumber: 1, photoRow: 7 }]);
    const outcome = parsePhotoRosterFile(bytes);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pairing.ok).toBe(true);
  });

  it('★시트가 두 장으로 나뉘어도 뭉개지지 않는다 (같은 (행,열)이 다시 나온다)', () => {
    const bytes = buildMultiSheetXlsx([
      { names: PAGE1_ROWS[0]!, startNumber: 1, photoRow: 7 },
      { names: PAGE1_ROWS[1]!, startNumber: 9, photoRow: 7 }, // ★ 같은 행·열이 다시 등장
    ]);
    const outcome = parsePhotoRosterFile(bytes);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.names).toHaveLength(16);
    expect(outcome.result.photos).toHaveLength(16);
    expect(outcome.result.pairing.ok).toBe(true);
  });

  it('★두 시트에 걸친 학생이 서로 다른 사진을 받는다', () => {
    const bytes = buildMultiSheetXlsx([
      { names: PAGE1_ROWS[0]!, startNumber: 1, photoRow: 7 },
      { names: PAGE1_ROWS[1]!, startNumber: 9, photoRow: 7 },
    ]);
    const outcome = parsePhotoRosterFile(bytes);
    if (!outcome.ok || !outcome.result.pairing.ok) throw new Error('짝짓기 실패');

    const keys = new Set(outcome.result.photos.map((p) => p.pairKey));
    expect(keys.size).toBe(16); // 자리가 하나라도 겹치면 16보다 작다
  });
});
