import { useEffect, useState, type ReactNode } from 'react';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { usePinStore } from '@adapters/stores/usePinStore';
import { PinOverlay } from '@adapters/components/common/PinOverlay';
import { Card } from '@adapters/components/common/Card';

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
  const lastUnlockedAt = usePinStore((s) => s.lastUnlockedAt);
  const [showPinOverlay, setShowPinOverlay] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // 자동 잠금 체크 (마운트 시 + 30초 주기 재검사)
  // 위젯 모드에서는 useClock으로 매초 리렌더되지만 일반 대시보드는 그렇지 않으므로
  // 페이지/위젯 구분 없이 주기적으로 autoLockMinutes 경과를 확인한다.
  useEffect(() => {
    checkAutoLock();
    const id = setInterval(checkAutoLock, 30_000);
    return () => clearInterval(id);
  }, [checkAutoLock]);

  // 전역 잠금 상태 변화에 로컬 unlocked 동기화
  // - "지금 잠그기" 버튼 클릭 또는 자동 잠금 타임아웃 시 lastUnlockedAt === null
  //   → 다시 잠금 카드가 보이도록 로컬 상태도 해제
  useEffect(() => {
    if (lastUnlockedAt === null) setUnlocked(false);
  }, [lastUnlockedAt]);

  const protected_ = isProtected(feature);

  // 보호 대상이 아니면 그대로 렌더링
  if (!protected_) return <>{children}</>;

  // 잠금 해제됐으면 그대로 렌더링
  if (isAccessible(feature) || unlocked) return <>{children}</>;

  return (
    <>
      {/* 잠금 카드 */}
      <Card
        interactive
        className="p-4 group"
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
      </Card>

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
