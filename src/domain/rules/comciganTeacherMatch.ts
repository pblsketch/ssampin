/**
 * 컴시간 교사 재매칭 (순수 함수).
 *
 * ⚠️ 컴시간 teacherIndex(= n % 1000)는 fetch마다 재부여될 수 있어, raw index를 저장해
 * 재동기화하면 다른 교사로 조용히 바뀌는 사고가 난다. 그래서 저장·재매칭은 index가 아니라
 * "지문"(마스킹 이름 + 과목)으로 한다.
 *
 * 지문 매칭 역설: 시간표가 바뀌면 시수·과목도 바뀐다. 지문을 시수까지 엄격히 비교하면
 * 진짜 변경 때마다 매칭이 깨진다. → 이름이 유일하면 시수/과목이 변해도 같은 교사로 수용하고
 * (그 변화가 바로 감지 대상), 이름이 중복일 때만 과목 교집합으로 구분한다. 모호하면 null.
 *
 * domain 순수 규칙 — react/zustand/adapters/usecases/infra 를 import 하지 않는다.
 */
import type { ComciganTeacherSummary } from '../entities/ComciganTimetable';

/** 재매칭용 교사 지문 (raw index 대신 저장) */
export interface ComciganTeacherFingerprint {
  /** 컴시간 마스킹 이름 (예: '백순*') */
  readonly maskedName: string;
  /** import 당시 담당 과목들 (이름 중복 시 tie-break용) */
  readonly subjects: readonly string[];
}

/**
 * 저장된 지문으로 현재 교사 요약 목록에서 같은 교사를 찾는다.
 * - 이름이 유일하게 하나면 시수/과목이 변했어도 그 교사로 수용.
 * - 이름이 중복이면 과목 교집합이 가장 큰 후보로 tie-break. 최고점이 0이거나 동점이면 모호 → null.
 * - 이름이 없으면 null (적용 금지 → "다시 선택").
 */
export function locateTeacherByFingerprint(
  summaries: readonly ComciganTeacherSummary[],
  fp: ComciganTeacherFingerprint,
): ComciganTeacherSummary | null {
  const candidates = summaries.filter((s) => !s.isDummy && s.name === fp.maskedName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null; // 이름 유일 → 시수 변해도 수용

  // 이름 중복 → 과목 교집합 최대로 tie-break
  const fpSubjects = new Set(fp.subjects);
  let best: ComciganTeacherSummary | null = null;
  let bestScore = -1;
  let tie = false;
  for (const c of candidates) {
    const score = c.subjects.filter((s) => fpSubjects.has(s)).length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }

  // 교집합이 전무하거나(구분 근거 없음) 동점(모호)이면 오적용 방지로 null
  if (bestScore <= 0 || tie) return null;
  return best;
}
