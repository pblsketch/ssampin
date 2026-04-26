import { useState, useCallback, useEffect } from 'react';
import type { ToolResult, ToolResultType, PollResultData, SurveyResultData, MultiSurveyResultData, WordCloudResultData, RealtimeWallResultData } from '@domain/entities/ToolResult';
import { useToolResultStore } from '@adapters/stores/useToolResultStore';
import { SpreadsheetView } from '../Results/SpreadsheetView';
import { REALTIME_WALL_LAYOUT_LABELS } from '../RealtimeWall/realtimeWallHelpers';

interface PastResultsViewProps {
  toolType: ToolResultType;
  onClose: () => void;
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

function getSummary(result: ToolResult): string {
  const d = result.data;
  switch (d.type) {
    case 'poll':
      return `${d.totalVotes}표`;
    case 'survey':
      return `${d.responses.length}개 응답`;
    case 'multi-survey':
      return `${d.submissions.length}명 응답`;
    case 'wordcloud':
      return `${d.words.length}개 단어`;
    case 'valueline-discussion':
    case 'trafficlight-discussion':
      return `${d.rounds.length}라운드`;
    case 'realtime-wall': {
      const approved = d.posts.filter((post) => post.status === 'approved').length;
      const layout = REALTIME_WALL_LAYOUT_LABELS[d.layoutMode];
      return `${approved}개 게시 · ${layout}`;
    }
    default:
      return '';
  }
}

function PollDetail({ data }: { data: PollResultData }) {
  const maxVotes = Math.max(...data.options.map((o) => o.votes), 1);
  return (
    <div className="space-y-2">
      <p className="text-sm text-sp-muted">{data.question}</p>
      {data.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-sp-text w-24 truncate">{opt.text}</span>
          <div className="flex-1 h-5 rounded bg-sp-surface overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${(opt.votes / maxVotes) * 100}%`,
                backgroundColor: opt.color,
              }}
            />
          </div>
          <span className="text-xs text-sp-muted w-8 text-right">{opt.votes}</span>
        </div>
      ))}
    </div>
  );
}

function SurveyDetail({ data }: { data: SurveyResultData }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-sp-muted">{data.question}</p>
      {data.responses.length === 0 ? (
        <p className="text-xs text-sp-muted">응답 없음</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {data.responses.map((r, i) => (
            <li key={i} className="text-sm text-sp-text bg-sp-surface rounded px-2 py-1">
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MultiSurveyDetail({
  data,
  onOpenSpreadsheet,
}: {
  data: MultiSurveyResultData;
  onOpenSpreadsheet: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-sp-muted truncate">{data.title}</p>
          <p className="text-xs text-sp-muted">{data.questions.length}개 문항 · {data.submissions.length}명 응답</p>
        </div>
        <button
          onClick={onOpenSpreadsheet}
          className="shrink-0 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs font-medium text-sp-text transition hover:border-sp-accent hover:text-sp-accent"
        >
          📊 스프레드시트로 열기
        </button>
      </div>
      {data.questions.map((q) => (
        <div key={q.id} className="bg-sp-surface rounded px-2 py-1.5">
          <p className="text-xs font-medium text-sp-text">{q.question}</p>
          <p className="text-xs text-sp-muted">
            {data.submissions.filter((s) =>
              s.answers.some((a) => a.questionId === q.id),
            ).length}개 응답
          </p>
        </div>
      ))}
    </div>
  );
}

function RealtimeWallDetail({ data }: { data: RealtimeWallResultData }) {
  const approved = data.posts.filter((post) => post.status === 'approved');
  const pinned = approved.filter((post) => post.pinned).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-sp-muted">
        <span className="rounded-full bg-sp-surface px-2 py-0.5">
          {REALTIME_WALL_LAYOUT_LABELS[data.layoutMode]}
        </span>
        <span className="rounded-full bg-sp-surface px-2 py-0.5">승인 {approved.length}</span>
        {pinned > 0 && (
          <span className="rounded-full bg-sp-surface px-2 py-0.5">고정 {pinned}</span>
        )}
      </div>
      {approved.length === 0 ? (
        <p className="text-xs text-sp-muted">승인된 카드가 없습니다</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {approved.slice(0, 20).map((post) => (
            <li
              key={post.id}
              className="rounded bg-sp-surface px-2 py-1 text-sm text-sp-text"
            >
              <div className="flex items-center gap-1.5">
                {post.pinned && <span className="text-detail text-amber-300">📌</span>}
                <span className="text-xs font-bold text-sp-muted">{post.nickname}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-xs">
                {post.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {approved.length > 20 && (
        <p className="text-detail text-sp-muted">…외 {approved.length - 20}개</p>
      )}
    </div>
  );
}

function WordCloudDetail({ data }: { data: WordCloudResultData }) {
  const sorted = [...data.words].sort((a, b) => b.count - a.count).slice(0, 20);
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-sp-muted">{data.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((w, i) => (
          <span
            key={i}
            className="inline-block rounded-full bg-sp-surface px-2.5 py-0.5 text-xs text-sp-text"
          >
            {w.word} ({w.count})
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultDetail({
  result,
  onOpenSpreadsheet,
}: {
  result: ToolResult;
  onOpenSpreadsheet: (r: ToolResult) => void;
}) {
  const d = result.data;
  switch (d.type) {
    case 'poll':
      return <PollDetail data={d} />;
    case 'survey':
      return <SurveyDetail data={d} />;
    case 'multi-survey':
      return <MultiSurveyDetail data={d} onOpenSpreadsheet={() => onOpenSpreadsheet(result)} />;
    case 'wordcloud':
      return <WordCloudDetail data={d} />;
    case 'realtime-wall':
      return <RealtimeWallDetail data={d} />;
    case 'valueline-discussion':
    case 'trafficlight-discussion':
      // 토론형 결과는 전용 Detail 컴포넌트가 아직 없음. 메타 요약만 getSummary에서 처리 중.
      // 별 브랜치에서 ValuelineDiscussionDetail/TrafficLightDiscussionDetail 추가 예정.
      return null;
    default: {
      const _exhaustive: never = d;
      throw new Error(`Unknown tool result type: ${String((_exhaustive as { type?: string }).type)}`);
    }
  }
}

export function PastResultsView({ toolType, onClose }: PastResultsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [spreadsheetResult, setSpreadsheetResult] = useState<ToolResult | null>(null);
  const { load, getByType, deleteResult } = useToolResultStore();

  useEffect(() => {
    load();
  }, [load]);

  const results = getByType(toolType).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (window.confirm(`"${name}" 결과를 삭제하시겠습니까?`)) {
        await deleteResult(id);
        if (expandedId === id) setExpandedId(null);
      }
    },
    [deleteResult, expandedId],
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-sp-text">📊 지난 결과</h2>
        <button
          onClick={onClose}
          className="text-sp-muted hover:text-sp-text transition-colors text-lg"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {results.length === 0 ? (
        <p className="text-center text-sm text-sp-muted py-12">저장된 결과가 없습니다</p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className="rounded-xl bg-sp-surface border border-sp-border overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => handleToggle(r.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <span className="block text-sm font-medium text-sp-text truncate">
                    {r.name}
                  </span>
                  <span className="text-xs text-sp-muted">
                    {formatRelativeDate(r.savedAt)} · {getSummary(r)}
                  </span>
                </button>
                <button
                  onClick={() => handleDelete(r.id, r.name)}
                  className="shrink-0 ml-2 text-sp-muted hover:text-red-400 transition-colors"
                  title="삭제"
                >
                  🗑️
                </button>
              </div>

              {expandedId === r.id && (
                <div className="px-4 pb-4 border-t border-sp-border pt-3">
                  <ResultDetail result={r} onOpenSpreadsheet={setSpreadsheetResult} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {spreadsheetResult && (
        <SpreadsheetView
          source={{ mode: 'modal', result: spreadsheetResult }}
          onClose={() => setSpreadsheetResult(null)}
        />
      )}
    </div>
  );
}
