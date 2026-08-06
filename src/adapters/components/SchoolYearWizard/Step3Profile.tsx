/**
 * Step3Profile — 학년도 마무리 마법사 ③ 새 학년도 프로필 (S2.3).
 *
 * 온보딩 2단계(학교 정보)·3단계(교시)·4단계(역할)의 입력 로직을 재사용한 재확인 화면.
 * 여기서의 편집은 전부 마법사 초안(WizardProfileDraft)에만 반영되고,
 * 실제 Settings 저장은 ④단계 실행이 성공한 뒤에만 일어난다(실행 전 파일 쓰기 0).
 * TeachingClass(수업반)는 여기서 만들지 않는다 — 새 학년도에 수업 관리에서 직접 만든다.
 */

import type { SchoolLevel } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import {
  PERIOD_DURATION,
  generatePeriodTimes,
  getDefaultPreset,
  parseMinutes,
} from '@domain/rules/periodRules';
import type { WizardProfileDraft, WizardRole } from './wizardProgress';

interface Props {
  readonly profile: WizardProfileDraft;
  readonly onChange: (next: WizardProfileDraft) => void;
}

const ROLE_OPTIONS: readonly { id: WizardRole; label: string; icon: string; desc: string }[] = [
  { id: 'homeroom', label: '담임교사', icon: 'school', desc: '학급 담임을 맡아요' },
  { id: 'subject', label: '교과교사', icon: 'menu_book', desc: '교과 수업을 담당해요' },
  { id: 'admin', label: '관리자/부장', icon: 'admin_panel_settings', desc: '관리 업무를 해요' },
];

const LEVEL_PRESETS: readonly { id: SchoolLevel; label: string }[] = [
  { id: 'elementary', label: '초등 (6교시)' },
  { id: 'middle', label: '중등 (7교시)' },
  { id: 'high', label: '고등 (7교시)' },
  { id: 'custom', label: '직접 설정' },
];

function toTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function Step3Profile({ profile, onChange }: Props) {
  const patch = (p: Partial<WizardProfileDraft>) => onChange({ ...profile, ...p });

  const toggleRole = (role: WizardRole) => {
    const next = profile.teacherRoles.includes(role)
      ? profile.teacherRoles.filter((r) => r !== role)
      : [...profile.teacherRoles, role];
    patch({ teacherRoles: next });
  };

  const setPresetByLevel = (level: SchoolLevel) => {
    if (level === 'custom') {
      patch({ schoolLevel: level, customPeriodDuration: profile.customPeriodDuration ?? 50 });
      return;
    }
    const times = generatePeriodTimes(getDefaultPreset(level));
    patch({ schoolLevel: level, maxPeriods: times.length, periodTimes: times });
  };

  const regenerateCustom = () => {
    const preset = {
      ...getDefaultPreset('custom'),
      totalPeriods: profile.maxPeriods,
      customPeriodDuration: profile.customPeriodDuration ?? 50,
    };
    const times = generatePeriodTimes(preset);
    patch({ periodTimes: times, maxPeriods: times.length });
  };

  // 온보딩과 동일 규칙: 시작 시각 변경 시 수업 길이만큼 종료 자동 계산 + 이후 교시 평행 이동.
  const updatePeriod = (index: number, field: 'start' | 'end', value: string) => {
    const arr = [...profile.periodTimes] as PeriodTime[];
    const existing = arr[index];
    if (!existing) return;
    if (field === 'start') {
      const duration =
        profile.schoolLevel === 'custom' && profile.customPeriodDuration
          ? profile.customPeriodDuration
          : PERIOD_DURATION[profile.schoolLevel];
      const delta = parseMinutes(value) - parseMinutes(existing.start);
      arr[index] = {
        period: existing.period,
        start: value,
        end: toTimeStr(parseMinutes(value) + duration),
      };
      for (let i = index + 1; i < arr.length; i++) {
        const p = arr[i];
        if (!p) continue;
        arr[i] = {
          period: p.period,
          start: toTimeStr(parseMinutes(p.start) + delta),
          end: toTimeStr(parseMinutes(p.end) + delta),
        };
      }
    } else {
      arr[index] = { period: existing.period, start: existing.start, end: value };
    }
    patch({ periodTimes: arr });
  };

  const isHomeroom = profile.teacherRoles.includes('homeroom');

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-sp-text">새 학년도의 나를 알려주세요</h3>
        <p className="mt-1 text-sm text-sp-muted">
          학교·역할·담임 반·교시를 재확인해요. 여기서 바꾼 내용은{' '}
          <strong className="text-sp-text">전환을 실행할 때에만</strong> 실제 설정에 반영돼요.
        </p>
      </div>

      {/* 학교명 */}
      <div className="space-y-2">
        <label
          htmlFor="wizard-school-name"
          className="text-xs font-semibold uppercase tracking-wider text-sp-muted"
        >
          학교명
        </label>
        <input
          id="wizard-school-name"
          type="text"
          value={profile.schoolName}
          onChange={(e) => patch({ schoolName: e.target.value })}
          placeholder="예: 서울미래중학교"
          className="w-full rounded-lg border border-sp-border bg-sp-bg px-4 py-2.5 text-sm text-sp-text transition-all placeholder:text-sp-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sp-accent"
        />
        <p className="text-xs text-sp-muted">
          전근을 갔다면 새 학교 이름으로 바꿔 주세요. NEIS 학교 연동 변경은 전환 후 설정 &gt; 학교
          정보에서 할 수 있어요.
        </p>
      </div>

      {/* 역할 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sp-muted">
          새 학년도 역할 (복수 선택)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((role) => {
            const selected = profile.teacherRoles.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleRole(role.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-all ${
                  selected
                    ? 'border-sp-accent bg-sp-surface text-sp-text ring-1 ring-sp-accent'
                    : 'border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                <span
                  aria-hidden
                  className={`material-symbols-outlined text-xl ${selected ? 'text-sp-accent' : ''}`}
                >
                  {role.icon}
                </span>
                <span className="text-xs font-bold">{role.label}</span>
                <span className="text-caption text-sp-muted">{role.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 담임 반 */}
      {isHomeroom && (
        <div className="space-y-2">
          <label
            htmlFor="wizard-class-name"
            className="text-xs font-semibold uppercase tracking-wider text-sp-muted"
          >
            담임 반
          </label>
          <input
            id="wizard-class-name"
            type="text"
            value={profile.className}
            onChange={(e) => patch({ className: e.target.value })}
            placeholder="예: 2학년 3반"
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-4 py-2.5 text-sm text-sp-text transition-all placeholder:text-sp-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sp-accent"
          />
          <p className="text-xs text-sp-muted">
            새 학년도 담임 반 이름이에요. 새 반 명렬은 전환 후 담임 학급에서 등록해요.
          </p>
        </div>
      )}

      {/* 교시 재확인 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sp-muted">교시 시간</p>
        <div className="grid grid-cols-4 gap-2">
          {LEVEL_PRESETS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setPresetByLevel(l.id)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                profile.schoolLevel === l.id
                  ? 'border-sp-accent bg-sp-surface text-sp-text ring-1 ring-sp-accent'
                  : 'border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {profile.schoolLevel === 'custom' && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="wizard-period-duration" className="block text-xs text-sp-muted">
                수업 시간 (분)
              </label>
              <input
                id="wizard-period-duration"
                type="number"
                min={20}
                max={120}
                value={profile.customPeriodDuration ?? 50}
                onChange={(e) =>
                  patch({
                    customPeriodDuration: Math.max(20, Math.min(120, Number(e.target.value))),
                  })
                }
                className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="wizard-max-periods" className="block text-xs text-sp-muted">
                총 교시 수
              </label>
              <input
                id="wizard-max-periods"
                type="number"
                min={1}
                max={12}
                value={profile.maxPeriods}
                onChange={(e) =>
                  patch({ maxPeriods: Math.max(1, Math.min(12, Number(e.target.value))) })
                }
                className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
              />
            </div>
            <button
              type="button"
              onClick={regenerateCustom}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-sp-accent-fg transition-all hover:brightness-110"
            >
              생성
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-sp-border">
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-center text-sm">
              <thead className="sticky top-0 bg-sp-surface text-xs uppercase text-sp-muted">
                <tr>
                  <th className="py-2 font-medium">교시</th>
                  <th className="py-2 font-medium">시작</th>
                  <th className="py-2 font-medium">종료</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sp-border bg-sp-bg">
                {profile.periodTimes.map((pt, i) => (
                  <tr key={pt.period}>
                    <td className="py-1.5 text-sp-muted">{i + 1}교시</td>
                    <td className="py-1.5">
                      <input
                        type="time"
                        value={pt.start}
                        onChange={(e) => updatePeriod(i, 'start', e.target.value)}
                        aria-label={`${i + 1}교시 시작 시각`}
                        className="rounded border border-sp-border bg-sp-bg px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="time"
                        value={pt.end}
                        onChange={(e) => updatePeriod(i, 'end', e.target.value)}
                        aria-label={`${i + 1}교시 종료 시각`}
                        className="rounded border border-sp-border bg-sp-bg px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 구조 승계 opt-in (S4.3) — 기본 OFF. 실행 성공 후에만 동작한다. */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sp-muted">
          지난 학기에서 가져오기
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-sp-border bg-sp-surface px-4 py-3">
          <input
            type="checkbox"
            checked={profile.carryClassStructure === true}
            onChange={(e) => patch({ carryClassStructure: e.target.checked })}
            className="mt-0.5 h-4 w-4"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-sp-text">
              지난 학기 수업반 틀 가져오기
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-sp-muted">
              전환이 끝나면 보관함의 수업반에서{' '}
              <strong className="text-sp-text">반 이름·과목·그룹 구조만</strong> 새 수업반으로
              만들어요. 학생 명렬·좌석·출결·기록은 가져오지 않아요 — 새 명단은 수업 관리에서 새로
              등록해요.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
