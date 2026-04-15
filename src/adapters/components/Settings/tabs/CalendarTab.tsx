import { useState } from 'react';
import type { Settings } from '@domain/entities/Settings';
import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';
import { COLOR_MAP, colorDot, DEFAULT_CAT_IDS } from '../shared/constants';
import { NeisScheduleSection } from '../NeisScheduleSection';
import { NeisTimetableAutoSyncSection } from '../NeisTimetableAutoSyncSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function CalendarTab({ draft, patch }: Props) {
  const { categories, addCategory, deleteCategory } = useEventsStore();
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>('blue');

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim(), newCatColor);
    setNewCatName('');
    setNewCatColor('blue');
    setShowCatForm(false);
  };

  return (
    <div>
      {/* 대시보드 일정 위젯 */}
      <SettingsSection
        icon="date_range"
        iconColor="bg-blue-500/10 text-blue-400"
        title="대시보드 일정 위젯"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-sp-text">일정 표시 기간</p>
              <p className="text-xs text-sp-muted">대시보드 &quot;다가오는 일정&quot;에 표시할 범위</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={draft.eventWidgetRangeDays ?? 14}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(365, Number(e.target.value) || 14));
                  patch({ eventWidgetRangeDays: val });
                }}
                className="w-16 bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
              />
              <span className="text-xs text-sp-muted">일</span>
            </div>
          </div>
          <p className="text-xs text-sp-muted">
            D-Day로 설정한 일정은 기간에 관계없이 항상 표시됩니다
          </p>
        </div>
      </SettingsSection>

      {/* 행사 알림 설정 */}
      <SettingsSection
        icon="notifications"
        iconColor="bg-amber-500/10 text-amber-400"
        title="행사 알림"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">행사 알림 팝업</span>
            <span className="text-xs text-sp-muted">앱 실행 시 오늘/다가오는 행사를 알림으로 표시합니다.</span>
          </div>
          <Toggle
            checked={draft.eventAlertEnabled !== false}
            onChange={(v) => patch({ eventAlertEnabled: v })}
          />
        </div>
      </SettingsSection>

      {/* 일정 카테고리 관리 */}
      <SettingsSection
        icon="category"
        iconColor="bg-pink-500/10 text-pink-400"
        title="일정 카테고리 관리"
        actions={
          <button
            type="button"
            onClick={() => setShowCatForm(true)}
            className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-icon">add</span>
            카테고리 추가
          </button>
        }
      >
        <div className="space-y-2">
          {categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              isDefault={DEFAULT_CAT_IDS.has(cat.id)}
              onDelete={() => deleteCategory(cat.id)}
            />
          ))}

          {showCatForm && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-sp-surface border border-sp-border">
              <div className="flex gap-1.5">
                {CATEGORY_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className={`w-5 h-5 rounded-full ${COLOR_MAP[c]?.bg ?? 'bg-slate-400'} ${newCatColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card' : ''
                      }`}
                  />
                ))}
              </div>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="카테고리 이름"
                className="flex-1 bg-transparent text-sm text-sp-text placeholder-sp-muted focus:outline-none border-none p-0"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="text-sp-accent hover:text-blue-400 text-xs font-medium"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => { setShowCatForm(false); setNewCatName(''); }}
                className="text-sp-muted hover:text-sp-text text-xs"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* 외부 연동 */}
      {(draft.schoolLevel !== 'custom' || true) && (
        <div className="mt-2 mb-2">
          <div className="flex items-center gap-3 mb-4 pt-4 border-t border-sp-border">
            <span className="material-symbols-outlined text-sp-muted text-base">link</span>
            <span className="text-xs font-semibold text-sp-muted tracking-widest uppercase">외부 연동</span>
          </div>
        </div>
      )}

      {/* NEIS 학사일정 + 시간표 — custom(직접 설정)일 때 숨김 */}
      {draft.schoolLevel !== 'custom' && (
        <>
          <NeisScheduleSection />
          <NeisTimetableAutoSyncSection />
        </>
      )}

      {/* 구글 캘린더 연동 안내 — 실제 설정은 Google 연동 탭에서 */}
      <SettingsSection
        icon="calendar_month"
        iconColor="bg-green-500/10 text-green-400"
        title="구글 캘린더 연동"
      >
        <p className="text-sm text-sp-muted">
          구글 캘린더 양방향 동기화는 <span className="text-sp-text font-medium">설정 › Google 연동</span> 탭에서 관리합니다.
        </p>
      </SettingsSection>
    </div>
  );
}

function CategoryRow({
  category,
  isDefault,
  onDelete,
}: {
  category: CategoryItem;
  isDefault: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-sp-surface/80 hover:bg-sp-surface transition-colors group border border-transparent hover:border-sp-border">
      <div className="flex items-center gap-3">
        <div className={colorDot(category.color)} />
        <span className="text-sm font-medium text-sp-text">{category.name}</span>
        {isDefault && (
          <span className="text-caption text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">기본</span>
        )}
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={onDelete}
          className="text-sp-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-icon-md">delete</span>
        </button>
      )}
    </div>
  );
}
