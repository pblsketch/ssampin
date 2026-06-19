import { describe, it, expect } from 'vitest';
import { parseScoringRubrics, subjectByCode } from './scoringRubricParser';

/*
 * 픽스처는 온양여고 "2026학년도 1학기 3학년 …(1차).pdf"의 실제 채점기준표 2개 레이아웃을
 * kordoc 변환 형식(HTML <table> + rowspan/colspan) 그대로 모사한다(§12 — 실학교 의존 금지).
 * - 가정과: 헤더 [평가 요소(colspan2) | 배점 | 채점 기준(colspan5) | 끝 점수열]
 * - 정보과: 헤더 [평가항목 | 평가요소 | 채점기준(colspan5) | 평가척도 | 배점]
 */

/** 가정과 — 성취기준표(코드 [12가정…]) + 항목명 "가. 진로 설계 발표" + 채점기준표 */
const FIXTURE_GAJEONG = `
## 가. 진로 설계 발표

1) 성취 기준 및 성취 수준(평가기준)

<table>
<tr><th>성취 기준</th><th colspan="2">성취 수준(평가기준)</th></tr>
<tr><td rowspan="3">[12가정-01-03]<br>개인 및 가족의 발달 지원과 관련한 직업의 세계를 탐색한다.</td><td>상</td><td>직업의 세계를 탐색하고 진로를 설계할 수 있다.</td></tr>
<tr><td>중</td><td>직업의 세계를 탐색하여 진로설계에 반영할 수 있다.</td></tr>
<tr><td>하</td><td>직업의 세계와 요구 능력을 찾아 설명할 수 있다.</td></tr>
</table>

<table>
<tr><th>평가시기</th><th colspan="3">3~6월</th><th>반영비율</th><th>50%</th><th>영역만점</th><th colspan="3">100점</th></tr>
<tr><td>교과 역량</td><td colspan="9">☑ 관계형성 역량 ☑ 기술활용 역량</td></tr>
<tr><td>평가 방법</td><td colspan="9">☑ 프로젝트 ☑ 조사·발표 ☑ 관찰평가</td></tr>
<tr><td rowspan="11">평가 요소및<br>채점 기준</td><td colspan="2">평가 요소</td><td>배점</td><td colspan="5">채점 기준</td><td rowspan="11"></td></tr>
<tr><td rowspan="6">발표내용</td><td rowspan="3">교과내용</td><td rowspan="3">15</td><td colspan="4">진로 소개와 관련된 내용을 모두 설명한 경우</td><td>15</td></tr>
<tr><td colspan="4">한 가지만 설명한 경우</td><td>10</td></tr>
<tr><td colspan="4">모두 설명하지 않은 경우</td><td>5</td></tr>
<tr><td rowspan="3">주제발표</td><td rowspan="3">15</td><td colspan="4">자유 주제와 느낀 점을 모두 설명한 경우</td><td>15</td></tr>
<tr><td colspan="4">한 가지만 설명한 경우</td><td>10</td></tr>
<tr><td colspan="4">모두 설명하지 않은 경우</td><td>5</td></tr>
<tr><td colspan="2" rowspan="3">발표 태도</td><td rowspan="3">20</td><td colspan="4">발표 태도가 적절한 경우</td><td>20</td></tr>
<tr><td colspan="4">대본이 있고 적절한 경우</td><td>15</td></tr>
<tr><td colspan="4">대본이 있고 적절하지 않은 경우</td><td>10</td></tr>
<tr><td>유의점</td><td colspan="9">-사전에 채점 기준을 안내한다.</td></tr>
</table>
`;

/** 정보과 — 성취기준표(코드 [12정연…]) + 평가척도 열이 있는 채점기준표 */
const FIXTURE_JEONGBO = `
나. 피지컬 컴퓨팅 프로젝트

1) 성취 기준 및 성취 수준(평가기준)

<table>
<tr><th>성취 기준</th><th colspan="2">성취 수준(평가기준)</th></tr>
<tr><td rowspan="2">[12정연02-01]<br>자기 주도적으로 정보 과제 연구의 전과정을 수행할 수 있다.</td><td>A</td><td>전 과정을 구체적으로 수행할 수 있다.</td></tr>
<tr><td>B</td><td>전 과정을 대략적으로 수행할 수 있다.</td></tr>
</table>

<table>
<tr><th>평가시기</th><th colspan="2">6월 1주~6월 4주</th><th>반영비율</th><th colspan="2">50%</th><th>영역만점</th><th colspan="4">100점</th></tr>
<tr><td>교과 역량</td><td colspan="10">☑ 컴퓨팅 사고력 ☑ 디지털 문화 소양</td></tr>
<tr><td>평가 방법</td><td colspan="10">☑ 구술･발표 ☑ 프로젝트 ☑ 포트폴리오</td></tr>
<tr><td rowspan="11">평가 요소및<br>채점 기준</td><td>평가항목</td><td>평가요소</td><td colspan="5">채점기준</td><td>평가척도</td><td>배점</td><td rowspan="11"></td></tr>
<tr><td rowspan="5">피지컬컴퓨팅시스템설계및구현</td><td rowspan="5">센서및제어장치활용</td><td colspan="2" rowspan="5">§ 문제를 탐색하였는가?<br>§ 시스템을 설계하였는가?</td><td colspan="3">평가 요소 4가지 항목을 충족함.</td><td>30</td><td colspan="2" rowspan="5">30</td></tr>
<tr><td colspan="3">평가 요소 3가지 항목을 충족함.</td><td>25</td></tr>
<tr><td colspan="3">평가 요소 2가지 항목을 충족함.</td><td>20</td></tr>
<tr><td colspan="3">평가 요소 1가지 항목을 충족함.</td><td>15</td></tr>
<tr><td colspan="3">평가 요소를 모두 충족하지 못함.</td><td>10</td></tr>
<tr><td>유의점</td><td colspan="10">-과제는 교과 시간 내 작성하여 제출하도록 함.</td></tr>
</table>
`;

const OPTS = { filename: '2026학년도 1학기 3학년 평가운영계획.pdf', maxGrade: 3 } as const;

describe('subjectByCode', () => {
  it('성취기준 코드 접두사로 과목을 추정한다', () => {
    expect(subjectByCode('[12언매01-01] ... [12언매02-03]')).toBe('언어와 매체');
    expect(subjectByCode('[12가정-01-03] 개인 및 가족')).toBe('기술·가정');
    expect(subjectByCode('[12정연02-01]')).toBe('정보과제연구');
    expect(subjectByCode('성취기준 없음')).toBeNull();
  });
});

describe('parseScoringRubrics — 가정과 레이아웃(끝 점수열)', () => {
  const candidates = parseScoringRubrics(FIXTURE_GAJEONG, OPTS);

  it('채점기준표 1개 → 루브릭 후보 1건, 과목·학년·제목·점수포함', () => {
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.subject).toBe('기술·가정');
    expect(c.grade).toBe(3);
    expect(c.title).toBe('진로 설계 발표');
    expect(c.hasScores).toBe(true);
  });

  it('평가요소 = criterion (교과내용/주제발표/발표 태도)', () => {
    expect(candidates[0]!.criteria.map((c) => c.name)).toEqual([
      '교과내용',
      '주제발표',
      '발표 태도',
    ]);
  });

  it('각 수준의 배점·설명을 추출 (colspan 중복 제거)', () => {
    const gyo = candidates[0]!.criteria.find((c) => c.name === '교과내용')!;
    expect(gyo.levels.map((l) => l.score)).toEqual([15, 10, 5]);
    expect(gyo.levels[0]!.description).toBe('진로 소개와 관련된 내용을 모두 설명한 경우');
    expect(gyo.levels[1]!.description).toBe('한 가지만 설명한 경우');
    const tae = candidates[0]!.criteria.find((c) => c.name === '발표 태도')!;
    expect(tae.levels.map((l) => l.score)).toEqual([20, 15, 10]);
  });
});

describe('parseScoringRubrics — 정보과 레이아웃(평가척도 열)', () => {
  const candidates = parseScoringRubrics(FIXTURE_JEONGBO, OPTS);

  it('과목·제목 + 평가척도 열에서 수준 점수 추출', () => {
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.subject).toBe('정보과제연구');
    expect(c.title).toBe('피지컬 컴퓨팅 프로젝트');
    expect(c.criteria.map((x) => x.name)).toEqual(['센서및제어장치활용']);
  });

  it('수준 설명은 행마다 달라지는 채점기준만(공통 질문 목록 제외)', () => {
    const cri = candidates[0]!.criteria[0]!;
    expect(cri.levels.map((l) => l.score)).toEqual([30, 25, 20, 15, 10]);
    expect(cri.levels[0]!.description).toBe('평가 요소 4가지 항목을 충족함.');
    expect(cri.levels[4]!.description).toBe('평가 요소를 모두 충족하지 못함.');
  });
});

describe('parseScoringRubrics — 폴백', () => {
  it('채점기준표가 없으면 빈 배열', () => {
    expect(parseScoringRubrics('# 일반 문서\n본문만 있음')).toEqual([]);
    expect(parseScoringRubrics('')).toEqual([]);
  });
});

describe('parseScoringRubrics — 정확도 개선(①②③)', () => {
  it('① 섹션 헤딩 [과목명]이 성취기준 코드 약칭을 덮어쓴다', () => {
    // 헤딩이 "공통국어1", 성취기준 코드는 가정(→기술·가정). 헤딩이 우선해야 함.
    const md = '2026학년도 1학년 1학기 [공통국어1]\n' + FIXTURE_GAJEONG;
    const c = parseScoringRubrics(md, OPTS);
    expect(c[0]!.subject).toBe('공통국어1');
  });

  // ②(수행평가)○○ 제목 + ③ §-목록 평가요소 → 왼쪽 그룹 라벨('적절성')을 이름으로
  const FIXTURE_FACET = `
(수행평가) 매체 비평하기
[12언매03-01] 매체 분석

<table>
<tr><th>평가시기</th><th>3월</th><th>반영비율</th><th>30%</th><th>영역만점</th><th>100점</th></tr>
<tr><td rowspan="4">평가 요소및<br>채점 기준</td><td>평가항목</td><td>평가요소</td><td>채점기준</td><td>평가척도</td><td>배점</td><td></td></tr>
<tr><td rowspan="3">적절성</td><td rowspan="3">§ 현실적 문제해결<br>§ 논리설계<br>§ 창의성</td><td>3가지 포함</td><td>30</td><td rowspan="3">30</td></tr>
<tr><td>2가지 포함</td><td>20</td></tr>
<tr><td>1가지 포함</td><td>10</td></tr>
</table>
`;

  it('② "(수행평가) ○○" 패턴을 제목으로 추출', () => {
    const c = parseScoringRubrics(FIXTURE_FACET, OPTS);
    expect(c).toHaveLength(1);
    expect(c[0]!.subject).toBe('언어와 매체');
    expect(c[0]!.title).toBe('매체 비평하기');
  });

  it('③ §-목록 평가요소는 분리하지 않고 왼쪽 그룹 라벨을 criterion 이름으로', () => {
    const cri = parseScoringRubrics(FIXTURE_FACET, OPTS)[0]!.criteria;
    expect(cri).toHaveLength(1);
    expect(cri[0]!.name).toBe('적절성'); // §-목록(긴 텍스트) 대신 그룹 라벨
    expect(cri[0]!.levels.map((l) => l.score)).toEqual([30, 20, 10]); // 점수밴드 1개 보존(분리 X)
  });
});
