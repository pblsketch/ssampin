import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { MultiSurveyResultData, ToolResult } from '@domain/entities/ToolResult';
import { useToastStore } from '@adapters/components/common/Toast';
import { sanitizeFileName } from '@domain/rules/toolResultSerialization';
import {
  exportMultiSurveyDataToExcel,
  exportToolResultToExcel,
} from '@infrastructure/export/ExcelExporter';
import { SummaryTab } from './SummaryTab';
import { TableTab } from './TableTab';
import { IndividualTab } from './IndividualTab';

export type SpreadsheetSource =
  | { mode: 'inline'; data: MultiSurveyResultData }
  | { mode: 'modal'; result: ToolResult };

interface SpreadsheetViewProps {
  source: SpreadsheetSource;
  /** modal 모드 전용 닫기 콜백 */
  onClose?: () => void;
  /** inline 모드 전용 하단 액션 슬롯 (저장 버튼, "새 설문" 등) */
  inlineFooter?: React.ReactNode;
}

type ActiveTab = 'summary' | 'table' | 'individual';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'summary', label: '요약' },
  { key: 'table', label: '테이블' },
  { key: 'individual', label: '개별' },
];

export function SpreadsheetView({ source, onClose, inlineFooter }: SpreadsheetViewProps) {
  const showToast = useToastStore((s) => s.show);

  // source 타입에 관계없이 MultiSurveyResultData로 정규화
  const data = useMemo<MultiSurveyResultData | null>(() => {
    if (source.mode === 'inline') return source.data;
    if (source.result.data.type === 'multi-survey') {
      return source.result.data;
    }
    return null;
  }, [source]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const [anonymous, setAnonymous] = useState<boolean>(true);
  const [individualIndex, setIndividualIndex] = useState<number>(0);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  const handleExport = useCallback(async () => {
    if (!data) return;
    try {
      const buffer =
        source.mode === 'inline'
          ? await exportMultiSurveyDataToExcel(data, { anonymous })
          : await exportToolResultToExcel(source.result, { anonymous });

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFileName(data.title)}_응답모음_${format(new Date(), 'yyyyMMdd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('엑셀 파일을 다운로드했어요', 'success');
    } catch (err) {
      console.error('Excel export failed', err);
      showToast('엑셀 생성에 실패했어요. 다시 시도해주세요.', 'error');
    }
  }, [data, source, anonymous, showToast]);

  if (!data) {
    return (
      <div className="p-6 text-sp-muted">
        멀티 설문 결과가 아닙니다.
      </div>
    );
  }

  const isEmpty = data.submissions.length === 0;

  const body = (
    <div className="flex h-full flex-col bg-sp-bg">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-3 border-b border-sp-border bg-sp-card px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-sp-text">
            {data.title || '설문 결과'}
          </h2>
          <p className="mt-0.5 text-xs text-sp-muted">
            총 참여: <span className="text-sp-text">{data.submissions.length}명</span>
            {' · '}
            질문 {data.questions.length}개
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnonymousToggle
            value={anonymous}
            onChange={setAnonymous}
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={isEmpty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm font-medium text-sp-text transition hover:border-sp-highlight hover:text-sp-highlight disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="엑셀 다운로드"
          >
            <span aria-hidden>⬇</span>
            <span>엑셀</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-muted transition hover:text-sp-text"
            >
              닫기
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-sp-border bg-sp-card px-5">
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-sp-accent text-sp-accent'
                  : 'border-transparent text-sp-muted hover:text-sp-text'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isEmpty ? (
          <EmptyState />
        ) : activeTab === 'summary' ? (
          <SummaryTab data={data} />
        ) : activeTab === 'table' ? (
          <TableTab data={data} />
        ) : (
          <IndividualTab
            data={data}
            index={individualIndex}
            onIndexChange={setIndividualIndex}
          />
        )}
      </div>

      {/* 하단 액션 슬롯 (inline 모드 전용) */}
      {source.mode === 'inline' && inlineFooter && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-sp-border bg-sp-card px-5 py-3">
          {inlineFooter}
        </div>
      )}
    </div>
  );

  if (source.mode === 'modal') {
    // Portal to document.body — 상위 컨테이너에 `transform`이 있으면 `fixed`가
    // viewport가 아닌 그 조상의 containing block 기준으로 고정되어 잘림. 예: ToolLayout 아래에서 호출 시.
    return createPortal(
      <div
        className="fixed inset-0 z-sp-palette flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-sp-border bg-sp-bg shadow-2xl">
          {body}
        </div>
      </div>,
      document.body,
    );
  }

  return <div className="h-full">{body}</div>;
}

/* ── 내부 컴포넌트 ── */

function AnonymousToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="inline-flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-muted transition hover:text-sp-text"
      aria-pressed={value}
      title="익명 모드: ON이면 응답자를 제출 순서로만 표시"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          value ? 'bg-sp-highlight' : 'bg-sp-border'
        }`}
        aria-hidden
      />
      <span>익명 {value ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center text-sp-muted">
      <span className="text-4xl" aria-hidden>
        📭
      </span>
      <p className="text-sm">아직 응답이 없어요</p>
      <p className="text-xs">학생들이 응답을 제출하면 이곳에 결과가 모여요</p>
    </div>
  );
}
