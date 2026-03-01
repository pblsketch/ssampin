import type { ClassScheduleData, TeacherScheduleData } from './Timetable';
import type { SeatingData } from './Seating';
import type { SchoolEventsData } from './SchoolEvent';
import type { MemosData } from './Memo';
import type { TodosData } from './Todo';
import type { StudentRecordsData } from './StudentRecord';
import type { Settings } from './Settings';

/** 쌤핀 데이터 공유/내보내기 파일 형식 */
export interface SsampinShareFile {
  readonly version: string;
  readonly exportedAt: string; // ISO 8601
  readonly settings?: Settings;
  readonly classSchedule?: ClassScheduleData;
  readonly teacherSchedule?: TeacherScheduleData;
  readonly seating?: SeatingData;
  readonly events?: SchoolEventsData;
  readonly memos?: MemosData;
  readonly todos?: TodosData;
  readonly studentRecords?: StudentRecordsData;
}
