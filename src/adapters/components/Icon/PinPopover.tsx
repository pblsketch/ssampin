/**
 * PinPopover — 핀 클릭 시 열리는 "오늘 요약" 미니 카드 (v2.2.7).
 *
 * 아이콘 모드의 재정의: 핀은 본체 창으로 돌아가는 문이 아니라, 그 자리에서
 * 오늘 하루(수업·마감 할 일·급식)를 확인하고 할 일을 한 줄로 추가하는 작은 비서.
 * 참고: 창 전환 없이 "그 자리에서 열리는" 경험이 목표 — 전체 앱은 푸터 버튼으로.
 *
 * 디자인: sp-* 토큰만 사용(하드코딩 HEX 금지), rounded-xl, 그림자 절제(shadow-lg).
 * 투명 Electron 창 위에 뜨므로 카드 밖은 완전 투명이어야 한다.
 */
import { useRef, useState } from 'react';
import type { PinTodayClass, PinDueTodoItem } from './pinPresence';
import { PIN_NAME } from './pinName';

const DAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface PinPopoverProps {
  readonly now: Date;
  /** 현재 상태 한 줄 (buildSummary().title — 예: "3교시 수학 · 2-3" / "쉬는 시간") */
  readonly statusTitle: string;
  readonly classes: readonly PinTodayClass[];
  readonly todos: readonly PinDueTodoItem[];
  /** 오늘 중식 요약 (없으면 null) */
  readonly lunchMenu: string | null;
  readonly onToggleTodo: (id: string) => void;
  readonly onQuickAdd: (text: string) => Promise<void>;
  readonly onOpenWidget: () => void;
  readonly onOpenMain: () => void;
}

export function PinPopover({
  now,
  statusTitle,
  classes,
  todos,
  lunchMenu,
  onToggleTodo,
  onQuickAdd,
  onOpenWidget,
  onOpenMain,
}: PinPopoverProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${DAY_LABEL[now.getDay()]})`;

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onQuickAdd(text);
      setDraft('');
    } finally {
      setBusy(false);
      // 연속 입력 — 추가 직후 포커스를 되돌려 바로 다음 할 일을 칠 수 있게 (사용자 요청).
      // input 을 disabled 로 잠그면 그 순간 포커스를 잃으므로 busy 는 내부 가드로만 쓴다.
      inputRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`${PIN_NAME} 오늘 요약`}
      /* max-h 는 아이콘 창(뷰포트) 높이 기준 — 내용이 길어도 창 밖으로 넘쳐 헤더가
         잘리지 않게 스스로 창 안에 맞춘다(위로 열릴 때도 안전). 창 크기와 무관. */
      className="flex flex-col w-[300px] max-h-[calc(100vh-84px)] bg-sp-card border border-sp-border rounded-xl shadow-lg overflow-hidden animate-pin-bubble-pop"
    >
      {/* 헤더 — 제목 + 날짜 + 현재 상태 (고정) */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2.5 border-b border-sp-border">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-sp-text">{PIN_NAME}가 정리한 오늘 하루</span>
          <span className="text-xs text-sp-muted">{dateLabel}</span>
        </div>
        <div className="mt-0.5 text-xs text-sp-accent truncate">{statusTitle}</div>
      </div>

      {/* 스크롤 영역 — 오늘 수업 + 마감 할 일 목록. 내용이 많으면 여기만 스크롤 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 오늘 수업 */}
        <div className="px-2 py-2 border-b border-sp-border">
          <div className="px-2 pb-1 text-[11px] font-medium text-sp-muted">
            오늘 수업{classes.length > 0 ? ` ${classes.length}개` : ''}
          </div>
          {classes.length === 0 ? (
            <div className="px-2 pb-0.5 text-xs text-sp-muted">오늘은 수업이 없어요</div>
          ) : (
            <ul>
              {classes.map((c) => (
                <li
                  key={c.number}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                    c.isCurrent ? 'bg-sp-bg border-l-2 border-sp-accent' : ''
                  }`}
                >
                  <span
                    className={`w-4 text-center font-semibold ${
                      c.isCurrent || c.isNext ? 'text-sp-accent' : 'text-sp-muted'
                    }`}
                  >
                    {c.number}
                  </span>
                  {c.start && (
                    <span className="w-10 text-[10px] text-sp-muted tabular-nums flex-shrink-0">
                      {c.start}
                    </span>
                  )}
                  <span className="flex-1 truncate text-sp-text">{c.subject}</span>
                  {c.classroom && (
                    <span className="text-sp-muted flex-shrink-0">{c.classroom}</span>
                  )}
                  {c.isCurrent && (
                    <span className="text-[10px] text-sp-accent font-medium flex-shrink-0">
                      지금
                    </span>
                  )}
                  {!c.isCurrent && c.isNext && (
                    <span className="text-[10px] text-sp-muted flex-shrink-0">다음</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {lunchMenu && (
            <div className="px-2 pt-1 text-[11px] text-sp-muted truncate">급식 · {lunchMenu}</div>
          )}
        </div>

        {/* 마감 할 일 목록 (스크롤 영역 안 — 개수 제한 없이 전부, 길면 함께 스크롤) */}
        <div className="px-2 py-2">
          <div className="px-2 pb-1 text-[11px] font-medium text-sp-muted">마감 할 일</div>
          {todos.length === 0 ? (
            <div className="px-2 text-xs text-sp-muted">오늘 마감 할 일이 없어요 ✨</div>
          ) : (
            <ul>
              {todos.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onToggleTodo(t.id)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-sp-bg transition-colors"
                    title="완료로 표시"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-sp-muted flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-sp-text">{t.text}</span>
                    {t.overdue && (
                      <span className="text-[10px] text-sp-error flex-shrink-0">지남</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 빠른 추가 입력 — 고정(스크롤과 무관하게 항상 보임) */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-sp-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="할 일 빠른 추가 · Enter (오늘 마감)"
            aria-label="할 일 빠른 추가"
            className="w-full bg-sp-bg border border-sp-border rounded-lg px-2.5 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
          />
        </form>
      </div>

      {/* 푸터 — 창 열기 (고정) */}
      <div className="flex-shrink-0 flex gap-1.5 px-3 py-2.5 border-t border-sp-border">
        <button
          type="button"
          onClick={onOpenWidget}
          className="flex-1 rounded-lg bg-sp-bg hover:bg-sp-border py-1.5 text-xs text-sp-text transition-colors"
        >
          위젯 열기
        </button>
        <button
          type="button"
          onClick={onOpenMain}
          className="flex-1 rounded-lg bg-sp-accent hover:opacity-90 py-1.5 text-xs text-white font-medium transition-opacity"
        >
          전체 앱 열기
        </button>
      </div>
    </div>
  );
}
