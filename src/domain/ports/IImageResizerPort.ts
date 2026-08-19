/**
 * 이미지 축소 포트.
 *
 * 실제 축소는 브라우저(캔버스) 기능이라 infrastructure 의 일이다.
 * 도메인·유즈케이스는 이 포트만 알면 되고, 덕분에 시험에서는 가짜 축소기를 끼울 수 있다
 * (jsdom 에는 캔버스 인코딩이 없어서 진짜 축소기로는 시험이 불가능하다).
 */

export interface ResizedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

export interface IImageResizerPort {
  /**
   * 긴 변이 `maxDimension` 이하가 되도록 줄인다. **키우지는 않는다.**
   * 줄일 필요가 없으면 원본을 그대로 돌려줄 수 있다.
   */
  resize(
    bytes: Uint8Array,
    mimeType: string,
    maxDimension: number,
    quality: number,
  ): Promise<ResizedImage>;
}
