/**
 * LessonLobby — 수업 시작 전 대기 화면 (Plan §2-1 ② 단계).
 *
 * - 세션 이름 + 접속 모드 (LAN/터널) 입력
 * - "세션 시작" 시 IPC로 WS 서버 listen → port/shortCode/QR 발급
 * - 학생 명부 실시간 업데이트 (useSlidesSessionStore.totalOnline)
 * - "수업 설정 수정" — status='lobby'에서만 허용 (UX 안전망)
 * - "진행 시작" → presenter
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type {
  InteractiveLesson,
  SessionAccessMode,
} from '@domain/entities/InteractiveSlides';
import { useSlidesSessionStore } from '@adapters/stores/useSlidesSessionStore';

export interface LessonLobbyProps {
  readonly lesson: InteractiveLesson;
  readonly onBeginPresentation: () => void;
  readonly onReturnToEditor: () => void;
}

export function LessonLobby({
  lesson,
  onBeginPresentation,
  onReturnToEditor,
}: LessonLobbyProps): JSX.Element {
  const status = useSlidesSessionStore((s) => s.status);
  const shortCode = useSlidesSessionStore((s) => s.shortCode);
  const port = useSlidesSessionStore((s) => s.port);
  const totalOnline = useSlidesSessionStore((s) => s.totalOnline);
  const students = useSlidesSessionStore((s) => s.students);
  const connectionState = useSlidesSessionStore((s) => s.connectionState);
  const errorMessage = useSlidesSessionStore((s) => s.errorMessage);
  const startSession = useSlidesSessionStore((s) => s.startSession);
  const beginPresentation = useSlidesSessionStore((s) => s.beginPresentation);
  const stopSession = useSlidesSessionStore((s) => s.stopSession);

  const [sessionName, setSessionName] = useState('');
  const [accessMode, setAccessMode] = useState<SessionAccessMode>('lan');

  const isStarted = status === 'lobby' && shortCode != null;
  const canEdit = !isStarted; // 시작 전에만 설정 변경 가능

  const handleStart = async (): Promise<void> => {
    const trimmed = sessionName.trim();
    if (trimmed.length === 0) {
      alert('세션 이름을 입력해 주세요. 예: "2반 1교시"');
      return;
    }
    try {
      await startSession({
        lesson,
        sessionName: trimmed,
        accessMode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '세션 시작 실패';
      alert(msg);
    }
  };

  const handleBegin = (): void => {
    beginPresentation();
    onBeginPresentation();
  };

  const handleReturnToEditor = (): void => {
    if (isStarted) {
      if (
        !confirm(
          '이미 학생이 입장했어요.\n수업 설정으로 돌아가면 학생들은 로비에서 계속 대기합니다.\n돌아갈까요?',
        )
      )
        return;
      void stopSession();
    }
    onReturnToEditor();
  };

  return (
    <div className="flex flex-col h-full bg-sp-bg text-sp-text overflow-y-auto">
      <header className="flex items-center justify-between px-6 py-4 bg-sp-surface border-b border-sp-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReturnToEditor}
            className="text-sm text-sp-muted hover:text-sp-text"
          >
            ← 수업 설정 수정
          </button>
          <h1 className="text-lg font-bold">{lesson.title}</h1>
        </div>
        {isStarted && (
          <button
            type="button"
            onClick={handleBegin}
            className="px-5 py-2 bg-sp-highlight text-sp-bg font-bold rounded-lg text-sm hover:bg-sp-highlight/90"
          >
            진행 시작 →
          </button>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        {connectionState === 'error' && errorMessage && (
          <div className="bg-red-500/10 border border-red-400/50 rounded-xl px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {!isStarted ? (
          <SessionConfigCard
            sessionName={sessionName}
            onSessionNameChange={setSessionName}
            accessMode={accessMode}
            onAccessModeChange={setAccessMode}
            isStarting={connectionState === 'starting'}
            onStart={() => void handleStart()}
          />
        ) : (
          <SessionLiveCard
            shortCode={shortCode}
            port={port}
            accessMode={accessMode}
            sessionName={sessionName || '세션'}
            totalOnline={totalOnline}
            students={students}
            canEdit={canEdit}
            onStop={() => void stopSession()}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SessionConfigCard — 시작 전 입력 폼
// ─────────────────────────────────────────────────────────────
interface SessionConfigCardProps {
  readonly sessionName: string;
  readonly onSessionNameChange: (value: string) => void;
  readonly accessMode: SessionAccessMode;
  readonly onAccessModeChange: (mode: SessionAccessMode) => void;
  readonly isStarting: boolean;
  readonly onStart: () => void;
}

function SessionConfigCard({
  sessionName,
  onSessionNameChange,
  accessMode,
  onAccessModeChange,
  isStarting,
  onStart,
}: SessionConfigCardProps): JSX.Element {
  return (
    <section className="bg-sp-card border border-sp-border rounded-xl p-6 space-y-5">
      <h2 className="text-base font-bold">세션 설정</h2>

      <div>
        <label className="block text-xs text-sp-muted mb-1">세션 이름</label>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => onSessionNameChange(e.target.value)}
          placeholder='예: "2반 1교시"'
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
          maxLength={50}
        />
        <p className="mt-1 text-xs text-sp-muted">
          나중에 결과를 다시 볼 때 어느 수업이었는지 구분해 줘요.
        </p>
      </div>

      <div>
        <label className="block text-xs text-sp-muted mb-2">접속 방식</label>
        <div className="grid grid-cols-2 gap-2">
          <AccessModeButton
            label="교내 Wi-Fi (LAN)"
            description="학교에서만 사용. 빠르고 안전"
            isSelected={accessMode === 'lan'}
            onClick={() => onAccessModeChange('lan')}
          />
          <AccessModeButton
            label="외부 인터넷 (터널)"
            description="학교 밖에서도 접속 가능"
            warn
            isSelected={accessMode === 'tunnel'}
            onClick={() => onAccessModeChange('tunnel')}
          />
        </div>
        {accessMode === 'tunnel' && (
          <p className="mt-2 text-xs text-amber-300">
            ⚠ 학생 실명·응답이 인터넷을 경유합니다. 가능하면 LAN 모드를 사용하세요.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={isStarting || sessionName.trim().length === 0}
        className="w-full px-4 py-3 bg-sp-accent text-white font-bold rounded-lg text-sm hover:bg-sp-accent/90 disabled:bg-sp-border disabled:text-sp-muted disabled:cursor-not-allowed"
      >
        {isStarting ? '준비 중…' : '세션 만들기'}
      </button>
    </section>
  );
}

interface AccessModeButtonProps {
  readonly label: string;
  readonly description: string;
  readonly isSelected: boolean;
  readonly warn?: boolean;
  readonly onClick: () => void;
}

function AccessModeButton({
  label,
  description,
  isSelected,
  warn = false,
  onClick,
}: AccessModeButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border transition-colors ${
        isSelected
          ? warn
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-sp-accent bg-sp-accent/10'
          : 'border-sp-border bg-sp-bg hover:border-sp-accent/60'
      }`}
      aria-pressed={isSelected}
    >
      <div className="text-sm font-bold text-sp-text mb-0.5">{label}</div>
      <div className="text-xs text-sp-muted">{description}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// SessionLiveCard — 시작 후 QR/코드/학생 명부
// ─────────────────────────────────────────────────────────────
interface SessionLiveCardProps {
  readonly shortCode: string | null;
  readonly port: number | null;
  readonly accessMode: SessionAccessMode;
  readonly sessionName: string;
  readonly totalOnline: number;
  readonly students: ReadonlyMap<string, { studentName: string; online: boolean }>;
  readonly canEdit: boolean;
  readonly onStop: () => void;
}

function SessionLiveCard({
  shortCode,
  port,
  accessMode,
  sessionName,
  totalOnline,
  students,
  canEdit: _canEdit,
  onStop,
}: SessionLiveCardProps): JSX.Element {
  const lanUrl = port ? `http://${getLocalIpHint()}:${port}` : '';
  // QR target — 학생이 직접 입장하는 URL. shortCode를 query로 포함.
  const qrTarget = port ? `${lanUrl}?code=${shortCode ?? ''}` : '';

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
      <SessionCodeDisplay
        shortCode={shortCode}
        qrTarget={qrTarget}
        lanUrl={lanUrl}
        accessMode={accessMode}
      />
      <StudentRosterCard
        sessionName={sessionName}
        totalOnline={totalOnline}
        students={students}
        onStop={onStop}
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SessionCodeDisplay — QR + 코드 + URL
// ─────────────────────────────────────────────────────────────
interface SessionCodeDisplayProps {
  readonly shortCode: string | null;
  readonly qrTarget: string;
  readonly lanUrl: string;
  readonly accessMode: SessionAccessMode;
}

function SessionCodeDisplay({
  shortCode,
  qrTarget,
  lanUrl,
  accessMode,
}: SessionCodeDisplayProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !qrTarget) return;
    void QRCode.toCanvas(canvasRef.current, qrTarget, {
      width: 220,
      margin: 2,
      color: { dark: '#1a2332', light: '#ffffff' },
    });
  }, [qrTarget]);

  const handleCopyUrl = async (): Promise<void> => {
    if (!lanUrl) return;
    try {
      await navigator.clipboard.writeText(lanUrl);
      setCopyMessage('URL을 복사했어요');
      setTimeout(() => setCopyMessage(null), 1500);
    } catch {
      setCopyMessage('복사 실패');
      setTimeout(() => setCopyMessage(null), 1500);
    }
  };

  return (
    <div className="bg-sp-card border border-sp-border rounded-xl p-6 flex flex-col items-center gap-4 min-w-[280px]">
      <div className="text-xs text-sp-muted uppercase tracking-wider">참여 코드</div>
      <div className="text-5xl font-mono font-bold tracking-[0.3em] text-sp-text">
        {shortCode ?? '------'}
      </div>

      <div className="bg-white p-2 rounded-xl">
        <canvas ref={canvasRef} className="block" />
      </div>

      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-xs text-sp-text font-mono truncate">
            {lanUrl || '준비 중…'}
          </code>
          <button
            type="button"
            onClick={() => void handleCopyUrl()}
            className="px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-xs hover:border-sp-accent"
          >
            {copyMessage ?? '복사'}
          </button>
        </div>
        {accessMode === 'tunnel' && (
          <div className="px-3 py-2 bg-amber-400/10 border border-amber-400/30 rounded-lg text-xs text-amber-200">
            🌐 외부 인터넷 노출 모드 — 학생 PII가 인터넷 경유
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StudentRosterCard — 입장한 학생 목록
// ─────────────────────────────────────────────────────────────
interface StudentRosterCardProps {
  readonly sessionName: string;
  readonly totalOnline: number;
  readonly students: ReadonlyMap<string, { studentName: string; online: boolean }>;
  readonly onStop: () => void;
}

function StudentRosterCard({
  sessionName,
  totalOnline,
  students,
  onStop,
}: StudentRosterCardProps): JSX.Element {
  const list = Array.from(students.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.studentName.localeCompare(b.studentName);
  });

  return (
    <div className="bg-sp-card border border-sp-border rounded-xl p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-sp-muted">{sessionName}</div>
          <div className="text-base font-bold">
            입장 {totalOnline}명
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="text-xs text-sp-muted hover:text-red-400"
        >
          세션 닫기
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-sp-muted py-12">
          학생들이 코드를 입력하면 여기에 나타납니다.
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto space-y-1 max-h-[60vh]">
          {list.map((s, idx) => (
            <li
              key={`${s.studentName}-${idx}`}
              className="flex items-center gap-2 px-3 py-1.5 bg-sp-bg rounded-lg"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.online ? 'bg-emerald-400' : 'bg-sp-muted'
                }`}
                aria-hidden
              />
              <span className="text-sm text-sp-text truncate">
                {s.studentName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 로컬 IP 힌트 (메인 프로세스에서 향후 IPC 추가 예정 — 임시 placeholder)
// ─────────────────────────────────────────────────────────────
function getLocalIpHint(): string {
  // 향후 'slides-session:get-local-ip' IPC 추가 시 교체.
  // 현재는 사용자가 직접 IP를 알아내거나 `localhost`로 fallback.
  return 'localhost';
}
