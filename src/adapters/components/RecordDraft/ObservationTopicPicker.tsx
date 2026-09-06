import { useMemo, useState } from 'react';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { ObservationTopicCreateDialog } from '@adapters/components/RecordDraft/ObservationTopicCreateDialog';

/**
 * 고른 주제. 새 주제는 **이름만** 들고 있는다.
 *
 * 확정 전에는 저장소에 아무것도 쓰지 않는다(계획 §4.2 "확정 전에는 저장소 쓰기 0회").
 * 실제 주제 생성은 기록이 저장되고 근거가 확보된 뒤 연결 단계에서 일어난다(계획 §5.1-7).
 * 여기서 미리 만들면 저장을 취소했을 때 빈 주제가 남는다.
 */
export type TopicSelection =
  | { readonly kind: 'existing'; readonly threadId: string }
  | { readonly kind: 'new'; readonly title: string };

interface ObservationTopicPickerProps {
  /** 담임 = Student.id, 교과 = 'tc:{classId}:{studentKey}'. null 이면 학생 미선택. */
  readonly studentRef: string | null;
  /** 현재 입력 중인 본문. 비어 있으면 선택기를 비활성화한다. */
  readonly content: string;
  /** 여러 학생이거나 여러 날짜면 true. 선택 UI 자체를 그리지 않는다. */
  readonly multiTarget: boolean;
  readonly selected: TopicSelection | null;
  readonly onSelect: (next: TopicSelection | null) => void;
}

/** 목록이 길어지면 화면을 다 먹는다. 처음엔 이만큼만 보이고 나머지는 [더 보기]로 편다. */
const VISIBLE_LIMIT = 8;

const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors max-w-[10rem] truncate';

/**
 * 저장 전에 "이 기록을 이어 쓰는 주제가 있는지" 한 번 묻는 보조 입력(계획 §4.2).
 *
 * 이 컴포넌트는 **고르기만** 한다. 저장·연결·닫힌 주제 재검사는 저장 관문의 몫이다.
 * 고른 값의 주인은 부모 폼이다(제어 컴포넌트) - 학생을 바꿀 때 선택을 지우는 것도 부모 책임이다.
 */
export function ObservationTopicPicker({
  studentRef,
  content,
  multiTarget,
  selected,
  onSelect,
}: ObservationTopicPickerProps) {
  const loaded = useInquiryThreadStore((s) => s.loaded);
  const loadError = useInquiryThreadStore((s) => s.loadError);
  const records = useInquiryThreadStore((s) => s.records);
  const load = useInquiryThreadStore((s) => s.load);
  const update = useInquiryThreadStore((s) => s.update);

  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      studentRef === null
        ? []
        : records
            .filter((t) => t.studentRef === studentRef)
            // 최근 수정 순 - 방금까지 쓰던 주제가 맨 앞에 온다.
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt),
    [records, studentRef],
  );
  const openThreads = useMemo(() => mine.filter((t) => t.status === 'open'), [mine]);
  const closedThreads = useMemo(() => mine.filter((t) => t.status !== 'open'), [mine]);

  const hasContent = content.trim().length > 0;
  const visible = expanded ? openThreads : openThreads.slice(0, VISIBLE_LIMIT);

  // 여러 학생·여러 날짜는 주제 연결 대상이 아니다. 저장 뒤 학생별 보드에서 묶는다.
  if (multiTarget) {
    return (
      <div className="rounded-lg border border-sp-border bg-sp-surface/40 p-2.5">
        <p className="text-xs text-sp-muted/70">
          여러 학생·날짜 기록은 저장 후 학생별 근거 보드에서 묶어 주세요
        </p>
      </div>
    );
  }

  const headerText = hasContent
    ? '주제 연결(선택) · 나중에 근거 보드에서 묶어도 돼요'
    : '내용을 적으면 주제에 연결할 수 있어요';

  return (
    <div
      aria-label="주제 연결 선택"
      className="space-y-1.5 rounded-lg border border-sp-border bg-sp-surface/40 p-2.5"
    >
      <p className="text-xs text-sp-muted">{headerText}</p>

      {!hasContent ? null : studentRef === null ? (
        <p className="text-xs text-sp-muted/70">학생을 먼저 선택하세요</p>
      ) : loadError !== null ? (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <span>주제를 불러오지 못했습니다</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            aria-label="주제 목록 다시 불러오기"
            onClick={() => void load(true)}
            className="font-medium text-sp-accent hover:underline"
          >
            다시 시도
          </button>
        </div>
      ) : !loaded ? (
        <div className="flex gap-1.5" aria-label="불러오는 중">
          <span className="h-6 w-24 animate-pulse rounded-full bg-sp-surface" />
          <span className="h-6 w-16 animate-pulse rounded-full bg-sp-surface" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {visible.map((t) => {
              const isSelected = selected?.kind === 'existing' && selected.threadId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={t.title}
                  onClick={() => onSelect(isSelected ? null : { kind: 'existing', threadId: t.id })}
                  className={`${CHIP_BASE} ${
                    isSelected
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-card text-sp-text ring-1 ring-sp-border hover:bg-sp-surface'
                  }`}
                >
                  {t.title}
                </button>
              );
            })}

            {openThreads.length > VISIBLE_LIMIT && !expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-xs font-medium text-sp-accent hover:underline"
              >
                더 보기 ({openThreads.length - VISIBLE_LIMIT})
              </button>
            )}

            {/* 새 주제는 보조 항목이다. 주가 아니라 부라서 점선·옅은 톤으로 둔다. */}
            <button
              type="button"
              aria-label="새 주제 만들기"
              onClick={() => setDialogOpen(true)}
              className={`${
                selected?.kind === 'new'
                  ? 'bg-sp-accent text-white border-sp-accent'
                  : 'border-dashed border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-accent'
              } inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors`}
            >
              {selected?.kind === 'new' ? `새 주제: ${selected.title}` : '새 주제 만들기'}
            </button>
          </div>

          {selected !== null && (
            <p className="text-xs text-sp-muted/70">생기부 영역은 근거 보드에서 고를 수 있어요</p>
          )}

          {closedThreads.length > 0 && (
            <button
              type="button"
              aria-pressed={showClosed}
              aria-label="마친 주제 포함해서 보기"
              onClick={() => setShowClosed((v) => !v)}
              className="text-xs text-sp-muted hover:text-sp-text"
            >
              마친 주제 포함 {showClosed ? '숨기기' : '보기'}
            </button>
          )}

          {showClosed && closedThreads.length > 0 && (
            <div className="space-y-1 border-t border-sp-border pt-1.5">
              {closedThreads.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-sp-card px-2 py-0.5 text-xs font-semibold text-sp-muted ring-1 ring-sp-border">
                    마친 주제
                  </span>
                  <span className="max-w-[10rem] truncate text-xs text-sp-muted" title={t.title}>
                    {t.title}
                  </span>
                  {/* 마친 주제는 바로 연결하지 않는다. 다시 열기가 저장에 성공한 뒤에만 잇는다. */}
                  <button
                    type="button"
                    disabled={reopeningId === t.id}
                    aria-label={`${t.title} 주제를 다시 열고 연결`}
                    onClick={() => {
                      setReopenError(null);
                      setReopeningId(t.id);
                      void update(t.id, { status: 'open' })
                        .then(() => {
                          onSelect({ kind: 'existing', threadId: t.id });
                        })
                        .catch(() => {
                          setReopenError(t.id);
                        })
                        .finally(() => {
                          setReopeningId(null);
                        });
                    }}
                    className="text-xs font-medium text-sp-accent hover:underline disabled:opacity-50"
                  >
                    {reopeningId === t.id ? '다시 여는 중' : '주제를 다시 열고 연결'}
                  </button>
                  {reopenError === t.id && (
                    <span className="text-xs text-red-400">다시 열지 못했습니다</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {dialogOpen && studentRef !== null && (
        <ObservationTopicCreateDialog
          openThreads={openThreads}
          onCancel={() => setDialogOpen(false)}
          onPickExisting={(threadId) => {
            onSelect({ kind: 'existing', threadId });
            setDialogOpen(false);
          }}
          onCreate={(title) => {
            onSelect({ kind: 'new', title });
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
