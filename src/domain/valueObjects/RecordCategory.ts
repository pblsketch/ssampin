export type RecordCategory = 'attendance' | 'counseling' | 'life' | 'etc';

export const RECORD_CATEGORIES: readonly RecordCategory[] = [
  'attendance',
  'counseling',
  'life',
  'etc',
] as const;
