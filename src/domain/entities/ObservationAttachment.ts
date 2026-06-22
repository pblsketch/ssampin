/**
 * 관찰 기록 첨부 자료.
 *
 * 설계 원칙:
 * - 첨부는 "순수 참조 메타"다. 파일 본체(이미지/문서 바이너리)는 별도 바이너리 스토어에
 *   저장하고, 여기에는 storageRef(상대경로)만 둔다. base64 바이너리를 JSON에 넣지 않는다.
 * - extractedText 는 문서에서 추출한 "원문"이다(마스킹하지 않는다). 교사는 본체에서 원문을
 *   그대로 보고, 외부 AI 노출이 필요할 때 ai-bridge egress 에서 탈식별한다(관찰 content 와 동일 모델).
 *   Phase 0+1 에서는 추출을 수행하지 않으므로 항상 undefined 다(Phase 2 에서 채워진다).
 */

export type ObservationAttachmentKind = 'image' | 'document';

/** 자료 출처: 교사 작성 자료 vs 학생 제출물 (생기부 작성 시 출처 구분용). */
export type ObservationAttachmentSource = 'teacher' | 'student';

/**
 * 텍스트 추출 품질 신호 (Phase 2 — 문서→텍스트 추출 시 채워짐).
 * needsReview 가 true 면 사용자 확인을 권한다. reason 은 IDocumentParserPort 의 어휘를 미러링한다.
 */
export interface ObservationTextQuality {
  readonly needsReview: boolean;
  readonly reason?: 'image_based' | 'low_text' | 'high_pua' | 'high_control' | 'high_replacement';
}

export interface ObservationAttachment {
  readonly id: string;
  /** 연결된 관찰 기록 id (ObservationRecord.id) */
  readonly observationId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly kind: ObservationAttachmentKind;
  readonly byteSize: number;
  /** 바이너리 스토어 상대경로: "obs-attachments/{id}.{ext}" */
  readonly storageRef: string;
  /**
   * 문서에서 추출한 원문 텍스트(마스킹하지 않음). AI 노출 시 ai-bridge egress 에서 탈식별.
   * Phase 2 에서만 채워진다.
   */
  readonly extractedText?: string;
  /** 텍스트 추출 품질 신호. Phase 2. */
  readonly textQuality?: ObservationTextQuality;
  /** 자료 출처: 교사 작성 vs 학생 제출물 */
  readonly source: ObservationAttachmentSource;
  /** ISO 8601 */
  readonly createdAt: string;
}

export interface ObservationAttachmentsData {
  readonly attachments: readonly ObservationAttachment[];
}
