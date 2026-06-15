/**
 * 텍스트 추출 품질 신호 → 사용자 안내(한국어) 매핑. 순수 함수 — UI/테스트에서 공용.
 * domain 의 ParsedTextQuality 만 의존(외부 라이브러리 타입 미사용).
 */
import type { ParsedTextQuality, TextQualityReason } from '@domain/ports/IDocumentParserPort';

export interface TextQualityNotice {
  /** 'scan' = 글자 자체가 없음(스캔), 'garbled' = 글자가 깨져 추출됨/부족 */
  readonly tone: 'scan' | 'garbled';
  readonly message: string;
}

const REASON_MESSAGE: Record<TextQualityReason, TextQualityNotice> = {
  image_based: {
    tone: 'scan',
    message:
      '이 문서는 사진(스캔)으로 되어 있어 글자를 읽지 못했어요. 글자가 들어 있는 파일을 사용해 주세요.',
  },
  low_text: {
    tone: 'garbled',
    message:
      '추출된 글자가 거의 없어요. 스캔 문서이거나 보호된 문서일 수 있으니 결과를 확인해 주세요.',
  },
  high_pua: {
    tone: 'garbled',
    message: '글자가 깨져서 추출됐어요(특수 글꼴/인코딩). 결과가 정확한지 확인해 주세요.',
  },
  high_control: {
    tone: 'garbled',
    message: '글자가 깨져서 추출됐어요(제어문자 혼입). 결과가 정확한지 확인해 주세요.',
  },
  high_replacement: {
    tone: 'garbled',
    message: '글자가 깨져서 추출됐어요(인코딩 손상). 결과가 정확한지 확인해 주세요.',
  },
};

const FALLBACK_NOTICE: TextQualityNotice = {
  tone: 'garbled',
  message: '글자가 제대로 추출되지 않았을 수 있어요. 결과를 확인해 주세요.',
};

/**
 * 품질 신호 → 안내. 검토가 필요 없거나 신호가 없으면 null.
 * reason 이 없거나 미지의 값이면 일반 폴백 문구를 반환한다.
 */
export function textQualityNotice(q: ParsedTextQuality | undefined): TextQualityNotice | null {
  if (!q || !q.needsReview) return null;
  if (q.reason && REASON_MESSAGE[q.reason]) return REASON_MESSAGE[q.reason];
  return FALLBACK_NOTICE;
}
