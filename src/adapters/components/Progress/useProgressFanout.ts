import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getMatchingPeriods, type DayTeacherSlot } from '@domain/rules/progressMatching';
import { isSubjectMatch } from '@domain/rules/matchingRules';
import { isTeachingClassArchived } from '@domain/rules/teachingClassArchive';
import { resolveFanoutPlacement, type FanoutPlacement } from '@domain/rules/progressFanout';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { ProgressEntryFieldValues } from '@adapters/components/ClassManagement/ProgressEntryFields';

/**
 * "이 진도를 다른 반에도 함께 기록" 상태·계산·저장을 한 곳에 모은 훅.
 *
 * 진도 탭의 추가 폼과 진도 캘린더/시간표의 빠른 입력이 같은 동작을 공유한다.
 * 날짜·교시 배정은 도메인 규칙(resolveFanoutPlacement)에 위임하고,
 * 여기서는 시간표 조회와 중복 판정만 주입한다.
 */

export interface FanoutCandidate {
  readonly classId: string;
  readonly name: string;
  readonly subject: string;
  /** 원본 반과 같은 과목인지 — 목록 상단 배치·기본 후보 판단용 */
  readonly sameSubject: boolean;
}

export interface FanoutPreviewRow {
  readonly classId: string;
  readonly name: string;
  readonly subject: string;
  readonly sameSubject: boolean;
  readonly placement: FanoutPlacement;
}

export interface FanoutApplyResult {
  /** 실제로 추가된 항목 수 */
  readonly added: number;
  /** 이미 같은 자리에 진도가 있어 건너뛴 반 수 */
  readonly skipped: number;
  /** 원본과 다른 날짜/교시로 옮겨 배정된 반 수 */
  readonly shifted: number;
}

/**
 * 마지막으로 고른 "함께 기록할 반"을 원본 반별로 기억한다(세션 한정).
 * 매번 다시 체크하지 않도록 하는 편의 기능이라 영속 저장까지는 하지 않는다.
 */
const lastSelectionBySource = new Map<string, readonly string[]>();

/** 날짜 → 그날 적용된 교사 시간표 (한 번의 계산 안에서 중복 조회를 막는 캐시) */
type DayScheduleCache = Map<string, ReadonlyArray<DayTeacherSlot | null>>;

export function useProgressFanout(sourceClassId: string | null) {
  const { classes, progressEntries, addProgressEntry } = useTeachingClassStore();
  const { classSchedule, getEffectiveTeacherSchedule } = useScheduleStore();
  const { settings } = useSettingsStore();
  const weekendDays = settings.enableWeekendDays;

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const candidates = useMemo<readonly FanoutCandidate[]>(() => {
    if (!sourceClassId) return [];
    const source = classes.find((c: TeachingClass) => c.id === sourceClassId);
    if (!source) return [];
    const rows = classes
      .filter((c: TeachingClass) => c.id !== sourceClassId && !isTeachingClassArchived(c))
      .map((c: TeachingClass) => ({
        classId: c.id,
        name: c.name,
        subject: c.subject,
        sameSubject: isSubjectMatch(c.subject, source.subject),
      }));
    // 같은 과목을 위로 (그 안에서는 학급 목록 순서 유지)
    return [...rows.filter((r) => r.sameSubject), ...rows.filter((r) => !r.sameSubject)];
  }, [classes, sourceClassId]);

  // 원본 반이 바뀌면 기억해 둔 선택을 되살리고, 사라진 반은 제외한다
  useEffect(() => {
    if (!sourceClassId) {
      setSelectedIds(new Set());
      return;
    }
    const remembered = lastSelectionBySource.get(sourceClassId) ?? [];
    const alive = new Set(candidates.map((c) => c.classId));
    setSelectedIds(new Set(remembered.filter((id) => alive.has(id))));
    // candidates는 학급 목록이 바뀔 때만 갱신되므로 의존성에 포함해도 안전하다
  }, [sourceClassId, candidates]);

  const remember = useCallback(
    (next: ReadonlySet<string>) => {
      if (sourceClassId) lastSelectionBySource.set(sourceClassId, [...next]);
    },
    [sourceClassId],
  );

  const toggle = useCallback(
    (classId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(classId)) next.delete(classId);
        else next.add(classId);
        remember(next);
        return next;
      });
    },
    [remember],
  );

  const clear = useCallback(() => {
    setSelectedIds(() => {
      const next = new Set<string>();
      remember(next);
      return next;
    });
  }, [remember]);

  /** 대상 반이 특정 날짜에 수업이 있는 교시들 — 날짜별 시간표 조회를 캐시한다 */
  const makeLessonPeriodsOn = useCallback(
    (target: TeachingClass, cache: DayScheduleCache) =>
      (date: string): readonly number[] => {
        let daySchedule = cache.get(date);
        if (!daySchedule) {
          daySchedule = getEffectiveTeacherSchedule(date, weekendDays);
          cache.set(date, daySchedule);
        }
        return getMatchingPeriods({
          date,
          className: target.name,
          classSubject: target.subject,
          dayTeacherSchedule: daySchedule,
          classSchedule,
          weekendDays,
        });
      },
    [classSchedule, getEffectiveTeacherSchedule, weekendDays],
  );

  /** 선택된 반들이 어디에 들어갈지 미리 계산 (저장 전 안내용) */
  const buildPreview = useCallback(
    (anchorDate: string, anchorPeriod: number): readonly FanoutPreviewRow[] => {
      if (selectedIds.size === 0) return [];
      const scheduleCache: DayScheduleCache = new Map();
      return candidates
        .filter((c) => selectedIds.has(c.classId))
        .map((c) => {
          const target = classes.find((x: TeachingClass) => x.id === c.classId);
          if (!target) {
            return { ...c, placement: { ok: false, reason: 'duplicate' } as FanoutPlacement };
          }
          const placement = resolveFanoutPlacement({
            anchorDate,
            anchorPeriod,
            lessonPeriodsOn: makeLessonPeriodsOn(target, scheduleCache),
            isOccupied: (date, period) =>
              progressEntries.some(
                (e) => e.classId === target.id && e.date === date && e.period === period,
              ),
          });
          return { ...c, placement };
        });
    },
    [candidates, selectedIds, classes, progressEntries, makeLessonPeriodsOn],
  );

  /**
   * 선택된 반들에 진도를 실제로 추가한다.
   * 상태는 항상 '예정' — 반마다 실제 진행은 다르므로 완료 여부까지 복사하지 않는다.
   */
  const applyFanout = useCallback(
    async (values: ProgressEntryFieldValues): Promise<FanoutApplyResult> => {
      if (selectedIds.size === 0) return { added: 0, skipped: 0, shifted: 0 };
      const unit = values.unit.trim();
      const lesson = values.lesson.trim();
      if (!unit || !lesson) return { added: 0, skipped: 0, shifted: 0 };

      const scheduleCache: DayScheduleCache = new Map();
      let added = 0;
      let skipped = 0;
      let shifted = 0;

      for (const candidate of candidates) {
        if (!selectedIds.has(candidate.classId)) continue;
        const target = classes.find((x: TeachingClass) => x.id === candidate.classId);
        if (!target) continue;

        // 방금 추가한 항목까지 반영되도록 저장소의 최신 상태를 매번 읽는다
        const latestEntries = useTeachingClassStore.getState().progressEntries;
        const placement = resolveFanoutPlacement({
          anchorDate: values.date,
          anchorPeriod: values.period,
          lessonPeriodsOn: makeLessonPeriodsOn(target, scheduleCache),
          isOccupied: (date, period) =>
            latestEntries.some(
              (e) => e.classId === target.id && e.date === date && e.period === period,
            ),
        });

        if (!placement.ok) {
          skipped++;
          continue;
        }
        await addProgressEntry(
          target.id,
          placement.date,
          placement.period,
          unit,
          lesson,
          values.note.trim() || undefined,
        );
        added++;
        if (placement.kind !== 'same-slot') shifted++;
      }

      return { added, skipped, shifted };
    },
    [candidates, selectedIds, classes, addProgressEntry, makeLessonPeriodsOn],
  );

  return { candidates, selectedIds, toggle, clear, buildPreview, applyFanout };
}

/** 팬아웃 결과를 사용자용 한 줄 안내로 만든다 (추가된 게 없으면 null) */
export function describeFanoutResult(result: FanoutApplyResult): string | null {
  if (result.added === 0 && result.skipped === 0) return null;
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(
      result.shifted > 0
        ? `다른 ${result.added}개 반에도 기록했습니다 (${result.shifted}개 반은 그 반 수업 시간에 맞춰 배정)`
        : `다른 ${result.added}개 반에도 기록했습니다`,
    );
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped}개 반은 이미 진도가 있어 건너뛰었습니다`);
  }
  return parts.join(' · ');
}
