/**
 * signatureLegalCopy — Phase 2C US-2C-14 단일 진실 원천 (3 위치 공통 카피).
 *
 * 변경 시 함께 확인할 위치:
 *   1. 교사 발급 화면: `SignaturePdfUploadPanel` 상단 배너
 *   2. 학생 동의 표 헤더: `PrivacyConsentTable` (re-export 사용)
 *   3. 결과 PDF 생성 / 결과 파일 열기 버튼 툴팁: `ToolSignatureRequest`
 *
 * 회귀 가드: `SignatureRequestRegressionGates.test.ts` 가 3 파일이 이 모듈을 import 하는지
 * 확인한다. 카피 문장 자체는 본 상수 한 곳에서만 정의된다.
 *
 * 정책 (1차 출시):
 *   - 자필 서명과 동등한 법적 효력은 보장되지 않는다 (행정 의사 확인용)
 *   - 결과 PDF 시각 워터마크 부재 — 메타데이터(setKeywords/setProducer)만으로 행정용 표기
 *   - raw IP / 강한 식별자 비저장 — SHA-256 해시만
 */
export const SIGNATURE_LEGAL_DISCLAIMER =
  '이 서명은 행정용 의사 확인용입니다. 자필 서명과 동등한 법적 효력은 보장되지 않습니다.';
