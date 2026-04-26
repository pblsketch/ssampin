export type RealtimeWallLayoutMode = 'kanban' | 'freeform' | 'grid' | 'stream';

/**
 * 카드 상태.
 *
 * - `pending` : 학생 제출 후 교사 승인 대기 (manual mode)
 * - `approved`: 학생/교사 모두에게 표시
 * - `hidden`  : 교사가 명시적으로 숨김 (`hideRealtimeWallPost`)
 * - `hidden-by-author` (v2.1 신규) : 학생 본인이 자기 카드 삭제 → soft delete.
 *   - posts 배열에서 제거되지 않음 (회귀 위험 #8 — hard delete 패턴 grep 0 hit)
 *   - 좋아요/댓글 보존
 *   - 학생/교사 화면에 "작성자가 삭제했어요" placeholder 카드 표시
 *   - 교사는 복원 가능 (status='approved' 복귀)
 *
 * 참고: Phase B에서는 status union 확장만 도입 (선언). 실제 활용은 Phase D.
 */
export type RealtimeWallPostStatus =
  | 'pending'
  | 'approved'
  | 'hidden'
  | 'hidden-by-author';

/**
 * v2.1 신규 — 카드 색상 8색 (Plan §7.2 결정 #6, Padlet 패턴 research §3 #1).
 *
 * 학생이 카드 작성 시 모달 하단 horizontal scroll 픽커로 선택. 카드 배경 alpha 80% +
 * 좌상단 점으로 표시. sp-* 토큰과 별개 (학생 표현 자유도).
 *
 * 기본값 'white' (undefined도 'white'로 정규화 — `normalizePostForPadletModeV2`).
 */
export type RealtimeWallCardColor =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'gray'
  | 'white';

/**
 * OG 메타 공통 필드. Main 프로세스 fetch IPC 응답과 webpage variant가 공유.
 * 이미지는 원격 URL만 보관 — 쌤핀 용량 정책.
 */
export interface RealtimeWallLinkPreviewOgMeta {
  readonly ogTitle?: string;
  readonly ogDescription?: string;
  readonly ogImageUrl?: string;
}

/**
 * 학생이 제출한 linkUrl을 서버가 분류·해석한 결과.
 */
export type RealtimeWallLinkPreview =
  | {
      readonly kind: 'youtube';
      readonly videoId: string;
    }
  | ({
      readonly kind: 'webpage';
    } & RealtimeWallLinkPreviewOgMeta);

export interface RealtimeWallColumn {
  readonly id: string;
  readonly title: string;
  readonly order: number;
}

export interface RealtimeWallKanbanPosition {
  readonly columnId: string;
  readonly order: number;
}

export interface RealtimeWallFreeformPosition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly zIndex: number;
}

export interface RealtimeWallPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  /** Main 프로세스의 OG fetch 완료 후 upsert. 실패 시 undefined 유지. */
  readonly linkPreview?: RealtimeWallLinkPreview;
  readonly status: RealtimeWallPostStatus;
  readonly pinned: boolean;
  /**
   * 교사 로컬 하트 카운터. v1.13에서 도입.
   * v1.14 (padlet mode) 기준 §12 Q1 확정: 학생에게도 read-only로 노출.
   */
  readonly teacherHearts?: number;
  readonly submittedAt: number;
  readonly kanban: RealtimeWallKanbanPosition;
  readonly freeform: RealtimeWallFreeformPosition;

  // ============ v1.14 Phase P2 (padlet mode) 신규 필드 ============
  // 모두 optional — v1.13 데이터 무손실 마이그레이션 보장. normalizePostForPadletMode가
  // 로드 시 기본값(0/[]/[])을 주입한다.

  /**
   * 학생이 누른 좋아요 집계 (익명 카운트).
   * 교사의 teacherHearts와 별개 필드·별개 시각(§12 Q5 확정: red-400 filled vs rose-200 outline).
   */
  readonly likes?: number;

  /**
   * 좋아요를 누른 학생 sessionToken 배열 (중복 누름 방지 + unlike 동작).
   * 최대 1000개. 1000 초과 시 시간순 오래된 것부터 drop.
   * PIPA 위반 없음 — 임의 UUID 토큰, 학생 ID 아님.
   */
  readonly likedBy?: readonly string[];

  /**
   * 학생 댓글 배열. 카드당 최대 50개 (도메인 규칙 강제).
   * 교사만 삭제 권한 — 삭제 시 배열에서 제거되지 않고 status='hidden'으로 전환.
   */
  readonly comments?: readonly RealtimeWallComment[];

  // ============ v1.15.x Phase B (padlet mode v2.1 — 학생 UX 정교화) ============
  // 모두 optional — v1.14.x 데이터 무손실 마이그레이션 보장.
  // `normalizePostForPadletModeV2`가 로드 시 default를 주입한다.
  // Design v2.1 §2.1 참조.

  /**
   * v2.1 — 카드당 최대 3장 이미지 (base64 data URL).
   * - 카드 합계 5MB 한도 (클라이언트 사전 차단 + 서버 Zod 검증)
   * - canvas 리사이즈(max width 1280px, JPEG quality 0.8) 후 인코딩
   * - magic byte 검증: PNG / JPEG / GIF / WebP만. SVG 명시 차단 (XSS)
   * - 미존재 = undefined로 정규화 (빈 배열도 허용 — 의미 동일)
   *
   * v3+에서 다시 attachments 배열(kind union) 도입 시 별도 마이그레이션.
   */
  readonly images?: readonly string[];

  /**
   * v2.1 — PDF 첨부 파일 URL.
   * - 별도 IPC 채널(`realtime-wall:upload-pdf`)로 업로드 후 file:// URL
   * - max 10MB (Plan FR-B4)
   * - magic byte `%PDF-` 검증 — svg/script/exe 거부
   * - WebSocket broadcast에는 fileURL만 (base64 X — 페이로드 폭증 방지)
   * - 학생/교사 모두 fileURL로 새 탭 열기
   */
  readonly pdfUrl?: string;
  readonly pdfFilename?: string;

  /**
   * v2.1 — 카드 색상 8색 (Plan §7.2 결정 #6).
   * - 기본 'white' (undefined도 'white'로 정규화)
   * - 카드 배경 alpha 80% + 좌상단 dot으로 표시
   */
  readonly color?: RealtimeWallCardColor;

  /**
   * v2.1 — 작성한 학생의 sessionToken (Phase D/C 활용).
   * - 학생 입력 시 서버가 ws.sessionToken을 강제 주입 (학생 직접 송신 신뢰 X — 위조 방지)
   * - 학생 수정/삭제/이동 메시지 수신 시 서버가 매칭 검증
   * - 교사 생성 카드는 undefined (학생 권한 영역 외)
   * - v1.14.x 기존 카드는 undefined → 학생 권한 차단 (best-effort, 손실 0)
   *
   * PIPA 영역 침범 X — sessionToken은 crypto.randomUUID() 생성 임의값, 학생 ID 아님.
   * v2.1: localStorage 영속 (sessionStorage 양방향 위험 mitigation).
   *
   * Phase B에서는 선언만 — 실제 매칭 검증 로직은 Phase D.
   */
  readonly ownerSessionToken?: string;

  /**
   * v2.1 — 학생 PIN의 SHA-256 hash (hex 64자리, Phase D 활용).
   * - 학생이 4자리 PIN 입력 → SubtleCrypto.digest('SHA-256') → hex string
   * - 서버는 hash만 보관 (PIN 평문 절대 저장 X — PIPA 정합 + 회귀 위험 #9)
   * - 매칭: post.studentPinHash === hashedCurrentPin (sessionToken과 OR 매칭)
   * - PIN 미설정 학생은 undefined (익명 일회성 모드 = 현재 동작)
   * - 교사 화면에서 PIN reset 권한 X (교사는 hash만 봄 → 평문 복원 불가)
   *
   * Phase B에서는 선언만 — 실제 매칭 검증 로직은 Phase D.
   */
  readonly studentPinHash?: string;

  /**
   * v2.1 — 카드가 수정된 적이 있는지 (Phase D — UI 표시 용도).
   * 단순 boolean (수정 횟수/이력 미저장 — Padlet 동일 정책, research §5-1).
   *
   * Phase B에서는 선언만.
   */
  readonly edited?: boolean;
}

/**
 * 학생 댓글. 평면 구조 (대댓글 없음).
 * v1.14 Phase P2 신규.
 *
 * 교사 삭제 시 status='hidden'으로 전환 (배열 인덱스 보존).
 * 학생 화면에서는 status='hidden' 댓글 제외, 교사 화면에서는 흐린 스타일로 표시.
 */
export interface RealtimeWallComment {
  readonly id: string;
  /** 작성자 닉네임 (join 시 닉네임 default). 1~20자. */
  readonly nickname: string;
  /** 댓글 본문. 1~200자. */
  readonly text: string;
  /** UTC ms timestamp. */
  readonly submittedAt: number;
  /**
   * 작성자 sessionToken — 서버 보관 전용.
   * 학생 UI에서 노출 금지 (CommentList 렌더 시 생략).
   */
  readonly sessionToken: string;
  /** 'approved' 기본 / 교사 삭제 시 'hidden'. */
  readonly status: 'approved' | 'hidden';

  /**
   * v2.1 — 댓글 이미지 1장 첨부 (Plan FR-B12).
   * - 최대 1장 (카드 본문은 3장이지만 댓글은 단일)
   * - base64 data URL (이미지 다중 검증 규칙 동일 — magic byte / SVG 차단)
   * - 미존재 = undefined
   *
   * Phase B에서는 도메인 선언만. 실제 UI/IPC 활용은 StudentCommentForm + Zod schema.
   */
  readonly images?: readonly string[];
}

/**
 * 학생이 댓글 작성 시 서버에 전달하는 raw input.
 * id/submittedAt/status는 서버가 부여.
 */
export interface StudentCommentInput {
  readonly nickname: string;
  readonly text: string;
  readonly sessionToken: string;
  /**
   * v2.1 — 댓글 이미지 1장 첨부 (Plan FR-B12, Design v2.1 §4.2 SubmitCommentV2Schema).
   * data URL 배열, max 1장.
   */
  readonly images?: readonly string[];
}

export interface RealtimeWallBoard {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
}

// ============================================================
// v1.13 — 영속 담벼락 (WallBoard)
// Design §1.1 / §3 참조
// ============================================================

/** 영속 보드 식별자. 저장소 경로에 사용되므로 생성 시 sanitize. */
export type WallBoardId = string & { readonly __brand: 'WallBoardId' };

/**
 * 승인 정책 (v1.13.0은 manual/auto만 구현, filter는 v1.13.2 예정 스텁).
 *
 * - `manual`: 학생 제출 → pending 대기열, 교사가 개별 승인.
 * - `auto`  : 학생 제출 → 즉시 approved (빠른 대규모 수합용).
 * - `filter`: 키워드 필터 기반 자동 승인 (준비 중, v1.13.0은 pending 폴백).
 */
export type WallApprovalMode = 'manual' | 'auto' | 'filter';

/**
 * 썸네일 mini-preview용 경량 post snapshot.
 *
 * 목록 화면의 `WallBoardThumbnail` 렌더에 쓰인다. 본 값은 `WallBoardMeta`에
 * 인라인 포함되어 목록 로드 시 추가 fetch 없이 썸네일을 그릴 수 있게 한다.
 * Design §3.5.1a.
 */
export interface WallPreviewPost {
  readonly id: string;
  readonly nickname: string;
  /** 원본 text를 100자로 truncate한 값 (과도한 index 크기 방지) */
  readonly text: string;
  readonly kanban?: RealtimeWallKanbanPosition;
  readonly freeform?: RealtimeWallFreeformPosition;
}

/**
 * 보드 목록 화면용 경량 메타.
 *
 * 전체 `WallBoard` 로드 없이 카드 렌더에 필요한 정보만 담는다.
 * `listAllMeta()` 한 번으로 모든 보드 카드를 빠르게 그릴 수 있도록 설계.
 */
export interface WallBoardMeta {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly approvalMode: WallApprovalMode;
  readonly postCount: number;
  readonly approvedCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 마지막 라이브 세션 종료 시각. 재열기 시 "N일 전 수업" 표시용. */
  readonly lastSessionAt?: number;
  /** 보관 처리된 보드. 삭제 아님, 목록에서 별도 섹션. */
  readonly archived?: boolean;
  /** 학생 접속용 고정 short-code (Design §1.1 Open Question #2 확정). */
  readonly shortCode?: string;
  /** 썸네일용 상위 6개 approved post snapshot. Design §3.5.1a. */
  readonly previewPosts: readonly WallPreviewPost[];
}

/**
 * 영속 담벼락 인스턴스. 교사가 학기 내내 재사용하는 단위.
 *
 * 라이브 세션은 WallBoard 위에 0..N회 실행되며, 각 세션의 학생 제출이
 * posts에 누적된다. `shortCode`는 보드 최초 라이브 세션 시 Supabase 쪽에서
 * 발급해 여기 보관 → 재열기 시 재사용 (교사가 학기 내내 동일 코드로 학생
 * 공지 가능).
 *
 * Design §1.1.
 */
export interface WallBoard {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly approvalMode: WallApprovalMode;
  readonly posts: readonly RealtimeWallPost[];
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 마지막 라이브 세션 종료 시각. 재열기 시 "N일 전 수업"을 표시용. */
  readonly lastSessionAt?: number;
  /** 보관 처리된 보드는 목록에서 별도 섹션. 삭제 아님. */
  readonly archived?: boolean;
  /**
   * 학생 접속용 고정 short-code. 보드 생성 시 `generateWallShortCode`로
   * 발급되어 불변 유지. 다음 라이브 세션 시 재사용.
   *
   * 만료 정책: `archived=true` 또는 명시적 "코드 재발급" 메뉴 선택 시 만료.
   */
  readonly shortCode?: string;

  /**
   * v2.1 신규 — 보드 단위 설정 (Plan §7.2 결정 #8 / Design v2.1 §2.6).
   *
   * Phase B에서는 도메인 선언만 (Phase A에서 BoardCreateModal /
   * RealtimeWallBoardSettingsPanel UI 토글 + WebSocket boardSettings-changed
   * broadcast 활용).
   *
   * 미존재 시 `normalizeBoardForPadletModeV2`가 `DEFAULT_REALTIME_WALL_BOARD_SETTINGS`
   * (`{ version: 1, moderation: 'off' }`) 주입.
   */
  readonly settings?: import('./RealtimeWallBoardSettings').RealtimeWallBoardSettings;
}
