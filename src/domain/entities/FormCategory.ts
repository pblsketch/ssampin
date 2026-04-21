export interface FormCategory {
  readonly id: string;
  readonly name: string;
  /** material-symbols name */
  readonly icon: string;
  /** hex */
  readonly color: string;
  readonly order: number;
  readonly isBuiltin: boolean;
}

export const BUILTIN_CATEGORIES: readonly FormCategory[] = [
  { id: 'builtin:parent-notice', name: '가정통신문', icon: 'mail',        color: '#3b82f6', order: 0, isBuiltin: true },
  { id: 'builtin:official-doc',  name: '공문서',     icon: 'description', color: '#64748b', order: 1, isBuiltin: true },
  { id: 'builtin:grade-eval',    name: '성적/평가',  icon: 'grade',       color: '#f59e0b', order: 2, isBuiltin: true },
  { id: 'builtin:life-record',   name: '생활기록',   icon: 'assignment',  color: '#10b981', order: 3, isBuiltin: true },
  { id: 'builtin:counseling',    name: '상담',       icon: 'forum',       color: '#8b5cf6', order: 4, isBuiltin: true },
  { id: 'builtin:other',         name: '기타',       icon: 'folder',      color: '#94a3b8', order: 5, isBuiltin: true },
];
