import { useState } from 'react';
import type { Settings } from '@domain/entities/Settings';
import type {
  NameExposure,
  ReminderPreset,
  ReminderSettings,
  ReminderTarget,
} from '@domain/entities/RecordReminder';
import { DEFAULT_REMINDER_SETTINGS, REMINDER_PRESETS } from '@domain/entities/RecordReminder';
import { SettingsSection } from './shared/SettingsSection';
import { Toggle } from './shared/Toggle';
import { useRecordReminderStore, isReminderPaused } from '@adapters/stores/useRecordReminderStore';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const PRESET_OPTIONS: {
  key: Exclude<ReminderPreset, 'custom'>;
  label: string;
  desc: string;
}[] = [
  { key: 'light', label: '가볍게', desc: '주 1회 · 21일 공백' },
  { key: 'normal', label: '보통', desc: '주 3회 · 14일 공백' },
  { key: 'thorough', label: '꼼꼼히', desc: '평일 매일 · 10일 공백 · 2명씩' },
];

const NAME_EXPOSURE_OPTIONS: { key: NameExposure; label: string }[] = [
  { key: 'full', label: '실명' },
  { key: 'initial', label: '이니셜' },
  { key: 'none', label: '표시 안 함' },
];

const TARGET_OPTIONS: { key: ReminderTarget; label: string; desc: string; disabled?: boolean }[] = [
  { key: 'homeroom', label: '담임반', desc: '담임을 맡은 학급 학생을 알림 대상에 포함합니다' },
  {
    key: 'subject',
    label: '수업반',
    desc: '수업 직후, 그 반에서 관찰 기록이 뜸한 학생을 알려드립니다',
  },
];

/**
 * 학생 관찰 기록 알림 설정 화면.
 *
 * '오래 기록이 비어있는 학생'을 감지해 알려주는 기능의 설정 UI.
 * 감지·발화 로직 자체는 이 화면 소관이 아니며(domain/rules/recordReminderRules.ts),
 * 여기서는 `Settings.recordReminder`(ReminderSettings) 값만 읽고 patch 한다.
 * 계획서: docs/01-plan/features/observation-record-reminder.plan.md
 */
export function RecordReminderSection({ draft, patch }: Props) {
  const rr = draft.recordReminder ?? DEFAULT_REMINDER_SETTINGS;

  // 전체 일시정지는 설정(draft)이 아니라 기기 로컬 런타임 스토어가 관리한다.
  const pausedUntil = useRecordReminderStore((s) => s.pausedUntil);
  const pauseForToday = useRecordReminderStore((s) => s.pauseForToday);
  const pauseForWeek = useRecordReminderStore((s) => s.pauseForWeek);
  const clearPause = useRecordReminderStore((s) => s.clearPause);
  const paused = isReminderPaused(pausedUntil, Date.now());

  const patchRR = (p: Partial<ReminderSettings>) => {
    patch({ recordReminder: { ...rr, ...p } });
  };

  // 프리셋이 정의하는 필드(weekdays/perNudge/dailyFireCap/staleDays)를 직접 바꾸면
  // 더 이상 프리셋과 일치하지 않으므로 'custom'으로 전환한다.
  const patchRRCustom = (
    p: Partial<Pick<ReminderSettings, 'weekdays' | 'perNudge' | 'dailyFireCap' | 'staleDays'>>,
  ) => {
    patchRR({ ...p, preset: 'custom' });
  };

  const applyPreset = (preset: Exclude<ReminderPreset, 'custom'>) => {
    patchRR({ ...REMINDER_PRESETS[preset], preset });
  };

  const toggleWeekday = (day: number) => {
    const next = rr.weekdays.includes(day)
      ? rr.weekdays.filter((d) => d !== day)
      : [...rr.weekdays, day].sort((a, b) => a - b);
    patchRRCustom({ weekdays: next });
  };

  const toggleTarget = (target: ReminderTarget) => {
    const next = rr.targets.includes(target)
      ? rr.targets.filter((t) => t !== target)
      : [...rr.targets, target];
    patchRR({ targets: next });
  };

  const dndEnabled = rr.doNotDisturbStart !== null && rr.doNotDisturbEnd !== null;
  const toggleDnd = (v: boolean) => {
    if (v) {
      patchRR({
        doNotDisturbStart: rr.doNotDisturbStart ?? '22:00',
        doNotDisturbEnd: rr.doNotDisturbEnd ?? '07:00',
      });
    } else {
      patchRR({ doNotDisturbStart: null, doNotDisturbEnd: null });
    }
  };

  return (
    <div>
      {/* 마스터 on/off */}
      <SettingsSection
        icon="notifications_active"
        iconColor="bg-amber-500/10 text-amber-400"
        title="학생 관찰 기록 알림"
        description="공백이 길어진 학생을 감지해 기록을 채우도록 알려드립니다."
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">알림 사용</span>
            <span className="text-xs text-sp-muted">
              꺼져 있으면 아래 설정과 관계없이 알림이 울리지 않습니다.
            </span>
          </div>
          <Toggle checked={rr.enabled} onChange={(v) => patchRR({ enabled: v })} />
        </div>
      </SettingsSection>

      {/* 나머지 설정 — 마스터 스위치가 꺼져 있으면 흐리게 비활성 표시 */}
      <div
        className={rr.enabled ? '' : 'opacity-60 pointer-events-none'}
        aria-disabled={!rr.enabled}
      >
        {/* 강도 프리셋 + 직접설정 */}
        <SettingsSection
          icon="tune"
          iconColor="bg-indigo-500/10 text-indigo-400"
          title="알림 강도"
          actions={
            rr.preset === 'custom' ? (
              <span className="text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sp-accent/15 text-sp-accent ring-1 ring-sp-accent/20">
                직접 설정
              </span>
            ) : undefined
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {PRESET_OPTIONS.map(({ key, label, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                aria-pressed={rr.preset === key}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-lg border transition-all text-center ${
                  rr.preset === key
                    ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                    : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                }`}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs opacity-70">{desc}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-sp-border/40 mt-4 pt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-sp-text mb-2">알림 요일</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active = rr.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      aria-pressed={active}
                      className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                        active
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-sp-muted mt-2">
                선택한 요일이 없으면 매일 알림이 울립니다.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">발화 시각</span>
                <span className="text-xs text-sp-muted">이 시각에 기록 알림을 확인합니다</span>
              </div>
              <input
                type="time"
                value={rr.time}
                onChange={(e) => patchRR({ time: e.target.value })}
                className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent [color-scheme:dark]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">공백 기준 일수</span>
                <span className="text-xs text-sp-muted">
                  이 일수 이상 기록이 없으면 알림 대상에 포함합니다
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={rr.staleDays}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(60, Number(e.target.value) || 1));
                    patchRRCustom({ staleDays: val });
                  }}
                  className="w-16 bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                />
                <span className="text-xs text-sp-muted">일</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">한 번에 물어볼 학생 수</span>
                <span className="text-xs text-sp-muted">알림 1건에 담을 학생 수</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patchRRCustom({ perNudge: n })}
                    aria-pressed={rr.perNudge === n}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      rr.perNudge === n
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">하루 알림 상한</span>
                <span className="text-xs text-sp-muted">하루에 울릴 수 있는 최대 횟수</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rr.dailyFireCap}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                    patchRRCustom({ dailyFireCap: val });
                  }}
                  className="w-16 bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                />
                <span className="text-xs text-sp-muted">회</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sp-text">방해금지 시간</span>
                  <span className="text-xs text-sp-muted">
                    지정한 시간에는 알림이 울리지 않습니다
                  </span>
                </div>
                <Toggle checked={dndEnabled} onChange={toggleDnd} />
              </div>
              {dndEnabled && (
                <div className="flex items-center gap-2 justify-end mt-2">
                  <input
                    type="time"
                    value={rr.doNotDisturbStart ?? ''}
                    onChange={(e) => patchRR({ doNotDisturbStart: e.target.value })}
                    className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent [color-scheme:dark]"
                  />
                  <span className="text-sp-muted text-sm">~</span>
                  <input
                    type="time"
                    value={rr.doNotDisturbEnd ?? ''}
                    onChange={(e) => patchRR({ doNotDisturbEnd: e.target.value })}
                    className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent [color-scheme:dark]"
                  />
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        {/* 알림 대상 */}
        <SettingsSection icon="groups" iconColor="bg-blue-500/10 text-blue-400" title="알림 대상">
          <div className="space-y-2">
            {TARGET_OPTIONS.map(({ key, label, desc, disabled }) => {
              const checked = !disabled && rr.targets.includes(key);
              return (
                <label
                  key={key}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg bg-sp-surface/60 transition-colors ${
                    disabled
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-sp-surface'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-sp-text">{label}</span>
                    <span className="text-xs text-sp-muted">{desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => !disabled && toggleTarget(key)}
                    className="w-4 h-4 rounded border-sp-border accent-sp-accent disabled:opacity-50"
                  />
                </label>
              );
            })}
          </div>
        </SettingsSection>

        {/* 전달 방식 */}
        <SettingsSection
          icon="campaign"
          iconColor="bg-green-500/10 text-green-400"
          title="전달 방식"
        >
          <div className="space-y-4 divide-y divide-sp-border/30">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">은은형 알림</span>
                <span className="text-xs text-sp-muted">
                  위젯 배지·아이콘 점으로만 조용히 표시합니다
                </span>
              </div>
              <Toggle checked={rr.subtleEnabled} onChange={(v) => patchRR({ subtleEnabled: v })} />
            </div>
            <div className="flex items-center justify-between pt-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sp-text">능동형 알림 (OS 토스트)</span>
                <span className="text-xs text-sp-muted">
                  운영체제 알림창으로 적극적으로 알립니다
                </span>
              </div>
              <Toggle
                checked={rr.osToastEnabled}
                onChange={(v) => patchRR({ osToastEnabled: v })}
              />
            </div>
          </div>
        </SettingsSection>

        {/* 실명 노출 */}
        <SettingsSection
          icon="badge"
          iconColor="bg-rose-500/10 text-rose-400"
          title="학생 이름 표시"
        >
          <div className="grid grid-cols-3 gap-2">
            {NAME_EXPOSURE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => patchRR({ nameExposure: key })}
                aria-pressed={rr.nameExposure === key}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  rr.nameExposure === key
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2.5 ring-1 ring-rose-500/20">
            <span className="material-symbols-outlined text-rose-400 text-icon-md shrink-0">
              warning
            </span>
            <p className="text-xs text-rose-400/90 leading-relaxed">
              알림에 학생 이름이 그대로 표시됩니다. 수업 중 화면 미러링·프로젝터 상황이라면
              &apos;이니셜&apos; 또는 &apos;표시 안 함&apos;을 권장해요.
            </p>
          </div>
        </SettingsSection>

        {/* 전체 일시정지 */}
        <SettingsSection
          icon="pause_circle"
          iconColor="bg-sp-surface text-sp-muted"
          title="전체 일시정지"
        >
          <p className="text-xs text-sp-muted mb-3">
            일정 기간 알림을 멈춥니다. 기간이 지나면 자동으로 다시 시작됩니다.
          </p>
          {paused ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
              <span className="text-sm font-medium text-amber-400">알림을 일시정지했어요</span>
              <button
                type="button"
                onClick={clearPause}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-sm font-medium hover:brightness-110 transition-all"
              >
                지금 재개
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pauseForToday}
                className="flex-1 px-4 py-2.5 rounded-lg border border-sp-border text-sp-text text-sm font-medium hover:bg-sp-surface transition-colors"
              >
                오늘 하루
              </button>
              <button
                type="button"
                onClick={pauseForWeek}
                className="flex-1 px-4 py-2.5 rounded-lg border border-sp-border text-sp-text text-sm font-medium hover:bg-sp-surface transition-colors"
              >
                이번 주
              </button>
            </div>
          )}
        </SettingsSection>

        {/* 출결 사유 반복 경고 (M2) — 같은 달 동일 키워드 재입력 시 비차단 안내 */}
        <SettingsSection
          icon="notification_important"
          iconColor="bg-amber-500/10 text-amber-500"
          title="출결 사유 반복 경고"
          description="등록한 단어가 출결 사유·비고에 들어가면, 같은 달에 같은 단어 기록이 이미 있을 때 저장 시 알려드려요. 저장을 막지는 않아요."
        >
          <AttendanceKeywordEditor
            keywords={draft.attendanceReasonKeywords ?? []}
            onChange={(next) => patch({ attendanceReasonKeywords: next })}
          />
        </SettingsSection>

        {/* 제외/관심 학생 (추후 지원) */}
        <SettingsSection
          icon="person_search"
          iconColor="bg-sp-surface text-sp-muted"
          title="제외/관심 학생"
        >
          <div className="flex items-center justify-between p-3 rounded-lg bg-sp-surface/60">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sp-text">학생별 설정</span>
              <span className="text-xs text-sp-muted">
                특정 학생을 알림에서 빼거나, 더 자주 챙길 관심 학생으로 지정할 수 있어요.
              </span>
            </div>
            <button
              type="button"
              disabled
              className="shrink-0 px-3 py-1.5 rounded-lg border border-sp-border text-sp-muted text-xs font-medium opacity-50 cursor-not-allowed"
            >
              추후 지원
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

/** 출결 사유 반복 경고 키워드 편집기 (M2) — 기본 키워드 없음, 사용자 등록만. */
function AttendanceKeywordEditor({
  keywords,
  onChange,
}: {
  keywords: readonly string[];
  onChange: (next: readonly string[]) => void;
}) {
  const [input, setInput] = useState('');

  const addKeyword = () => {
    const kw = input.trim();
    if (!kw) return;
    if (keywords.includes(kw)) {
      setInput('');
      return;
    }
    onChange([...keywords, kw]);
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder="예: 생리통, 병원"
          className="flex-1 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
        />
        <button
          type="button"
          onClick={addKeyword}
          disabled={input.trim() === ''}
          className="shrink-0 px-3 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          추가
        </button>
      </div>
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sp-surface border border-sp-border text-xs text-sp-text"
            >
              {kw}
              <button
                type="button"
                onClick={() => onChange(keywords.filter((k) => k !== kw))}
                aria-label={`${kw} 키워드 삭제`}
                className="text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-sm leading-none">close</span>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-sp-muted">
          등록된 단어가 없어요. 단어는 부분 일치로 찾으므로(예: '원' → '병원'·'학원' 모두 해당)
          구체적으로 등록할수록 정확해요.
        </p>
      )}
    </div>
  );
}
