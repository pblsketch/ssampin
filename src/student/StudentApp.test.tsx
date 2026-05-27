import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StudentRealtimeWallApp } from './StudentRealtimeWallApp';
import { resolveStudentAppComponent, resolveStudentAppMode, StudentApp } from './StudentApp';

describe('StudentApp router', () => {
  it('keeps realtime-wall as the default route', () => {
    expect(resolveStudentAppMode({ search: '', hash: '' })).toBe('realtime-wall');
    expect(resolveStudentAppComponent('realtime-wall')).toBe(StudentRealtimeWallApp);
  });

  it('keeps realtime-wall for unrelated query parameters', () => {
    expect(resolveStudentAppMode({ search: '?board=abc&nickname=민수', hash: '' })).toBe(
      'realtime-wall',
    );
  });

  it('routes classroom agreement links by tool, mode, or app parameter', () => {
    expect(resolveStudentAppMode({ search: '?tool=classroom-agreement', hash: '' })).toBe(
      'classroom-agreement',
    );
    expect(resolveStudentAppMode({ search: '?mode=classroom-agreement', hash: '' })).toBe(
      'classroom-agreement',
    );
    expect(resolveStudentAppMode({ search: '?app=classroom-agreements', hash: '' })).toBe(
      'classroom-agreement',
    );
  });

  it('routes classroom agreement links from hash parameters', () => {
    expect(resolveStudentAppMode({ search: '', hash: '#?tool=classroom-agreement' })).toBe(
      'classroom-agreement',
    );
  });

  it('lazy-loads the classroom agreement student app outside the default student bundle', () => {
    expect(resolveStudentAppComponent('classroom-agreement')).not.toBe(StudentRealtimeWallApp);
    const html = renderToString(<StudentApp mode="classroom-agreement" />);
    expect(html).toContain('학생 앱을 불러오는 중입니다.');

    const source = readFileSync('src/student/StudentApp.tsx', 'utf8');
    expect(source).toContain("import('./StudentClassroomAgreementApp')");
    expect(source).not.toContain('import { StudentClassroomAgreementApp }');
  });
});
