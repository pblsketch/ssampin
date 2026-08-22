/**
 * 쌤핀 전용 필드가 **모든 저장 경로에 빠짐없이 등재돼 있는지** 검사한다.
 *
 * 왜 이런 테스트가 필요한가:
 * 할 일을 고치는 길은 두 갈래다 — 화면이 쓰는 `useTodoStore.updateTodo` 와 그 아래
 * `ManageTodos.updateTodo`. 두 곳 모두 **받을 필드를 목록으로 못 박아 두고 있다.**
 * 새 필드를 한쪽에만 넣으면 타입은 통과하는데 값이 저장되지 않거나, 반대로
 * 구글 쓰기를 막는 판정에서 새어 나간다. 이 저장소는 "미러 한쪽만 고쳐 조용히 어긋난"
 * 사고를 여러 번 겪어 `startupMode.mirror.test.ts` 같은 검사를 이미 두고 있다.
 *
 * ★ 이 검사는 **소스 텍스트**를 본다. 목록이 타입 정의라 실행 시점에는 존재하지 않기
 *   때문이다(타입은 컴파일되면 사라진다).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TODO_LOCAL_ONLY_FIELDS } from '@domain/entities/Todo';

const STORE = 'src/adapters/stores/useTodoStore.ts';
const USECASE = 'src/usecases/todo/ManageTodos.ts';

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('쌤핀 전용 필드 미러', () => {
  it('두 필드가 정의돼 있다 (목록이 비면 이 검사가 무력해진다)', () => {
    expect(TODO_LOCAL_ONLY_FIELDS).toEqual(['checkAt', 'relatedStaff']);
  });

  it.each(TODO_LOCAL_ONLY_FIELDS)(
    "'%s' 가 useTodoStore.updateTodo 가 받는 필드 목록에 있다",
    (field) => {
      expect(sourceOf(STORE)).toContain(`'${field}'`);
    },
  );

  it.each(TODO_LOCAL_ONLY_FIELDS)(
    "'%s' 가 ManageTodos.updateTodo 가 받는 필드 목록에 있다",
    (field) => {
      expect(sourceOf(USECASE)).toContain(`'${field}'`);
    },
  );

  it('양쪽 모두 TODO_LOCAL_ONLY_FIELDS 로 구글 쓰기를 막는 판정을 한다', () => {
    // 한쪽만 막으면 화면은 통과하는데 저장 파일에는 예약이 박혀,
    // 재시작·드라이브 리로드 뒤에 구글 쓰기가 나간다.
    expect(sourceOf(STORE)).toContain('TODO_LOCAL_ONLY_FIELDS');
    expect(sourceOf(USECASE)).toContain('TODO_LOCAL_ONLY_FIELDS');
  });

  it('유스케이스는 변경 키를 넘겨 판정한다 — 넘기지 않으면 방어가 꺼진다', () => {
    expect(sourceOf(USECASE)).toMatch(/withSyncMeta\([^)]*changedKeys\)/);
  });
});
