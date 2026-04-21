import '@blocknote/react/style.css';
import '@blocknote/ariakit/style.css';

import { BlockNoteView } from '@blocknote/ariakit';
import { filterSuggestionItems } from '@blocknote/core';
import { ko } from '@blocknote/core/locales';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NotePageBody as NotePageBodyModel } from '@domain/entities/NotePage';
import { sortNotebooksForSidebar, sortSectionsForNotebook } from '@domain/rules/notebookRules';
import { sortPagesForSection } from '@domain/rules/notePageRules';
import { fromEditorDocument, toEditorDocument } from '@adapters/presenters/notePresenter';
import { useNoteStore } from '@adapters/stores/useNoteStore';

// ─── AutosaveBadge ────────────────────────────────────────────────────────────

function AutosaveBadge({
  savingState,
  updatedAt,
}: {
  savingState: 'idle' | 'saving' | 'saved' | 'error';
  updatedAt?: string;
}) {
  const label = {
    idle: updatedAt ? '자동 저장 대기' : '편집 준비',
    saving: '저장 중...',
    saved: '저장됨',
    error: '저장 실패',
  }[savingState];

  const tone = {
    idle: 'border-sp-border text-sp-muted',
    saving: 'border-sp-accent/30 text-sp-accent',
    saved: 'border-emerald-500/30 text-emerald-400',
    error: 'border-red-500/30 text-red-400',
  }[savingState];

  const icon = {
    idle: 'edit',
    saving: 'sync',
    saved: 'cloud_done',
    error: 'error',
  }[savingState];

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      <span>{label}</span>
      {updatedAt && (
        <span className="text-[11px] text-sp-muted">
          {new Date(updatedAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}

// ─── CollapsiblePanel ─────────────────────────────────────────────────────────

interface CollapsiblePanelProps {
  title: string;
  icon: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  actionLabel?: string;
  onAction?: () => void;
  width: string;
  children: ReactNode;
}

function CollapsiblePanel({
  title,
  icon,
  collapsed,
  onToggleCollapse,
  actionLabel,
  onAction,
  width,
  children,
}: CollapsiblePanelProps) {
  return (
    <section
      className="flex min-h-0 flex-col rounded-xl border border-sp-border bg-sp-surface transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width, minWidth: collapsed ? '48px' : undefined }}
    >
      {/* 패널 헤더 */}
      <div className={`flex items-center border-b border-sp-border ${collapsed ? 'flex-col gap-2 py-3 px-0 justify-start' : 'flex-row justify-between gap-2 px-3 py-2.5'}`}>
        {collapsed ? (
          <>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex w-full items-center justify-center py-1 text-sp-muted hover:text-sp-text transition-colors"
              title={`${title} 펼치기`}
              aria-label={`${title} 펼치기`}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex items-center justify-center"
              title={title}
              aria-label={title}
            >
              <span className="material-symbols-outlined text-[18px] text-sp-muted hover:text-sp-text transition-colors">{icon}</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-sp-muted">{icon}</span>
              <span className="truncate text-xs font-semibold text-sp-text">{title}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-sp-muted hover:bg-sp-card hover:text-sp-text transition-colors"
                  title={actionLabel}
                  aria-label={actionLabel}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-sp-muted hover:bg-sp-card hover:text-sp-text transition-colors"
                title={`${title} 접기`}
                aria-label={`${title} 접기`}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 패널 본문 — 접혔을 때 숨김 */}
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {children}
        </div>
      )}
    </section>
  );
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

function NoteEditor({
  pageId,
  body,
  onChange,
}: {
  pageId: string;
  body: NotePageBodyModel;
  onChange: (body: NotePageBodyModel) => void;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.classList.contains('theme-light') ? 'light' : 'dark');
  }, []);

  const initialContent = useMemo(() => toEditorDocument(body), [pageId, body]);

  const editor = useCreateBlockNote(
    {
      dictionary: ko,
      initialContent,
    },
    [pageId],
  );

  // 아직 지원하지 않는(=사용자에게 노출하면 안 되는) 슬래시 메뉴 항목
  // - "미디어" 그룹: 이미지/비디오/오디오/파일 (업로드 파이프라인 미구현)
  // - "이모지": emojiPicker=false 로 비활성화했으므로 슬래시에서도 제거
  const HIDDEN_SLASH_TITLES = useMemo(
    () => new Set(['이미지', '비디오', '오디오', '파일', '이모지']),
    [],
  );

  const getSlashItems = useCallback(
    (query: string): DefaultReactSuggestionItem[] => {
      const items = getDefaultReactSlashMenuItems(editor).filter(
        (item) => item.group !== '미디어' && !HIDDEN_SLASH_TITLES.has(item.title),
      );
      return filterSuggestionItems(items, query);
    },
    [editor, HIDDEN_SLASH_TITLES],
  );

  return (
    <div className="ssampin-note-editor h-full min-h-0 overflow-x-hidden overflow-y-auto rounded-xl border border-sp-border bg-sp-bg">
      <BlockNoteView
        editor={editor}
        theme={theme}
        sideMenu
        formattingToolbar
        slashMenu={false}
        linkToolbar
        filePanel={false}
        emojiPicker={false}
        onChange={() => {
          onChange(fromEditorDocument(editor.document));
        }}
        className="h-full"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => getSlashItems(query)}
        />
      </BlockNoteView>
    </div>
  );
}

// ─── NotePage ─────────────────────────────────────────────────────────────────

export function NotePage() {
  const {
    notebooks,
    sections,
    pagesMeta,
    loaded,
    activeNotebookId,
    activeSectionId,
    activePageId,
    activePageBody,
    savingState,
    load,
    createNotebook,
    renameNotebook,
    deleteNotebook,
    selectNotebook,
    createSection,
    renameSection,
    toggleSectionCollapsed,
    deleteSection,
    selectSection,
    createPage,
    renamePage,
    selectPage,
    togglePagePin,
    deletePage,
    queueBodySave,
    flushPendingSave,
  } = useNoteStore();

  const [draftTitle, setDraftTitle] = useState('');

  // 슬래시 커맨드 안내 힌트 dismiss 상태 (localStorage 동기화)
  const NOTE_HINT_KEY = 'ssampin.note.slashHint.dismissed';
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(NOTE_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      window.localStorage.setItem(NOTE_HINT_KEY, '1');
    } catch {
      /* noop */
    }
  }, []);

  // 컬럼 접기 상태 (로컬)
  const [notebookCollapsed, setNotebookCollapsed] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [pageCollapsed, setPageCollapsed] = useState(false);
  const allCollapsed = notebookCollapsed && sectionCollapsed && pageCollapsed;

  const toggleAllPanels = useCallback(() => {
    if (allCollapsed) {
      setNotebookCollapsed(false);
      setSectionCollapsed(false);
      setPageCollapsed(false);
    } else {
      setNotebookCollapsed(true);
      setSectionCollapsed(true);
      setPageCollapsed(true);
    }
  }, [allCollapsed]);

  const sortedNotebooks = useMemo(
    () => sortNotebooksForSidebar(notebooks),
    [notebooks],
  );
  const visibleSections = useMemo(
    () =>
      activeNotebookId
        ? sortSectionsForNotebook(sections, activeNotebookId)
        : [],
    [activeNotebookId, sections],
  );
  const visiblePages = useMemo(
    () =>
      activeSectionId
        ? sortPagesForSection(pagesMeta, activeSectionId)
        : [],
    [activeSectionId, pagesMeta],
  );
  const activePage = useMemo(
    () => pagesMeta.find((page) => page.id === activePageId) ?? null,
    [activePageId, pagesMeta],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDraftTitle(activePage?.title ?? '');
  }, [activePage?.id, activePage?.title]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      void flushPendingSave();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flushPendingSave]);

  useEffect(() => () => {
    void flushPendingSave();
  }, [flushPendingSave]);

  const askTitle = useCallback((label: string, currentValue = ''): string | null => {
    const nextValue = window.prompt(label, currentValue)?.trim();
    if (!nextValue) {
      return null;
    }
    return nextValue;
  }, []);

  const handleRenameNotebook = useCallback(async (id: string, currentTitle: string) => {
    const nextTitle = askTitle('노트북 이름을 입력하세요.', currentTitle);
    if (!nextTitle) {
      return;
    }

    try {
      await renameNotebook(id, nextTitle);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '노트북 이름을 바꾸지 못했습니다.');
    }
  }, [askTitle, renameNotebook]);

  const handleRenameSection = useCallback(async (id: string, currentTitle: string) => {
    const nextTitle = askTitle('섹션 이름을 입력하세요.', currentTitle);
    if (!nextTitle) {
      return;
    }

    await renameSection(id, nextTitle);
  }, [askTitle, renameSection]);

  const handleRenamePage = useCallback(async (id: string, currentTitle: string) => {
    const nextTitle = askTitle('페이지 이름을 입력하세요.', currentTitle);
    if (!nextTitle) {
      return;
    }

    await renamePage(id, nextTitle);
  }, [askTitle, renamePage]);

  const handleCommitDraftTitle = useCallback(async () => {
    if (!activePage || draftTitle.trim() === '' || draftTitle === activePage.title) {
      setDraftTitle(activePage?.title ?? '');
      return;
    }

    await renamePage(activePage.id, draftTitle);
  }, [activePage, draftTitle, renamePage]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-sp-muted">쌤핀 노트를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── 헤더 ── */}
      <header className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-sp-text">
          <span>📝</span>
          <span>쌤핀 노트</span>
        </h2>
        <div className="flex items-center gap-2">
          <AutosaveBadge savingState={savingState} updatedAt={activePage?.updatedAt} />
          {/* 전체 패널 접기/펼치기 */}
          <button
            type="button"
            onClick={toggleAllPanels}
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs text-sp-muted hover:border-sp-accent/40 hover:text-sp-text transition-colors"
            title={allCollapsed ? '패널 모두 펼치기' : '패널 모두 접기'}
          >
            <span className="material-symbols-outlined text-[15px]">
              {allCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
            </span>
            <span className="hidden xl:inline">{allCollapsed ? '펼치기' : '접기'}</span>
          </button>
          {/* 새 노트북 */}
          <button
            type="button"
            onClick={() => void createNotebook()}
            className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sp-accent/20 hover:brightness-110 transition"
          >
            <span className="material-symbols-outlined text-[15px]">note_add</span>
            <span>새 노트북</span>
          </button>
          {activeNotebookId && (
            <button
              type="button"
              onClick={() => void createSection(activeNotebookId)}
              className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs font-semibold text-sp-text hover:border-sp-accent/30 hover:text-sp-accent transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">segment</span>
              <span>새 섹션</span>
            </button>
          )}
          {activeSectionId && (
            <button
              type="button"
              onClick={() => void createPage(activeSectionId)}
              className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs font-semibold text-sp-text hover:border-sp-accent/30 hover:text-sp-accent transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">description</span>
              <span>새 페이지</span>
            </button>
          )}
        </div>
      </header>

      {/* ── 3컬럼 + 에디터 ── */}
      <div className="flex min-h-0 flex-1 gap-3">

        {/* 노트북 패널 */}
        <CollapsiblePanel
          title="노트북"
          icon="book_2"
          collapsed={notebookCollapsed}
          onToggleCollapse={() => setNotebookCollapsed((v) => !v)}
          actionLabel="새 노트북"
          onAction={() => void createNotebook()}
          width={notebookCollapsed ? '48px' : '220px'}
        >
          <div className="space-y-1">
            {sortedNotebooks.length === 0 && (
              <p className="py-6 text-center text-xs text-sp-muted">
                노트북이 없습니다.
              </p>
            )}
            {sortedNotebooks.map((notebook) => {
              const isActive = notebook.id === activeNotebookId;
              const notebookSectionCount = sections.filter((s) => s.notebookId === notebook.id).length;

              return (
                <div key={notebook.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void selectNotebook(notebook.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      isActive
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-transparent bg-transparent hover:border-sp-border hover:bg-sp-card'
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-sp-text">
                      {notebook.icon ? `${notebook.icon} ` : ''}
                      {notebook.title}
                    </p>
                    <p className="mt-0.5 text-xs text-sp-muted">섹션 {notebookSectionCount}개</p>
                  </button>
                  {/* 호버 시 액션 버튼 */}
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
                      onClick={(e) => { e.stopPropagation(); void handleRenameNotebook(notebook.id, notebook.title); }}
                      title="이름 바꾸기"
                      aria-label="이름 바꾸기"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); if (!window.confirm(`"${notebook.title}" 노트북을 삭제할까요?`)) return; void deleteNotebook(notebook.id); }}
                      title="삭제"
                      aria-label="삭제"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsiblePanel>

        {/* 섹션 패널 */}
        <CollapsiblePanel
          title="섹션"
          icon="segment"
          collapsed={sectionCollapsed}
          onToggleCollapse={() => setSectionCollapsed((v) => !v)}
          actionLabel="새 섹션"
          onAction={activeNotebookId ? () => void createSection(activeNotebookId) : undefined}
          width={sectionCollapsed ? '48px' : '200px'}
        >
          <div className="space-y-1">
            {visibleSections.length === 0 && (
              <p className="py-6 text-center text-xs text-sp-muted">
                {activeNotebookId ? '섹션이 없습니다.' : '노트북을 선택하세요.'}
              </p>
            )}
            {visibleSections.map((section) => {
              const isActive = section.id === activeSectionId;
              const pageCount = pagesMeta.filter((p) => p.sectionId === section.id).length;

              return (
                <div key={section.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void selectSection(section.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      isActive
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-transparent bg-transparent hover:border-sp-border hover:bg-sp-card'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-sp-text">
                      <span className="material-symbols-outlined text-[15px] text-sp-muted">
                        {section.collapsed ? 'chevron_right' : 'expand_more'}
                      </span>
                      {section.title}
                    </p>
                    <p className="mt-0.5 text-xs text-sp-muted">페이지 {pageCount}개</p>
                  </button>
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
                      onClick={(e) => { e.stopPropagation(); void toggleSectionCollapsed(section.id); }}
                      title={section.collapsed ? '펼치기' : '접기'}
                      aria-label={section.collapsed ? '펼치기' : '접기'}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {section.collapsed ? 'unfold_more' : 'unfold_less'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
                      onClick={(e) => { e.stopPropagation(); void handleRenameSection(section.id, section.title); }}
                      title="이름 바꾸기"
                      aria-label="이름 바꾸기"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); if (!window.confirm(`"${section.title}" 섹션을 삭제할까요?`)) return; void deleteSection(section.id); }}
                      title="삭제"
                      aria-label="삭제"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsiblePanel>

        {/* 페이지 패널 */}
        <CollapsiblePanel
          title="페이지"
          icon="description"
          collapsed={pageCollapsed}
          onToggleCollapse={() => setPageCollapsed((v) => !v)}
          actionLabel="새 페이지"
          onAction={activeSectionId ? () => void createPage(activeSectionId) : undefined}
          width={pageCollapsed ? '48px' : '220px'}
        >
          <div className="space-y-1">
            {visiblePages.length === 0 && (
              <p className="py-6 text-center text-xs text-sp-muted">
                {activeSectionId ? '페이지가 없습니다.' : '섹션을 선택하세요.'}
              </p>
            )}
            {visiblePages.map((page) => {
              const isActive = page.id === activePageId;

              return (
                <div key={page.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void selectPage(page.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      isActive
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-transparent bg-transparent hover:border-sp-border hover:bg-sp-card'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-sp-text">
                      {page.pinned && (
                        <span className="material-symbols-outlined text-[13px] text-sp-highlight shrink-0">keep</span>
                      )}
                      {page.title}
                    </p>
                    <p className="mt-0.5 text-xs text-sp-muted">
                      {page.updatedAt
                        ? new Date(page.updatedAt).toLocaleDateString('ko-KR')
                        : '기록 없음'}
                    </p>
                  </button>
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${page.pinned ? 'text-sp-highlight' : 'text-sp-muted hover:text-sp-highlight'}`}
                      onClick={(e) => { e.stopPropagation(); void togglePagePin(page.id); }}
                      title={page.pinned ? '고정 해제' : '고정'}
                      aria-label={page.pinned ? '고정 해제' : '고정'}
                    >
                      <span className="material-symbols-outlined text-[14px]">keep</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
                      onClick={(e) => { e.stopPropagation(); void handleRenamePage(page.id, page.title); }}
                      title="이름 바꾸기"
                      aria-label="이름 바꾸기"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-sp-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); if (!window.confirm(`"${page.title}" 페이지를 삭제할까요?`)) return; void deletePage(page.id); }}
                      title="삭제"
                      aria-label="삭제"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsiblePanel>

        {/* ── 에디터 영역 ── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-sp-border bg-sp-card/90 px-5 pt-4 pb-3">
          {!activePage || !activePageBody ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-5xl text-sp-muted/30">edit_note</span>
              <p className="mt-3 text-sm font-medium text-sp-text">편집할 페이지가 없습니다</p>
              <p className="mt-1 text-xs text-sp-muted">페이지를 선택하거나 새로 만들어보세요.</p>
            </div>
          ) : (
            <>
              {/* 에디터 헤더 */}
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => void handleCommitDraftTitle()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 bg-transparent text-2xl font-bold tracking-tight text-sp-text outline-none placeholder:text-sp-muted/50"
                    placeholder="제목 없음"
                  />
                  {activePage.pinned && (
                    <span className="shrink-0 rounded-full border border-sp-highlight/30 bg-sp-highlight/10 px-2 py-0.5 text-xs font-semibold text-sp-highlight">
                      고정됨
                    </span>
                  )}
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-sp-border/60 bg-sp-surface px-2 py-1 text-xs text-sp-muted"
                  title="Ctrl/Cmd + S로 즉시 저장"
                >
                  <span className="material-symbols-outlined text-[13px]">keyboard_command_key</span>
                  <span>S</span>
                </div>
              </div>

              {!hintDismissed && (
                <div className="mb-3 flex items-start gap-3 rounded-lg border border-sp-accent/20 bg-sp-accent/5 px-3 py-2.5 text-xs text-sp-muted">
                  <span className="material-symbols-outlined mt-0.5 text-[16px] text-sp-accent">
                    lightbulb
                  </span>
                  <div className="flex-1 leading-relaxed">
                    <p className="font-medium text-sp-text">
                      <kbd className="mx-0.5 rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 font-mono text-[11px] text-sp-text">/</kbd>
                      를 누르면 제목·목록·체크박스·인용·표·구분선 등을 빠르게 넣을 수 있어요.
                    </p>
                    <p className="mt-1 text-sp-muted">
                      텍스트를 드래그하면 굵게·기울임·링크 도구가 나타납니다. 저장은 자동으로 되고
                      <kbd className="mx-1 rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 font-mono text-[11px] text-sp-text">Ctrl</kbd>
                      +
                      <kbd className="mx-1 rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 font-mono text-[11px] text-sp-text">S</kbd>
                      로 즉시 저장할 수도 있어요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissHint}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
                    title="안내 닫기"
                    aria-label="안내 닫기"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-hidden">
                <NoteEditor
                  pageId={activePage.id}
                  body={activePageBody}
                  onChange={(body) => queueBodySave(activePage.id, body)}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
