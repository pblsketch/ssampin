// ── 탭 정의 (서버·클라이언트 공용) ──
// TabNav 는 'use client' 라 여기 있는 값을 서버 컴포넌트(page.tsx)에서 직접 부를 수 없다.
// 그래서 정의는 이 파일(양쪽에서 쓸 수 있는 보통 모듈)에 두고, TabNav 는 가져다 쓰기만 한다.

export const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'retention', label: '정착·이탈' },
  { key: 'features', label: '기능 사용' },
  { key: 'rhythm', label: '현장 리듬' },
  { key: 'friction', label: '문제·마찰' },
  { key: 'chatbot', label: '챗봇' },
  { key: 'staffroom', label: '교무실' },
  { key: 'events', label: '이벤트 로그' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export const DEFAULT_TAB: TabKey = 'overview';

export function isTabKey(v: string | undefined): v is TabKey {
  return !!v && TABS.some((t) => t.key === v);
}
