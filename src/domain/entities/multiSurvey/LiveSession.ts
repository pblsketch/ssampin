import type { Response } from './Response';

/**
 * 라이브 세션 단계 (DN-09 — 6단계).
 *
 * - lobby:        학생 입장 대기
 * - open:         문항 표시 중
 * - revealed:     정답 공개 중
 * - round_result: 중간 순위 (T10 문항별 점수 확인 ON 시에만 거침)
 * - podium:       최종 포디움
 * - end:          세션 종료
 */
export type LivePhase = 'lobby' | 'open' | 'revealed' | 'round_result' | 'podium' | 'end';

/** 런타임 타입 가드 */
export function isLivePhase(s: string): s is LivePhase {
  return (
    s === 'lobby' ||
    s === 'open' ||
    s === 'revealed' ||
    s === 'round_result' ||
    s === 'podium' ||
    s === 'end'
  );
}

/**
 * 학생 상호작용 이벤트 (DN-03).
 * STUDENT_WAVE: 학생이 대기 화면에서 자기 아바타를 탭 → 교사 콘솔 pulse 효과.
 * IPC 채널(STUDENT_WAVE) 구현은 worker-2 담당. 여기서는 도메인 엔티티 필드만 선언.
 */
export interface StudentInteraction {
  readonly studentId: string;
  /** 현재 지원 kind: 'wave' (STUDENT_WAVE IPC). 추후 확장 가능 */
  readonly kind: 'wave';
  /** 이벤트 발생 시각 (ISO 8601) */
  readonly at: string;
}

/**
 * 학생 프로필 (DN-04).
 * pin4: "한 번 더" 재실행 시 동일 신원 유지용 4자리 비번. 교사에게 노출 안 함.
 */
export interface StudentProfile {
  readonly studentId: string;
  readonly nickname: string;
  /** 재입장·재실행 식별용 4자리 비번. 교사 화면에 노출 금지 */
  readonly pin4: string;
  readonly avatarKey: string;
  readonly isRealName: boolean;
}

/**
 * 라이브 세션 엔티티.
 *
 * - round: DN-04 "한 번 더" 재실행 시 2, 3, ... 증가. 기본 1.
 * - studentInteractions: DN-03 STUDENT_WAVE 이벤트 누적.
 * - focusModeActive: DN-06 교사 집중 모드 실시간 상태 (WebSocket TOGGLE_FOCUS_MODE 동기화).
 */
export interface LiveSession {
  readonly id: string;
  readonly surveyId: string;
  /** "한 번 더" 재실행 회차. 기본 1 (DN-04) */
  readonly round: number;
  readonly phase: LivePhase;
  readonly currentQuestionIndex: number;
  readonly students: readonly StudentProfile[];
  readonly responses: readonly Response[];
  /** 학생 상호작용 이벤트 누적 (DN-03) */
  readonly studentInteractions: readonly StudentInteraction[];
  /** 교사 집중 모드 활성 여부 (DN-06). WebSocket TOGGLE_FOCUS_MODE로 실시간 동기화 */
  readonly focusModeActive: boolean;
  readonly startedAt: string; // ISO 8601
  readonly endedAt?: string; // ISO 8601
}
