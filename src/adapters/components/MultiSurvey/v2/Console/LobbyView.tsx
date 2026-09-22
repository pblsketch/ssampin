/**
 * LobbyView — 학생 입장 대기 화면.
 *
 * 입장 UI: QR + 주소 + **짧은 코드**.
 * 코드를 주소와 분리해 크게 보여주고, 기억하기 쉬운 이름으로 바꿀 수 있다
 * (QR을 못 찍는 학생이 긴 주소를 타이핑하지 않게 하려는 것 — 2026-06-11 "코드 미사용" 결정을 되돌림).
 * 코드 발급이 실패하면 코드 칸 없이 주소만 안내한다. 진행은 막지 않는다.
 *
 * 우측에 입장한 학생 아바타 그리드 실시간 표시.
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-accent / sp-muted
 */

import { memo, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import { StudentAvatarGrid } from './StudentAvatarGrid';
import { CopyLinkButton } from '@adapters/components/Tools/CopyLinkButton';
import { entryAccessLabel, type EntryAccessKind } from '@domain/rules/participationEntry';

interface LobbyViewProps {
  readonly entryUrl: string;
  /** 짧은 입장 코드 (없으면 코드 칸을 숨긴다) */
  readonly entryCode?: string | null;
  /** 코드 이름 바꾸기. 성공 여부를 돌려준다. */
  readonly onChangeEntryCode?: (nextCode: string) => Promise<boolean>;
  /** 코드 변경 실패 사유 */
  readonly entryCodeError?: string | null;
  readonly students: readonly StudentProfile[];
  /** DN-03: 최근 wave 보낸 학생 ID 집합 (pulse 표시용) */
  readonly recentWaveStudentIds?: ReadonlySet<string>;
  /** 지금 안내하는 주소의 종류 (설계: domain/rules/participationEntry.ts) */
  readonly entryKind?: EntryAccessKind;
  /** 기다리지 않고 같은 Wi-Fi 주소로 내려간다 */
  readonly onUseLocalEntry?: () => void;
}

function LobbyViewImpl({
  entryUrl,
  entryCode = null,
  onChangeEntryCode,
  entryCodeError = null,
  students,
  recentWaveStudentIds,
  entryKind = 'internet',
  onUseLocalEntry,
}: LobbyViewProps): JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const submitCode = async (): Promise<void> => {
    if (!onChangeEntryCode) return;
    const next = codeDraft.trim();
    if (next.length === 0) return;
    setSaving(true);
    const ok = await onChangeEntryCode(next);
    setSaving(false);
    if (ok) {
      setEditingCode(false);
      setCodeDraft('');
    }
  };

  useEffect(() => {
    let cancelled = false;
    // 주소가 아직 없으면(준비 중) QR을 만들지 않는다 — 빈 QR은 찍으면 아무 데도 안 간다.
    if (!entryUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(entryUrl, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entryUrl]);

  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8">
      <section
        className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-sp-border bg-sp-card p-8"
        aria-label="입장 안내"
      >
        <span className="font-sp-bold text-sp-text" style={{ fontSize: 32 }}>
          {entryAccessLabel(entryKind)}
        </span>

        {entryKind === 'preparing' ? (
          /* 아직 주소가 없다. 빈 QR·빈 주소 칸을 보여 주면 선생님이 그걸 불러 준다. */
          <div
            className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-sp-border px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div
              className="h-8 w-8 rounded-full border-2 border-sp-border border-t-sp-accent animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
              주소가 만들어지면 QR이 나타나요
            </span>
          </div>
        ) : (
          <>
            <div
              className="flex h-[280px] w-[280px] items-center justify-center rounded-xl border border-sp-border bg-sp-card"
              role="img"
              aria-label="입장 QR 코드"
            >
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="입장 QR 코드" width={240} height={240} />
              ) : (
                <canvas ref={canvasRef} width={240} height={240} aria-hidden="true" />
              )}
            </div>
            <div
              className="w-full break-all rounded-lg border border-sp-border bg-sp-card px-4 py-3 text-center font-sp-medium text-sp-accent"
              style={{ fontSize: 20 }}
              aria-label="입장 주소"
            >
              {entryUrl}
            </div>
            <CopyLinkButton url={entryUrl} ariaLabel="학생 참여 링크 복사" />
          </>
        )}

        {entryKind === 'preparing' && onUseLocalEntry && (
          <button
            type="button"
            onClick={onUseLocalEntry}
            className="rounded-lg border border-sp-border px-4 py-2 font-sp-medium text-sp-muted hover:border-sp-accent hover:text-sp-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
            style={{ fontSize: 15 }}
          >
            기다리지 않고 같은 Wi-Fi 주소로 시작하기
          </button>
        )}

        {entryCode !== null && entryCode.length > 0 && (
          <div className="flex w-full flex-col items-center gap-2">
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
              QR을 못 찍는 학생은 이 코드로 들어올 수 있어요
            </span>
            <div
              className="rounded-lg border-2 border-sp-accent px-6 py-2 font-sp-bold tracking-widest text-sp-accent"
              style={{ fontSize: 40 }}
              aria-label={`입장 코드 ${entryCode}`}
            >
              {entryCode}
            </div>

            {onChangeEntryCode && (
              <>
                {editingCode ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitCode();
                    }}
                  >
                    <input
                      type="text"
                      value={codeDraft}
                      onChange={(e) => setCodeDraft(e.target.value)}
                      placeholder="예: 3학년2반"
                      aria-label="새 입장 코드"
                      className="w-40 rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-center font-sp-medium text-sp-text focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
                      style={{ fontSize: 16 }}
                    />
                    <button
                      type="submit"
                      disabled={saving || codeDraft.trim().length === 0}
                      className="rounded-lg bg-sp-accent px-4 py-1.5 font-sp-medium text-[color:var(--sp-accent-fg)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
                      style={{ fontSize: 15 }}
                    >
                      {saving ? '바꾸는 중...' : '바꾸기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCode(false);
                        setCodeDraft('');
                      }}
                      className="rounded-lg border border-sp-border px-3 py-1.5 font-sp-medium text-sp-muted hover:text-sp-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
                      style={{ fontSize: 15 }}
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCode(true);
                      setCodeDraft(entryCode);
                    }}
                    className="rounded-lg border border-sp-border px-3 py-1.5 font-sp-medium text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors duration-sp-base motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
                    style={{ fontSize: 15 }}
                  >
                    기억하기 쉬운 코드로 바꾸기
                  </button>
                )}
                {entryCodeError !== null && entryCodeError.length > 0 && (
                  <span
                    className="text-center font-sp-medium text-sp-warning"
                    style={{ fontSize: 14 }}
                    role="alert"
                  >
                    {entryCodeError}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section
        className="flex flex-col gap-4 rounded-2xl border border-sp-border bg-sp-card p-8"
        aria-label="입장한 학생"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-sp-semibold text-sp-text" style={{ fontSize: 24 }}>
            입장한 학생
          </span>
          <span className="font-sp-bold text-sp-accent" style={{ fontSize: 28 }}>
            {students.length}명
          </span>
        </div>
        {students.length === 0 ? (
          <div
            className="flex flex-1 items-center justify-center font-sp-medium text-sp-text"
            style={{ fontSize: 18 }}
          >
            아직 입장한 학생이 없습니다.
          </div>
        ) : (
          <StudentAvatarGrid students={students} recentWaveStudentIds={recentWaveStudentIds} />
        )}
      </section>
    </div>
  );
}

export const LobbyView = memo(LobbyViewImpl);
