import { describe, it, expect } from 'vitest';
import { parseEvaluationPlan } from './evaluationTableParser';

/*
 * 픽스처는 kordoc 변환 출력 형식을 모사한다(§12 — 실학교 네트워크 의존 금지):
 * - 병합 셀 표 → HTML <table> + rowspan/colspan
 * - 단순 표 → GFM 파이프 표
 * - 캡션(학년/과목)은 표 앞 문단 텍스트
 */

/** 분리형(A): 한 학년·한 과목, rowspan 으로 영역 병합 */
const FIXTURE_SINGLE_SUBJECT = `
## ○○중학교 1학년 국어과 평가 운영 계획

<table>
<tr><th>평가 영역</th><th>평가 요소</th><th>반영 비율</th><th>평가 시기</th><th>평가 방법</th></tr>
<tr><td rowspan="2">말하기·듣기</td><td>토의 참여</td><td>20%</td><td>1학기</td><td>관찰</td></tr>
<tr><td>발표</td><td>10%</td><td>1학기</td><td>관찰</td></tr>
<tr><td>읽기</td><td>비문학 독해</td><td>30%</td><td>2학기</td><td>지필</td></tr>
<tr><td>쓰기</td><td>설득하는 글쓰기</td><td>40%</td><td>2학기</td><td>논술</td></tr>
</table>
`;

/** 통합형(B): 한 문서에 여러 학년/과목 (과목별 상세표 + 학년 캡션) */
const FIXTURE_INTEGRATED = `
# △△고등학교 평가 운영 계획

## 1학년 국어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th><th>평가 방법</th></tr>
<tr><td>화법</td><td>20%</td><td>관찰</td></tr>
<tr><td>독서</td><td>40%</td><td>지필</td></tr>
<tr><td>작문</td><td>40%</td><td>논술</td></tr>
</table>

## 1학년 수학 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th><th>평가 방법</th></tr>
<tr><td>수와 연산</td><td>30%</td><td>지필</td></tr>
<tr><td>문자와 식</td><td>30%</td><td>지필</td></tr>
<tr><td>함수</td><td>40%</td><td>수행</td></tr>
</table>

## 2학년 영어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th><th>평가 방법</th></tr>
<tr><td>듣기</td><td>30%</td><td>지필</td></tr>
<tr><td>읽기</td><td>30%</td><td>지필</td></tr>
<tr><td>말하기</td><td>40%</td><td>수행</td></tr>
</table>
`;

/** 종합표(B): 교과 열이 있는 한 표에 여러 과목 */
const FIXTURE_OVERVIEW = `
## □□중학교 1학년 교과별 평가 운영 계획 종합

<table>
<tr><th>교과</th><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>국어</td><td>듣기·말하기</td><td>20%</td></tr>
<tr><td>국어</td><td>쓰기</td><td>30%</td></tr>
<tr><td>수학</td><td>도형</td><td>25%</td></tr>
<tr><td>영어</td><td>말하기</td><td>15%</td></tr>
</table>
`;

/** GFM 단순 표 (분리형) */
const FIXTURE_GFM = `
## ○○중학교 3학년 사회과 평가 운영 계획

| 평가영역 | 반영비율 | 평가방법 |
| --- | --- | --- |
| 정치 | 30% | 서술형 |
| 경제 | 30% | 보고서 |
| 사회·문화 | 40% | 논술 |
`;

/** 이미지/스캔 문서 (본문 거의 없음) */
const FIXTURE_IMAGE = `
(스캔된 이미지 문서 — 추출된 텍스트가 거의 없습니다)
`;

/** 비평가표(편제·시수표) — 평가 키워드 없음 → 무시되어야 */
const FIXTURE_NON_EVAL = `
## 1학년 교육과정 편제표

<table>
<tr><th>교과</th><th>이수 단위</th><th>학기</th></tr>
<tr><td>국어</td><td>4</td><td>1학기</td></tr>
<tr><td>수학</td><td>4</td><td>1학기</td></tr>
</table>
`;

describe('parseEvaluationPlan — 분리형(A)', () => {
  it('한 학년·한 과목의 평가영역을 추출하고 isSingleSubject=true', () => {
    const { grades, isSingleSubject } = parseEvaluationPlan(FIXTURE_SINGLE_SUBJECT);
    expect(isSingleSubject).toBe(true);
    expect(grades).toHaveLength(1);
    const g = grades[0]!;
    expect(g.grade).toBe(1);
    expect(g.label).toBe('1학년');
    expect(g.subjects).toEqual(['국어']);
    const areas = g.areasBySubject['국어']!;
    expect(areas.map((a) => a.name)).toEqual(['말하기·듣기', '읽기', '쓰기']);
  });

  it('반영비율·학기를 함께 추출하고 rowspan 영역명 중복을 제거', () => {
    const { grades } = parseEvaluationPlan(FIXTURE_SINGLE_SUBJECT);
    const areas = grades[0]!.areasBySubject['국어']!;
    const speak = areas.find((a) => a.name === '말하기·듣기')!;
    expect(speak.ratio).toBe('20%'); // rowspan 첫 행의 비율
    expect(speak.semester).toBe('1');
    const read = areas.find((a) => a.name === '읽기')!;
    expect(read.semester).toBe('2');
  });
});

describe('parseEvaluationPlan — 통합형(B)', () => {
  it('여러 학년/과목을 분해하고 isSingleSubject=false', () => {
    const { grades, isSingleSubject } = parseEvaluationPlan(FIXTURE_INTEGRATED);
    expect(isSingleSubject).toBe(false);

    const g1 = grades.find((g) => g.grade === 1)!;
    expect(g1).toBeDefined();
    expect(g1.subjects).toEqual(['국어', '수학']);
    expect(g1.areasBySubject['국어']!.map((a) => a.name)).toEqual(['화법', '독서', '작문']);
    expect(g1.areasBySubject['수학']!.map((a) => a.name)).toEqual([
      '수와 연산',
      '문자와 식',
      '함수',
    ]);

    const g2 = grades.find((g) => g.grade === 2)!;
    expect(g2.subjects).toEqual(['영어']);
    expect(g2.areasBySubject['영어']!.map((a) => a.name)).toEqual(['듣기', '읽기', '말하기']);
  });

  it('학년 오름차순 정렬', () => {
    const { grades } = parseEvaluationPlan(FIXTURE_INTEGRATED);
    expect(grades.map((g) => g.grade)).toEqual([1, 2]);
  });
});

describe('parseEvaluationPlan — 종합표(교과 열)', () => {
  it('교과 열로 과목별 영역을 그룹화', () => {
    const { grades, isSingleSubject } = parseEvaluationPlan(FIXTURE_OVERVIEW);
    expect(isSingleSubject).toBe(false);
    const g = grades.find((g) => g.grade === 1)!;
    expect(g.subjects).toEqual(['국어', '수학', '영어']);
    expect(g.areasBySubject['국어']!.map((a) => a.name)).toEqual(['듣기·말하기', '쓰기']);
    expect(g.areasBySubject['수학']!.map((a) => a.name)).toEqual(['도형']);
    expect(g.areasBySubject['영어']!.map((a) => a.name)).toEqual(['말하기']);
  });
});

describe('parseEvaluationPlan — GFM 파이프 표', () => {
  it('단순 GFM 표에서 평가영역·비율을 추출', () => {
    const { grades, isSingleSubject } = parseEvaluationPlan(FIXTURE_GFM);
    expect(isSingleSubject).toBe(true);
    const g = grades[0]!;
    expect(g.grade).toBe(3);
    expect(g.subjects).toEqual(['사회']);
    const areas = g.areasBySubject['사회']!;
    expect(areas.map((a) => a.name)).toEqual(['정치', '경제', '사회·문화']);
    expect(areas[0]!.ratio).toBe('30%');
    expect(areas[0]!.semester).toBeUndefined(); // 학기 열 없음
  });
});

describe('parseEvaluationPlan — 폴백/방어 (AC4·AC7)', () => {
  it('이미지/빈 문서는 grades=[] (뷰어 폴백)', () => {
    expect(parseEvaluationPlan(FIXTURE_IMAGE).grades).toEqual([]);
    expect(parseEvaluationPlan('').grades).toEqual([]);
  });

  it('평가표가 아닌 편제표는 무시', () => {
    const { grades } = parseEvaluationPlan(FIXTURE_NON_EVAL);
    expect(grades).toEqual([]);
  });

  it('과대 문서는 구조화하지 않고 폴백', () => {
    const huge = '평가영역 ' + 'x'.repeat(3_000_001);
    expect(parseEvaluationPlan(huge).grades).toEqual([]);
  });

  it('합계/잔여 헤더 행은 영역으로 채택하지 않음', () => {
    const md = `
## 1학년 과학 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>물질</td><td>30%</td></tr>
<tr><td>에너지</td><td>40%</td></tr>
<tr><td>합계</td><td>100%</td></tr>
</table>`;
    const { grades } = parseEvaluationPlan(md);
    const areas = grades[0]!.areasBySubject['과학']!;
    expect(areas.map((a) => a.name)).toEqual(['물질', '에너지']);
  });

  it('유의점/비고 등 비-영역 값은 평가영역으로 채택하지 않음', () => {
    const md = `
## 1학년 국어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>읽기</td><td>50%</td></tr>
<tr><td>유의점</td><td>-</td></tr>
<tr><td>비고</td><td>-</td></tr>
</table>`;
    const { grades } = parseEvaluationPlan(md);
    expect(grades[0]!.areasBySubject['국어']!.map((a) => a.name)).toEqual(['읽기']);
  });
});

describe('parseEvaluationPlan — 학년 추출 방어 (학년도 오인·학교급 클램프·파일명)', () => {
  it('"2026학년도"(academic year)를 6학년으로 오인하지 않는다 (고등학교 2학년 통합 파일)', () => {
    const md = `
2026학년도 1학기 2학년 교과 교수학습 및 평가운영계획(수정)

## 2학년 국어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>읽기</td><td>40%</td></tr>
<tr><td>쓰기</td><td>60%</td></tr>
</table>`;
    const { grades } = parseEvaluationPlan(md, { maxGrade: 3 });
    expect(grades).toHaveLength(1);
    expect(grades[0]!.grade).toBe(2);
    expect(grades[0]!.label).toBe('2학년');
  });

  it('중·고(maxGrade=3)에서는 범위 밖 6학년 언급을 학년으로 채택하지 않는다', () => {
    const md = `
## 초등 6학년 과정과 연계한 1학년 국어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>듣기</td><td>50%</td></tr>
<tr><td>말하기</td><td>50%</td></tr>
</table>`;
    const { grades } = parseEvaluationPlan(md, { maxGrade: 3 });
    expect(grades[0]!.grade).toBe(1);
  });

  it('캡션에 학년이 없으면 파일명 학년("2학년")을 사용한다', () => {
    const md = `
## 국어 평가 운영 계획
<table>
<tr><th>평가 영역</th><th>반영 비율</th></tr>
<tr><td>읽기</td><td>100%</td></tr>
</table>`;
    const { grades } = parseEvaluationPlan(md, {
      filename: '2026학년도 2학년 평가계획.pdf',
      maxGrade: 3,
    });
    expect(grades[0]!.grade).toBe(2);
  });
});
