import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import { GoogleFetchTimeoutError } from '@infrastructure/google/fetchWithTimeout';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import { SyncFromCloud } from '@usecases/sync/SyncFromCloud';
import { ResolveSyncConflict, StaleSyncConflictError } from '@usecases/sync/ResolveSyncConflict';
import { getDriveSyncAdapter, driveSyncRepository, storage } from '@mobile/di/container';
import type { SyncResult } from '@adapters/stores/useDriveSyncStore';
import { isGoogleAuthBlockedError } from '@domain/rules/calendarSyncRules';
import { parseTerm } from '@domain/rules/academicCalendar';
import { awaitPendingWrites } from '@mobile/stores/pendingWrites';
import {
  isForwardStage,
  stalledSyncMessage,
  withStageReporting,
  type SyncStage,
} from '@mobile/stores/syncStage';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';

/**
 * F8c(RT1) — 다른 기기의 학년도 마무리 감지: 동기화 다운로드로 settings.currentTerm이
 * "새로 생기거나 전진"했는가(단일 신호 — 과도한 감지 로직 금지 지침).
 * before 부재+after 존재 = 다른 기기의 첫 전환도 전진으로 본다.
 */
export function isYearTransitionAdvance(
  before: string | undefined,
  after: string | undefined,
): boolean {
  if (after === undefined) return false;
  const a = parseTerm(after);
  if (a === null) return false;
  if (before === undefined) return true;
  const b = parseTerm(before);
  if (b === null) return true;
  return a.year * 10 + a.semester > b.year * 10 + b.semester;
}

/** F8c — 학년도 전환 안내 1회 노출 dedup(localStorage: 마지막으로 안내한 학기). */
const YEAR_TRANSITION_NOTICE_SEEN_KEY = 'ssampin-mobile-year-transition-notice-v1';

/**
 * 학교 Google Workspace 계정 차단 안내 (모바일 문구).
 * 데스크톱(GOOGLE_AUTH_BLOCKED_MESSAGE)은 "설정 → Google 통합"을 안내하지만
 * 모바일은 그 화면이 없으므로 "다시 로그인" 동작에 맞춘 문구를 별도로 둔다.
 */
const MOBILE_AUTH_BLOCKED_MESSAGE =
  '학교 계정(@*.go.kr 등)은 외부 앱 차단 정책일 수 있어요. 개인 Gmail로 다시 로그인해주세요.';

/** 모바일 전용 고유 device ID (synced settings와 독립적으로 관리) */
function getMobileDeviceId(): string {
  const KEY = 'ssampin-mobile-device-id';
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // localStorage unavailable
  }
  if (!id) {
    id = `mobile-${generateUUID()}`;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // fallback - still use the generated id for this session
    }
  }
  return id;
}

// 순환 의존 방지: 런타임에 동적으로 import
async function reloadAllStores(): Promise<void> {
  try {
    const [
      { useMobileSettingsStore },
      { useMobileScheduleStore },
      { useMobileStudentStore },
      { useMobileSeatingStore },
      { useMobileEventsStore },
      { useMobileMemoStore },
      { useMobileTodoStore },
      { useMobileAttendanceStore },
      { useMobileTeachingClassStore },
      { useMobileStudentRecordsStore },
      { useMobileProgressStore },
      { useMobileAssignmentStore },
      { useMobileSurveyToolStore },
      { useMobileObservationStore },
      { useMobileRubricStore },
      { useMobileBookmarkStore },
      { useMobileStaffContactStore },
    ] = await Promise.all([
      import('@mobile/stores/useMobileSettingsStore'),
      import('@mobile/stores/useMobileScheduleStore'),
      import('@mobile/stores/useMobileStudentStore'),
      import('@mobile/stores/useMobileSeatingStore'),
      import('@mobile/stores/useMobileEventsStore'),
      import('@mobile/stores/useMobileMemoStore'),
      import('@mobile/stores/useMobileTodoStore'),
      import('@mobile/stores/useMobileAttendanceStore'),
      import('@mobile/stores/useMobileTeachingClassStore'),
      import('@mobile/stores/useMobileStudentRecordsStore'),
      import('@mobile/stores/useMobileProgressStore'),
      import('@mobile/stores/useMobileAssignmentStore'),
      import('@mobile/stores/useMobileSurveyToolStore'),
      import('@mobile/stores/useMobileObservationStore'),
      import('@mobile/stores/useMobileRubricStore'),
      import('@mobile/stores/useMobileBookmarkStore'),
      import('@mobile/stores/useMobileStaffContactStore'),
    ]);

    await Promise.all([
      useMobileSettingsStore.getState().reload(),
      useMobileScheduleStore.getState().reload(),
      useMobileStudentStore.getState().reload(),
      useMobileSeatingStore.getState().reload(),
      useMobileEventsStore.getState().reload(),
      useMobileMemoStore.getState().reload(),
      useMobileTodoStore.getState().reload(),
      useMobileAttendanceStore.getState().reload(),
      useMobileTeachingClassStore.getState().reload(),
      useMobileStudentRecordsStore.getState().reload(),
      useMobileProgressStore.getState().reload(),
      useMobileAssignmentStore.getState().reload(),
      useMobileSurveyToolStore.getState().reload(),
      useMobileObservationStore.getState().reload(),
      useMobileRubricStore.getState().reload(),
      useMobileBookmarkStore.getState().reload(),
      useMobileStaffContactStore.getState().reload(),
    ]);
  } catch (e) {
    // 배포 후 이전 SW 캐시가 stale 청크를 참조하는 경우 새로고침으로 복구
    if (e instanceof Error && e.message.includes('Failed to fetch dynamically imported module')) {
      window.location.reload();
      return;
    }
    throw e;
  }
}

type SyncState = 'idle' | 'syncing' | 'error' | 'conflict';

export function firstMobileConflict(
  conflicts: readonly DriveSyncConflict[],
): DriveSyncConflict | null {
  return conflicts[0] ?? null;
}

export function canStartMobileConflictResolution(
  state: SyncState,
  conflict: DriveSyncConflict | null,
): conflict is DriveSyncConflict {
  return state !== 'syncing' && conflict !== null;
}

export function canStartMobileUpload(
  state: SyncState,
  conflict: DriveSyncConflict | null,
): boolean {
  return state !== 'syncing' && conflict === null;
}

/** 오류 종류 — SyncStatusBanner가 '다시 시도' 대신 '다시 로그인'을 보여줄지 판단하는 데 사용. */
type SyncErrorKind = 'auth' | 'blocked' | 'generic' | null;

interface MobileDriveSyncState {
  state: SyncState;
  progress: number;
  error: string | null;
  errorKind: SyncErrorKind;
  conflict: DriveSyncConflict | null;
  lastSyncedAt: string | null;
  isAuthenticated: boolean;
  lastSyncResult: SyncResult | null;
  /**
   * F8c(RT1) — 다른 기기에서 학년도 마무리가 실행됐음을 감지한 1회 안내(새 학기 라벨).
   * null이면 안내 없음. 닫으면 dismissYearTransitionNotice가 dedup 기록 후 소거.
   */
  yearTransitionNoticeTerm: string | null;
  /**
   * 이번 동기화가 어디까지 갔는지. 정체로 중단됐을 때 어느 단계에서 멈췄는지 알려준다.
   * 고정 리터럴만 담긴다 — 개인정보·토큰은 절대 싣지 않는다.
   */
  syncStage: SyncStage | null;

  setTokenGetter: (getter: () => Promise<string>) => void;
  dismissYearTransitionNotice: () => void;
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  resolveAllConflictsFromCloud: (onProgress?: (current: number) => void) => Promise<void>;
  deleteCloudData: () => Promise<void>;
  triggerSaveSync: () => void;
  /** debounce 무시하고 즉시 업로드 (앱 백그라운드 전환 시 사용) */
  flushSync: () => Promise<void>;
}

let tokenGetter: (() => Promise<string>) | null = null;
let saveDebounce: ReturnType<typeof setTimeout> | null = null;
let resolveAllInFlight: Promise<void> | null = null;
/** 업로드 유예(deferred) 재시도 1회 가드 — pull-merge-push 무한루프 방지 */
let deferredRetrying = false;

/**
 * 정체 감지 시간. 이 시간 동안 단계도 진행률도 움직이지 않으면 중단하고 오류로 돌린다.
 *
 * 왜 필요한가 — 통신·저장소 어느 쪽이든 응답이 영영 오지 않으면 동기화 promise 가
 * 끝나지도 실패하지도 않는다. 그러면 state 가 'syncing' 에 갇히고, 그 상태에서는
 * 자동·수동·앱복귀 재시도가 전부 조용히 무시돼 "동기화 중 0%" 가 영구히 남는다.
 * 타임아웃(fetchWithTimeout)이 통신 쪽을 막고, 이 워치독이 나머지를 받는 마지막 그물이다.
 *
 * 2분 30초 — 느린 회선의 큰 첨부 전송(최대 120초)이 정상인데도 잘리지 않을 만큼 길고,
 * 사용자가 화면을 보며 기다리기엔 이미 충분히 긴 시간이다.
 */
export const SYNC_WATCHDOG_MS = 150_000;

/**
 * 동기화 회차 번호. 워치독이 한 회차를 접을 때 올라간다.
 * 뒤늦게 끝난 옛 회차가 새 상태를 덮어쓰지 못하게 막는 표식이다(끊긴 요청은 취소가
 * 안 되므로, 몇 분 뒤 살아 돌아와 'idle 100%' 를 써버리면 오류 안내가 사라진다).
 */
let syncEpoch = 0;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let currentStage: SyncStage | null = null;

/**
 * 단계 보고 — 앞 단계로만 갱신하고, 움직였으니 워치독 시계도 다시 잰다.
 *
 * 회차 대조가 반드시 먼저다. dataOperationMutex 의 대기줄은 FIFO 무제한이라 워치독이
 * 버린 회차도 줄에서 빠지지 않고, 앞이 풀리는 순간 좀비들이 줄줄이 실행된다. 그때
 * 이 함수가 회차를 안 보면 좀비의 보고가 지금 회차의 시계를 계속 밀어내
 * **워치독이 가장 필요한 순간에 무장 해제된다.** 단계 표시도 좀비가 덮어써 거짓말을 한다.
 */
function reportStage(epoch: number, stage: SyncStage): void {
  if (!isCurrentRun(epoch)) return;
  touchSyncRun();
  if (!isForwardStage(currentStage, stage)) return;
  currentStage = stage;
  useMobileDriveSyncStore.setState({ syncStage: stage });
}

function armWatchdog(): void {
  if (watchdogTimer !== null) clearTimeout(watchdogTimer);
  const epoch = syncEpoch;
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    if (epoch !== syncEpoch) return;
    if (useMobileDriveSyncStore.getState().state !== 'syncing') return;
    // 이 회차를 버린다 — 이후 살아 돌아와도 isCurrentRun 이 false 라 상태를 못 건드린다.
    syncEpoch += 1;
    const stalledAt = currentStage;
    currentStage = null;
    useMobileDriveSyncStore.setState({
      state: 'error',
      errorKind: 'generic',
      error: stalledSyncMessage(stalledAt),
      syncStage: null,
    });
  }, SYNC_WATCHDOG_MS);
}

/** 새 동기화 회차 시작 — 회차 번호를 받아 이후 모든 상태 반영 전에 대조한다. */
function beginSyncRun(): number {
  syncEpoch += 1;
  currentStage = null;
  armWatchdog();
  return syncEpoch;
}

/** 진전이 있었음 — 워치독 시계를 다시 잰다(정상 동기화를 중간에 죽이지 않게). */
function touchSyncRun(): void {
  if (watchdogTimer === null) return;
  armWatchdog();
}

/** 이 회차가 아직 유효한가 (워치독이 접지 않았는가). */
function isCurrentRun(epoch: number): boolean {
  return epoch === syncEpoch;
}

/**
 * 이 회차의 마무리를 넘겨받는다.
 *
 * false = 워치독이 이미 이 회차를 접었다. 그때는 상태를 절대 건드리면 안 된다 —
 * 끊긴 요청은 취소가 안 되므로 몇 분 뒤 살아 돌아오는데, 그게 'idle 100%' 를 써버리면
 * 화면의 오류 안내가 사라져 사용자는 멀쩡히 끝난 줄 안다.
 */
function claimRunCompletion(epoch: number): boolean {
  if (!isCurrentRun(epoch)) return false;
  endSyncRun(epoch);
  return true;
}

/** 진행률 보고 — 유효한 회차일 때만 반영하고, 움직였으니 워치독 시계를 다시 잰다. */
function makeProgressReporter(
  epoch: number,
  set: (partial: Partial<MobileDriveSyncState>) => void,
): (progress: { current: number; total: number }) => void {
  return ({ current, total }) => {
    if (!isCurrentRun(epoch)) return;
    touchSyncRun();
    set({ progress: Math.round((current / total) * 100) });
  };
}

/** 회차 종료 — 워치독 해제. 타이머가 남으면 다음 회차를 엉뚱하게 끊는다. */
function endSyncRun(epoch: number): void {
  if (epoch !== syncEpoch) return;
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  currentStage = null;
}

/** 테스트 전용 — 모듈 상태 초기화. */
export function resetSyncWatchdogForTest(): void {
  if (watchdogTimer !== null) clearTimeout(watchdogTimer);
  watchdogTimer = null;
  syncEpoch = 0;
  currentStage = null;
}

/** 회차와 무관한 호출(클라우드 삭제 등)이 쓰는 값. 어떤 회차와도 일치하지 않는다. */
const NO_RUN = -1;

/**
 * 이 회차 전용 드라이브 포트.
 *
 * 모듈에 하나 캐시해 두면 버려진 옛 회차가 같은 객체로 단계를 보고해 지금 회차의
 * 워치독을 밀어낸다. 회차마다 새로 감싸 격리한다 — DriveSyncAdapter 는 토큰 getter
 * 하나만 들고 있는 무상태 클래스라 재생성 비용도 위험도 없다.
 */
function getAdapter(epoch: number): IDriveSyncPort {
  if (!tokenGetter) throw new Error('Drive sync not initialized');
  const getToken = tokenGetter;
  // 토큰 확인은 모든 Drive 요청 앞에 붙는다. 'token' 은 앞 단계라 뒤 단계를 덮지 않고,
  // 회차 첫 요청에서만 기록으로 남는다(isForwardStage).
  return withStageReporting(
    getDriveSyncAdapter(async () => {
      reportStage(epoch, 'token');
      return getToken();
    }),
    (stage) => reportStage(epoch, stage),
  );
}

/** 동기화 실패 분류 → 스토어 상태 반영 (syncToCloud/syncFromCloud 공용) */
function applySyncError(e: unknown, set: (partial: Partial<MobileDriveSyncState>) => void): void {
  const msg = e instanceof Error ? e.message : '동기화 실패';
  // 제한시간 초과 메시지에는 구글 주소와 Drive 파일 ID 가 들어 있다. 화면에는 우리말
  // 안내만 내보내고 원문은 cause·콘솔에만 남긴다(UI 텍스트 한국어 규칙).
  if (e instanceof GoogleFetchTimeoutError) {
    console.warn('[MobileDriveSync] 응답 시간 초과:', msg);
    set({
      state: 'error',
      errorKind: 'generic',
      error: '인터넷이 느려 구글 서버 응답을 기다리다 중단했어요. 잠시 후 다시 시도해 주세요.',
      syncStage: null,
    });
    return;
  }
  if (isGoogleAuthBlockedError(msg)) {
    tokenGetter = null;
    set({
      state: 'error',
      isAuthenticated: false,
      errorKind: 'blocked',
      error: MOBILE_AUTH_BLOCKED_MESSAGE,
      syncStage: null,
    });
  } else if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
    tokenGetter = null;
    set({
      state: 'error',
      isAuthenticated: false,
      errorKind: 'auth',
      error: msg.includes('SCOPE_INSUFFICIENT')
        ? 'Google Drive 접근 권한이 변경되었습니다. 다시 로그인해주세요.'
        : 'Google 인증이 만료되었습니다. 다시 로그인해주세요.',
      syncStage: null,
    });
  } else {
    set({ state: 'error', errorKind: 'generic', error: msg, syncStage: null });
  }
}

export const useMobileDriveSyncStore = create<MobileDriveSyncState>((set, get) => ({
  state: 'idle',
  progress: 0,
  syncStage: null,
  error: null,
  errorKind: null,
  conflict: null,
  lastSyncedAt: null,
  isAuthenticated: false,
  lastSyncResult: null,
  yearTransitionNoticeTerm: null,

  setTokenGetter: (getter) => {
    tokenGetter = getter;
    set({ isAuthenticated: true });
  },

  dismissYearTransitionNotice: () => {
    const term = get().yearTransitionNoticeTerm;
    if (term !== null) {
      try {
        localStorage.setItem(YEAR_TRANSITION_NOTICE_SEEN_KEY, term);
      } catch {
        /* localStorage 불가 시 이 세션만 소거(다음 세션 재노출 — 무해) */
      }
    }
    set({ yearTransitionNoticeTerm: null });
  },

  syncToCloud: async () => {
    if (!tokenGetter) {
      set({
        state: 'error',
        errorKind: 'auth',
        error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.',
      });
      return;
    }
    if (!canStartMobileUpload(get().state, get().conflict)) return;
    const epoch = beginSyncRun();
    set({ state: 'syncing', progress: 0, error: null, errorKind: null, syncStage: null });
    try {
      // Load settings to get real deviceId
      reportStage(epoch, 'settings');
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncTo = new SyncToCloud(
        storage,
        getAdapter(epoch),
        driveSyncRepository,
        deviceId,
        deviceName,
      );
      const result = await syncTo.execute(makeProgressReporter(epoch, set));
      const now = new Date().toISOString();
      if (!claimRunCompletion(epoch)) return;
      set({
        state: 'idle',
        progress: 100,
        errorKind: null,
        syncStage: null,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'upload',
          timestamp: now,
          uploaded: result.uploaded,
          skipped: result.skipped,
        },
      });
      // 리모트 변경으로 업로드가 유예된 파일이 있으면: 다운로드(병합) 후 1회만 재업로드.
      // 이게 없으면 폰에서 입력한 변경분이 Drive에 오르지 못한 채 다음 다운로드에 덮여 사라질 수 있다.
      if (result.deferred.length > 0 && !deferredRetrying) {
        deferredRetrying = true;
        try {
          await get().syncFromCloud();
          await get().syncToCloud();
        } finally {
          deferredRetrying = false;
        }
      }
    } catch (e) {
      if (!claimRunCompletion(epoch)) return;
      applySyncError(e, set);
    }
  },

  syncFromCloud: async () => {
    if (!tokenGetter) {
      set({
        state: 'error',
        errorKind: 'auth',
        error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.',
      });
      return;
    }
    if (get().state === 'syncing') return;
    const epoch = beginSyncRun();
    set({ state: 'syncing', progress: 0, error: null, errorKind: null, syncStage: null });
    try {
      reportStage(epoch, 'settings');
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      // F8c(RT1) — 전환 감지 기준점: 다운로드 전 settings.currentTerm(읽기 실패=감지 스킵).
      let termBeforeSync: string | undefined;
      try {
        termBeforeSync = (await storage.read<{ currentTerm?: string }>('settings'))?.currentTerm;
      } catch {
        termBeforeSync = undefined;
      }
      const syncFrom = new SyncFromCloud(
        storage,
        getAdapter(epoch),
        driveSyncRepository,
        deviceId,
        deviceName,
        'ask',
        undefined,
        undefined,
        // S2.2b·F9a — 스킵 기준. 모바일은 자체 전환이 없으므로 동기화된 settings 파일의
        // currentTerm·lastClosedTerm(데스크톱 전환이 기록)을 raw로 읽는다(MobileSettings 투영 밖).
        async () => {
          const s = await storage.read<{
            currentTerm?: string;
            lastClosedTerm?: string;
            lastClosedAt?: string;
          }>('settings');
          return {
            currentTerm: s?.currentTerm,
            lastClosedTerm: s?.lastClosedTerm,
            lastClosedAt: s?.lastClosedAt,
          };
        },
        undefined,
        undefined,
        get().conflict !== null,
      );
      const result = await syncFrom.execute(makeProgressReporter(epoch, set));
      // F8c(RT1) — 다운로드로 currentTerm이 전진했으면 1회 안내(localStorage dedup).
      try {
        const termAfterSync = (await storage.read<{ currentTerm?: string }>('settings'))
          ?.currentTerm;
        if (
          isYearTransitionAdvance(termBeforeSync, termAfterSync) &&
          termAfterSync !== undefined &&
          localStorage.getItem(YEAR_TRANSITION_NOTICE_SEEN_KEY) !== termAfterSync
        ) {
          set({ yearTransitionNoticeTerm: termAfterSync });
        }
      } catch {
        /* 감지 실패는 안내 생략일 뿐 — 동기화 자체에 영향 없음 */
      }
      const now = new Date().toISOString();
      const conflict = firstMobileConflict(result.conflicts);
      if (!claimRunCompletion(epoch)) return;
      set({
        state: conflict ? 'conflict' : 'idle',
        progress: 100,
        errorKind: null,
        syncStage: null,
        conflict,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'download',
          timestamp: now,
          downloaded: result.downloaded,
          skipped: result.skipped,
          conflicts: result.conflicts.map((c) => c.filename),
        },
      });
      await reloadAllStores();
    } catch (e) {
      if (!claimRunCompletion(epoch)) return;
      applySyncError(e, set);
    }
  },

  resolveConflict: async (choice) => {
    const { state, conflict } = get();
    if (!canStartMobileConflictResolution(state, conflict)) return;

    const epoch = beginSyncRun();
    set({ state: 'syncing', progress: 0, error: null, errorKind: null, syncStage: null });
    try {
      const resolver = new ResolveSyncConflict(
        storage,
        getAdapter(epoch),
        driveSyncRepository,
        getMobileDeviceId(),
        conflict.localDeviceName,
      );
      await resolver.execute(conflict, choice);
      if (!claimRunCompletion(epoch)) return;
      // 재비교가 끝날 때까지 기존 충돌 객체를 유지한다. 그래야 장부 부재/손상을 성공으로 오인하지 않는다.
      set({ state: 'idle', syncStage: null });
      await get().syncFromCloud();
    } catch (e) {
      if (!claimRunCompletion(epoch)) return;
      if (e instanceof StaleSyncConflictError) {
        // 기존 충돌 객체를 유지한 채 ask 정책으로 다시 비교해 최신 선택지를 갱신한다.
        set({ state: 'idle', error: e.message, errorKind: null, syncStage: null });
        await get().syncFromCloud();
        return;
      }
      applySyncError(e, set);
    }
  },

  resolveAllConflictsFromCloud: (onProgress) => {
    if (resolveAllInFlight) return resolveAllInFlight;

    const run = (async () => {
      const seenFiles = new Set<string>();
      let currentIndex = 0;

      while (true) {
        const current = get();
        if (current.state === 'syncing' || current.conflict === null) return;

        const filename = current.conflict.filename;
        if (seenFiles.has(filename)) {
          set({
            state: 'error',
            errorKind: null,
            error: '같은 항목을 다시 확인해야 합니다. 이 항목은 개별적으로 선택해 주세요.',
          });
          return;
        }
        seenFiles.add(filename);
        currentIndex += 1;
        onProgress?.(currentIndex);

        await current.resolveConflict('remote');

        const next = get();
        if (next.state === 'error' || next.conflict === null) return;
      }
    })();

    resolveAllInFlight = run;
    return run.finally(() => {
      if (resolveAllInFlight === run) resolveAllInFlight = null;
    });
  },

  deleteCloudData: async () => {
    if (!tokenGetter) return;
    try {
      const a = getAdapter(NO_RUN);
      const folder = await a.getOrCreateSyncFolder();
      await a.deleteSyncFolder(folder.id);
      set({ state: 'idle', lastSyncedAt: null });
    } catch (e) {
      set({ state: 'error', error: e instanceof Error ? e.message : '삭제 실패' });
    }
  },

  triggerSaveSync: () => {
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      void get().syncToCloud();
    }, 5000);
  },

  flushSync: async () => {
    if (saveDebounce) {
      clearTimeout(saveDebounce);
      saveDebounce = null;
    }
    if (!tokenGetter || get().state === 'syncing') return;
    // 화면의 미저장 편집이 로컬에 먼저 내려앉기를 기다린다. 이걸 건너뛰면 백그라운드 전환 시
    // 편집 직전 상태가 클라우드 정본이 되어 PC 까지 덮는다(같은 이벤트에 두 리스너가 붙어 있고
    // 실행 순서는 등록 순서에 달려 있다).
    await awaitPendingWrites();
    await get().syncToCloud();
  },
}));
