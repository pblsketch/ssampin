/** 쌤핀이 표준 제공하는 내장 플레이스홀더 소스 */
export type BuiltinMergeSource =
  | 'student.name'
  | 'student.number'
  | 'student.phone'
  | 'student.parentName'
  | 'student.parentPhone'
  | 'class.name'
  | 'class.grade'
  | 'class.teacher'
  | 'class.school'
  | 'date.today'
  | 'date.todayKorean'
  | 'date.semester'
  | 'custom';

export interface DetectedMergeField {
  /** 원본 토큰 "{{학생이름}}" */
  readonly placeholder: string;
  readonly source: BuiltinMergeSource;
  /** source='custom'일 때 "상담기간" */
  readonly customKey?: string;
  /** 템플릿 내 등장 횟수 */
  readonly occurrences: number;
}

/** {{학생이름}} 내부 raw key → builtin source 매핑 */
export const PLACEHOLDER_ALIASES: Readonly<Record<string, BuiltinMergeSource>> = {
  '학생이름': 'student.name',
  '이름': 'student.name',
  '번호': 'student.number',
  '학번': 'student.number',
  '학생연락처': 'student.phone',
  '학부모이름': 'student.parentName',
  '학부모연락처': 'student.parentPhone',
  '학급': 'class.name',
  '학년': 'class.grade',
  '담임': 'class.teacher',
  '학교명': 'class.school',
  '학교': 'class.school',
  '오늘날짜': 'date.today',
  '오늘': 'date.todayKorean',
  '학기': 'date.semester',
};
