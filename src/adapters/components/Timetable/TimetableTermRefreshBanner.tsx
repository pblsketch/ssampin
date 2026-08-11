import { formatTermKo, parseTerm } from '@domain/rules/academicCalendar';

/**
 * 새 학기 시간표 갱신 확인 배너 (시간표 화면 상단 인라인).
 *
 * 표시 판정은 `decideTimetableTermRefresh`(domain/rules)가 하고, 이 컴포넌트는 그리기만 한다.
 *
 * 톤은 **경고가 아니라 질문**이다 — 8월 개학처럼 실제 학기 시작은 학교마다 달라서 앱은 시간표가
 * 낡았는지 확신할 수 없다(ADR-037과 같은 이유). 그래서 붉은/호박색 경고 색을 쓰지 않고, 무엇이
 * 바뀌었는지(지난 학기 → 이번 학기)만 눈에 보이게 두고 판단은 사용자에게 맡긴다.
 *
 * ⚠️ sp-* 토큰은 Tailwind 투명도 수식(`bg-sp-accent/10`)이 무효라 조용히 투명해진다
 * (memory/feedback_sp_token_alpha_modifier_broken.md). 옅은 강조는 `bg-black/5 dark:bg-white/10`로 낸다.
 */
export interface TimetableTermRefreshBannerProps {
  /** 시간표를 확인했던 학기 라벨('2026-1') */
  readonly fromTerm: string;
  /** 지금 학기 라벨('2026-2') */
  readonly toTerm: string;
  /** "불러오기" — 현재 탭의 불러오기 소스를 연다 */
  readonly onImport: () => void;
  /** "이미 최신이에요" — 이번 학기로 확인 처리하고 다시 묻지 않는다 */
  readonly onConfirmUpToDate: () => void;
  /** 닫기 — 이번에만 숨긴다(다음 진입에 다시 묻는다) */
  readonly onDismiss: () => void;
}

/** '2026-1' → '1학기' (형식이 아니면 전체 라벨로 폴백) */
function shortTermLabel(term: string): string {
  const parsed = parseTerm(term);
  return parsed ? `${parsed.semester}학기` : formatTermKo(term);
}

export function TimetableTermRefreshBanner({
  fromTerm,
  toTerm,
  onImport,
  onConfirmUpToDate,
  onDismiss,
}: TimetableTermRefreshBannerProps) {
  return (
    <div
      role="region"
      aria-label="새 학기 시간표 확인"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-sp-border bg-sp-card px-4 py-3"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-black/5 text-sp-accent dark:bg-white/10">
        <span className="material-symbols-outlined text-icon-lg" aria-hidden="true">
          event_repeat
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-sp-text">새 학기가 되었어요. 시간표는 그대로 둘까요?</p>
        <p className="mt-0.5 text-sm text-sp-muted">
          시간표는 학기가 바뀌어도 자동으로 갱신되지 않아요. 지금 표가 이번 학기 것이 맞는지 확인해
          주세요.
        </p>
      </div>

      {/* 무엇이 바뀌었는지 한눈에 — 문장보다 이 표기가 먼저 읽힌다 */}
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-black/5 px-3 py-1.5 text-sm font-bold text-sp-muted dark:bg-white/10"
        aria-label={`${formatTermKo(fromTerm)}에서 ${formatTermKo(toTerm)}로 바뀌었어요`}
      >
        <span>{shortTermLabel(fromTerm)}</span>
        <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
          arrow_right_alt
        </span>
        <span className="text-sp-text">{shortTermLabel(toTerm)}</span>
      </span>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onImport}
          className="rounded-xl border border-sp-border bg-black/5 px-3 py-2 text-sm font-bold text-sp-accent transition-all hover:bg-black/10 active:scale-95 dark:bg-white/10 dark:hover:bg-white/15"
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={onConfirmUpToDate}
          className="rounded-xl px-3 py-2 text-sm font-medium text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text dark:hover:bg-white/10"
        >
          이미 최신이에요
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="이번에는 넘기기"
          className="inline-flex size-8 items-center justify-center rounded-xl text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text dark:hover:bg-white/10"
        >
          <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
            close
          </span>
        </button>
      </div>
    </div>
  );
}
