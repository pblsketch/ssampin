import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { LegacyAddClassModal } from './LegacyAddClassModal';
import { ElementaryWizard } from './ElementaryWizard';
import { AddSubjectsToGroup } from './AddSubjectsToGroup';

interface AddClassModalProps {
  onClose: () => void;
}

type Mode = 'new' | 'addToGroup' | 'legacy';

/**
 * 학급 추가 모달 셸.
 *
 * - schoolLevel이 elementary 또는 custom이면 3단계 위자드(ElementaryWizard)
 * - 그 외(middle, high)는 기존 Legacy 2탭 UI(LegacyAddClassModal)
 * - 위자드 모드에서 기존 그룹이 있으면 "기존 학급에 과목 추가" 진입점 노출
 * - 위자드 모드에서 "중등 교과교사이신가요?" 링크로 Legacy 폴백 가능
 *
 * 위자드는 담임 학급 그룹(groupId)으로 여러 과목을 한 번에 생성하며,
 * 명렬/좌석이 그룹 내 전 과목에 공유된다.
 */
export function AddClassModal({ onClose }: AddClassModalProps) {
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);
  const classes = useTeachingClassStore((s) => s.classes);
  const useWizard = schoolLevel === 'elementary' || schoolLevel === 'custom';
  const hasGroup = classes.some((c) => c.groupId);

  const [mode, setMode] = useState<Mode>('new');

  // 중등 이상: 항상 Legacy
  if (!useWizard) {
    return <LegacyAddClassModal onClose={onClose} />;
  }

  // 위자드에서 Legacy로 전환한 경우
  if (mode === 'legacy') {
    return <LegacyAddClassModal onClose={onClose} />;
  }

  // 위자드에서 기존 그룹에 과목 추가 모드
  if (mode === 'addToGroup') {
    return (
      <AddSubjectsToGroup
        onClose={onClose}
        onSwitchToNew={() => setMode('new')}
      />
    );
  }

  // 기본: 3단계 위자드
  return (
    <ElementaryWizard
      onClose={onClose}
      {...(hasGroup ? { onSwitchToAddGroup: () => setMode('addToGroup') } : {})}
      onSwitchToLegacy={() => setMode('legacy')}
    />
  );
}
