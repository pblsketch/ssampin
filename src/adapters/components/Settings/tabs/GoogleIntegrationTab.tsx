import { useRef } from 'react';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { AccountSection, BackupCard, CalendarCard, TasksCard, LockedCard } from '../google';

export function GoogleIntegrationTab() {
  const accountRef = useRef<HTMLDivElement>(null);
  const backupRef = useRef<HTMLDivElement>(null);

  const scrollToAccount = () => {
    accountRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToBackup = () => {
    backupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { isConnected } = useGoogleAccountStore();

  return (
    <div className="space-y-8">
      {/* 학교 계정 안내 (항상 표시 — 연결 전이면 예방, 연결 후이면 트러블슈팅 단서) */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-300 text-icon-lg shrink-0 mt-0.5">school</span>
          <div className="flex-1 text-sm leading-relaxed">
            <p className="font-semibold text-amber-100 mb-1">학교 Google 계정은 차단될 수 있어요</p>
            <p className="text-amber-200/90 mb-2">
              학교에서 발급한 계정(@*.go.kr, @*.sen.go.kr 등)은 관리자 정책으로 외부 앱 접근이 차단되는 경우가 많아요.
              연결은 되지만 캘린더·드라이브 호출이 모두 <span className="font-mono text-xs">401 (UNAUTHENTICATED)</span> 오류로 실패합니다.
            </p>
            <p className="text-amber-200/90">
              <span className="font-semibold">개인 Gmail 계정으로 연결하시는 걸 권장</span>해요. 이미 학교 계정으로 연결한 상태에서 동기화 오류가 뜬다면, 아래에서 연결을 해제하고 개인 Gmail로 다시 연결해주세요.
            </p>
          </div>
        </div>
      </div>

      <AccountSection ref={accountRef} />

      {isConnected ? (
        <div className="space-y-4">
          <BackupCard ref={backupRef} />
          <CalendarCard />
          <TasksCard onJumpToBackup={scrollToBackup} />
        </div>
      ) : (
        <div className="space-y-4">
          <LockedCard
            icon="cloud_sync"
            iconBg="bg-cyan-500/10 text-cyan-400"
            title="📦 앱 데이터 백업"
            onScrollToAccount={scrollToAccount}
          />
          <LockedCard
            icon="event"
            iconBg="bg-pink-500/10 text-pink-400"
            title="📅 Google 캘린더"
            onScrollToAccount={scrollToAccount}
          />
          <LockedCard
            icon="checklist"
            iconBg="bg-green-500/10 text-green-400"
            title="✅ Google Tasks"
            onScrollToAccount={scrollToAccount}
          />
        </div>
      )}
    </div>
  );
}
