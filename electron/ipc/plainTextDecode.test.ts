/**
 * 평문 해독 — 인코딩별 왕복.
 *
 * ★이 검사가 잡는 실패는 "본문이 안 들어온다"가 아니라 **"깨진 글자가 본문인 척 들어온다"** 다.
 *   그쪽이 더 나쁘다 — 교사는 제대로 들어온 줄 알고, 그 글자가 생기부 근거로 쌓인다.
 *   실제로 UTF-16 파일이 이 경로를 통과해 버리는 것을 손으로 시험하다 발견했다(게이트는 초록이었다).
 */
import { describe, it, expect } from 'vitest';
import { decodePlainText, isPlainTextFile } from './plainTextDecode';

const ab = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

const utf8 = (s: string) => ab(Buffer.from(s, 'utf8'));
const utf8Bom = (s: string) =>
  ab(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')]));
const utf16le = (s: string) =>
  ab(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]));
const utf16be = (s: string) =>
  ab(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, 'utf16le').swap16()]));

const SAMPLE = '학생이 쓴 보고서입니다. 표본은 20명뿐이라 일반화하기 어렵다.';

describe('decodePlainText — 인코딩별로 글자가 안 깨진다', () => {
  it('UTF-8', () => {
    expect(decodePlainText(utf8(SAMPLE))).toBe(SAMPLE);
  });

  it('UTF-8 BOM 은 첫 낱말에 달라붙지 않는다', () => {
    expect(decodePlainText(utf8Bom(SAMPLE))).toBe(SAMPLE);
  });

  it('CP949(euc-kr) — 한국 학교 .txt 에 아직 흔하다', () => {
    // '가나다' 를 CP949 로 적은 바이트. UTF-8 엄격 검사에서 튕겨 CP949 로 넘어가야 한다.
    expect(decodePlainText(ab(Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9])))).toBe('가나다');
  });

  it('UTF-16LE — 윈도우 메모장의 옛 "유니코드" 저장', () => {
    // ★BOM 으로 먼저 가르지 않으면 통과해 버린다: UTF-16 한글 사이의 0x00 은 적법한 UTF-8 이라
    //   엄격 검사가 튕기지 않고, 깨진 글자가 그대로 본문이 된다.
    expect(decodePlainText(utf16le(SAMPLE))).toBe(SAMPLE);
  });

  it('UTF-16BE', () => {
    expect(decodePlainText(utf16be(SAMPLE))).toBe(SAMPLE);
  });

  it('빈 파일은 빈 문자열 — 던지지 않는다(부르는 쪽이 품질 신호로 잡는다)', () => {
    expect(decodePlainText(ab(Buffer.alloc(0)))).toBe('');
  });

  it('ASCII 만 있는 파일', () => {
    expect(decodePlainText(utf8('Report 2026: sample size = 20.'))).toBe(
      'Report 2026: sample size = 20.',
    );
  });
});

describe('isPlainTextFile — kordoc 에 넘기지 않을 확장자', () => {
  it.each(['a.txt', 'a.md', 'a.TXT', '학생글.MD', 'x.y.txt'])('%s 는 평문', (n) => {
    expect(isPlainTextFile(n)).toBe(true);
  });

  it.each(['a.hwp', 'a.pdf', 'a.docx', 'a.jpg', '확장자없음', 'a.markdown'])(
    '%s 는 평문이 아니다(kordoc 이 읽거나 아예 안 받는다)',
    (n) => {
      expect(isPlainTextFile(n)).toBe(false);
    },
  );
});
