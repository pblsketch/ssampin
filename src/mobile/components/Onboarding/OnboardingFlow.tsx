import { useState } from 'react';

interface Props {
  onComplete: () => void;
  onLogin: () => void;
}

interface SlideData {
  icon: string;
  title: string;
  description: string;
  features?: string[];
}

const slides: SlideData[] = [
  {
    icon: '👋',
    title: '쌤핀 모바일에\n오신 걸 환영해요',
    description: '교무실 PC의 데이터를\n교실에서도 확인하세요',
  },
  {
    icon: '📋',
    title: '시간표·출결·메모를\n한눈에',
    description: '오늘 필요한 정보를 빠르게 확인하고\n출결 체크도 바로 할 수 있어요',
    features: ['오늘 시간표', '담임/수업 출결 체크', '메모·할 일', '급식·날씨'],
  },
  {
    icon: '🔄',
    title: 'Google Drive로\n자동 동기화',
    description: 'PC에서 입력한 데이터가\n모바일에 자동으로 반영돼요',
    features: ['Google 계정 로그인', 'PC ↔ 모바일 동기화', '오프라인에서도 사용 가능'],
  },
];

export function OnboardingFlow({ onComplete, onLogin }: Props) {
  const [step, setStep] = useState(0);

  const isLast = step === slides.length - 1;
  const slide = slides[step];
  if (!slide) return null;

  return (
    <div className="flex flex-col h-dvh mobile-bg">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">{slide.icon}</div>
        <h1 className="text-2xl font-bold text-sp-text whitespace-pre-line leading-tight">
          {slide.title}
        </h1>
        <p className="text-sp-muted mt-3 text-sm whitespace-pre-line">
          {slide.description}
        </p>
        {slide.features && (
          <div className="mt-6 space-y-2">
            {slide.features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-sp-text">
                <span className="text-blue-500">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 인디케이터 + 버튼 */}
      <div className="px-6 pb-8 space-y-4" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        {/* 도트 인디케이터 */}
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-blue-500' : 'bg-sp-border'
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="space-y-3">
            <button
              onClick={onLogin}
              className="w-full py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-base active:scale-[0.98] transition-transform"
            >
              Google 계정으로 시작하기
            </button>
            <button
              onClick={onComplete}
              className="w-full py-3 text-sp-muted text-sm"
            >
              나중에 로그인할게요
            </button>
          </div>
        ) : (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="w-full py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-base active:scale-[0.98] transition-transform"
          >
            다음
          </button>
        )}
      </div>
    </div>
  );
}
