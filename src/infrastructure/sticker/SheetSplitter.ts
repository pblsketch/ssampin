/**
 * SheetSplitter — N×N 시트 이미지를 개별 셀로 분할 (Electron 메인 프로세스 전용).
 *
 * 입력 시트를 받아 격자 크기(2/3/4)로 자른 뒤 각 셀을 360×360 PNG로 정규화한다.
 * 빈 셀(투명 또는 단색 95%+) 자동 감지 → renderer가 미리보기에서 dim 처리.
 *
 * ⚠️ 의존성: Electron `nativeImage`, Node `crypto`. renderer 번들에 포함되면 안 된다.
 *
 * Electron tsconfig.electron.json은 `rootDir: electron`이라 본 파일을 main.ts에서
 * 직접 import할 수 없다 — electron/main.ts는 동일 로직을 inline 형태로 가진다.
 * (Phase 1a의 StickerImageProcessor 패턴과 동일.) 본 파일은 타입 명세서 + 도메인
 * 추후 unit 테스트(JSDOM 등)용으로 보존된다.
 */
import { nativeImage } from 'electron';
import * as crypto from 'crypto';
import type { GridSize } from '@domain/rules/stickerRules';

export interface SplitCellResult {
  /** row-major 0-based 인덱스 */
  index: number;
  row: number;
  col: number;
  /** 360×360 PNG 버퍼 */
  pngBuffer: Buffer;
  /** SHA-256 첫 16자(hex). 중복 검출용. */
  contentHash: string;
  /** 이 셀이 비어 보이는지 (95%+ 단색/투명) */
  isEmpty: boolean;
}

export class SheetSplitter {
  /**
   * 정사각형 시트를 gridSize×gridSize 셀로 자르고 각 셀을 360×360 PNG로 정규화한다.
   * 비어 있는 셀도 결과에 포함되며 `isEmpty: true` 플래그가 부여된다 — renderer가
   * 미리보기 단계에서 사용자가 확인 후 등록 여부를 판단한다.
   */
  async split(input: Buffer, gridSize: GridSize): Promise<SplitCellResult[]> {
    const sheet = nativeImage.createFromBuffer(input);
    if (sheet.isEmpty()) {
      throw new Error('이미지를 읽을 수 없어요.');
    }
    const size = sheet.getSize();
    const sheetSize = Math.min(size.width, size.height);
    const cellSize = Math.floor(sheetSize / gridSize);
    const results: SplitCellResult[] = [];

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cell = sheet.crop({
          x: col * cellSize,
          y: row * cellSize,
          width: cellSize,
          height: cellSize,
        });
        const normalized = cell.resize({
          width: 360,
          height: 360,
          quality: 'best',
        });
        const pngBuffer = normalized.toPNG();
        const isEmpty = this.detectEmptyCell(normalized);
        const contentHash = crypto
          .createHash('sha256')
          .update(pngBuffer)
          .digest('hex')
          .slice(0, 16);
        results.push({
          index: row * gridSize + col,
          row,
          col,
          pngBuffer,
          contentHash,
          isEmpty,
        });
      }
    }
    return results;
  }

  /**
   * 셀이 비어 있는지 휴리스틱 판정.
   * - 12×12 그리드 픽셀 샘플링 → BGRA 4채널 quantize(채널당 16단계).
   * - 알파<32면 'T'(투명)으로 묶음.
   * - 가장 많은 색이 95%+면 단색(또는 투명) 셀로 간주.
   */
  private detectEmptyCell(img: Electron.NativeImage): boolean {
    try {
      const bitmap = img.toBitmap(); // BGRA on most platforms
      const size = img.getSize();
      const SAMPLES_PER_AXIS = 12;
      const stepX = Math.max(1, Math.floor(size.width / SAMPLES_PER_AXIS));
      const stepY = Math.max(1, Math.floor(size.height / SAMPLES_PER_AXIS));
      const colorCounts = new Map<string, number>();
      let total = 0;
      for (let y = 0; y < size.height; y += stepY) {
        for (let x = 0; x < size.width; x += stepX) {
          const offset = (y * size.width + x) * 4;
          const b = bitmap[offset] ?? 0;
          const g = bitmap[offset + 1] ?? 0;
          const r = bitmap[offset + 2] ?? 0;
          const a = bitmap[offset + 3] ?? 0;
          // Quantize to 16 levels per channel for tolerance
          const key = a < 32 ? 'T' : `${r >> 4},${g >> 4},${b >> 4}`;
          colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
          total++;
        }
      }
      if (total === 0) return false;
      let maxCount = 0;
      for (const v of colorCounts.values()) {
        if (v > maxCount) maxCount = v;
      }
      return maxCount / total >= 0.95;
    } catch {
      return false;
    }
  }
}
