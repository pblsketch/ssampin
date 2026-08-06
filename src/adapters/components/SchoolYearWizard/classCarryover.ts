/**
 * classCarryover — 구조 승계(S4.3) 실행 어댑터.
 *
 * 전환이 **성공한 뒤에만** 호출된다(opt-in, 기본 OFF — 실행 전 파일 쓰기 0).
 * 아카이브의 teaching-classes.json을 archive:read(체크섬 검증 포함)로 읽어
 * 이름·과목·그룹 구조만 계획(planClassStructureCarryover)한 뒤,
 * **기존 스토어 액션(addClassGroup/addClass)만으로** 새 수업반을 만든다 —
 * 신규 저장 경로 0, 아카이브 무변경(읽기 전용 IPC만 사용).
 *
 * 실패는 {ok:false, error}로 표면화한다 — 전환 자체는 이미 완료된 상태이므로
 * 승계 실패가 전환을 되돌리지 않는다(수업반은 수업 관리에서 직접 만들 수 있다).
 */

import { planClassStructureCarryover } from '@domain/rules/classStructureCarryover';
import type { YearTransitionGateway } from '@usecases/schoolYear/ExecuteYearTransition';

export type ClassCarryoverResult =
  | { readonly ok: true; readonly createdCount: number }
  | { readonly ok: false; readonly error: string };

export async function carryOverClassStructure(
  gateway: Pick<YearTransitionGateway, 'archiveRead'>,
  closingTerm: string,
): Promise<ClassCarryoverResult> {
  try {
    const read = await gateway.archiveRead(closingTerm, 'teaching-classes.json');
    if (!read.ok) {
      return { ok: false, error: `보관된 수업반을 읽지 못했어요: ${read.error}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.content);
    } catch {
      return { ok: false, error: '보관된 수업반 파일을 해석할 수 없어요.' };
    }
    const plan = planClassStructureCarryover(parsed);
    if (plan.totalClassCount === 0) {
      return { ok: true, createdCount: 0 };
    }
    // 스토어는 지연 import — 마법사 모달의 정적 import 체인을 무겁게 만들지 않는다
    // (syncRegistry의 lazy 스토어 참조 선례).
    const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
    const store = useTeachingClassStore.getState();
    for (const group of plan.groups) {
      await store.addClassGroup(group.name, group.subjects, []);
    }
    for (const single of plan.singles) {
      await store.addClass(single.name, single.subject, []);
    }
    return { ok: true, createdCount: plan.totalClassCount };
  } catch (err) {
    return {
      ok: false,
      error: `수업반 틀 가져오기에 실패했어요: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
