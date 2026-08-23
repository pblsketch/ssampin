/**
 * 설정 탭 id·라벨 스냅샷 (S2.3 AC-3).
 *
 * 탭 **id**는 딥링크('settings#widget')·사용자 가이드(/docs)·챗봇 KB가 참조하는 외부 계약이다.
 * id가 빨간불이 되면 탭을 되돌릴 일이지 기대값을 고칠 일이 아니다.
 *
 * **라벨은 사람에게 보이는 문구**라 오너 결정으로 바뀔 수 있다. 바꿀 때는 이 기대값과 함께
 * /docs·챗봇 KB의 경로 안내("설정 > …")도 같은 작업 단위에서 고쳐야 한다.
 * - 'archive': '학년도 마무리' → '학년도/학기' (2026-08-12, ADR-046). 현재 학기·개학일 설정이
 *   이 탭에 들어오면서 마감 전용 탭이 아니게 됐다 — 학기만 바로잡으러 온 사용자가 '마무리'라는
 *   말을 보고 물러서면 안 된다. id('archive')는 그대로 두어 딥링크는 깨지지 않는다.
 */
import { describe, expect, test } from 'vitest';
import { TAB_GROUPS, TABS } from '../SettingsSidebar';

/** 기존 18개 + archive + labs — 순서 포함 전체 스냅샷. */
const EXPECTED_TABS: readonly { id: string; label: string }[] = [
  { id: 'school', label: '학교 정보' },
  { id: 'period', label: '교시 시간' },
  { id: 'display', label: '디스플레이' },
  { id: 'widget', label: '위젯' },
  { id: 'sidebar', label: '사이드바' },
  { id: 'calendar', label: '일정' },
  { id: 'todo', label: '할 일' },
  { id: 'seat', label: '좌석' },
  { id: 'weather', label: '날씨' },
  { id: 'record-reminder', label: '기록 알림' },
  { id: 'tools', label: '도구' },
  { id: 'shortcuts', label: '단축키' },
  { id: 'google', label: 'Google 연동' },
  { id: 'ai-bridge', label: 'AI 연결' },
  { id: 'backup', label: '백업/복원' },
  { id: 'archive', label: '학년도/학기' }, // S2.3 신규 — backup 바로 다음 (라벨 개명: ADR-046)
  { id: 'labs', label: '실험실 기능' }, // 2026-08-24 신규 — 쌤핀 AI·온라인 교무실·쿨메신저 옵트인
  { id: 'security', label: '보안' },
  { id: 'system', label: '시스템' },
  { id: 'about', label: '앱 정보' },
];

describe('설정 탭 id·라벨 계약 (S2.3)', () => {
  test('탭은 정확히 20개 — 기존 19개 불변 + labs 추가', () => {
    expect(TABS.map((t) => ({ id: t.id, label: t.label }))).toEqual(EXPECTED_TABS);
  });

  test('archive 탭은 연동·백업 그룹에서 backup 바로 다음에 있다', () => {
    const group = TAB_GROUPS.find((g) => g.label === '연동·백업');
    expect(group).toBeDefined();
    const ids = group!.tabs.map((t) => t.id);
    const backupIdx = ids.indexOf('backup');
    expect(backupIdx).toBeGreaterThanOrEqual(0);
    expect(ids[backupIdx + 1]).toBe('archive');
  });

  test('탭 id는 중복이 없다', () => {
    const ids = TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
