import { describe, it, expect } from 'vitest';
import { extractCurriculumTables } from './curriculumTableExtract';

/**
 * 학교마다 문서 양식이 다르다:
 * - 편제표 단독 hwp(온양여고형): 표들 + "N학년도 입학생" 캡션만.
 * - 학교 교육과정 운영계획 전체 문서(효자고형): 표지 이미지·목차·학사일정·교화 표 등
 *   잡음 속에 편제표가 섞여 있다 → 편제표 표만 골라야 한다.
 */
describe('extractCurriculumTables', () => {
  const 편제표 =
    '<table><tr><th>과목명</th><th>운영학점</th></tr>' +
    '<tr><td>공통국어1</td><td>3</td></tr></table>';
  const 학사일정표 = '<table><tr><th>월</th><th>주</th></tr><tr><td>3</td><td>1</td></tr></table>';
  const 교화표 = '<table><tr><td>교목</td><td>소나무</td></tr></table>';

  it('운영계획 전체 문서에서 편제표 표만 골라낸다', () => {
    const md =
      '![image](image_001.bmp) ![image](image_002.bmp) ## 함께 성장하는 행복한 학교\n' +
      '| # 차 례 | --- | 학사일정 8 |\n' +
      교화표 +
      '\n2025학년도 입학생 교육과정 편제표 (1학년)\n' +
      편제표 +
      '\n## 학사일정\n' +
      학사일정표;
    const r = extractCurriculumTables(md);
    expect(r.found).toBe(true);
    expect(r.markdown).toContain('공통국어1');
    expect(r.markdown).toContain('2025학년도 입학생 교육과정 편제표 (1학년)');
    expect(r.markdown).not.toContain('소나무'); // 교화 표 제외
    expect(r.markdown).not.toContain('image_001'); // 이미지 자리표시 제외
    expect(r.markdown).not.toContain('차 례'); // 목차 잔해 제외
  });

  it('입학연도별 여러 편제표를 캡션과 함께 모두 보존한다', () => {
    const md =
      '1. 2024학년도 입학생\n' +
      '<table><tr><td>과목</td><td>단위</td></tr><tr><td>국어</td><td>8</td></tr></table>\n' +
      '3. 2025학년도 입학생\n' +
      '<table><tr><td>과목</td><td>학점</td></tr><tr><td>공통국어1</td><td>3</td></tr></table>';
    const r = extractCurriculumTables(md);
    expect(r.found).toBe(true);
    expect(r.markdown).toContain('2024학년도 입학생');
    expect(r.markdown).toContain('2025학년도 입학생');
    expect(r.markdown).toContain('국어');
    expect(r.markdown).toContain('공통국어1');
  });

  it('중첩표(택N 박스)가 있는 편제표를 부모 표째로 유지한다', () => {
    const md =
      '<table><tr><td>과목명</td><td>운영학점</td></tr>' +
      '<tr><td>물리학Ⅰ</td><td><table><tr><th>택2</th></tr><tr><td>4</td></tr></table></td></tr>' +
      '</table>';
    const r = extractCurriculumTables(md);
    expect(r.found).toBe(true);
    // 최상위 표 1개로 인식(중첩표 분리 안 됨) — 표 전체가 그대로 남는다
    expect(r.markdown.match(/<table/g)).toHaveLength(2);
    expect(r.markdown).toContain('택2');
  });

  it('편제표 후보가 없으면 found=false + 이미지 잡음만 제거한 원문을 준다', () => {
    const md = '![image](cover.jpg) 학교 소개 문서\n' + 교화표;
    const r = extractCurriculumTables(md);
    expect(r.found).toBe(false);
    expect(r.markdown).not.toContain('cover.jpg');
    expect(r.markdown).toContain('학교 소개 문서');
    expect(r.markdown).toContain('소나무'); // 원문 표는 유지
  });

  it('표가 아예 없는 문서도 found=false 로 안전 처리', () => {
    const r = extractCurriculumTables('텍스트만 있는 문서');
    expect(r.found).toBe(false);
    expect(r.markdown).toContain('텍스트만 있는 문서');
  });

  /**
   * PDF 변환(kordoc)은 같은 행에서 과목명 셀은 <br> 을 보존하면서
   * 학점("445")·과목유형("공통공통") 셀은 줄바꿈을 잃고 값을 붙인다(경기북과학고 실문서 확인).
   * 행의 줄 수를 문맥으로 삼아 복원한다.
   */
  describe('PDF 줄바꿈 소실 복원', () => {
    it('과목명 3줄 행의 "445" 학점을 4/4/5 로 복원하고, 계 행의 "109" 는 안 건드린다', () => {
      const md =
        '<table><tr><td>과목명</td><td>기준학점</td></tr>' +
        '<tr><td>공통국어1<br>공통국어2<br>독서</td><td>445</td></tr>' +
        '<tr><td>계</td><td>109</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.found).toBe(true);
      expect(r.markdown).toContain('<td>4<br>4<br>5</td>');
      expect(r.markdown).toContain('<td>109</td>'); // 진짜 합계는 그대로
    });

    it('과목유형 "공통공통일반" 을 3줄로 복원한다', () => {
      const md =
        '<table><tr><td>과목명</td><td>과목유형</td><td>단위</td></tr>' +
        '<tr><td>통합과학1<br>통합과학2<br>물리학</td><td>공통공통일반</td><td>3<br>3<br>4</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td>공통<br>공통<br>일반</td>');
    });

    it('2줄 행의 두 자리 숫자는 합계와 모호하므로 건드리지 않는다', () => {
      const md =
        '<table><tr><td>과목명</td><td>학점</td></tr>' +
        '<tr><td>공통국어1<br>공통국어2</td><td>12</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td>12</td>');
    });

    it('자릿수가 줄 수와 다른 숫자는 건드리지 않는다', () => {
      const md =
        '<table><tr><td>과목명</td><td>학점</td></tr>' +
        '<tr><td>수학1<br>수학2<br>대수</td><td>15</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td>15</td>');
    });

    it('중첩표가 걸친 행은 복원 대상에서 제외한다', () => {
      const md =
        '<table><tr><td>과목명<br>단위</td>' +
        '<td><table><tr><td>택2</td></tr></table>445</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('445'); // 그대로 유지 (쪼개지 않음)
    });

    it('과목명 줄까지 붙은 행은 rowspan(하위 행 수)으로 복원한다 — 경기북과학고 과학 18과목', () => {
      // 과목명은 17줄(두 과목이 한 줄로 붙음)이지만 rowspan=18 이 진짜 과목 수
      const 과목명17줄 = Array.from({ length: 17 }, (_, i) => `과목${i + 1}`).join('<br>');
      const md =
        '<table><tr><th>과목명</th><th>기준학점</th></tr>' +
        `<tr><td rowspan="18">${과목명17줄}</td><td rowspan="18">444444444444444444</td></tr>` +
        '<tr><td>공통</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain(`<td rowspan="18">${'4<br>'.repeat(17)}4</td>`);
    });

    it('학기별 열처럼 자릿수<rowspan 인 4자리 이상 뭉침도 목록으로 분리한다', () => {
      const md =
        '<table><tr><th>과목명</th><th>1학기</th></tr>' +
        '<tr><td rowspan="18">통합과학1<br>통합과학2</td><td rowspan="18">332222</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td rowspan="18">3<br>3<br>2<br>2<br>2<br>2</td>');
    });

    it('0/9 가 섞인 진짜 숫자(합계 109·192, 연도 2026)는 rowspan 이 커도 안 쪼갠다', () => {
      const md =
        '<table><tr><th>과목명</th><th>이수학점</th></tr>' +
        '<tr><td rowspan="3">국어<br>수학<br>영어</td><td rowspan="3">109</td></tr>' +
        '<tr><td rowspan="4">a<br>b<br>c<br>d</td><td rowspan="4">2026</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td rowspan="3">109</td>');
      expect(r.markdown).toContain('<td rowspan="4">2026</td>');
    });

    it('과목유형 뭉침은 토큰 수가 rowspan 보다 작아도(하위 행 일부만) 분리한다', () => {
      const md =
        '<table><tr><th>과목명</th><th>과목유형</th></tr>' +
        '<tr><td rowspan="8">국어<br>수학</td><td>공통공통</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td>공통<br>공통</td>');
    });

    it('교과(군) 뭉침("국어수학영어한국사"·"사회과학")을 어휘로 분리한다', () => {
      const md =
        '<table><tr><th>교과(군)</th><th>과목명</th></tr>' +
        '<tr><td rowspan="9">국어수학영어한국사</td><td rowspan="9">영어Ⅰ<br>영어Ⅱ</td></tr>' +
        '<tr><td rowspan="4">사회과학</td><td rowspan="4">통합사회<br>물리학Ⅱ</td></tr></table>';
      const r = extractCurriculumTables(md);
      expect(r.markdown).toContain('<td rowspan="9">국어<br>수학<br>영어<br>한국사</td>');
      expect(r.markdown).toContain('<td rowspan="4">사회<br>과학</td>');
    });

    it('어휘로 완전히 나눠지지 않는 과목명 뭉침("국어문학독서수학")은 건드리지 않는다', () => {
      const md =
        '<table><tr><th>교과</th><th>과목명</th></tr>' +
        '<tr><td rowspan="4">기초</td><td rowspan="4">국어문학독서수학</td></tr></table>';
      const r = extractCurriculumTables(md);
      // '문학'·'독서'는 교과군 어휘가 아니므로 전부-아니면-무 원칙에 따라 그대로 둔다
      expect(r.markdown).toContain('<td rowspan="4">국어문학독서수학</td>');
    });
  });
});
