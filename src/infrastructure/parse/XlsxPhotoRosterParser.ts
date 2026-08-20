/**
 * 최신 나이스 사진 명렬표(`.xlsx`) 파서.
 *
 * ## 왜 exceljs 를 안 쓰는가 (실물에서 터졌다)
 *
 * 처음에는 이미 있는 `exceljs` 의 `getImages()` 를 쓰려 했는데, **실물 파일이 열리지 않는다**:
 * `Error: Cannot merge already merged cells` — 나이스가 내보낸 시트에 겹치는 병합 정의가 있어
 * exceljs 의 `_parseMergeCells` 가 통째로 죽는다. 셀 하나 못 읽는 게 아니라 **파일 전체를 못 연다.**
 * 우회 옵션도 없다(병합 파싱을 끌 수 없음). 그래서 zip 을 직접 풀고 필요한 XML 4개만 읽는다.
 *
 * 부수 효과로 이 경로에서 exceljs 의존이 사라져 학생용 번들 격리 걱정도 없어졌다.
 *
 * ## 짝짓기 — "같은 열"이 아니라 "같은 줄의 같은 순서"
 *
 * ⚠️ 예전에는 사진 `(행 r, 열 c)` ↔ 이름 `(행 r+1, **같은 열 c**)` 로 맞물렸다.
 * 그런데 실물을 열어 보니 **틀린 전제였다**(2026-08-20 확인). 나이스는 사진을 셀에 맞춰
 * 붙이지 않고 **절대 좌표(EMU)** 로 놓기 때문에, 그 좌표가 어느 칸에 걸치느냐에 따라
 * `from.col` 이 정해진다 — 이름 칸 열과 다르다.
 *
 * ```
 * 사진 열: 1  2  5  7  11  15  18  23
 * 이름 열: 1  3  6  8  12  16  19  24     ← 첫 칸 말고는 전부 다르다
 * ```
 *
 * 그래서 **줄 안에서 놓인 순서**로 맞물리고, 밀림은 `rowOrderMatches` 로 막는다
 * (i번째 이름은 i번째 사진보다 오른쪽, i+1번째 사진보다 왼쪽이어야 한다).
 *
 * ## 실물 구조 (2026-08-19 확인)
 *
 * ```
 * xl/media/image1.jpeg …            사진 22장
 * xl/drawings/drawing1.xml          twoCellAnchor 22개
 * 사진 행 7 / 10 / 13   ↔  이름 행 8 / 11 / 14   (0-based)
 * 열 {1, 3, 6, 8, 12, 16, 19, 24}, 8·8·6명
 * ```
 *
 * 행·열 값은 **하드코딩하지 않는다.** 28명 반이면 네 번째 줄이 생기고 양식이 바뀌면 깨진다.
 * 앵커 좌표에서 그때그때 읽어 낸다.
 *
 * ## 2쪽을 넘어가는 명렬표
 *
 * 인쇄만 2쪽이면 같은 시트에서 행 번호가 계속 커지므로 그대로 돌아간다.
 * 그러나 **시트가 두 장으로 나뉘면 `(행, 열)` 이 처음부터 다시 시작해서** 서로 다른 학생의
 * 사진이 같은 자리로 뭉개진다. 그래서 자리 열쇠에 시트 번호를 함께 넣는다.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { gridPairKey, pairRosterPhotos, rowOrderMatches } from '@domain/rules/photoRosterPairing';
import { parseRosterNameCell, type RosterNameCell } from '@domain/rules/rosterNameCell';
import type {
  PhotoRosterParseResult,
  RosterNameCandidate,
  RosterPhotoCandidate,
} from '@domain/valueObjects/PhotoRoster';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

function decodeXmlText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** `AB` → 27 (0 기준 열 번호) */
function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** `xl/sharedStrings.xml` 의 문자열 표 */
function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXmlText(m[1]!));
}

interface SheetCell {
  readonly row: number;
  readonly col: number;
  readonly text: string;
}

/**
 * 시트 XML 에서 값이 있는 셀만 읽는다.
 *
 * ⚠️ **자기닫힘 빈 셀(`<c r="A9"/>`)을 반드시 따로 처리해야 한다.**
 * `<c ...>(.*?)</c>` 하나로만 훑으면 빈 셀이 자기 종료 태그가 없어서
 * **바로 뒤 셀을 통째로 삼킨다** — 실물에서 이름 8명 중 2명(1열·12열)이 조용히 사라졌다.
 * 경고 하나 없이 학생이 없어지는 종류라 회귀 테스트로 고정해 두었다.
 */
function readSheetCells(xml: string, sharedStrings: readonly string[]): SheetCell[] {
  const cells: SheetCell[] = [];
  const pattern = /<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
  for (const match of xml.matchAll(pattern)) {
    const [, letters, rowText, attrs, closing, inner] = match;
    if (closing === '/>' || !inner) continue;
    let text: string;
    if (/\bt="s"/.test(attrs!)) {
      const index = /<v>(\d+)<\/v>/.exec(inner)?.[1];
      if (index === undefined) continue;
      text = sharedStrings[Number(index)] ?? '';
    } else if (/\bt="inlineStr"/.test(attrs!)) {
      text = decodeXmlText(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
    } else {
      const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (value === undefined) continue;
      text = decodeXmlText(value);
    }
    cells.push({
      row: Number(rowText) - 1,
      col: columnLetterToIndex(letters!),
      text: text.trim(),
    });
  }
  return cells;
}

interface DrawingAnchor {
  readonly row: number;
  readonly col: number;
  readonly relId: string;
}

/** 그리기 XML 에서 사진이 붙은 셀 좌표를 읽는다 */
function readDrawingAnchors(xml: string): DrawingAnchor[] {
  const anchors: DrawingAnchor[] = [];
  // 셀 고정 앵커만 받는다. 떠 있는 앵커(absoluteAnchor)는 자리를 알 수 없어 검산에서 걸러진다.
  const blocks = xml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:\1>/g);
  for (const block of blocks) {
    const body = block[0];
    const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(body)?.[1];
    const relId = /r:embed="([^"]+)"/.exec(body)?.[1];
    if (!from || !relId) continue;
    const col = /<xdr:col>(\d+)<\/xdr:col>/.exec(from)?.[1];
    const row = /<xdr:row>(\d+)<\/xdr:row>/.exec(from)?.[1];
    if (col === undefined || row === undefined) continue;
    anchors.push({ row: Number(row), col: Number(col), relId });
  }
  return anchors;
}

/** `.rels` 파일에서 관계 id → 대상 경로 */
function readRelationships(xml: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const match of xml.matchAll(/<Relationship\b([^>]*)>/g)) {
    const attrs = match[1]!;
    const id = /Id="([^"]+)"/.exec(attrs)?.[1];
    const target = /Target="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

/** `../media/image1.jpeg` 같은 상대 경로를 zip 안 절대 경로로 정규화 */
function resolveZipPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const segments = `${baseDir}/${target}`.split('/');
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return stack.join('/');
}

function dirOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

/**
 * `.xlsx` 사진 명렬표를 해석한다.
 *
 * 짝짓기에 실패해도 **이름은 항상 돌려준다** — 사진만 포기하고 보정 화면으로 넘어간다.
 */
export function parseXlsxPhotoRoster(bytes: Uint8Array): PhotoRosterParseResult {
  const zip = unzipSync(bytes);
  const textOf = (path: string): string | undefined => {
    const entry = zip[path];
    return entry ? strFromU8(entry) : undefined;
  };

  const sharedStrings = readSharedStrings(textOf('xl/sharedStrings.xml'));
  const names: RosterNameCandidate[] = [];
  const photos: RosterPhotoCandidate[] = [];
  /** 사진 순서가 이름 순서와 어긋난 줄 (사진이 빠졌거나 다른 그림이 섞였다) */
  const misalignedRows: string[] = [];

  const sheetPaths = Object.keys(zip)
    .filter((path) => /^xl\/worksheets\/[^/]+\.xml$/.test(path))
    .sort();

  sheetPaths.forEach((sheetPath, sheetIndex) => {
    const sheetXml = textOf(sheetPath);
    if (!sheetXml) return;

    // ── 이름: `N번 이름` 형태의 셀만 골라낸다 (제목·학교명·머리글은 걸러진다)
    //    사진은 이름 바로 윗줄에 놓이므로 사진 줄 번호로 묶는다
    const nameRows = new Map<number, { col: number; cell: RosterNameCell }[]>();
    for (const cell of readSheetCells(sheetXml, sharedStrings)) {
      const parsed = parseRosterNameCell(cell.text);
      if (!parsed) continue;
      const photoRow = cell.row - 1;
      const bucket = nameRows.get(photoRow) ?? [];
      bucket.push({ col: cell.col, cell: parsed });
      nameRows.set(photoRow, bucket);
    }

    // ── 사진: 시트 → 그리기 → 이미지 순으로 관계를 따라간다
    const photoRows = new Map<number, { col: number; bytes: Uint8Array; mimeType: string }[]>();
    const sheetRels = readRelationships(
      textOf(`${dirOf(sheetPath)}/_rels/${sheetPath.split('/').pop()}.rels`),
    );
    for (const target of sheetRels.values()) {
      if (!target.includes('drawing')) continue;
      const drawingPath = resolveZipPath(dirOf(sheetPath), target);
      const drawingXml = textOf(drawingPath);
      if (!drawingXml) continue;
      const drawingRels = readRelationships(
        textOf(`${dirOf(drawingPath)}/_rels/${drawingPath.split('/').pop()}.rels`),
      );
      for (const anchor of readDrawingAnchors(drawingXml)) {
        const mediaTarget = drawingRels.get(anchor.relId);
        if (!mediaTarget) continue;
        const mediaPath = resolveZipPath(dirOf(drawingPath), mediaTarget);
        const mediaBytes = zip[mediaPath];
        if (!mediaBytes) continue;
        const extension = mediaPath.split('.').pop()?.toLowerCase() ?? '';
        const bucket = photoRows.get(anchor.row) ?? [];
        bucket.push({
          col: anchor.col,
          bytes: mediaBytes,
          mimeType: MIME_BY_EXTENSION[extension] ?? 'image/jpeg',
        });
        photoRows.set(anchor.row, bucket);
      }
    }

    // ── 줄마다 놓인 순서대로 맞물린다 (열 번호가 서로 달라도 된다)
    for (const [row, rowNames] of nameRows) {
      const sortedNames = [...rowNames].sort((a, b) => a.col - b.col);
      const rowPhotos = [...(photoRows.get(row) ?? [])].sort((a, b) => a.col - b.col);

      // 순서가 어긋나면(빠졌거나 다른 그림이 끼었으면) 그 줄은 사진 없이 이름만 살린다.
      // 여기서 봐주면 얼굴이 한 칸씩 밀린 채 저장된다 — 이 기능의 유일한 치명 실패다.
      const aligned = rowOrderMatches(
        rowPhotos.map((p) => p.col),
        sortedNames.map((n) => n.col),
      );

      sortedNames.forEach((entry, ordinal) => {
        names.push({
          pairKey: gridPairKey(row, ordinal, sheetIndex + 1),
          studentNumber: entry.cell.studentNumber,
          name: entry.cell.name,
          ...(entry.cell.grade !== undefined ? { grade: entry.cell.grade } : {}),
          ...(entry.cell.classNum !== undefined ? { classNum: entry.cell.classNum } : {}),
        });
      });

      if (!aligned) {
        // 이 줄은 사진을 버린다. 여기서 봐주면 얼굴이 한 칸씩 밀린 채 저장된다.
        misalignedRows.push(`${row + 1}번째 줄`);
        continue;
      }
      rowPhotos.forEach((photo, ordinal) => {
        photos.push({
          pairKey: gridPairKey(row, ordinal, sheetIndex + 1),
          bytes: photo.bytes,
          mimeType: photo.mimeType,
        });
      });
    }
  });

  return {
    format: 'xlsx',
    names,
    photos,
    pairing:
      misalignedRows.length > 0
        ? {
            ok: false,
            reason: 'PHOTO_GRID_MISMATCH',
            detail: `사진과 이름의 자리가 어긋납니다 (${misalignedRows.join(', ')}) — 사진이 빠졌거나 다른 그림이 섞였을 수 있음`,
          }
        : pairRosterPhotos(names, photos),
  };
}
