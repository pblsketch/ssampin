/**
 * Command Palette 회귀 메타테스트.
 *
 * - matchesQuery: AND 토큰 매칭 정책 유지
 * - "여러 날 출결" 명령(`multiDateAttendance.open`) 존재 + 키워드 매핑 보장 (FR-10)
 */
import { describe, expect, it, vi } from 'vitest';
import { buildDefaultCommands, matchesQuery } from './commandRegistry';
import { useMultiDateAttendanceIntentStore } from '@adapters/stores/useMultiDateAttendanceIntentStore';

describe('matchesQuery', () => {
  const cmd = {
    id: 'test',
    label: '여러 날 출결 일괄 등록',
    group: '빠른 추가' as const,
    icon: 'date_range',
    keywords: ['여러', '날', '출결', '결석', '교외체험학습'],
    run: () => {},
  };

  it('빈 쿼리는 모두 매치', () => {
    expect(matchesQuery(cmd, '')).toBe(true);
    expect(matchesQuery(cmd, '   ')).toBe(true);
  });

  it('AND 토큰 — 모두 포함', () => {
    expect(matchesQuery(cmd, '여러 출결')).toBe(true);
    expect(matchesQuery(cmd, '출결 일괄')).toBe(true);
  });

  it('하나라도 불일치면 false', () => {
    expect(matchesQuery(cmd, '여러 메모')).toBe(false);
  });

  it('대소문자 무시', () => {
    expect(matchesQuery(cmd, 'attendance')).toBe(false); // 키워드 없음
    expect(matchesQuery({ ...cmd, keywords: [...cmd.keywords, 'attendance'] }, 'ATTENDANCE')).toBe(
      true,
    );
  });
});

describe('"여러 날 출결" 명령 (multiDateAttendance.open)', () => {
  const onNavigate = vi.fn();
  const commands = buildDefaultCommands({ onNavigate });
  const target = commands.find((c) => c.id === 'multiDateAttendance.open');

  it('명령이 등록되어 있음', () => {
    expect(target).toBeDefined();
  });

  it('빠른 추가 그룹에 속함', () => {
    expect(target?.group).toBe('빠른 추가');
  });

  it('date_range 아이콘', () => {
    expect(target?.icon).toBe('date_range');
  });

  it('한국어 라벨', () => {
    expect(target?.label).toContain('여러 날');
    expect(target?.label).toContain('출결');
  });

  it('필수 키워드 매핑 (여러, 날, 출결, 일괄, 다중)', () => {
    expect(target?.keywords).toContain('여러');
    expect(target?.keywords).toContain('출결');
    expect(target?.keywords).toContain('일괄');
    expect(target?.keywords).toContain('다중');
  });

  it('실제 사용자 케이스 검색 — "교외체험학습" 매치', () => {
    expect(target).toBeDefined();
    if (!target) return;
    expect(matchesQuery(target, '교외체험학습')).toBe(true);
  });

  it('"결석" 키워드 매치', () => {
    expect(target).toBeDefined();
    if (!target) return;
    expect(matchesQuery(target, '결석')).toBe(true);
  });

  it('run() 호출 시 intent 설정 + homeroom 라우팅', () => {
    expect(target).toBeDefined();
    if (!target) return;

    // intent store 초기화
    useMultiDateAttendanceIntentStore.getState().consume();
    expect(useMultiDateAttendanceIntentStore.getState().pending).toBe(false);

    onNavigate.mockClear();
    target.run();

    // intent pending 으로 전환됨
    expect(useMultiDateAttendanceIntentStore.getState().pending).toBe(true);
    expect(useMultiDateAttendanceIntentStore.getState().preferredMode).toBe('multi');
    // homeroom 페이지로 navigate
    expect(onNavigate).toHaveBeenCalledWith('homeroom');

    // cleanup
    useMultiDateAttendanceIntentStore.getState().consume();
  });
});
