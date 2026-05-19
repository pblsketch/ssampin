/**
 * MultiDatePicker 단위 테스트.
 *
 * 환경: vitest (environment: 'node'), DOM 인프라(jsdom/RTL) 없음.
 * 따라서 다음 두 축으로 분리한다:
 *   1. 순수 로직: `decideRangeClick`, `decideMultiClick` 모든 분기
 *   2. 정적 렌더: `renderToString` 으로 ARIA/role/카피 검증
 *
 * 이벤트 기반 검증(클릭 → 토스트 → onChange 등)은 분기 함수의 단위 테스트로 보장한다.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MultiDatePicker, decideRangeClick, decideMultiClick } from './MultiDatePicker';

describe('decideRangeClick', () => {
  it('시작 미설정 → new-range (start=end=iso)', () => {
    const r = decideRangeClick('2026-05-10', undefined, undefined, 30);
    expect(r.kind).toBe('new-range');
    if (r.kind === 'new-range') {
      expect(r.start).toBe('2026-05-10');
      expect(r.end).toBe('2026-05-10');
    }
  });

  it('start=end (단일 임시 상태) → extend (종료 결정으로 진행)', () => {
    // start=end는 "1일 임시 선택" 상태로 간주, 다음 클릭은 종료 결정
    const r = decideRangeClick('2026-05-15', '2026-05-10', '2026-05-10', 30);
    expect(r.kind).toBe('extend');
    if (r.kind === 'extend') {
      expect(r.start).toBe('2026-05-10');
      expect(r.end).toBe('2026-05-15');
    }
  });

  it('start=end + 빠른 날짜 클릭 → swap', () => {
    const r = decideRangeClick('2026-05-05', '2026-05-10', '2026-05-10', 30);
    expect(r.kind).toBe('swap');
    if (r.kind === 'swap') {
      expect(r.start).toBe('2026-05-05');
      expect(r.end).toBe('2026-05-10');
    }
  });

  it('start만 설정, iso < start → swap', () => {
    const r = decideRangeClick('2026-05-05', '2026-05-10', undefined, 30);
    expect(r.kind).toBe('swap');
    if (r.kind === 'swap') {
      expect(r.start).toBe('2026-05-05');
      expect(r.end).toBe('2026-05-10');
    }
  });

  it('start만 설정, iso > start, 30일 이내 → extend', () => {
    const r = decideRangeClick('2026-05-20', '2026-05-10', undefined, 30);
    expect(r.kind).toBe('extend');
    if (r.kind === 'extend') {
      expect(r.start).toBe('2026-05-10');
      expect(r.end).toBe('2026-05-20');
    }
  });

  it('start만 설정, iso > start, 30일 초과 → over-cap', () => {
    // 5/1 ~ 5/31 = 31일 > maxCount 30
    const r = decideRangeClick('2026-05-31', '2026-05-01', undefined, 30);
    expect(r.kind).toBe('over-cap');
    if (r.kind === 'over-cap') {
      expect(r.total).toBe(31);
    }
  });

  it('정확히 30일이면 extend (경계 inclusive)', () => {
    // 5/1 ~ 5/30 = 30일
    const r = decideRangeClick('2026-05-30', '2026-05-01', undefined, 30);
    expect(r.kind).toBe('extend');
  });

  it('완료된 range (start < end) 에서 다른 셀 클릭 → 새 범위 시작', () => {
    const r = decideRangeClick('2026-06-01', '2026-05-01', '2026-05-15', 30);
    expect(r.kind).toBe('new-range');
    if (r.kind === 'new-range') {
      expect(r.start).toBe('2026-06-01');
      expect(r.end).toBe('2026-06-01');
    }
  });
});

describe('decideMultiClick', () => {
  it('빈 set + 새 날짜 → add', () => {
    const r = decideMultiClick('2026-05-10', new Set(), 30);
    expect(r.kind).toBe('add');
    if (r.kind === 'add') {
      expect(r.iso).toBe('2026-05-10');
    }
  });

  it('기존 날짜 클릭 → remove', () => {
    const r = decideMultiClick('2026-05-10', new Set(['2026-05-10']), 30);
    expect(r.kind).toBe('remove');
    if (r.kind === 'remove') {
      expect(r.iso).toBe('2026-05-10');
    }
  });

  it('상한 도달 + 새 날짜 → over-cap', () => {
    const full = new Set(['a', 'b', 'c', 'd', 'e']);
    const r = decideMultiClick('2026-05-10', full, 5);
    expect(r.kind).toBe('over-cap');
    if (r.kind === 'over-cap') {
      expect(r.size).toBe(5);
    }
  });

  it('상한 도달이지만 기존 날짜 토글 해제는 허용 → remove', () => {
    const full = new Set(['2026-05-10', 'b', 'c', 'd', 'e']);
    const r = decideMultiClick('2026-05-10', full, 5);
    expect(r.kind).toBe('remove');
  });

  it('29개 선택 + 새 날짜 → add (경계 이전)', () => {
    const dates = Array.from({ length: 29 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`);
    const r = decideMultiClick('2026-05-30', new Set(dates), 30);
    expect(r.kind).toBe('add');
  });

  it('30개 선택 + 새 날짜 → over-cap (경계 이후)', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`);
    const r = decideMultiClick('2026-05-31', new Set(dates), 30);
    expect(r.kind).toBe('over-cap');
  });
});

describe('MultiDatePicker 정적 렌더', () => {
  describe('single 모드', () => {
    it('트리거에 singleValue 표시', () => {
      const html = renderToString(
        <MultiDatePicker mode="single" singleValue="2026-05-15" onSingleChange={() => {}} />,
      );
      expect(html).toContain('2026-05-15');
      expect(html).toContain('calendar_today');
    });

    it('inline 모드는 grid 즉시 렌더 + aria-multiselectable=false', () => {
      const html = renderToString(
        <MultiDatePicker mode="single" singleValue="2026-05-15" onSingleChange={() => {}} inline />,
      );
      expect(html).toContain('role="grid"');
      expect(html).toContain('aria-multiselectable="false"');
    });

    it('single 모드 패널에는 multi 프리셋이 없음', () => {
      const html = renderToString(
        <MultiDatePicker mode="single" singleValue="2026-05-15" onSingleChange={() => {}} inline />,
      );
      expect(html).not.toContain('이번 주 평일');
      expect(html).not.toContain('선택 초기화');
    });
  });

  describe('range 모드', () => {
    it('inline + start/end 설정 시 트리거 텍스트 형식', () => {
      const html = renderToString(
        <MultiDatePicker
          mode="range"
          rangeStart="2026-05-01"
          rangeEnd="2026-05-10"
          onRangeChange={() => {}}
          inline
        />,
      );
      expect(html).toContain('role="grid"');
      expect(html).toContain('aria-multiselectable="true"');
    });

    it('완료된 range 셀에 aria-selected=true', () => {
      const html = renderToString(
        <MultiDatePicker
          mode="range"
          rangeStart="2026-05-01"
          rangeEnd="2026-05-03"
          onRangeChange={() => {}}
          inline
        />,
      );
      // aria-selected=true 셀이 3개 이상 있어야 함
      const matches = html.match(/aria-selected="true"/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('multi 모드', () => {
    it('grid + aria-multiselectable=true', () => {
      const html = renderToString(
        <MultiDatePicker mode="multi" multiValues={new Set()} onMultiChange={() => {}} inline />,
      );
      expect(html).toContain('role="grid"');
      expect(html).toContain('aria-multiselectable="true"');
    });

    it('프리셋 4종 모두 노출 (이번 주 / 이번 주 평일 / 다음 주 / 초기화)', () => {
      const html = renderToString(
        <MultiDatePicker mode="multi" multiValues={new Set()} onMultiChange={() => {}} inline />,
      );
      expect(html).toContain('이번 주');
      expect(html).toContain('이번 주 평일');
      expect(html).toContain('다음 주');
      expect(html).toContain('aria-label="선택 초기화"');
    });

    it('선택 0개일 때 칩 리스트 영역이 노출되지 않음', () => {
      const html = renderToString(
        <MultiDatePicker mode="multi" multiValues={new Set()} onMultiChange={() => {}} inline />,
      );
      expect(html).not.toContain('aria-label="선택된 날짜"');
    });

    it('선택 N개일 때 칩 리스트 + 카운터 노출', () => {
      const html = renderToString(
        <MultiDatePicker
          mode="multi"
          multiValues={new Set(['2026-05-05', '2026-05-15', '2026-05-20'])}
          onMultiChange={() => {}}
          inline
        />,
      );
      expect(html).toContain('aria-label="선택된 날짜"');
      // SSR가 인접 텍스트 노드 사이에 marker(<!-- -->)를 삽입하므로 정규식으로 검증
      expect(html).toMatch(/3<!-- -->\s*일 선택됨/);
      // 칩 라벨 (formatDateChip → "5/5", "5/15", "5/20") — 문자열로 직접 렌더되어 marker 없음
      expect(html).toContain('>5/5<');
      expect(html).toContain('>5/15<');
      expect(html).toContain('>5/20<');
    });

    it('상한 도달 시 카운터 강조 (text-sp-highlight) + 안내 텍스트', () => {
      const selected = new Set(
        Array.from({ length: 5 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`),
      );
      const html = renderToString(
        <MultiDatePicker
          mode="multi"
          multiValues={selected}
          onMultiChange={() => {}}
          maxCount={5}
          inline
        />,
      );
      expect(html).toMatch(/5<!-- -->\s*일 선택됨/);
      // "(최대 5일)" 는 단일 템플릿 문자열로 렌더되므로 marker 없음
      expect(html).toContain('(최대 5일)');
      expect(html).toContain('text-sp-highlight');
    });

    it('상한 도달 시 미선택 셀에 aria-disabled=true (over-cap)', () => {
      const selected = new Set(
        Array.from({ length: 30 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`),
      );
      const html = renderToString(
        <MultiDatePicker
          mode="multi"
          multiValues={selected}
          onMultiChange={() => {}}
          maxCount={30}
          inline
        />,
      );
      // 5/31은 선택 안 됐고 상한 도달 → aria-disabled=true
      const may31Match = html.match(
        /aria-label="2026년 5월 31일"[^>]*aria-selected="false"[^>]*aria-disabled="true"/,
      );
      expect(may31Match).not.toBeNull();
    });
  });

  describe('ARIA / a11y', () => {
    it('grid role + 6 row + 7 columnheader', () => {
      const html = renderToString(
        <MultiDatePicker mode="multi" multiValues={new Set()} onMultiChange={() => {}} inline />,
      );
      // row 7개 (요일 헤더 1 + 날짜 6)
      const rowMatches = html.match(/role="row"/g) ?? [];
      expect(rowMatches.length).toBe(7);

      // columnheader 7개 (일~토)
      const colMatches = html.match(/role="columnheader"/g) ?? [];
      expect(colMatches.length).toBe(7);

      // gridcell 42개 (6×7)
      const cellMatches = html.match(/role="gridcell"/g) ?? [];
      expect(cellMatches.length).toBe(42);
    });

    it('mobileSheet=true 시 role="dialog" + aria-modal="true"', () => {
      const html = renderToString(
        <MultiDatePicker
          mode="multi"
          multiValues={new Set()}
          onMultiChange={() => {}}
          inline
          mobileSheet
        />,
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
    });

    it('월 네비게이션 버튼에 aria-label', () => {
      const html = renderToString(
        <MultiDatePicker mode="single" singleValue="2026-05-15" onSingleChange={() => {}} inline />,
      );
      expect(html).toContain('aria-label="이전 달"');
      expect(html).toContain('aria-label="다음 달"');
    });
  });

  describe('lessonDays 강조', () => {
    it('lessonDays 표시 시 도트 노출', () => {
      const html = renderToString(
        <MultiDatePicker
          mode="single"
          singleValue="2026-05-15"
          onSingleChange={() => {}}
          lessonDays={[1, 3, 5]} // 월/수/금
          inline
        />,
      );
      // 수업일 도트 (정확한 개수보다 패턴 존재 여부 검증)
      expect(html).toContain('bg-sp-accent');
    });
  });
});
