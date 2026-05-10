/**
 * WebSocket 브로드캐스터 추상화 (Plan §3 + Design §5.3).
 *
 * 구현체는 메인 프로세스의 `SessionedWebSocketServer<TC,TS>` 어댑터.
 * 도메인·UseCase는 메시지 union 타입만 알면 되고, ws 라이브러리는 Infrastructure에 격리.
 */

import type {
  AggregatedResultData,
  LateJoinState,
  OverlayPosition,
  OverlayResults,
  SessionStatus,
  Slide,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type {
  OverlayId,
  SessionId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

// ─────────────────────────────────────────────────────────────
// 서버 → 학생 메시지 (Design §6 매핑)
// ─────────────────────────────────────────────────────────────

export type ServerToStudentMessage =
  | {
      readonly type: 'slide-changed';
      readonly slideIndex: number;
      readonly slide: Slide;
    }
  | {
      readonly type: 'overlay-activated';
      readonly overlayId: OverlayId;
      readonly config: SlideOverlay['config'];
      readonly position: OverlayPosition;
      readonly activatedAt: number;
    }
  | {
      readonly type: 'overlay-deactivated';
      readonly overlayId: OverlayId;
      readonly results: AggregatedResultData | null; // visibility 마스킹 후
    }
  | { readonly type: 'lesson-ended'; readonly reason?: string }
  | { readonly type: 'teacher-disconnected'; readonly gracePeriodMs: number }
  | { readonly type: 'teacher-reconnected' }
  | {
      readonly type: 'overlay-deadline';
      readonly overlayId: OverlayId;
      readonly deadline: number;
    } // Phase 3 reserved
  | { readonly type: 'error'; readonly code: string; readonly message: string }
  // 개별 ack
  | {
      readonly type: 'session-joined';
      readonly studentToken: StudentToken;
      readonly sessionStatus: SessionStatus;
      readonly currentSlideIndex: number;
    }
  | {
      readonly type: 'late-join-state';
      readonly state: LateJoinState;
    }
  | {
      readonly type: 'response-accepted';
      readonly overlayId: OverlayId;
      readonly status: 'recorded' | 'late' | 'rejected';
    };

// ─────────────────────────────────────────────────────────────
// 서버 → 교사 메시지
// ─────────────────────────────────────────────────────────────

export type ServerToTeacherMessage =
  | {
      readonly type: 'response-received';
      readonly overlayId: OverlayId;
      readonly aggregated: AggregatedResultData;
      readonly respondCount: number;
      readonly totalCount: number;
    }
  | {
      readonly type: 'student-joined';
      readonly studentToken: StudentToken;
      readonly studentName: string;
      readonly totalCount: number;
    }
  | {
      readonly type: 'student-presence-changed';
      readonly studentToken: StudentToken;
      readonly online: boolean;
      readonly totalOnline: number;
    }
  | { readonly type: 'overlay-finalized'; readonly results: OverlayResults }
  | { readonly type: 'session-archived'; readonly sessionId: SessionId };

// ─────────────────────────────────────────────────────────────
// 추상화
// ─────────────────────────────────────────────────────────────

export interface IRealtimeBroadcaster {
  broadcastToStudents(
    sessionId: SessionId,
    message: ServerToStudentMessage,
  ): void;

  /** 개별 학생에게 (ack, late-join-state 용) */
  sendToStudent(
    sessionId: SessionId,
    token: StudentToken,
    message: ServerToStudentMessage,
  ): void;

  sendToTeacher(
    sessionId: SessionId,
    message: ServerToTeacherMessage,
  ): void;
}
