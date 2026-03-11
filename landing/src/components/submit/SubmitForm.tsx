'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AssignmentPublic } from './submitApi';
import { submitAssignment } from './submitApi';
import { SubmitSuccess } from './SubmitSuccess';
import { SubmitExpired } from './SubmitExpired';

interface SubmitFormProps {
  assignment: AssignmentPublic;
}

type ViewState = 'form' | 'success' | 'expired';

const FILE_TYPE_ACCEPT: Record<string, string> = {
  all: '*/*',
  image: '.jpg,.jpeg,.png,.gif,.heic,.webp',
  document: '.pdf,.hwp,.hwpx,.docx,.doc,.pptx,.xlsx,.txt',
};

const FILE_TYPE_LABELS: Record<string, string> = {
  all: '모든 파일',
  image: 'JPG, PNG, GIF, HEIC, WEBP',
  document: 'PDF, HWP, HWPX, DOCX, PPTX, XLSX, TXT',
};

export function SubmitForm({ assignment }: SubmitFormProps) {
  const [view, setView] = useState<ViewState>('form');
  const [studentGrade, setStudentGrade] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameWarning, setNameWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState('');
  const [textContent, setTextContent] = useState('');
  const [submittedInfo, setSubmittedInfo] = useState<{
    grade: string;
    class: string;
    number: number;
    name: string;
    fileName: string | null;
    textContent: string | null;
    time: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer
  useEffect(() => {
    function updateRemaining() {
      const now = new Date().getTime();
      const deadlineTime = new Date(assignment.deadline).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        if (!assignment.allowLate) {
          setView('expired');
        }
        setRemainingTime('마감됨');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setRemainingTime(`${days}일 ${hours}시간`);
      } else if (hours > 0) {
        setRemainingTime(`${hours}시간 ${minutes}분`);
      } else {
        setRemainingTime(`${minutes}분`);
      }
    }

    updateRemaining();
    const interval = setInterval(updateRemaining, 60_000);
    return () => clearInterval(interval);
  }, [assignment.deadline, assignment.allowLate]);

  // Student number auto-fill
  useEffect(() => {
    const num = parseInt(studentNumber, 10);
    if (isNaN(num)) {
      setStudentName('');
      setNameWarning(false);
      return;
    }

    const matches = assignment.students.filter((s) => s.number === num);
    if (matches.length === 1) {
      setStudentName(matches[0].name);
      setNameWarning(false);
    } else if (matches.length > 1) {
      // 번호가 같은 학생이 여러 명 (수업반) → 이름 직접 입력
      setStudentName('');
      setNameWarning(false);
    } else {
      setStudentName('');
      setNameWarning(true);
    }
  }, [studentNumber, assignment.students]);

  const acceptAttr = FILE_TYPE_ACCEPT[assignment.fileTypeRestriction] ?? '*/*';
  const st = assignment.submitType ?? 'file'; // 기존 과제 호환: 기본값 'file'
  const showFile = st === 'file' || st === 'both';
  const showText = st === 'text' || st === 'both';

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (selected.size > MAX_SIZE) {
      setError('파일 크기는 10MB 이하만 가능합니다');
      setFile(null);
      return;
    }

    setError(null);
    setFile(selected);
  }, []);

  async function handleSubmit() {
    const num = parseInt(studentNumber, 10);
    if (isNaN(num)) return;

    const hasFile = !!file;
    const hasText = !!textContent.trim();
    if (!hasFile && !hasText) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitAssignment({
        assignmentId: assignment.id,
        studentGrade: studentGrade.trim(),
        studentClass: studentClass.trim(),
        studentNumber: num,
        studentName,
        file: hasFile ? file : undefined,
        textContent: hasText ? textContent : undefined,
      });

      if (result.success) {
        const now = new Date();
        setSubmittedInfo({
          grade: studentGrade.trim(),
          class: studentClass.trim(),
          number: num,
          name: studentName,
          fileName: hasFile ? file.name : null,
          textContent: hasText ? textContent : null,
          time: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        });
        setView('success');
      } else {
        setError(result.message);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleResubmit() {
    setFile(null);
    setTextContent('');
    setSubmittedInfo(null);
    setError(null);
    setView('form');
  }

  if (view === 'expired') {
    return <SubmitExpired assignment={assignment} />;
  }

  if (view === 'success' && submittedInfo) {
    return (
      <SubmitSuccess
        assignment={assignment}
        submittedInfo={submittedInfo}
        onResubmit={handleResubmit}
      />
    );
  }

  const deadline = new Date(assignment.deadline);
  const deadlineText = `${deadline.getFullYear()}년 ${deadline.getMonth() + 1}월 ${deadline.getDate()}일 ${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`;
  const canSubmit = studentGrade.trim() && studentClass.trim() && studentNumber && studentName && !isSubmitting && (file || textContent.trim());

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Assignment info */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-sp-text mb-2">{assignment.title}</h2>
        {assignment.description && (
          <p className="text-sp-muted text-sm mb-3">{assignment.description}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sp-muted">
          <span>마감: {deadlineText}</span>
          <span className={`font-medium ${remainingTime === '마감됨' ? 'text-red-400' : 'text-sp-accent'}`}>
            남은 시간: {remainingTime}
          </span>
        </div>
      </div>

      <div className="h-px bg-sp-border/50 mb-6" />

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Student grade / class / number — 한 줄 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-sp-text mb-1.5">학년 / 반 / 번호</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              id="student-grade"
              type="text"
              inputMode="numeric"
              value={studentGrade}
              onChange={(e) => setStudentGrade(e.target.value)}
              placeholder="학년"
              className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors text-lg text-center"
            />
          </div>
          <div className="flex-1">
            <input
              id="student-class"
              type="text"
              inputMode="numeric"
              value={studentClass}
              onChange={(e) => setStudentClass(e.target.value)}
              placeholder="반"
              className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors text-lg text-center"
            />
          </div>
          <div className="flex-1">
            <input
              id="student-number"
              type="number"
              inputMode="numeric"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              placeholder="번호"
              min={1}
              className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors text-lg text-center"
            />
          </div>
        </div>
      </div>

      {/* Student name */}
      <div className="mb-4">
        <label htmlFor="student-name" className="block text-sm font-medium text-sp-text mb-1.5">이름</label>
        <input
          id="student-name"
          type="text"
          value={studentName}
          onChange={(e) => {
            setStudentName(e.target.value);
            const found = assignment.students.some((s) => s.name === e.target.value);
            setNameWarning(!!e.target.value && !found);
          }}
          placeholder="이름을 입력하세요"
          className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors text-lg"
        />
        {nameWarning && (
          <p className="text-amber-400 text-xs mt-1">명단에 없는 학생입니다</p>
        )}
      </div>

      <div className="h-px bg-sp-border/50 my-6" />

      {/* File selection */}
      {showFile && (
      <div className="mb-5">
        <label className="block text-sm font-medium text-sp-text mb-1.5">📎 파일 첨부{st === 'both' && <span className="text-sp-muted font-normal"> (선택)</span>}</label>

        {file ? (
          <div className="flex items-center gap-3 p-3 bg-sp-card border border-sp-accent/30 rounded-lg">
            <span className="text-sp-accent text-lg">📎</span>
            <div className="flex-1 min-w-0">
              <p className="text-sp-text text-sm truncate">{file.name}</p>
              <p className="text-sp-muted text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button
              onClick={() => setFile(null)}
              aria-label="파일 제거"
              className="text-sp-muted hover:text-red-400 transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="파일 선택"
              className="flex-1 px-4 py-3 bg-sp-card border border-sp-border border-dashed rounded-lg text-sp-muted hover:border-sp-accent/50 hover:text-sp-text transition-colors flex items-center justify-center gap-2 text-sm"
            >
              📎 파일 선택
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              aria-label="카메라 촬영"
              className="flex-1 px-4 py-3 bg-sp-card border border-sp-border border-dashed rounded-lg text-sp-muted hover:border-sp-accent/50 hover:text-sp-text transition-colors flex items-center justify-center gap-2 text-sm"
            >
              📷 카메라
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttr}
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        <p className="text-xs text-sp-muted/60 mt-1.5">
          허용: {FILE_TYPE_LABELS[assignment.fileTypeRestriction] ?? '모든 파일'} · 최대 10MB
        </p>
      </div>
      )}

      {/* Text submission */}
      {showText && (
      <div className="mb-6">
        <label htmlFor="text-content" className="block text-sm font-medium text-sp-text mb-1.5">✏️ 텍스트 입력{st === 'both' && <span className="text-sp-muted font-normal"> (선택)</span>}</label>
        <textarea
          id="text-content"
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="과제 내용을 입력하세요 (선택)"
          rows={5}
          className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors resize-none text-sm"
        />
        {st === 'both' && (
          <p className="text-xs text-sp-muted/60 mt-1.5">
            파일과 텍스트를 함께 제출하거나, 하나만 제출할 수도 있습니다
          </p>
        )}
      </div>
      )}

      {/* Submit button */}
      <button
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
        aria-label="과제 제출"
        className={`w-full py-4 rounded-lg font-medium text-lg transition-colors flex items-center justify-center gap-2 ${
          canSubmit
            ? 'bg-sp-accent text-white hover:bg-sp-accent-hover'
            : 'bg-sp-border text-sp-muted cursor-not-allowed'
        }`}
      >
        {isSubmitting ? (
          <>⏳ 제출 중...</>
        ) : (
          <>📤 제출하기</>
        )}
      </button>
    </div>
  );
}
