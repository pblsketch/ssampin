import { useMemo, useState } from 'react';
import { SeatPickerToolSettings } from './tools/SeatPickerToolSettings';
import { useSeatPickerConfigStore } from '@adapters/stores/useSeatPickerConfigStore';

/**
 * 설정 > 도구
 *
 * 좌측 도구 리스트 + 우측 해당 도구의 설정 패널.
 * 앞으로 타이머/이름뽑기 등 도구가 추가되면 이 파일 안 TOOL_ITEMS에 항목만 추가하면 된다.
 */

type ToolId = 'seat-picker';

interface ToolItem {
  id: ToolId;
  icon: string;
  label: string;
  description: string;
}

const TOOL_ITEMS: ToolItem[] = [
  {
    id: 'seat-picker',
    icon: '🪑',
    label: '자리 뽑기',
    description: '비공개 사전 배정 관리',
  },
];

export function ToolsTab() {
  const [activeTool, setActiveTool] = useState<ToolId>('seat-picker');
  const spcConfig = useSeatPickerConfigStore((s) => s.config);

  const counts = useMemo<Record<ToolId, number>>(() => ({
    'seat-picker': spcConfig.privateAssignments.length,
  }), [spcConfig]);

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
      <div className="flex flex-col md:flex-row min-h-[520px]">
        {/* Tool list */}
        <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-sp-border bg-sp-surface/30">
          <div className="px-3 py-3">
            <p className="text-caption font-semibold text-sp-muted/70 uppercase tracking-widest px-2 mb-2">
              도구 설정
            </p>
            <div role="tablist" className="space-y-0.5">
              {TOOL_ITEMS.map((t) => {
                const active = activeTool === t.id;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTool(t.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                      active
                        ? 'bg-sp-accent/10 text-sp-accent ring-1 ring-sp-accent/20'
                        : 'text-sp-muted hover:bg-sp-text/5 hover:text-sp-text'
                    }`}
                  >
                    <span className="text-base leading-none w-5 text-center">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${active ? 'text-sp-accent' : ''}`}>
                        {t.label}
                      </p>
                      <p className="text-caption text-sp-muted/80 truncate leading-tight">
                        {t.description}
                      </p>
                    </div>
                    {count > 0 && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-purple-500/20 text-purple-300 text-caption font-semibold">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Tool detail */}
        <main className="flex-1 min-w-0 p-6">
          {activeTool === 'seat-picker' && <SeatPickerToolSettings />}
        </main>
      </div>
    </section>
  );
}
