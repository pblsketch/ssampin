/**
 * 할 일을 저장하지 못했을 때 선생님께 알린다.
 *
 * 추가 화면들은 `void addTodo(...)` 로 부르고 입력창을 바로 비운다. 저장이 실패하면 예전에는
 * 아무 표시 없이 글만 사라졌다("입력해도 목록에 안 뜬다"). 실패를 삼키지 않고 알린다.
 *
 * 내용(할 일 제목)은 콘솔에 남기지 않는다 — 학생 이름이 들어갈 수 있다.
 */
export function reportTodoSaveFailure(err: unknown): void {
  console.error(
    '[Todo] 저장 실패:',
    err instanceof Error ? err.message.slice(0, 200) : '알 수 없는 오류',
  );
  void import('@adapters/components/common/Toast')
    .then(({ useToastStore }) => {
      useToastStore
        .getState()
        .show(
          '할 일을 저장하지 못했어요. 입력한 글은 그대로 두었으니 잠시 뒤 다시 눌러 주세요.',
          'error',
          undefined,
          6000,
        );
    })
    .catch(() => undefined);
}
