/**
 * 원본과 정리한 근거를 나란히 놓고, 교사가 **두 번 확인해야** 원본 내용이 반영되는 대화상자
 * (계획 §5.3 "비교 대화상자" 행, ADR-086 결정 5, 디자인 검토 2026-09-07).
 *
 * 이 화면이 지키는 선:
 *  - 왼쪽 '현재 원본' / 오른쪽 '정리한 근거'. 기본은 **'현재 근거 유지'** 다. 덮어쓰기가 기본이면
 *    교사가 다듬어 놓은 글이 습관적인 확인 한 번에 날아간다.
 *  - **어느 쪽이 언제 바뀌었다고 말하지 않는다.** 영구 baseline 이 없으니 시간 순서를 모른다.
 *    아는 것은 "지금 두 값이 다르다"뿐이고, 화면도 딱 거기까지만 말한다.
 *  - 비교하는 것은 본문·날짜·장면 **세 개뿐**이다. 태그·분류는 근거 본문에 없어 비교하지 않는다.
 *  - 반영은 **2단계**다. [원본 내용으로 바꾸기]는 미리보기를 펼칠 뿐 아무것도 쓰지 않고,
 *    미리보기 안의 [이 내용으로 바꾸기]가 실제 반영이다. 바뀔 값을 눈으로 본 뒤에 결정한다.
 *  - 실제 쓰기 직전에 스토어가 **양쪽을 다시 읽어** 이 화면이 잡아 둔 값과 대조한다.
 *    그사이 바뀌었으면 쓰기 0회로 돌아오고, 여기서 비교를 새로 잡아 다시 확인받는다.
 *  - 읽기 실패는 '없음'이 아니다. '불러오지 못했습니다 · 다시 시도'로 말하고 삭제됐다고 하지 않는다.
 *  - 원본이 비었거나 출결로 바뀌었으면 **존재**하므로 없음이 아니다. 실제 상태를 보여 주되
 *    그 값으로 근거를 덮는 단추는 잠그고 **왜 잠겼는지**를 함께 적는다.
 *  - 데이터가 아예 없는 상태(확인 중·실패·없음)에서는 [바꾸기]를 **비활성이 아니라 숨긴다.**
 *    누를 수 없는 단추가 남아 있으면 "곧 눌릴 것"이라고 읽힌다. 조건만 안 맞는 상태(빈 본문·출결)
 *    에서만 비활성으로 두고 이유를 붙인다.
 *
 * 공용 `Modal` 을 쓴다: 포커스 트랩·Esc·원래 포커스 복귀·바디 스크롤 잠금이 이미 들어 있다(AC-18).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import {
  diffFromSource,
  normalizeForComparison,
  type ComparisonCapture,
  type ComparisonRecheck,
  type SourceFieldDiff,
} from '@domain/rules/evidenceSourceComparison';
import type { EvidenceSourceFieldsPatch } from '@adapters/stores/useRecordEvidenceStore';
import type {
  EvidenceSourceLookup,
  EvidenceSourceSnapshot,
} from '@adapters/hooks/useEvidenceSourceState';
import { Modal } from '@adapters/components/common/Modal';
import { shortDate } from '@adapters/components/RecordDraft/evidenceBoardStyles';

export interface EvidenceSourceComparisonDialogProps {
  /** 비교 대상 근거. 부모가 스토어의 **최신** 값을 넘긴다. */
  readonly evidence: RecordEvidence;
  /** 원본의 지금 상태. 부모가 `useEvidenceSourceState` 로 만든다. */
  readonly lookup: EvidenceSourceLookup;
  /** '다시 시도' - 원본을 한 번 더 읽는다. */
  readonly onRetrySource: () => void;
  /**
   * 실제 반영. 스토어의 `applySourceFields` 로 이어진다.
   * 재검증에 걸리면 `ok: false` 가 돌아오고 **아무것도 쓰이지 않은** 상태다.
   */
  readonly onApply: (
    capture: ComparisonCapture,
    fields: EvidenceSourceFieldsPatch,
  ) => Promise<ComparisonRecheck>;
  /** [정리한 근거 삭제] - 원본은 건드리지 않는다. 뒷정리는 부모(보드)가 한다. */
  readonly onDeleteEvidence: () => void;
  readonly onClose: () => void;
}

/** 근거를 비교 가능한 모양으로. 부재와 빈 값의 구별은 정규화가 맡는다. */
function evidenceFields(ev: RecordEvidence): {
  content: string;
  date?: string;
  slots?: readonly string[];
} {
  return {
    content: ev.content,
    ...(ev.date !== undefined ? { date: ev.date } : {}),
    ...(ev.slots !== undefined ? { slots: ev.slots } : {}),
  };
}

function captureOf(
  ev: RecordEvidence,
  source: EvidenceSourceSnapshot,
  sourceId: string,
): ComparisonCapture {
  return {
    sourceId,
    evidenceId: ev.id,
    studentRef: ev.studentRef,
    source: normalizeForComparison(source),
    evidence: normalizeForComparison(evidenceFields(ev)),
  };
}

/** 반영할 세 필드. 빈 날짜·빈 장면은 `null` 로 보내 **키를 지운다**(부재와 빈 값은 다르다). */
function patchOf(source: EvidenceSourceSnapshot): EvidenceSourceFieldsPatch {
  return {
    content: source.content,
    date: source.date && source.date.length > 0 ? source.date : null,
    slots: source.slots && source.slots.length > 0 ? [...source.slots] : null,
  };
}

const COLUMN_HEAD = 'mb-2 text-sm font-semibold text-sp-text';
const FIELD_LABEL = 'mb-1 flex items-center gap-1.5 text-xs font-semibold text-sp-muted';
const BODY_BASE =
  'max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-sp-bg px-3 py-2 text-sm leading-relaxed text-sp-text';
const BODY_SAME = `${BODY_BASE} border-sp-border`;
/** 다른 칸은 테두리만 바꾼다. 색만으로 알리지 않게 배지 문구를 함께 둔다. */
const BODY_DIFF = `${BODY_BASE} border-amber-500/40 ring-1 ring-amber-500/30`;
const HINT = 'text-sm italic text-sp-muted';
const DIFF_BADGE =
  'rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-600 ring-1 ring-amber-500/30';
const BTN_DELETE =
  'rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 ring-1 ring-red-500/20 transition-colors hover:bg-red-500/10';
const BTN_APPLY =
  'rounded-lg px-3 py-1.5 text-sm font-medium text-sp-accent ring-1 ring-blue-500/30 transition-colors hover:bg-blue-500/10 disabled:opacity-40 disabled:hover:bg-transparent';
const BTN_KEEP = 'rounded-lg px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text';
const BTN_CONFIRM =
  'rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40';
/** 세로로 쌓일 때 안전한 것이 위로 오게 뒤집는다. */
const FOOTER =
  'flex flex-col-reverse gap-2 border-t border-sp-border px-6 py-4 sm:flex-row sm:items-center';
const SPACER = 'hidden sm:block sm:flex-1';

const dateText = (date: string | undefined): string =>
  date && date.length > 0 ? date : '날짜 없음';
const slotsText = (slots: readonly string[] | undefined): string =>
  slots && slots.length > 0 ? slots.join(', ') : '선택한 장면 없음';
/** 미리보기의 한 줄 표기. 날짜는 짧게, 없으면 그렇다고 적는다. */
const dateArrow = (from: string | undefined, to: string | undefined): string =>
  `${from ? shortDate(from) : '날짜 없음'} → ${to ? shortDate(to) : '날짜 없음'}`;

/** 라벨 + [다름] 배지. 색만으로 알리지 않도록 스크린리더용 문구를 함께 둔다. */
function fieldLabel(label: string, differs: boolean): ReactElement {
  return (
    <p className={FIELD_LABEL}>
      {label}
      {differs && (
        <>
          <span className={DIFF_BADGE}>다름</span>
          <span className="sr-only"> · 원본과 다름</span>
        </>
      )}
    </p>
  );
}

export function EvidenceSourceComparisonDialog({
  evidence,
  lookup,
  onRetrySource,
  onApply,
  onDeleteEvidence,
  onClose,
}: EvidenceSourceComparisonDialogProps): ReactElement {
  /**
   * 열 때 잡아 두는 확인용 값. 반영 직전에 이 값과 최신을 대조한다.
   * ★`null` 이면 "다시 잡아야 한다"는 뜻이다 - 재검증에 걸린 뒤 새 값으로 다시 확인받는 길이다.
   */
  const [capture, setCapture] = useState<ComparisonCapture | null>(null);
  /** 미리보기를 펼쳤는가. 펼쳤다고 해서 아무것도 쓰이지 않는다. */
  const [previewing, setPreviewing] = useState(false);
  /** 재검증에 걸렸을 때의 안내. 그때 쓰기는 0회였다. */
  const [recheckFailure, setRecheckFailure] = useState<'changed' | 'missing' | null>(null);
  /** 원본 읽기가 던졌을 때. 역시 쓰기 0회다. */
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  /** 두 번 누르기 방지 - state 는 갱신이 비동기라 두 호출이 같은 옛 값을 함께 본다. */
  const applyingRef = useRef(false);
  const applyBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  /** 미리보기를 펼치거나 걷을 때 포커스를 옮긴다 - 사라진 단추 자리에 포커스를 남기지 않는다. */
  const focusTarget = useRef<'apply' | 'cancel' | null>(null);
  const leftId = useId();
  const rightId = useId();

  const sourceId = evidence.sourceId;
  /** 재검증에서 사라진 것으로 나오면 화면도 '없음'으로 내린다(상태 6). */
  const source = recheckFailure === 'missing' || lookup.state !== 'found' ? null : lookup.source;

  useEffect(() => {
    if (capture !== null || source === null || sourceId === undefined) return;
    setCapture(captureOf(evidence, source, sourceId));
  }, [capture, source, evidence, sourceId]);

  useEffect(() => {
    if (focusTarget.current === 'cancel') cancelBtnRef.current?.focus();
    if (focusTarget.current === 'apply') applyBtnRef.current?.focus();
    focusTarget.current = null;
  }, [previewing]);

  const diff: SourceFieldDiff | null = useMemo(
    () => (source !== null ? diffFromSource(source, evidenceFields(evidence)) : null),
    [source, evidence],
  );

  /**
   * 반영을 막는 이유. `null` 이면 단추가 살아 있다.
   * ★빈 본문·출결로 근거를 덮지 않는다(계획 §5.3). 원본이 존재한다는 것과
   *   그 값으로 덮어도 된다는 것은 다른 말이다.
   */
  const blockReason: string | null =
    source === null
      ? null
      : source.blank
        ? '원본 본문이 비어 있어 이 내용으로 바꿀 수 없습니다'
        : source.attendance
          ? '원본이 출결 기록으로 바뀌어 이 내용으로 바꿀 수 없습니다'
          : null;

  /** 데이터가 없는 상태에서는 [바꾸기]를 아예 그리지 않는다. */
  const showApply = source !== null;
  /** 재검증에서 사라진 것으로 나온 뒤에는 안전한 길 하나만 남긴다. */
  const showDelete = recheckFailure !== 'missing';

  const confirm = async (): Promise<void> => {
    if (applyingRef.current || capture === null || source === null) return;
    applyingRef.current = true;
    setApplying(true);
    setReadFailure(null);
    try {
      const result = await onApply(capture, patchOf(source));
      if (result.ok) {
        onClose();
        return;
      }
      // 쓰기 0회다. 미리보기를 걷고 비교를 새로 잡아 다시 확인받는다.
      setPreviewing(false);
      setCapture(null);
      onRetrySource();
      setRecheckFailure(result.reason === 'changed' ? 'changed' : 'missing');
    } catch (err) {
      setReadFailure(err instanceof Error ? err.message : '원본을 확인하지 못했습니다.');
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  /** 왼쪽 칸 - 원본의 지금 상태. 로딩·실패·없음을 각각 다르게 말한다. */
  const sourceColumn = (): ReactElement => {
    const head = (
      <h3 id={leftId} className={COLUMN_HEAD}>
        현재 원본
      </h3>
    );
    if (recheckFailure !== 'missing' && lookup.state === 'loading') {
      return (
        <section aria-labelledby={leftId}>
          {head}
          <p className={HINT}>원본 확인 중</p>
        </section>
      );
    }
    if (recheckFailure !== 'missing' && lookup.state === 'error') {
      return (
        <section aria-labelledby={leftId}>
          {head}
          <p className="text-sm text-sp-text">원본을 불러오지 못했습니다</p>
          <button
            type="button"
            onClick={onRetrySource}
            className="mt-2 rounded-lg px-2.5 py-1 text-xs font-medium text-sp-accent ring-1 ring-blue-500/30 transition-colors hover:bg-blue-500/10"
          >
            다시 시도
          </button>
        </section>
      );
    }
    if (source === null) {
      return (
        <section aria-labelledby={leftId}>
          {head}
          <p className="text-sm text-sp-text">원본을 찾을 수 없습니다</p>
          <p className={`mt-1 ${HINT}`}>삭제됐는지, 아직 동기화되지 않았는지는 알 수 없어요.</p>
        </section>
      );
    }
    return (
      <section aria-labelledby={leftId} className="flex flex-col gap-3">
        {head}
        <div>
          {fieldLabel('본문', diff?.content === true)}
          {source.blank ? (
            <p className={HINT}>본문이 비어 있습니다</p>
          ) : (
            <p className={diff?.content === true ? BODY_DIFF : BODY_SAME}>{source.content}</p>
          )}
          {source.attendance && (
            <p className="mt-1 text-xs leading-snug text-amber-600">
              원본이 출결 기록으로 바뀌었습니다. 본문 비교는 의미가 없어요.
            </p>
          )}
        </div>
        <div>
          {fieldLabel('날짜', diff?.date === true)}
          <p className="text-sm text-sp-text">{dateText(source.date)}</p>
        </div>
        <div>
          {fieldLabel('장면', diff?.slots === true)}
          <p className="text-sm text-sp-text">{slotsText(source.slots)}</p>
        </div>
      </section>
    );
  };

  /** 미리보기 - **다른 칸만** 보여 준다. 같은 칸까지 늘어놓으면 무엇이 바뀌는지 안 보인다. */
  const previewBlock = (): ReactElement | null => {
    if (!previewing || source === null || diff === null) return null;
    return (
      <div className="flex flex-col gap-3 border-b border-sp-border bg-sp-surface px-6 py-4">
        <h3 className="text-sm font-semibold text-sp-text">이 내용으로 바뀝니다</h3>
        {diff.content && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className={FIELD_LABEL}>지금(정리한 근거)</p>
              <p className={`${BODY_SAME} max-h-20`}>{evidence.content}</p>
            </div>
            <div>
              <p className={FIELD_LABEL}>바뀔 내용(원본)</p>
              <p className={`${BODY_DIFF} max-h-20`}>{source.content}</p>
            </div>
          </div>
        )}
        {diff.date && (
          <p className="text-sm text-sp-text">
            <span className="mr-1.5 text-xs font-semibold text-sp-muted">날짜</span>
            {dateArrow(evidence.date, source.date)}
          </p>
        )}
        {diff.slots && (
          <p className="text-sm text-sp-text">
            <span className="mr-1.5 text-xs font-semibold text-sp-muted">장면</span>
            {`${slotsText(evidence.slots)} → ${slotsText(source.slots)}`}
          </p>
        )}
        <p className="text-xs leading-snug text-sp-muted">주제·유형·AI 제외는 그대로 둡니다.</p>
      </div>
    );
  };

  return createPortal(
    <Modal isOpen onClose={onClose} title="원본과 비교" size="lg">
      <div className="flex min-h-0 flex-col overflow-y-auto">
        {recheckFailure !== null && (
          <p
            role="status"
            aria-live="polite"
            aria-label="비교 내용 갱신 안내"
            className="mx-6 mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm leading-snug text-amber-600 ring-1 ring-amber-500/30"
          >
            {recheckFailure === 'changed'
              ? '확인 중 내용이 바뀌었습니다. 다시 확인해 주세요.'
              : '원본 또는 근거를 다시 확인할 수 없습니다. 창을 닫고 다시 확인해 주세요.'}
          </p>
        )}
        {readFailure !== null && (
          <p
            role="alert"
            className="mx-6 mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm leading-snug text-red-500 ring-1 ring-red-500/20"
          >
            {readFailure}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 border-b border-sp-border px-6 py-4 sm:grid-cols-2">
          {sourceColumn()}
          <section aria-labelledby={rightId} className="flex flex-col gap-3">
            <h3 id={rightId} className={COLUMN_HEAD}>
              정리한 근거
            </h3>
            <div>
              {fieldLabel('본문', diff?.content === true)}
              <p className={diff?.content === true ? BODY_DIFF : BODY_SAME}>{evidence.content}</p>
            </div>
            <div>
              {fieldLabel('날짜', diff?.date === true)}
              <p className="text-sm text-sp-text">{dateText(evidence.date)}</p>
            </div>
            <div>
              {fieldLabel('장면', diff?.slots === true)}
              <p className="text-sm text-sp-text">{slotsText(evidence.slots)}</p>
            </div>
          </section>
        </div>
        {previewBlock()}
        {previewing ? (
          <div className={FOOTER}>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={applying || capture === null}
              className={BTN_CONFIRM}
            >
              {applying ? '확인하는 중' : '이 내용으로 바꾸기'}
            </button>
            <div className={SPACER} />
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={() => {
                focusTarget.current = 'apply';
                setPreviewing(false);
              }}
              className={BTN_KEEP}
            >
              취소
            </button>
          </div>
        ) : (
          <div className={FOOTER}>
            {showDelete && (
              <button type="button" onClick={onDeleteEvidence} className={BTN_DELETE}>
                정리한 근거 삭제
              </button>
            )}
            <div className={SPACER} />
            {showApply && (
              <button
                ref={applyBtnRef}
                type="button"
                onClick={() => {
                  focusTarget.current = 'cancel';
                  setPreviewing(true);
                }}
                disabled={blockReason !== null || capture === null}
                {...(blockReason !== null ? { title: blockReason } : {})}
                className={BTN_APPLY}
              >
                원본 내용으로 바꾸기
                {/* 비활성 단추의 title 은 스크린리더가 읽지 않는다 - 이유를 따로 남긴다. */}
                {blockReason !== null && <span className="sr-only"> · {blockReason}</span>}
              </button>
            )}
            <button type="button" onClick={onClose} className={BTN_KEEP}>
              현재 근거 유지
            </button>
          </div>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
