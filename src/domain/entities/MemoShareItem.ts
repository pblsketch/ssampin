import type { MemoColor } from '../valueObjects/MemoColor';
import type { MemoFontSize } from '../valueObjects/MemoFontSize';

/**
 * 메모 교실 공유 — Drive 보드 JSON 파일 타입 (Design v0.2 §2.1, plan.md C-2).
 *
 * 선생님 개인 Google Drive의 `board-{nanoid}.json` 파일 내용과 1:1.
 * Electron(작성)과 교실 페이지(landing, 읽기) 양쪽이 같은 스키마를 공유하며,
 * `parseBoardFile`(rules)이 version=1·필수 필드·enum을 가드한다.
 *
 * 위치(x/y)·rotation·archived 등 로컬 전용 속성은 공유 대상이 아니므로 포함하지 않는다.
 */
export interface MemoShareBoardFile {
  /** 스키마 버전 — 페이지 parseBoardFile이 가드 */
  readonly version: 1;
  /** 보드 제목 (페이지 헤더·manifest name) */
  readonly title: string;
  /** ISO 8601 — 페이지 diff 기준 */
  readonly updatedAt: string;
  /** 최대 50개(MAX_ITEMS), sortOrder 오름차순 권장 */
  readonly items: readonly MemoShareItemSnapshot[];
}

/** 보드 JSON 안의 포스트잇 1장 스냅샷 */
export interface MemoShareItemSnapshot {
  /** 로컬 Memo.id 재사용 — 페이지 diff 키 */
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;
  readonly fontSize: MemoFontSize;
  readonly sortOrder: number;
  /** 항목 단위 ISO 8601 — 페이지 UPDATE pulse 판정 */
  readonly updatedAt: string;
  /** Drive 이미지 파일 정보 — fileId는 업로드 전 빈 문자열, infra가 치환 */
  readonly image?: MemoShareItemSnapshotImage;
}

/** 스냅샷의 이미지 참조 (Drive 파일) */
export interface MemoShareItemSnapshotImage {
  /** Drive 이미지 fileId — buildBoardFile 시점에는 '' (infra가 업로드 후 치환) */
  readonly fileId: string;
  readonly width: number;
  readonly height: number;
}
