import { SOURCE_LABEL, type TimetableSource } from '@adapters/hooks/timetableCheckTypes';
import { useTimetableChangeCheck } from '../hooks/useTimetableChangeCheck';

/**
 * 위젯 시간표 변동 확인 결과 배너.
 *
 * 위젯 창에는 토스트 표시기(ToastContainer)가 없어서 확인 결과를 토스트로 알릴 수 없다.
 * 대신 같은 창에서 이미 검증된 하단 전폭 배너 패턴(WidgetUpdateBanner)을 그대로 따른다.
 * 토스트는 min-w 320px 라 좁은 위젯 창에서 잘리는 문제도 함께 피한다.
 */

function labelOf(sources: readonly TimetableSource[]): string {
  return sources.map((s) => SOURCE_LABEL[s]).join('·');
}

const BASE = 'w-full text-white text-xs text-center py-2 transition-colors';

export function WidgetSyncBanner() {
  const { state, dismiss, retry } = useTimetableChangeCheck();

  if (state.kind === 'hidden') return null;

  if (state.kind === 'checking') {
    return (
      <div className={`${BASE} bg-sp-accent/80 cursor-default`}>
        시간표 변동을 확인하는 중이에요…
      </div>
    );
  }

  if (state.kind === 'cooldown') {
    return (
      <div className={`${BASE} bg-sp-accent/80 cursor-default`}>
        방금 확인했어요 — 잠시 후 다시 눌러 주세요
      </div>
    );
  }

  if (state.kind === 'unchanged') {
    return <div className={`${BASE} bg-green-600 cursor-default`}>시간표는 최신 상태예요</div>;
  }

  if (state.kind === 'applied') {
    return (
      <div className={`${BASE} bg-green-600 cursor-default`}>
        {labelOf(state.sources)} 시간표를 반영했어요 ({state.changeCount}칸)
      </div>
    );
  }

  const goToTimetable = (fragment: string): void => {
    // 메인 창을 열어 시간표 화면으로 이동한다(main 이 위젯 창을 닫는다).
    // 감지 결과 자체는 창을 넘지 못하므로 "무엇을 하러 왔는지"만 넘기고,
    // 메인 시간표 화면이 도착 즉시 확인·검토를 이어서 진행한다.
    void window.electronAPI?.navigateToPage?.(fragment);
  };

  if (state.kind === 'pending') {
    return (
      <ActionBanner
        tone="bg-amber-600 hover:brightness-110"
        onClick={() => goToTimetable('timetable#sync-review')}
        onDismiss={dismiss}
        label={`${labelOf(state.sources)} 시간표가 ${state.changeCount}칸 바뀌었어요 — 눌러서 검토하기`}
      />
    );
  }

  if (state.kind === 'unmatched') {
    return (
      <ActionBanner
        tone="bg-amber-600 hover:brightness-110"
        onClick={() => goToTimetable('timetable')}
        onDismiss={dismiss}
        label="컴시간에서 본인을 다시 선택해 주세요 — 눌러서 열기"
      />
    );
  }

  return (
    <ActionBanner
      tone="bg-red-600 hover:bg-red-500"
      onClick={retry}
      onDismiss={dismiss}
      label={`${labelOf(state.sources)}에 연결하지 못했어요 — 눌러서 다시 시도`}
    />
  );
}

function ActionBanner({
  tone,
  label,
  onClick,
  onDismiss,
}: {
  tone: string;
  label: string;
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`relative ${tone}`}>
      <button type="button" className={`${BASE} cursor-pointer pr-9`} onClick={onClick}>
        {label}
      </button>
      <button
        type="button"
        aria-label="닫기"
        onClick={onDismiss}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/80 hover:bg-white/20 hover:text-white"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          close
        </span>
      </button>
    </div>
  );
}
