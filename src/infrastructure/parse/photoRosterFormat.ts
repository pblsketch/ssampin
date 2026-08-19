/**
 * 사진 명렬표 파일 형식 판별 — 확장자를 믿지 않고 내용을 본다.
 *
 * ⚠️ **`.hwp` 확장자에 서로 다른 두 포맷이 온다.**
 * 최신 나이스가 내보내는 `.hwp` 는 예전의 OLE2 복합문서가 아니라 **평문 XML(HWPML)** 이다.
 * 실물 확인: 2020년 산출물 = OLE2, 2026년 산출물 = `EF BB BF 3C 3F 78 6D 6C`(BOM + `<?xml`).
 * 확장자로 갈라내면 최신 파일을 옛 파서에 넘겨 통째로 실패한다.
 *
 * `.xlsx` 와 `.hwpx` 는 둘 다 zip 이라 매직 바이트만으로는 구분되지 않는다 —
 * 앞부분에 들어 있는 내부 파일 이름으로 갈라낸다.
 */

import type { RosterFileFormat } from '@domain/valueObjects/PhotoRoster';

const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const ZIP_SIGNATURE = [0x50, 0x4b] as const;
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

/** 내부 파일 이름을 찾기 위해 훑을 앞부분 크기 */
const SNIFF_BYTES = 4096;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** 앞부분을 라틴1로 읽어 마커 문자열을 찾는다 (한글이 깨져도 ASCII 마커는 그대로 보인다) */
function sniffAscii(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, SNIFF_BYTES);
  let text = '';
  for (let i = 0; i < slice.length; i++) {
    text += String.fromCharCode(slice[i]!);
  }
  return text;
}

/**
 * 파일 내용으로 형식을 판별한다.
 *
 * @param bytes 파일 전체 (또는 최소 앞 4KB)
 */
export function detectRosterFileFormat(bytes: Uint8Array): RosterFileFormat {
  if (bytes.length === 0) return 'unknown';

  // 구형 한글(.hwp) / 구형 엑셀(.xls) — 둘 다 OLE2 복합문서라 겉모습이 같다.
  // 내부 스트림 이름으로 갈라낸다: 한글은 'HwpSummaryInformation'/'BodyText',
  // 엑셀은 'Workbook'/'Book'. (둘 다 지원하지 않지만 안내 문구가 달라야 한다)
  if (startsWith(bytes, OLE2_SIGNATURE)) {
    const head = sniffAscii(bytes);
    // OLE2 디렉터리 항목 이름은 UTF-16LE 라 ASCII 사이에 NUL 이 낀다
    const compact = head.replace(/\0/g, '');
    if (compact.includes('HwpSummaryInformation') || compact.includes('BodyText')) {
      return 'hwp-ole2';
    }
    if (compact.includes('Workbook') || compact.includes('Book')) {
      return 'xls-biff8';
    }
    // 앞 4KB 만으로 못 가른 경우 — .hwp 쪽이 훨씬 흔하므로 그쪽으로 안내한다
    return 'hwp-ole2';
  }

  // zip 계열 — .xlsx 와 .hwpx
  if (startsWith(bytes, ZIP_SIGNATURE)) {
    const head = sniffAscii(bytes);
    if (head.includes('[Content_Types].xml') || head.includes('xl/')) return 'xlsx';
    if (head.includes('application/hwp+zip') || head.includes('Contents/')) return 'hwpx';
    return 'unknown';
  }

  // 평문 XML — 최신 나이스 한글(HWPML). BOM 이 있을 수도 없을 수도 있다.
  const xmlOffset = startsWith(bytes, UTF8_BOM) ? UTF8_BOM.length : 0;
  const head = sniffAscii(bytes.subarray(xmlOffset));
  if (head.startsWith('<?xml') || head.startsWith('<HWPML')) {
    if (head.includes('<HWPML')) return 'hwpml';
    return 'unknown';
  }

  return 'unknown';
}
