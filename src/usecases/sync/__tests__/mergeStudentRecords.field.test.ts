/**
 * mergeStudentRecords 항목(추적 그룹) 단위 병합 + before→after 의도 스탬프 테스트
 * (sync-hardening-2 B트랙 — 계획 §5.1/§8).
 *
 * 배경: 두 기기가 같은 기록의 서로 다른 체크(PC=서류, 노트북=나이스)를 고치면
 * record-LWW가 기록을 통째로 골라 한쪽 체크가 사라졌다(QA HIGH). C1 3분기 유효시각
 * + H3 결과맵 합성 + H4 deriveDocumentSubmitted + B2 의도 스탬프가 그 해소다.
 */
import { describe, it, expect } from 'vitest';
import type { StudentRecord, StudentRecordsData } from '@domain/entities/StudentRecord';
import { mergeStudentRecords } from '../SyncFromCloud';
import { applyRecordChange } from '@usecases/studentRecords/ManageStudentRecords';

const T = (n: number): string => `2026-07-${String(n).padStart(2, '0')}T00:00:00.000Z`;

function rec(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: 'r1',
    studentId: 'stu-1',
    category: 'attendance',
    subcategory: '결석 (질병)',
    content: '',
    date: '2026-07-01',
    createdAt: T(1),
    ...overrides,
  } as StudentRecord;
}

function data(records: StudentRecord[]): StudentRecordsData {
  return { records };
}

function mergedRecord(local: StudentRecord, remote: StudentRecord): StudentRecord {
  const merged = mergeStudentRecords(data([local]), data([remote]));
  return merged.records.find((r) => r.id === local.id)!;
}

describe('mergeStudentRecords — C1 항목 단위 병합', () => {
  it('① 양쪽 신스키마·서로 다른 항목 → 둘 다 보존 (신고된 HIGH 버그 해소)', () => {
    // PC: 나이스 반영 체크(T3). 노트북: 서류 제출 체크(T5, record-LWW 승자).
    const local = rec({
      reportedToNeis: true,
      updatedAt: T(3),
      fieldUpdatedAt: { reportedToNeis: T(3) },
    });
    const remote = rec({
      documentSubmitted: true,
      updatedAt: T(5),
      fieldUpdatedAt: { documentGroup: T(5) },
    });

    const result = mergedRecord(local, remote);
    expect(result.reportedToNeis).toBe(true); // record-LWW였다면 remote 통째 채택으로 소실
    expect(result.documentSubmitted).toBe(true);
    // H3: 채택된 항목의 시각이 결과 맵에 materialize
    expect(result.fieldUpdatedAt?.reportedToNeis).toBe(T(3));
    expect(result.fieldUpdatedAt?.documentGroup).toBe(T(5));
  });

  it('② (c)분기: 항목 체크 후 무관 편집으로 updatedAt만 오른 쪽이 상대의 정당한 항목 편집을 못 덮는다', () => {
    // A: T3에 나이스 체크 → T7에 내용만 편집(updatedAt=T7, 맵은 T3 유지, documentGroup 키 없음)
    const local = rec({
      reportedToNeis: true,
      content: '수정된 내용',
      updatedAt: T(7),
      fieldUpdatedAt: { reportedToNeis: T(3) },
    });
    // B: T5에 서류 체크(record-LWW로는 A(T7)에게 지는 쪽)
    const remote = rec({
      documentSubmitted: true,
      updatedAt: T(5),
      fieldUpdatedAt: { documentGroup: T(5) },
    });

    const result = mergedRecord(local, remote);
    // A의 documentGroup 유효시각 = createdAt(T1) < B의 T5 → B의 서류 체크 생존
    expect(result.documentSubmitted).toBe(true);
    expect(result.reportedToNeis).toBe(true);
    expect(result.content).toBe('수정된 내용'); // 비추적 필드는 record-LWW(BASE=A) 유지
  });

  it('③ 한쪽 맵 부재(구버전 드롭)면 항목 오버레이 없이 record-LWW로 폴백한다', () => {
    // mapless 쪽의 updatedAt을 항목 백스톱으로 쓰면 무관 편집이 LWW 승자의 진짜
    // 항목 스탬프를 이겨 P4가 깨진다(리뷰 스윕 S2) — 맵 부재 페어는 LWW 폴백.
    // 구버전(맵 없음)이 T6에 편집 → record-LWW 승자로서 통째 승리(P5 보호는 동일).
    const oldDevice = rec({ reportedToNeis: true, updatedAt: T(6) }); // 맵 자체 부재
    const newDevice = rec({
      reportedToNeis: false,
      updatedAt: T(3),
      fieldUpdatedAt: { reportedToNeis: T(3) },
    });

    const result = mergedRecord(newDevice, oldDevice);
    expect(result.reportedToNeis).toBe(true); // 구버전 편집(T6)이 LWW 승자 → 통째 승리
    expect(result.fieldUpdatedAt).toBeUndefined(); // 항목 오버레이 없음(base 그대로)
  });

  it('③-b 맵 보유 LWW 승자는 mapless 패자의 무관 편집에 항목을 뺏기지 않는다 (스윕 S2 역검증)', () => {
    // 신버전 N: T3 나이스 체크(map) 후 T9 내용 편집(updatedAt=T9, LWW 승자).
    const withMap = rec({
      reportedToNeis: true,
      content: '최신 내용',
      updatedAt: T(9),
      fieldUpdatedAt: { reportedToNeis: T(3) },
    });
    // mapless L: 낡은 미체크 상태로 T6에 무관 편집만 함(LWW 패자).
    const mapless = rec({ reportedToNeis: false, updatedAt: T(6) });

    // (b)백스톱이 있었다면 L의 T6 > N의 항목 스탬프 T3로 체크가 풀렸다(P4 위반).
    const result = mergedRecord(withMap, mapless);
    expect(result.reportedToNeis).toBe(true); // record-LWW 폴백 — 승자 통째 유지
  });

  it('⑤ P2: 체크 해제가 더 최근이면 해제가 유지된다 (9ce4c1cf 회귀 금지)', () => {
    const unchecked = rec({
      reportedToNeis: false,
      updatedAt: T(6),
      fieldUpdatedAt: { reportedToNeis: T(6) },
    });
    const checked = rec({
      reportedToNeis: true,
      updatedAt: T(4),
      fieldUpdatedAt: { reportedToNeis: T(4) },
    });

    const result = mergedRecord(checked, unchecked);
    expect(result.reportedToNeis).toBe(false); // OR-병합이었다면 true로 부활
  });

  it('⑥ followUpDone 그룹: followUp/followUpDate가 동반 이동한다', () => {
    const local = rec({
      followUp: '가정 연락',
      followUpDate: '2026-07-03',
      followUpDone: true,
      updatedAt: T(5),
      fieldUpdatedAt: { followUpDone: T(5) },
    });
    const remote = rec({
      followUp: '옛 메모',
      followUpDone: false,
      content: '최근 내용',
      updatedAt: T(6),
      fieldUpdatedAt: {},
    });

    // BASE=remote(T6)이지만 followUpDone 그룹은 local(T5) > remote(createdAt T1) → local 채택
    const result = mergedRecord(local, remote);
    expect(result.followUpDone).toBe(true);
    expect(result.followUp).toBe('가정 연락');
    expect(result.followUpDate).toBe('2026-07-03');
    expect(result.content).toBe('최근 내용'); // 비추적 필드는 BASE 유지
  });

  it('H4: documentGroup 채택 시 documentSubmitted는 deriveDocumentSubmitted로 재계산 — 빈 배열이 체크를 부활시키지 않는다', () => {
    // 채택되는 쪽이 {documents: [], documentSubmitted: false} — 원시 [].every()===true 함정
    const local = rec({
      documents: [],
      documentSubmitted: false,
      updatedAt: T(6),
      fieldUpdatedAt: { documentGroup: T(6) },
    });
    const remote = rec({
      documents: [{ kind: '신청서', submitted: true }],
      documentSubmitted: true,
      updatedAt: T(7),
      fieldUpdatedAt: { documentGroup: T(4) },
    });

    // BASE=remote(T7)지만 documentGroup은 local(T6) > remote(T4) → local 그룹 채택
    const result = mergedRecord(local, remote);
    expect(result.documents).toEqual([]);
    expect(result.documentSubmitted).toBe(false); // 빈 배열=미존재 → fallback(false) 보존
  });

  it('H3: 2단계 병합 수렴 — merge(merge(A,B),C)와 merge(A,merge(B,C))가 같다 (순서 무관·재병합 안정)', () => {
    const A = rec({
      reportedToNeis: true,
      updatedAt: T(10),
      fieldUpdatedAt: { reportedToNeis: T(10) },
    });
    const B = rec({
      documentSubmitted: true,
      documents: [{ kind: '신청서', submitted: true }],
      updatedAt: T(20),
      fieldUpdatedAt: { documentGroup: T(20) },
    });
    const C = rec({
      followUpDone: true,
      followUp: '후속',
      updatedAt: T(15),
      fieldUpdatedAt: { followUpDone: T(15) },
    });

    const ab_c = mergeStudentRecords(data([mergedRecord(A, B)]), data([C])).records[0]!;
    const a_bc = mergeStudentRecords(data([A]), data([mergedRecord(B, C)])).records[0]!;

    expect(ab_c).toEqual(a_bc);
    expect(ab_c.reportedToNeis).toBe(true);
    expect(ab_c.documentSubmitted).toBe(true);
    expect(ab_c.followUpDone).toBe(true);
    expect(ab_c.fieldUpdatedAt).toEqual({
      reportedToNeis: T(10),
      documentGroup: T(20),
      followUpDone: T(15),
    });
    // 재병합 안정: 결과를 다시 병합해도 변하지 않는다(재업로드 진동 없음)
    const again = mergeStudentRecords(data([ab_c]), data([a_bc])).records[0]!;
    expect(again).toEqual(ab_c);
  });
});

describe('mergeStudentRecords — 잔여 명시(R1/R1-c, 손실 아님)', () => {
  it('R1: 구버전이 맵을 spread 보존한 채 더 늦게 편집하면 옛 항목 스탬프가 이길 수 있다 (낡은 승자 — 값 소실은 없음)', () => {
    // 구버전 기기: 신버전이 만든 맵(T3)을 그대로 보존한 채 reportedToNeis를 T6에 편집
    // (맵은 못 올림 — 스키마를 모름)
    const oldDeviceSpread = rec({
      reportedToNeis: true,
      updatedAt: T(6),
      fieldUpdatedAt: { reportedToNeis: T(3) }, // 낡은 스탬프가 spread로 잔존
    });
    const newDevice = rec({
      reportedToNeis: false,
      updatedAt: T(4),
      fieldUpdatedAt: { reportedToNeis: T(4) },
    });

    const result = mergedRecord(oldDeviceSpread, newDevice);
    // (a)분기: T3 vs T4 → 신버전(T4)의 해제가 승리 — 구버전의 더 늦은(T6) 편집이 짐(의도적 교환)
    expect(result.reportedToNeis).toBe(false);
  });

  it('R1-c: 구버전(map-drop)의 무관 편집이 LWW 승자가 되면 체크가 부활할 수 있다 (record-LWW와 정확히 동일 — P4 바닥)', () => {
    // 구버전: 낡은 체크(true)를 가진 채 내용만 T7에 편집(맵 드롭)
    const oldDevice = rec({ reportedToNeis: true, content: '무관 편집', updatedAt: T(7) });
    // 신버전: T5에 체크 해제
    const newDevice = rec({
      reportedToNeis: false,
      updatedAt: T(5),
      fieldUpdatedAt: { reportedToNeis: T(5) },
    });

    const result = mergedRecord(newDevice, oldDevice);
    // 맵 부재 페어 = record-LWW 폴백: 구버전(T7)이 통째 승자 → 체크 부활(오늘 동작과 동일).
    expect(result.reportedToNeis).toBe(true);
  });
});

describe('mergeStudentRecords — C5 기존 동작 회귀 잠금', () => {
  it('record-LWW: updatedAt이 더 최근인 쪽이 비추적 필드의 기준(BASE)이 된다', () => {
    const local = rec({ content: '로컬', updatedAt: T(3) });
    const remote = rec({ content: '리모트', updatedAt: T(5) });
    expect(mergedRecord(local, remote).content).toBe('리모트');
    expect(mergedRecord(remote, local).content).toBe('리모트');
  });

  it('updatedAt 동률(구 데이터)은 createdAt 폴백, createdAt 동률은 tags 많은 쪽 우선(Q2 좀비 방지)', () => {
    const older = rec({ content: '옛것', createdAt: T(1) });
    const newer = rec({ content: '새것', createdAt: T(2) });
    expect(mergedRecord(older, newer).content).toBe('새것');

    const fewTags = rec({ content: '미변환', createdAt: T(1) });
    const moreTags = rec({ content: '변환본', createdAt: T(1), tags: ['칭찬'] });
    expect(mergedRecord(moreTags, fewTags).content).toBe('변환본');
  });

  it('한쪽에만 있는 레코드는 그대로 보존되고, categories는 항목 합집합 병합에 위임된다', () => {
    const onlyLocal = rec({ id: 'L' });
    const onlyRemote = rec({ id: 'R' });
    const merged = mergeStudentRecords(
      {
        records: [onlyLocal],
        categories: [{ id: 'c1', name: '로컬분류', color: '#fff', subcategories: [] }],
      },
      {
        records: [onlyRemote],
        categories: [{ id: 'c2', name: '리모트분류', color: '#000', subcategories: [] }],
      },
    );
    expect(merged.records.map((r) => r.id).sort()).toEqual(['L', 'R']);
    expect((merged.categories ?? []).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('추적 항목 채택이 없으면 레코드는 무변경 통과한다 (구 데이터 대량 재업로드 방지)', () => {
    const local = rec({ updatedAt: T(3) });
    const remote = rec({ updatedAt: T(5) });
    const result = mergedRecord(local, remote);
    expect(result).toEqual(remote); // 맵 신설 없이 BASE 그대로
    expect(result.fieldUpdatedAt).toBeUndefined();
  });
});

describe('applyRecordChange — before→after 의도 적용(B2)', () => {
  it('낡은 화면(before==after인 필드)은 patch에서 빠져 fresh 값이 보존된다 (QA B2 역검증)', () => {
    // 화면: sync 전 낡은 상태(reportedToNeis=true 잔존)에서 내용만 편집
    const staleScreen = rec({ reportedToNeis: true, content: '' });
    const edited = { ...staleScreen, content: '새 내용' };
    // 디스크: sync가 방금 해제(false)를 반영해 둠
    const fresh = rec({
      reportedToNeis: false,
      updatedAt: T(5),
      fieldUpdatedAt: { reportedToNeis: T(5) },
    });

    const result = applyRecordChange(fresh, { before: staleScreen, after: edited }, T(7));
    expect(result.content).toBe('새 내용'); // 사용자 의도 반영
    expect(result.reportedToNeis).toBe(false); // 낡은 true가 부활하지 않음
    expect(result.fieldUpdatedAt?.reportedToNeis).toBe(T(5)); // 기존 스탬프 미소거·미갱신
    expect(result.updatedAt).toBe(T(7));
  });

  it('바뀐 추적 필드는 after 값으로 절대 SET(F2 — CAS 아님)되고 해당 그룹만 now 스탬프된다', () => {
    const before = rec({ reportedToNeis: false });
    const after = { ...before, reportedToNeis: true };
    const fresh = rec({ reportedToNeis: true }); // 디스크가 이미 true여도(불일치) 의도대로 SET

    const result = applyRecordChange(fresh, { before, after }, T(7));
    expect(result.reportedToNeis).toBe(true);
    expect(result.fieldUpdatedAt?.reportedToNeis).toBe(T(7)); // 사용자 의도 시각 기록
    // 무관 그룹은 now가 아니라 백필값(맵 최초 신설 — 직전 updatedAt 없으면 createdAt).
    expect(result.fieldUpdatedAt?.documentGroup).toBe(T(1));
    expect(result.fieldUpdatedAt?.followUpDone).toBe(T(1));
  });

  it('documents 변경 시 documentSubmitted는 deriveDocumentSubmitted로 재계산된다 (H4 — 빈 배열 함정)', () => {
    const before = rec({
      documents: [{ kind: '신청서', submitted: true }],
      documentSubmitted: true,
    });
    const after: StudentRecord = { ...before, documents: [], documentSubmitted: false };
    const fresh = { ...before };

    const result = applyRecordChange(fresh, { before, after }, T(7));
    expect(result.documentSubmitted).toBe(false); // 빈 배열=미존재 → fallback(false), true 부활 없음
    expect(result.fieldUpdatedAt?.documentGroup).toBe(T(7));
  });

  it('followUp 3필드는 한 그룹 — 어느 하나만 바뀌어도 followUpDone 그룹이 스탬프된다', () => {
    const before = rec({ followUp: '가정 연락', followUpDone: false });
    const after = { ...before, followUpDate: '2026-07-20' };
    const result = applyRecordChange(rec(), { before, after }, T(7));
    expect(result.followUpDate).toBe('2026-07-20');
    expect(result.fieldUpdatedAt?.followUpDone).toBe(T(7));
  });

  it('완전 no-op(before==after)이면 fresh를 그대로 반환한다 — updatedAt 인플레이션 차단', () => {
    // 그리드 자동저장이 무변경 미러를 재기록해도 updatedAt이 오르면 record-LWW·
    // (b)백스톱 판정을 오염시켜 상대 기기의 진짜 편집을 이긴다(코드리뷰 E#2).
    const before = rec({ content: '동일' });
    const after = { ...before };
    const fresh = rec({ content: '동일', updatedAt: T(3) });

    const result = applyRecordChange(fresh, { before, after }, T(9));
    expect(result).toBe(fresh); // 참조까지 동일 — 쓰기 자체가 무의미함을 표현
    expect(result.updatedAt).toBe(T(3));
  });

  it('맵 최초 신설 시 미변경 그룹을 직전 updatedAt으로 백필한다 — 업그레이드 경계 P4 보호', () => {
    // 구버전 시절 나이스 체크(updatedAt=T5, 맵 없음) 후 신버전에서 서류만 체크하면,
    // 백필 없이는 reportedToNeis 유효시각이 createdAt(T1)으로 강등돼 record-LWW라면
    // 보호됐을 구 편집이 상대의 더 낡은 값에 진다(코드리뷰 A#3).
    const fresh = rec({ reportedToNeis: true, updatedAt: T(5) }); // 맵 없음(구버전 편집분)
    const before = { ...fresh };
    const after = { ...fresh, documentSubmitted: true };

    const result = applyRecordChange(fresh, { before, after }, T(7));
    expect(result.fieldUpdatedAt?.documentGroup).toBe(T(7)); // 변경 그룹 = now
    expect(result.fieldUpdatedAt?.reportedToNeis).toBe(T(5)); // 미변경 그룹 = 직전 updatedAt 백필
    expect(result.fieldUpdatedAt?.followUpDone).toBe(T(5));
  });

  it('무관 편집만 해도 맵이 백필 신설되어 (b)백스톱이 상대의 항목 편집을 못 이긴다', () => {
    // 기기 A: 추적 필드 무편집 레코드에 내용만 T9 수정 → 맵 백필(직전 updatedAt=T2).
    const freshA = rec({ updatedAt: T(2) });
    const editedA = applyRecordChange(
      freshA,
      { before: { ...freshA }, after: { ...freshA, content: '내용 수정' } },
      T(9),
    );
    expect(editedA.fieldUpdatedAt?.reportedToNeis).toBe(T(2)); // 백필 — updatedAt(T9) 아님

    // 기기 B: T5에 나이스 체크. 병합 시 A(T9)가 record-LWW BASE지만
    // reportedToNeis는 A 백필(T2) < B(T5) → B의 체크가 생존한다.
    const deviceB = rec({
      reportedToNeis: true,
      updatedAt: T(5),
      fieldUpdatedAt: { reportedToNeis: T(5) },
    });
    const merged = mergedRecord(editedA, deviceB);
    expect(merged.reportedToNeis).toBe(true);
    expect(merged.content).toBe('내용 수정'); // 비추적 필드는 BASE(A) 유지
  });
});
