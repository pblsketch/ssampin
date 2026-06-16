// @vitest-environment jsdom
/**
 * Command Palette 회귀 메타테스트.
 *
 * - matchesQuery: AND 토큰 매칭 정책 유지
 * - "여러 날 출결" 명령(`multiDateAttendance.open`) 존재 + 키워드 매핑 보장 (FR-10)
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildDefaultCommands, matchesQuery, filterAndGroupCommands } from './commandRegistry';
import type { Command } from './commandRegistry';
import { useMultiDateAttendanceIntentStore } from '@adapters/stores/useMultiDateAttendanceIntentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

describe('matchesQuery', () => {
  const cmd = {
    id: 'test',
    label: '여러 날 출결 일괄 등록',
    group: '빠른 추가' as const,
    icon: 'date_range',
    keywords: ['여러', '날', '출결', '결석', '교외체험학습'],
    run: () => {},
  };

  it('빈 쿼리는 모두 매치', () => {
    expect(matchesQuery(cmd, '')).toBe(true);
    expect(matchesQuery(cmd, '   ')).toBe(true);
  });

  it('AND 토큰 — 모두 포함', () => {
    expect(matchesQuery(cmd, '여러 출결')).toBe(true);
    expect(matchesQuery(cmd, '출결 일괄')).toBe(true);
  });

  it('하나라도 불일치면 false', () => {
    expect(matchesQuery(cmd, '여러 메모')).toBe(false);
  });

  it('대소문자 무시', () => {
    expect(matchesQuery(cmd, 'attendance')).toBe(false); // 키워드 없음
    expect(matchesQuery({ ...cmd, keywords: [...cmd.keywords, 'attendance'] }, 'ATTENDANCE')).toBe(
      true,
    );
  });

  it('초성 검색 — 전부 초성인 토큰은 초성 시퀀스로 매치', () => {
    expect(matchesQuery(cmd, 'ㅊㄱ')).toBe(true); // 출결 → ㅊㄱ
    expect(matchesQuery(cmd, 'ㅇㄹ')).toBe(true); // 여러 → ㅇㄹ
    expect(matchesQuery(cmd, 'ㅋㅌ')).toBe(false); // 해당 초성 없음
  });

  it('초성 토큰과 일반 토큰 AND 조합', () => {
    expect(matchesQuery(cmd, 'ㅊㄱ 일괄')).toBe(true); // 출결(초성) + 일괄(부분일치)
    expect(matchesQuery(cmd, 'ㅊㄱ 메모')).toBe(false); // 메모 토큰 불일치
  });
});

describe('filterAndGroupCommands - 최근 그룹', () => {
  const cmds: Command[] = [
    { id: 'a', label: '할일 빠른 추가', group: '빠른 추가', icon: 'x', run: () => {} },
    { id: 'b', label: '메모 빠른 추가', group: '빠른 추가', icon: 'x', run: () => {} },
    { id: 'c', label: '설정 열기', group: '설정', icon: 'x', run: () => {} },
  ];

  it('검색어가 없고 recentIds가 있으면 최근 그룹이 맨 위(입력 순서 유지)', () => {
    const groups = filterAndGroupCommands(cmds, '', ['c', 'a']);
    expect(groups[0]?.label).toBe('최근');
    expect(groups[0]?.commands.map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('최근에 들어간 명령은 아래 그룹에서 제외(중복 방지)', () => {
    const groups = filterAndGroupCommands(cmds, '', ['a']);
    const recent = groups.find((g) => g.label === '최근');
    const quick = groups.find((g) => g.label === '빠른 추가');
    expect(recent?.commands.map((c) => c.id)).toEqual(['a']);
    expect(quick?.commands.map((c) => c.id)).toEqual(['b']); // a 제외됨
  });

  it('검색어가 있으면 최근 그룹을 노출하지 않는다', () => {
    const groups = filterAndGroupCommands(cmds, '메모', ['a']);
    expect(groups.some((g) => g.label === '최근')).toBe(false);
  });

  it('존재하지 않는 recentId는 무시', () => {
    const groups = filterAndGroupCommands(cmds, '', ['zzz', 'b']);
    const recent = groups.find((g) => g.label === '최근');
    expect(recent?.commands.map((c) => c.id)).toEqual(['b']);
  });

  it('recentIds가 비면 최근 그룹 없음', () => {
    const groups = filterAndGroupCommands(cmds, '', []);
    expect(groups.some((g) => g.label === '최근')).toBe(false);
  });
});

describe('"여러 날 출결" 명령 (multiDateAttendance.open)', () => {
  const onNavigate = vi.fn();
  const commands = buildDefaultCommands({ onNavigate });
  const target = commands.find((c) => c.id === 'multiDateAttendance.open');

  it('명령이 등록되어 있음', () => {
    expect(target).toBeDefined();
  });

  it('빠른 추가 그룹에 속함', () => {
    expect(target?.group).toBe('빠른 추가');
  });

  it('date_range 아이콘', () => {
    expect(target?.icon).toBe('date_range');
  });

  it('한국어 라벨', () => {
    expect(target?.label).toContain('여러 날');
    expect(target?.label).toContain('출결');
  });

  it('필수 키워드 매핑 (여러, 날, 출결, 일괄, 다중)', () => {
    expect(target?.keywords).toContain('여러');
    expect(target?.keywords).toContain('출결');
    expect(target?.keywords).toContain('일괄');
    expect(target?.keywords).toContain('다중');
  });

  it('실제 사용자 케이스 검색 — "교외체험학습" 매치', () => {
    expect(target).toBeDefined();
    if (!target) return;
    expect(matchesQuery(target, '교외체험학습')).toBe(true);
  });

  it('"결석" 키워드 매치', () => {
    expect(target).toBeDefined();
    if (!target) return;
    expect(matchesQuery(target, '결석')).toBe(true);
  });

  it('run() 호출 시 intent 설정 + homeroom 라우팅', () => {
    expect(target).toBeDefined();
    if (!target) return;

    // intent store 초기화
    useMultiDateAttendanceIntentStore.getState().consume();
    expect(useMultiDateAttendanceIntentStore.getState().pending).toBe(false);

    onNavigate.mockClear();
    target.run();

    // intent pending 으로 전환됨
    expect(useMultiDateAttendanceIntentStore.getState().pending).toBe(true);
    expect(useMultiDateAttendanceIntentStore.getState().preferredMode).toBe('multi');
    // homeroom 페이지로 navigate
    expect(onNavigate).toHaveBeenCalledWith('homeroom');

    // cleanup
    useMultiDateAttendanceIntentStore.getState().consume();
  });
});

describe('학교 정보 빠른 복사 명령 (school-enrich)', () => {
  const onNavigate = vi.fn();
  const original = useSettingsStore.getState().settings;

  afterEach(() => {
    useSettingsStore.setState({ settings: original });
  });

  function setNeis(neis: Partial<(typeof original)['neis']>) {
    useSettingsStore.setState({
      settings: {
        ...original,
        neis: { schoolCode: 'X', atptCode: 'Y', schoolName: '서울고', ...neis },
      },
    });
  }

  it('학교 주소가 없으면 학교 정보 그룹 명령이 없다', () => {
    setNeis({});
    const cmds = buildDefaultCommands({ onNavigate });
    expect(cmds.some((c) => c.group === '학교 정보')).toBe(false);
  });

  it('주소·전화·팩스가 있으면 각각 복사 명령이 학교 정보 그룹으로 등록된다', () => {
    setNeis({
      address: '서울특별시 서초구 효령로 197',
      postalCode: '06669',
      tel: '02-582-8151',
      fax: '02-587-3933',
    });
    const cmds = buildDefaultCommands({ onNavigate });
    const addr = cmds.find((c) => c.id === 'schoolInfo.copyAddress');
    expect(addr?.group).toBe('학교 정보');
    expect(addr?.icon).toBe('location_on');
    expect(cmds.some((c) => c.id === 'schoolInfo.copyTel')).toBe(true);
    expect(cmds.some((c) => c.id === 'schoolInfo.copyFax')).toBe(true);
  });

  it('전화·팩스가 없으면 해당 복사 명령은 빠진다(주소만)', () => {
    setNeis({ address: '서울특별시 서초구 효령로 197' });
    const cmds = buildDefaultCommands({ onNavigate });
    expect(cmds.some((c) => c.id === 'schoolInfo.copyAddress')).toBe(true);
    expect(cmds.some((c) => c.id === 'schoolInfo.copyTel')).toBe(false);
    expect(cmds.some((c) => c.id === 'schoolInfo.copyFax')).toBe(false);
  });

  it('주소 복사 run() → "우편번호 주소"를 클립보드에 쓴다', () => {
    setNeis({ address: '서울특별시 서초구 효령로 197', postalCode: '06669' });
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const cmds = buildDefaultCommands({ onNavigate });
    cmds.find((c) => c.id === 'schoolInfo.copyAddress')!.run();

    expect(writeText).toHaveBeenCalledWith('06669 서울특별시 서초구 효령로 197');
  });
});

describe('동작 명령 — 즐겨찾기 빠른 추가 + 담임 업무 바로가기', () => {
  const onNavigate = vi.fn();
  const commands = buildDefaultCommands({ onNavigate });

  it('즐겨찾기 빠른 추가 명령이 빠른 추가 그룹으로 등록', () => {
    const c = commands.find((x) => x.id === 'quickAdd.bookmark');
    expect(c?.group).toBe('빠른 추가');
    expect(c?.icon).toBe('bookmark');
  });

  it('명렬/기록/자리배치 바로가기가 담임 업무 그룹으로 등록', () => {
    (['homeroom.roster', 'homeroom.records', 'homeroom.seating'] as const).forEach((id) => {
      expect(commands.find((c) => c.id === id)?.group).toBe('담임 업무');
    });
  });

  it('자리 배치 검색 — "자리"·초성 "ㅈㄹㅂㅊ" 매치', () => {
    const seating = commands.find((c) => c.id === 'homeroom.seating');
    expect(seating).toBeDefined();
    if (!seating) return;
    expect(matchesQuery(seating, '자리')).toBe(true);
    expect(matchesQuery(seating, 'ㅈㄹㅂㅊ')).toBe(true); // 자리배치
  });

  it('자리 배치 run() → homeroom 이동 + 탭 전환 이벤트(detail=seating) dispatch', () => {
    const seating = commands.find((c) => c.id === 'homeroom.seating');
    expect(seating).toBeDefined();
    if (!seating) return;

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    onNavigate.mockClear();
    seating.run();

    expect(onNavigate).toHaveBeenCalledWith('homeroom');
    const tabEvent = dispatchSpy.mock.calls
      .map((args) => args[0])
      .find(
        (evt): evt is CustomEvent =>
          evt instanceof CustomEvent && evt.type === 'ssampin:homeroom-open-tab',
      );
    expect(tabEvent).toBeDefined();
    expect(tabEvent?.detail).toBe('seating');
    dispatchSpy.mockRestore();
  });
});
