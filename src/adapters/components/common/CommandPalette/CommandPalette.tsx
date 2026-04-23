import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Kbd } from '@adapters/components/common/Kbd';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { buildDefaultCommands, filterAndGroupCommands } from './commandRegistry';
import type { Command, CommandGroup } from './commandRegistry';
import { useCommandPalette } from './useCommandPalette';

interface CommandPaletteProps {
  onNavigate: (page: PageId) => void;
}

interface CommandListProps {
  groups: CommandGroup[];
  activeIndex: number;
  allFiltered: Command[];
  onSelect: (cmd: Command) => void;
  onHover: (index: number) => void;
}

function CommandList({ groups, activeIndex, allFiltered, onSelect, onHover }: CommandListProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // 활성 항목이 스크롤 뷰 안에 들어오도록 유지
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (allFiltered.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-sp-muted">
        일치하는 명령을 찾을 수 없습니다
      </div>
    );
  }

  let runningIndex = 0;

  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-4 pt-3 pb-1 text-[11px] font-sp-semibold uppercase tracking-wider text-sp-muted select-none">
            {group.label}
          </div>
          {group.commands.map((cmd) => {
            const idx = runningIndex++;
            const isActive = idx === activeIndex;
            return (
              <button
                key={cmd.id}
                ref={isActive ? activeRef : null}
                type="button"
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => onHover(idx)}
                className={`flex items-center gap-3 px-4 h-11 rounded-md mx-2 cursor-pointer w-[calc(100%-1rem)] text-left transition-colors duration-sp-quick ease-sp-out ${
                  isActive
                    ? 'bg-sp-accent/15 text-sp-text'
                    : 'text-sp-text hover:bg-sp-text/5'
                }`}
              >
                <span className="material-symbols-outlined text-icon-md text-sp-muted shrink-0">
                  {cmd.icon}
                </span>
                <span className="flex-1 text-sm font-sp-medium truncate">{cmd.label}</span>
                {cmd.shortcut && (
                  <Kbd>{cmd.shortcut}</Kbd>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = buildDefaultCommands({ onNavigate });
  const groups = filterAndGroupCommands(commands, query);
  const allFiltered = groups.flatMap((g) => g.commands);

  // 팔레트 열릴 때 상태 초기화 + 포커스
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // 다음 프레임에 포커스 (애니메이션 시작 후)
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // 검색어 변경 시 선택 인덱스 초기화
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (cmd: Command) => {
      cmd.run();
      close();
    },
    [close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(allFiltered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? Math.max(allFiltered.length - 1, 0) : prev - 1,
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = allFiltered[activeIndex];
        if (cmd) handleSelect(cmd);
      }
    },
    [allFiltered, activeIndex, handleSelect],
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="커맨드 팔레트"
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in"
      onClick={close}
    >
      {/* Card */}
      <div
        className="fixed top-[20vh] left-1/2 -translate-x-1/2 w-[min(560px,calc(100vw-32px))] bg-sp-card border border-sp-border rounded-xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 검색 input */}
        <div className="relative flex items-center border-b border-sp-border">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-sp-muted select-none pointer-events-none">
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기능 검색, 페이지 이동..."
            aria-label="명령 검색"
            aria-autocomplete="list"
            className="h-[52px] w-full bg-transparent pl-12 pr-4 text-[15px] text-sp-text placeholder:text-sp-muted outline-none"
          />
        </div>

        {/* 결과 리스트 */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          <CommandList
            groups={groups}
            activeIndex={activeIndex}
            allFiltered={allFiltered}
            onSelect={handleSelect}
            onHover={setActiveIndex}
          />
        </div>

        {/* 하단 힌트 바 */}
        <div className="border-t border-sp-border px-4 py-2 flex items-center justify-between text-[11px] text-sp-muted font-sp-medium">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="ml-1">이동</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              <span className="ml-1">선택</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              <span className="ml-1">닫기</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Kbd combo="Ctrl+K" />
            <span className="ml-1">다시 열기</span>
          </div>
        </div>
      </div>
    </div>
  );
}
