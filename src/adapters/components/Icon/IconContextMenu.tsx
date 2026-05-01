/**
 * 아이콘 우클릭 컨텍스트 메뉴 (v2.0.2~).
 * 위젯 열기 / 전체 앱 열기 / 위치 초기화 / 종료 4개 항목.
 */
import { useEffect, useRef } from 'react';

interface IconContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  onClick: () => void;
}

export function IconContextMenu({ x, y, onClose }: IconContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const items: MenuItem[] = [
    {
      label: '위젯 열기',
      onClick: () => {
        void window.electronAPI?.iconExpand({ to: 'widget' });
        onClose();
      },
    },
    {
      label: '전체 앱 열기',
      onClick: () => {
        void window.electronAPI?.iconExpand({ to: 'main' });
        onClose();
      },
    },
    {
      label: '아이콘 위치 초기화',
      onClick: () => {
        // 트레이 메뉴와 동일한 동작 — 우하단 기본 위치로
        // 메인의 saveIconBounds 기본값 위치는 main.ts에서 처리 (트레이 메뉴 항목과 동일)
        // 여기서는 IPC가 없는 기능이므로 트레이 메뉴 사용 안내
        // 단순히 알림만 띄우고 트레이로 이동 권유 — 첫 버전에서는 트레이 메뉴 의존
        onClose();
      },
    },
    {
      label: '쌤핀 종료',
      onClick: () => {
        void window.electronAPI?.closeWindow();
        onClose();
      },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-sp-card border border-sp-border rounded-xl shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={item.onClick}
          className="w-full text-left px-4 py-2 text-sm text-sp-text hover:bg-sp-bg transition-colors"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
