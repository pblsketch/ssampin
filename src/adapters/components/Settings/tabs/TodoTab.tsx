import { useEffect, useState } from 'react';
import type { Settings } from '@domain/entities/Settings';
import type { TodoViewMode, TodoProLayout } from '@domain/entities/TodoSettings';
import { DEFAULT_TODO_SETTINGS } from '@domain/entities/TodoSettings';
import {
  readTodoAlarmEnabled,
  saveTodoAlarmEnabled,
} from '@adapters/repositories/todoAlarmDeviceState';
import {
  DEFAULT_ALARM_DAILY_CAP,
  DEFAULT_ALARM_DEFAULT_TIME,
  DEFAULT_ALARM_LEAD_MINUTES,
} from '@domain/rules/todoAlarmRules';
import { SettingsSection } from '../shared/SettingsSection';
import { TodoAlarmDiagnosticsPanel } from '../TodoAlarmDiagnosticsPanel';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

const VIEW_OPTIONS: { key: TodoViewMode; label: string; icon: string }[] = [
  { key: 'todo', label: '리스트', icon: 'list' },
  { key: 'kanban', label: '칸반', icon: 'view_kanban' },
  { key: 'list', label: '테이블', icon: 'table_rows' },
  { key: 'timeline', label: '타임라인', icon: 'timeline' },
];

const LAYOUT_OPTIONS: { key: TodoProLayout; label: string; icon: string; desc: string }[] = [
  { key: 'wide', label: '와이드', icon: 'width_wide', desc: '전체 폭 사용' },
  { key: 'dual', label: '듀얼 패널', icon: 'view_sidebar', desc: '좌우 분할 뷰' },
];

const LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: '정각에' },
  { minutes: 5, label: '5분 전' },
  { minutes: 10, label: '10분 전' },
  { minutes: 30, label: '30분 전' },
];

const CAP_OPTIONS = [3, 5, 8, 12, 20];

/** 스위치 하나. 이 탭에서만 쓰이므로 파일 안에 둔다. */
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        on ? 'bg-sp-accent' : 'bg-sp-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function TodoTab({ draft, patch }: Props) {
  const todoSettings = draft.todoSettings ?? DEFAULT_TODO_SETTINGS;
  const isProMode = todoSettings.mode === 'pro';

  const updateTodoSettings = (p: Partial<typeof todoSettings>) => {
    patch({ todoSettings: { ...todoSettings, ...p } });
  };

  // 알람 켬/끔은 **이 기기에만** 저장된다. 다른 알람 값과 달리 draft/patch 를 타지 않고
  // 곧바로 저장되는 이유는, 동기화되는 설정 안에 두면 "껐는데 다른 기기의 오래된 사본이
  // 되살리는" 일이 생기기 때문이다(오너 결정 1).
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmSaveFailed, setAlarmSaveFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void readTodoAlarmEnabled().then((v) => {
      if (alive) setAlarmEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleAlarm = () => {
    const next = !alarmEnabled;
    setAlarmEnabled(next);
    setAlarmSaveFailed(false);
    void saveTodoAlarmEnabled(next).then((ok) => {
      if (!ok) {
        setAlarmEnabled(!next); // 저장 못 했으면 스위치를 되돌린다
        setAlarmSaveFailed(true);
      }
    });
  };

  const exposureFull = todoSettings.alarmTextExposure === 'full';
  const leadMinutes = todoSettings.alarmLeadMinutes ?? DEFAULT_ALARM_LEAD_MINUTES;
  const dailyCap = todoSettings.alarmDailyCap ?? DEFAULT_ALARM_DAILY_CAP;
  const defaultTime = todoSettings.alarmDefaultTime ?? DEFAULT_ALARM_DEFAULT_TIME;

  return (
    <>
      <SettingsSection
        icon="checklist"
        iconColor="bg-green-500/10 text-green-500"
        title="할 일 모드"
        description="프로 모드를 켜면 칸반, 테이블, 타임라인 뷰를 사용할 수 있습니다."
        actions={
          <span className="text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 ring-1 ring-yellow-500/20">
            Beta
          </span>
        }
      >
        <div className="space-y-4">
          {/* 프로 모드 토글 */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <span className="text-sm font-medium text-sp-text">프로 모드 사용</span>
              <p className="text-xs text-sp-muted mt-0.5">
                다양한 뷰와 진행 상태 관리 기능을 활성화합니다
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isProMode}
              onClick={() => updateTodoSettings({ mode: isProMode ? 'default' : 'pro' })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isProMode ? 'bg-sp-accent' : 'bg-sp-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isProMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>

          <p className="text-xs text-sp-muted bg-sp-surface rounded-lg px-3 py-2">
            모드를 변경해도 기존 할 일 데이터는 그대로 유지됩니다.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        icon="notifications_active"
        iconColor="bg-orange-500/10 text-orange-500"
        title="할 일 알림"
        description="마감일과 다시 확인할 날에 맞춰 컴퓨터 알림 창을 띄웁니다."
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-sp-text">할 일 알림 사용</span>
              <p className="text-xs text-sp-muted mt-0.5">
                이 스위치는 <strong>이 컴퓨터에만</strong> 적용됩니다. 학교 PC에서 켜도 집 컴퓨터는
                조용합니다.
              </p>
            </div>
            <Toggle on={alarmEnabled} onClick={toggleAlarm} label="할 일 알림 사용" />
          </label>

          {alarmSaveFailed && (
            <p className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
              설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}

          {alarmEnabled && (
            <div className="space-y-4 pt-1">
              <div>
                <span className="text-sm font-medium text-sp-text">언제 알릴까요</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {LEAD_OPTIONS.map(({ minutes, label }) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => updateTodoSettings({ alarmLeadMinutes: minutes })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        leadMinutes === minutes
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  className="text-sm font-medium text-sp-text"
                  htmlFor="todo-alarm-default-time"
                >
                  시각을 안 적은 할 일은 몇 시에
                </label>
                <p className="text-xs text-sp-muted mt-0.5">
                  마감일만 있고 시각이 없는 할 일은 이 시각에 알립니다.
                </p>
                <input
                  id="todo-alarm-default-time"
                  type="time"
                  value={defaultTime}
                  onChange={(e) => updateTodoSettings({ alarmDefaultTime: e.target.value })}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-text border border-sp-border text-sm"
                />
              </div>

              <div>
                <span className="text-sm font-medium text-sp-text">하루에 최대 몇 건</span>
                <p className="text-xs text-sp-muted mt-0.5">
                  알림이 쏟아지면 결국 통째로 끄게 됩니다. 알림이 뜨는 날짜별로 셉니다.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CAP_OPTIONS.map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => updateTodoSettings({ alarmDailyCap: cap })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        dailyCap === cap
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
                      }`}
                    >
                      {cap}건
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <span className="text-sm font-medium text-sp-text">알림에 할 일 내용 표시</span>
                  <p className="text-xs text-sp-muted mt-0.5">
                    꺼 두면 &ldquo;확인할 일이 1건 있습니다&rdquo;라고만 뜹니다.
                  </p>
                </div>
                <Toggle
                  on={exposureFull}
                  onClick={() =>
                    updateTodoSettings({ alarmTextExposure: exposureFull ? 'countOnly' : 'full' })
                  }
                  label="알림에 할 일 내용 표시"
                />
              </label>

              {exposureFull && (
                <p className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 rounded-lg px-3 py-2">
                  알림 창에 할 일 내용이 그대로 보입니다. 교실·교무실 화면을 여럿이 본다면 꺼
                  두세요.
                </p>
              )}
            </div>
          )}

          <TodoAlarmDiagnosticsPanel />
        </div>
      </SettingsSection>

      <SettingsSection
        icon="calendar_today"
        iconColor="bg-indigo-500/10 text-indigo-500"
        title="요일 시작 요일"
        description="달력과 요일 표시의 시작 요일을 선택합니다."
      >
        <div className="flex gap-2">
          {[
            { key: 'monday' as const, label: '월요일 시작 (월~일)' },
            { key: 'sunday' as const, label: '일요일 시작 (일~토)' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => patch({ weekdayStart: key })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                (draft.weekdayStart ?? 'sunday') === key
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-card'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsSection>

      {isProMode && (
        <>
          <SettingsSection
            icon="view_carousel"
            iconColor="bg-blue-500/10 text-blue-500"
            title="기본 뷰"
            description="프로 모드 진입 시 기본으로 표시할 뷰를 선택합니다."
          >
            <div className="grid grid-cols-2 gap-2">
              {VIEW_OPTIONS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateTodoSettings({ defaultView: key })}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all text-left ${
                    todoSettings.defaultView === key
                      ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-icon-md">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            icon="dashboard_customize"
            iconColor="bg-purple-500/10 text-purple-500"
            title="레이아웃"
            description="프로 모드의 화면 레이아웃을 설정합니다."
          >
            <div className="space-y-2">
              {LAYOUT_OPTIONS.map(({ key, label, icon, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateTodoSettings({ proLayout: key })}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-all text-left ${
                    (todoSettings.proLayout ?? 'wide') === key
                      ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-icon-md">{icon}</span>
                  <div>
                    <span className="text-sm font-medium">{label}</span>
                    <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </SettingsSection>
        </>
      )}
    </>
  );
}
