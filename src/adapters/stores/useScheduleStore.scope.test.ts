/**
 * ULTRA 통합 테스트: scope 필터가 실제로 저장 → 유효 스케줄 조회 경로에서
 * 교사/학급 시간표를 정확히 분리하는지 E2E로 검증.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { useScheduleStore } from './useScheduleStore';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';

// jsdom에 localStorage 폴리필
beforeAll(() => {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
});

const CLASS_BASE: ClassScheduleData = {
  '월': [
    { subject: '수학', teacher: '김선생' },
    { subject: '영어', teacher: '이선생' },
    { subject: '국어', teacher: '박선생' },
  ],
  '화': [
    { subject: '과학', teacher: '최선생' },
    { subject: '체육', teacher: '정선생' },
    { subject: '음악', teacher: '한선생' },
  ],
  '수': [], '목': [], '금': [],
} as unknown as ClassScheduleData;

const TEACHER_BASE: TeacherScheduleData = {
  '월': [
    { subject: '수학', classroom: '3-1' },
    null,
    { subject: '국어', classroom: '3-2' },
  ],
  '화': [
    null,
    { subject: '체육', classroom: '운동장' },
    null,
  ],
  '수': [], '목': [], '금': [],
} as unknown as TeacherScheduleData;

// ※ 2026-04-20은 월요일
const MON = '2026-04-20';

describe('ULTRA scope 필터 E2E', () => {
  beforeEach(() => {
    useScheduleStore.setState({
      classSchedule: CLASS_BASE,
      teacherSchedule: TEACHER_BASE,
      overrides: [],
      loaded: true,
      past: [],
      future: [],
    });
  });
  it('2026-04-20이 월요일이어야 테스트가 유효', () => {
    expect(new Date(MON + 'T00:00:00').getDay()).toBe(1);
  });

  it('scope="teacher" override: 교사 시간표에만 나타나고, 학급 시간표는 원본 유지', async () => {
    const { addOverride, getEffectiveTeacherSchedule, getEffectiveClassSchedule } = useScheduleStore.getState();
    await addOverride({
      date: MON,
      period: 1,
      subject: '보강수업',
      scope: 'teacher',
    });

    const teacher = getEffectiveTeacherSchedule(MON);
    const klass = getEffectiveClassSchedule(MON);

    expect(teacher[0]).toEqual({ subject: '보강수업', classroom: '' });
    expect(klass[0]).toEqual({ subject: '수학', teacher: '김선생' }); // 원본 유지
  });

  it('scope="class" override: 학급 시간표에만 나타나고, 교사 시간표는 원본 유지', async () => {
    const { addOverride, getEffectiveTeacherSchedule, getEffectiveClassSchedule } = useScheduleStore.getState();
    await addOverride({
      date: MON,
      period: 2,
      subject: '자율활동',
      scope: 'class',
    });

    const teacher = getEffectiveTeacherSchedule(MON);
    const klass = getEffectiveClassSchedule(MON);

    expect(klass[1]).toEqual({ subject: '자율활동', teacher: '이선생' });
    expect(teacher[1]).toBeNull(); // 원본 유지 (null)
  });

  it('scope="both": 양쪽 모두에 반영', async () => {
    const { addOverride, getEffectiveTeacherSchedule, getEffectiveClassSchedule } = useScheduleStore.getState();
    await addOverride({
      date: MON,
      period: 3,
      subject: '시험',
      scope: 'both',
    });

    const teacher = getEffectiveTeacherSchedule(MON);
    const klass = getEffectiveClassSchedule(MON);

    expect(teacher[2]).toEqual({ subject: '시험', classroom: '' });
    expect(klass[2]).toEqual({ subject: '시험', teacher: '박선생' });
  });

  it('scope undefined (legacy): both로 해석되어 양쪽에 반영', async () => {
    useScheduleStore.setState({
      overrides: [
        {
          id: 'legacy',
          date: MON,
          period: 1,
          subject: '레거시',
          createdAt: '2026-01-01T00:00:00.000Z',
          // scope 필드 없음 (이전 버전 데이터)
        },
      ],
    });
    const { getEffectiveTeacherSchedule, getEffectiveClassSchedule } = useScheduleStore.getState();
    const teacher = getEffectiveTeacherSchedule(MON);
    const klass = getEffectiveClassSchedule(MON);
    expect(teacher[0]).toEqual({ subject: '레거시', classroom: '' });
    expect(klass[0]).toEqual({ subject: '레거시', teacher: '김선생' });
  });

  it('같은 date+period에 scope="teacher"와 scope="class" 공존: 각각 해당 view에만 반영', async () => {
    const { addOverride, getEffectiveTeacherSchedule, getEffectiveClassSchedule } = useScheduleStore.getState();
    await addOverride({ date: MON, period: 1, subject: '보강', scope: 'teacher' });
    await addOverride({ date: MON, period: 1, subject: '자습', scope: 'class' });

    const teacher = getEffectiveTeacherSchedule(MON);
    const klass = getEffectiveClassSchedule(MON);
    expect(teacher[0]).toEqual({ subject: '보강', classroom: '' });
    expect(klass[0]).toEqual({ subject: '자습', teacher: '김선생' });

    // 저장된 override는 2건 공존
    expect(useScheduleStore.getState().overrides).toHaveLength(2);
  });

  it('scope="teacher"로 addOverride 재호출 시 기존 scope="teacher" 항목만 교체, class 항목 건드리지 않음', async () => {
    const { addOverride } = useScheduleStore.getState();
    await addOverride({ date: MON, period: 1, subject: '보강1', scope: 'teacher' });
    await addOverride({ date: MON, period: 1, subject: '자습', scope: 'class' });
    await addOverride({ date: MON, period: 1, subject: '보강2', scope: 'teacher' });  // 같은 teacher scope 덮어씀

    const overrides = useScheduleStore.getState().overrides;
    expect(overrides).toHaveLength(2);
    const teacherOne = overrides.find((o) => o.scope === 'teacher')!;
    const classOne = overrides.find((o) => o.scope === 'class')!;
    expect(teacherOne.subject).toBe('보강2');
    expect(classOne.subject).toBe('자습');
  });
});
