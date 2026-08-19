/**
 * 사진 명렬표 파일 형식 판별.
 *
 * 가장 중요한 건 **`.hwp` 확장자에 두 포맷이 온다**는 사실이다.
 * 최신 나이스가 주는 `.hwp` 는 평문 XML(HWPML)이고, 예전 것은 OLE2 복합문서다.
 * 확장자를 믿고 갈라내면 최신 파일을 옛 파서에 넘겨 통째로 실패한다.
 */
import { describe, it, expect } from 'vitest';
import { detectRosterFileFormat } from './photoRosterFormat';

function bytesOf(text: string, prefix: readonly number[] = []): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** OLE2 디렉터리 이름은 UTF-16LE 라 ASCII 사이에 NUL 이 낀다 */
function utf16Name(name: string): string {
  return [...name].map((ch) => `${ch}\0`).join('');
}

describe('detectRosterFileFormat', () => {
  it('최신 나이스 한글 = BOM + <?xml + <HWPML → hwpml', () => {
    const bytes = bytesOf(
      '<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" Version="2.1">',
      UTF8_BOM,
    );
    expect(detectRosterFileFormat(bytes)).toBe('hwpml');
  });

  it('BOM 이 없어도 HWPML 이면 알아본다', () => {
    const bytes = bytesOf('<?xml version="1.0"?><HWPML Version="2.1">');
    expect(detectRosterFileFormat(bytes)).toBe('hwpml');
  });

  it('구형 한글 = OLE2 + BodyText → hwp-ole2 (지원 안 하지만 정확히 식별해야 안내가 맞다)', () => {
    const bytes = bytesOf(
      `${'x'.repeat(300)}${utf16Name('HwpSummaryInformation')}${utf16Name('BodyText')}`,
      OLE2,
    );
    expect(detectRosterFileFormat(bytes)).toBe('hwp-ole2');
  });

  it('구형 엑셀 = OLE2 + Workbook → xls-biff8', () => {
    const bytes = bytesOf(`${'x'.repeat(300)}${utf16Name('Workbook')}`, OLE2);
    expect(detectRosterFileFormat(bytes)).toBe('xls-biff8');
  });

  it('.xlsx = zip + [Content_Types].xml → xlsx', () => {
    const bytes = bytesOf('PK............[Content_Types].xml.....xl/workbook.xml');
    expect(detectRosterFileFormat(bytes)).toBe('xlsx');
  });

  it('.hwpx = zip + application/hwp+zip → hwpx', () => {
    const bytes = bytesOf('PK........mimetypeapplication/hwp+zip');
    expect(detectRosterFileFormat(bytes)).toBe('hwpx');
  });

  it('빈 파일과 엉뚱한 파일은 unknown', () => {
    expect(detectRosterFileFormat(new Uint8Array())).toBe('unknown');
    expect(detectRosterFileFormat(bytesOf('그냥 텍스트 파일입니다'))).toBe('unknown');
  });

  it('XML 이지만 HWPML 이 아니면 unknown (한글 문서가 아닌 XML)', () => {
    const bytes = bytesOf('<?xml version="1.0"?><root><hello/></root>');
    expect(detectRosterFileFormat(bytes)).toBe('unknown');
  });
});
