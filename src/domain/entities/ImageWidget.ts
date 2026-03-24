/** 이미지 비율 프리셋 */
export type ImageAspectRatio = 'free' | '1:1' | '16:9' | '4:3' | '3:2' | '9:16';

export const ASPECT_RATIO_LABELS: Record<ImageAspectRatio, string> = {
  free: '자유',
  '1:1': '정사각형 (1:1)',
  '16:9': '와이드 (16:9)',
  '4:3': '표준 (4:3)',
  '3:2': '사진 (3:2)',
  '9:16': '세로 (9:16)',
};

/** 이미지 표시 모드 */
export type ImageFitMode = 'cover' | 'contain' | 'fill';

export const FIT_MODE_LABELS: Record<ImageFitMode, string> = {
  cover: '꽉 채우기 (잘림)',
  contain: '전체 보기 (여백)',
  fill: '늘리기',
};

/** 이미지 위젯 데이터 (위젯별 설정) */
export interface ImageWidgetData {
  /** 이미지 dataURL (base64) */
  readonly imageUrl: string | null;
  /** 이미지 원본 파일명 */
  readonly fileName?: string;
  /** 비율 프리셋 */
  readonly aspectRatio: ImageAspectRatio;
  /** 표시 모드 */
  readonly fitMode: ImageFitMode;
  /** 라운드 (0~24px) */
  readonly borderRadius: number;
  /** 테두리 표시 */
  readonly showBorder: boolean;
  /** 캡션 (하단 텍스트, 선택) */
  readonly caption?: string;
}

export const DEFAULT_IMAGE_WIDGET_DATA: ImageWidgetData = {
  imageUrl: null,
  aspectRatio: 'free',
  fitMode: 'cover',
  borderRadius: 8,
  showBorder: false,
};

/** 전체 이미지 위젯 저장 데이터 */
export interface ImageWidgetsData {
  /** widgetInstanceId → ImageWidgetData 매핑 */
  readonly widgets: Record<string, ImageWidgetData>;
}
