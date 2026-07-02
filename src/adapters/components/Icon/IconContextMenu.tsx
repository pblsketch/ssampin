/**
 * 아이콘 우클릭 컨텍스트 메뉴 (v2.0.2~).
 * 위젯 열기 / 전체 앱 열기 / 위치 초기화 / 종료 4개 항목.
 *
 * v2.2.7: fixed 커서 좌표 배치 제거 — 64×64 창에서 메뉴(160×154)가 거의 전부
 * 잘려 사실상 사용 불가였다(2026-07-02 진단). 이제 IconWindow 오버레이 영역이
 * 핀 옆(확장 방향)에 배치한다.
 */
import { useEffect, useRef } from 'react';

interface IconContextMenuProps {
  onClose: () => void;
  /** 모드 전환 요청 — IconWindow 가 분석 이벤트를 함께 기록한다 */
  onExpand: (to: 'main' | 'widget') => void;
}

interface MenuItem {
  label: string;
  onClick: () => void;
}

export function IconContextMenu({ onClose, onExpand }: IconContextMenuProps) {
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
        onExpand('widget');
        onClose();
      },
    },
    {
      label: '전체 앱 열기',
      onClick: () => {
        onExpand('main');
        onClose();
      },
    },
    {
      label: '아이콘 위치 초기화',
      onClick: () => {
        void window.electronAPI?.iconResetPosition();
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
      className="bg-sp-card border border-sp-border rounded-xl shadow-lg py-1 min-w-[160px]"
      role="menu"
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          onClick={item.onClick}
          className="w-full text-left px-4 py-2 text-sm text-sp-text hover:bg-sp-bg transition-colors"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
