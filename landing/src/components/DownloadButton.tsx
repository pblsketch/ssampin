'use client';

import { useEffect, useState } from 'react';
import { DOWNLOAD_URL, VERSION, FILE_SIZE } from '@/config';

interface DownloadButtonProps {
  variant?: 'primary' | 'white';
}

export default function DownloadButton({ variant = 'primary' }: DownloadButtonProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  if (isMobile) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-6 py-4 text-center">
        <p className="text-base font-medium text-amber-200">
          📱 쌤핀은 Windows PC 전용 앱이에요.
        </p>
        <p className="mt-1 text-sm text-amber-200/70">
          PC에서 이 페이지를 열어주세요!
        </p>
      </div>
    );
  }

  const isPrimary = variant === 'primary';

  return (
    <div className="flex flex-col items-center gap-3">
      <a
        href={DOWNLOAD_URL}
        className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 text-lg font-bold transition-all hover:-translate-y-0.5 ${
          isPrimary
            ? 'bg-sp-accent text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 hover:shadow-blue-500/30'
            : 'bg-white text-blue-700 shadow-lg hover:bg-blue-50'
        }`}
      >
        <span>📥</span>
        <span>
          {isPrimary ? `Windows 다운로드 (v${VERSION})` : '무료 다운로드 (Windows)'}
        </span>
      </a>
      <p className={`text-sm ${isPrimary ? 'text-sp-muted' : 'text-blue-100/70'}`}>
        무료 · Windows 10/11 · 설치 파일 {FILE_SIZE}
      </p>
    </div>
  );
}
