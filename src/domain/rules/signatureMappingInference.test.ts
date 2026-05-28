import { describe, expect, it } from 'vitest';
import { inferParticipantColumns, inferSignatureMappingFromCsv } from './signatureMappingInference';
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

describe('inferParticipantColumns (Phase 2C 신규 export)', () => {
  it('연수 등록부 헤더에서 이름·연번·소속·직위 컬럼 인덱스를 검출한다', () => {
    const { headers } = parseCsvLines(TRAINING_REGISTER_CSV);
    const columns = inferParticipantColumns(headers);

    // "연번"(번호)·"소속(학교명)"·"직위"·"성명" 순서로 검출되어야 함
    expect(columns).toEqual({
      recipientNameColumn: 3, // 성명
      studentNumberColumn: 0, // 연번
      classNameColumn: 1, // 소속(학교명)
      roleColumn: 2, // 직위
    });
  });

  it('결석계 헤더(학년반/번호/성명/결석 기간/결석 사유)를 검출한다', () => {
    const columns = inferParticipantColumns(['학년반', '번호', '성명', '결석기간', '결석사유']);

    expect(columns.recipientNameColumn).toBe(2);
    expect(columns.studentNumberColumn).toBe(1);
    expect(columns.classNameColumn).toBe(0);
    expect(columns.roleColumn).toBeNull();
  });

  it('일부 컬럼만 있을 때 나머지는 null 로 반환한다', () => {
    const columns = inferParticipantColumns(['이름', '메모']);

    expect(columns.recipientNameColumn).toBe(0);
    expect(columns.studentNumberColumn).toBeNull();
    expect(columns.classNameColumn).toBeNull();
    expect(columns.roleColumn).toBeNull();
  });

  it('빈 헤더 배열은 모두 null 을 반환한다', () => {
    expect(inferParticipantColumns([])).toEqual({
      recipientNameColumn: null,
      studentNumberColumn: null,
      classNameColumn: null,
      roleColumn: null,
    });
  });
});

describe('inferSignatureMappingFromCsv (명단 추출 중심)', () => {
  it('연수 등록부 CSV에서 명단 10명을 모두 teacher 로 추출한다', () => {
    const { headers, rows } = parseCsvLines(TRAINING_REGISTER_CSV);
    const result = inferSignatureMappingFromCsv({ headers, rows });

    // Phase 2C 리팩터: mapping 은 항상 빈 객체
    expect(result.mapping).toEqual({ textFields: [], signatureSlots: [] });

    // 명단 10명 추출, 모두 teacher 역할
    expect(result.participants).toHaveLength(10);
    expect(result.participants[0]).toMatchObject({
      displayName: '김국어',
      role: 'teacher',
      studentNumber: 1,
      className: '아산중학교',
      requiredSignatureKinds: ['recipient'],
    });
    expect(result.participants.every((p) => p.role === 'teacher')).toBe(true);

    // 전원이 teacher 이므로 training-register 추정
    expect(result.suggestedTemplateKind).toBe('training-register');
  });

  it('학번이 숫자인 결석계 행은 student 역할로 추출한다', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['학년반', '번호', '성명'],
      rows: [
        ['3-2', '1', '홍길동'],
        ['3-2', '2', '김민서'],
      ],
    });

    // Phase 2C: mapping 은 빈 객체
    expect(result.mapping).toEqual({ textFields: [], signatureSlots: [] });

    expect(result.participants).toHaveLength(2);
    expect(result.participants[0]).toMatchObject({
      displayName: '홍길동',
      role: 'student',
      studentNumber: 1,
      className: '3-2',
      requiredSignatureKinds: ['recipient'],
    });
  });

  it('한 명만 있는 명단은 general-register 로 추정한다', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['이름'],
      rows: [['김교사']],
    });

    expect(result.suggestedTemplateKind).toBe('general-register');
    expect(result.participants).toHaveLength(1);
  });

  it('이름 컬럼을 찾지 못하면 빈 명단 + 경고를 반환한다', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['컬럼A', '컬럼B'],
      rows: [['값1', '값2']],
    });

    expect(result.mapping).toEqual({ textFields: [], signatureSlots: [] });
    expect(result.participants).toHaveLength(0);
    expect(result.warnings.some((msg) => msg.includes('이름 컬럼을 찾지 못해'))).toBe(true);
    expect(result.suggestedTemplateKind).toBe('custom');
  });

  it('빈 헤더 입력 시 안전하게 빈 결과를 반환한다', () => {
    const result = inferSignatureMappingFromCsv({ headers: [], rows: [] });
    expect(result.mapping).toEqual({ textFields: [], signatureSlots: [] });
    expect(result.participants).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('이름이 빈 데이터 행은 명단에서 건너뛴다', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['이름'],
      rows: [['홍길동'], [''], ['김민서']],
    });
    expect(result.participants.map((p) => p.displayName)).toEqual(['홍길동', '김민서']);
  });

  it('Phase 2C: signature 슬롯 자동 추론은 더 이상 발생하지 않는다 (학생서명/학부모서명 헤더가 있어도)', () => {
    const result = inferSignatureMappingFromCsv({
      headers: ['학년반', '번호', '성명', '학생서명', '학부모서명'],
      rows: [['3-2', '1', '홍길동', '', '']],
    });

    // 매핑은 PDF 오버레이로 이동했으므로 자동 추론하지 않음
    expect(result.mapping.signatureSlots).toHaveLength(0);
    expect(result.mapping.textFields).toHaveLength(0);

    // 명단은 정상 추출
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]?.displayName).toBe('홍길동');
  });
});
