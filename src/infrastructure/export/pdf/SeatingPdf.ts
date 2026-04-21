import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { buildPairGroups } from '@domain/rules/seatingLayoutRules';
import { loadKoreanFontBuffers } from './FontRegistry';

/**
 * 좌석배치 → PDF (A4 landscape).
 *
 * Excel/HWPX 의 seating 출력과 동일한 시각 규칙:
 *   - 뒷자리가 상단, 앞자리가 하단 (교탁이 가장 아래).
 *   - 좌우 반전 (교탁에서 학생 시점).
 *   - 짝꿍 모드면 짝 그룹 사이에 gap 열.
 *   - 우측에 명렬표 (번호/이름).
 */
export async function exportSeatingToPdf(
  seating: SeatingData,
  getStudent: (id: string | null) => Student | undefined,
  students: readonly Student[],
  className: string,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(formatSeatingTitle(className));
  doc.setAuthor('쌤핀');
  doc.setCreator('쌤핀 (SsamPin)');
  doc.setProducer('쌤핀 (SsamPin) - pdf-lib');
  doc.setCreationDate(new Date());
  // SeatingPdf 전용 폰트 임베딩: subset: false.
  //
  // 이유: pdf-lib `embedFont({subset: true})` 가 Electron/browser 번들 환경에서
  // fontkit 의 TTF glyph 파싱을 통해 새로운 subset 을 만들 때 상당수 Hangul
  // glyph 가 .notdef 으로 떨어져 출력 PDF 에서 공백·첫글자만 렌더되는 현상이
  // 관찰됨 (Node 환경에서는 정상). 이미 2.8 MB 로 pre-subsetted 된 TTF 를 그대로
  // 내장하여 재-subset 단계를 건너뜀 — PDF 크기는 ~5 MB 증가하지만 올바른
  // 렌더가 모든 환경에서 보장됨.
  //
  // FillFormFields 는 `embedKoreanFonts` (subset: true) 를 계속 사용 — PDF 양식
  // 채우기는 소수 글자만 쓰므로 브라우저 subset 이슈에서 자유로움.
  // loadKoreanFontBuffers 는 매 호출마다 독립 복사본을 반환하므로 추가 clone 불필요.
  const buffers = await loadKoreanFontBuffers();
  const fonts = {
    regular: await doc.embedFont(buffers.regular, { subset: false }),
    bold: await doc.embedFont(buffers.bold, { subset: false }),
  };

  // A4 landscape: 842 x 595 pt
  const page = doc.addPage([842, 595]);
  const { width, height } = page.getSize();
  const margin = 30;

  const title = formatSeatingTitle(className);
  drawText(page, title, {
    x: width / 2,
    y: height - margin - 18,
    font: fonts.bold,
    size: 18,
    align: 'center',
  });

  // colMap (gap 포함) — Excel과 동일 로직
  const isPairMode = !!seating.pairMode;
  const oddMode = seating.oddColumnMode ?? 'single';
  const colMap: Array<{ type: 'seat'; col: number } | { type: 'gap' }> = [];
  if (isPairMode) {
    const groups = buildPairGroups(seating.cols, oddMode);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]!;
      if (gi > 0) colMap.push({ type: 'gap' });
      for (let c = g.startCol; c <= g.endCol; c++) {
        colMap.push({ type: 'seat', col: c });
      }
    }
  } else {
    for (let c = 0; c < seating.cols; c++) {
      colMap.push({ type: 'seat', col: c });
    }
  }

  // 우측 명렬표 차지 폭
  const rosterWidth = 130;
  const gridAreaLeft = margin;
  const gridAreaRight = width - margin - rosterWidth - 20;
  const gridAreaTop = height - margin - 50;
  const gridAreaBottom = margin + 40; // 교탁 공간 확보

  const seatColCount = colMap.filter((d) => d.type === 'seat').length;
  const gapColCount = colMap.length - seatColCount;
  // gap = seat width 의 1/4 정도
  const totalUnits = seatColCount + gapColCount * 0.25;
  const gridAreaWidth = gridAreaRight - gridAreaLeft;
  const seatW = gridAreaWidth / totalUnits;
  const gapW = seatW * 0.25;
  const cellH = Math.min(
    32,
    (gridAreaTop - gridAreaBottom) / Math.max(seating.rows, 1),
  );
  const gridH = cellH * seating.rows;
  const gridStartY = gridAreaTop;

  // x 좌표 사전 계산
  const colXs: number[] = [];
  let cursor = gridAreaLeft;
  for (const desc of colMap) {
    colXs.push(cursor);
    cursor += desc.type === 'seat' ? seatW : gapW;
  }

  // 좌석 그리드 (뒷자리=상단, 좌우 반전)
  for (let displayR = 0; displayR < seating.rows; displayR++) {
    const actualR = seating.rows - 1 - displayR;
    const cellY = gridStartY - cellH * (displayR + 1);
    for (let i = 0; i < colMap.length; i++) {
      const desc = colMap[i]!;
      if (desc.type === 'gap') continue;
      const mirroredCol = seating.cols - 1 - desc.col;
      const studentId = seating.seats[actualR]?.[mirroredCol] ?? null;
      const student = getStudent(studentId);
      const x = colXs[i]!;
      const w = seatW;

      const filled = !!student;
      page.drawRectangle({
        x,
        y: cellY,
        width: w,
        height: cellH,
        color: filled ? rgb(0.86, 0.92, 0.996) : rgb(1, 1, 1),
        borderColor: rgb(0.82, 0.84, 0.88),
        borderWidth: 0.7,
      });

      if (student) {
        drawText(page, student.name, {
          x: x + w / 2,
          y: cellY + cellH / 2 - 4,
          font: fonts.bold,
          size: 10,
          align: 'center',
          maxWidth: w - 6,
        });
      }
    }
  }

  // 교탁
  const gyotakY = gridStartY - gridH - 14;
  const gyotakLeft = gridAreaLeft + gridAreaWidth * 0.3;
  const gyotakRight = gridAreaLeft + gridAreaWidth * 0.7;
  page.drawRectangle({
    x: gyotakLeft,
    y: gyotakY - 18,
    width: gyotakRight - gyotakLeft,
    height: 22,
    color: rgb(0.39, 0.45, 0.55),
  });
  drawText(page, '[ 교 탁 ]', {
    x: (gyotakLeft + gyotakRight) / 2,
    y: gyotakY - 13,
    font: fonts.bold,
    size: 11,
    align: 'center',
    color: rgb(1, 1, 1),
  });

  // 명렬표
  const rosterX = width - margin - rosterWidth;
  const rosterTop = height - margin - 50;
  drawText(page, title.replace('자리배치표', '명렬표'), {
    x: rosterX + rosterWidth / 2,
    y: rosterTop + 8,
    font: fonts.bold,
    size: 11,
    align: 'center',
  });

  const sorted = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  const rosterRowH = 16;
  const numColW = 32;
  const nameColW = rosterWidth - numColW;

  // 헤더
  drawRosterCell(page, fonts.bold, '번호', rosterX, rosterTop - rosterRowH, numColW, rosterRowH, true);
  drawRosterCell(page, fonts.bold, '이름', rosterX + numColW, rosterTop - rosterRowH, nameColW, rosterRowH, true);

  // 데이터
  let availableRosterRows = Math.floor((rosterTop - rosterRowH - margin) / rosterRowH);
  for (let i = 0; i < sorted.length && i < availableRosterRows; i++) {
    const s = sorted[i]!;
    const y = rosterTop - rosterRowH * (i + 2);
    drawRosterCell(
      page,
      fonts.regular,
      String(s.studentNumber ?? '').padStart(2, '0'),
      rosterX,
      y,
      numColW,
      rosterRowH,
      false,
    );
    drawRosterCell(page, fonts.regular, s.name, rosterX + numColW, y, nameColW, rosterRowH, false);
  }

  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function drawRosterCell(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  header: boolean,
): void {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: header ? rgb(0.93, 0.95, 0.98) : rgb(1, 1, 1),
    borderColor: rgb(0.82, 0.84, 0.88),
    borderWidth: 0.5,
  });
  drawText(page, text, {
    x: x + w / 2,
    y: y + h / 2 - 3,
    font,
    size: 9,
    align: 'center',
    maxWidth: w - 4,
  });
}

interface DrawTextOpts {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  align?: 'left' | 'center';
  color?: ReturnType<typeof rgb>;
  maxWidth?: number;
}

function drawText(page: PDFPage, text: string, opts: DrawTextOpts): void {
  // 폰트 크기를 축소해서 maxWidth 내부에 맞추는 auto-shrink 전략.
  // 이전의 문자열 truncation 은 Korean subset 폰트에서 widthOfTextAtSize 가
  // 기대치보다 큰 값을 반환하는 경우 글자를 통째로 날려버리는 문제가 있었음.
  let size = opts.size;
  let textWidth = safeWidth(opts.font, text, size);
  if (opts.maxWidth && textWidth > opts.maxWidth) {
    const ratio = opts.maxWidth / textWidth;
    size = Math.max(6, opts.size * ratio * 0.98);
    textWidth = safeWidth(opts.font, text, size);
  }
  const drawX = opts.align === 'center' ? opts.x - textWidth / 2 : opts.x;
  page.drawText(text, {
    x: drawX,
    y: opts.y,
    size,
    font: opts.font,
    color: opts.color ?? rgb(0.07, 0.09, 0.12),
  });
}

function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    const w = font.widthOfTextAtSize(text, size);
    return Number.isFinite(w) ? w : text.length * size * 0.6;
  } catch {
    return text.length * size * 0.6;
  }
}

function formatSeatingTitle(className: string): string {
  if (!className) return '자리배치표';
  const m = className.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return `${m[1]}학년 ${m[2]}반 자리배치표`;
  return `${className} 자리배치표`;
}
