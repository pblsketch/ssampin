import { useState, useCallback, useMemo } from 'react';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';

interface StepStudentRosterProps {
  className: string;
  subjectCount: number;
  onBack: () => void;
  onComplete: (students: TeachingClassStudent[]) => void;
  onCancel: () => void;
}

type InputMode = 'number' | 'paste' | 'later';

const DEFAULT_ROSTER_SIZE = 30;

/** 위자드 Step 3 — 학생 명렬 입력. 3가지 모드(번호순/붙여넣기/나중에). */
export function StepStudentRoster({
  className,
  subjectCount,
  onBack,
  onComplete,
  onCancel,
}: StepStudentRosterProps) {
  const [mode, setMode] = useState<InputMode>('number');
  const [numberedNames, setNumberedNames] = useState<string[]>(() =>
    Array.from({ length: DEFAULT_ROSTER_SIZE }, () => ''),
  );
  const [pasteText, setPasteText] = useState('');
  const [saving, setSaving] = useState(false);

  /** 번호순 입력 모드의 학생 */
  const numberedStudents = useMemo<TeachingClassStudent[]>(() => {
    const list: TeachingClassStudent[] = [];
    numberedNames.forEach((rawName, idx) => {
      const name = rawName.trim();
      if (name) list.push({ number: idx + 1, name });
    });
    return list;
  }, [numberedNames]);

  /** 붙여넣기 모드의 학생 (정규식 파싱) */
  const pastedStudents = useMemo<TeachingClassStudent[]>(() => {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const list: TeachingClassStudent[] = [];
    let autoNumber = 1;
    for (const line of lines) {
      const match = /^\s*(\d+)?\s*(.+)$/.exec(line);
      if (!match) continue;
      const numStr = match[1];
      const name = (match[2] ?? '').trim();
      if (!name) continue;
      const number = numStr ? parseInt(numStr, 10) : autoNumber;
      list.push({ number, name });
      autoNumber = Math.max(autoNumber, number) + 1;
    }
    return list;
  }, [pasteText]);

  const currentStudents = useMemo<TeachingClassStudent[]>(() => {
    if (mode === 'number') return numberedStudents;
    if (mode === 'paste') return pastedStudents;
    return [];
  }, [mode, numberedStudents, pastedStudents]);

  const handleComplete = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onComplete(currentStudents);
    } finally {
      setSaving(false);
    }
  }, [saving, currentStudents, onComplete]);

  const updateNumberedName = useCallback((index: number, name: string) => {
    setNumberedNames((prev) => {
      const next = [...prev];
      next[index] = name;
      return next;
    });
  }, []);

  const studentCount = currentStudents.length;
  const canComplete = subjectCount > 0; // 학생 0명도 허용(나중에 입력)

  return (
    <div>
      <p className="text-sm text-sp-muted mb-4">
        <span className="text-sp-text font-medium">{className}</span>의 학생 명렬을 입력하세요.
        <span className="text-[11px] block mt-1">
          입력한 명렬은 선택한 {subjectCount}개 과목에 모두 공유됩니다.
        </span>
      </p>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-sp-surface rounded-lg p-0.5">
        <button
          onClick={() => setMode('number')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'number' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          번호순 입력
        </button>
        <button
          onClick={() => setMode('paste')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'paste' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          붙여넣기
        </button>
        <button
          onClick={() => setMode('later')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'later' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          나중에 입력
        </button>
      </div>

      {mode === 'number' && (
        <div className="max-h-72 overflow-y-auto grid grid-cols-2 gap-1.5 pr-1">
          {numberedNames.map((name, idx) => (
            <label
              key={idx}
              className="flex items-center gap-2 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 focus-within:border-sp-accent"
            >
              <span className="text-[11px] text-sp-muted w-6 text-right">
                {idx + 1}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => updateNumberedName(idx, e.target.value)}
                placeholder="이름"
                className="flex-1 min-w-0 bg-transparent text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none"
              />
            </label>
          ))}
        </div>
      )}

      {mode === 'paste' && (
        <div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`한 줄에 한 명씩 입력하세요.\n예)\n1 김철수\n2 이영희\n또는\n김철수\n이영희`}
            rows={10}
            className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent font-mono"
          />
          <p className="text-[11px] text-sp-muted mt-1">
            인식된 학생: <span className="text-sp-accent font-medium">{pastedStudents.length}명</span>
          </p>
        </div>
      )}

      {mode === 'later' && (
        <div className="py-8 text-center bg-sp-surface/60 border border-sp-border rounded-lg">
          <span className="material-symbols-outlined text-3xl text-sp-muted/50 mb-2 block">
            schedule
          </span>
          <p className="text-sm text-sp-muted">
            학생 명렬은 학급 생성 후<br />
            명렬 관리 탭에서 언제든 입력할 수 있습니다.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-[11px] text-sp-muted">
        <span>
          {mode !== 'later' && studentCount > 0 && (
            <>인식됨: <span className="text-sp-text font-medium">{studentCount}명</span></>
          )}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors disabled:opacity-40"
        >
          이전
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors disabled:opacity-40"
        >
          취소
        </button>
        <button
          onClick={() => void handleComplete()}
          disabled={!canComplete || saving}
          className="flex-[1.2] text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
        >
          {saving
            ? '생성 중...'
            : `${studentCount}명 · ${subjectCount}과목 생성`}
        </button>
      </div>
    </div>
  );
}
