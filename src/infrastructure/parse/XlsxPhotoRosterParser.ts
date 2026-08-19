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
 * ## 왜 짝짓기가 여기서 제일 튼튼한가
 *
 * 엑셀은 사진이 **셀에 고정된 앵커**를 갖는다(실물 22장 전부 `twoCellAnchor`, 떠 있는 앵커 0개).
 * 그래서 사진과 이름이 **같은 좌표계**를 쓰고, 논리 격자로 압축할 필요 없이
 * 시트 좌표를 그대로 맞물릴 수 있다 — 사진 `(행 r, 열 c)` ↔ 이름 `(행 r+1, 같은 열 c)`.
 * 좌표를 압축하지 않으므로 사진이 몇 장 빠져도 남은 사진이 밀리지 않는다.
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
 */

import { unzipSync, strFromU8 } from 'fflate';
import { gridPairKey, pairRosterPhotos } from '@domain/rules/photoRosterPairing';
import type {
  PhotoRosterParseResult,
  RosterNameCandidate,
  RosterPhotoCandidate,
} from '@domain/valueObjects/PhotoRoster';

/** `1번  고재우` → { studentNumber: 1, name: '고재우' } */
const NAME_CELL_PATTERN = /^(\d+)\s*번\s*(.+)$/;

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

  const sheetPaths = Object.keys(zip)
    .filter((path) => /^xl\/worksheets\/[^/]+\.xml$/.test(path))
    .sort();

  for (const sheetPath of sheetPaths) {
    const sheetXml = textOf(sheetPath);
    if (!sheetXml) continue;

    // ── 이름: `N번 이름` 형태의 셀만 골라낸다 (제목·학교명·머리글은 걸러진다)
    for (const cell of readSheetCells(sheetXml, sharedStrings)) {
      const matched = NAME_CELL_PATTERN.exec(cell.text);
      if (!matched) continue;
      // 이름은 사진 바로 아래 줄에 있다 → 사진 줄 기준으로 키를 만든다
      names.push({
        pairKey: gridPairKey(cell.row - 1, cell.col),
        studentNumber: Number(matched[1]),
        name: matched[2]!.trim(),
      });
    }

    // ── 사진: 시트 → 그리기 → 이미지 순으로 관계를 따라간다
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
        photos.push({
          pairKey: gridPairKey(anchor.row, anchor.col),
          bytes: mediaBytes,
          mimeType: MIME_BY_EXTENSION[extension] ?? 'image/jpeg',
        });
      }
    }
  }

  return {
    format: 'xlsx',
    names,
    photos,
    pairing: pairRosterPhotos(names, photos),
  };
}
