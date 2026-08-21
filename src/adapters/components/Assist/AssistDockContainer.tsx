/**
 * 쌤핀 AI — 도구 실행과 화면을 잇는 자리
 *
 * ★조회는 **여기서, 선생님 컴퓨터 안에서** 끝난다.
 * 서버로 나가는 것은 재구성을 거친 집계 숫자뿐이다 — "이름은 화면에 남고, 숫자만 밖으로 나간다".
 *
 * ★도구 선택은 지금 **앱이 한다**(계획서 옵션 B 형태).
 * 모델이 고르게 하려면 도구 스키마·2턴 왕복이 필요한데, 그건 Phase 3 범위 밖이다.
 * 지금은 제안 칩과 간단한 의도 판정으로 고르고, 모델은 **숫자를 문장으로 바꾸는 일**만 한다.
 * 실측에서 solar-pro3 의 도구 선택은 100% 였으므로 나중에 옵션 A 로 올리는 것은 열려 있다.
 */
import { useMemo } from 'react';

import { AssistDock } from './AssistDock';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { countStudents, summarizeTodos, toClassSummaries } from '@usecases/assist/summaries';
import { assistPort } from '@adapters/di/container';

interface Card {
  readonly tool: string;
  readonly data: ModelSafe<ToolResultShape>;
}

/** 재구성을 거친 카드만 만든다. 여기가 그물 ②를 통과하는 유일한 통로다. */
function toCard(toolId: string, raw: ToolResultShape): Card | null {
  const tool = findAssistTool(toolId);
  if (!tool) return null;
  return { tool: tool.id, data: sanitizeToolResult(tool, raw) };
}

export function AssistDockContainer() {
  const enabled = useAssistStore((s) => s.enabled);
  const ask = useAssistStore((s) => s.ask);

  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const todos = useTodoStore((s) => s.todos);

  const handleAsk = useMemo(
    () =>
      (question: string): void => {
        const cards: Card[] = [];

        // 아주 단순한 의도 판정. 제안 칩이 주 경로이므로 여기서 과하게 추측하지 않는다.
        if (/학급|반 목록|담당/.test(question)) {
          const card = toCard(
            'list_classes',
            toClassSummaries(classes) as unknown as ToolResultShape,
          );
          if (card) cards.push(card);
        }
        if (/몇 명|인원|학생 수/.test(question)) {
          const card = toCard(
            'count_students',
            countStudents(students, classes[0]?.name ?? '') as unknown as ToolResultShape,
          );
          if (card) cards.push(card);
        }
        if (/할 일|업무|마감/.test(question)) {
          const card = toCard('get_my_todos', summarizeTodos(todos) as unknown as ToolResultShape);
          if (card) cards.push(card);
        }

        void ask(assistPort, question, cards);
      },
    [ask, classes, students, todos],
  );

  if (!enabled) return null;
  return <AssistDock onAsk={handleAsk} />;
}
