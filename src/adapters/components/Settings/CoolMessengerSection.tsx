import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '@domain/entities/Settings';
import { SettingsSection } from './shared/SettingsSection';
import { Toggle } from './shared/Toggle';

/**
 * 쿨메신저 쪽지 가져오기 설정.
 *
 * ## 왜 기본이 꺼짐인가
 * 쿨메신저를 안 쓰는 시도교육청이 많다. 안 쓰는 선생님께 "쿨메신저에서 가져오기"
 * 버튼이 보이면 그건 기능이 아니라 잡음이다. 그래서 여기서 켜야 버튼이 나온다.
 *
 * ## 켤 때 쪽지함이 실제로 있는지 확인한다
 * 켜 놓고 나중에 "안 되네"를 겪게 하지 않는다. 켜는 순간 확인해서, 없으면
 * 켜지지 않고 이유를 보여준다.
 */

type Availability = 'checking' | 'available' | 'unavailable';

interface Props {
  readonly draft: Settings;
  readonly patch: (p: Partial<Settings>) => void;
}

export function CoolMessengerSection({ draft, patch }: Props) {
  const enabled = draft.coolMessengerImportEnabled === true;
  const [availability, setAvailability] = useState<Availability>('checking');
  const [rejected, setRejected] = useState(false);

  const check = useCallback(async (): Promise<boolean> => {
    const api = window.electronAPI?.coolMessenger;
    if (!api) return false;
    try {
      return await api.isAvailable();
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void check().then((ok) => {
      if (alive) setAvailability(ok ? 'available' : 'unavailable');
    });
    return () => {
      alive = false;
    };
  }, [check]);

  const handleToggle = async (next: boolean) => {
    if (!next) {
      setRejected(false);
      patch({ coolMessengerImportEnabled: false });
      return;
    }
    // 켤 때는 쪽지함이 실제로 있는지 확인한 뒤에만 켠다
    const ok = await check();
    setAvailability(ok ? 'available' : 'unavailable');
    if (!ok) {
      setRejected(true);
      return;
    }
    setRejected(false);
    patch({ coolMessengerImportEnabled: true });
  };

  return (
    <SettingsSection
      icon="forward_to_inbox"
      iconColor="bg-blue-500/10 text-blue-400"
      title="쿨메신저에서 가져오기"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-sp-text">쪽지에서 일정·할일 가져오기</p>
            <p className="text-xs text-sp-muted">
              쿨메신저 쪽지에서 날짜를 찾아 등록합니다. 켜면 일정·할일 화면에 버튼이 생깁니다.
            </p>
          </div>
          <Toggle checked={enabled} onChange={(v) => void handleToggle(v)} />
        </div>

        {rejected && (
          <div className="rounded-lg border border-sp-border bg-sp-surface p-3">
            <p className="text-xs text-sp-error">쿨메신저 쪽지함을 찾지 못해 켜지 않았습니다.</p>
            <p className="mt-1 text-xs text-sp-muted">
              이 PC에 쿨메신저가 설치되어 있고, 한 번이라도 실행해 쪽지를 받은 적이 있어야 합니다.
            </p>
          </div>
        )}

        {!rejected && availability === 'unavailable' && (
          <p className="text-xs text-sp-muted">
            이 PC에서는 쿨메신저 쪽지함을 찾지 못했습니다. 쿨메신저를 쓰지 않는 학교라면 꺼 두셔도
            됩니다.
          </p>
        )}

        {enabled && availability === 'available' && (
          <p className="text-xs text-sp-muted">
            쪽지 원문은 이 PC 밖으로 나가지 않습니다. 쪽지함은 읽기만 하며, 쿨메신저의 안읽음 표시를
            바꾸지 않습니다.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
