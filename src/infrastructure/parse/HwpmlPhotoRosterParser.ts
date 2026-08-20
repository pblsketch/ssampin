/**
 * 최신 나이스 사진 명렬표(HWPML) 파서.
 *
 * 겉은 `.hwp` 지만 실체는 **평문 XML** 이라 압축 해제도, 새 라이브러리도 필요 없다.
 * (구형 `.hwp` 는 OLE2 + zlib 라 완전히 다른 파일이다 — `photoRosterFormat` 이 갈라낸다)
 *
 * ## 실물 구조 (2026-08-19 확인)
 *
 * ```xml
 * <BINDATALIST Count="22"><BINITEM Type="Embedding" BinData="1" Format="jpg"/>…</BINDATALIST>
 * …
 * <PICTURE>
 *   <SHAPEOBJECT …><POSITION … VertOffset="13680" HorzOffset="6667" …/></SHAPEOBJECT>
 *   …<IMAGE … BinItem="1"/>
 * </PICTURE>                      ← 22개. 표 밖에 떠 있는 개체다.
 * …
 * <CELL ColAddr="1" RowAddr="1" …><…><CHAR>1번  강나영</CHAR>…</CELL>
 * …
 * <BINDATASTORAGE><BINDATA Id="1" Size="166164" Encoding="Base64">/9j/4AAQ…</BINDATA>…
 * ```
 *
 * ⚠️ **사진은 표 안에 있지 않다.** 사진은 페이지 절대좌표(VertOffset/HorzOffset)를 갖고
 * 이름은 표 셀 주소(RowAddr/ColAddr)를 갖는다 — 좌표계가 다르다.
 * 그래서 양쪽을 각각 "몇 번째 줄의 몇 번째 칸"으로 환산해 맞물린다.
 * 실물에서 사진은 세로 3줄(8·8·6장)로 정확히 복원됐다.
 */

import {
  gridPairKey,
  toGridIndex,
  pairRosterPhotos,
  hasUniformSpacing,
} from '@domain/rules/photoRosterPairing';
import { parseRosterNameCell } from '@domain/rules/rosterNameCell';
import type {
  PhotoRosterParseResult,
  RosterNameCandidate,
  RosterPhotoCandidate,
} from '@domain/valueObjects/PhotoRoster';

interface RawPhoto {
  readonly binItemId: number;
  readonly vert: number;
  readonly horz: number;
}

interface RawName {
  readonly grade?: number;
  readonly classNum?: number;
  /**
   * 이름이 속한 표의 순번.
   *
   * ⚠️ 셀의 `RowAddr` 를 쓰면 안 된다 — 실물에서는 **사진 한 줄마다 표가 따로**여서
   * 22명 전원의 `RowAddr` 가 전부 `1` 이다. 그대로 묶으면 세 줄이 한 줄로 뭉개진다.
   */
  readonly tableIndex: number;
  readonly colAddr: number;
  readonly studentNumber: number;
  readonly name: string;
}

function attrNumber(tag: string, attribute: string): number | null {
  const matched = new RegExp(`${attribute}="(-?\\d+)"`).exec(tag);
  return matched ? Number(matched[1]) : null;
}

/** XML 엔티티만 최소로 되돌린다 (이름에 &amp; 가 들어갈 수 있다) */
function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `<PICTURE>…</PICTURE>` 에서 좌표와 그림 번호를 뽑는다 */
function extractPhotos(body: string): RawPhoto[] {
  const photos: RawPhoto[] = [];
  const pictureBlocks = body.matchAll(/<PICTURE>([\s\S]*?)<\/PICTURE>/g);
  for (const block of pictureBlocks) {
    const inner = block[1]!;
    const position = /<POSITION\b[^>]*>/.exec(inner)?.[0];
    const image = /<IMAGE\b[^>]*>/.exec(inner)?.[0];
    if (!position || !image) continue;
    const vert = attrNumber(position, 'VertOffset');
    const horz = attrNumber(position, 'HorzOffset');
    const binItemId = attrNumber(image, 'BinItem');
    if (vert === null || horz === null || binItemId === null) continue;
    photos.push({ binItemId, vert, horz });
  }
  return photos;
}

/** 문서에서 `<TABLE` 이 나타나는 위치들 (이름 셀이 몇 번째 표에 속하는지 세는 데 쓴다) */
function tableStartOffsets(body: string): number[] {
  return [...body.matchAll(/<TABLE\b/g)].map((m) => m.index);
}

/** offset 앞에 놓인 표의 개수 = 그 위치가 속한 표의 순번 */
function tableIndexAt(offsets: readonly number[], offset: number): number {
  let count = 0;
  for (const start of offsets) {
    if (start > offset) break;
    count += 1;
  }
  return count;
}

/** 표 셀에서 `N번 이름` 형태만 골라낸다 (머리글·학교명 등은 걸러진다) */
function extractNames(body: string): RawName[] {
  const names: RawName[] = [];
  const offsets = tableStartOffsets(body);
  const cells = body.matchAll(/<CELL\b([^>]*)>([\s\S]*?)<\/CELL>/g);
  for (const cell of cells) {
    const attrs = cell[1]!;
    const inner = cell[2]!;
    const colAddr = attrNumber(attrs, 'ColAddr');
    if (colAddr === null) continue;
    // 한 셀 안의 <CHAR> 조각을 모두 이어 붙인다 (서식이 나뉘면 조각날 수 있다)
    const text = [...inner.matchAll(/<CHAR>([\s\S]*?)<\/CHAR>/g)]
      .map((m) => decodeXmlText(m[1]!))
      .join('')
      .trim();
    const parsed = parseRosterNameCell(text);
    if (!parsed) continue;
    names.push({
      tableIndex: tableIndexAt(offsets, cell.index),
      colAddr,
      studentNumber: parsed.studentNumber,
      name: parsed.name,
      ...(parsed.grade !== undefined ? { grade: parsed.grade } : {}),
      ...(parsed.classNum !== undefined ? { classNum: parsed.classNum } : {}),
    });
  }
  return names;
}

/** `<BINDATASTORAGE>` 의 base64 를 그림 번호별로 푼다 */
function extractBinaries(storage: string): Map<number, Uint8Array> {
  const result = new Map<number, Uint8Array>();
  const items = storage.matchAll(/<BINDATA\b([^>]*)>([\s\S]*?)<\/BINDATA>/g);
  for (const item of items) {
    const id = attrNumber(item[1]!, 'Id');
    if (id === null) continue;
    if (!/Encoding="Base64"/i.test(item[1]!)) continue;
    try {
      result.set(id, base64ToBytes(item[2]!));
    } catch {
      // 한 장이 깨져도 나머지는 살린다 — 개수가 안 맞으면 검산이 잡는다
    }
  }
  return result;
}

/**
 * 좌표 목록을 (줄 번호, 줄 안 순서)로 환산한다.
 * 사진과 이름이 같은 규칙을 써야 서로 맞물린다.
 */
function toGridKeys<T>(
  items: readonly T[],
  rowOf: (item: T) => number,
  colOf: (item: T) => number,
): string[] {
  const rowIndex = toGridIndex(items.map(rowOf));
  // 줄마다 가로 위치를 모아 순서를 매긴다 (줄이 달라도 칸 번호는 0부터 시작해야 한다)
  const colsByRow = new Map<number, number[]>();
  for (const item of items) {
    const row = rowIndex.get(rowOf(item))!;
    const list = colsByRow.get(row) ?? [];
    list.push(colOf(item));
    colsByRow.set(row, list);
  }
  const colIndexByRow = new Map<number, ReadonlyMap<number, number>>();
  for (const [row, cols] of colsByRow) {
    colIndexByRow.set(row, toGridIndex(cols));
  }
  return items.map((item) => {
    const row = rowIndex.get(rowOf(item))!;
    const col = colIndexByRow.get(row)!.get(colOf(item))!;
    return gridPairKey(row, col);
  });
}

/**
 * 쪽 번호를 매긴다 — **2쪽짜리 명렬표를 살리는 핵심.**
 *
 * 사진 위치가 `VertRelTo="Page"`(쪽 기준)라, 2쪽이 시작되면 세로값이 **맨 위부터 다시**
 * 센다. 그래서 2쪽 첫 줄과 1쪽 첫 줄의 세로값이 똑같다. 이걸 그대로 쓰면 두 줄이 한 줄로
 * 뭉개져 자리가 겹치고, 검산이 막아 주는 대신 **사진을 통째로 못 쓰게 된다.**
 *
 * 문서에 적힌 순서대로 읽다가 세로값이 **뒤로 되돌아가면** 새 쪽이 시작된 것으로 본다.
 * (같은 쪽 안에서는 위에서 아래로만 진행한다.)
 */
function assignPageIndex(photos: readonly RawPhoto[]): number[] {
  const pages: number[] = [];
  let page = 0;
  let maxVert = Number.NEGATIVE_INFINITY;
  for (const photo of photos) {
    if (photo.vert < maxVert) {
      page += 1;
      maxVert = photo.vert;
    } else {
      maxVert = Math.max(maxVert, photo.vert);
    }
    pages.push(page);
  }
  return pages;
}

/**
 * 쪽과 세로 좌표를 하나의 "줄 좌표"로 합친다.
 *
 * 값 자체는 의미가 없고 **크기 순서만** 쓰이므로(`toGridIndex` 가 정렬해 번호를 매긴다),
 * 쪽이 다르면 무조건 더 큰 값이 되도록 충분히 큰 간격을 둔다.
 */
const PAGE_STRIDE = 100_000_000;

/** 같은 줄(같은 쪽 + 같은 세로 좌표)의 사진끼리 묶는다 */
function groupByRow(photos: readonly RawPhoto[], pages: readonly number[]): RawPhoto[][] {
  const rows = new Map<number, RawPhoto[]>();
  photos.forEach((photo, i) => {
    const key = pages[i]! * PAGE_STRIDE + photo.vert;
    const bucket = rows.get(key) ?? [];
    bucket.push(photo);
    rows.set(key, bucket);
  });
  return [...rows.values()];
}

/**
 * HWPML 사진 명렬표를 해석한다.
 *
 * 짝짓기에 실패해도 **이름은 항상 돌려준다** — 사진만 포기하고 보정 화면으로 넘어간다.
 */
export function parseHwpmlPhotoRoster(xml: string): PhotoRosterParseResult {
  const storageStart = xml.indexOf('<BINDATASTORAGE');
  const body = storageStart >= 0 ? xml.slice(0, storageStart) : xml;
  const storage = storageStart >= 0 ? xml.slice(storageStart) : '';

  const rawNames = extractNames(body);
  const rawPhotos = extractPhotos(body);
  const binaries = extractBinaries(storage);

  const nameKeys = toGridKeys(
    rawNames,
    (n) => n.tableIndex,
    (n) => n.colAddr,
  );
  const names: RosterNameCandidate[] = rawNames.map((raw, i) => ({
    pairKey: nameKeys[i]!,
    studentNumber: raw.studentNumber,
    name: raw.name,
    ...(raw.grade !== undefined ? { grade: raw.grade } : {}),
    ...(raw.classNum !== undefined ? { classNum: raw.classNum } : {}),
  }));

  // 실제 이미지 데이터가 있는 그림만 후보로 삼는다
  const usablePhotos = rawPhotos.filter((p) => binaries.has(p.binItemId));
  // 2쪽 이상이면 세로 좌표가 쪽마다 처음으로 되돌아간다 → 쪽을 함께 세어 줄을 가른다
  const photoPages = assignPageIndex(usablePhotos);
  const photoIndexOf = new Map(usablePhotos.map((p, i) => [p, i]));
  const photoKeys = toGridKeys(
    usablePhotos,
    (p) => photoPages[photoIndexOf.get(p)!]! * PAGE_STRIDE + p.vert,
    (p) => p.horz,
  );
  const photos: RosterPhotoCandidate[] = usablePhotos.map((raw, i) => ({
    pairKey: photoKeys[i]!,
    bytes: binaries.get(raw.binItemId)!,
    mimeType: 'image/jpeg',
  }));

  // ⚠️ 압축 좌표만으로는 **같은 줄 안의 밀림**을 못 잡는다(검산이 "줄별 인원수"로 약해진다).
  //    명렬표 사진은 줄마다 일정한 간격으로 놓이므로, 간격이 흐트러졌다는 건
  //    사진이 빠졌거나(간격 2배) 로고 같은 게 끼어들었다는 신호다.
  //    그때 자동 짝짓기를 포기하지 않으면 얼굴이 한 칸씩 밀린 채 저장된다.
  const spacingOk = groupByRow(usablePhotos, photoPages).every((row) =>
    hasUniformSpacing(row.map((p) => p.horz)),
  );

  return {
    format: 'hwpml',
    names,
    photos,
    pairing: spacingOk
      ? pairRosterPhotos(names, photos)
      : {
          ok: false,
          reason: 'PHOTO_GRID_MISMATCH',
          detail: '사진이 줄에 놓인 간격이 고르지 않습니다 (빠졌거나 다른 그림이 섞였을 수 있음)',
        },
  };
}
