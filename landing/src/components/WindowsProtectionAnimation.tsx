'use client';

import styles from './WindowsProtectionAnimation.module.css';

interface WindowsProtectionAnimationProps {
  compact?: boolean;
}

type WarningScene = 'info' | 'run';

function ShieldIcon({ compact }: { compact: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-400/15 ${
        compact ? 'h-7 w-7' : 'h-10 w-10'
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${compact ? 'h-4 w-4' : 'h-7 w-7'} fill-blue-300`}
      >
        <path d="M12 2.2 5 5.2v5.6c0 4.4 2.9 8.5 7 10 4.1-1.5 7-5.6 7-10V5.2l-7-3Z" />
      </svg>
    </div>
  );
}

function CursorPointer({ className = '', compact }: { className?: string; compact: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={`pointer-events-none absolute drop-shadow-lg ${
        compact ? 'h-6 w-6' : 'h-8 w-8'
      } ${className}`}
    >
      <path
        d="M7 3.8 24.6 20l-8.2 1.1 4.1 7.2-3.2 1.8-4.1-7.2-5.2 6.5L7 3.8Z"
        className="fill-white"
      />
      <path
        d="M8.3 6.8 22 19.4l-7.6 1 3.9 6.8-1 .6-3.9-6.8-4.5 5.6-.6-19.8Z"
        className="fill-slate-500"
      />
    </svg>
  );
}

function StepBadge({ number, text, compact }: { number: string; text: string; compact: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 font-extrabold text-blue-700 ${
        compact ? 'text-xs' : 'text-base'
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600 text-white ${
          compact ? 'h-5 w-5 text-[0.7rem]' : 'h-7 w-7 text-sm'
        }`}
      >
        {number}
      </span>
      <span>{text}</span>
    </div>
  );
}

function WarningPanel({ scene, compact }: { scene: WarningScene; compact: boolean }) {
  const isRunScene = scene === 'run';

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl bg-blue-950 text-white ${
        compact ? 'min-h-[165px] p-3' : 'min-h-[220px] p-5 sm:p-6'
      }`}
    >
      <div className={`flex ${compact ? 'gap-2.5' : 'gap-6'}`}>
        <ShieldIcon compact={compact} />
        <div className="min-w-0">
          <p className={`${compact ? 'text-sm' : 'text-xl'} font-extrabold leading-tight`}>
            Windows의 PC 보호
          </p>
          <p
            className={`mt-3 max-w-xl font-semibold leading-relaxed text-blue-100/80 ${
              compact ? 'text-[0.7rem]' : 'text-sm'
            }`}
          >
            Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다.
          </p>

          {isRunScene ? (
            <div
              className={`space-y-1 font-semibold text-blue-100/80 ${
                compact ? 'mt-4 text-[0.7rem]' : 'mt-6 text-sm'
              }`}
            >
              <p className="break-all">앱: SsamPin-setup.exe</p>
              <p>게시자: 알 수 없는 게시자</p>
            </div>
          ) : (
            <p
              className={`font-semibold text-blue-100/75 ${
                compact ? 'mt-3 text-[0.7rem]' : 'mt-5 text-sm'
              }`}
            >
              이 앱을 실행하면 PC가 위험에 노출될 수 있습니다.
            </p>
          )}

          {!isRunScene && (
            <span
              aria-hidden="true"
              className={`${styles.infoTarget} mt-3 inline-flex rounded-md bg-yellow-300/25 px-2 py-0.5 font-extrabold text-yellow-300 ring-2 ring-yellow-300/70 ${
                compact ? 'text-xs' : 'text-base'
              }`}
            >
              추가 정보
            </span>
          )}
        </div>
      </div>

      {isRunScene ? (
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-6 sm:gap-3">
          <span
            aria-hidden="true"
            className={`rounded-md border border-blue-300/30 bg-blue-700/45 font-bold text-white ${
              compact ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'
            }`}
          >
            실행 안 함
          </span>
          <span
            aria-hidden="true"
            className={`${styles.runTarget} rounded-md bg-yellow-300 font-extrabold text-blue-950 ring-4 ring-yellow-200/60 ${
              compact ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'
            }`}
          >
            실행
          </span>
        </div>
      ) : (
        <div className="mt-auto flex justify-end pt-6">
          <span
            aria-hidden="true"
            className={`rounded-md border border-blue-300/30 bg-blue-700/45 font-bold text-white ${
              compact ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'
            }`}
          >
            실행 안 함
          </span>
        </div>
      )}

      {isRunScene ? (
        <CursorPointer
          compact={compact}
          className={`${styles.cursorRun} ${compact ? 'bottom-1 right-0' : 'bottom-2 right-3'}`}
        />
      ) : (
        <CursorPointer
          compact={compact}
          className={`${styles.cursorInfo} ${compact ? 'left-[15%] top-[58%]' : 'left-[20%] top-[56%]'}`}
        />
      )}
    </div>
  );
}

export default function WindowsProtectionAnimation({
  compact = false,
}: WindowsProtectionAnimationProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-sp-border bg-white text-left shadow-sm ${
        compact ? '' : 'max-w-2xl'
      }`}
      aria-label="Windows 보호 경고 해결 방법"
    >
      <div
        className={`flex items-center gap-3 border-b border-sp-border ${compact ? 'p-3' : 'p-5'}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-full border-2 border-green-500 text-green-600 ${
            compact ? 'h-8 w-8' : 'h-10 w-10'
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`${compact ? 'h-5 w-5' : 'h-5 w-5'}`}
            fill="none"
          >
            <path
              d="m5 12 4 4L20 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </div>
        <p
          className={`font-extrabold leading-tight text-sp-text ${
            compact ? 'text-sm' : 'text-xl sm:text-2xl'
          }`}
        >
          Windows 보호 경고 해결 방법
        </p>
      </div>

      <div className={compact ? 'p-3' : 'p-5 sm:p-6'}>
        <p className={`leading-relaxed text-sp-muted ${compact ? 'text-xs' : 'text-base'}`}>
          다운로드 후 설치 시 아래와 같은 경고가 나타날 수 있습니다.
        </p>

        <div className={compact ? 'mt-3 space-y-3' : 'mt-5 space-y-4'}>
          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            <StepBadge number="1" text="'추가 정보' 클릭" compact={compact} />
            <WarningPanel scene="info" compact={compact} />
          </div>

          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            <StepBadge number="2" text="'실행' 버튼 클릭" compact={compact} />
            <WarningPanel scene="run" compact={compact} />
          </div>
        </div>

        <p
          className={`${compact ? 'mt-3 text-xs' : 'mt-5 text-base'} leading-relaxed text-blue-700`}
        >
          Windows 보호 정책에 따른 정상적인 경고입니다.
          <br />
          쌤핀 공식 홈페이지에서 다운로드한 파일은 보안상 안전합니다.
        </p>
      </div>
    </div>
  );
}
