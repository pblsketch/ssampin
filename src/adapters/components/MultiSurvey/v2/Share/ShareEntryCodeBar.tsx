/**
 * ShareEntryCodeBar — 교실 모니터 상단 고정 입장 안내 배너.
 *
 * **QR을 활동 중에도 띄운다.** 대기 화면에는 큰 QR이 있지만 활동이 시작되면 사라져서,
 * 늦게 들어오거나 연결이 끊긴 학생은 주소를 눈으로 읽어 타이핑해야 했다.
 * 학교망에서 터널이 막히면 그 주소가 `http://125.177.195.51:63108` 같은 IP라 더 어렵다
 * (터널이 되면 `ssampin.app/s/ABCD` 같은 짧은 주소 + 코드가 나온다).
 *
 * 그래서 이 배너는 셋을 함께 준다 — **QR · 주소 · 코드(있을 때)**.
 * 주소는 뒷자리에서 숫자가 뭉치지 않도록 고정폭(tabular) 글자로 크게 쓴다.
 *
 * 코드 발급이 실패하면 코드 칸 없이 주소만 보여준다 — 진행은 계속된다.
 * (짧은 코드는 2026-06-12의 "코드 폐기" 결정을 ADR-124로 되돌린 것이다.)
 *
 * lobby phase 외에도 학생이 중간 입장할 수 있을 때 노출되므로
 * 부모(ClassroomShareView / ParticipationShare)가 phase 기반으로 표시 제어한다.
 *
 * sp-* 토큰: sp-surface (배경) / sp-text (라벨) / sp-accent (강조)
 */

import { memo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface ShareEntryCodeBarProps {
  /** 학생 입장 URL */
  readonly entryUrl: string;
  /** 짧은 입장 코드. 없으면(null) 코드 칸을 숨긴다 */
  readonly entryCode?: string | null;
  /** 현재 입장 학생 수 */
  readonly studentCount: number;
  /**
   * 배너에 QR을 띄울지. 대기 화면은 본문에 이미 큰 QR이 있으므로 false 로 준다
   * (같은 화면에 QR이 둘이면 어느 것을 찍어야 하는지 헷갈린다).
   */
  readonly showQr?: boolean;
}

/** 주소를 읽기 쉽게 — 타이핑할 사람에게 필요 없는 `http://` 는 작게 앞에 붙인다. */
function splitUrl(entryUrl: string): { scheme: string; rest: string } {
  const match = /^(https?:\/\/)(.*)$/.exec(entryUrl);
  if (!match) return { scheme: '', rest: entryUrl };
  return { scheme: match[1] ?? '', rest: match[2] ?? '' };
}

function ShareEntryCodeBarImpl({
  entryUrl,
  entryCode = null,
  studentCount,
  showQr = true,
}: ShareEntryCodeBarProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasCode = entryCode !== null && entryCode.length > 0;
  const { scheme, rest } = splitUrl(entryUrl);
  // 주소가 길면 표시용으로 자른다. QR과 aria-label 에는 원본이 그대로 들어간다.
  const displayRest = rest.length > 44 ? `${rest.slice(0, 44)}…` : rest;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entryUrl) return;
    // ⚠️ `showQr` 를 의존성에 반드시 넣는다.
    // 대기 화면에서는 캔버스를 그리지 않다가 활동이 시작되면 다시 붙는데, 그때 주소는 그대로다.
    // 주소만 보고 있으면 효과가 다시 돌지 않아 **빈 캔버스**가 남는다(실제로 그랬다).
    void QRCode.toCanvas(canvas, entryUrl, {
      width: 88,
      margin: 1,
      errorCorrectionLevel: 'M',
      // 밝은 바탕에 어두운 모듈이라야 찍힌다 — 테마와 무관하게 고정한다.
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [entryUrl, showQr]);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-8 bg-sp-surface px-12 py-3 text-sp-text"
      role="banner"
      aria-label="입장 안내 배너"
    >
      <div className="flex min-w-0 items-center gap-6">
        {showQr && (
          <canvas
            ref={canvasRef}
            width={88}
            height={88}
            className="shrink-0 rounded"
            aria-label="학생 입장 QR 코드"
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-sp-medium text-sp-muted" style={{ fontSize: 20 }}>
            {showQr ? 'QR을 찍거나 주소를 입력해 들어오세요' : '참여 주소'}
          </span>
          <div className="flex min-w-0 items-baseline gap-5">
            <span
              className="min-w-0 truncate font-sp-bold text-sp-accent"
              style={{ fontSize: 30 }}
              aria-label={`입장 주소 ${entryUrl}`}
            >
              {scheme && (
                <span className="font-sp-medium text-sp-muted" style={{ fontSize: 20 }}>
                  {scheme}
                </span>
              )}
              <span className="font-mono tabular-nums">{displayRest}</span>
            </span>
            {hasCode && (
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="font-sp-medium text-sp-muted" style={{ fontSize: 22 }}>
                  코드
                </span>
                <span
                  className="rounded-full border-2 border-sp-accent px-5 py-1 font-mono font-sp-bold tracking-widest text-sp-accent"
                  style={{ fontSize: 34 }}
                  aria-label={`입장 코드 ${entryCode}`}
                >
                  {entryCode}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div
        className="flex shrink-0 items-baseline gap-3 font-sp-semibold"
        style={{ fontSize: 26 }}
        aria-live="polite"
      >
        <span className="text-sp-accent" style={{ fontSize: 36 }}>
          {studentCount}
        </span>
        <span>명 참여 중</span>
      </div>
    </header>
  );
}

export const ShareEntryCodeBar = memo(ShareEntryCodeBarImpl);
