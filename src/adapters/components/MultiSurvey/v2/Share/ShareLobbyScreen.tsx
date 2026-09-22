/**
 * ShareLobbyScreen — 학생 입장 대기 화면.
 *
 * 구성: QR(256px) + 입장 URL 텍스트 + 학생 아바타 그리드.
 * 입장 코드는 이 화면이 아니라 상단 ShareEntryCodeBar 가 보여 준다
 *   (2026-06-12 "코드 폐기" 결정은 ADR-124 로 뒤집혔다 — 이 화면은 QR+URL 담당).
 * 학생 추가 시 fade-in (prefers-reduced-motion 시 즉시 표시).
 * sp-* 토큰: sp-bg / sp-card / sp-text / sp-accent
 */

import { memo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import {
  entryAccessClassroomNote,
  entryAccessLabel,
  type EntryAccessKind,
} from '@domain/rules/participationEntry';

interface ShareLobbyScreenProps {
  /** 학생 입장 URL (QR 인코딩 대상) */
  readonly entryUrl: string;
  readonly students: readonly StudentProfile[];
  /** 지금 안내하는 주소의 종류 (설계: domain/rules/participationEntry.ts) */
  readonly entryKind?: EntryAccessKind;
}

function ShareLobbyScreenImpl({
  entryUrl,
  students,
  entryKind = 'internet',
}: ShareLobbyScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 주소가 아직 없으면 QR을 그리지 않는다 — 빈 주소를 넘기면 그리기가 실패할 뿐 아니라,
  // 어쩌다 그려져도 학생은 아무 데도 못 가는 QR을 찍게 된다.
  const preparing = entryKind === 'preparing' || entryUrl.length === 0;
  const note = entryAccessClassroomNote(entryKind);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || preparing) return;
    void QRCode.toCanvas(canvas, entryUrl, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [entryUrl, preparing]);

  return (
    <section
      className="flex h-full w-full flex-col items-center gap-12 bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="입장 대기 화면"
    >
      {preparing ? (
        <div
          className="flex w-full flex-col items-center justify-center gap-6 rounded-xl bg-sp-card px-16 py-20"
          role="status"
          aria-live="polite"
        >
          <span className="font-sp-bold text-sp-text" style={{ fontSize: 44 }}>
            {entryAccessLabel('preparing')}
          </span>
          <span className="font-sp-medium text-sp-muted" style={{ fontSize: 30 }}>
            {note}
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-6">
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
          {note && (
            <span className="font-sp-semibold text-sp-warning" style={{ fontSize: 28 }}>
              {note}
            </span>
          )}
        </div>
      )}

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
                {/* 참여교실은 아바타 글자를 따로 받지 않는다 — 별명 첫 글자를 쓴다.
                    (예전에는 빈 파란 동그라미만 줄지어 있었다) */}
                {student.avatarKey.slice(0, 2).toUpperCase() || student.nickname.slice(0, 1)}
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
