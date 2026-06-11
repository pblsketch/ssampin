/**
 * 메모 교실 공유 — 로컬 보드 엔티티 (Design v0.2 §2.2).
 *
 * Electron 로컬 저장(`storage.write('memoShareBoards', ...)`) 단위.
 * 로컬 메모가 원본(source of truth)이고, 이 엔티티는 "어떤 메모를 Drive에
 * 공유했는지 + 마지막 동기화 상태"만 추적한다.
 * 공유 데이터(내용·이미지)는 선생님 개인 Google Drive에만 존재한다 — 쌤핀 서버 무저장.
 */

import type { MemoShareTtsVoice } from './MemoShareItem';

/** 로컬 Memo ↔ Drive 업로드 결과의 연결 + 마지막 동기화 추적 1건 */
export interface MemoShareItemLink {
  /** 로컬 Memo.id */
  readonly memoId: string;
  /** 업로드된 이미지 Drive fileId (이미지 없는 메모는 미존재) */
  readonly imageFileId?: string;
  readonly sortOrder: number;
  /** ISO 8601 — 마지막으로 Drive에 push된 시각 */
  readonly lastSyncedAt: string;
  /**
   * content+color+fontSize+image 해시 (`computeItemHash` 결과).
   * 동일하면 push skip — 위치(x/y)·rotation 이동은 해시에 미포함이므로 자연 skip된다.
   */
  readonly lastSyncedHash: string;
}

export interface MemoShareBoard {
  /** Drive 보드 JSON fileId (33자+, 추측 불가) — 교실 페이지 URL의 id */
  readonly id: string;
  readonly title: string;
  /** https://ssampin.com/memo/{fileId} */
  readonly shareUrl: string;
  /** ShortLinkClient 재사용 숏링크 (선택) — URL 문자열만 저장, 내용 아님 */
  readonly shortUrl?: string;
  readonly items: readonly MemoShareItemLink[];
  /** 보드 기본 TTS 음성 (미설정 = 여성) — 보드 JSON에도 실림 */
  readonly ttsVoice?: MemoShareTtsVoice;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

/** 로컬 영속 파일 루트 (MemosData 패턴) */
export interface MemoShareBoardsData {
  readonly boards: readonly MemoShareBoard[];
}
