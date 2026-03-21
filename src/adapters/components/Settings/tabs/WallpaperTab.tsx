import { useCallback, useEffect, useState } from 'react';
import type { Settings, WallpaperSettings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function WallpaperTab({ draft, patch }: Props) {
  const patchWallpaper = useCallback((p: Partial<WallpaperSettings>) => {
    patch({ wallpaper: { ...(draft.wallpaper ?? { autoStart: false }), ...p } });
  }, [draft.wallpaper, patch]);

  const [serverStatus, setServerStatus] = useState<{
    running: boolean;
    url: string | null;
  }>({ running: false, url: null });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 상태 확인
  useEffect(() => {
    window.electronAPI?.wallpaperStatus().then((s) => {
      setServerStatus({ running: s.running, url: s.url });
    });
  }, []);

  const handleStart = async () => {
    setError(null);
    try {
      const result = await window.electronAPI?.wallpaperStart();
      if (result) {
        setServerStatus({ running: true, url: result.url });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '서버 시작에 실패했습니다.');
    }
  };

  const handleStop = async () => {
    await window.electronAPI?.wallpaperStop();
    setServerStatus({ running: false, url: null });
    setError(null);
  };

  const handleCopyUrl = () => {
    if (serverStatus.url) {
      void navigator.clipboard.writeText(serverStatus.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Electron 환경이 아닌 경우 (브라우저 개발 모드)
  const isElectron = !!window.electronAPI?.wallpaperStatus;

  return (
    <SettingsSection
      icon="wallpaper"
      iconColor="bg-teal-500/10 text-teal-400"
      title="바탕화면 모드"
      description="Lively Wallpaper 연동"
    >
      <div className="space-y-5">
        {/* 위젯 모드 vs 바탕화면 모드 비교 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-sp-bg rounded-lg p-4 border border-sp-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-indigo-400" style={{ fontSize: 20 }}>widgets</span>
              <span className="text-sm font-bold text-sp-text">위젯 모드</span>
            </div>
            <ul className="text-xs text-sp-muted space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5 shrink-0">&#8226;</span>
                떠다니는 미니 창
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5 shrink-0">&#8226;</span>
                다른 창 위에 표시
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5 shrink-0">&#8226;</span>
                드래그로 이동 / 크기 조절
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5 shrink-0">&#8226;</span>
                별도 앱 설치 불필요
              </li>
            </ul>
          </div>
          <div className="bg-teal-500/5 rounded-lg p-4 border border-teal-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-teal-400" style={{ fontSize: 20 }}>wallpaper</span>
              <span className="text-sm font-bold text-sp-text">바탕화면 모드</span>
              <span className="text-[10px] font-medium text-sp-accent bg-sp-accent/10 px-1.5 py-0.5 rounded">BETA</span>
            </div>
            <ul className="text-xs text-sp-muted space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-teal-400 mt-0.5 shrink-0">&#8226;</span>
                바탕화면 배경에 고정
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal-400 mt-0.5 shrink-0">&#8226;</span>
                모든 창 뒤에 항상 표시
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal-400 mt-0.5 shrink-0">&#8226;</span>
                클릭 / 체크 인터랙션 가능
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal-400 mt-0.5 shrink-0">&#8226;</span>
                Lively Wallpaper 앱 필요 (무료)
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-sp-muted leading-relaxed">
          바탕화면 모드를 사용하면 바탕화면 자체가 쌤핀 위젯이 됩니다.
          창을 모두 최소화하거나 바탕화면을 보면 시간표, 일정, 할일을 바로 확인할 수 있습니다.
        </p>

        {!isElectron ? (
          <div className="bg-sp-bg rounded-lg p-4 border border-sp-border">
            <p className="text-sm text-sp-muted">
              바탕화면 모드는 데스크톱 앱에서만 사용할 수 있습니다.
            </p>
          </div>
        ) : !serverStatus.running ? (
          <div className="space-y-3">
            <button
              onClick={handleStart}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-sp-accent text-white hover:bg-blue-600 transition-colors"
            >
              바탕화면 서버 시작
            </button>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 상태 표시 */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400 font-medium">서버 실행 중</span>
            </div>

            {/* URL 복사 */}
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-sp-bg text-sp-accent px-3 py-2 rounded-lg border border-sp-border font-mono truncate">
                {serverStatus.url}
              </code>
              <button
                onClick={handleCopyUrl}
                className="px-3 py-2 text-xs rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
              >
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>

            {/* 설정 가이드 */}
            <div className="bg-sp-bg rounded-lg p-4 border border-sp-border">
              <p className="text-xs font-bold text-sp-text mb-2">설정 방법</p>
              <ol className="text-xs text-sp-muted space-y-1.5 list-decimal list-inside">
                <li>
                  <button
                    type="button"
                    className="text-sp-accent underline hover:text-blue-400"
                    onClick={() => { window.electronAPI?.openExternal('https://apps.microsoft.com/detail/9ntm2qc6qws7'); }}
                  >
                    Lively Wallpaper
                  </button>
                  {' '}를 Microsoft Store에서 설치하세요 (무료)
                </li>
                <li>Lively 실행 → &quot;+&quot; 버튼 → &quot;URL 입력&quot; 선택</li>
                <li>위 URL을 붙여넣고 확인</li>
                <li>바탕화면에 쌤핀 위젯이 표시됩니다!</li>
              </ol>
            </div>

            {/* 자동 시작 토글 */}
            <div className="flex items-center justify-between pt-2 border-t border-sp-border/30">
              <div>
                <span className="text-sm font-medium text-sp-text">앱 시작 시 자동 시작</span>
                <p className="text-xs text-sp-muted mt-0.5">쌤핀을 켜면 바탕화면 서버도 자동으로 시작합니다</p>
              </div>
              <Toggle
                checked={draft.wallpaper?.autoStart ?? false}
                onChange={(v) => patchWallpaper({ autoStart: v })}
              />
            </div>

            {/* 서버 중지 */}
            <button
              onClick={handleStop}
              className="w-full py-2 text-xs rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-red-400 transition-colors"
            >
              서버 중지
            </button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
