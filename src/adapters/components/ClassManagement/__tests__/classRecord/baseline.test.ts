import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const classRecordSearchSource = readFileSync(
  resolve(__dirname, '../../ClassRecordSearchView.tsx'),
  'utf-8',
);
const observationFormSource = readFileSync(
  resolve(__dirname, '../../ObservationForm.tsx'),
  'utf-8',
);
const observationStoreSource = readFileSync(
  resolve(__dirname, '../../../../stores/useObservationStore.ts'),
  'utf-8',
);

describe('수업 기록 리디자인 Phase 0/1 baseline', () => {
  it('검색 결과 필터는 기간 범위 변경에 반응한다', () => {
    expect(classRecordSearchSource).toContain('dateRange.start');
    expect(classRecordSearchSource).toContain('dateRange.end');
    expect(classRecordSearchSource).toContain(
      '[mixedRecords, studentFilter, tagFilter, keyword, dateRange.start, dateRange.end]',
    );
  });

  it('ObservationForm은 학생 전환 중복 저장과 실행 취소 race를 막는다', () => {
    expect(observationFormSource).toContain('savingRef');
    expect(observationFormSource).toContain('deleteRecord(recordId)');
    expect(observationFormSource).toContain('자동 저장 실패. 내용을 복사해 두세요.');
  });

  it('ObservationForm draft Map은 TTL/LRU와 unmount cleanup을 가진다', () => {
    expect(observationFormSource).toContain('DRAFT_TTL_MS = 5 * 60 * 1000');
    expect(observationFormSource).toContain('DRAFT_LRU_MAX = 50');
    expect(observationFormSource).toContain('draftMapRef.current.clear()');
  });

  it('addRecord는 생성된 observation id를 반환한다', () => {
    expect(observationStoreSource).toContain('}) => Promise<string>');
    expect(observationStoreSource).toContain('return record.id');
  });
});
