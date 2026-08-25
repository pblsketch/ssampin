'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { DEFAULT_TAB, TABS } from '../_lib/tabs';

/**
 * 탭 목록. 이 화면이 느렸던 큰 이유 중 하나가 "안 보는 것까지 전부 불러오기"였다.
 * 탭을 나눠 지금 보고 있는 탭의 자료만 불러온다.
 *
 * href 로 이동하는 이유 — 탭은 주소(?tab=)에 남아야 새로고침·뒤로가기·링크 공유가 된다.
 * 기간 선택(days/from/to)은 그대로 이어붙여 탭을 옮겨도 보던 기간이 유지된다.
 */
export default function TabNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('tab') ?? DEFAULT_TAB;

  function hrefFor(tab: string) {
    const sp = new URLSearchParams();
    for (const key of ['days', 'from', 'to'] as const) {
      const v = searchParams.get(key);
      if (v) sp.set(key, v);
    }
    if (tab !== DEFAULT_TAB) sp.set('tab', tab);
    const query = sp.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" aria-label="분석 항목">
      {TABS.map((t) => {
        const active = current === t.key;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition ${
              active
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
