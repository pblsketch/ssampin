import type { SettingsTabId } from './SettingsPage';

interface TabDef {
  id: SettingsTabId;
  icon: string;
  label: string;
  color: string;
}

interface TabGroup {
  label: string;
  tabs: TabDef[];
}

/**
 * 설정 탭 5개 그룹 — 사용자(교사) 멘탈모델 기준 분류.
 * 탭 id·라벨은 딥링크('settings#widget')와 사용자 가이드(/docs)가 참조하므로 바꾸지 않는다.
 * ① 기본 정보: 처음 설치 후 가장 먼저 채우는 학교·수업 정보
 * ② 화면 구성: 앱이 "어떻게 보일지"
 * ③ 기능별 설정: 각 기능 화면의 세부 동작
 * ④ 연동·백업: 외부 서비스 연결과 데이터 보관
 * ⑤ 시스템: 잠금·앱 동작·정보
 */
const TAB_GROUPS: TabGroup[] = [
  {
    label: '기본 정보',
    tabs: [
      { id: 'school', icon: 'school', label: '학교 정보', color: 'bg-blue-500/10 text-blue-400' },
      {
        id: 'period',
        icon: 'schedule',
        label: '교시 시간',
        color: 'bg-emerald-500/10 text-emerald-400',
      },
    ],
  },
  {
    label: '화면 구성',
    tabs: [
      {
        id: 'display',
        icon: 'palette',
        label: '디스플레이',
        color: 'bg-yellow-500/10 text-yellow-500',
      },
      { id: 'widget', icon: 'widgets', label: '위젯', color: 'bg-indigo-500/10 text-indigo-400' },
      { id: 'sidebar', icon: 'menu', label: '사이드바', color: 'bg-sp-surface text-sp-muted' },
    ],
  },
  {
    label: '기능별 설정',
    tabs: [
      { id: 'calendar', icon: 'event', label: '일정', color: 'bg-pink-500/10 text-pink-400' },
      { id: 'todo', icon: 'checklist', label: '할 일', color: 'bg-green-500/10 text-green-400' },
      { id: 'seat', icon: 'chair', label: '좌석', color: 'bg-orange-500/10 text-orange-400' },
      { id: 'weather', icon: 'cloud', label: '날씨', color: 'bg-sky-500/10 text-sky-500' },
      {
        id: 'record-reminder',
        icon: 'notifications_active',
        label: '기록 알림',
        color: 'bg-amber-500/10 text-amber-400',
      },
      { id: 'tools', icon: 'build', label: '도구', color: 'bg-purple-500/10 text-purple-400' },
      {
        id: 'shortcuts',
        icon: 'keyboard',
        label: '단축키',
        color: 'bg-teal-500/10 text-teal-400',
      },
    ],
  },
  {
    label: '연동·백업',
    tabs: [
      {
        id: 'google',
        icon: 'hub',
        label: 'Google 연동',
        color: 'bg-purple-500/10 text-purple-400',
      },
      {
        id: 'ai-bridge',
        icon: 'linked_services',
        label: 'AI 연결',
        color: 'bg-cyan-500/10 text-cyan-400',
      },
      {
        id: 'backup',
        icon: 'cloud_download',
        label: '백업/복원',
        color: 'bg-emerald-500/10 text-emerald-400',
      },
      // S2.3 학년도 마무리(보관함) — 기존 18개 탭 **id는 불변**(딥링크·/docs·챗봇 KB가 참조).
      // P3 보관함 뷰어도 이 탭에 얹는다.
      // 라벨은 '학년도 마무리' → '학년도/학기'(ADR-046): 현재 학기·개학일 설정이 이 탭에 들어오면서
      // 탭이 마감 전용이 아니게 됐다. 학기만 바로잡으러 온 사용자가 '마무리'를 보고 물러서면 안 된다.
      {
        id: 'archive',
        icon: 'inventory_2',
        label: '학년도/학기',
        color: 'bg-amber-500/10 text-amber-400',
      },
    ],
  },
  {
    label: '시스템',
    tabs: [
      { id: 'security', icon: 'lock', label: '보안', color: 'bg-red-500/10 text-red-400' },
      {
        id: 'system',
        icon: 'settings_applications',
        label: '시스템',
        // 아이콘 색만 테마 토큰을 쓴다. 형제 항목들은 유채색(amber/red/violet)이라
        // 라이트 테마 보정이 자동으로 어둡게 잡아주지만, 중성색(gray)은 그 보정 대상에서
        // 빠져 있어 밝은 배경에서 2.33:1 로 혼자 흐려졌다. 토큰은 테마별로 따라간다.
        color: 'bg-gray-500/10 text-sp-muted',
      },
      { id: 'about', icon: 'info', label: '앱 정보', color: 'bg-violet-500/10 text-violet-400' },
    ],
  },
];

/** 그룹 순서를 그대로 편 평면 목록 — 모바일 탭바 등 그룹 없이 순회하는 곳에서 사용 */
const TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs);

export { TAB_GROUPS, TABS };

interface Props {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: Props) {
  return (
    <nav
      aria-label="설정 메뉴"
      className="w-56 shrink-0 border-r border-sp-border bg-sp-card/50 overflow-y-auto py-4 px-3 h-full"
    >
      <div className="space-y-5">
        {TAB_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-caption font-semibold text-sp-muted uppercase tracking-wider select-none">
              {group.label}
            </p>
            <div role="tablist" aria-label={group.label} className="space-y-1">
              {group.tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onTabChange(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      isActive
                        ? 'bg-sp-accent/10 text-sp-accent ring-1 ring-sp-accent/20'
                        : 'text-sp-muted hover:bg-sp-text/5 hover:text-sp-text'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-md ${isActive ? 'bg-sp-accent/15 text-sp-accent' : tab.color}`}
                    >
                      <span className="material-symbols-outlined text-icon-md">{tab.icon}</span>
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-sp-accent' : ''}`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
