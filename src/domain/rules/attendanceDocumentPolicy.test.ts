import { describe, it, expect } from 'vitest';
import {
  requiresDocument,
  DEFAULT_ATTENDANCE_DOCUMENT_POLICY,
  ALL_DOC_STATUSES,
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

describe('requiresDocument 진리표 (M4 D-1)', () => {
  it('① 단일 교시 — 기본 정책(인정만 요구)에서 질병 지각은 미요구', () => {
    expect(requiresDocument(rec([p('late', '질병')]))).toBe(false);
  });

  it('② 단일 교시 — 인정 결석은 기본 정책에서 요구', () => {
    expect(requiresDocument(rec([p('absent', '인정')]))).toBe(true);
  });

  it('③ 다중 교시 혼합 — OR 집약: 어느 한 교시라도 요구면 요구', () => {
    expect(requiresDocument(rec([p('late', '질병', 1), p('classAbsence', '인정', 3)]))).toBe(true);
  });

  it('④ 다중 교시 전부 미요구 — false', () => {
    expect(requiresDocument(rec([p('late', '질병', 1), p('earlyLeave', '기타', 6)]))).toBe(false);
  });

  it('⑤ attendancePeriods 결측(레거시) — subcategory 추론, 기본 정책에서 질병 결석 false·인정 결석 true', () => {
    expect(requiresDocument(rec(undefined, '결석 (질병)'))).toBe(false);
    expect(requiresDocument(rec(undefined, '지각 (인정)'))).toBe(true);
    // 상태 추론 불가 → 보수적 false
    expect(requiresDocument(rec(undefined, '기타 기록'))).toBe(false);
    // 사유 미상 → '기타' 축 → 기본 정책 미요구
    expect(requiresDocument(rec(undefined, '결석'))).toBe(false);
  });

  it('⑥ 빈 배열 — 결측과 동일 취급(subcategory 추론)', () => {
    expect(requiresDocument(rec([], '조퇴 (인정)'))).toBe(true);
    expect(requiresDocument(rec([], '조퇴 (질병)'))).toBe(false);
  });

  it('출결 카테고리가 아니면 항상 false', () => {
    expect(requiresDocument(rec([p('absent', '인정')], '결석 (인정)', 'counseling'))).toBe(false);
  });

  it("'미인정' subcategory가 '인정'으로 오판되지 않는다", () => {
    expect(requiresDocument(rec(undefined, '결석 (미인정)'))).toBe(false);
    expect(requiresDocument(rec([p('absent', '미인정')]))).toBe(false);
  });

  it('정책 변경 — 질병 지각·조퇴·결과 요구를 켜면 해당 기록이 요구로 바뀐다', () => {
    const policy: AttendanceDocumentPolicy = {
      requiredBy: {
        인정: ALL_DOC_STATUSES,
        질병: ['late', 'earlyLeave', 'classAbsence'],
      },
    };
    expect(requiresDocument(rec([p('late', '질병')]), policy)).toBe(true);
    expect(requiresDocument(rec([p('absent', '질병')]), policy)).toBe(false); // 결석은 안 켬
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
  ];

  it('교정 전(모든 출결=서류 필요)은 3건, 교정 후(기본 정책)는 인정 미제출 1건만 남는다', () => {
    const before = records.filter((r) => r.category === 'attendance' && !r.documentSubmitted);
    expect(before).toHaveLength(3); // 과다 카운트 — 질병 결석·미인정 지각까지 포함

    const after = records.filter(
      (r) =>
        r.category === 'attendance' &&
        requiresDocument(r, DEFAULT_ATTENDANCE_DOCUMENT_POLICY) &&
        !r.documentSubmitted,
    );
    expect(after.map((r) => r.id)).toEqual(['b']); // 질병 결석은 사라지고 인정 기록은 남는다
  });

  it('분모 재정의 — 요구 대상 2건 중 제출 1건 (통계 "N중 M" 정합)', () => {
    const required = records.filter((r) => requiresDocument(r));
    expect(required).toHaveLength(2); // b, d
    const submitted = required.filter((r) => r.documentSubmitted);
    expect(submitted).toHaveLength(1); // d
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
