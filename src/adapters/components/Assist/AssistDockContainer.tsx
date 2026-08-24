/**
 * 쌤핀 AI — 도구 실행과 화면을 잇는 자리
 *
 * ★조회는 **여기서, 선생님 컴퓨터 안에서** 끝난다.
 * 서버로 나가는 것은 재구성을 거친 집계 숫자뿐이다 — "이름은 화면에 남고, 숫자만 밖으로 나간다".
 *
 * ★도구 선택은 **두 갈래**다 (2026-08-23, 브릿지 동등화 슬라이스 1에서 옵션 A 도입):
 * - 정규식(INTENT_RULES)에 걸리는 질문 → 앱이 고른다. 1왕복, 칩 4개 포함.
 * - 안 걸리는 질문 → 모델에게 도구 목록을 보여주고 고르게 한다(옵션 A, 2왕복).
 *   모델이 고른 도구는 `executeAssistTool` 이 로컬에서 실행하며 인자를 항상 불신한다.
 * 어느 갈래든 나가는 것은 재구성·가림을 거친 집계뿐이다.
 */
import { useEffect, useMemo } from 'react';

import { AssistDock } from './AssistDock';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { rosterFrom } from '@domain/rules/redactOutbound';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { AssistWriteProposal } from '@domain/entities/AssistWrite';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import {
  addDays,
  countStudents,
  summarizeAssessment,
  summarizeAttendance,
  summarizeBookmarks,
  summarizeClassAttendance,
  summarizeDDays,
  summarizeEvents,
  summarizeGrades,
  summarizeHomeroomAttendance,
  summarizeMeals,
  summarizeMemos,
  summarizeNotes,
  summarizeProgress,
  summarizeRecords,
  summarizeSeating,
  summarizeTimetable,
  summarizeTodos,
  summarizeWeek,
  toAttendanceRoll,
  toClassSummaries,
} from '@usecases/assist/summaries';
import type {
  AssessmentPlanLike,
  AssessmentScoreLike,
  BookmarkGroupLike,
  BookmarkLike,
  ClassAttendanceRecordLike,
  MemoLike,
  NoteSources,
  ProgressLike,
  SeatingLike,
} from '@usecases/assist/summaries';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useDDayStore } from '@adapters/stores/useDDayStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useNoteStore } from '@adapters/stores/useNoteStore';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';
import { executeAssistWrite } from './executeAssistWrite';
import type { WriteDeps } from './executeAssistWrite';
import { assistPort } from '@adapters/di/container';

/**
 * ★담임 학급을 가리키는 내부 키.
 * 기록·명렬표(`students.json`)는 **담임 학급 한 반**의 것이라 학급 구분이 없다.
 * 집계 함수는 학급 id 로 거르게 돼 있으므로 여기서 같은 값을 양쪽에 넣어 준다.
 */
const HOMEROOM = 'homeroom';

/** 오늘 날짜(YYYY-MM-DD). 로컬 시간 기준 — 선생님이 보는 달력과 같아야 한다. */
function todayKey(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** 이번 달 1일 ~ 오늘. 기록 통계의 기본 기간이다. */
function monthRange(): { periodFrom: string; periodTo: string; periodLabel: string } {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    periodFrom: `${ym}-01`,
    periodTo: `${ym}-${String(now.getDate()).padStart(2, '0')}`,
    periodLabel: ym,
  };
}

interface Card {
  readonly tool: string;
  readonly data: ModelSafe<ToolResultShape>;
}

/** 재구성을 거친 카드만 만든다. 여기가 그물 ②를 통과하는 유일한 통로다. */
function toCard(toolId: string, raw: ToolResultShape): Card | null {
  const tool = findAssistTool(toolId);
  if (!tool) return null;
  return { tool: tool.id, data: sanitizeToolResult(tool, raw) };
}

/** 의도 판정에 필요한 앱 데이터. 스토어 자체가 아니라 **읽은 값**만 넘긴다. */
export interface IntentSources {
  readonly students: readonly { readonly name: string; readonly studentNumber?: number }[];
  readonly classes: readonly {
    readonly id: string;
    readonly name: string;
    readonly grade?: number;
    readonly students: readonly unknown[];
  }[];
  readonly todos: readonly {
    readonly text: string;
    readonly dueDate?: string;
    readonly completed: boolean;
  }[];
  readonly records: readonly {
    readonly studentId: string;
    readonly category: string;
    readonly subcategory: string;
    readonly date: string;
  }[];
}

/**
 * ── 도구별 조립기 ─────────────────────────────────────────────────────────
 *
 * ★정규식 경로(INTENT_RULES)와 모델 도구 선택 경로(executeAssistTool)가 **같은 함수**를
 * 부른다. 예전에는 실행기가 `INTENT_RULES.build` 를 통째로 재사용해 두 정본을 막았는데,
 * 인자(조회일·기간·완료 포함)를 받기 시작하면서 그 방법이 더는 통하지 않는다 —
 * `build` 는 인자를 받지 않기 때문이다. 그래서 **인자를 받는 조립기 한 벌**을 두고
 * 양쪽이 각자의 기본값으로 그것을 부른다. 정본은 여전히 하나다.
 */

/** 인원 수. 학급 이름을 주면 그 학급을, 아니면 담임 학급을 센다. */
function buildCountStudents(src: IntentSources, className?: string): ToolResultShape {
  // ★다른 도구와 같은 느슨 매칭(namedClass)을 쓴다 — 모델이 "3학년 2반 수업"처럼
  //   질문의 말을 그대로 옮겨 보내면, 정확 일치만 봐서는 조용히 담임 학급을 세어 버린다.
  const resolved = namedClass(src, className).className;
  const named = resolved === undefined ? undefined : src.classes.find((c) => c.name === resolved);
  return named
    ? (countStudents(named.students, named.name) as unknown as ToolResultShape)
    : (countStudents(src.students, '우리 반') as unknown as ToolResultShape);
}

/** 하루 출결 요약. 날짜는 호출자가 정한다(정규식 경로는 오늘). */
function buildAttendanceSummary(src: IntentSources, date: string): ToolResultShape {
  const roll = toAttendanceRoll(src.records, {
    classId: HOMEROOM,
    date,
    rosterSize: src.students.length,
  });
  return summarizeAttendance([roll], {
    classId: HOMEROOM,
    className: '우리 반',
    date,
  }) as unknown as ToolResultShape;
}

/** 기록 통계. 기간은 호출자가 정한다(정규식 경로는 이번 달). */
function buildRecordsStats(src: IntentSources, from: string, to: string): ToolResultShape {
  return summarizeRecords(
    src.records.map((r) => ({ category: r.category, date: r.date, classId: HOMEROOM })),
    {
      classId: HOMEROOM,
      className: '우리 반',
      periodFrom: from,
      periodTo: to,
      // 기간을 인자로 받게 되면서 라벨도 실제 범위를 그대로 쓴다.
      // '2026-08' 같은 달 이름만 보내면 모델이 기간을 한 달로 오해한다.
      periodLabel: `${from} ~ ${to}`,
    },
  ) as unknown as ToolResultShape;
}

/** 할 일. 완료분 포함 여부는 호출자가 정한다(정규식 경로는 미완료만). */
function buildTodos(src: IntentSources, includeCompleted: boolean): ToolResultShape {
  return summarizeTodos(src.todos, {
    // ★오늘 날짜를 넘겨 기한 지남(overdue)을 앱이 계산한다. 모델은 오늘을 모른다.
    today: todayKey(),
    includeCompleted,
  }) as unknown as ToolResultShape;
}

/**
 * 아주 단순한 의도 판정 표.
 *
 * ★제안 칩(`AssistDock.SUGGESTIONS`) 문구가 여기 정규식에 **반드시 걸려야 한다.**
 * 칩을 눌렀는데 카드가 안 생기면 AI 가 아무 근거 없이 답하고, 남는 숫자도 없어 P5 가 깨진다.
 * 실제로 칩 4개 중 2개가 그랬다(UltraQA Cycle 2). `__tests__/assistIntent.test.ts` 가 지킨다.
 *
 * 표로 뽑아 둔 이유도 같다 — if 문이 흩어져 있으면 칩만 늘리고 규칙을 빠뜨린다.
 */
export const INTENT_RULES: readonly {
  readonly tool: string;
  readonly pattern: RegExp;
  /**
   * ★걸렸더라도 **여기에 걸리면 물러난다** — 모델이 도구를 고르게 넘긴다.
   *
   * 정규식 경로는 왕복을 아끼려고 만든 지름길인데, 조립기의 기본값(오늘·이번 달·미완료)이
   * 질문과 다를 때는 **지름길이 오답을 만든다.** "이번 달 결석 몇 번?"이 `출결` 에 걸려
   * 오늘 하루치 카드를 만들고, 모델은 그 숫자로 한 달을 답했다(2026-08-23 실측).
   *
   * 더 나쁜 것은 그 지름길이 **기간 도구를 통째로 가려 버린다는 점**이다. 도구를 만들어
   * 등록해도 질문이 여기서 먼저 걸리면 모델은 그 도구를 볼 기회조차 없다.
   *
   * 그래서 "기본값으로는 답할 수 없는 질문"의 표시가 보이면 지름길을 포기한다.
   * 칩 4개는 전부 기본값과 같은 질문이라 그대로 1왕복으로 남는다.
   */
  readonly steppedAsideWhen?: RegExp;
  readonly build: (question: string, src: IntentSources) => ToolResultShape;
}[] = [
  {
    tool: 'list_classes',
    pattern: /학급|반 목록|담당/,
    build: (_q, src) => toClassSummaries(src.classes) as unknown as ToolResultShape,
  },
  {
    tool: 'count_students',
    pattern: /몇 명|인원|학생 수/,
    // ★질문에 교과 학급 이름이 나오면 **그 학급의** 인원을, 아니면 담임 학급 인원을 센다.
    //   예전에는 담임 명렬표 인원을 교과 학급 이름으로 라벨링해 **다른 반 숫자**를 보였다.
    build: (question, src) =>
      buildCountStudents(src, src.classes.find((c) => question.includes(c.name))?.name),
  },
  {
    tool: 'get_my_todos',
    pattern: /할 일|업무|마감/,
    // 기본값은 "미완료만". 끝낸 것까지 달라는 질문이면 모델이 인자를 정하게 한다.
    steppedAsideWhen: /완료|끝낸|끝난|마친/,
    build: (_q, src) => buildTodos(src, false),
  },
  {
    tool: 'get_attendance_summary',
    pattern: /출결|출석|결석|지각|조퇴/,
    // 기본값은 "오늘 하루 · 담임 학급". 다른 기간이거나 교과 수업반이면 물러난다
    // (get_homeroom_attendance_stats · get_class_attendance_stats 가 받는다).
    steppedAsideWhen:
      /이번 ?달|이번 ?주|지난 ?달|저번 ?달|지난 ?주|저번 ?주|올해|작년|학기|기간|최근|어제|엊그제|수업 ?출결|수업반|[0-9]+월|[0-9]+일/,
    build: (_q, src) => buildAttendanceSummary(src, todayKey()),
  },
  {
    tool: 'get_records_stats',
    pattern: /기록|관찰|상담|몇 건/,
    // 기본값은 "이번 달". 다른 달·기간이면 물러난다.
    steppedAsideWhen: /지난 ?달|저번 ?달|지난 ?주|저번 ?주|올해|작년|학기|부터|[0-9]+월/,
    build: (_q, src) => {
      const { periodFrom, periodTo } = monthRange();
      return buildRecordsStats(src, periodFrom, periodTo);
    },
  },
];

/** 실행기가 볼 추가 데이터 원천 (의도 판정에는 안 쓰이고 도구 실행에만 쓰인다) */
export interface ExecutorSources extends IntentSources {
  readonly meals: readonly {
    readonly date: string;
    readonly mealType: string;
    readonly dishes: readonly { readonly name: string }[];
    readonly calorie: string;
  }[];
  readonly events: Parameters<typeof summarizeEvents>[0];
  readonly ddays: readonly {
    readonly title: string;
    readonly targetDate: string;
    readonly pinned: boolean;
  }[];
  /**
   * 그날의 유효 시간표(변동 반영)를 돌려주는 함수.
   *
   * ★값이 아니라 **함수**로 받는다. 요일 판정·주말 수업 설정·교체/보강 합성은 스토어
   * 선택자(`getEffectiveTeacherSchedule`)에 이미 있고, 그것을 그대로 넘겨야 시간표 화면과
   * AI 의 답이 같아진다.
   */
  readonly getDaySchedule: (date: string) => readonly (TeacherPeriod | null)[];
  readonly progress: readonly ProgressLike[];
  readonly memos: readonly MemoLike[];
  readonly notes: NoteSources;
  readonly bookmarks: readonly BookmarkLike[];
  readonly bookmarkGroups: readonly BookmarkGroupLike[];
  // ── Phase 2 (집계로 커버하는 읽기) ──
  /** 교과 수업반 출결 명부. ★상태 말고는 넘기지 않는다(번호·학년·반은 여기서 걸러진다) */
  readonly classAttendance: readonly ClassAttendanceRecordLike[];
  readonly gradePlans: readonly AssessmentPlanLike[];
  readonly gradeScores: readonly AssessmentScoreLike[];
  readonly seating: SeatingLike;
  readonly rubrics: readonly Rubric[];
  readonly rubricGradings: readonly RubricGrading[];
}

/** classId → 학급 이름. 저장된 값은 UUID 라 그대로 보내면 모델이 읽지 못한다. */
function classNameMap(src: IntentSources): Record<string, string> {
  return Object.fromEntries(src.classes.map((c) => [c.id, c.name]));
}

/**
 * 모델이 준 학급 이름을 **실제로 있는 반일 때만** 쓴다.
 *
 * 없는 이름을 그대로 넘기면 결과가 조용히 0건이 되고, 모델은 "기록이 없습니다"라고
 * 사실과 다르게 답한다. 지어낸 이름은 버리고 전체를 보는 편이 낫다.
 *
 * ★딱 맞지 않아도 한 번 더 본다. 실서버에서 "3학년 2반 수업 출결"을 물으면 모델이
 * `className: "3학년 2반 수업"` 을 보낸다(2026-08-23 실측) — 질문의 말을 그대로 옮긴
 * 것이라 사람 눈에는 맞는 반인데 글자로는 안 맞는다. 공백을 지우고 한쪽이 다른 쪽에
 * 들어 있으면 같은 반으로 본다. **단, 후보가 둘 이상이면 쓰지 않는다** — 엉뚱한 반의
 * 숫자를 맞는 반이라고 말하는 것이 전체를 보여주는 것보다 나쁘다.
 */
function namedClass(src: IntentSources, value: unknown): { className?: string } {
  if (typeof value !== 'string' || value.trim().length === 0) return {};
  const exact = src.classes.find((c) => c.name === value);
  if (exact) return { className: exact.name };

  const squash = (text: string): string => text.replace(/\s+/g, '');
  const wanted = squash(value);
  const loose = src.classes.filter((c) => {
    const name = squash(c.name);
    return name.length > 0 && (wanted.includes(name) || name.includes(wanted));
  });
  return loose.length === 1 ? { className: loose[0]!.name } : {};
}

/**
 * 모델이 고른 도구를 로컬에서 실행한다(옵션 A). 순수 함수 — 테스트에서 그대로 돈다.
 *
 * ★모델 인자는 항상 불신한다: JSON 파싱 실패·이상값이면 기본값으로 방어하고,
 *   레지스트리에 없는 도구 이름은 null(무시)이다. 날짜 기본값은 오늘~+6일.
 */
export function executeAssistTool(
  name: string,
  rawArguments: string,
  src: ExecutorSources,
): Card | null {
  const tool = findAssistTool(name);
  if (!tool) return null;

  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawArguments.length > 0 ? rawArguments : '{}');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    // 모델이 인자를 깨뜨렸다 — 기본값으로 진행한다.
  }

  const today = todayKey();
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const dateArg = (key: string, fallback: string): string => {
    const v = args[key];
    return typeof v === 'string' && DATE_RE.test(v) ? v : fallback;
  };
  /** 모델이 문자열 "true" 를 보내는 일이 잦다 — 불리언과 그 두 문자열만 받는다. */
  const boolArg = (key: string, fallback: boolean): boolean => {
    const v = args[key];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  };

  switch (name) {
    case 'get_meals': {
      const from = dateArg('from', today);
      return toCard(
        name,
        summarizeMeals(src.meals, {
          from,
          to: dateArg('to', addDays(from, 6)),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_events': {
      const from = dateArg('from', today);
      return toCard(
        name,
        summarizeEvents(src.events, {
          from,
          to: dateArg('to', addDays(from, 6)),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_ddays':
      return toCard(name, summarizeDDays(src.ddays, { today }) as unknown as ToolResultShape);
    case 'get_timetable': {
      const from = dateArg('from', today);
      return toCard(
        name,
        summarizeTimetable(src.getDaySchedule, {
          from,
          to: dateArg('to', addDays(from, 6)),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_progress': {
      // 진도는 "이번 달"을 묻는 일이 많아 기본 기간이 급식·일정과 다르다.
      const month = monthRange();
      return toCard(
        name,
        summarizeProgress(src.progress, {
          from: dateArg('from', month.periodFrom),
          to: dateArg('to', month.periodTo),
          classNames: classNameMap(src),
          ...namedClass(src, args.className),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_memos':
      return toCard(
        name,
        summarizeMemos(src.memos, {
          includeArchived: boolArg('includeArchived', false),
        }) as unknown as ToolResultShape,
      );
    case 'get_note_list':
      return toCard(
        name,
        summarizeNotes(src.notes, {
          includeArchived: boolArg('includeArchived', false),
        }) as unknown as ToolResultShape,
      );
    case 'get_bookmarks':
      return toCard(
        name,
        summarizeBookmarks(src.bookmarks, src.bookmarkGroups, {
          includeArchived: boolArg('includeArchived', false),
        }) as unknown as ToolResultShape,
      );
    case 'get_week_overview': {
      const from = dateArg('from', today);
      return toCard(
        name,
        summarizeWeek({
          from,
          to: dateArg('to', addDays(from, 6)),
          today,
          meals: src.meals,
          events: src.events,
          ddays: src.ddays,
          todos: src.todos,
          getDaySchedule: src.getDaySchedule,
        }) as unknown as ToolResultShape,
      );
    }
    // ── Phase 2: 집계로 커버하는 읽기 ──
    case 'get_homeroom_attendance_stats': {
      const month = monthRange();
      return toCard(
        name,
        summarizeHomeroomAttendance(src.records, {
          className: '우리 반',
          from: dateArg('from', month.periodFrom),
          to: dateArg('to', month.periodTo),
          rosterSize: src.students.length,
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_class_attendance_stats': {
      const month = monthRange();
      return toCard(
        name,
        summarizeClassAttendance(src.classAttendance, {
          from: dateArg('from', month.periodFrom),
          to: dateArg('to', month.periodTo),
          classNames: classNameMap(src),
          ...namedClass(src, args.className),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_grade_stats': {
      // 학기는 '1'·'2' 뿐이다. 모델이 '2026-2' 같은 걸 보내면 버리고 전체를 본다.
      const semester = args.semester === '1' || args.semester === '2' ? args.semester : undefined;
      return toCard(
        name,
        summarizeGrades(src.gradePlans, src.gradeScores, {
          classNames: classNameMap(src),
          ...namedClass(src, args.className),
          ...(semester === undefined ? {} : { semester }),
        }) as unknown as ToolResultShape,
      );
    }
    case 'get_seating_stats':
      return toCard(
        name,
        summarizeSeating(src.seating, { className: '우리 반' }) as unknown as ToolResultShape,
      );
    case 'get_assessment_stats':
      return toCard(
        name,
        summarizeAssessment(src.rubrics, src.rubricGradings, {
          classNames: classNameMap(src),
          ...namedClass(src, args.className),
        }) as unknown as ToolResultShape,
      );
    case 'count_students':
      return toCard(
        name,
        buildCountStudents(src, typeof args.className === 'string' ? args.className : undefined),
      );
    case 'get_attendance_summary':
      return toCard(name, buildAttendanceSummary(src, dateArg('date', today)));
    case 'get_records_stats': {
      const month = monthRange();
      return toCard(
        name,
        buildRecordsStats(src, dateArg('from', month.periodFrom), dateArg('to', month.periodTo)),
      );
    }
    case 'get_my_todos':
      return toCard(name, buildTodos(src, boolArg('includeCompleted', false)));
    default: {
      // 남은 것(학급 목록)은 인자가 없다 — 정규식 build 를 그대로 쓴다.
      const rule = INTENT_RULES.find((r) => r.tool === name);
      if (!rule) return null;
      return toCard(name, rule.build('', src));
    }
  }
}

/** 질문 → 숫자 카드. 순수 함수라 테스트에서 그대로 돌릴 수 있다. */
export function buildCards(question: string, src: IntentSources): Card[] {
  const cards: Card[] = [];
  for (const rule of INTENT_RULES) {
    if (!rule.pattern.test(question)) continue;
    // ★지름길이 오답을 만들 질문이면 카드를 만들지 않는다 — 카드가 하나도 없어야
    //   스토어가 모델에게 도구 목록을 보여준다(2왕복). 여기서 억지로 만들면
    //   기간 도구는 영영 불리지 않는다.
    if (rule.steppedAsideWhen?.test(question) === true) continue;
    const card = toCard(rule.tool, rule.build(question, src));
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * 쓰기 제안을 실행할 때 부를 스토어 함수들을 모은다.
 *
 * ★훅 밖에서 `getState()` 로 집는다. [실행] 버튼은 제안을 만든 지 한참 뒤에 눌릴 수
 * 있어서, 그때의 **최신 스토어**를 봐야 한다. 렌더 시점 값을 붙들고 있으면 그 사이에
 * 다른 화면에서 바뀐 내용을 덮어쓴다.
 */
function writeDeps(): WriteDeps {
  const todo = useTodoStore.getState();
  const events = useEventsStore.getState();
  const memos = useMemoStore.getState();
  const teaching = useTeachingClassStore.getState();
  const bookmarks = useBookmarkStore.getState();
  const notes = useNoteStore.getState();

  return {
    addTodo: todo.addTodo,
    updateTodo: todo.updateTodo,
    toggleTodo: todo.toggleTodo,
    getTodo: (id) => useTodoStore.getState().todos.find((t) => t.id === id),
    deleteTodo: todo.deleteTodo,

    addEvent: events.addEvent,
    getEvent: (id) => useEventsStore.getState().events.find((e) => e.id === id),
    updateEvent: events.updateEvent,
    deleteEvent: events.deleteEvent,

    addMemo: memos.addMemo,
    getMemo: (id) => useMemoStore.getState().memos.find((m) => m.id === id),
    updateMemo: memos.updateMemo,
    deleteMemo: memos.deleteMemo,

    addProgressEntry: teaching.addProgressEntry,
    getProgress: (id) => useTeachingClassStore.getState().progressEntries.find((p) => p.id === id),
    updateProgressEntry: teaching.updateProgressEntry,
    deleteProgressEntry: teaching.deleteProgressEntry,

    addBookmark: bookmarks.addBookmark,
    getBookmark: (id) => useBookmarkStore.getState().bookmarks.find((b) => b.id === id),
    updateBookmark: bookmarks.updateBookmark,
    deleteBookmark: bookmarks.deleteBookmark,
    addBookmarkGroup: bookmarks.addGroup,

    createNotebook: notes.createNotebook,
    renameNotebook: notes.renameNotebook,
    createSection: notes.createSection,
    renameSection: notes.renameSection,
    createPage: notes.createPage,
    getNotePage: (id) => useNoteStore.getState().pagesMeta.find((p) => p.id === id),
    renamePage: notes.renamePage,
    deletePage: notes.deletePage,
    noteSelection: () => {
      const state = useNoteStore.getState();
      return {
        notebookId: state.activeNotebookId,
        sectionId: state.activeSectionId,
        pageId: state.activePageId,
      };
    },
  };
}

export function AssistDockContainer() {
  const enabled = useAssistStore((s) => s.enabled);
  const ask = useAssistStore((s) => s.ask);
  const settleProposal = useAssistStore((s) => s.settleProposal);

  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const todos = useTodoStore((s) => s.todos);
  const records = useStudentRecordsStore((s) => s.records);
  const todayMeals = useMealStore((s) => s.todayMeals);
  const weekMeals = useMealStore((s) => s.weekMeals);
  const events = useEventsStore((s) => s.events);
  const ddays = useDDayStore((s) => s.items);
  const progress = useTeachingClassStore((s) => s.progressEntries);
  const memos = useMemoStore((s) => s.memos);
  const notebooks = useNoteStore((s) => s.notebooks);
  const noteSections = useNoteStore((s) => s.sections);
  const notePages = useNoteStore((s) => s.pagesMeta);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const bookmarkGroups = useBookmarkStore((s) => s.groups);
  const classAttendance = useTeachingClassStore((s) => s.attendanceRecords);
  const gradePlans = useGradeAnalysisStore((s) => s.plans);
  const writtenResults = useGradeAnalysisStore((s) => s.writtenResults);
  const performanceResults = useGradeAnalysisStore((s) => s.performanceResults);
  const seating = useSeatingStore((s) => s.seating);
  const rubrics = useRubricStore((s) => s.rubrics);
  const rubricGradings = useRubricStore((s) => s.gradings);
  const weekendDays = useSettingsStore((s) => s.settings.enableWeekendDays);
  // 교시 이름을 미리보기에 그대로 쓰기 위해 필요하다 — 선생님이 붙인 이름이 있으면 그것.
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);

  /**
   * ★쌤핀 AI 가 읽는 자료를 **켜져 있을 때 한 번 불러온다.**
   *
   * 메모·노트·즐겨찾기·시간표는 각자의 화면에서만 불러오는 구조라, 그 화면을 한 번도
   * 열지 않은 날에는 스토어가 비어 있다. 그대로 두면 "메모에 뭐 적었더라"에 AI 가
   * **0건이라고 사실과 다르게** 답한다. 각 스토어의 load 는 이미 불러왔으면 그냥
   * 돌아가므로(멱등) 여러 번 불려도 안전하다.
   */
  useEffect(() => {
    if (!enabled) return;
    void useStudentStore.getState().load();
    void useTeachingClassStore.getState().load();
    void useStudentRecordsStore.getState().load();
    void useTodoStore.getState().load();
    void useEventsStore.getState().load();
    void useDDayStore.getState().load();
    void useMemoStore.getState().load();
    void useNoteStore.getState().load();
    void useBookmarkStore.getState().loadAll();
    void useScheduleStore.getState().load();
    void useSettingsStore.getState().load();
    void useGradeAnalysisStore.getState().load();
    void useRubricStore.getState().load();
    void useSeatingStore.getState().load();
  }, [enabled]);

  // 오늘·이번 주 급식을 합치고 (날짜, 식사종류)로 중복 제거
  const meals = useMemo(() => {
    const seen = new Set<string>();
    return [...todayMeals, ...weekMeals].filter((m) => {
      const key = `${m.date}|${m.mealType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [todayMeals, weekMeals]);

  // ★그물 ③ 이 쓸 명단. 이름을 지우려면 "무엇이 이름인지"를 알아야 하는데,
  //   domain 은 스토어를 import 하지 않으므로 여기서 만들어 넘긴다.
  const roster = useMemo(
    () => rosterFrom(students.map((s) => ({ name: s.name, studentNumber: s.studentNumber }))),
    [students],
  );

  const notes: NoteSources = useMemo(
    () => ({ notebooks, sections: noteSections, pages: notePages }),
    [notebooks, noteSections, notePages],
  );

  /**
   * 지필과 수행은 저장 자리가 다르지만 **분포를 셀 때는 같은 모양**이다(평가 id + 점수).
   * 요약 함수를 둘로 나누면 평균 내는 코드가 두 벌이 된다.
   *
   * 수행평가에는 결시 코드가 없다 — 점수가 비어 있는 것으로만 구분된다.
   */
  const gradeScores = useMemo(
    () => [
      ...writtenResults.map((r) => ({
        assessmentId: r.assessmentId,
        score: r.score,
        ...(r.absenceCode === undefined ? {} : { absenceCode: r.absenceCode }),
      })),
      ...performanceResults.map((r) => ({ assessmentId: r.assessmentId, score: r.score })),
    ],
    [writtenResults, performanceResults],
  );

  /**
   * 그날의 유효 시간표(변동 반영)를 주는 함수.
   *
   * ★시간표만 **물어보는 순간에 읽는다**(`getState()`). 다른 자료처럼 구독해 두면
   * 합성 선택자는 스토어가 바뀌어도 같은 함수라서, 시간표를 고친 직후 질문했을 때
   * 옛 시간표가 그대로 답에 남는다. 조회는 선생님이 [보내기]를 누른 그 시점의
   * 사실이어야 한다.
   */
  const getDaySchedule = useMemo(
    () =>
      (date: string): readonly (TeacherPeriod | null)[] =>
        useScheduleStore.getState().getEffectiveTeacherSchedule(date, weekendDays),
    [weekendDays],
  );

  /**
   * 제안을 만들 때 보는 자료. **읽기 쪽과 달리 식별자를 담는다** — 어떤 항목을 고칠지
   * 정해야 하기 때문이다. 이 식별자는 모델에게 한 번도 나가지 않는다.
   */
  const writeSources: WriteSources = useMemo(
    () => ({
      today: todayKey(),
      periodTimes,
      todos: todos.map((t) => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
        ...(t.dueDate === undefined ? {} : { dueDate: t.dueDate }),
      })),
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        ...(e.time === undefined ? {} : { time: e.time }),
        ...(e.location === undefined ? {} : { location: e.location }),
      })),
      memos: memos.map((m) => ({ id: m.id, content: m.content })),
      progress: progress.map((p) => ({
        id: p.id,
        classId: p.classId,
        date: p.date,
        period: p.period,
        unit: p.unit,
        lesson: p.lesson,
        status: p.status,
        note: p.note,
      })),
      classes: classes.map((c) => ({ id: c.id, name: c.name })),
      bookmarks: bookmarks.map((b) => ({
        id: b.id,
        name: b.name,
        url: b.url,
        groupId: b.groupId,
      })),
      bookmarkGroups: bookmarkGroups.map((g) => ({ id: g.id, name: g.name })),
      notebooks: notebooks.map((n) => ({ id: n.id, title: n.title })),
      noteSections: noteSections.map((s) => ({
        id: s.id,
        notebookId: s.notebookId,
        title: s.title,
      })),
      notePages: notePages.map((p) => ({ id: p.id, sectionId: p.sectionId, title: p.title })),
    }),
    [
      bookmarkGroups,
      bookmarks,
      classes,
      events,
      memos,
      noteSections,
      periodTimes,
      notePages,
      notebooks,
      progress,
      todos,
    ],
  );

  /** [실행] — **여기서만** 저장이 일어난다. 모델은 이 함수를 부를 방법이 없다. */
  const handleRunProposal = useMemo(
    () =>
      (turnId: string, proposal: AssistWriteProposal): void => {
        // ★실행 직전 재확인 (2026-08-24 UltraQA):
        //   - 기능이 꺼졌으면 실행하지 않는다 — 옵트인 차단선은 실행 경로에도 있어야 한다.
        //   - pending 이 아니면(이미 실행 중·소멸) 무시한다 — 이중 클릭 방어의 절반.
        const current = useAssistStore.getState();
        if (!current.enabled) return;
        const turn = current.turns.find((t) => t.id === turnId);
        if (!turn || turn.proposalState !== 'pending') return;
        // 누르는 즉시 running 으로 — 버튼이 사라져 두 번 누를 수 없다(나머지 절반).
        settleProposal(turnId, 'running');
        void (async () => {
          try {
            const result = await executeAssistWrite(proposal, writeDeps());
            settleProposal(turnId, result.ok ? 'done' : 'failed', result.message);
          } catch (err) {
            console.error('[assist] 쓰기 실행 실패', err);
            settleProposal(turnId, 'failed', '저장하다가 문제가 생겼어요. 화면에서 직접 해주세요.');
          }
        })();
      },
    [settleProposal],
  );

  const handleAsk = useMemo(
    () =>
      (question: string): void => {
        const src: ExecutorSources = {
          students,
          classes,
          todos,
          records,
          meals,
          events,
          ddays,
          getDaySchedule,
          progress,
          memos,
          notes,
          bookmarks,
          bookmarkGroups,
          classAttendance,
          gradePlans,
          gradeScores,
          seating,
          rubrics,
          rubricGradings,
        };
        const cards = buildCards(question, src);
        void ask(
          assistPort,
          question,
          cards,
          roster,
          (name, rawArguments) => executeAssistTool(name, rawArguments, src),
          // ★제안만 만든다. 이 자리에 실행 함수를 넘기지 않는 것이 안전 구조의 전부다.
          (name, rawArguments) => buildWriteProposal(name, rawArguments, writeSources),
        );
      },
    [
      ask,
      bookmarkGroups,
      bookmarks,
      classAttendance,
      classes,
      ddays,
      events,
      getDaySchedule,
      gradePlans,
      gradeScores,
      meals,
      memos,
      notes,
      progress,
      records,
      roster,
      rubricGradings,
      rubrics,
      seating,
      students,
      todos,
      writeSources,
    ],
  );

  if (!enabled) return null;
  return <AssistDock onAsk={handleAsk} onRunProposal={handleRunProposal} />;
}
