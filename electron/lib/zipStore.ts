/**
 * STORE-only ZIP archive builder (외부 의존성 0).
 *
 * - 압축 없음 (compression method = 0). PNG 등 이미 압축된 포맷에 적합.
 * - 모든 엔트리를 메모리에 누적해 한 번에 Buffer 반환.
 * - 사용처: 내 이모티콘 다중 내보내기 (stickerId.png ~30KB × N개 → 수십 MB 수준).
 *
 * ZIP 포맷 참고: APPNOTE.TXT 6.3.6 — 본 구현은 ZIP64 미지원, UTF-8 파일명 비트 사용.
 */

import { createHash } from 'crypto';

// ─── CRC32 ───
// CRC-32 IEEE 802.3 polynomial (reverse representation).
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ─── DOS date/time ───
function toDosTime(d: Date): { dosTime: number; dosDate: number } {
  const dosTime =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const year = d.getFullYear();
  const dosDate =
    (((year < 1980 ? 0 : year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

export interface ZipEntry {
  /** ZIP 안에 표시될 파일명 (forward slash 권장, UTF-8). */
  readonly filename: string;
  /** 파일 raw 바이트. */
  readonly data: Buffer;
  /** 옵션 modified time (default: now). */
  readonly modified?: Date;
}

/**
 * STORE 모드로 ZIP 아카이브를 빌드한다.
 *
 * @returns 완성된 ZIP의 Buffer.
 */
export function buildStoreZip(entries: ReadonlyArray<ZipEntry>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.filename, 'utf8');
    const dataLen = entry.data.length;
    const crc = crc32(entry.data);
    const { dosTime, dosDate } = toDosTime(entry.modified ?? new Date());

    // ─── Local File Header (30 bytes + name) ───
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);      // gp flags: bit 11 = UTF-8 filename
    localHeader.writeUInt16LE(0, 8);           // compression: STORE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataLen, 18);    // compressed size
    localHeader.writeUInt32LE(dataLen, 22);    // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);          // extra field length

    localChunks.push(localHeader, nameBuf, entry.data);

    // ─── Central Directory Header (46 bytes + name) ───
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);   // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0x0800, 8);       // gp flags
    central.writeUInt16LE(0, 10);           // compression
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataLen, 20);
    central.writeUInt32LE(dataLen, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);           // extra field length
    central.writeUInt16LE(0, 32);           // file comment length
    central.writeUInt16LE(0, 34);           // disk number start
    central.writeUInt16LE(0, 36);           // internal file attributes
    central.writeUInt32LE(0, 38);           // external file attributes
    central.writeUInt32LE(offset, 42);      // local header offset

    centralChunks.push(central, nameBuf);

    offset += 30 + nameBuf.length + dataLen;
  }

  const centralSize = centralChunks.reduce((acc, b) => acc + b.length, 0);
  const centralOffset = offset;

  // ─── End of Central Directory Record (22 bytes) ───
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // signature
  eocd.writeUInt16LE(0, 4);                     // disk number
  eocd.writeUInt16LE(0, 6);                     // start disk
  eocd.writeUInt16LE(entries.length, 8);        // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);       // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);                    // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

/**
 * 동일 파일명 충돌이 있으면 `name (2).ext`, `name (3).ext` ... 식으로 자동 재명명한다.
 * 같은 입력 순서를 유지하며 sanitize된 파일명을 반환.
 */
export function dedupeFilenames(names: ReadonlyArray<string>): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const raw of names) {
    const key = raw.toLowerCase();
    const count = seen.get(key) ?? 0;
    if (count === 0) {
      out.push(raw);
    } else {
      const dot = raw.lastIndexOf('.');
      if (dot > 0 && dot < raw.length - 1) {
        out.push(`${raw.slice(0, dot)} (${count + 1})${raw.slice(dot)}`);
      } else {
        out.push(`${raw} (${count + 1})`);
      }
    }
    seen.set(key, count + 1);
  }
  return out;
}

/**
 * Windows/macOS 모두에서 안전한 파일명으로 정제.
 * - 금지 문자(<>:"/\|?*)와 제어 문자 제거
 * - trailing dot/space 제거 (Windows)
 * - 빈 문자열은 fallback 반환
 */
export function sanitizeFilename(name: string, fallback: string): string {
  // 제어 문자 + Windows 금지 문자 + path separator
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\x00-\x1f<>:"/\\|?*]/g, '').trim();
  // trailing dot/space 제거
  const trimmed = cleaned.replace(/[.\s]+$/, '');
  if (trimmed.length === 0) return fallback;
  // 너무 길면 잘라냄 (255자 마진)
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

/** 동시성 제어 없이 안전한 디버그 hash (테스트용). */
export function debugHashFilenames(names: ReadonlyArray<string>): string {
  return createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 12);
}
