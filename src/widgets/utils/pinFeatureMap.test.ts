import { describe, it, expect } from 'vitest';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { PIN_FEATURE_MAP } from './pinFeatureMap';

const VALID_FEATURE_KEYS: ReadonlySet<ProtectedFeatureKey> = new Set([
  'timetable',
  'seating',
  'schedule',
  'studentRecords',
  'meal',
  'memo',
  'note',
  'todo',
  'classManagement',
  'bookmarks',
]);

describe('PIN_FEATURE_MAP', () => {
  it('has exactly 9 entries', () => {
    expect(Object.keys(PIN_FEATURE_MAP)).toHaveLength(9);
  });

  it('maps each widget ID to the correct ProtectedFeatureKey', () => {
    expect(PIN_FEATURE_MAP['today-class']).toBe('timetable');
    expect(PIN_FEATURE_MAP['weekly-timetable']).toBe('timetable');
    expect(PIN_FEATURE_MAP['class-timetable']).toBe('timetable');
    expect(PIN_FEATURE_MAP['seating']).toBe('seating');
    expect(PIN_FEATURE_MAP['events']).toBe('schedule');
    expect(PIN_FEATURE_MAP['student-records']).toBe('studentRecords');
    expect(PIN_FEATURE_MAP['meal']).toBe('meal');
    expect(PIN_FEATURE_MAP['memo']).toBe('memo');
    expect(PIN_FEATURE_MAP['todo']).toBe('todo');
  });

  it('every value is a valid ProtectedFeatureKey', () => {
    for (const value of Object.values(PIN_FEATURE_MAP)) {
      expect(VALID_FEATURE_KEYS.has(value as ProtectedFeatureKey)).toBe(true);
    }
  });

  it('satisfies Record<string, ProtectedFeatureKey> at type level', () => {
    // TS-level assertion: if this compiles, the type is correct.
    const _typed: Record<string, ProtectedFeatureKey> = PIN_FEATURE_MAP;
    expect(_typed).toBeDefined();
  });
});
