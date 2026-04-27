/**
 * StickerImageProcessor — 이모티콘 이미지 정규화 (Electron 메인 프로세스 전용).
 *
 * 입력 이미지를 360x360 PNG 버퍼로 변환하고 SHA-256 기반 contentHash(16hex)를 생성한다.
 * 정사각형이 아닐 경우 짧은 변 기준으로 가운데를 잘라낸다.
 *
 * 의존성: Electron `nativeImage` (sharp 없음), Node `fs/promises`, `crypto`.
 * 본 파일은 renderer 번들에 포함되면 안 된다 — `electron/main.ts` 또는 `electron/ipc/*` 에서만 import.
 */
import { nativeImage } from 'electron';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

export interface NormalizedSticker {
  pngBuffer: Buffer;
  /** SHA-256 첫 16자(hex). 동일 이미지 중복 검출용. */
  contentHash: string;
  width: 360;
  height: 360;
}

export class StickerImageProcessor {
  async normalizeFromPath(sourcePath: string): Promise<NormalizedSticker> {
    const buffer = await fs.readFile(sourcePath);
    return this.normalizeFromBuffer(buffer);
  }

  async normalizeFromBuffer(input: Buffer): Promise<NormalizedSticker> {
    let img = nativeImage.createFromBuffer(input);
    if (img.isEmpty()) {
      throw new Error(
        '이미지를 읽을 수 없어요. 파일이 손상되었거나 지원하지 않는 형식입니다.',
      );
    }

    const size = img.getSize();
    // 짧은 변 기준 중앙 정사각형 크롭
    if (size.width !== size.height) {
      const shorter = Math.min(size.width, size.height);
      const x = Math.round((size.width - shorter) / 2);
      const y = Math.round((size.height - shorter) / 2);
      img = img.crop({ x, y, width: shorter, height: shorter });
    }

    img = img.resize({ width: 360, height: 360, quality: 'best' });
    const pngBuffer = img.toPNG();
    const contentHash = crypto
      .createHash('sha256')
      .update(pngBuffer)
      .digest('hex')
      .slice(0, 16);

    return { pngBuffer, contentHash, width: 360, height: 360 };
  }
}
