import { describe, it, expect } from 'vitest';
import type { FormTemplate } from '@domain/entities/FormTemplate';
import {
  parsePlaceholders,
  classifyPlaceholder,
  resolveMergeValue,
  filterForms,
  sortForms,
  type MergeContext,
} from './formTemplateRules';

const mkForm = (overrides: Partial<FormTemplate> & { id: string; name: string }): FormTemplate => ({
  id: overrides.id,
  name: overrides.name,
  format: overrides.format ?? 'hwpx',
  categoryId: overrides.categoryId ?? 'builtin:other',
  filePath: overrides.filePath ?? `forms/${overrides.id}.hwpx`,
  fileSize: overrides.fileSize ?? 100,
  thumbnailPath: overrides.thumbnailPath,
  textPreview: overrides.textPreview,
  mergeFields: overrides.mergeFields ?? [],
  customFieldDefaults: overrides.customFieldDefaults ?? {},
  starred: overrides.starred ?? false,
  tags: overrides.tags ?? [],
  isBuiltin: overrides.isBuiltin ?? false,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  lastUsedAt: overrides.lastUsedAt,
  useCount: overrides.useCount ?? 0,
});

describe('parsePlaceholders', () => {
  it('단일 토큰 {{학생이름}} 1개 추출', () => {
    expect(parsePlaceholders('안녕하세요 {{학생이름}}님')).toEqual(['학생이름']);
  });

  it('{{ 학생이름 }} 내부 공백 trim', () => {
    expect(parsePlaceholders('{{ 학생이름 }}')).toEqual(['학생이름']);
  });

  it('중첩 {{{x}}} 케이스: [^{}] 제약으로 내부 "{x" 가 아니라 "x" 만 매칭', () => {
    // 정규식 /\{\{\s*([^{}]+?)\s*\}\}/g 은 [^{}] 때문에 중첩 { 를 허용하지 않는다.
    // 따라서 {{{x}}} 은 두번째 { 부터 {{x}} 로 매칭되어 key='x' 하나만 추출된다.
    // ({ 나 } 가 key 안에 포함된 "{x" 같은 형태는 나오지 않음을 보장.)
    expect(parsePlaceholders('{{{x}}}')).toEqual(['x']);
  });

  it('다중 토큰 20개를 순서대로 전부 추출', () => {
    const src = Array.from({ length: 20 }, (_, i) => `{{k${i}}}`).join(' ');
    const keys = parsePlaceholders(src);
    expect(keys.length).toBe(20);
    expect(keys[0]).toBe('k0');
    expect(keys[19]).toBe('k19');
  });
});

describe('classifyPlaceholder', () => {
  it('alias 매칭: 학생이름 → student.name', () => {
    const f = classifyPlaceholder('학생이름');
    expect(f.source).toBe('student.name');
    expect(f.placeholder).toBe('{{학생이름}}');
    expect(f.customKey).toBeUndefined();
  });

  it('미지 키는 custom으로 분류하고 customKey 보존', () => {
    const f = classifyPlaceholder('상담기간');
    expect(f.source).toBe('custom');
    expect(f.customKey).toBe('상담기간');
    expect(f.placeholder).toBe('{{상담기간}}');
  });
});

describe('resolveMergeValue', () => {
  const baseCtx: MergeContext = {
    student: {
      id: 's1',
      name: '홍길동',
      studentNumber: 7,
    },
    className: '3-2',
    grade: 3,
    schoolName: '쌤핀중학교',
    teacherName: '박선생',
    semester: '1학기',
    custom: { '상담기간': '2026-04-14 ~ 04-18' },
    now: new Date(2026, 3, 21), // 2026-04-21 local
  };

  it('student.name → "홍길동"', () => {
    const field = classifyPlaceholder('학생이름');
    expect(resolveMergeValue(field, baseCtx)).toBe('홍길동');
  });

  it('date.todayKorean → "2026년 4월 21일"', () => {
    const field = classifyPlaceholder('오늘');
    expect(resolveMergeValue(field, baseCtx)).toBe('2026년 4월 21일');
  });

  it('custom 값은 ctx.custom에서 조회', () => {
    const field = classifyPlaceholder('상담기간');
    expect(resolveMergeValue(field, baseCtx)).toBe('2026-04-14 ~ 04-18');
  });
});

describe('filterForms', () => {
  const forms: readonly FormTemplate[] = [
    mkForm({ id: '1', name: '가정통신문', format: 'hwpx', categoryId: 'builtin:parent-notice', tags: ['상담'] }),
    mkForm({ id: '2', name: '채점표',     format: 'excel', categoryId: 'builtin:grade-eval', tags: ['수행평가'] }),
    mkForm({ id: '3', name: '안내문 PDF', format: 'pdf',   categoryId: 'builtin:parent-notice', tags: ['현장체험'] }),
  ];

  it('format 필터', () => {
    const r = filterForms(forms, { format: 'pdf' });
    expect(r.map((f) => f.id)).toEqual(['3']);
  });

  it('categoryId 필터', () => {
    const r = filterForms(forms, { categoryId: 'builtin:parent-notice' });
    expect(r.map((f) => f.id)).toEqual(['1', '3']);
  });

  it('query — 대소문자 무시 + 태그 매칭', () => {
    // 이름은 소문자 없지만 tag "수행평가" 와 대문자 쿼리를 섞어 본다
    const r1 = filterForms(forms, { query: '수행' });
    expect(r1.map((f) => f.id)).toEqual(['2']);
    const r2 = filterForms(forms, { query: 'PDF' });
    expect(r2.map((f) => f.id)).toEqual(['3']);
    const r3 = filterForms(forms, { query: 'pdf' });
    expect(r3.map((f) => f.id)).toEqual(['3']);
  });
});

describe('sortForms', () => {
  const forms: readonly FormTemplate[] = [
    mkForm({ id: 'a', name: '다람쥐', createdAt: '2026-01-10T00:00:00.000Z', lastUsedAt: '2026-02-01T00:00:00.000Z' }),
    mkForm({ id: 'b', name: '가나다', createdAt: '2026-03-01T00:00:00.000Z' }),
    mkForm({ id: 'c', name: '나무',   createdAt: '2026-02-15T00:00:00.000Z', lastUsedAt: '2026-04-01T00:00:00.000Z' }),
  ];

  it('recent: lastUsedAt(없으면 createdAt) DESC', () => {
    // c(2026-04-01), b(2026-03-01 createdAt), a(2026-02-01)
    expect(sortForms(forms, 'recent').map((f) => f.id)).toEqual(['c', 'b', 'a']);
  });

  it('name: 한글 로케일 ASC', () => {
    expect(sortForms(forms, 'name').map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('created: createdAt DESC', () => {
    expect(sortForms(forms, 'created').map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });
});
