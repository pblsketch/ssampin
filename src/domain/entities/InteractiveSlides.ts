/**
 * Interactive Slides 도메인 엔티티 (Plan §3 + Design §2 매핑).
 *
 * 외부 의존성 0: React/Zustand/Fabric/zod/electron 어떤 것도 import 금지.
 * Discriminated union으로 fabric.js 객체·serialized 상태가 도메인에 새지 않도록 차단.
 */

import type {
  LessonId,
  OverlayId,
  ResponseId,
  SessionId,
  ShortCode,
  SlideId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

// ─────────────────────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────────────────────

export type SlideSource =
  | {
      readonly type: 'google-slides';
      readonly presentationId: string;
      readonly revisionId: string;
    }
  | {
      readonly type: 'pdf';
      readonly originalFileName: string;
      readonly originalSize: number; // bytes
    };

// ─────────────────────────────────────────────────────────────
// Lesson (재사용 가능한 수업 템플릿)
// ─────────────────────────────────────────────────────────────

export interface InteractiveLesson {
  readonly id: LessonId;
  readonly title: string;
  readonly source: SlideSource;
  readonly slides: readonly Slide[];
  readonly createdAt: number; // epoch ms
  readonly updatedAt: number;
}

export interface Slide {
  readonly id: SlideId;
  /** 1-indexed (PDF page number / Google Slides page index + 1) */
  readonly pageNumber: number;
  /** file:// 절대 경로 (메인 프로세스가 다운로드/렌더 후 부여) */
  readonly imagePath: string;
  readonly overlays: readonly SlideOverlay[];
}

// ─────────────────────────────────────────────────────────────
// Overlay
// ─────────────────────────────────────────────────────────────

export type OverlayType =
  | 'poll'
  | 'text'
  | 'wordcloud'
  | 'draw'
  | 'draggable';

/**
 * 슬라이드 안에서의 상대 위치 (%).
 * 16:9 슬라이드에서 0~100 사이 값.
 */
export interface OverlayPosition {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

export interface SlideOverlay {
  readonly id: OverlayId;
  readonly slideId: SlideId;
  readonly type: OverlayType;
  readonly position: OverlayPosition;
  /** 슬라이드 진입 시 자동 활성화 (per-overlay) */
  readonly autoActivate: boolean;
  readonly config: OverlayConfig;
  readonly createdAt: number;
}

/**
 * 활동별 설정 — discriminated union.
 *
 * Domain leak 방지: 각 variant는 순수 데이터(string/number/array)만.
 * fabric.js 객체, Zustand store, React 타입 절대 진입 금지.
 */
export type OverlayConfig =
  | {
      readonly type: 'poll';
      readonly question: string;
      readonly options: readonly PollOption[];
      readonly multiSelect: boolean;
    }
  | {
      readonly type: 'text';
      readonly prompt: string;
      readonly maxLength: number;
    }
  | {
      readonly type: 'wordcloud';
      readonly prompt: string;
      readonly maxKeywords: number;
    }
  | {
      readonly type: 'draw';
      readonly strokeWidthPx: number;
      readonly palette: readonly string[]; // hex colors
    }
  | {
      readonly type: 'draggable';
      readonly items: readonly DraggableItem[];
      readonly targets: readonly DraggableTarget[];
    };

export interface PollOption {
  readonly id: string;
  readonly label: string;
}

export interface DraggableItem {
  readonly id: string;
  readonly label: string;
}

export interface DraggableTarget {
  readonly id: string;
  readonly label: string;
}

// ─────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────

export type SessionStatus = 'lobby' | 'active' | 'archived';

/**
 * 결과 공개 모드 (Plan §2 F7, UX 리뷰 [6]).
 * - hidden    : 학생 화면에 결과 미노출
 * - anonymous : 집계 차트만 노출, 이름 숨김 (기본값)
 * - full      : 누가 무엇을 골랐는지까지 노출
 */
export type ResultsVisibility = 'hidden' | 'anonymous' | 'full';

export type SessionAccessMode = 'lan' | 'tunnel';

export interface LessonSession {
  readonly id: SessionId;
  readonly lessonId: LessonId;
  /** 예: "2반 1교시" — 세션 식별 라벨 */
  readonly sessionName: string;
  readonly shortCode: ShortCode;
  readonly status: SessionStatus;
  readonly currentSlideIndex: number;
  readonly resultsVisibility: ResultsVisibility;
  readonly accessMode: SessionAccessMode;
  readonly startedAt: number;
  readonly archivedAt: number | null;
  /** 종료 시 자동 익명화되면 true (실명 → "학생N" 매핑 적용 완료 상태) */
  readonly anonymized: boolean;
}

// ─────────────────────────────────────────────────────────────
// Student & Response
// ─────────────────────────────────────────────────────────────

export type StudentPresence = 'online' | 'offline';

export interface SessionStudent {
  readonly studentToken: StudentToken;
  /** 익명화 후에는 "학생1, 학생2..." */
  readonly displayName: string;
  /** 익명화 전 원본 이름. 익명화 미적용 시 displayName과 동일 */
  readonly originalName: string | null;
  readonly joinedAt: number;
  readonly presence: StudentPresence;
}

/**
 * 응답 데이터 — discriminated union.
 * type은 OverlayType과 1:1 매핑.
 */
export type StudentResponseData =
  | {
      readonly type: 'poll';
      readonly selectedOptionIds: readonly string[];
    }
  | {
      readonly type: 'text';
      readonly value: string;
    }
  | {
      readonly type: 'wordcloud';
      readonly keywords: readonly string[];
    }
  | {
      readonly type: 'draw';
      /** base64-encoded PNG (Plan §3 페이로드 한도: 권장 400KB, 최대 ~2MB WS) */
      readonly pngBase64: string;
      readonly widthPx: number;
      readonly heightPx: number;
    }
  | {
      readonly type: 'draggable';
      readonly placements: readonly DraggablePlacement[];
    };

export interface DraggablePlacement {
  readonly itemId: string;
  /** null: 아직 어디에도 배치 안 함 */
  readonly targetId: string | null;
}

export interface StudentResponse {
  readonly id: ResponseId; // 서버 발급 UUID
  readonly sessionId: SessionId;
  readonly slideId: SlideId;
  readonly overlayId: OverlayId;
  readonly studentToken: StudentToken;
  /** 클라이언트 측 idempotency key (재전송 시 동일) */
  readonly clientResponseId: string;
  readonly data: StudentResponseData;
  readonly submittedAt: number;
}

// ─────────────────────────────────────────────────────────────
// Aggregated Results (집계, 종료 시 freeze)
// ─────────────────────────────────────────────────────────────

export interface OverlayResults {
  readonly overlayId: OverlayId;
  readonly type: OverlayType;
  readonly aggregated: AggregatedResultData;
  readonly respondCount: number;
  readonly totalCount: number;
  /** null: 진행 중. number: 종료(freeze) 시각 */
  readonly finalizedAt: number | null;
}

export type AggregatedResultData =
  | {
      readonly type: 'poll';
      /** optionId → 응답 수 */
      readonly counts: Readonly<Record<string, number>>;
      readonly totalVotes: number;
    }
  | {
      readonly type: 'text';
      readonly entries: readonly TextResponseEntry[];
    }
  | {
      readonly type: 'wordcloud';
      /** keyword → 빈도 */
      readonly tally: Readonly<Record<string, number>>;
    }
  | {
      readonly type: 'draw';
      readonly submissions: readonly DrawSubmission[];
    }
  | {
      readonly type: 'draggable';
      /** itemId → targetId(or 'null') → 응답 수 */
      readonly placementCounts: Readonly<
        Record<string, Readonly<Record<string, number>>>
      >;
    };

export interface TextResponseEntry {
  readonly studentToken: StudentToken;
  readonly displayName: string;
  readonly value: string;
  readonly submittedAt: number;
}

export interface DrawSubmission {
  readonly studentToken: StudentToken;
  readonly displayName: string;
  /** 캐시된 PNG 파일 경로 (Infrastructure 레이어가 채움). domain은 경로만 알면 됨 */
  readonly thumbnailPath: string;
  readonly submittedAt: number;
}

// ─────────────────────────────────────────────────────────────
// Late-Join State (Design §7.3)
// ─────────────────────────────────────────────────────────────

export interface LateJoinState {
  readonly slideIndex: number;
  readonly activeOverlays: readonly LateJoinActiveOverlay[];
  readonly closedOverlays: readonly LateJoinClosedOverlay[];
  /** 다른 학생 정보 노출 차단 — 인원 수만 (PIPA §11.2) */
  readonly studentList: { readonly totalOnline: number };
  /** 요청 학생 본인의 응답만 (PIPA §11.2) */
  readonly myResponses: readonly LateJoinMyResponse[];
}

export interface LateJoinActiveOverlay {
  readonly id: OverlayId;
  readonly activatedAt: number;
  /** Phase 3 reserved (퀴즈 타이머). Phase 1에서는 항상 undefined */
  readonly deadline?: number;
}

export interface LateJoinClosedOverlay {
  readonly id: OverlayId;
  readonly closedAt: number;
  /** ResultsVisibility 별 마스킹 적용 후 결과. hidden 모드면 null */
  readonly results: AggregatedResultData | null;
}

export interface LateJoinMyResponse {
  readonly overlayId: OverlayId;
  readonly submittedAt: number;
}

// ─────────────────────────────────────────────────────────────
// Snapshot (영속 저장 — JsonInteractiveLessonRepository가 사용)
// ─────────────────────────────────────────────────────────────

/**
 * 세션 종료 시점 스냅샷 — 라이브 메모리 상태를 그대로 직렬화.
 * F8-3 과거 세션 결과 조회용 + 180일 sweep 대상.
 */
export interface LessonSessionSnapshot {
  readonly schemaVersion: number;
  readonly session: LessonSession;
  readonly students: readonly SessionStudent[];
  readonly responses: readonly StudentResponse[];
  readonly overlayResults: readonly OverlayResults[];
  /** 익명화 매핑 (original → displayName). 교사 임의 복원 옵션용 */
  readonly anonymizationMap: Readonly<Record<string, string>>;
}

export const LESSON_SESSION_SNAPSHOT_SCHEMA_VERSION = 1 as const;
