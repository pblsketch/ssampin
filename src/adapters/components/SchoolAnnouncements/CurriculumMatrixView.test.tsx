// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CurriculumMatrixView } from './CurriculumMatrixView';

/**
 * 편제표 hwp → kordoc HTML 표 → React 표 재구성 검증.
 * 실제 학교알리미 편제표는 입학연도별로 표가 나뉘고(2024 / 2025·2026 입학생),
 * 병합셀(rowspan/colspan)·중첩표(선택과목 택N 박스)를 포함한다.
 */
describe('CurriculumMatrixView', () => {
  it('HTML 표를 React 표로 재구성하고 병합셀(rowspan/colspan)을 보존한다', () => {
    const md =
      '1. 2024학년도 입학생\n' +
      '<table><tr><th rowspan="2">구분</th><th colspan="2">1학년</th></tr>' +
      '<tr><td>1학기</td><td>2학기</td></tr></table>';
    const { container } = render(<CurriculumMatrixView markdown={md} />);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelector('th[rowspan="2"]')).not.toBeNull();
    expect(container.querySelector('th[colspan="2"]')).not.toBeNull();
    // 표 사이 텍스트는 소제목으로
    expect(container.textContent).toContain('2024학년도 입학생');
  });

  it('입학연도별 여러 표를 모두 렌더한다', () => {
    const md =
      '1. 2024학년도 입학생\n<table><tr><td>국어</td></tr></table>\n' +
      '3. 2025학년도, 2026학년도 입학생\n<table><tr><td>공통국어1</td></tr></table>';
    const { container } = render(<CurriculumMatrixView markdown={md} />);
    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(container.textContent).toContain('2024학년도 입학생');
    expect(container.textContent).toContain('2025학년도');
    expect(container.textContent).toContain('국어');
    expect(container.textContent).toContain('공통국어1');
  });

  it('선택과목 택N 박스 같은 중첩표를 보존한다', () => {
    const md =
      '<table><tr><td>물리학Ⅰ</td>' +
      '<td><table><tr><th>&lt;학기제 택2&gt;</th></tr><tr><td>4</td></tr></table></td></tr></table>';
    const { container } = render(<CurriculumMatrixView markdown={md} />);
    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(container.textContent).toContain('물리학Ⅰ');
    expect(container.textContent).toContain('택2');
  });

  it('표 이외의 위험 태그(script)는 렌더하지 않는다', () => {
    const md = '<table><tr><td>안전</td></tr></table><script>window.__x=1</script>';
    const { container } = render(<CurriculumMatrixView markdown={md} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('안전');
  });

  it('[포맷: ...] 머리말은 제거한다', () => {
    const md = '[포맷: HWP]\n\n<table><tr><td>편제</td></tr></table>';
    const { container } = render(<CurriculumMatrixView markdown={md} />);
    expect(container.textContent).not.toContain('포맷');
    expect(container.textContent).toContain('편제');
  });
});
