import { useEffect, useState } from 'react';
import { CoolImportModal } from './CoolImportModal';
import { useCoolImport } from './useCoolImport';
import { useCoolImportHistoryStore } from '@adapters/stores/useCoolImportHistoryStore';
import { countCoolImportCandidates } from '@domain/rules/coolImportCandidates';

/**
 * "등록 후보 쪽지" 알림 배너.
 *
 * ## 왜 있나
 * 원래는 선생님이 일정 화면까지 찾아가야 이 기능이 있는 줄 알았다. 그런데 새 쪽지가
 * 왔는지 알 수 없으니, 버튼이 눈앞에 있어도 누를 이유를 모른다.
 * **앱이 먼저 알려주면 찾아갈 필요가 없다.**
 *
 * ## 무엇을 세나 — "등록 후보 쪽지"
 * **날짜가 들어 있고, 아직 안 가져간 쪽지.**
 * "안 읽은 쪽지"가 아니다 — 그건 쿨메신저가 관리하는 값이라 선생님이 쿨메신저에서
 * 읽으면 꺼진다. 정작 일정에 넣고 싶어지는 건 읽고 난 다음이라 신호로 쓸 수 없다.
 *
 * ## 감시하지 않는다
 * **앱을 켤 때 한 번만** 확인한다. 주기적으로 들여다보지 않는다 —
 * 쪽지함은 쿨메신저 것이고, 필요할 때만 잠깐 복사해 읽는 원칙을 지킨다.
 *
 * 나이스 학사일정 제안 배너(`NeisSyncSuggestionBanner`)와 같은 자리·같은 방식이다.
 */

/**
 * 앱 세션당 한 번만 세기 위한 캐시.
 *
 * ★Dashboard 는 탭을 오갈 때마다 언마운트→마운트를 반복하므로, 컴포넌트 상태로는
 * "앱을 켤 때 한 번"이라는 위 약속을 지킬 수 없다 — 실제로는 대시보드에 들어올 때마다
 * 쪽지함 전체를 복사해 읽고 있었다(2026-08-24 UltraQA). 모듈 변수로 올려 세션당
 * 한 번만 센다. 다시 세고 싶으면 앱을 다시 켜면 된다(배너의 역할은 딱 그만큼이다).
 */
let sessionCount: number | null = null;

/** 테스트 전용 — 세션 캐시를 비운다 */
export function resetCoolImportBannerSessionCache(): void {
  sessionCount = null;
}

export function CoolImportBanner() {
  const cool = useCoolImport();
  const loadHistory = useCoolImportHistoryStore((s) => s.load);
  const dismissed = useCoolImportHistoryStore((s) => s.bannerDismissed);
  const dismiss = useCoolImportHistoryStore((s) => s.dismissBanner);

  const [count, setCount] = useState(sessionCount ?? 0);
  const [open, setOpen] = useState(false);

  // 앱을 켤 때 한 번만 — 후보 쪽지가 있는지 센다
  const { enabled, loadMessages } = cool;
  useEffect(() => {
    if (!enabled) return;
    if (sessionCount !== null) return; // 이 세션에서 이미 셌다 — 쪽지함을 또 읽지 않는다
    let alive = true;
    void (async () => {
      try {
        await loadHistory();
        const messages = await loadMessages();
        if (!alive) return;
        const counted = countCoolImportCandidates(
          messages,
          useCoolImportHistoryStore.getState().history,
        );
        sessionCount = counted;
        setCount(counted);
      } catch {
        // 쪽지함을 못 읽으면 조용히 넘어간다 — 배너는 거들 뿐이라 여기서 오류를 띄우면
        // 쿨메신저를 지운 선생님에게 매번 경고가 뜬다. 창을 열면 그때 이유가 보인다.
        sessionCount = 0;
        if (alive) setCount(0);
      }
    })();
    return () => {
      alive = false;
    };
    // loadMessages 는 안정적(useCallback []). 켜짐 여부가 바뀔 때만 다시 센다.
  }, [enabled, loadMessages, loadHistory]);

  if (!cool.enabled || dismissed || count === 0) return null;

  return (
    <>
      {/* 대시보드 헤더 아래 은은형 줄 — 오른쪽 아래 구석은 이미 토스트·알림 5개가
          경쟁하고 있어 여섯 번째를 더하지 않는다. `ReminderDashboardBadge` 와 같은 자리다. */}
      <div className="-mt-4 mb-6 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-sp-border bg-sp-card">
        <span className="material-symbols-outlined text-sp-accent" aria-hidden="true">
          forward_to_inbox
        </span>
        <p className="flex-1 min-w-0 text-sm text-sp-text">
          쿨메신저에 <strong className="font-bold">등록 후보 쪽지 {count}건</strong>이 있어요.
          <span className="text-sp-muted"> 날짜가 적혀 있는데 아직 안 가져온 쪽지입니다.</span>
        </p>
        <button
          type="button"
          onClick={() => {
            cool.ensureHistory();
            setOpen(true);
          }}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-sp-accent text-sp-accent-fg transition-opacity duration-sp-base ease-sp-out"
        >
          살펴보기
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 px-2 py-1.5 rounded-lg text-xs text-sp-muted hover:text-sp-text transition-colors duration-sp-base ease-sp-out"
        >
          나중에
        </button>
      </div>

      {open && (
        <CoolImportModal
          isOpen={open}
          onClose={() => {
            setOpen(false);
            // 처리하고 나왔으면 배너를 접는다 — 같은 걸 또 권하지 않는다
            dismiss();
          }}
          loadMessages={cool.loadMessages}
          loadMessage={cool.loadMessage}
          roster={cool.roster}
          onSubmit={cool.onSubmit}
          isImported={cool.isImported}
          hasImportedFrom={cool.hasImportedFrom}
        />
      )}
    </>
  );
}
