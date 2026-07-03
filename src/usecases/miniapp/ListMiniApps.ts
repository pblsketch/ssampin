import type { MiniApp } from '@domain/entities/MiniApp';

/** 표시 순서(order 오름차순)로 정렬한 사본을 반환한다(순수함수, 원본 배열 불변). */
export function listMiniApps(existing: readonly MiniApp[]): readonly MiniApp[] {
  return [...existing].sort((a, b) => a.order - b.order);
}
