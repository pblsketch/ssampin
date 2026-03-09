'use client';

import type { AssignmentPublic } from './submitApi';

interface SubmitExpiredProps {
  assignment: AssignmentPublic;
}

export function SubmitExpired({ assignment }: SubmitExpiredProps) {
  const deadline = new Date(assignment.deadline);
  const dateText = `${deadline.getFullYear()}년 ${deadline.getMonth() + 1}월 ${deadline.getDate()}일 ${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-sp-text mb-4">마감되었습니다</h2>
        <div className="bg-sp-card/50 border border-sp-border/50 rounded-xl p-4 mb-6 text-left max-w-sm mx-auto">
          <p className="text-sm text-sp-muted mb-1">과제</p>
          <p className="text-sp-text font-medium mb-3">{assignment.title}</p>
          <p className="text-sm text-sp-muted mb-1">마감</p>
          <p className="text-sp-text">{dateText}</p>
        </div>
        <p className="text-sp-muted text-sm">선생님께 문의하세요.</p>
      </div>
    </div>
  );
}
