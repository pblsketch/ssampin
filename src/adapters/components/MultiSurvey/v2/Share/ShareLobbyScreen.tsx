/**
 * ShareLobbyScreen — 학생 입장 대기 화면.
 *
 * 구성: QR(256px) + 입장 URL 텍스트 + 학생 아바타 그리드.
 * entryCode 는 폐기 (2026-06-12) — QR+URL 전용.
 * 학생 추가 시 fade-in (prefers-reduced-motion 시 즉시 표시).
 * sp-* 토큰: sp-bg / sp-card / sp-text / sp-accent
 */

import { memo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface ShareLobbyScreenProps {
  /** 학생 입장 URL (QR 인코딩 대상) */
  readonly entryUrl: string;
  readonly students: readonly StudentProfile[];
}

function ShareLobbyScreenImpl({ entryUrl, students }: ShareLobbyScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, entryUrl, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [entryUrl]);

  return (
    <section
      className="flex h-full w-full flex-col items-center gap-12 bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="입장 대기 화면"
    >
      <div className="flex w-full items-center justify-center gap-16">
        {/* QR */}
        <div className="flex flex-col items-center gap-4 rounded-xl bg-sp-card p-8 shadow-sp-md">
          <canvas ref={canvasRef} width={256} height={256} aria-label="학생 입장 QR 코드" />
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 24 }}>
            휴대전화로 QR을 찍어 입장
          </span>
        </div>

        {/* 입장 URL */}
        <div className="flex flex-col items-center gap-4">
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 32 }}>
            또는 아래 주소로 접속
          </span>
          <span
            className="font-sp-bold text-sp-accent"
            style={{ fontSize: 36, wordBreak: 'break-all', maxWidth: 560, textAlign: 'center' }}
            aria-label={`입장 주소 ${entryUrl}`}
          >
            {entryUrl}
          </span>
        </div>
      </div>

      {/* 학생 아바타 그리드 */}
      <div className="flex w-full flex-1 flex-col items-center gap-6">
        <span className="font-sp-semibold text-sp-text" style={{ fontSize: 36 }} aria-live="polite">
          입장한 친구 {students.length}명
        </span>
        <div
          className="flex w-full max-w-[1600px] flex-wrap items-start justify-center gap-6"
          role="list"
          aria-label="입장한 학생 목록"
        >
          {students.map((student) => (
            <div
              key={student.studentId}
              role="listitem"
              className="flex flex-col items-center gap-2 rounded-xl bg-sp-card px-6 py-4 shadow-sp-sm animate-fade-in"
              style={{ minWidth: 140 }}
            >
              <div
                className="flex items-center justify-center rounded-full bg-sp-accent font-sp-bold"
                style={{
                  width: 72,
                  height: 72,
                  fontSize: 32,
                  color: 'var(--sp-accent-fg)',
                }}
                aria-hidden
              >
                {student.avatarKey.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-sp-semibold text-sp-text" style={{ fontSize: 22 }}>
                {student.nickname}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const ShareLobbyScreen = memo(ShareLobbyScreenImpl);
