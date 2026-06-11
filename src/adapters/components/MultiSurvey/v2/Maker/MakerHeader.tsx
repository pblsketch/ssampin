/**
 * MakerHeader — sticky top, 세션 선택기 + 제목 입력 + 액션바
 *
 * 액션: 세션 전환/새 설문/삭제 / 저장 / 설문(퀴즈) 시작
 * - 저장: 세션은 입력 즉시 자동 저장(zustand persist)되므로 클릭 시 "저장됨 ✓" 확인 피드백만 표시
 * - 시작: validateSession 통과 시에만 활성. 실패 사유는 title 툴팁으로 노출
 * - 삭제: 2단계 확인 (한 번 더 클릭) — 세션 1개뿐이면 미노출
 *
 * sp-* 토큰: sp-surface, sp-border, sp-text, sp-accent, sp-muted, sp-shadow-sm
 */

import { useEffect, useRef, useState } from 'react';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { validateSession } from '@domain/rules/multiSurveyRules';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';

interface MakerHeaderProps {
  readonly session: MultiSurveyV2;
  readonly onSave?: () => void;
  readonly onStartGame?: () => void;
}

/**
 * 시작을 막는 첫 번째 사유를 교사용 한국어 안내로 변환.
 * (validateSession 의 도메인 메시지는 개발자용 — 화면 노출용으로 재구성)
 * 여기서 못 잡는 사유는 validateSession.errors[0] 로 폴백.
 */
function startBlockerMessage(session: MultiSurveyV2): string | null {
  if (!session.title || session.title.trim().length === 0) {
    return '설문 제목을 입력해주세요';
  }
  if (session.questions.length === 0) {
    return '문항을 1개 이상 추가해주세요';
  }
  for (let i = 0; i < session.questions.length; i += 1) {
    const q = session.questions[i]!;
    const n = i + 1;
    if (!q.text || q.text.trim().length === 0) {
      return `${n}번 문항의 내용을 입력해주세요`;
    }
    switch (q.type) {
      case 'single-choice':
      case 'multi-choice':
        if (q.options.length === 0) return `${n}번 문항의 보기를 추가해주세요`;
        break;
      case 'multiple':
        if (q.choices.length === 0) return `${n}번 문항의 보기를 추가해주세요`;
        if (q.correctChoiceIds.length === 0) return `${n}번 문항의 정답을 선택해주세요`;
        break;
      case 'short':
      case 'blank':
        if (q.acceptedAnswers.length === 0) return `${n}번 문항의 정답을 입력해주세요`;
        break;
      default:
        break;
    }
  }
  return null;
}

export function MakerHeader({ session, onSave, onStartGame }: MakerHeaderProps): JSX.Element {
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const selectSession = useMultiSurveyV2Store((s) => s.selectSession);
  const createSession = useMultiSurveyV2Store((s) => s.createSession);
  const deleteSession = useMultiSurveyV2Store((s) => s.deleteSession);
  const updateSession = useMultiSurveyV2Store((s) => s.updateSession);
  const startLive = useMultiSurveyV2Store((s) => s.startLive);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleCreateSession = (): void => {
    const created = createSession({ title: '새 설문' });
    selectSession(created.id);
  };

  const handleDeleteSession = (): void => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmTimerRef.current = window.setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmDelete(false);
    const fallback = sessions.find((s) => s.id !== session.id);
    deleteSession(session.id);
    if (fallback) selectSession(fallback.id);
  };

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    updateSession(session.id, { title: event.target.value });
  };

  const validation = validateSession(session);
  const canStart = validation.ok;
  const startBlockedReason = validation.ok
    ? undefined
    : (startBlockerMessage(session) ?? validation.errors[0]);

  const handleStart = (): void => {
    if (!canStart) return;
    if (onStartGame) {
      onStartGame();
      return;
    }
    startLive(session.id);
  };

  const handleSave = (): void => {
    // 세션 본문은 store 업데이트 시점에 이미 영속화됨 — 확인 피드백만 제공
    onSave?.();
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <header
      className={[
        'sticky top-0 z-10 bg-sp-surface border-b border-sp-border shadow-sp-sm',
        'flex items-center gap-3 px-4 py-3',
      ].join(' ')}
      aria-label="메이커 헤더"
    >
      <label className="sr-only" htmlFor="maker-session-select">
        설문 선택
      </label>
      <select
        id="maker-session-select"
        value={session.id}
        onChange={(e) => selectSession(e.target.value)}
        className={[
          'shrink-0 max-w-[180px] px-2 py-2 text-sm font-sp-medium rounded-lg',
          'bg-sp-surface text-sp-text border border-sp-border',
          'hover:border-sp-muted',
          'focus:outline-none focus:border-sp-accent focus:ring-2 focus:ring-sp-accent/30',
          'transition-colors duration-sp-base motion-reduce:transition-none',
        ].join(' ')}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title.trim().length > 0 ? s.title : '(제목 없음)'}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleCreateSession}
        title="새 설문 만들기"
        aria-label="새 설문 만들기"
        className={[
          'shrink-0 px-2.5 py-1.5 text-sm font-sp-medium rounded-lg',
          'border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-bg/40',
          'transition-colors duration-sp-base motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
        ].join(' ')}
      >
        + 새 설문
      </button>
      {sessions.length > 1 && (
        <button
          type="button"
          onClick={handleDeleteSession}
          title={confirmDelete ? '한 번 더 누르면 삭제됩니다' : '현재 설문 삭제'}
          aria-label={confirmDelete ? '한 번 더 누르면 삭제됩니다' : '현재 설문 삭제'}
          className={[
            'shrink-0 px-2.5 py-1.5 text-sm font-sp-medium rounded-lg border',
            confirmDelete
              ? 'border-sp-error text-sp-error hover:bg-sp-error/10'
              : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-bg/40',
            'transition-colors duration-sp-base motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
          ].join(' ')}
        >
          {confirmDelete ? '정말 삭제?' : '삭제'}
        </button>
      )}

      <label className="sr-only" htmlFor="maker-title-input">
        세션 제목
      </label>
      <input
        id="maker-title-input"
        type="text"
        value={session.title}
        onChange={handleTitleChange}
        placeholder="세션 제목을 입력하세요"
        className={[
          'flex-1 min-w-0 px-3 py-2 bg-transparent text-base font-sp-semibold text-sp-text',
          'border border-transparent rounded-lg',
          'placeholder:text-sp-muted',
          'hover:border-sp-border',
          'focus:outline-none focus:border-sp-accent focus:ring-2 focus:ring-sp-accent/30',
          'transition-colors duration-sp-base motion-reduce:transition-none',
        ].join(' ')}
      />

      <div className="shrink-0 flex items-center gap-2" role="toolbar" aria-label="액션">
        {startBlockedReason && (
          <span className="text-xs font-sp-medium text-sp-warning" role="status" aria-live="polite">
            {startBlockedReason}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          className={[
            'px-3 py-1.5 text-sm font-sp-medium rounded-lg',
            'border border-sp-border text-sp-text hover:bg-sp-bg/40',
            'transition-colors duration-sp-base motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
          ].join(' ')}
        >
          <span aria-live="polite">{savedFlash ? '저장됨' : '저장'}</span>
          {savedFlash && <span aria-hidden="true"> ✓</span>}
        </button>
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          title={startBlockedReason}
          className={[
            'px-4 py-1.5 text-sm font-sp-semibold rounded-lg',
            'bg-sp-accent text-[color:var(--sp-accent-fg)] shadow-sp-sm hover:shadow-sp-md',
            'transition-shadow duration-sp-base motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-surface',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
          ].join(' ')}
        >
          설문(퀴즈) 시작
        </button>
      </div>
    </header>
  );
}
