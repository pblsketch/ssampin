/**
 * 서명받기 — 동적 열 매핑 단위 테스트.
 *
 * 핵심 기능 회귀 가드: 서명 셀이 status.signaturePublicUrl로 채워지는지 검증한다.
 * (이 매핑이 깨지면 교사 시트/Excel 서명 셀이 비어 핵심 기능이 동작하지 않는다.)
 */
import { describe, expect, it } from 'vitest';
import {
  buildSheetRows,
  buildExcelRows,
  buildRosterTemplateCsv,
  parsePastedRoster,
  parseCsvLine,
  rosterInputColumns,
} from './ToolSignatureRoster';
import type { ColumnDef, RosterMember } from '@domain/entities/SignatureRoster';
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';

const COLUMNS: ColumnDef[] = [
  { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
  { key: 'affiliation', label: '소속', type: 'text', builtin: true, order: 1 },
  { key: 'name', label: '이름', type: 'text', builtin: true, order: 2 },
  { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 3 },
  { key: 'signedAt', label: '서명일시', type: 'datetime', builtin: true, order: 4 },
  { key: 'custom_memo', label: '메모', type: 'text', order: 5 },
];

const MEMBERS: RosterMember[] = [
  {
    id: 'm-1',
    name: '홍길동',
    affiliation: '3-2',
    fields: { no: '1', custom_memo: '비고1' },
  },
  {
    id: 'm-2',
    name: '김철수',
    affiliation: '3-2',
    fields: { no: '2' },
  },
];

const SIGNED_URL =
  'https://example.supabase.co/storage/v1/object/public/sigv2-signatures/sess/abc.png';

const STATUS_ROWS: SignatureStatusRow[] = [
  {
    memberRef: 'm-1',
    name: '홍길동',
    affiliation: '3-2',
    signed: true,
    signedAt: '2026-06-05T01:00:00.000Z',
    signaturePublicUrl: SIGNED_URL,
  },
  {
    memberRef: 'm-2',
    name: '김철수',
    affiliation: '3-2',
    signed: false,
  },
];

describe('buildSheetRows — 동적 열 매핑', () => {
  it('서명 완료자의 signature 셀에 status.signaturePublicUrl을 주입한다', () => {
    const [signedRow] = buildSheetRows(MEMBERS, COLUMNS, STATUS_ROWS);
    // 서명 셀에는 공개 URL이 들어가야 GoogleSheetClient가 =IMAGE(url)로 변환한다.
    expect(signedRow?.signature).toBe(SIGNED_URL);
  });

  it('미서명자의 signature 셀은 빈칸이다(=IMAGE 미생성)', () => {
    const [, unsignedRow] = buildSheetRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(unsignedRow?.signature).toBe('');
  });

  it('builtin 열(연번·이름·소속·서명일시)을 명단/현황에서 채운다', () => {
    const [signedRow, unsignedRow] = buildSheetRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(signedRow?.no).toBe('1');
    expect(signedRow?.name).toBe('홍길동');
    expect(signedRow?.affiliation).toBe('3-2');
    expect(signedRow?.signedAt).toBe('2026-06-05T01:00:00.000Z');
    // 미서명자는 signedAt 빈칸.
    expect(unsignedRow?.signedAt).toBe('');
  });

  it('커스텀 열은 member.fields에서 채우고, 없으면 빈칸을 허용한다', () => {
    const [signedRow, unsignedRow] = buildSheetRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(signedRow?.custom_memo).toBe('비고1');
    expect(unsignedRow?.custom_memo).toBe(''); // fields에 없음 → 빈칸
  });
});

describe('buildExcelRows — 서명 PNG 임베드 매핑', () => {
  it('서명 완료자만 signatureUrl을 전달하고 signature 셀 텍스트는 비운다', () => {
    const [signedRow] = buildExcelRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(signedRow?.signatureUrl).toBe(SIGNED_URL);
    expect(signedRow?.cells.signature).toBe('');
  });

  it('미서명자는 signatureUrl이 없다(빈 셀)', () => {
    const [, unsignedRow] = buildExcelRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(unsignedRow?.signatureUrl).toBeUndefined();
    expect(unsignedRow?.cells.signature).toBe('');
  });

  it('builtin·커스텀 셀 텍스트를 시트 행과 동일 규약으로 채운다', () => {
    const [signedRow] = buildExcelRows(MEMBERS, COLUMNS, STATUS_ROWS);
    expect(signedRow?.cells.name).toBe('홍길동');
    expect(signedRow?.cells.signedAt).toBe('2026-06-05T01:00:00.000Z');
    expect(signedRow?.cells.custom_memo).toBe('비고1');
  });
});

describe('signature 열 부재 시 매핑 안전성 (기본 열 삭제 graceful 폴백)', () => {
  // 서명·서명일시 builtin 열을 삭제한 상태(개선 3: 기본 열도 삭제 가능).
  const COLUMNS_NO_SIGNATURE: ColumnDef[] = [
    { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
    { key: 'name', label: '이름', type: 'text', builtin: true, order: 1 },
    { key: 'custom_memo', label: '메모', type: 'text', order: 2 },
  ];

  it('signature 열이 없어도 buildSheetRows가 깨지지 않고 남은 열을 채운다', () => {
    const [signedRow] = buildSheetRows(MEMBERS, COLUMNS_NO_SIGNATURE, STATUS_ROWS);
    expect(signedRow?.no).toBe('1');
    expect(signedRow?.name).toBe('홍길동');
    expect(signedRow?.custom_memo).toBe('비고1');
    // signature/signedAt 열이 없으므로 해당 키 자체가 없다.
    expect(signedRow?.signature).toBeUndefined();
    expect(signedRow?.signedAt).toBeUndefined();
  });

  it('signature 열이 없으면 buildExcelRows는 signatureUrl을 전달하지 않는다', () => {
    const [signedRow] = buildExcelRows(MEMBERS, COLUMNS_NO_SIGNATURE, STATUS_ROWS);
    // signature 열 부재 → PNG 임베드 대상도 없음(빈 cells만).
    expect(signedRow?.signatureUrl).toBeUndefined();
    expect(signedRow?.cells.name).toBe('홍길동');
  });
});

describe('rosterInputColumns — 입력 열 추림', () => {
  it('signature·signedAt·no 열을 제외하고 order 순으로 소속·이름·커스텀만 남긴다', () => {
    const input = rosterInputColumns(COLUMNS);
    expect(input.map((c) => c.key)).toEqual(['affiliation', 'name', 'custom_memo']);
  });
});

describe('parseCsvLine — RFC4180 따옴표 규칙', () => {
  it('콤마로 셀을 나누고 각 셀을 trim 한다', () => {
    expect(parseCsvLine(' 홍길동 , 3-2 ')).toEqual(['홍길동', '3-2']);
  });

  it('탭 구분자도 지원한다', () => {
    expect(parseCsvLine('홍길동\t3-2')).toEqual(['홍길동', '3-2']);
  });

  it('따옴표 안의 콤마를 셀 값으로 보존한다', () => {
    expect(parseCsvLine('"성, 이름",3-2')).toEqual(['성, 이름', '3-2']);
  });

  it('"" 이스케이프를 리터럴 따옴표로 해제한다', () => {
    expect(parseCsvLine('"그는 ""왕""",반')).toEqual(['그는 "왕"', '반']);
  });
});

describe('buildRosterTemplateCsv — 열-인식 CSV 양식 다운로드', () => {
  const COLUMNS_WITH_AFFILIATION: ColumnDef[] = [
    { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
    { key: 'affiliation', label: '소속', type: 'text', builtin: true, order: 1 },
    { key: 'name', label: '이름', type: 'text', builtin: true, order: 2 },
    { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 3 },
  ];

  it('입력 열(소속·이름)을 order 순 라벨로 헤더에 내고 샘플 3행을 포함한다', () => {
    const csv = buildRosterTemplateCsv(COLUMNS_WITH_AFFILIATION);
    const lines = csv.split('\r\n');
    // order: 소속(1) < 이름(2). signature·no는 입력 열에서 제외.
    expect(lines[0]).toBe('소속,이름');
    expect(lines).toHaveLength(4); // 헤더 + 샘플 3행
    expect(lines[1]).toBe('1학년 1반,홍길동');
  });

  it('커스텀 열(직위·사번)도 헤더와 샘플에 포함한다', () => {
    const withCustom: ColumnDef[] = [
      ...COLUMNS_WITH_AFFILIATION,
      { key: 'custom_rank', label: '직위', type: 'text', order: 4 },
      { key: 'custom_emp', label: '사번', type: 'text', order: 5 },
    ];
    const csv = buildRosterTemplateCsv(withCustom);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('소속,이름,직위,사번');
    // 직위 휴리스틱→교사, 사번 휴리스틱→5자리 숫자.
    const firstRow = parseCsvLine(lines[1] ?? '');
    expect(firstRow[2]).toBe('교사');
    expect(firstRow[3]).toMatch(/^\d{5}$/);
  });

  it('입력 열이 하나도 없으면 헤더는 이름 폴백', () => {
    const noInput: ColumnDef[] = [
      { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 0 },
    ];
    const csv = buildRosterTemplateCsv(noInput);
    expect(csv.split('\r\n')[0]).toBe('이름');
  });
});

describe('parsePastedRoster — 열-인식 헤더 매핑', () => {
  const COLUMNS_WITH_CUSTOM: ColumnDef[] = [
    { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
    { key: 'affiliation', label: '소속', type: 'text', builtin: true, order: 1 },
    { key: 'name', label: '이름', type: 'text', builtin: true, order: 2 },
    { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 3 },
    { key: 'custom_rank', label: '직위', type: 'text', order: 4 },
  ];

  it('헤더 라벨 매핑으로 커스텀 열을 member.fields에 채운다', () => {
    const csv = '소속,이름,직위\n1학년 1반,홍길동,교사\n1학년 2반,김영희,부장교사';
    const members = parsePastedRoster(csv, COLUMNS_WITH_CUSTOM);
    expect(members).toHaveLength(2);
    expect(members[0]?.name).toBe('홍길동');
    expect(members[0]?.affiliation).toBe('1학년 1반');
    expect(members[0]?.fields.custom_rank).toBe('교사');
    expect(members[0]?.fields.no).toBe('1');
    expect(members[1]?.fields.custom_rank).toBe('부장교사');
  });

  it('열 순서를 바꾼 헤더도 라벨로 정확히 매핑한다', () => {
    // 이름·소속·직위 순서를 뒤섞어도 라벨 기준으로 정확히 들어가야 한다.
    const csv = '직위,이름,소속\n교사,홍길동,1학년 1반';
    const [member] = parsePastedRoster(csv, COLUMNS_WITH_CUSTOM);
    expect(member?.name).toBe('홍길동');
    expect(member?.affiliation).toBe('1학년 1반');
    expect(member?.fields.custom_rank).toBe('교사');
  });

  it('따옴표 안 콤마를 가진 셀을 보존한다', () => {
    const csv = '소속,이름,직위\n"1반, 가반","홍, 길동",교사';
    const [member] = parsePastedRoster(csv, COLUMNS_WITH_CUSTOM);
    expect(member?.affiliation).toBe('1반, 가반');
    expect(member?.name).toBe('홍, 길동');
  });

  it('양식 다운로드 → 재업로드 round-trip이 커스텀 열까지 보존한다', () => {
    const csv = buildRosterTemplateCsv(COLUMNS_WITH_CUSTOM);
    const members = parsePastedRoster(csv, COLUMNS_WITH_CUSTOM);
    expect(members.every((m) => m.name !== '이름')).toBe(true); // 헤더 스킵
    expect(members).toHaveLength(3);
    expect(members[0]?.name).toBe('홍길동');
    expect(members[0]?.affiliation).toBe('1학년 1반');
    expect(members[0]?.fields.custom_rank).toBe('교사');
  });
});

describe('parsePastedRoster — 레거시(무열) 호환 + BOM·헤더 스킵', () => {
  it('columns 미전달 시 첫 칸=이름·둘째 칸=소속 휴리스틱을 유지한다', () => {
    const members = parsePastedRoster('홍길동,3-2\n김철수,3-1');
    expect(members).toHaveLength(2);
    expect(members[0]?.name).toBe('홍길동');
    expect(members[0]?.affiliation).toBe('3-2');
  });

  it('columns 미전달 시 이름 헤더 줄은 스킵한다', () => {
    const members = parsePastedRoster('이름,소속\n홍길동,3-2');
    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe('홍길동');
  });

  it('columns를 전달해도 헤더 라벨이 매칭 안 되면 레거시 휴리스틱으로 폴백한다', () => {
    // 첫 줄에 입력 열 라벨이 전혀 없으므로 헤더로 보지 않고 데이터로 파싱.
    const members = parsePastedRoster('홍길동,3-2\n김철수,3-1', COLUMNS);
    expect(members).toHaveLength(2);
    expect(members[0]?.name).toBe('홍길동');
    expect(members[0]?.affiliation).toBe('3-2');
  });

  it('UTF-8 BOM이 선행해도 첫 멤버 이름이 깨지지 않는다', () => {
    const text = '\uFEFF홍길동,3-2\n김철수,3-1';
    const members = parsePastedRoster(text);
    expect(members[0]?.name).toBe('홍길동');
    expect(members).toHaveLength(2);
  });

  it('헤더 키워드(이름)가 없는 일반 명단은 그대로 모두 파싱한다', () => {
    const members = parsePastedRoster('홍길동\n김철수');
    expect(members).toHaveLength(2);
    expect(members[0]?.name).toBe('홍길동');
  });
});
