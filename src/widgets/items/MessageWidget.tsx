import { useEffect } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { MessageBanner } from '@adapters/components/Dashboard/MessageBanner';

export function MessageWidget() {
  const loadMessage = useMessageStore((s) => s.loadMessage);

  useEffect(() => {
    void loadMessage();
  }, [loadMessage]);

  return (
    <div className="h-full flex flex-col justify-center">
      <MessageBanner />
    </div>
  );
}
