/**
 * 사진 자리배치표 — 파일이 실제로 만들어지는지, 사진이 실제로 들어갔는지 검사한다.
 *
 * ## 왜 "바이트가 커졌다"로 만족하지 않는가
 *
 * 사진이 빠져도 파일은 만들어진다. 그래서 **파일 안을 열어 확인한다** —
 * PDF 는 심어진 이미지 개수, 한글은 `BinData/` 에 들어간 사진 파일 개수를 센다.
 * (한컴에서 실제로 그림이 보이는지는 자동으로 확인할 수 없어 실물 출력으로 따로 확인했다.
 *  `docs/01-plan/features/photo-seating-chart.plan.md` §2 참조.)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { StudentPhotoImage } from '@domain/entities/StudentPhoto';
import { exportSeatingToPdf } from '@infrastructure/export/pdf/SeatingPdf';
import { exportSeatingToHwpx } from '@infrastructure/export/HwpxExporter';

// 폰트·뼈대 파일은 `public/` 에서 읽어 준다 (Node 에는 상대 URL fetch 가 없다)
beforeAll(() => {
  globalThis.fetch = (async (input: string) => {
    const buf = readFileSync(resolve('public', String(input).replace(/^\.?\//, '')));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    };
  }) as unknown as typeof fetch;
});

/** 최소한의 유효 JPEG/PNG — 실제 디코딩까지 통과해야 하므로 진짜 파일 바이트를 쓴다 */
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
// ⚠️ 투명도(알파)가 없는 PNG 를 쓴다. 알파가 있으면 pdf-lib 이 투명도용 그림을 하나 더
//    만들어서 "사진 3장인데 이미지 4개"가 된다 — 학생 사진은 알파 없는 JPEG·PNG 다.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4YWMDAAMQAUEiFmcFAAAAAElFTkSuQmCC',
  'base64',
);

function buildFixture(opts: { photoFor: readonly number[]; unsupported?: boolean }) {
  const names = ['강나영', '김도현', '박서준', '이하은', '최민서', '한지아'];
  const students: Student[] = names.map((name, i) => ({
    id: `s${i + 1}`,
    name,
    studentNumber: i + 1,
    status: 'active',
  }));

  const seats: (string | null)[][] = [
    ['s1', 's2', 's3'],
    ['s4', 's5', null], // 마지막 한 자리는 빈자리
  ];
  const seating: SeatingData = { rows: 2, cols: 3, seats, layout: 'grid' } as SeatingData;

  const photos = new Map<string, StudentPhotoImage>();
  for (const n of opts.photoFor) {
    const png = n % 2 === 0;
    photos.set(`s${n}`, {
      bytes: new Uint8Array(png ? PNG_1PX : JPEG_1PX),
      mimeType: opts.unsupported ? 'image/webp' : png ? 'image/png' : 'image/jpeg',
      width: 240,
      height: 320,
    });
  }

  return {
    seating,
    students,
    getStudent: (id: string | null) => students.find((s) => s.id === id),
    photos,
  };
}

/** PDF 안에 심어진 이미지 개수 */
function countPdfImages(bytes: ArrayBuffer): number {
  const text = Buffer.from(bytes).toString('latin1');
  return (text.match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** 한글 파일 안 `BinData/` 에 들어간 사진 파일 개수 (폴더 항목은 제외) */
async function countHwpxImages(bytes: Uint8Array): Promise<number> {
  const zip = await JSZip.loadAsync(bytes);
  return Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('BinData/')).length;
}

describe('사진 자리배치표', () => {
  it('PDF — 넘긴 사진 수만큼 실제로 심긴다', async () => {
    const f = buildFixture({ photoFor: [1, 2, 3] });
    const pdf = await exportSeatingToPdf(f.seating, f.getStudent, f.students, '1-3', f.photos);
    expect(countPdfImages(pdf)).toBe(3);
  });

  it('PDF — 사진을 안 넘기면 이미지가 하나도 없다 (기존 출력 유지)', async () => {
    const f = buildFixture({ photoFor: [] });
    const pdf = await exportSeatingToPdf(f.seating, f.getStudent, f.students, '1-3');
    expect(countPdfImages(pdf)).toBe(0);
  });

  it('PDF — 그릴 수 없는 형식은 그 학생만 건너뛰고 파일은 정상이다', async () => {
    const f = buildFixture({ photoFor: [1, 2], unsupported: true });
    const pdf = await exportSeatingToPdf(f.seating, f.getStudent, f.students, '1-3', f.photos);
    expect(countPdfImages(pdf)).toBe(0);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it('한글 — 넘긴 사진 수만큼 문서 안에 담긴다', async () => {
    const f = buildFixture({ photoFor: [1, 2, 3, 4] });
    const hwpx = await exportSeatingToHwpx(f.seating, f.getStudent, f.students, '1-3', f.photos);
    expect(await countHwpxImages(hwpx)).toBe(4);
  });

  it('한글 — 사진을 안 넘기면 사진이 하나도 안 들어간다 (기존 출력 유지)', async () => {
    const f = buildFixture({ photoFor: [] });
    const hwpx = await exportSeatingToHwpx(f.seating, f.getStudent, f.students, '1-3');
    expect(await countHwpxImages(hwpx)).toBe(0);
  });

  it('한글 — 사진이 있는 학생만 사진이 붙고 나머지는 이름만 남는다', async () => {
    const f = buildFixture({ photoFor: [1, 3] });
    const hwpx = await exportSeatingToHwpx(f.seating, f.getStudent, f.students, '1-3', f.photos);
    expect(await countHwpxImages(hwpx)).toBe(2);

    const zip = await JSZip.loadAsync(hwpx);
    const section = await zip.file('Contents/section0.xml')!.async('string');
    // 사진이 없는 학생 이름도 그대로 들어 있어야 한다 (사진 자리만 비운다)
    for (const name of ['강나영', '김도현', '박서준', '이하은', '최민서']) {
      expect(section).toContain(name);
    }
  });
});
