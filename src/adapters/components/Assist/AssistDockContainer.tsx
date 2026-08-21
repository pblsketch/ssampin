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
import { rosterFrom } from '@domain/rules/redactOutbound';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import {
  countStudents,
  summarizeAttendance,
  summarizeRecords,
  summarizeTodos,
  toAttendanceRoll,
  toClassSummaries,
} from '@usecases/assist/summaries';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { assistPort } from '@adapters/di/container';

/**
 * ★담임 학급을 가리키는 내부 키.
 * 기록·명렬표(`students.json`)는 **담임 학급 한 반**의 것이라 학급 구분이 없다.
 * 집계 함수는 학급 id 로 거르게 돼 있으므로 여기서 같은 값을 양쪽에 넣어 준다.
 */
const HOMEROOM = 'homeroom';

/** 오늘 날짜(YYYY-MM-DD). 로컬 시간 기준 — 선생님이 보는 달력과 같아야 한다. */
function todayKey(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** 이번 달 1일 ~ 오늘. 기록 통계의 기본 기간이다. */
function monthRange(): { periodFrom: string; periodTo: string; periodLabel: string } {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    periodFrom: `${ym}-01`,
    periodTo: `${ym}-${String(now.getDate()).padStart(2, '0')}`,
    periodLabel: ym,
  };
}

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

/** 의도 판정에 필요한 앱 데이터. 스토어 자체가 아니라 **읽은 값**만 넘긴다. */
export interface IntentSources {
  readonly students: readonly { readonly name: string; readonly studentNumber?: number }[];
  readonly classes: readonly {
    readonly id: string;
    readonly name: string;
    readonly grade?: number;
    readonly students: readonly unknown[];
  }[];
  readonly todos: readonly {
    readonly text: string;
    readonly dueDate?: string;
    readonly completed: boolean;
  }[];
  readonly records: readonly {
    readonly studentId: string;
    readonly category: string;
    readonly subcategory: string;
    readonly date: string;
  }[];
}

/**
 * 아주 단순한 의도 판정 표.
 *
 * ★제안 칩(`AssistDock.SUGGESTIONS`) 문구가 여기 정규식에 **반드시 걸려야 한다.**
 * 칩을 눌렀는데 카드가 안 생기면 AI 가 아무 근거 없이 답하고, 남는 숫자도 없어 P5 가 깨진다.
 * 실제로 칩 4개 중 2개가 그랬다(UltraQA Cycle 2). `__tests__/assistIntent.test.ts` 가 지킨다.
 *
 * 표로 뽑아 둔 이유도 같다 — if 문이 흩어져 있으면 칩만 늘리고 규칙을 빠뜨린다.
 */
export const INTENT_RULES: readonly {
  readonly tool: string;
  readonly pattern: RegExp;
  readonly build: (question: string, src: IntentSources) => ToolResultShape;
}[] = [
  {
    tool: 'list_classes',
    pattern: /학급|반 목록|담당/,
    build: (_q, src) => toClassSummaries(src.classes) as unknown as ToolResultShape,
  },
  {
    tool: 'count_students',
    pattern: /몇 명|인원|학생 수/,
    // ★질문에 교과 학급 이름이 나오면 **그 학급의** 인원을, 아니면 담임 학급 인원을 센다.
    //   예전에는 담임 명렬표 인원을 교과 학급 이름으로 라벨링해 **다른 반 숫자**를 보였다.
    build: (question, src) => {
      const named = src.classes.find((c) => question.includes(c.name));
      return named
        ? (countStudents(named.students, named.name) as unknown as ToolResultShape)
        : (countStudents(src.students, '우리 반') as unknown as ToolResultShape);
    },
  },
  {
    tool: 'get_my_todos',
    pattern: /할 일|업무|마감/,
    build: (_q, src) => summarizeTodos(src.todos) as unknown as ToolResultShape,
  },
  {
    tool: 'get_attendance_summary',
    pattern: /출결|출석|결석|지각|조퇴/,
    build: (_q, src) => {
      const date = todayKey();
      const roll = toAttendanceRoll(src.records, {
        classId: HOMEROOM,
        date,
        rosterSize: src.students.length,
      });
      return summarizeAttendance([roll], {
        classId: HOMEROOM,
        className: '우리 반',
        date,
      }) as unknown as ToolResultShape;
    },
  },
  {
    tool: 'get_records_stats',
    pattern: /기록|관찰|상담|몇 건/,
    build: (_q, src) =>
      summarizeRecords(
        src.records.map((r) => ({ category: r.category, date: r.date, classId: HOMEROOM })),
        { classId: HOMEROOM, className: '우리 반', ...monthRange() },
      ) as unknown as ToolResultShape,
  },
];

/** 질문 → 숫자 카드. 순수 함수라 테스트에서 그대로 돌릴 수 있다. */
export function buildCards(question: string, src: IntentSources): Card[] {
  const cards: Card[] = [];
  for (const rule of INTENT_RULES) {
    if (!rule.pattern.test(question)) continue;
    const card = toCard(rule.tool, rule.build(question, src));
    if (card) cards.push(card);
  }
  return cards;
}

export function AssistDockContainer() {
  const enabled = useAssistStore((s) => s.enabled);
  const ask = useAssistStore((s) => s.ask);

  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const todos = useTodoStore((s) => s.todos);
  const records = useStudentRecordsStore((s) => s.records);

  // ★그물 ③ 이 쓸 명단. 이름을 지우려면 "무엇이 이름인지"를 알아야 하는데,
  //   domain 은 스토어를 import 하지 않으므로 여기서 만들어 넘긴다.
  const roster = useMemo(
    () => rosterFrom(students.map((s) => ({ name: s.name, studentNumber: s.studentNumber }))),
    [students],
  );

  const handleAsk = useMemo(
    () =>
      (question: string): void => {
        const cards = buildCards(question, { students, classes, todos, records });
        void ask(assistPort, question, cards, roster);
      },
    [ask, classes, records, roster, students, todos],
  );

  if (!enabled) return null;
  return <AssistDock onAsk={handleAsk} />;
}
