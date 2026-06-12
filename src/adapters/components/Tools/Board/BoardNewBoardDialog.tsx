/**
 * BoardNewBoardDialog — 새 보드 만들기 + 학습 활동 템플릿 선택 (PDCA-3 / G005)
 *
 * 핵심 디자인 결정: 템플릿 카드의 미리보기는 아이콘이 아니라 **실제로 캔버스에
 * 깔릴 밑그림의 축소판**이다 — 만다라트 9×9 격자, 6모둠 색 구역, 십자축 4분면,
 * 순서도가 도메인 규칙(boardTemplateRules)과 같은 sp-board-* 토큰 색으로
 * 그려져, 교사가 "만들면 뭐가 나오는지"를 고르기 전에 그대로 본다.
 * frontend-design 협업 산출.
 */
import { useEffect, useRef, useState } from 'react';

import type { BoardTemplateId } from '@domain/entities/BoardTemplate';
import { BOARD_TEMPLATES } from '@domain/rules/boardTemplateRules';
import { useUserTemplateStore } from '@adapters/stores/useUserTemplateStore';

import { Modal } from '../../common/Modal';

/** 내장 템플릿(도메인 규칙 생성) vs 내 템플릿(교사 저장) 선택 (PDCA-4 / G006) */
export type BoardTemplateSelection =
  | { readonly kind: 'builtin'; readonly id: BoardTemplateId }
  | { readonly kind: 'user'; readonly id: string };

interface BoardNewBoardDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** 만들기 확정. name 이 빈 문자열이면 자동 이름("협업 보드 N" / 내 템플릿명) */
  readonly onCreate: (name: string, selection: BoardTemplateSelection) => Promise<void>;
}

/** 만다라트 9×9 축소판 — 도메인 규칙과 동일한 강조 칸 판정 */
function MandalartPreview(): JSX.Element {
  const cells = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const isGridCenter = row === 4 && col === 4;
      const isBlockCenter = row % 3 === 1 && col % 3 === 1;
      cells.push(
        <div
          key={`${row}-${col}`}
          className={
            isGridCenter
              ? 'bg-sp-board-sticky-yellow'
              : isBlockCenter
                ? 'bg-sp-board-sticky-blue'
                : 'bg-sp-board-template-cell'
          }
        />,
      );
    }
  }
  return (
    <div className="grid h-full w-full grid-cols-9 grid-rows-[repeat(9,1fr)] gap-px p-2">
      {cells}
    </div>
  );
}

/** 조별 활동 6색 구역 축소판 */
function GroupActivityPreview(): JSX.Element {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-1 p-2">
      <div className="rounded-sm bg-sp-board-group-r" />
      <div className="rounded-sm bg-sp-board-group-b" />
      <div className="rounded-sm bg-sp-board-group-y" />
      <div className="rounded-sm bg-sp-board-group-g" />
      <div className="rounded-sm bg-sp-board-group-p" />
      <div className="rounded-sm bg-sp-board-group-o" />
    </div>
  );
}

/** 브레인스토밍 십자축 축소판 */
function BrainstormPreview(): JSX.Element {
  return (
    <div className="relative h-full w-full p-2">
      <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-sp-muted" />
      <div className="absolute bottom-2 top-2 left-1/2 w-px -translate-x-1/2 bg-sp-muted" />
      <span className="absolute left-3 top-2 text-micro text-sp-muted">1</span>
      <span className="absolute right-3 top-2 text-micro text-sp-muted">2</span>
      <span className="absolute bottom-2 left-3 text-micro text-sp-muted">3</span>
      <span className="absolute bottom-2 right-3 text-micro text-sp-muted">4</span>
    </div>
  );
}

/** 도형 다이어그램(순서도) 축소판 */
function FlowDiagramPreview(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-2">
      <div className="h-3 w-12 rounded-full border border-sp-muted bg-sp-board-template-cell" />
      <div className="h-2 w-px bg-sp-muted" />
      <div className="h-3 w-12 border border-sp-muted bg-sp-board-template-cell" />
      <div className="h-2 w-px bg-sp-muted" />
      <div className="h-4 w-4 rotate-45 border border-sp-muted bg-sp-board-template-cell" />
      <div className="h-2 w-px bg-sp-muted" />
      <div className="h-3 w-12 rounded-full border border-sp-muted bg-sp-board-template-cell" />
    </div>
  );
}

/** 빈 보드 축소판 */
function BlankPreview(): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center p-2">
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-sp-border">
        <span className="material-symbols-outlined text-icon-sm text-sp-muted">add</span>
      </div>
    </div>
  );
}

const PREVIEWS: Record<BoardTemplateId, () => JSX.Element> = {
  blank: BlankPreview,
  mandalart: MandalartPreview,
  'group-activity': GroupActivityPreview,
  brainstorm: BrainstormPreview,
  'flow-diagram': FlowDiagramPreview,
};

function formatTemplateDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function BoardNewBoardDialog({
  isOpen,
  onClose,
  onCreate,
}: BoardNewBoardDialogProps): JSX.Element | null {
  const [selection, setSelection] = useState<BoardTemplateSelection>({
    kind: 'builtin',
    id: 'blank',
  });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // PDCA-4 (G006): 내 템플릿 목록 — 열릴 때마다 새로 읽는다
  const userTemplates = useUserTemplateStore((s) => s.templates);
  const loadUserTemplates = useUserTemplateStore((s) => s.load);
  const removeUserTemplate = useUserTemplateStore((s) => s.remove);

  useEffect(() => {
    if (isOpen) void loadUserTemplates();
  }, [isOpen, loadUserTemplates]);

  async function handleCreate(): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), selection);
      // 성공 시 부모가 닫는다 — 다음 열림을 위해 입력 초기화
      setName('');
      setSelection({ kind: 'builtin', id: 'blank' });
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUserTemplate(id: string, templateName: string): Promise<void> {
    const ok = window.confirm(`"${templateName}" 템플릿을 삭제할까요?\n되돌릴 수 없어요.`);
    if (!ok) return;
    await removeUserTemplate(id);
    if (selection.kind === 'user' && selection.id === id) {
      setSelection({ kind: 'builtin', id: 'blank' });
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="새 보드 만들기"
      size="lg"
      initialFocusRef={nameInputRef}
    >
      <div className="flex-1 overflow-y-auto px-6 pb-2 pt-2 space-y-5">
        {/* 보드 이름 */}
        <div>
          <label htmlFor="board-name-input" className="mb-1.5 block text-xs text-sp-muted">
            보드 이름 <span className="text-sp-muted/70">(비워두면 자동으로 지어드려요)</span>
          </label>
          <input
            id="board-name-input"
            ref={nameInputRef}
            type="text"
            value={name}
            maxLength={40}
            placeholder="예: 1학기 과학 모둠 보드"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5 text-sm text-sp-text outline-none placeholder:text-sp-muted/60 focus:border-sp-accent"
          />
        </div>

        {/* 템플릿 선택 — 미리보기는 실제 시딩 결과의 축소판 */}
        <div>
          <div className="mb-2 text-xs text-sp-muted">
            시작 템플릿 — 잠긴 밑그림이 미리 깔린 채 시작해요 (선생님만 잠금 해제 가능)
          </div>
          <div
            role="radiogroup"
            aria-label="시작 템플릿 선택"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {BOARD_TEMPLATES.map((t) => {
              const Preview = PREVIEWS[t.id];
              const selected = selection.kind === 'builtin' && selection.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelection({ kind: 'builtin', id: t.id })}
                  onDoubleClick={() => void handleCreate()}
                  className={`group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition ${
                    selected
                      ? 'border-sp-accent shadow-sp-sm'
                      : 'border-sp-border hover:border-sp-muted'
                  }`}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none h-24 w-full border-b border-sp-border bg-sp-bg"
                  >
                    <Preview />
                  </div>
                  <div className="flex-1 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-sp-text">{t.name}</span>
                      {selected && (
                        <span className="material-symbols-outlined text-icon-xs text-sp-accent">
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-caption leading-relaxed text-sp-muted">
                      {t.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 내 템플릿 (PDCA-4 / G006) — 교사가 보드에서 저장한 밑그림 */}
        {userTemplates.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-sp-muted">
              내 템플릿 — 보드 화면의 [내 템플릿으로 저장]으로 만든 나만의 밑그림
            </div>
            <div
              role="radiogroup"
              aria-label="내 템플릿 선택"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {userTemplates.map((t) => {
                const selected = selection.kind === 'user' && selection.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelection({ kind: 'user', id: t.id })}
                    onDoubleClick={() => void handleCreate()}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition ${
                      selected
                        ? 'border-sp-accent shadow-sp-sm'
                        : 'border-sp-border hover:border-sp-muted'
                    }`}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none flex h-24 w-full items-center justify-center border-b border-sp-border bg-sp-bg"
                    >
                      <span className="material-symbols-outlined text-3xl text-sp-muted">
                        bookmark
                      </span>
                    </div>
                    <div className="flex-1 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-sp-text">
                          {t.name}
                        </span>
                        {selected && (
                          <span className="material-symbols-outlined text-icon-xs text-sp-accent">
                            check_circle
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-caption text-sp-muted">
                        요소 {t.elementCount}개 · {formatTemplateDate(t.createdAt)}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${t.name} 템플릿 삭제`}
                      title="템플릿 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteUserTemplate(t.id, t.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          void handleDeleteUserTemplate(t.id, t.name);
                        }
                      }}
                      className="material-symbols-outlined absolute right-1.5 top-1.5 rounded-md p-1 text-icon-sm text-sp-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    >
                      delete
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="flex items-center justify-end gap-2 border-t border-sp-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={creating}
          className="rounded-lg px-4 py-2 text-sm text-sp-muted hover:bg-sp-bg hover:text-sp-text disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-icon-sm">
            {creating ? 'progress_activity' : 'dashboard_customize'}
          </span>
          {creating ? '만드는 중…' : '이 템플릿으로 만들기'}
        </button>
      </div>
    </Modal>
  );
}
