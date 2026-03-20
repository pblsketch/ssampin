'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'migration-banner-dismissed';

export default function MigrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative w-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white">
      <div className="mx-auto flex max-w-6xl items-start gap-3 md:items-center">
        {/* 아이콘 */}
        <span className="mt-0.5 flex-shrink-0 text-base md:mt-0">📢</span>

        {/* 텍스트 */}
        <div className="flex flex-1 flex-col gap-0.5 text-sm md:flex-row md:items-center md:gap-3">
          <span className="font-semibold">쌤핀 도메인이 변경되었습니다</span>
          <span className="hidden text-blue-200 md:inline">—</span>
          <span className="text-blue-100 leading-snug">
            모바일 앱(m.ssampin.com)을 홈 화면에 추가하신 분은 기존 아이콘을 삭제하고{' '}
            <a
              href="https://m.ssampin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white transition-colors"
            >
              m.ssampin.com
            </a>
            에서 다시 추가해주세요. 데이터는 Google Drive 동기화로 그대로 유지됩니다.
          </span>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={dismiss}
          aria-label="배너 닫기"
          className="flex-shrink-0 rounded p-1 text-blue-100 transition-colors hover:bg-blue-700/50 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
