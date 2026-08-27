import { describe, it, expect } from 'vitest';
import {
  requiresDocument,
  DEFAULT_ATTENDANCE_DOCUMENT_POLICY,
  ALL_DOC_STATUSES,
  EDITABLE_DOC_REASON_AXES,
  isDocumentExemptByRule,
  type AttendanceDocumentPolicy,
  deriveDocumentSubmitted,
  toggleDocumentKind,
  documentChecklist,
  DEFAULT_DOCUMENT_KINDS,
} from './attendanceDocumentPolicy';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';

const rec = (
  attendancePeriods?: readonly AttendancePeriodEntry[],
  subcategory = '결석 (질병)',
  category = 'attendance',
) => ({ category, subcategory, attendancePeriods });

const p = (
  status: AttendancePeriodEntry['status'],
  reason?: AttendancePeriodEntry['reason'],
  period = 1,
): AttendancePeriodEntry => ({ period, status, ...(reason ? { reason } : {}) });

describe('requiresDocument 진리표 (M4 D-1 + 기본값 확대 2026-08-27)', () => {
  it('① 단일 교시 — 기본 정책에서 질병 지각은 요구 (진단서 수합)', () => {
    expect(requiresDocument(rec([p('late', '질병')]))).toBe(true);
  });

  it('② 단일 교시 — 인정 결석은 기본 정책에서 요구', () => {
    expect(requiresDocument(rec([p('absent', '인정')]))).toBe(true);
  });

  it('③ 다중 교시 혼합 — OR 집약: 어느 한 교시라도 요구면 요구', () => {
    expect(requiresDocument(rec([p('late', '기타', 1), p('classAbsence', '인정', 3)]))).toBe(true);
  });

  it('④ 다중 교시 전부 미요구 — false (미인정·기타만 있는 경우)', () => {
    expect(requiresDocument(rec([p('late', '미인정', 1), p('earlyLeave', '기타', 6)]))).toBe(false);
  });

  it('⑤ attendancePeriods 결측(레거시) — subcategory 추론, 기본 정책에서 질병·인정 결석 모두 true', () => {
    expect(requiresDocument(rec(undefined, '결석 (질병)'))).toBe(true);
    expect(requiresDocument(rec(undefined, '지각 (인정)'))).toBe(true);
    // 상태 추론 불가 → 보수적 false
    expect(requiresDocument(rec(undefined, '기타 기록'))).toBe(false);
    // 사유 미상 → '기타' 축 → 기본 정책 미요구
    expect(requiresDocument(rec(undefined, '결석'))).toBe(false);
  });

  it('⑥ 빈 배열 — 결측과 동일 취급(subcategory 추론)', () => {
    expect(requiresDocument(rec([], '조퇴 (인정)'))).toBe(true);
    expect(requiresDocument(rec([], '조퇴 (질병)'))).toBe(true);
    expect(requiresDocument(rec([], '조퇴 (미인정)'))).toBe(false);
  });

  it('출결 카테고리가 아니면 항상 false', () => {
    expect(requiresDocument(rec([p('absent', '인정')], '결석 (인정)', 'counseling'))).toBe(false);
  });

  it("'미인정' subcategory가 '인정'으로 오판되지 않는다", () => {
    expect(requiresDocument(rec(undefined, '결석 (미인정)'))).toBe(false);
    expect(requiresDocument(rec([p('absent', '미인정')]))).toBe(false);
  });

  it('정책 변경 — 질병 결석을 끄면 해당 기록만 미요구로 바뀐다', () => {
    const policy: AttendanceDocumentPolicy = {
      requiredBy: {
        인정: ALL_DOC_STATUSES,
        질병: ['late', 'earlyLeave', 'classAbsence'],
      },
    };
    expect(requiresDocument(rec([p('late', '질병')]), policy)).toBe(true);
    expect(requiresDocument(rec([p('absent', '질병')]), policy)).toBe(false); // 결석은 껐다
    expect(requiresDocument(rec([p('late', '기타')]), policy)).toBe(false);
  });

  it('reason 없는 교시는 기타 축으로 판정한다', () => {
    const policy: AttendanceDocumentPolicy = { requiredBy: { 기타: ['absent'] } };
    expect(requiresDocument(rec([p('absent')]), policy)).toBe(true);
    expect(requiresDocument(rec([p('absent')]))).toBe(false); // 기본 정책은 기타 미요구
  });
});

describe('과다 카운트 교정 회귀 — 소비처 산식 (교정 전/후 카운트)', () => {
  // 소비처(배너·검토 큐·조회 필터)와 동일 형태의 필터로 카운트 차이를 고정한다.
  const records = [
    { ...rec([p('absent', '질병')], '결석 (질병)'), documentSubmitted: false, id: 'a' },
    { ...rec([p('absent', '인정')], '결석 (인정)'), documentSubmitted: false, id: 'b' },
    { ...rec([p('late', '미인정')], '지각 (미인정)'), documentSubmitted: false, id: 'c' },
    { ...rec([p('absent', '인정')], '결석 (인정)'), documentSubmitted: true, id: 'd' },
    { ...rec([p('earlyLeave', '기타')], '조퇴 (기타)'), documentSubmitted: false, id: 'e' },
  ];

  it('교정 전(모든 출결=서류 필요)은 4건, 기본 정책은 미인정·기타를 빼고 2건', () => {
    const before = records.filter((r) => r.category === 'attendance' && !r.documentSubmitted);
    expect(before).toHaveLength(4); // 과다 카운트 — 미인정 지각·기타 조퇴까지 포함

    const after = records.filter(
      (r) =>
        r.category === 'attendance' &&
        requiresDocument(r, DEFAULT_ATTENDANCE_DOCUMENT_POLICY) &&
        !r.documentSubmitted,
    );
    // 미인정(c)은 공통 제외, 기타(e)는 기본 꺼짐 — 질병(a)·인정(b)만 남는다
    expect(after.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('분모 재정의 — 요구 대상 3건 중 제출 1건 (통계 "N중 M" 정합)', () => {
    const required = records.filter((r) => requiresDocument(r));
    expect(required.map((r) => r.id)).toEqual(['a', 'b', 'd']);
    const submitted = required.filter((r) => r.documentSubmitted);
    expect(submitted).toHaveLength(1); // d
  });
});

describe("'미인정' 공통 제외 (오너 확정 2026-08-27)", () => {
  /** 학교가 네 축을 전부 켜 둔 상태 — 그래도 미인정은 요구되지 않아야 한다. */
  const allOn: AttendanceDocumentPolicy = {
    requiredBy: {
      인정: ALL_DOC_STATUSES,
      질병: ALL_DOC_STATUSES,
      미인정: ALL_DOC_STATUSES,
      기타: ALL_DOC_STATUSES,
    },
  };

  it('정책에 켜져 있어도 미인정은 전 상태에서 요구하지 않는다 (정책보다 우선)', () => {
    for (const status of ALL_DOC_STATUSES) {
      expect(requiresDocument(rec([p(status, '미인정')]), allOn)).toBe(false);
    }
  });

  it('레거시 경로(subcategory 추론)에서도 제외된다 — 교시 경로와 분기가 달라 함께 고정', () => {
    expect(requiresDocument(rec(undefined, '결석 (미인정)'), allOn)).toBe(false);
    expect(requiresDocument(rec([], '지각 (미인정)'), allOn)).toBe(false);
  });

  it("'무단' 표기도 미인정 축으로 제외된다 (레거시 subcategory)", () => {
    expect(requiresDocument(rec(undefined, '결석 (무단)'), allOn)).toBe(false);
  });

  it('OR 집약 — 미인정 교시는 무시되고 질병 교시가 요구를 만든다', () => {
    expect(requiresDocument(rec([p('late', '미인정', 1), p('absent', '질병', 3)]))).toBe(true);
  });

  it('전 교시가 미인정이면 정책이 전부 켜져 있어도 false', () => {
    expect(requiresDocument(rec([p('late', '미인정', 1), p('absent', '미인정', 3)]), allOn)).toBe(
      false,
    );
  });
});

describe('기본 정책 확대 (인정 → 인정+질병)', () => {
  it('질병은 4개 상태 전부 요구한다', () => {
    for (const status of ALL_DOC_STATUSES) {
      expect(requiresDocument(rec([p(status, '질병')]))).toBe(true);
    }
  });

  it('인정도 4개 상태 전부 요구한다 (기존 동작 유지)', () => {
    for (const status of ALL_DOC_STATUSES) {
      expect(requiresDocument(rec([p(status, '인정')]))).toBe(true);
    }
  });

  it("'기타'는 기본 꺼짐 — 학교 방침으로만 켠다", () => {
    for (const status of ALL_DOC_STATUSES) {
      expect(requiresDocument(rec([p(status, '기타')]))).toBe(false);
    }
  });

  it('설정 화면 노출 축에는 미인정이 없다', () => {
    expect(EDITABLE_DOC_REASON_AXES).toEqual(['인정', '질병', '기타']);
  });
});

describe('isDocumentExemptByRule — "방침 바꾸기" 안내를 띄울지 가르는 술어', () => {
  it('미인정 단일 교시는 면제', () => {
    expect(isDocumentExemptByRule(rec([p('absent', '미인정')]))).toBe(true);
  });

  it('전 교시가 미인정일 때만 면제 (AND 집약 — requiresDocument의 OR과 짝)', () => {
    expect(isDocumentExemptByRule(rec([p('late', '미인정', 1), p('absent', '미인정', 3)]))).toBe(
      true,
    );
    // 한 교시라도 다른 축이면 면제가 아니다 → 방침을 바꾸면 걷을 수 있으므로 안내 대상
    expect(isDocumentExemptByRule(rec([p('late', '미인정', 1), p('absent', '기타', 3)]))).toBe(
      false,
    );
  });

  it('질병·인정·기타는 면제가 아니다 (방침으로 바꿀 수 있는 축)', () => {
    expect(isDocumentExemptByRule(rec([p('absent', '질병')]))).toBe(false);
    expect(isDocumentExemptByRule(rec([p('absent', '인정')]))).toBe(false);
    expect(isDocumentExemptByRule(rec([p('absent', '기타')]))).toBe(false);
  });

  it('레거시(교시 결측) — subcategory로 판정하고 무단 표기도 잡는다', () => {
    expect(isDocumentExemptByRule(rec(undefined, '결석 (미인정)'))).toBe(true);
    expect(isDocumentExemptByRule(rec(undefined, '결석 (무단)'))).toBe(true);
    expect(isDocumentExemptByRule(rec(undefined, '결석 (질병)'))).toBe(false);
    expect(isDocumentExemptByRule(rec([], '지각 (미인정)'))).toBe(true);
  });

  it('출결이 아니면 false — 안내 자체가 대상이 아니다', () => {
    expect(
      isDocumentExemptByRule(rec([p('absent', '미인정')], '결석 (미인정)', 'counseling')),
    ).toBe(false);
  });

  it('요구·면제·안내 3분기가 서로 겹치지 않는다 (화면 분기 계약)', () => {
    const cases = [
      { r: rec([p('absent', '질병')]), required: true, exempt: false }, // 체크박스
      { r: rec([p('absent', '미인정')]), required: false, exempt: true }, // 아무것도 안 그림
      { r: rec([p('absent', '기타')]), required: false, exempt: false }, // 안내 문구
    ];
    for (const c of cases) {
      expect(requiresDocument(c.r)).toBe(c.required);
      expect(isDocumentExemptByRule(c.r)).toBe(c.exempt);
      expect(c.required && c.exempt).toBe(false); // 두 분기가 동시에 참일 수 없다
    }
  });
});

describe('서류 종류 체크리스트 (M6, D-2) — 파생·토글·하위호환', () => {
  it('deriveDocumentSubmitted — 전 종류 제출=true, 하나라도 미제출=false, 미존재=fallback', () => {
    expect(
      deriveDocumentSubmitted([
        { kind: '신청서', submitted: true },
        { kind: '보고서', submitted: true },
      ]),
    ).toBe(true);
    expect(
      deriveDocumentSubmitted([
        { kind: '신청서', submitted: true },
        { kind: '보고서', submitted: false },
      ]),
    ).toBe(false);
    expect(deriveDocumentSubmitted(undefined, true)).toBe(true);
    expect(deriveDocumentSubmitted(undefined, false)).toBe(false);
    expect(deriveDocumentSubmitted(undefined)).toBe(false);
    expect(deriveDocumentSubmitted([], true)).toBe(true); // 빈 배열=미존재 취급
  });

  it('toggleDocumentKind — 구 데이터(documents 없음, 미제출)에서 첫 체크는 기본 3종으로 초기화', () => {
    const next = toggleDocumentKind({ documentSubmitted: false, kind: '신청서' });
    expect(next.documents.map((d) => d.kind)).toEqual([...DEFAULT_DOCUMENT_KINDS]);
    expect(next.documents.find((d) => d.kind === '신청서')!.submitted).toBe(true);
    expect(next.documentSubmitted).toBe(false); // 아직 보고서·증빙자료 미제출
  });

  it('toggleDocumentKind — 하위호환: 기존 documentSubmitted=true 기록은 전 종류 제출 상태에서 출발', () => {
    // 완료 기록에서 한 종류를 해제하면 파생 documentSubmitted가 false로 내려간다
    const next = toggleDocumentKind({ documentSubmitted: true, kind: '보고서' });
    expect(next.documents.find((d) => d.kind === '보고서')!.submitted).toBe(false);
    expect(next.documents.find((d) => d.kind === '신청서')!.submitted).toBe(true);
    expect(next.documentSubmitted).toBe(false);
  });

  it('toggleDocumentKind — 마지막 종류를 체크하면 documentSubmitted가 파생 완료된다 (불변식)', () => {
    let state: {
      documents?: readonly { kind: string; submitted: boolean }[];
      documentSubmitted?: boolean;
    } = { documentSubmitted: false };
    for (const kind of DEFAULT_DOCUMENT_KINDS) {
      state = { ...toggleDocumentKind({ ...state, kind }) };
    }
    expect(state.documentSubmitted).toBe(true);
    expect(state.documents!.every((d) => d.submitted)).toBe(true);
  });

  it('toggleDocumentKind — 알 수 없는 종류는 submitted=true로 추가한다 (사용자 정의 허용)', () => {
    const next = toggleDocumentKind({
      documents: [{ kind: '신청서', submitted: true }],
      documentSubmitted: true,
      kind: '진단서',
    });
    expect(next.documents.map((d) => d.kind)).toEqual(['신청서', '진단서']);
    expect(next.documentSubmitted).toBe(true);
  });

  it('documentChecklist — documents 없으면 기본 3종을 기존 boolean 승계 상태로 보여준다', () => {
    expect(documentChecklist({ documentSubmitted: false }).map((d) => d.submitted)).toEqual([
      false,
      false,
      false,
    ]);
    expect(documentChecklist({ documentSubmitted: true }).every((d) => d.submitted)).toBe(true);
    const own = [{ kind: '진단서', submitted: false }];
    expect(documentChecklist({ documents: own, documentSubmitted: false })).toBe(own);
  });
});
