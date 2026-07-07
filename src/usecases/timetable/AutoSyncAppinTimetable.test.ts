import { describe, it, expect } from 'vitest';
import { autoSyncAppinTimetable } from './AutoSyncAppinTimetable';
import type { IAppinPort } from '@domain/ports/IAppinPort';
import type { AppinAutoSyncSettings } from '@domain/entities/Settings';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';

const EMPTY_TEACHER = { 월: [], 화: [], 수: [], 목: [], 금: [] } as unknown as TeacherScheduleData;
const EMPTY_CLASS = { 월: [], 화: [], 수: [], 목: [], 금: [] } as unknown as ClassScheduleData;
const NOW = new Date('2026-07-07T12:00:00');

/** h20.txt 가 어제 수정됨 → 현재 주차 20으로 잡히는 픽스처 포트 */
function makePort(texts: Record<string, string>): IAppinPort {
  return {
    resolveSchool: async () => null,
    getElements: async () => ({
      elements: ['1-1', '1-2'],
      teacherNumbers: ['1', '2'],
      movementRooms: [],
    }),
    getWeekFileText: async (_webdir, filename) => texts[filename] ?? '',
    listFiles: async () => [{ name: 'h20.txt', modified: '2026-07-06T10:00:00', size: '8k' }],
  };
}

const teacherCfg: AppinAutoSyncSettings = {
  enabled: true,
  webdir: '9999',
  schoolName: '테스트고',
  city: '서울',
  target: 'teacher',
  teacherNo: 1,
  autoApply: false,
  lastSyncDate: '',
};

const classCfg: AppinAutoSyncSettings = {
  enabled: true,
  webdir: '9999',
  schoolName: '테스트고',
  city: '서울',
  target: 'class',
  grade: 1,
  classNum: 1,
  autoApply: false,
  lastSyncDate: '',
};

describe('autoSyncAppinTimetable', () => {
  it('설정 없거나 미enabled면 skip(no-config)', async () => {
    const r = await autoSyncAppinTimetable(
      makePort({}),
      undefined,
      EMPTY_TEACHER,
      EMPTY_CLASS,
      NOW,
    );
    expect(r).toMatchObject({ skipped: true, reason: 'no-config' });
  });

  it('교사: g파일 재fetch → 변경 감지(교사 그리드 반환)', async () => {
    const p = makePort({ 'g20.txt': '국어/1-1^수학/1-2' });
    const r = await autoSyncAppinTimetable(p, teacherCfg, EMPTY_TEACHER, EMPTY_CLASS, NOW);
    expect(r.skipped).toBe(false);
    expect(r.target).toBe('teacher');
    expect(r.changed).toBe(true);
    const data = r.data as TeacherScheduleData;
    expect(data['월']?.[0]).toEqual({ subject: '국어', classroom: '1-1' });
  });

  it('교사: 그 번호 데이터 없으면 skip(no-data)', async () => {
    const p = makePort({ 'g20.txt': '' });
    const r = await autoSyncAppinTimetable(p, teacherCfg, EMPTY_TEACHER, EMPTY_CLASS, NOW);
    expect(r).toMatchObject({ skipped: true, reason: 'no-data' });
  });

  it('학급: h파일 재fetch → 변경 감지(학급 그리드 반환)', async () => {
    // 1-1은 dnele elements[0] → h20 0번째 줄
    const p = makePort({ 'h20.txt': '국어^수학' });
    const r = await autoSyncAppinTimetable(p, classCfg, EMPTY_TEACHER, EMPTY_CLASS, NOW);
    expect(r.skipped).toBe(false);
    expect(r.target).toBe('class');
    expect(r.changed).toBe(true);
    const data = r.data as ClassScheduleData;
    expect(data['월']?.[0]).toEqual({ subject: '국어', teacher: '' });
  });
});
