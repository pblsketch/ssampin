import { useState, type ReactNode } from 'react';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { usePinStore } from '@adapters/stores/usePinStore';
import { PinOverlay } from '@adapters/components/common/PinOverlay';

interface DashboardPinGuardProps {
  feature: ProtectedFeatureKey;
  children: ReactNode;
}

/**
 * 대시보드 위젯용 PIN 보호 래퍼
 * - PIN 보호 대상이면 내용을 숨기고 잠금 카드를 표시
 * - 클릭하면 PinOverlay 표시 → 인증 성공 시 내용 표시
 */
export function DashboardPinGuard({ feature, children }: DashboardPinGuardProps) {
  const isProtected = usePinStore((s) => s.isProtected);
  const isAccessible = usePinStore((s) => s.isAccessible);
  const checkAutoLock = usePinStore((s) => s.checkAutoLock);
  const [showPinOverlay, setShowPinOverlay] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const protected_ = isProtected(feature);

  // 보호 대상이 아니면 그대로 렌더링
  if (!protected_) return <>{children}</>;

  // 자동 잠금 체크
  checkAutoLock();

  // 잠금 해제됐으면 그대로 렌더링
  if (isAccessible(feature) || unlocked) return <>{children}</>;

  return (
    <>
      {/* 잠금 카드 */}
      <div
        className="rounded-xl bg-sp-card p-4 cursor-pointer group hover:ring-1 hover:ring-sp-accent/30 transition-all"
        onClick={() => setShowPinOverlay(true)}
      >
        <div className="flex items-center justify-center flex-col gap-3 py-8">
          <div className="w-12 h-12 rounded-full bg-sp-border/20 flex items-center justify-center group-hover:bg-sp-accent/10 transition-colors">
            <span className="material-symbols-outlined text-sp-border group-hover:text-sp-accent text-2xl transition-colors">
              lock
            </span>
          </div>
          <p className="text-sp-muted text-xs group-hover:text-sp-text/70 transition-colors">
            잠금됨 · 클릭하여 열기
          </p>
        </div>
      </div>

      {/* PIN 입력 오버레이 */}
      {showPinOverlay && (
        <PinOverlay
          onSuccess={() => {
            setShowPinOverlay(false);
            setUnlocked(true);
          }}
          onCancel={() => setShowPinOverlay(false)}
        />
      )}
    </>
  );
}
