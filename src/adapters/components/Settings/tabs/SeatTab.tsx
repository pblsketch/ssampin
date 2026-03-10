import type { Settings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { NumberStepper } from '../shared/NumberStepper';
import { SeatRelationSection } from '../SeatRelationSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function SeatTab({ draft, patch }: Props) {
  return (
    <div>
      <SettingsSection
        icon="chair"
        iconColor="bg-orange-500/10 text-orange-400"
        title="좌석 배치"
        description="학급 좌석의 행과 열 수를 설정합니다."
      >
        <div className="flex items-center justify-between gap-8">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-sp-muted">행 수 (Rows)</label>
            <NumberStepper value={draft.seatingRows} onChange={(v) => patch({ seatingRows: v })} />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-sp-muted">열 수 (Columns)</label>
            <NumberStepper value={draft.seatingCols} onChange={(v) => patch({ seatingCols: v })} />
          </div>
        </div>
      </SettingsSection>

      <SeatRelationSection />
    </div>
  );
}
