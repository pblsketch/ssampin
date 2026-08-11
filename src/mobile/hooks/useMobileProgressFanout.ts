import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { getMatchingPeriods } from '@domain/rules/progressMatching';
import { getDayOfWeek } from '@domain/rules/periodRules';
import {
  buildFanoutCandidates,
  resolveFanoutPlacement,
  type FanoutApplyResult,
  type FanoutPreviewRow,
} from '@domain/rules/progressFanout';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { ClassScheduleData, TeacherPeriod } from '@domain/entities/Timetable';

/**
 * "이 진도를 다른 반에도 함께 기록" — 모바일판.
 *
 * 후보 목록·배정 규칙·결과 요약은 데스크톱과 똑같이 도메인(@domain/rules/progressFanout)을 쓰고,
 * 여기서는 모바일 스토어에서 시간표·기존 진도를 읽어 주입하는 부분만 다르다.
 * 데스크톱 판박이는 @adapters/components/Progress/useProgressFanout.
 *
 * 모바일 한정 제약 (ClassProgressTab의 ✦ 매칭과 같은 전제):
 * - 시간표 변동(override) 머지 함수가 없어 요일 baseline 시간표만 본다.
 * - settings.enableWeekendDays 필드가 없어 주말 요일은 미지원(undefined).
 */

/** 진도 입력값 중 배정에 필요한 부분만 */
export interface MobileFanoutValues {
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson: string;
  readonly note: string;
}

/** 마지막으로 고른 반을 원본 반별로 기억한다 (세션 한정 — 영속 저장 안 함) */
const lastSelectionBySource = new Map<string, readonly string[]>();

export function useMobileProgressFanout(sourceClassId: string | null) {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const entries = useMobileProgressStore((s) => s.entries);
  const addEntry = useMobileProgressStore((s) => s.addEntry);
  const teacherSchedule = useMobileScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useMobileScheduleStore((s) => s.classSchedule);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const candidates = useMemo(
    () => buildFanoutCandidates(classes, sourceClassId),
    [classes, sourceClassId],
  );

  // 원본 반이 바뀌면 기억해 둔 선택을 되살리고, 사라진 반은 제외한다
  useEffect(() => {
    if (!sourceClassId) {
      setSelectedIds(new Set());
      return;
    }
    const remembered = lastSelectionBySource.get(sourceClassId) ?? [];
    const alive = new Set(candidates.map((c) => c.classId));
    setSelectedIds(new Set(remembered.filter((id) => alive.has(id))));
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

  /** 대상 반이 특정 날짜에 수업이 있는 교시들 */
  const makeLessonPeriodsOn = useCallback(
    (target: TeachingClass) =>
      (date: string): readonly number[] => {
        // 모바일은 주말 요일 설정이 없어 undefined 고정
        const dayOfWeek = getDayOfWeek(new Date(date + 'T00:00:00'), undefined);
        const baseline: ReadonlyArray<TeacherPeriod | null> = dayOfWeek
          ? (teacherSchedule[dayOfWeek] ?? [])
          : [];
        const fallbackClassSchedule: ClassScheduleData = classSchedule ?? {};
        return getMatchingPeriods({
          date,
          className: target.name,
          classSubject: target.subject,
          dayTeacherSchedule: baseline,
          classSchedule: fallbackClassSchedule,
          weekendDays: undefined,
        });
      },
    [teacherSchedule, classSchedule],
  );

  /** 선택된 반들이 어디에 들어갈지 미리 계산 (저장 전 안내용) */
  const buildPreview = useCallback(
    (anchorDate: string, anchorPeriod: number): readonly FanoutPreviewRow[] => {
      if (selectedIds.size === 0) return [];
      return candidates
        .filter((c) => selectedIds.has(c.classId))
        .map((c) => {
          const target = classes.find((x) => x.id === c.classId);
          if (!target) return { ...c, placement: { ok: false, reason: 'duplicate' } as const };
          return {
            ...c,
            placement: resolveFanoutPlacement({
              anchorDate,
              anchorPeriod,
              lessonPeriodsOn: makeLessonPeriodsOn(target),
              isOccupied: (date, period) =>
                entries.some(
                  (e) => e.classId === target.id && e.date === date && e.period === period,
                ),
            }),
          };
        });
    },
    [candidates, selectedIds, classes, entries, makeLessonPeriodsOn],
  );

  /**
   * 선택된 반들에 진도를 실제로 추가한다.
   * 상태는 항상 '예정' — 다른 반은 아직 그 수업을 하지 않았을 수 있으므로 완료로 단정하지 않는다.
   * (데스크톱과 동일. 목록에서 한 번 눌러 완료로 바꿀 수 있다.)
   */
  const applyFanout = useCallback(
    async (values: MobileFanoutValues): Promise<FanoutApplyResult> => {
      if (selectedIds.size === 0) return { added: 0, skipped: 0, shifted: 0 };
      const unit = values.unit.trim();
      const lesson = values.lesson.trim();
      if (!unit || !lesson) return { added: 0, skipped: 0, shifted: 0 };

      let added = 0;
      let skipped = 0;
      let shifted = 0;

      for (const candidate of candidates) {
        if (!selectedIds.has(candidate.classId)) continue;
        const target = classes.find((x) => x.id === candidate.classId);
        if (!target) continue;

        // 방금 추가한 항목까지 반영되도록 저장소의 최신 상태를 매번 읽는다
        const latestEntries = useMobileProgressStore.getState().entries;
        const placement = resolveFanoutPlacement({
          anchorDate: values.date,
          anchorPeriod: values.period,
          lessonPeriodsOn: makeLessonPeriodsOn(target),
          isOccupied: (date, period) =>
            latestEntries.some(
              (e) => e.classId === target.id && e.date === date && e.period === period,
            ),
        });

        if (!placement.ok) {
          skipped++;
          continue;
        }
        await addEntry(
          target.id,
          placement.date,
          placement.period,
          unit,
          lesson,
          values.note.trim() || undefined,
          'planned',
        );
        added++;
        if (placement.kind !== 'same-slot') shifted++;
      }

      return { added, skipped, shifted };
    },
    [candidates, selectedIds, classes, addEntry, makeLessonPeriodsOn],
  );

  return { candidates, selectedIds, toggle, clear, buildPreview, applyFanout };
}
