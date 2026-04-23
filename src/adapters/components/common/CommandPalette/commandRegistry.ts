import { NAV_ITEMS } from '@adapters/components/Layout/Sidebar';
import type { PageId } from '@adapters/components/Layout/Sidebar';

export interface Command {
  id: string;
  label: string;
  group: '페이지' | '설정';
  icon: string;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
}

export interface CommandGroup {
  label: '페이지' | '설정';
  commands: Command[];
}

interface BuildDefaultCommandsParams {
  onNavigate: (page: PageId) => void;
}

/** 페이지 이동 키워드 보조 맵 */
const PAGE_KEYWORDS: Partial<Record<PageId, string[]>> = {
  dashboard: ['홈', 'home', '대시보드', 'dashboard', '메인'],
  timetable: ['시간표', 'timetable', '교시', '수업시간'],
  schedule: ['일정', 'schedule', '캘린더', 'calendar', '날짜'],
  homeroom: ['담임', '담임업무', 'homeroom', '학생', '출결', '생활'],
  memo: ['메모', 'memo', '포스트잇', '노트', 'sticky'],
  note: ['쌤핀노트', 'note', '노트', '블록', '에디터'],
  todo: ['할일', 'todo', '체크리스트', '작업', '완료'],
  'class-management': ['수업관리', 'class', '수업', '학습', '교과'],
  bookmarks: ['즐겨찾기', 'bookmark', '북마크', '링크'],
  tools: ['쌤도구', 'tool', '도구', '타이머', '룰렛'],
  meal: ['급식', 'meal', '식단', '점심', '메뉴'],
  export: ['내보내기', 'export', '출력', '인쇄', 'pdf', 'excel'],
};

export function buildDefaultCommands({ onNavigate }: BuildDefaultCommandsParams): Command[] {
  const pageCommands: Command[] = NAV_ITEMS.map((item) => ({
    id: `navigate-${item.id}`,
    label: `${item.label}으로 이동`,
    group: '페이지' as const,
    icon: item.icon,
    keywords: PAGE_KEYWORDS[item.id] ?? [],
    run: () => onNavigate(item.id),
  }));

  const settingsCommands: Command[] = [
    {
      id: 'navigate-settings',
      label: '설정 열기',
      group: '설정' as const,
      icon: 'settings',
      keywords: ['설정', 'settings', '환경설정', '옵션', 'config'],
      run: () => onNavigate('settings'),
    },
  ];

  return [...pageCommands, ...settingsCommands];
}

/** AND 토큰 검색: 쿼리 공백 구분 모든 토큰이 대상 문자열에 포함되면 매치 */
export function matchesQuery(command: Command, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [command.label, ...(command.keywords ?? [])].join(' ').toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/** 그룹별로 커맨드를 정렬하고 필터링 결과를 그룹 단위로 반환 */
export function filterAndGroupCommands(
  commands: Command[],
  query: string,
): CommandGroup[] {
  const filtered = commands.filter((cmd) => matchesQuery(cmd, query));

  const groupOrder: Array<'페이지' | '설정'> = ['페이지', '설정'];
  const groups: CommandGroup[] = groupOrder
    .map((label) => ({
      label,
      commands: filtered.filter((cmd) => cmd.group === label),
    }))
    .filter((g) => g.commands.length > 0);

  return groups;
}
