/**
 * 설정 탭 id·라벨 스냅샷 (S2.3 AC-3).
 *
 * 탭 id·라벨은 딥링크('settings#widget')·사용자 가이드(/docs)·챗봇 KB가 참조하는 외부 계약이다.
 * 기존 18개는 한 글자도 바꾸지 않고, S2.3의 'archive'(학년도 마무리)는 '연동·백업' 그룹의
 * backup 바로 다음에 **추가만** 한다. 이 테스트가 그 계약을 고정한다 —
 * 여기가 빨간불이 되면 탭을 되돌릴 일이지 기대값을 고칠 일이 아니다.
 */
import { describe, expect, test } from 'vitest';
import { TAB_GROUPS, TABS } from '../SettingsSidebar';

/** 기존 18개 + archive — 순서 포함 전체 스냅샷. */
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
  { id: 'archive', label: '학년도 마무리' }, // S2.3 신규 — backup 바로 다음
  { id: 'security', label: '보안' },
  { id: 'system', label: '시스템' },
  { id: 'about', label: '앱 정보' },
];

describe('설정 탭 id·라벨 계약 (S2.3)', () => {
  test('탭은 정확히 19개 — 기존 18개 불변 + archive 추가', () => {
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
