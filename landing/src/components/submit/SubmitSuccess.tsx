'use client';

import type { AssignmentPublic } from './submitApi';

interface SubmittedInfo {
  grade: string;
  class: string;
  number: number;
  name: string;
  fileName: string | null;
  textContent: string | null;
  time: string;
}

interface SubmitSuccessProps {
  assignment: AssignmentPublic;
  submittedInfo: SubmittedInfo;
  onResubmit: () => void;
}

export function SubmitSuccess({ assignment, submittedInfo, onResubmit }: SubmitSuccessProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6 w-full max-w-sm">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-sp-text mb-6">제출되었습니다!</h2>

        <div className="bg-sp-card/50 border border-sp-border/50 rounded-xl p-5 mb-6 text-left space-y-3">
          <div>
            <p className="text-xs text-sp-muted mb-0.5">과제</p>
            <p className="text-sp-text font-medium">{assignment.title}</p>
          </div>
          <div>
            <p className="text-xs text-sp-muted mb-0.5">이름</p>
            <p className="text-sp-text">{submittedInfo.grade}학년 {submittedInfo.class}반 {submittedInfo.number}번 {submittedInfo.name}</p>
          </div>
          {submittedInfo.fileName && (
            <div>
              <p className="text-xs text-sp-muted mb-0.5">파일</p>
              <p className="text-sp-text truncate">{submittedInfo.fileName}</p>
            </div>
          )}
          {submittedInfo.textContent && (
            <div>
              <p className="text-xs text-sp-muted mb-0.5">텍스트</p>
              <p className="text-sp-text text-sm line-clamp-3 whitespace-pre-wrap">{submittedInfo.textContent}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-sp-muted mb-0.5">시간</p>
            <p className="text-sp-text">{submittedInfo.time}</p>
          </div>
        </div>

        {assignment.allowResubmit ? (
          <div>
            <p className="text-sp-muted text-sm mb-3">잘못 제출했다면 다시 제출할 수 있습니다.</p>
            <button
              onClick={onResubmit}
              className="px-6 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text hover:bg-sp-border/40 transition-colors inline-flex items-center gap-2 text-sm"
            >
              🔄 다시 제출
            </button>
          </div>
        ) : (
          <p className="text-sp-muted text-sm">이미 제출이 완료되었습니다.</p>
        )}
      </div>
    </div>
  );
}
