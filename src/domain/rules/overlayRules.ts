/**
 * Interactive Slides 도메인 규칙 (Plan §3 + Design §2.1).
 *
 * 순수 함수만. 외부 의존성 0 (랜덤·시간·crypto 모두 호출자 주입).
 */

import type {
  AggregatedResultData,
  DrawSubmission,
  LessonSession,
  OverlayResults,
  PollOption,
  ResultsVisibility,
  SessionStudent,
  Slide,
  SlideOverlay,
  StudentResponse,
  StudentResponseData,
  TextResponseEntry,
} from '@domain/entities/InteractiveSlides';
import type {
  OverlayId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';
import {
  SHORT_CODE_CHARSET,
  SHORT_CODE_LENGTH,
} from '@domain/valueObjects/InteractiveSlidesIds';

// ─────────────────────────────────────────────────────────────
// 활성화 가능 여부 (Phase 1: 슬라이드당 동시 1개 제약)
// ─────────────────────────────────────────────────────────────

export type ActivateOverlayCheck =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | 'already-active-on-slide'
        | 'overlay-not-found'
        | 'session-archived'
        | 'wrong-slide';
    };

/**
 * Phase 1 제약: 같은 슬라이드 위에 동시 활성 오버레이는 1개.
 * 다른 슬라이드의 활성 오버레이는 무관.
 */
export function canActivateOverlay(
  slide: Slide,
  overlayId: OverlayId,
  activeOverlayIdsOnThisSlide: ReadonlySet<OverlayId>,
): ActivateOverlayCheck {
  const found = slide.overlays.find((o) => o.id === overlayId);
  if (!found) return { allowed: false, reason: 'overlay-not-found' };
  if (activeOverlayIdsOnThisSlide.size > 0) {
    return { allowed: false, reason: 'already-active-on-slide' };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────
// 응답 집계 (overlay type별 dispatch)
// ─────────────────────────────────────────────────────────────

/**
 * 모든 오버레이 타입에 대한 집계 함수 (UseCase가 호출).
 *
 * 메타테스트 MT-2: 모든 OverlayType variant가 이 switch에 case로 존재해야 함.
 */
export function aggregateResponses(
  overlay: SlideOverlay,
  responses: readonly StudentResponse[],
  students: readonly SessionStudent[],
): AggregatedResultData {
  const studentByToken = new Map<StudentToken, SessionStudent>();
  for (const s of students) studentByToken.set(s.studentToken, s);

  switch (overlay.config.type) {
    case 'poll':
      return aggregatePoll(overlay.config.options, responses);
    case 'text':
      return aggregateText(responses, studentByToken);
    case 'wordcloud':
      return aggregateWordCloud(responses);
    case 'draw':
      return aggregateDraw(responses, studentByToken);
    case 'draggable':
      return aggregateDraggable(responses);
  }
}

function aggregatePoll(
  options: readonly PollOption[],
  responses: readonly StudentResponse[],
): AggregatedResultData {
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt.id] = 0;
  let totalVotes = 0;
  for (const r of responses) {
    if (r.data.type !== 'poll') continue;
    for (const optId of r.data.selectedOptionIds) {
      if (Object.prototype.hasOwnProperty.call(counts, optId)) {
        counts[optId] = (counts[optId] ?? 0) + 1;
        totalVotes++;
      }
    }
  }
  return { type: 'poll', counts, totalVotes };
}

function aggregateText(
  responses: readonly StudentResponse[],
  students: ReadonlyMap<StudentToken, SessionStudent>,
): AggregatedResultData {
  const entries: TextResponseEntry[] = [];
  for (const r of responses) {
    if (r.data.type !== 'text') continue;
    const s = students.get(r.studentToken);
    entries.push({
      studentToken: r.studentToken,
      displayName: s?.displayName ?? '',
      value: r.data.value,
      submittedAt: r.submittedAt,
    });
  }
  // 가장 최근 응답이 위로
  entries.sort((a, b) => b.submittedAt - a.submittedAt);
  return { type: 'text', entries };
}

function aggregateWordCloud(
  responses: readonly StudentResponse[],
): AggregatedResultData {
  const tally: Record<string, number> = {};
  for (const r of responses) {
    if (r.data.type !== 'wordcloud') continue;
    for (const kw of r.data.keywords) {
      const norm = kw.trim().toLowerCase();
      if (norm.length === 0) continue;
      tally[norm] = (tally[norm] ?? 0) + 1;
    }
  }
  return { type: 'wordcloud', tally };
}

function aggregateDraw(
  responses: readonly StudentResponse[],
  students: ReadonlyMap<StudentToken, SessionStudent>,
): AggregatedResultData {
  // domain은 PNG 경로를 만들지 않음 — Infrastructure가 채워서 별도 결합.
  // 여기서는 빈 thumbnailPath로 골격만 반환하고, 어댑터가 path를 매핑한다.
  const submissions: DrawSubmission[] = [];
  for (const r of responses) {
    if (r.data.type !== 'draw') continue;
    const s = students.get(r.studentToken);
    submissions.push({
      studentToken: r.studentToken,
      displayName: s?.displayName ?? '',
      thumbnailPath: '',
      submittedAt: r.submittedAt,
    });
  }
  submissions.sort((a, b) => b.submittedAt - a.submittedAt);
  return { type: 'draw', submissions };
}

function aggregateDraggable(
  responses: readonly StudentResponse[],
): AggregatedResultData {
  const placementCounts: Record<string, Record<string, number>> = {};
  for (const r of responses) {
    if (r.data.type !== 'draggable') continue;
    for (const p of r.data.placements) {
      const target = p.targetId ?? '__unplaced__';
      if (!placementCounts[p.itemId]) placementCounts[p.itemId] = {};
      const inner = placementCounts[p.itemId]!;
      inner[target] = (inner[target] ?? 0) + 1;
    }
  }
  return { type: 'draggable', placementCounts };
}

// ─────────────────────────────────────────────────────────────
// 결과 공개 모드별 마스킹 (Plan §2 F7)
// ─────────────────────────────────────────────────────────────

/**
 * 학생 화면에 노출할 결과를 visibility 모드별로 마스킹.
 *
 * - hidden    : null 반환 (학생 화면에 결과 자체 미노출)
 * - anonymous : 집계 수치만 유지, 이름/응답내용 제거
 * - full      : 그대로
 */
export function maskResultsForStudent(
  results: AggregatedResultData,
  visibility: ResultsVisibility,
): AggregatedResultData | null {
  if (visibility === 'hidden') return null;
  if (visibility === 'full') return results;

  // anonymous
  switch (results.type) {
    case 'poll':
    case 'wordcloud':
    case 'draggable':
      // 이름이 없는 집계 — 그대로 반환
      return results;
    case 'text':
      // 내용은 유지하되 token/이름 익명화
      return {
        type: 'text',
        entries: results.entries.map((e) => ({
          ...e,
          studentToken: '' as StudentToken,
          displayName: '',
        })),
      };
    case 'draw':
      return {
        type: 'draw',
        submissions: results.submissions.map((s) => ({
          ...s,
          studentToken: '' as StudentToken,
          displayName: '',
        })),
      };
  }
}

// ─────────────────────────────────────────────────────────────
// shortCode 생성 / 검증
// ─────────────────────────────────────────────────────────────

/**
 * shortCode 생성. 외부 randomFn 주입 (테스트용 결정론).
 *
 * @param random 0~1 사이 난수 생성기 (기본: Math.random)
 */
export function generateShortCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    const idx = Math.floor(random() * SHORT_CODE_CHARSET.length);
    s += SHORT_CODE_CHARSET[idx]!;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// 응답 데이터 ↔ 오버레이 타입 일치 검증
// ─────────────────────────────────────────────────────────────

/**
 * 학생 응답 데이터의 type이 오버레이 타입과 맞는지 검증.
 * (Zod 검증과 별개 — 도메인 레벨 안전망)
 */
export function isResponseDataMatchingOverlay(
  data: StudentResponseData,
  overlay: SlideOverlay,
): boolean {
  return data.type === overlay.config.type;
}

// ─────────────────────────────────────────────────────────────
// 결과 finalize (종료 시 freeze)
// ─────────────────────────────────────────────────────────────

/**
 * OverlayResults를 종료 시점에 freeze.
 * 이미 finalizedAt이 설정되어 있으면 그대로 반환 (idempotent).
 */
export function finalizeOverlayResults(
  current: OverlayResults,
  finalizedAt: number,
): OverlayResults {
  if (current.finalizedAt !== null) return current;
  return { ...current, finalizedAt };
}

// ─────────────────────────────────────────────────────────────
// 익명화 매핑 (PIPA §11.1)
// ─────────────────────────────────────────────────────────────

/**
 * 학생 목록에 익명화 적용.
 *
 * - 입력 순서를 유지하며 "학생1, 학생2..." 부여
 * - originalName은 보존 (교사 임의 복원 옵션용)
 * - 매핑 테이블 별도 반환 (snapshot.anonymizationMap에 저장)
 */
export function anonymizeStudents(students: readonly SessionStudent[]): {
  readonly anonymized: readonly SessionStudent[];
  readonly mapping: Readonly<Record<string, string>>;
} {
  const mapping: Record<string, string> = {};
  const anonymized: SessionStudent[] = [];
  let index = 1;
  for (const s of students) {
    const newName = `학생${index}`;
    mapping[s.studentToken] = newName;
    anonymized.push({
      ...s,
      displayName: newName,
      originalName: s.originalName ?? s.displayName,
    });
    index++;
  }
  return { anonymized, mapping };
}

// ─────────────────────────────────────────────────────────────
// 세션 상태 전이 (lobby → active → archived)
// ─────────────────────────────────────────────────────────────

export type SessionTransitionResult =
  | { readonly ok: true; readonly session: LessonSession }
  | { readonly ok: false; readonly reason: 'invalid-transition' };

export function transitionSessionToActive(
  session: LessonSession,
): SessionTransitionResult {
  if (session.status !== 'lobby') {
    return { ok: false, reason: 'invalid-transition' };
  }
  return { ok: true, session: { ...session, status: 'active' } };
}

export function transitionSessionToArchived(
  session: LessonSession,
  archivedAt: number,
): SessionTransitionResult {
  if (session.status === 'archived') {
    return { ok: true, session }; // idempotent
  }
  return {
    ok: true,
    session: { ...session, status: 'archived', archivedAt },
  };
}

/**
 * 로비 → 에디터 복귀 가능 여부 (UX 리뷰 [1]).
 * status === 'lobby'에서만 허용. active/archived에서는 차단.
 */
export function canReturnToEditor(session: LessonSession): boolean {
  return session.status === 'lobby';
}
