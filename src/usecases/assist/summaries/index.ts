export { summarizeAttendance } from './summarizeAttendance';
export type {
  AttendanceRecordLike,
  SummarizeAttendanceOptions,
  AttendanceSummary,
} from './summarizeAttendance';

export { countStudents } from './countStudents';

export { toClassSummaries } from './toClassSummaries';
export type { ClassLike, ClassSummary } from './toClassSummaries';

export { summarizeRecords } from './summarizeRecords';
export type { RecordLike, SummarizeRecordsOptions, RecordsSummary } from './summarizeRecords';

export { summarizeTodos } from './summarizeTodos';
export type { TodoLike, SummarizeTodosOptions, TodosSummary } from './summarizeTodos';

export { toAttendanceRoll } from './toAttendanceRoll';
export type { AttendanceRecordSource, ToAttendanceRollOptions } from './toAttendanceRoll';
export { summarizeMeals } from './summarizeMeals';
export type { MealLike, SummarizeMealsOptions, MealsSummary } from './summarizeMeals';
export { summarizeDDays } from './summarizeDDays';
export type { DDayLike, SummarizeDDaysOptions, DDaysSummary } from './summarizeDDays';
export { summarizeEvents } from './summarizeEvents';
export type { SummarizeEventsOptions, EventsSummary } from './summarizeEvents';

// ── 브릿지 동등화 Phase 1 슬라이스 2 (시간표·진도·메모·노트·즐겨찾기·주간요약) ──
export { clip } from './clip';
export { addDays, dayName, eachDate } from './dateWalk';
export { summarizeTimetable } from './summarizeTimetable';
export type { SummarizeTimetableOptions, TimetableSummary } from './summarizeTimetable';
export { summarizeProgress } from './summarizeProgress';
export type { ProgressLike, SummarizeProgressOptions, ProgressSummary } from './summarizeProgress';
export { summarizeMemos } from './summarizeMemos';
export type { MemoLike, SummarizeMemosOptions, MemosSummary } from './summarizeMemos';
export { summarizeNotes } from './summarizeNotes';
export type { NoteSources, SummarizeNotesOptions, NotesSummary } from './summarizeNotes';
export { summarizeBookmarks } from './summarizeBookmarks';
export type {
  BookmarkLike,
  BookmarkGroupLike,
  SummarizeBookmarksOptions,
  BookmarksSummary,
} from './summarizeBookmarks';
export { summarizeWeek } from './summarizeWeek';
export type { SummarizeWeekOptions, WeekSummary } from './summarizeWeek';
