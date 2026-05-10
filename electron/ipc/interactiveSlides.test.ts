/**
 * file:// → /slide-image/ 경로 변환 단위 테스트.
 *
 * (HTTP 라우터 자체는 Electron app + fs 의존이라 통합 테스트 영역.
 *  본 테스트는 broadcaster rewrite 핵심 함수만 검증.)
 */

import { describe, expect, it } from 'vitest';
import { fileUrlToHttpPath } from './interactiveSlides';

describe('fileUrlToHttpPath', () => {
  it('Windows 경로 변환', () => {
    const input =
      'file:///C:/Users/teacher/AppData/Roaming/ssampin/cache/slides/PRES_ID/REV_ID/p1.png';
    expect(fileUrlToHttpPath(input)).toBe('/slide-image/PRES_ID/REV_ID/p1.png');
  });

  it('POSIX 경로 변환', () => {
    const input = 'file:///home/teacher/.config/ssampin/cache/slides/p/r/p1.png';
    expect(fileUrlToHttpPath(input)).toBe('/slide-image/p/r/p1.png');
  });

  it('"/cache/slides/"가 없으면 원본 그대로 (fail-safe)', () => {
    const input = 'file:///some/other/path.png';
    expect(fileUrlToHttpPath(input)).toBe('file:///some/other/path.png');
  });

  it('이미 HTTP 경로인 입력도 안전', () => {
    const input = '/slide-image/p/r/p1.png';
    expect(fileUrlToHttpPath(input)).toBe('/slide-image/p/r/p1.png');
  });

  it('userData 경로에 공백·한글 포함 (한국 사용자 환경)', () => {
    // Windows에서 경로에 한글이 있는 경우 (예: C:\Users\홍길동\...)
    const input =
      'file:///C:/Users/홍길동/AppData/Roaming/ssampin/cache/slides/PRES/REV/p1.png';
    expect(fileUrlToHttpPath(input)).toBe('/slide-image/PRES/REV/p1.png');
  });
});
