import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StudentClassroomAgreementApp } from './StudentClassroomAgreementApp';
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

  it('renders the classroom agreement student placeholder for classroom-agreement mode', () => {
    expect(resolveStudentAppComponent('classroom-agreement')).toBe(StudentClassroomAgreementApp);
    const html = renderToString(<StudentApp mode="classroom-agreement" />);
    expect(html).toContain('교실 약속 정하기');
  });
});
