import type { MiniApp } from '@domain/entities/MiniApp';

/**
 * 주어진 순서(orderedIds)대로 order 필드를 0부터 재부여한다(순수함수, 파일 I/O 없음).
 *
 * orderedIds에 없는 기존 앱(방어적 케이스 — 정상 흐름에선 발생하지 않음)은
 * 데이터 유실을 막기 위해 원래 상대 순서를 유지한 채 뒤에 이어붙인다.
 *
 * @returns order가 재계산된 새 목록(원본 배열은 변경하지 않음)
 */
export function reorderMiniApps(
  orderedIds: readonly string[],
  existing: readonly MiniApp[],
): readonly MiniApp[] {
  const remaining = new Map(existing.map((app) => [app.id, app] as const));
  const reordered: MiniApp[] = [];
  let order = 0;

  for (const id of orderedIds) {
    const app = remaining.get(id);
    if (!app) continue;
    reordered.push({ ...app, order: order++ });
    remaining.delete(id);
  }
  // orderedIds에 빠진 앱이 있다면(방어적) 기존 상대 순서를 유지하며 뒤에 붙인다.
  for (const app of existing) {
    if (remaining.has(app.id)) {
      reordered.push({ ...app, order: order++ });
    }
  }

  return reordered;
}
