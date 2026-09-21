/**
 * QnaList — 교사 콘솔의 "질문 받기" 실시간 목록.
 *
 * 교실 화면(Share)에는 이름을 표시하지 않지만, **교사 화면에서는 누가 냈는지 보여준다**.
 * (사용자 결정: 화면 익명 + 콘솔 실명. 한쪽으로 몰지 않는다.)
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-muted
 */

import { memo, useMemo } from 'react';
import type { QnaQuestion } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface QnaListProps {
  readonly question: QnaQuestion;
  readonly responses: readonly Response[];
  readonly students: readonly StudentProfile[];
}

interface QnaItem {
  readonly id: string;
  readonly text: string;
  readonly nickname: string;
}

function QnaListImpl({ question, responses, students }: QnaListProps): JSX.Element {
  const items = useMemo<readonly QnaItem[]>(() => {
    const nicknameById = new Map(students.map((s) => [s.studentId, s.nickname]));
    return responses
      .filter((r) => r.questionId === question.id && typeof r.answer === 'string')
      .map((r) => ({
        id: r.id,
        text: r.answer as string,
        nickname: nicknameById.get(r.studentId) ?? '알 수 없음',
      }));
  }, [responses, students, question.id]);

  return (
    <section
      className="flex w-full flex-col gap-3 rounded-2xl border border-sp-border bg-sp-card p-6"
      aria-label="들어온 질문"
    >
      <header className="flex items-baseline justify-between">
        <span className="font-sp-semibold text-sp-text" style={{ fontSize: 20 }}>
          들어온 질문
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 14 }}>
          {items.length}개
        </span>
      </header>

      {items.length === 0 ? (
        <p
          className="py-8 text-center font-sp-medium text-sp-muted"
          style={{ fontSize: 16 }}
          role="status"
        >
          아직 들어온 질문이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-lg border border-sp-border bg-sp-bg/40 px-4 py-3"
            >
              <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
                {item.text}
              </span>
              <span className="font-sp-medium text-sp-muted" style={{ fontSize: 13 }}>
                {item.nickname}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="font-sp-medium text-sp-muted" style={{ fontSize: 13 }}>
        교실 화면에는 이름이 나오지 않습니다.
      </p>
    </section>
  );
}

export const QnaList = memo(QnaListImpl);
