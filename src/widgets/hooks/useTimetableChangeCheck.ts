import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { checkComciganTimetableChange } from '@adapters/hooks/useComciganAutoSync';
import { checkAppinTimetableChange } from '@adapters/hooks/useAppinAutoSync';
import { useToastStore } from '@adapters/components/common/Toast';
import type {
  TimetableCheckResult,
  TimetableCheckStatus,
  TimetableSource,
} from '@adapters/hooks/timetableCheckTypes';

/**
 * 위젯 창의 새로고침 버튼이 쏘는 "시간표 변동 확인" 이벤트.
 * (위젯은 버튼과 결과 배너가 다른 컴포넌트라 이벤트로 잇는다. 대시보드 화면은
 *  버튼이 훅을 직접 들고 있어 check() 를 바로 부른다.)
 *
 * ⚠️ useWidgetRefresh(ssampin:refresh-all-widgets)와 반드시 분리해서 유지할 것.
 * 그쪽은 5분 타이머와 창 활성화 시에도 자동으로 도는 경로라, 여기에 얹으면
 * 위젯을 켜 둔 모든 사용자가 컴시간·압핀 서버를 5분마다 조회하게 된다
 * (comci.net / sgpap.com 폴링 금지 원칙 — useComciganAutoSync 참고).
 * 이 이벤트는 사용자가 버튼을 직접 누른 순간에만 발생해야 한다.
 */
const CHECK_EVENT = 'ssampin:widget-check-timetable';

/** 연타로 외부 서버를 두드리지 않도록 하는 최소 간격 */
const COOLDOWN_MS = 60_000;

/** 결과 배너가 스스로 사라지기까지의 시간 (사용자 행동이 필요 없는 상태만) */
const AUTO_HIDE_MS: Partial<Record<WidgetSyncState['kind'], number>> = {
  cooldown: 2000,
  unchanged: 2500,
  applied: 3500,
};

export type WidgetSyncState =
  | { kind: 'hidden' }
  | { kind: 'checking' }
  | { kind: 'cooldown' }
  | { kind: 'unchanged' }
  | { kind: 'applied'; sources: TimetableSource[]; changeCount: number }
  | { kind: 'pending'; sources: TimetableSource[]; changeCount: number }
  | { kind: 'unmatched'; sources: TimetableSource[] }
  | { kind: 'failed'; sources: TimetableSource[] };

/** 위젯 창 새로고침 버튼 → 변동 확인 요청 */
export function triggerTimetableCheck(): void {
  window.dispatchEvent(new CustomEvent(CHECK_EVENT));
}

/** 여러 원천의 결과 중 사용자에게 가장 먼저 알려야 할 상태를 고른다 */
const STATUS_PRIORITY: readonly TimetableCheckStatus[] = [
  'pending',
  'unmatched',
  'fetch-failed',
  'applied',
  'unchanged',
  'not-configured',
];

interface SourceOutcome {
  readonly source: TimetableSource;
  readonly result: TimetableCheckResult;
}

function summarize(outcomes: readonly SourceOutcome[]): WidgetSyncState {
  for (const status of STATUS_PRIORITY) {
    const hit = outcomes.filter((o) => o.result.status === status);
    if (hit.length === 0) continue;

    const sources = hit.map((o) => o.source);
    const changeCount = hit.reduce((sum, o) => sum + o.result.changeCount, 0);

    switch (status) {
      case 'pending':
        return { kind: 'pending', sources, changeCount };
      case 'unmatched':
        return { kind: 'unmatched', sources };
      case 'fetch-failed':
        return { kind: 'failed', sources };
      case 'applied':
        return { kind: 'applied', sources, changeCount };
      case 'unchanged':
        return { kind: 'unchanged' };
      default:
        // not-configured — 연동을 쓰지 않는 사용자에게는 아무 안내도 띄우지 않는다.
        // 전체 새로고침 버튼에 얹은 기능이라, 매번 안내가 뜨면 소음이 된다.
        return { kind: 'hidden' };
    }
  }
  return { kind: 'hidden' };
}

interface Options {
  /**
   * true(기본): 토스트 없이 판정 결과만 돌려준다 — 토스트 표시기가 없는 위젯 창용.
   * false: 확인 함수가 스스로 토스트를 띄운다 — 토스트가 있는 메인 창(대시보드)용.
   */
  readonly silent?: boolean;
}

/**
 * 시간표 원천(컴시간·압핀) 변동을 사용자가 직접 누른 순간에만 확인하는 훅.
 * 위젯 창은 결과 배너(WidgetSyncBanner)로, 메인 창 대시보드는 확인 함수의 토스트로 알린다.
 */
export function useTimetableChangeCheck(options: Options = {}): {
  state: WidgetSyncState;
  check: () => void;
  dismiss: () => void;
  retry: () => void;
} {
  const { silent = true } = options;
  const [state, setState] = useState<WidgetSyncState>({ kind: 'hidden' });
  const inFlightRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const applyState = useCallback((next: WidgetSyncState) => {
    if (!mountedRef.current) return;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setState(next);
    const hideAfter = AUTO_HIDE_MS[next.kind];
    if (hideAfter !== undefined) {
      hideTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setState({ kind: 'hidden' });
      }, hideAfter);
    }
  }, []);

  const runCheck = useCallback(
    async (opts: { force?: boolean } = {}) => {
      // 재진입 금지 플래그는 첫 await 전에 세운다. 아래 load() 를 기다리는 사이에
      // 한 번 더 누르면 두 번째 호출도 가드를 통과해 서버를 두 번 조회하게 된다.
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      let comciganOn = false;
      let appinOn = false;
      try {
        // 확인 전에 저장된 데이터를 반드시 먼저 읽는다.
        // 위젯 창의 스토어는 시간표 위젯 카드가 있을 때만 채워지는데, 비교 기준(현재 시간표)이
        // 비어 있으면 "전부 바뀌었다"는 거짓 감지가 난다. load() 는 이미 읽었으면 즉시 반환한다.
        await Promise.all([useSettingsStore.getState().load(), useScheduleStore.getState().load()]);

        const settings = useSettingsStore.getState().settings;
        comciganOn =
          settings.comcigan?.autoSync?.enabled === true && Boolean(settings.comcigan.fingerprint);
        appinOn = settings.appin?.autoSync?.enabled === true;

        // 연동을 쓰지 않으면 조용히 종료 — 서버 조회도, 안내도 하지 않는다.
        if (!comciganOn && !appinOn) return;

        if (!opts.force && Date.now() - lastCheckedAtRef.current < COOLDOWN_MS) {
          applyState({ kind: 'cooldown' });
          // 배너가 없는 화면(메인 창)에서는 이 분기가 그대로 "아무 반응 없음"이 된다.
          if (!silent) {
            useToastStore.getState().show('방금 확인했어요. 잠시 후 다시 눌러 주세요.', 'info');
          }
          return;
        }

        applyState({ kind: 'checking' });

        const outcomes: SourceOutcome[] = [];
        if (comciganOn) {
          outcomes.push({
            source: 'comcigan',
            result: await checkComciganTimetableChange({ manual: true, silent }),
          });
        }
        if (appinOn) {
          outcomes.push({
            source: 'appin',
            result: await checkAppinTimetableChange({ manual: true, silent }),
          });
        }
        lastCheckedAtRef.current = Date.now();
        applyState(summarize(outcomes));
      } catch {
        // 확인 함수 내부에서 처리되지 않은 예외 — 조용히 멈추지 않도록 실패로 표면화
        lastCheckedAtRef.current = Date.now();
        const sources: TimetableSource[] = [];
        if (comciganOn) sources.push('comcigan');
        if (appinOn) sources.push('appin');
        if (sources.length > 0) {
          applyState({ kind: 'failed', sources });
          if (!silent) {
            useToastStore
              .getState()
              .show('시간표 변동을 확인하지 못했어요. 잠시 후 다시 시도해주세요.', 'error');
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [applyState, silent],
  );

  useEffect(() => {
    const handler = () => void runCheck();
    window.addEventListener(CHECK_EVENT, handler);
    return () => window.removeEventListener(CHECK_EVENT, handler);
  }, [runCheck]);

  const check = useCallback(() => void runCheck(), [runCheck]);
  const dismiss = useCallback(() => applyState({ kind: 'hidden' }), [applyState]);
  const retry = useCallback(() => void runCheck({ force: true }), [runCheck]);

  return { state, check, dismiss, retry };
}
