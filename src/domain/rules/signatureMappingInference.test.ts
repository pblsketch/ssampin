import { describe, expect, it } from 'vitest';
import { inferSignatureMappingFromCsv } from './signatureMappingInference';
import { parseCsvLines } from '@domain/utils/parseCsvLines';

const TRAINING_REGISTER_CSV = `연번,소속(학교명),직위,성명,연락처,신청 연수 과정명,출석,수료,서명(정자),비고
1,아산중학교,교사,김국어,010-1234-5678,[학습과학] 인지부하 이론을 적용한 교수학습 설계,,,,
2,온양고등학교,부장교사,이환경,010-2345-6789,[환경교육] 시도 교육청 교수학습자료 활용 방안,,,,
3,천안여자고등학교,수석교사,박마을,010-3456-7890,[마을교육] 마을교육공동체와 학교 교육과정의 연계,,,,
4,배방중학교,교사,최성장,010-4567-8901,[전학공] 교사의 전문성 향상과 수업 나눔,,,,
5,설화고등학교,기간제교사,정독서,010-5678-9012,[학습과학] 인지부하 이론을 적용한 교수학습 설계,,,,
6,충남삼성고등학교,교사,강과학,010-6789-0123,[환경교육] 시도 교육청 교수학습자료 활용 방안,,,,
7,탕정중학교,진로전담,조미래,010-7890-1234,[마을교육] 마을교육공동체와 학교 교육과정의 연계,,,,
8,용화여자고등학교,교사,윤성찰,010-8901-2345,[전학공] 교사의 전문성 향상과 수업 나눔,,,,
9,신창중학교,교감,임리더,010-9012-3456,[전학공] 교사의 전문성 향상과 수업 나눔,,,,
10,온양여자중학교,교사,한소통,010-0123-4567,[학습과학] 인지부하 이론을 적용한 교수학습 설계,,,,
`;

describe('inferSignatureMappingFromCsv', () => {
  it('자동 추론: 연수 등록부 CSV의 헤더에서 매핑·명단·시나리오를 도출한다', () => {
    const { headers, rows } = parseCsvLines(TRAINING_REGISTER_CSV);
    const result = inferSignatureMappingFromCsv({ headers, rows });

    expect(result.suggestedTemplateKind).toBe('training-register');

    // recipientName / studentNumber / className이 자동 식별되어야 함
    const fieldKeys = result.mapping.textFields.map((field) => field.key);
    expect(fieldKeys).toContain('recipientName');
    expect(fieldKeys).toContain('studentNumber');
    expect(fieldKeys).toContain('className');

    // 서명(정자)는 recipient kind으로 매핑되어야 함
    expect(result.mapping.signatureSlots).toHaveLength(1);
    expect(result.mapping.signatureSlots[0]).toMatchObject({
      kind: 'recipient',
      label: '서명(정자)',
      target: { type: 'generated-table-column', value: '서명(정자)' },
    });

    // 직위 컬럼은 role 분류로 잡혀서 textField에 포함되지 않음
    const textLabels = result.mapping.textFields.map((field) => field.label);
    expect(textLabels).not.toContain('직위');

    // 미매칭 헤더는 custom으로 들어가야 함
    expect(textLabels).toContain('연락처');
    expect(textLabels).toContain('신청 연수 과정명');
    expect(textLabels).toContain('출석');
    expect(textLabels).toContain('수료');
    expect(textLabels).toContain('비고');

    // 명단 10명, 모두 teacher role
    expect(result.participants).toHaveLength(10);
    expect(result.participants[0]).toMatchObject({
      displayName: '김국어',
      role: 'teacher',
      studentNumber: 1,
      className: '아산중학교',
      requiredSignatureKinds: ['recipient'],
    });
    expect(result.participants.every((p) => p.role === 'teacher')).toBe(true);
  });

  it('결석계: 학생서명 + 학부모서명 두 컬럼 → absence-form 추정', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['학년반', '번호', '성명', '결석기간', '결석사유', '학생서명', '학부모서명'],
      rows: [['3-2', '1', '홍길동', '5/1~5/3', '감기', '', '']],
    });

    expect(result.suggestedTemplateKind).toBe('absence-form');
    expect(result.mapping.signatureSlots.map((slot) => slot.kind).sort()).toEqual([
      'parent',
      'student',
    ]);
    expect(result.mapping.textFields.find((field) => field.key === 'absencePeriod')).toBeDefined();
    expect(result.mapping.textFields.find((field) => field.key === 'absenceReason')).toBeDefined();
  });

  it('가정통신문: 학부모서명만 → notice-form 추정', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['번호', '성명', '학부모서명'],
      rows: [['1', '김민서', '']],
    });

    expect(result.suggestedTemplateKind).toBe('notice-form');
    expect(result.mapping.signatureSlots).toHaveLength(1);
    expect(result.mapping.signatureSlots[0]).toMatchObject({ kind: 'parent' });
  });

  it('한 명만 서명: 데이터 1행 + 서명 1슬롯 → general-register', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['이름', '서명'],
      rows: [['김교사', '']],
    });

    expect(result.suggestedTemplateKind).toBe('general-register');
    expect(result.participants).toHaveLength(1);
  });

  it('헤더 미매칭: 모든 컬럼이 custom으로 떨어지고 서명 슬롯 부재 경고', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['컬럼A', '컬럼B'],
      rows: [['값1', '값2']],
    });

    expect(result.mapping.signatureSlots).toHaveLength(0);
    expect(result.mapping.textFields.every((field) => field.key === 'custom')).toBe(true);
    expect(result.warnings.some((msg) => msg.includes('서명 컬럼을 찾지 못했습니다'))).toBe(true);
    expect(result.warnings.some((msg) => msg.includes('이름 컬럼을 찾지 못해'))).toBe(true);
  });

  it('빈 헤더 입력 시 안전하게 빈 결과를 반환한다', () => {
    const result = inferSignatureMappingFromCsv({ headers: [], rows: [] });
    expect(result.mapping.textFields).toHaveLength(0);
    expect(result.mapping.signatureSlots).toHaveLength(0);
    expect(result.participants).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('이름이 빈 데이터 행은 명단에서 건너뛴다', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['이름', '서명'],
      rows: [
        ['홍길동', ''],
        ['', ''],
        ['김민서', ''],
      ],
    });
    expect(result.participants.map((p) => p.displayName)).toEqual(['홍길동', '김민서']);
  });
});
