import type { FormTemplate, FormFormat } from '@domain/entities/FormTemplate';
import type { Student } from '@domain/entities/Student';
import type { DetectedMergeField } from '@domain/valueObjects/MergeField';
import { PLACEHOLDER_ALIASES } from '@domain/valueObjects/MergeField';

/** 텍스트에서 {{...}} 토큰을 추출. 공백 허용, non-greedy. 결과는 trim된 raw key 배열. */
export function parsePlaceholders(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g);
  return [...matches].map((m) => (m[1] ?? '').trim());
}

/** raw key → DetectedMergeField. alias 미존재 시 custom으로 분류. occurrences는 1로 초기화. */
export function classifyPlaceholder(rawKey: string): DetectedMergeField {
  const source = PLACEHOLDER_ALIASES[rawKey];
  if (source) {
    return {
      placeholder: `{{${rawKey}}}`,
      source,
      occurrences: 1,
    };
  }
  return {
    placeholder: `{{${rawKey}}}`,
    source: 'custom',
    customKey: rawKey,
    occurrences: 1,
  };
}

export interface MergeContext {
  readonly student?: Student;
  readonly className: string;
  readonly grade: number;
  readonly schoolName: string;
  readonly teacherName: string;
  /** "1학기" | "2학기" */
  readonly semester: string;
  readonly custom: Readonly<Record<string, string>>;
  /** 테스트/시간 주입용 (옵션). 미지정 시 new Date() */
  readonly now?: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateKorean(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** DetectedMergeField + 학생/학급 컨텍스트 → 실제 값. 미해결은 빈 문자열. */
export function resolveMergeValue(
  field: DetectedMergeField,
  ctx: MergeContext,
): string {
  const now = ctx.now ?? new Date();
  switch (field.source) {
    case 'student.name':
      return ctx.student?.name ?? '';
    case 'student.number':
      return ctx.student?.studentNumber !== undefined ? String(ctx.student.studentNumber) : '';
    case 'student.phone':
      return ctx.student?.phone ?? '';
    case 'student.parentName':
      return ctx.student?.parentPhoneLabel ?? '';
    case 'student.parentPhone':
      return ctx.student?.parentPhone ?? '';
    case 'class.name':
      return ctx.className;
    case 'class.grade':
      return String(ctx.grade);
    case 'class.teacher':
      return ctx.teacherName;
    case 'class.school':
      return ctx.schoolName;
    case 'date.today':
      return formatDateYmd(now);
    case 'date.todayKorean':
      return formatDateKorean(now);
    case 'date.semester':
      return ctx.semester;
    case 'custom': {
      const key = field.customKey;
      if (!key) return '';
      return ctx.custom[key] ?? '';
    }
  }
}

export interface FormFilterOptions {
  readonly format?: FormFormat;
  readonly categoryId?: string;
  readonly starred?: boolean;
  /** 이름/태그 full-text, 대소문자 무시 */
  readonly query?: string;
}

export function filterForms(
  forms: readonly FormTemplate[],
  opts: FormFilterOptions,
): readonly FormTemplate[] {
  const q = opts.query?.trim().toLowerCase() ?? '';
  return forms.filter((f) => {
    if (opts.format && f.format !== opts.format) return false;
    if (opts.categoryId && f.categoryId !== opts.categoryId) return false;
    if (opts.starred !== undefined && f.starred !== opts.starred) return false;
    if (q) {
      const haystack = [f.name, ...f.tags].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export type FormSort = 'recent' | 'name' | 'created';

export function sortForms(
  forms: readonly FormTemplate[],
  by: FormSort,
): readonly FormTemplate[] {
  const copy = [...forms];
  switch (by) {
    case 'recent':
      copy.sort((a, b) => {
        const av = a.lastUsedAt ?? a.createdAt;
        const bv = b.lastUsedAt ?? b.createdAt;
        // DESC
        return bv.localeCompare(av);
      });
      break;
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      break;
    case 'created':
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }
  return copy;
}
