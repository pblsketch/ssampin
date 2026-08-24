import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { PiiText } from './PiiText';
import type { CoolImportItem, CoolImportTarget, CoolMessage } from '@domain/entities/CoolMessage';
import { extractCoolEvents, stripCoolDateExpressions } from '@domain/rules/coolMessageDateParser';
import { detectCoolPii, maskCoolPii } from '@domain/privacy/coolMessagePii';
import { importKey } from '@domain/rules/coolImportHistory';

/**
 * 쿨메신저 쪽지에서 일정·할일을 골라 등록하는 화면.
 *
 * ## 흐름
 * 왼쪽에서 쪽지를 고르면 → 오른쪽에 날짜 후보가 뜨고 → 확인·수정한 뒤 → 등록.
 *
 * ## 쪽지함을 직접 읽지 않는다
 * 파일 접근은 Electron 본체 몫이라, 읽는 함수를 **밖에서 주입받는다**(`loadMessages`).
 * 덕분에 쿨메신저 없이도 이 화면을 테스트할 수 있다.
 */

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDay(d: Date): string {
  // ★올해가 아니면 연도를 함께 보여준다 (2026-08-24 UltraQA) — 연말 쪽지의 "1월 10일"은
  //   이듬해로 해석되는데, 연도가 안 보이면 판단 근거가 사람 눈앞에 없다.
  const yearPrefix = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `;
  return `${yearPrefix}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABEL[d.getDay()]})`;
}

function formatClock(d: Date): string {
  const h = d.getHours();
  const meridiem = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${meridiem} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 받은 시각을 목록에 짧게 — 오늘이면 시각만, 아니면 날짜만 */
function formatReceived(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? formatClock(d) : `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 이 후보를 어디에 넣을지 — **선생님이 직접 고른다.**
 *
 * 프로그램이 미리 정해 두지 않는다. "까지/제출" 같은 말이 붙었다고 할일로 단정하면,
 * 회의를 할일로 넣거나 그 반대가 되는 일이 생긴다. 기계는 날짜만 찾아 주고
 * 어디에 넣을지는 사람이 정한다.
 */
type CandidateChoice = 'none' | 'event' | 'todo' | 'both';

/** 화면에서 편집 중인 후보 한 줄 */
interface CandidateRow {
  readonly id: string;
  /** 기본은 'none' — 고르지 않으면 등록되지 않는다 */
  readonly choice: CandidateChoice;
  readonly title: string;
  readonly editing: boolean;
  readonly start: Date;
  readonly end: Date | null;
  readonly allDay: boolean;
}

/** 고른 값 하나가 실제 등록 몇 건이 되는지 ('둘 다'는 일정 1 + 할일 1) */
function targetsOf(choice: CandidateChoice): readonly CoolImportTarget[] {
  if (choice === 'event') return ['event'];
  if (choice === 'todo') return ['todo'];
  if (choice === 'both') return ['event', 'todo'];
  return [];
}

export interface CoolImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** 최근 쪽지 목록 (Electron IPC를 주입) */
  readonly loadMessages: () => Promise<readonly CoolMessage[]>;
  /** 쪽지 전문 (목록은 본문을 앞부분만 갖고 있다) */
  readonly loadMessage: (key: number) => Promise<CoolMessage | null>;
  /** 이름 대조용 명렬 — 학생 명렬 + 쿨메신저 교직원 명단 */
  readonly roster?: ReadonlySet<string>;
  readonly onSubmit: (items: readonly CoolImportItem[]) => void | Promise<void>;
  /** 이미 가져온 항목인지 (`importKey` 로 만든 열쇠). 없으면 표시하지 않는다. */
  readonly isImported?: (key: string) => boolean;
  /** 이 쪽지에서 무언가 가져간 적이 있는지 — 목록 '가져옴' 배지 */
  readonly hasImportedFrom?: (messageKey: number) => boolean;
}

export function CoolImportModal({
  isOpen,
  onClose,
  loadMessages,
  loadMessage,
  roster,
  onSubmit,
  isImported,
  hasImportedFrom,
}: CoolImportModalProps) {
  const [messages, setMessages] = useState<readonly CoolMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [detail, setDetail] = useState<CoolMessage | null>(null);
  /** 쪽지 열기 실패 사유 — null 과 구분해야 "여는 중…"에 영원히 멈추지 않는다 */
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly CandidateRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);

  // ── 쪽지 목록 ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setMessages(null);
    setLoadError(null);
    setSelectedKey(null);
    setDetail(null);
    setRows([]);
    loadMessages()
      .then((list) => {
        if (alive) setMessages(list);
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(err instanceof Error ? err.message : '쪽지함을 읽지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [isOpen, loadMessages]);

  // ── 고른 쪽지의 날짜 후보 만들기 ────────────────────────────
  useEffect(() => {
    if (selectedKey === null) return;
    let alive = true;
    setDetail(null);
    setDetailError(null);
    setRows([]);
    loadMessage(selectedKey)
      .then((msg) => {
        if (!alive) return;
        // ★null(쪽지 없음)도 실패의 한 형태다 — 그대로 두면 "여는 중…"에 영원히 멈춘다.
        //   쿨메신저에서 그 사이 지운 쪽지를 클릭한 경우가 여기다 (2026-08-24 UltraQA).
        if (!msg) {
          setDetailError('쪽지를 열지 못했습니다. 쿨메신저에서 지워졌을 수 있어요.');
          return;
        }
        setDetail(msg);
        // 기준일은 오늘이 아니라 **쪽지를 받은 날**이다. 지난 쪽지의 "내일"이 밀리지 않게.
        const base = new Date(msg.receivedAt);
        const haystack = `${msg.title}\n${msg.body}`;
        const fallbackTitle = stripCoolDateExpressions(msg.title, base) || msg.title;
        setRows(
          extractCoolEvents(haystack, base).map((ev, i) => ({
            id: `${msg.key}-${i}`,
            // ★ 미리 고르지 않는다 — 어디에 넣을지는 선생님이 정한다
            choice: 'none' as CandidateChoice,
            title: fallbackTitle,
            editing: false,
            start: ev.start,
            end: ev.end,
            allDay: ev.allDay,
          })),
        );
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setDetail(null);
        setDetailError(
          err instanceof Error && err.message
            ? err.message
            : '쪽지를 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
        );
      });
    return () => {
      alive = false;
    };
  }, [selectedKey, loadMessage]);

  const patchRow = useCallback((id: string, patch: Partial<CandidateRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /** 실제로 등록될 항목들 — '둘 다'는 일정·할일 두 건이 된다 */
  const pending: readonly CoolImportItem[] =
    selectedKey === null
      ? []
      : rows.flatMap((r) =>
          targetsOf(r.choice).map((target) => ({
            sourceMessageKey: selectedKey,
            title: r.title.trim() || '제목 없음',
            start: r.start,
            end: r.end,
            allDay: r.allDay,
            target,
          })),
        );

  const handleSubmit = async () => {
    if (pending.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(pending);
      onClose();
    } catch (err: unknown) {
      // ★ 저장이 실패했는데 조용히 닫으면 선생님은 등록된 줄 알고 넘어간다.
      //   모달을 열어 둔 채로 이유를 보여주고, 다시 누를 수 있게 한다.
      setSubmitError(err instanceof Error ? err.message : '알 수 없는 이유로 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="쿨메신저에서 가져오기"
      srOnlyTitle
      size="xl"
      initialFocusRef={listRef}
      panelClassName="flex flex-col max-h-[calc(100vh-96px)]"
    >
      {/* 머리말 */}
      <header className="flex items-center gap-3 px-5 py-4 border-b border-sp-border">
        <span className="material-symbols-outlined text-sp-accent">forward_to_inbox</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sp-text">쿨메신저에서 가져오기</h2>
          <p className="text-xs text-sp-muted mt-0.5">
            쪽지를 고르면 날짜를 찾아 드립니다. 확인 후 등록하세요.
          </p>
        </div>
        <IconButton icon="close" label="닫기" onClick={onClose} />
      </header>

      {/* 본문 — 좌: 쪽지 목록 / 우: 후보 */}
      <div className="grid grid-cols-[300px_1fr] flex-1 min-h-0">
        {/* 왼쪽 */}
        <div
          ref={listRef}
          tabIndex={-1}
          className="border-r border-sp-border overflow-y-auto min-h-0 outline-none"
        >
          {loadError !== null ? (
            <ErrorPanel message={loadError} />
          ) : messages === null ? (
            <p className="p-5 text-sm text-sp-muted">쪽지함을 읽는 중…</p>
          ) : messages.length === 0 ? (
            <EmptyPanel />
          ) : (
            <ul>
              {messages.map((m) => {
                const active = m.key === selectedKey;
                return (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(m.key)}
                      aria-current={active}
                      className={[
                        'w-full text-left px-4 py-3 border-b border-sp-border',
                        'transition-colors duration-sp-base ease-sp-out',
                        'border-l-2',
                        active
                          ? 'bg-sp-surface border-l-sp-accent'
                          : 'border-l-transparent hover:bg-sp-surface',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {m.isUnread && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-sp-accent shrink-0"
                            aria-label="안읽음"
                          />
                        )}
                        <span className="text-xs text-sp-muted truncate">{m.sender}</span>
                        {hasImportedFrom?.(m.key) && (
                          <span className="px-1.5 py-0.5 rounded text-[0.65rem] bg-sp-surface text-sp-muted border border-sp-border shrink-0">
                            가져옴
                          </span>
                        )}
                        <span className="text-xs text-sp-muted ml-auto shrink-0">
                          {formatReceived(m.receivedAt, now)}
                        </span>
                      </div>
                      <p
                        className={`text-sm truncate ${
                          m.isUnread ? 'font-bold text-sp-text' : 'text-sp-text'
                        }`}
                      >
                        {m.title || '(제목 없음)'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 오른쪽 */}
        <div className="overflow-y-auto min-h-0 p-5">
          {selectedKey === null ? (
            <Hint />
          ) : detailError !== null ? (
            <div className="rounded-lg border border-sp-border bg-sp-surface p-3">
              <p className="text-sm text-sp-error">{detailError}</p>
              <p className="mt-1 text-xs text-sp-muted">다른 쪽지를 골라 계속하실 수 있어요.</p>
            </div>
          ) : detail === null ? (
            <p className="text-sm text-sp-muted">쪽지를 여는 중…</p>
          ) : (
            <>
              <MessagePreview message={detail} roster={roster} />
              {rows.length === 0 ? (
                <NoDateFound />
              ) : (
                <ul className="space-y-3 mt-4">
                  {rows.map((row, i) => (
                    <li
                      key={row.id}
                      className="animate-fade-in"
                      // 지연은 8칸까지만 누적 — 날짜 50개짜리 쪽지에서 마지막 카드가
                      // 3초 뒤에 나타나면 그동안 화면이 비어 보인다
                      style={{
                        animationDelay: `${Math.min(i, 8) * 60}ms`,
                        animationFillMode: 'backwards',
                      }}
                    >
                      <CandidateCard
                        row={row}
                        roster={roster}
                        messageKey={selectedKey}
                        isImported={isImported}
                        onPatch={(patch) => patchRow(row.id, patch)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* 꼬리말 */}
      <footer className="flex items-center gap-3 px-5 py-3 border-t border-sp-border">
        {submitError !== null ? (
          <p className="text-xs text-sp-error flex-1" role="alert">
            등록하지 못했습니다 — {submitError}
          </p>
        ) : (
          <p className="text-xs text-sp-muted flex-1">
            {pending.length > 0
              ? `${pendingSummary(pending)} 등록합니다.`
              : '각 항목을 일정·할일·둘 다 중에서 골라 주세요.'}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors duration-sp-base ease-sp-out"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending.length === 0 || submitting}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-sp-accent text-sp-accent-fg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-sp-base ease-sp-out"
        >
          {submitting ? '등록 중…' : `${pending.length}건 등록`}
        </button>
      </footer>
    </Modal>
  );
}

// ── 조각들 ────────────────────────────────────────────────────

/** "일정 2건 · 할일 1건" 처럼 어디에 몇 건 들어가는지 알려 준다 */
function pendingSummary(items: readonly CoolImportItem[]): string {
  const events = items.filter((i) => i.target === 'event').length;
  const todos = items.filter((i) => i.target === 'todo').length;
  const parts: string[] = [];
  if (events > 0) parts.push(`일정 ${events}건`);
  if (todos > 0) parts.push(`할일 ${todos}건`);
  return parts.join(' · ');
}

function Hint() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-12">
      <span className="material-symbols-outlined text-sp-muted" style={{ fontSize: 40 }}>
        touch_app
      </span>
      <p className="text-sm text-sp-muted">왼쪽에서 쪽지를 고르세요.</p>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="p-5 text-center">
      <p className="text-sm text-sp-text mb-1">받은 쪽지가 없습니다.</p>
      <p className="text-xs text-sp-muted">쿨메신저에 쪽지가 오면 여기에 보입니다.</p>
    </div>
  );
}

function ErrorPanel({ message }: { readonly message: string }) {
  return (
    <div className="p-5">
      <div className="flex items-start gap-2 mb-2">
        <span className="material-symbols-outlined text-sp-error shrink-0">error</span>
        <p className="text-sm text-sp-text">쪽지함을 읽지 못했습니다.</p>
      </div>
      <p className="text-xs text-sp-muted leading-relaxed">{message}</p>
      <p className="text-xs text-sp-muted leading-relaxed mt-2">
        쿨메신저가 설치되어 있는지, 최근에 업데이트되지는 않았는지 확인해 주세요.
      </p>
    </div>
  );
}

function NoDateFound() {
  return (
    <div className="mt-4 px-4 py-6 rounded-xl border border-dashed border-sp-border text-center">
      <p className="text-sm text-sp-text mb-1">이 쪽지에서 날짜를 찾지 못했습니다.</p>
      <p className="text-xs text-sp-muted">
        날짜가 적혀 있는데도 못 찾았다면 알려주세요. 규칙을 보강할 수 있습니다.
      </p>
    </div>
  );
}

function MessagePreview({
  message,
  roster,
}: {
  readonly message: CoolMessage;
  readonly roster?: ReadonlySet<string>;
}) {
  const spans = useMemo(() => detectCoolPii(message.body, roster), [message.body, roster]);
  return (
    <details className="rounded-xl border border-sp-border bg-sp-surface">
      <summary className="px-4 py-2.5 text-xs text-sp-muted cursor-pointer select-none">
        쪽지 원문 보기 · {message.sender}
      </summary>
      <div className="px-4 pb-3 text-sm text-sp-text whitespace-pre-wrap leading-relaxed">
        <PiiText text={message.body} spans={spans} />
      </div>
    </details>
  );
}

function CandidateCard({
  row,
  roster,
  messageKey,
  isImported,
  onPatch,
}: {
  readonly row: CandidateRow;
  readonly roster?: ReadonlySet<string>;
  readonly messageKey: number | null;
  readonly isImported?: (key: string) => boolean;
  readonly onPatch: (patch: Partial<CandidateRow>) => void;
}) {
  const spans = useMemo(() => detectCoolPii(row.title, roster), [row.title, roster]);
  const hasPii = spans.length > 0;

  /** 이 후보를 전에 어디로 가져갔는지 — 중복 등록을 눈으로 막는다 */
  const already = useMemo(() => {
    if (!isImported || messageKey === null) return { event: false, todo: false };
    const at = row.start.toISOString();
    return {
      event: isImported(importKey(messageKey, at, 'event')),
      todo: isImported(importKey(messageKey, at, 'todo')),
    };
  }, [isImported, messageKey, row.start]);
  const alreadyLabel =
    already.event && already.todo ? '일정·할일' : already.event ? '일정' : '할일';

  return (
    <div
      className={[
        'rounded-xl border p-4 transition-colors duration-sp-base ease-sp-out',
        row.choice === 'none' ? 'border-sp-border bg-sp-card' : 'border-sp-accent bg-sp-card',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 제목 — 기본은 표시(빨간 표시가 살아 있음), 편집은 눌러서 */}
          {row.editing ? (
            <input
              type="text"
              value={row.title}
              autoFocus
              onChange={(e) => onPatch({ title: e.target.value })}
              onBlur={() => onPatch({ editing: false })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') onPatch({ editing: false });
              }}
              className="w-full px-2 py-1 rounded-lg bg-sp-surface border border-sp-accent text-sm text-sp-text outline-none"
              aria-label="제목 수정"
            />
          ) : (
            <div className="flex items-start gap-1">
              <PiiText
                text={row.title}
                spans={spans}
                className="text-sm font-bold text-sp-text break-words"
              />
              <IconButton
                icon="edit"
                label="제목 수정"
                size="sm"
                onClick={() => onPatch({ editing: true })}
              />
            </div>
          )}

          {/* 날짜·시간 */}
          <div className="flex items-center flex-wrap gap-2 mt-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sp-surface text-sp-text">
              <span className="material-symbols-outlined icon-xs">event</span>
              {formatDay(row.start)}
              {row.end && ` ~ ${formatDay(row.end)}`}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sp-surface text-sp-text">
              <span className="material-symbols-outlined icon-xs">schedule</span>
              {row.allDay ? '종일' : formatClock(row.start)}
            </span>
          </div>

          {/* 전에 가져간 적이 있으면 알려 준다 — 막지는 않는다(일부러 또 넣을 수도 있다) */}
          {(already.event || already.todo) && (
            <p className="flex items-center gap-1 mt-2 text-xs text-sp-muted">
              <span className="material-symbols-outlined icon-xs" aria-hidden="true">
                history
              </span>
              전에 {alreadyLabel}(으)로 가져간 적이 있습니다.
            </p>
          )}

          {/* 개인정보 안내 — 있을 때만 */}
          {hasPii && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-sp-error flex-1">
                개인정보로 보이는 부분이 {spans.length}곳 있습니다. 그대로 둘지 정하세요.
              </p>
              <button
                type="button"
                onClick={() => onPatch({ title: maskCoolPii(row.title, spans) })}
                className="px-2 py-1 rounded-lg text-xs text-sp-text border border-sp-border hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out shrink-0"
              >
                가리기
              </button>
            </div>
          )}

          {/* 어디에 넣을지 — 프로그램이 아니라 선생님이 고른다 */}
          <div
            className="inline-flex mt-3 rounded-lg border border-sp-border overflow-hidden"
            role="group"
            aria-label="어디에 등록할지 고르기"
          >
            <TargetButton
              active={row.choice === 'event'}
              onClick={() => onPatch({ choice: 'event' })}
              icon="calendar_month"
              label="일정"
            />
            <TargetButton
              active={row.choice === 'todo'}
              onClick={() => onPatch({ choice: 'todo' })}
              icon="check_circle"
              label="할일"
            />
            <TargetButton
              active={row.choice === 'both'}
              onClick={() => onPatch({ choice: 'both' })}
              icon="library_add_check"
              label="둘 다"
            />
            <TargetButton
              active={row.choice === 'none'}
              onClick={() => onPatch({ choice: 'none' })}
              icon="block"
              label="안 함"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetButton({
  active,
  onClick,
  icon,
  label,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: string;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // 아이콘 글자(calendar_month 등)가 버튼 이름에 섞이지 않도록 label 을 못 박는다.
      // 안 그러면 화면낭독기가 "calendar_month 일정"이라고 읽는다.
      aria-label={label}
      className={[
        'inline-flex items-center gap-1 px-3 py-1.5 text-xs',
        'transition-colors duration-sp-base ease-sp-out',
        active ? 'bg-sp-accent text-sp-accent-fg font-bold' : 'text-sp-muted hover:text-sp-text',
      ].join(' ')}
    >
      <span className="material-symbols-outlined icon-xs">{icon}</span>
      {label}
    </button>
  );
}
