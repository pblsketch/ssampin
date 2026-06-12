'use client';

/**
 * 우리 반 메모 — 교실 전자칠판 게시 페이지 (읽기 전용)
 *
 * plan.md C-3: 5초 메타데이터(version) 폴링 → 변경 시에만 본문 fetch
 * - diff(항목 id·updatedAt) → 추가 scale-in+차임 / 수정 pulse / 삭제 fade-out
 * - visibilitychange: hidden→중단, visible→즉시 1회 후 재개
 * - 연속 실패 백오프 5s→10s→30s, 네트워크 오류 시 마지막 데이터 유지
 * - 404/403 → "선생님이 공유를 중지했어요"
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  MemoAttention,
  MemoColor,
  MemoFontSize,
  MemoShareBoardFile,
  MemoShareItemSnapshot,
} from './driveBoardApi';
import {
  DriveBoardError,
  buildImageUrl,
  getBoardFile,
  getBoardMeta,
  getDriveApiKey,
} from './driveBoardApi';
import { useMemoChime } from './useMemoChime';
import { useMemoTts } from './useMemoTts';
import { sendAttentionAck, sendHeartbeat } from './presenceApi';
import styles from './memo.module.css';

const POLL_INTERVAL_MS = 5000;
const BACKOFF_STEPS_MS = [5000, 10000, 30000] as const;
const FRESH_DURATION_MS = 2300;
const PULSE_DURATION_MS = 1400;
const LEAVE_DURATION_MS = 320;
const HEADER_PULSE_DURATION_MS = 1700;
const HEARTBEAT_INTERVAL_MS = 60000;
const THEME_STORAGE_KEY = 'ssampin-memo-theme';

type BoardStatus = 'loading' | 'ready' | 'gone' | 'config-error';
type Theme = 'light' | 'dark';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COLOR_CLASS: Record<MemoColor, string> = {
  yellow: styles.cardYellow,
  pink: styles.cardPink,
  green: styles.cardGreen,
  blue: styles.cardBlue,
};

const FONT_CLASS: Record<MemoFontSize, string> = {
  sm: styles.fontSm,
  base: styles.fontBase,
  lg: styles.fontLg,
  xl: styles.fontXl,
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatClock(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}월 ${day}일 (${weekday}) · ${hours}:${minutes}`;
}

interface MemoBoardContentProps {
  fileId: string;
}

export function MemoBoardContent({ fileId }: MemoBoardContentProps) {
  const [status, setStatus] = useState<BoardStatus>('loading');
  const [board, setBoard] = useState<MemoShareBoardFile | null>(null);
  const [connected, setConnected] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const [pulsedIds, setPulsedIds] = useState<ReadonlySet<string>>(new Set());
  const [leavingItems, setLeavingItems] = useState<readonly MemoShareItemSnapshot[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [headerPulse, setHeaderPulse] = useState(false);

  const { soundOn, toggleSound, playChime } = useMemoChime();
  const { speakText, cancelSpeech, unlockTts } = useMemoTts();

  const statusRef = useRef<BoardStatus>('loading');
  const boardRef = useRef<MemoShareBoardFile | null>(null);
  const versionRef = useRef<string | null>(null);
  const failCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => undefined);
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupCloseRef = useRef<HTMLButtonElement | null>(null);
  const playChimeRef = useRef(playChime);
  playChimeRef.current = playChime;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  /** 처리한(또는 첫 로드에 이미 실려 있던) attention nonce — 같은 nonce 재수신 무시 */
  const seenNoncesRef = useRef<Set<string>>(new Set());
  /** TTS 세션 토큰 — 새 신호가 오면 이전 낭독의 후처리(팝업 닫기)를 무효화 */
  const ttsSessionRef = useRef(0);
  const headerPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAttentionRef = useRef<(attention: MemoAttention, file: MemoShareBoardFile) => void>(
    () => undefined,
  );

  const updateStatus = useCallback((next: BoardStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedulePoll = useCallback(
    (delay: number) => {
      clearPollTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        tickRef.current();
      }, delay);
    },
    [clearPollTimer],
  );

  /** 새 보드 적용 + diff 애니메이션 트리거 + 주목 신호 1회 처리 */
  const applyBoard = useCallback((next: MemoShareBoardFile) => {
    const prev = boardRef.current;
    boardRef.current = next;
    setBoard(next);

    if (prev === null) {
      // 첫 로드 — 애니메이션·차임 없음.
      // 이미 실려 있는 attention은 "처리됨"으로만 기록 (전자칠판 재부팅 시 과거 신호 재생 방지)
      if (next.attention) seenNoncesRef.current.add(next.attention.nonce);
      return;
    }

    const prevById = new Map(prev.items.map((item) => [item.id, item]));
    const nextIds = new Set(next.items.map((item) => item.id));

    const addedIds = next.items.filter((item) => !prevById.has(item.id)).map((item) => item.id);
    const updatedIds = next.items
      .filter((item) => {
        const before = prevById.get(item.id);
        return before !== undefined && before.updatedAt !== item.updatedAt;
      })
      .map((item) => item.id);
    const removed = prev.items.filter((item) => !nextIds.has(item.id));

    if (addedIds.length > 0) {
      setFreshIds(new Set(addedIds));
      playChimeRef.current();
      setTimeout(() => setFreshIds(new Set()), FRESH_DURATION_MS);
    }
    if (updatedIds.length > 0) {
      setPulsedIds(new Set(updatedIds));
      setTimeout(() => setPulsedIds(new Set()), PULSE_DURATION_MS);
    }
    if (removed.length > 0) {
      setLeavingItems(removed);
      setTimeout(() => setLeavingItems([]), LEAVE_DURATION_MS);
    }

    // 주목 신호 — 처음 보는 nonce일 때만 1회 재생, 같은 nonce 재수신은 무시
    const attention = next.attention;
    if (attention !== undefined && !seenNoncesRef.current.has(attention.nonce)) {
      seenNoncesRef.current.add(attention.nonce);
      handleAttentionRef.current(attention, next);
    }
  }, []);

  /** 폴링 1회 — R1 메타데이터 확인 후 version 변화 시에만 R2 본문 */
  const tick = useCallback(async () => {
    if (statusRef.current === 'gone' || statusRef.current === 'config-error') return;

    try {
      const meta = await getBoardMeta(fileId);
      if (versionRef.current === null || meta.version !== versionRef.current) {
        const file = await getBoardFile(fileId);
        versionRef.current = meta.version;
        applyBoard(file);
        if (statusRef.current !== 'ready') updateStatus('ready');
      }
      failCountRef.current = 0;
      setConnected(true);
      schedulePoll(POLL_INTERVAL_MS);
    } catch (error) {
      if (error instanceof DriveBoardError) {
        if (error.kind === 'gone') {
          clearPollTimer();
          updateStatus('gone');
          return;
        }
        if (error.kind === 'missing-key') {
          clearPollTimer();
          updateStatus('config-error');
          return;
        }
      }
      // network / invalid → 마지막 데이터 유지 + 백오프 재시도
      const failIndex = Math.min(failCountRef.current, BACKOFF_STEPS_MS.length - 1);
      failCountRef.current += 1;
      setConnected(false);
      schedulePoll(BACKOFF_STEPS_MS[failIndex]);
    }
  }, [fileId, applyBoard, schedulePoll, clearPollTimer, updateStatus]);

  useEffect(() => {
    tickRef.current = () => {
      void tick();
    };
  }, [tick]);

  /* 초기 로드 + 폴링 시작 */
  useEffect(() => {
    if (getDriveApiKey() === null) {
      updateStatus('config-error');
      return;
    }
    tickRef.current();
    return clearPollTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  /* 탭 가시성 — hidden이면 폴링 중단, 복귀 시 즉시 1회 */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        clearPollTimer();
      } else if (statusRef.current === 'loading' || statusRef.current === 'ready') {
        clearPollTimer();
        tickRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [clearPollTimer]);

  /* 수신 확인증 heartbeat — ready일 때 60초마다 + visible 복귀 직후 1회.
     fire-and-forget(presenceApi) — 실패해도 보드 표시·폴링·재생에 영향 없음 */
  useEffect(() => {
    if (status !== 'ready') return;
    const send = () => {
      if (document.hidden) return; // hidden이면 중단 (폴링과 동일 규칙)
      sendHeartbeat(fileId, soundOnRef.current);
    };
    send(); // ready 진입 직후 1회
    const interval = setInterval(send, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) send();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, fileId]);

  /* 테마 — localStorage 우선, 없으면 prefers-color-scheme */
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* localStorage 비활성 환경 */
    }
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* 영속 실패 무시 */
      }
      return next;
    });
  }, []);

  /* 현재 시각 — 분 단위 갱신 (교실 게시 특성) */
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(interval);
  }, []);

  /* 라이트박스 ESC 닫기 */
  useEffect(() => {
    if (lightboxSrc === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

  /* ── 포스트잇 확대 팝업 ── */

  /** 팝업은 보드의 최신 항목을 참조 — 폴링 갱신이 곧바로 팝업에 반영(id 기준) */
  const expandedItem = useMemo(() => {
    if (expandedId === null) return null;
    return board?.items.find((item) => item.id === expandedId) ?? null;
  }, [board, expandedId]);

  /* 항목이 보드에서 제거되면 팝업 자동 닫기 */
  useEffect(() => {
    if (expandedId !== null && board !== null && expandedItem === null) {
      setExpandedId(null);
    }
  }, [expandedId, board, expandedItem]);

  /* 팝업 ESC 닫기 — 라이트박스가 위에 떠 있으면 라이트박스부터 닫힘 */
  useEffect(() => {
    if (expandedId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && lightboxSrc === null) setExpandedId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedId, lightboxSrc]);

  /* 팝업 열릴 때 닫기 버튼으로 포커스 이동 */
  useEffect(() => {
    if (expandedId !== null) popupCloseRef.current?.focus();
  }, [expandedId]);

  /* PWA — SW 등록 + 설치 프롬프트 캡처 */
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw-memo.js', { scope: '/memo/' })
        .catch(() => undefined);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      installEventRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      installEventRef.current = null;
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleInstall = useCallback(() => {
    const installEvent = installEventRef.current;
    if (installEvent) {
      void installEvent.prompt();
      void installEvent.userChoice.then(({ outcome }) => {
        if (outcome === 'accepted') {
          installEventRef.current = null;
          setCanInstall(false);
        }
      });
    } else {
      showToast(
        '이 브라우저는 바로 설치를 지원하지 않아요. 브라우저 메뉴에서 "홈 화면에 추가"를 눌러 주세요.',
      );
    }
  }, [showToast]);

  /* ── 주목 신호 (attention) ── */

  /** 헤더 펄스 — 절제된 시각 강조 (chime·소리 OFF 안내 시) */
  const triggerHeaderPulse = useCallback(() => {
    if (headerPulseTimerRef.current !== null) clearTimeout(headerPulseTimerRef.current);
    setHeaderPulse(true);
    headerPulseTimerRef.current = setTimeout(() => {
      headerPulseTimerRef.current = null;
      setHeaderPulse(false);
    }, HEADER_PULSE_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (headerPulseTimerRef.current !== null) clearTimeout(headerPulseTimerRef.current);
    };
  }, []);

  /** kind='tts' — 팝업 열고 낭독, 끝나면(실패·타임아웃 포함) 팝업 자동 닫기 + 수신 확인 ack */
  const runTtsAttention = useCallback(
    async (item: MemoShareItemSnapshot, nonce: string) => {
      const session = ++ttsSessionRef.current;
      setExpandedId(item.id);
      const result = await speakText(item.content); // 진행 중 낭독은 내부에서 취소
      if (ttsSessionRef.current !== session) return; // 새 신호가 가로챘으면 후처리 중단
      if (result.spoken) {
        // 낭독 성공 시에만 ack — 실패(spoken=false)는 enum 3종에 해당 없어 미전송
        sendAttentionAck(
          fileId,
          soundOnRef.current,
          nonce,
          result.fallbackUsed ? 'fallback-voice' : 'played',
        );
      }
      if (result.spoken && result.fallbackUsed) {
        showToast('전자칠판 기본 음성으로 읽었어요');
      }
      setExpandedId((current) => (current === item.id ? null : current));
    },
    [fileId, speakText, showToast],
  );

  const handleAttention = useCallback(
    (attention: MemoAttention, file: MemoShareBoardFile) => {
      if (!soundOnRef.current) {
        // 오디오 정책상 토글 OFF면 재생 불가 — 시각 강조 + 안내 + ack 'sound-off'
        triggerHeaderPulse();
        showToast('선생님이 주목 알림을 보냈어요 — 🔔 소리를 켜 주세요');
        sendAttentionAck(fileId, false, attention.nonce, 'sound-off');
        return;
      }
      if (attention.kind === 'chime') {
        playChimeRef.current(true); // 교사의 명시적 호출 — 5초 스로틀 우회
        triggerHeaderPulse();
        sendAttentionAck(fileId, true, attention.nonce, 'played');
        return;
      }
      // kind='tts' — 대상 항목이 보드에 없으면 무시 (parseAttention이 itemId 필수 보장)
      const target = attention.itemId
        ? file.items.find((item) => item.id === attention.itemId)
        : undefined;
      if (!target) return;
      void runTtsAttention(target, attention.nonce);
    },
    [fileId, triggerHeaderPulse, showToast, runTtsAttention],
  );
  handleAttentionRef.current = handleAttention;

  /* 팝업이 닫히면 진행 중 낭독도 중단 (학생이 ✕/딤/ESC로 닫는 경우) */
  useEffect(() => {
    if (expandedId === null) cancelSpeech();
  }, [expandedId, cancelSpeech]);

  /* 표시 목록 — 현재 항목 + 퇴장 중인 항목(fade-out), sortOrder 순 */
  const displayItems = useMemo(() => {
    const items: { item: MemoShareItemSnapshot; leaving: boolean }[] = (board?.items ?? []).map(
      (item) => ({
        item,
        leaving: false,
      }),
    );
    const currentIds = new Set(items.map(({ item }) => item.id));
    for (const item of leavingItems) {
      if (!currentIds.has(item.id)) items.push({ item, leaving: true });
    }
    items.sort((a, b) => a.item.sortOrder - b.item.sortOrder);
    return items;
  }, [board, leavingItems]);

  const fewItems = displayItems.length > 0 && displayItems.length <= 2;

  /* ── 상태 화면 ── */

  let stateScreen: ReactNode = null;
  if (status === 'loading') {
    stateScreen = (
      <div className={styles.stateScreen} role="status">
        <div className={styles.spinner} aria-hidden="true" />
        <h2 className={styles.stateTitle}>메모를 불러오고 있어요</h2>
        {!connected && (
          <p className={styles.stateDescription}>
            연결이 원활하지 않아요. 잠시 후 자동으로 다시 시도합니다.
          </p>
        )}
      </div>
    );
  } else if (status === 'gone') {
    stateScreen = (
      <div className={styles.stateScreen}>
        <div className={styles.stateEmoji} aria-hidden="true">
          📪
        </div>
        <h2 className={styles.stateTitle}>선생님이 공유를 중지했어요</h2>
        <p className={styles.stateDescription}>
          이 메모 보드는 더 이상 볼 수 없어요. 새 링크가 필요하면 선생님께 문의해 주세요.
        </p>
      </div>
    );
  } else if (status === 'config-error') {
    stateScreen = (
      <div className={styles.stateScreen}>
        <div className={styles.stateEmoji} aria-hidden="true">
          🔧
        </div>
        <h2 className={styles.stateTitle}>페이지 설정이 완료되지 않았어요</h2>
        <p className={styles.stateDescription}>
          보드를 읽기 위한 설정이 아직 등록되지 않았어요. 쌤핀 관리자에게 알려 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root} data-theme={theme}>
      <header className={`${styles.header} ${headerPulse ? styles.headerPulse : ''}`}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.boardTitle}>{board?.title.trim() || '우리 반 메모'}</h1>
          {now !== null && <span className={styles.clock}>{formatClock(now)}</span>}
        </div>

        <div className={styles.headerControls}>
          {/* 공유 중지(gone)·설정 오류는 재연결 대상이 아니므로 상태 점 미표시 */}
          {status !== 'gone' && status !== 'config-error' && (
            <span
              className={`${styles.statusDot} ${connected && status === 'ready' ? styles.statusDotOk : styles.statusDotBad}`}
              role="status"
              aria-label={
                connected && status === 'ready' ? '실시간 연결됨' : '연결 끊김 — 다시 연결 중'
              }
              title={connected && status === 'ready' ? '실시간 연결됨' : '연결 끊김 — 다시 연결 중'}
            />
          )}
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => {
              // ON 전환 제스처 안에서 speechSynthesis도 함께 unlock
              // (useMemoChime의 무음 재생은 AudioContext만 해제 — TTS는 별도 API)
              if (!soundOn) unlockTts();
              toggleSound();
            }}
            aria-pressed={soundOn}
            aria-label={soundOn ? '새 메모 알림음 끄기' : '새 메모 알림음 켜기'}
            title={soundOn ? '알림음 켜짐' : '알림음 꺼짐'}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={toggleTheme}
            aria-label={theme === 'light' ? '어두운 화면으로 바꾸기' : '밝은 화면으로 바꾸기'}
            title={theme === 'light' ? '어두운 화면' : '밝은 화면'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {!installed && (
            <button
              type="button"
              className={`${styles.controlButton} ${styles.installButton}`}
              onClick={handleInstall}
              aria-label="전자칠판에 앱으로 설치"
            >
              <span aria-hidden="true">⬇</span>
              <span className={styles.installLabel}>
                {canInstall ? '전자칠판에 설치' : '설치 안내'}
              </span>
            </button>
          )}
        </div>
      </header>

      {stateScreen ?? (
        <main className={styles.boardMain}>
          <div className={fewItems ? styles.gridFew : styles.grid}>
            {displayItems.length === 0 ? (
              <p className={styles.emptyBoard}>
                아직 공유된 메모가 없어요. 선생님이 메모를 올리면 여기에 바로 나타나요.
              </p>
            ) : (
              displayItems.map(({ item, leaving }) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    styles.card,
                    styles.cardClickable,
                    COLOR_CLASS[item.color],
                    freshIds.has(item.id) ? styles.cardFresh : '',
                    pulsedIds.has(item.id) ? styles.cardPulse : '',
                    leaving ? styles.cardLeaving : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (!leaving) setExpandedId(item.id);
                  }}
                  title="크게 보기"
                >
                  <span className={styles.colorBar} aria-hidden="true" />
                  {item.image && (
                    <img
                      className={styles.cardImage}
                      src={buildImageUrl(item.image.fileId)}
                      width={item.image.width}
                      height={item.image.height}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <span className={`${styles.cardContent} ${FONT_CLASS[item.fontSize]}`}>
                    {item.content}
                  </span>
                </button>
              ))
            )}
          </div>
        </main>
      )}

      <footer className={styles.footer}>쌤핀 · 우리 반 메모</footer>

      {expandedItem !== null && (
        <div className={styles.popupOverlay} onClick={() => setExpandedId(null)}>
          <div
            className={`${styles.popup} ${COLOR_CLASS[expandedItem.color]} ${
              pulsedIds.has(expandedItem.id) ? styles.cardPulse : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="메모 크게 보기"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={styles.colorBar} aria-hidden="true" />
            <button
              ref={popupCloseRef}
              type="button"
              className={styles.popupClose}
              onClick={() => setExpandedId(null)}
              aria-label="닫기"
            >
              ✕
            </button>
            {expandedItem.image && (
              <button
                type="button"
                className={styles.imageButton}
                onClick={() =>
                  expandedItem.image && setLightboxSrc(buildImageUrl(expandedItem.image.fileId))
                }
                aria-label="이미지 전체 화면으로 보기"
              >
                <img
                  className={styles.popupImage}
                  src={buildImageUrl(expandedItem.image.fileId)}
                  width={expandedItem.image.width}
                  height={expandedItem.image.height}
                  alt=""
                />
              </button>
            )}
            <div className={styles.popupBody}>
              <p className={`${styles.cardContent} ${FONT_CLASS[expandedItem.fontSize]}`}>
                {expandedItem.content}
              </p>
            </div>
          </div>
        </div>
      )}

      {lightboxSrc !== null && (
        <button
          type="button"
          className={styles.lightbox}
          onClick={() => setLightboxSrc(null)}
          aria-label="이미지 닫기"
        >
          <img className={styles.lightboxImage} src={lightboxSrc} alt="확대된 메모 이미지" />
        </button>
      )}

      {toast !== null && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
