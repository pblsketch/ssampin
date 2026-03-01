import { useState, useEffect, type ReactNode } from 'react';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { usePinStore } from '@adapters/stores/usePinStore';
import { PinOverlay } from './PinOverlay';

interface PinGuardProps {
  feature: ProtectedFeatureKey;
  children: ReactNode;
}

export function PinGuard({ feature, children }: PinGuardProps) {
  const isProtected = usePinStore((s) => s.isProtected);
  const isAccessible = usePinStore((s) => s.isAccessible);
  const checkAutoLock = usePinStore((s) => s.checkAutoLock);
  const [unlocked, setUnlocked] = useState(false);

  // 페이지 진입 시 자동 잠금 체크
  useEffect(() => {
    checkAutoLock();
  }, [checkAutoLock]);

  const protected_ = isProtected(feature);
  const accessible = isAccessible(feature);

  // PIN 보호 대상이 아니면 바로 렌더링
  if (!protected_) return <>{children}</>;

  // 이미 잠금 해제됐으면 렌더링
  if (accessible || unlocked) return <>{children}</>;

  // PIN 입력 필요
  return (
    <div className="relative h-full w-full">
      {/* 잠긴 상태 배경 */}
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-sp-border mb-4 block">
            lock
          </span>
          <p className="text-sp-muted text-sm">이 기능은 PIN 잠금으로 보호되어 있습니다</p>
        </div>
      </div>
      <PinOverlay onSuccess={() => setUnlocked(true)} />
    </div>
  );
}
