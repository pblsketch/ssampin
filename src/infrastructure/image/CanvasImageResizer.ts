/**
 * 캔버스 기반 이미지 축소기.
 *
 * 데스크톱(Electron 렌더러)과 모바일 PWA 모두 브라우저 환경이라 같은 코드로 동작한다.
 *
 * ⚠️ **jsdom 에는 캔버스 인코딩이 없다.** 그래서 이 파일은 자동 시험으로 검증되지 않고,
 * 실기기 확인 항목이다. 대신 크기 계산(줄이기만 하고 키우지 않는 규칙)은
 * 순수 함수로 도메인에 빼서 시험으로 고정해 두었다(`computePhotoResizeTarget`).
 */

import type { IImageResizerPort, ResizedImage } from '@domain/ports/IImageResizerPort';
import { computePhotoResizeTarget } from '@domain/rules/studentPhotoRules';

function canUseCanvasPipeline(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    typeof Blob === 'function'
  );
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export class CanvasImageResizer implements IImageResizerPort {
  async resize(
    bytes: Uint8Array,
    mimeType: string,
    maxDimension: number,
    quality: number,
    forceReencode = false,
  ): Promise<ResizedImage> {
    if (!canUseCanvasPipeline()) {
      // 축소할 수 없는 환경에서는 조용히 원본을 저장하지 않는다 —
      // 얼굴 사진이 원본 크기로 쌓이면 용량도 유출 표면도 계획과 달라진다.
      throw new Error('이 환경에서는 사진 크기를 줄일 수 없습니다.');
    }

    const source = new Blob([bytes as unknown as BlobPart], { type: mimeType });
    const bitmap = await createImageBitmap(source);
    try {
      const target = computePhotoResizeTarget(bitmap.width, bitmap.height, maxDimension);
      if (target.width === 0 || target.height === 0) {
        throw new Error('사진 크기를 읽지 못했습니다.');
      }

      // 줄일 필요가 없으면 다시 압축하지 않는다 (재압축은 화질만 깎는다).
      // 단 forceReencode 면 다시 압축한다 — 크기는 작은데 용량만 큰 사진을 줄이는 유일한 방법이다.
      if (!forceReencode && target.width === bitmap.width && target.height === bitmap.height) {
        return { bytes, mimeType, width: bitmap.width, height: bitmap.height };
      }

      const canvas = new OffscreenCanvas(target.width, target.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('사진을 그릴 수 없습니다.');
      context.drawImage(bitmap, 0, 0, target.width, target.height);

      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      return {
        bytes: await blobToBytes(blob),
        mimeType: 'image/jpeg',
        width: target.width,
        height: target.height,
      };
    } finally {
      bitmap.close();
    }
  }
}
