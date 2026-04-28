import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore } from '@adapters/components/common/Toast';

interface StickerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_DISPLAY = 'Ctrl + Shift + E';

/**
 * 이모티콘 설정 모달.
 *
 * - 자동 붙여넣기 토글
 * - 이전 클립보드 복원 토글
 * - 최근 사용 표시 개수 (1~16)
 * - 단축키 (read-only, 변경은 설정 → 단축키 페이지)
 * - macOS 전용 — 접근성 권한 안내 배너 (PRD §4.1.1 Phase 2)
 */
export function StickerSettingsModal({
  isOpen,
  onClose,
}: StickerSettingsModalProps): JSX.Element {
  const settings = useStickerStore((s) => s.data.settings);
  const updateSettings = useStickerStore((s) => s.updateSettings);

  const [isMacOS, setIsMacOS] = useState(false);

  // 모달 열릴 때 OS 플랫폼 조회 — macOS이면 접근성 안내 배너 표시
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const getPlatform = window.electronAPI?.sticker?.getPlatform;
    if (typeof getPlatform !== 'function') {
      // 브라우저 dev mode — Electron API 없음. 배너 숨김.
      setIsMacOS(false);
      return;
    }
    void getPlatform()
      .then((result) => {
        if (!cancelled) setIsMacOS(result.platform === 'darwin');
      })
      .catch(() => {
        if (!cancelled) setIsMacOS(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleRecentChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.max(1, Math.min(16, n));
    void updateSettings({ recentMaxCount: clamped });
  };

  const handleCheckAccessibility = () => {
    const requestPerm = window.electronAPI?.sticker?.requestAccessibilityPermission;
    if (typeof requestPerm !== 'function') {
      useToastStore
        .getState()
        .show('이 환경에서는 권한 확인이 지원되지 않아요.', 'info');
      return;
    }
    void requestPerm()
      .then((result) => {
        if (result.granted) {
          useToastStore
            .getState()
            .show('접근성 권한이 허용되어 있어요. 자동 붙여넣기가 동작해요.', 'success');
        } else {
          useToastStore
            .getState()
            .show(
              '시스템 환경설정 → 보안 및 개인정보 → 접근성에서 쌤핀을 추가해 주세요.',
              'info',
            );
        }
      })
      .catch(() => {
        useToastStore
          .getState()
          .show('권한 확인 중 오류가 발생했어요.', 'error');
      });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이모티콘 설정" srOnlyTitle size="md">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined icon-md text-sp-muted">tune</span>
            이모티콘 설정
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="px-5 py-5 flex flex-col gap-5">
          <ToggleRow
            title="자동 붙여넣기"
            description="이모티콘 선택 시 이전 앱(카톡 등)에 자동으로 붙여넣기"
            checked={settings.autoPaste}
            onChange={(v) => void updateSettings({ autoPaste: v })}
          />

          {isMacOS && (
            <div className="text-detail bg-sp-accent/10 border-l-4 border-sp-accent rounded-r-md p-3 flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="material-symbols-outlined icon-sm text-sp-accent mt-0.5 shrink-0"
              >
                info
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sp-text leading-relaxed">
                  macOS에서는 시스템 환경설정 → 보안 및 개인정보 → 접근성 권한이 필요해요.
                </p>
                <button
                  type="button"
                  onClick={handleCheckAccessibility}
                  className={[
                    'mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                    'bg-sp-accent text-sp-accent-fg text-detail font-sp-semibold',
                    'hover:bg-sp-accent/90 active:scale-95',
                    'transition-all duration-sp-base ease-sp-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-card',
                  ].join(' ')}
                >
                  <span className="material-symbols-outlined icon-sm">verified_user</span>
                  권한 확인하기
                </button>
              </div>
            </div>
          )}

          {/*
            v2.0.x 핫픽스: 일시적으로 비활성화 — nut-js 자동 붙여넣기 회귀 이슈로 인해 임시로 hidden.
            restoreMode가 켜진 상태에서 prev 클립보드가 picker capture인 경우 수동 paste 시
            picker 화면이 붙여넣어지는 버그가 발견됨. 메인 프로세스에서도 force-false로
            오버라이드 중(electron/main.ts sticker:paste 핸들러). 안정화 후 재노출 검토.
          */}
          {/*
          <ToggleRow
            title="이전 클립보드 복원"
            description="자동 붙여넣기 후 ~500ms 뒤 이전 클립보드 내용을 되돌려요"
            checked={settings.restorePreviousClipboard}
            onChange={(v) => void updateSettings({ restorePreviousClipboard: v })}
            badge="실험"
          />
          */}

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-sp-semibold text-sp-text">
                최근 사용 표시 개수
              </p>
              <p className="text-detail text-sp-muted mt-0.5">
                피커 상단에 보일 최근 사용 이모티콘 수
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={1}
                max={16}
                value={settings.recentMaxCount}
                onChange={(e) => handleRecentChange(e.target.value)}
                className="w-16 px-2 py-1.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text text-center text-sm focus:outline-none focus:ring-2 focus:ring-sp-accent"
              />
              <span className="text-detail text-sp-muted">개</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-sp-border">
            <div className="min-w-0">
              <p className="text-sm font-sp-semibold text-sp-text">단축키</p>
              <p className="text-detail text-sp-muted mt-0.5">
                피커 열기/닫기 토글 단축키
              </p>
            </div>
            <kbd className="px-3 py-1.5 rounded-lg bg-sp-text/5 ring-1 ring-sp-border font-mono text-xs text-sp-text shrink-0">
              {SHORTCUT_DISPLAY}
            </kbd>
          </div>
          <p className="text-detail text-sp-muted -mt-2">
            변경하려면 설정 → 단축키 페이지에서 수정해주세요.
          </p>
        </div>

        <footer className="flex items-center justify-end px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
          >
            완료
          </button>
        </footer>
      </div>
    </Modal>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  badge?: string;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  badge,
}: ToggleRowProps): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      <div className="min-w-0">
        <p className="text-sm font-sp-semibold text-sp-text flex items-center gap-2">
          {title}
          {badge && (
            <span className="text-caption font-sp-semibold tracking-wider px-1.5 py-0.5 rounded bg-sp-highlight/15 text-sp-highlight ring-1 ring-sp-highlight/30">
              {badge}
            </span>
          )}
        </p>
        <p className="text-detail text-sp-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-sp-base ease-sp-out',
          checked ? 'bg-sp-accent' : 'bg-sp-border',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-card',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-sp-base ease-sp-out',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </label>
  );
}
