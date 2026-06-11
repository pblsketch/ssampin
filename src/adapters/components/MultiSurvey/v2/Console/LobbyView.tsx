/**
 * LobbyView — 학생 입장 대기 화면.
 *
 * 입장 UI: QR + URL. (입장 코드 별도 미사용 — 2026-06-11 사용자 결정)
 * 우측에 입장한 학생 아바타 그리드 실시간 표시.
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-accent
 */

import { memo, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import { StudentAvatarGrid } from './StudentAvatarGrid';

interface LobbyViewProps {
  readonly entryUrl: string;
  readonly students: readonly StudentProfile[];
}

function LobbyViewImpl({ entryUrl, students }: LobbyViewProps): JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
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
          학생 입장 대기 중
        </span>
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
          <StudentAvatarGrid students={students} />
        )}
      </section>
    </div>
  );
}

export const LobbyView = memo(LobbyViewImpl);
