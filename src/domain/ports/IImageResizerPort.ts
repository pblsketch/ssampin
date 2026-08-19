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
   *
   * @param forceReencode 크기를 줄일 필요가 없어도 **다시 압축**한다.
   *   원본이 이미 작은데 용량만 큰 사진(예: 200x260 인데 300KB)을 줄이려면 필요하다.
   *   이게 없으면 상한 초과 시 품질을 낮춰 재시도해도 **같은 원본이 그대로 돌아와**
   *   그 학생 사진이 통째로 버려진다.
   */
  resize(
    bytes: Uint8Array,
    mimeType: string,
    maxDimension: number,
    quality: number,
    forceReencode?: boolean,
  ): Promise<ResizedImage>;
}
