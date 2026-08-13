import { useState, type ReactNode } from 'react';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { PeriodTimesEditor } from '@mobile/components/Settings/PeriodTimesEditor';

interface Props {
  onComplete: () => void;
  onLogin: () => void;
}

interface SlideData {
  /** true 면 쌤핀이 마스코트, 아니면 icon(Material Symbol) 표시. */
  mascot?: boolean;
  icon?: string;
  title: string;
  description: string;
  features?: string[];
}

const slides: SlideData[] = [
  {
    mascot: true,
    title: '쌤핀 모바일에\n오신 걸 환영해요',
    description: '교무실 PC의 데이터를\n교실에서도 확인하세요',
  },
  {
    icon: 'checklist',
    title: '시간표·출결·메모를\n한눈에',
    description: '오늘 필요한 정보를 빠르게 확인하고\n출결 체크도 바로 할 수 있어요',
    features: ['오늘 시간표', '담임/수업 출결 체크', '메모·할 일', '급식·날씨'],
  },
  {
    icon: 'cloud_sync',
    title: 'Google Drive로\n자동 동기화',
    description: 'PC 데이터가 Google Drive를 거쳐\n자동으로 동기화돼요 (몇 분 이내 반영)',
    features: ['Google 계정 로그인', 'PC ↔ 모바일 동기화', '오프라인에서도 사용 가능'],
  },
];

// 교시 시간 프리셋. 'preset7' 은 앱 기본값과 동일 → 따로 저장하지 않는다(=설정 안 함).
const PRESET_6: readonly PeriodTime[] = [
  { period: 1, start: '09:00', end: '09:45' },
  { period: 2, start: '09:55', end: '10:40' },
  { period: 3, start: '10:50', end: '11:35' },
  { period: 4, start: '11:45', end: '12:30' },
  { period: 5, start: '13:30', end: '14:15' },
  { period: 6, start: '14:25', end: '15:10' },
];
const PRESET_7_PREVIEW: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:30' },
  { period: 2, start: '09:40', end: '10:20' },
  { period: 3, start: '10:30', end: '11:10' },
  { period: 4, start: '11:20', end: '12:00' },
  { period: 5, start: '13:00', end: '13:40' },
  { period: 6, start: '13:50', end: '14:30' },
  { period: 7, start: '14:40', end: '15:20' },
];

type PeriodChoice = 'preset7' | 'preset6' | 'custom';

const INTRO_COUNT = slides.length; // 3
const STEP_SCHOOL = INTRO_COUNT; // 3
const STEP_PERIODS = INTRO_COUNT + 1; // 4
const STEP_LOGIN = INTRO_COUNT + 2; // 5
const TOTAL_STEPS = STEP_LOGIN + 1; // 6

export function OnboardingFlow({ onComplete, onLogin }: Props) {
  const [step, setStep] = useState(0);

  // 학교 정보
  const [schoolName, setSchoolName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');

  // 교시 시간
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>('preset7');
  const [customPeriods, setCustomPeriods] = useState<PeriodTime[] | null>(PRESET_7_PREVIEW.slice());

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  // 입력한 값만 모아서 저장 (전부 선택사항).
  const persistSetup = async () => {
    const patch: {
      schoolName?: string;
      teacherName?: string;
      className?: string;
      periodTimes?: PeriodTime[];
    } = {};
    if (schoolName.trim()) patch.schoolName = schoolName.trim();
    if (teacherName.trim()) patch.teacherName = teacherName.trim();
    if (className.trim()) patch.className = className.trim();
    if (periodChoice === 'preset6') patch.periodTimes = PRESET_6.slice();
    else if (periodChoice === 'custom' && customPeriods && customPeriods.length > 0) {
      patch.periodTimes = customPeriods;
    }
    if (Object.keys(patch).length === 0) return;
    try {
      await useMobileSettingsStore.getState().updateSettings(patch);
    } catch {
      /* ignore — 온보딩에서의 저장 실패는 치명적이지 않음(설정 화면에서 다시 입력 가능) */
    }
  };

  const finish = async (login: boolean) => {
    await persistSetup();
    if (login) onLogin();
    else onComplete();
  };

  const wrap = (content: ReactNode, footer: ReactNode) => (
    <div className="flex flex-col h-dvh mobile-bg">
      <div className="flex-1 overflow-y-auto px-6 pt-8">{content}</div>
      <div
        className="px-6 pb-8 space-y-4"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-sp-accent' : 'bg-sp-border'
              }`}
            />
          ))}
        </div>
        {footer}
      </div>
    </div>
  );

  // ── 인트로 슬라이드 (0~2) ──
  if (step < INTRO_COUNT) {
    const slide = slides[step];
    if (!slide) return null;
    return wrap(
      <div className="flex flex-col items-center justify-center min-h-full text-center pb-4">
        {slide.mascot ? (
          <img
            src="/floating-pin.png"
            alt=""
            aria-hidden
            className="mb-6 h-28 w-28 select-none sp-float"
          />
        ) : (
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-black/5 dark:bg-white/10">
            <span className="material-symbols-outlined text-5xl text-sp-accent">{slide.icon}</span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-sp-text whitespace-pre-line leading-tight">
          {slide.title}
        </h1>
        <p className="text-sp-muted mt-3 text-sm whitespace-pre-line">{slide.description}</p>
        {slide.features && (
          <div className="mt-6 space-y-2">
            {slide.features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-sp-text">
                <span className="material-symbols-outlined text-icon-md text-sp-accent">
                  check_circle
                </span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </div>,
      <button
        onClick={next}
        className="w-full py-3.5 rounded-2xl bg-sp-accent text-sp-accent-fg font-semibold text-base active:scale-[0.98] transition-transform"
      >
        다음
      </button>,
    );
  }

  // ── 학교 정보 (3) ──
  if (step === STEP_SCHOOL) {
    return wrap(
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10">
            <span className="material-symbols-outlined text-4xl text-sp-accent">school</span>
          </div>
          <h1 className="text-xl font-bold text-sp-text">학교 정보</h1>
          <p className="text-sp-muted mt-1 text-sm">
            나중에 설정에서 바꿀 수 있어요. 비워두고 넘어가도 됩니다.
          </p>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-sp-text">학교명</span>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="예: 한빛중학교"
              className="glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted/50"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-sp-text">교사명</span>
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="예: 김선생"
              className="glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted/50"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-sp-text">담임 학급</span>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="예: 3학년 2반"
              className="glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted/50"
            />
            <span className="mt-1 block text-xs text-sp-muted">담임이 아니면 비워두세요.</span>
          </label>
        </div>
      </div>,
      <div className="space-y-2">
        <button
          onClick={next}
          className="w-full py-3.5 rounded-2xl bg-sp-accent text-sp-accent-fg font-semibold text-base active:scale-[0.98] transition-transform"
        >
          다음
        </button>
        <div className="flex">
          <button onClick={back} className="flex-1 py-2.5 text-sp-muted text-sm">
            이전
          </button>
          <button onClick={next} className="flex-1 py-2.5 text-sp-muted text-sm">
            건너뛰기
          </button>
        </div>
      </div>,
    );
  }

  // ── 교시 시간 (4) ──
  if (step === STEP_PERIODS) {
    const presetCard = (key: PeriodChoice, title: string, sub: string) => (
      <button
        type="button"
        onClick={() => setPeriodChoice(key)}
        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
          periodChoice === key
            ? 'border-sp-accent/50 bg-sp-accent/10'
            : 'border-sp-border bg-sp-card'
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            periodChoice === key ? 'border-sp-accent' : 'border-sp-border'
          }`}
        >
          {periodChoice === key && <span className="h-2.5 w-2.5 rounded-full bg-sp-accent" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-sp-text">{title}</span>
          <span className="block text-xs text-sp-muted">{sub}</span>
        </span>
      </button>
    );

    return wrap(
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10">
            <span className="material-symbols-outlined text-4xl text-sp-accent">schedule</span>
          </div>
          <h1 className="text-xl font-bold text-sp-text">교시 시간</h1>
          <p className="text-sp-muted mt-1 text-sm">
            수업 시작·끝 시각. 기본값을 쓰거나 직접 설정하세요. 설정에서 언제든 바꿀 수 있어요.
          </p>
        </div>
        <div className="space-y-2">
          {presetCard('preset7', '기본 7교시', '08:50 시작 · 40분 수업 · 10분 쉬는 시간')}
          {presetCard('preset6', '기본 6교시', '09:00 시작 · 45분 수업 · 10분 쉬는 시간')}
          {presetCard('custom', '직접 설정', '학교 일정에 맞춰 교시별 시각을 직접 입력')}
        </div>
        {periodChoice === 'custom' && (
          <div className="mt-4">
            <PeriodTimesEditor
              initial={PRESET_7_PREVIEW}
              hideSaveButton
              onChange={(pt) => setCustomPeriods(pt)}
            />
          </div>
        )}
      </div>,
      <div className="space-y-2">
        <button
          onClick={next}
          disabled={periodChoice === 'custom' && (!customPeriods || customPeriods.length === 0)}
          className="w-full py-3.5 rounded-2xl bg-sp-accent text-sp-accent-fg font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          다음
        </button>
        <div className="flex">
          <button onClick={back} className="flex-1 py-2.5 text-sp-muted text-sm">
            이전
          </button>
          <button
            onClick={() => {
              setPeriodChoice('preset7');
              next();
            }}
            className="flex-1 py-2.5 text-sp-muted text-sm"
          >
            기본값 사용
          </button>
        </div>
      </div>,
    );
  }

  // ── 로그인 (5) ──
  return wrap(
    <div className="flex flex-col items-center justify-center min-h-full text-center pb-4">
      <img
        src="/floating-pin.png"
        alt=""
        aria-hidden
        className="mb-6 h-28 w-28 select-none sp-float"
      />
      <h1 className="text-2xl font-bold text-sp-text whitespace-pre-line leading-tight">
        {'Google 계정으로\n동기화할까요?'}
      </h1>
      <p className="text-sp-muted mt-3 text-sm whitespace-pre-line">
        {
          'PC에서 입력한 데이터를 모바일에서 보려면\nGoogle 계정으로 로그인하세요.\n나중에 설정에서도 연결할 수 있어요.'
        }
      </p>
      <div className="mt-5 rounded-xl bg-black/5 px-4 py-3 text-left dark:bg-white/10">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-sp-text">
          <span className="material-symbols-outlined text-icon-sm shrink-0 text-sp-highlight">
            lightbulb
          </span>
          <span>
            <span className="font-semibold">PC를 먼저 설정하세요.</span> 교무실 PC에서 데이터를
            입력하고 동기화를 켠 뒤 휴대폰에서 같은 Google 계정으로 로그인하면, PC 데이터를 그대로
            받아와요.
          </span>
        </p>
      </div>
    </div>,
    <div className="space-y-3">
      <button
        onClick={() => void finish(true)}
        className="w-full py-3.5 rounded-2xl bg-sp-accent text-sp-accent-fg font-semibold text-base active:scale-[0.98] transition-transform"
      >
        Google 계정으로 시작하기
      </button>
      <button onClick={() => void finish(false)} className="w-full py-3 text-sp-muted text-sm">
        나중에 로그인할게요
      </button>
    </div>,
  );
}
