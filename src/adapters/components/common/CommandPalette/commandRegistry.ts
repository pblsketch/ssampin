import { NAV_ITEMS } from '@adapters/components/Layout/Sidebar';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useSettingsStore, DEFAULT_SHORTCUTS } from '@adapters/stores/useSettingsStore';
import { useMultiDateAttendanceIntentStore } from '@adapters/stores/useMultiDateAttendanceIntentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { comboToDisplay, isMacOS } from '@adapters/hooks/shortcut/keyNormalize';
import { toChosungString, isChosungQuery } from '@domain/services/hangulSearch';
import { requestHomeroomTab } from '@adapters/components/Homeroom/homeroomTabIntent';

export type CommandGroupLabel =
  | '최근'
  | '빠른 추가'
  | '담임 업무'
  | '학교 정보'
  | '페이지'
  | '설정';

/** 학교 정보(주소·우편번호·전화·팩스) 클립보드 복사 + 복사값 토스트 안내(확인 겸용) */
function copySchoolInfo(text: string, label: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => useToastStore.getState().show(`${label} 복사: ${text}`, 'success'))
    .catch(() => useToastStore.getState().show('복사하지 못했어요', 'error'));
}

export interface Command {
  id: string;
  label: string;
  group: CommandGroupLabel;
  icon: string;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
}

export interface CommandGroup {
  label: CommandGroupLabel;
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

  const mac = isMacOS();
  const shortcuts = useSettingsStore.getState().settings.shortcuts ?? DEFAULT_SHORTCUTS;
  const comboFor = (id: string): string | undefined => {
    const b = shortcuts.bindings[id];
    if (!b || !b.enabled) return undefined;
    return comboToDisplay(b.combo, mac);
  };

  const quickAddCommands: Command[] = [
    {
      id: 'quickAdd.todo',
      label: '할일 빠른 추가',
      group: '빠른 추가' as const,
      icon: 'check_circle',
      keywords: ['할일', 'todo', '추가', '빠른'],
      shortcut: comboFor('quickAdd.todo'),
      run: () => useQuickAddStore.getState().open('todo'),
    },
    {
      id: 'quickAdd.event',
      label: '일정 빠른 추가',
      group: '빠른 추가' as const,
      icon: 'event',
      keywords: ['일정', 'event', 'schedule', '추가', '빠른'],
      shortcut: comboFor('quickAdd.event'),
      run: () => useQuickAddStore.getState().open('event'),
    },
    {
      id: 'quickAdd.memo',
      label: '메모 빠른 추가',
      group: '빠른 추가' as const,
      icon: 'sticky_note_2',
      keywords: ['메모', 'memo', '추가', '빠른'],
      shortcut: comboFor('quickAdd.memo'),
      run: () => useQuickAddStore.getState().open('memo'),
    },
    {
      id: 'quickAdd.note',
      label: '노트 새 페이지',
      group: '빠른 추가' as const,
      icon: 'description',
      keywords: ['노트', 'note', '페이지', '추가', '빠른'],
      shortcut: comboFor('quickAdd.note'),
      run: () => useQuickAddStore.getState().open('note'),
    },
    {
      id: 'quickAdd.bookmark',
      label: '즐겨찾기 빠른 추가',
      group: '빠른 추가' as const,
      icon: 'bookmark',
      keywords: ['즐겨찾기', '북마크', 'bookmark', '링크', 'url', '추가', '빠른'],
      shortcut: comboFor('quickAdd.bookmark'),
      run: () => useQuickAddStore.getState().open('bookmark'),
    },
    {
      id: 'multiDateAttendance.open',
      label: '여러 날 출결 일괄 등록',
      group: '빠른 추가' as const,
      icon: 'date_range',
      keywords: [
        '여러',
        '날',
        '날짜',
        '출결',
        '결석',
        '지각',
        '조퇴',
        '결과',
        '일괄',
        '다중',
        'multi',
        'attendance',
        'absence',
        'date',
        '교외체험학습',
        '코로나',
        '격리',
        '인플루엔자',
      ],
      run: () => {
        useMultiDateAttendanceIntentStore.getState().setIntent('multi');
        onNavigate('homeroom');
      },
    },
  ];

  // 담임 업무 하위 탭 바로가기 — 페이지 이동 후 탭 전환 요청. 자주 쓰는 3개만 노출.
  const homeroomCommands: Command[] = [
    {
      id: 'homeroom.roster',
      label: '명렬(학생 명단) 관리 열기',
      group: '담임 업무' as const,
      icon: 'groups',
      keywords: ['명렬', '명단', '학생', '관리', 'roster', '반', '추가', '결번'],
      run: () => {
        onNavigate('homeroom');
        requestHomeroomTab('roster');
      },
    },
    {
      id: 'homeroom.records',
      label: '학생 기록 열기',
      group: '담임 업무' as const,
      icon: 'edit_note',
      keywords: ['기록', '학생기록', 'records', '상담', '특기사항', '출결', '메모', '생활'],
      run: () => {
        onNavigate('homeroom');
        requestHomeroomTab('records');
      },
    },
    {
      id: 'homeroom.seating',
      label: '자리 배치 열기',
      group: '담임 업무' as const,
      icon: 'event_seat',
      keywords: ['자리', '자리배치', '좌석', 'seating', '배치', '앉기', '셔플', '짝'],
      run: () => {
        onNavigate('homeroom');
        requestHomeroomTab('seating');
      },
    },
  ];

  // 학교 정보 빠른 복사 — 등록된 학교가 있을 때만 노출. 복사값을 토스트로 보여줘 확인도 겸한다.
  const neis = useSettingsStore.getState().settings.neis;
  const schoolInfoCommands: Command[] = [];
  if (neis.address) {
    schoolInfoCommands.push({
      id: 'schoolInfo.copyAddress',
      label: '학교 주소 복사',
      group: '학교 정보' as const,
      icon: 'location_on',
      keywords: ['학교', '주소', '우편번호', '도로명', 'address', 'zip', 'copy', '복사', '공문'],
      run: () => {
        const n = useSettingsStore.getState().settings.neis;
        copySchoolInfo(
          `${n.postalCode ? `${n.postalCode} ` : ''}${n.address ?? ''}`.trim(),
          '학교 주소',
        );
      },
    });
  }
  if (neis.tel) {
    schoolInfoCommands.push({
      id: 'schoolInfo.copyTel',
      label: '학교 전화번호 복사',
      group: '학교 정보' as const,
      icon: 'call',
      keywords: ['학교', '전화', '전화번호', '연락처', 'tel', 'phone', '복사'],
      run: () => copySchoolInfo(useSettingsStore.getState().settings.neis.tel ?? '', '전화번호'),
    });
  }
  if (neis.fax) {
    schoolInfoCommands.push({
      id: 'schoolInfo.copyFax',
      label: '학교 팩스번호 복사',
      group: '학교 정보' as const,
      icon: 'print',
      keywords: ['학교', '팩스', 'fax', '복사'],
      run: () => copySchoolInfo(useSettingsStore.getState().settings.neis.fax ?? '', '팩스번호'),
    });
  }

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

  return [
    ...pageCommands,
    ...quickAddCommands,
    ...homeroomCommands,
    ...schoolInfoCommands,
    ...settingsCommands,
  ];
}

/**
 * AND 토큰 검색: 쿼리 공백 구분 모든 토큰이 대상 문자열에 포함되면 매치.
 * 각 토큰은 (1) 부분 문자열 일치, 또는 (2) 토큰이 전부 초성일 때 초성 시퀀스 일치로 통과한다.
 * 예: "ㅅㄱㅍ" → "시간표으로 이동" 매치.
 */
export function matchesQuery(command: Command, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [command.label, ...(command.keywords ?? [])].join(' ').toLowerCase();
  const haystackChosung = toChosungString(haystack);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(
    (token) =>
      haystack.includes(token) || (isChosungQuery(token) && haystackChosung.includes(token)),
  );
}

/**
 * 그룹별로 커맨드를 정렬하고 필터링 결과를 그룹 단위로 반환한다.
 * 검색어가 비어 있고 recentIds가 있으면 '최근' 그룹을 맨 위에 추가하며,
 * 최근 그룹에 들어간 명령은 아래 그룹에서 제외해 중복(React key 충돌)을 막는다.
 */
export function filterAndGroupCommands(
  commands: Command[],
  query: string,
  recentIds: string[] = [],
): CommandGroup[] {
  const filtered = commands.filter((cmd) => matchesQuery(cmd, query));

  const groupOrder: CommandGroupLabel[] = ['빠른 추가', '담임 업무', '학교 정보', '페이지', '설정'];
  const baseGroups: CommandGroup[] = groupOrder
    .map((label) => ({
      label,
      commands: filtered.filter((cmd) => cmd.group === label),
    }))
    .filter((g) => g.commands.length > 0);

  // 검색 중에는 '최근' 그룹을 숨겨 혼란을 막는다.
  if (query.trim() || recentIds.length === 0) return baseGroups;

  const byId = new Map(filtered.map((c) => [c.id, c]));
  const recentCommands = recentIds
    .map((id) => byId.get(id))
    .filter((c): c is Command => Boolean(c));

  if (recentCommands.length === 0) return baseGroups;

  const recentSet = new Set(recentCommands.map((c) => c.id));
  const dedupedGroups = baseGroups
    .map((g) => ({ label: g.label, commands: g.commands.filter((c) => !recentSet.has(c.id)) }))
    .filter((g) => g.commands.length > 0);

  return [{ label: '최근', commands: recentCommands }, ...dedupedGroups];
}
