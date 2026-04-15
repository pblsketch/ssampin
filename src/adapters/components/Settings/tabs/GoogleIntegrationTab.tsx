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
