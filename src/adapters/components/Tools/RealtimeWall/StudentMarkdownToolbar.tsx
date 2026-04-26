import { useCallback } from 'react';

/**
 * @deprecated v1.10.6+ (v2.2 UX) — `StudentFormatBar` + `StudentMarkdownPreviewToggle`로 교체.
 *   - 라벨이 한글화(굵게/기울임)되고 우측에 미리보기 토글이 추가된 새 조합으로 마이그레이션 완료.
 *   - 다음 마이너 릴리즈에서 본 파일 삭제 예정.
 *   - 신규 호출처 추가 금지. 기존 호출처는 모두 student/ 트리에서 제거됨.
 *
 * v2.1 신규 — 학생 마크다운 툴바 (Plan FR-B7 / Design v2.1 §5.10).
 *
 * 별표 직접 입력 회피 (페1 critical-6 — 한글 IME 자모분리 충돌).
 *
 * 사용자 흐름:
 *   1. textarea에서 텍스트 선택
 *   2. B/I/List/Quote 버튼 클릭
 *   3. 선택 영역이 마크다운 wrap (`**텍스트**` / `*텍스트*` / `- 텍스트` / `> 텍스트`)
 *   4. 학생은 별표를 직접 보지 않음 — IME composition 충돌 0
 *
 * 4 버튼: Bold / Italic / List / Quote
 *
 * 회귀 위험 #6 (`C` 단축키 부재) 격리 — 이 컴포넌트는 keyboard shortcut 미사용.
 */

interface StudentMarkdownToolbarProps {
  /** 연결된 textarea ref — 선택 영역 read + insert */
  readonly textareaRef: React.RefObject<HTMLTextAreaElement>;
  /** textarea 값 변경 핸들러 (제어형) */
  readonly onChange: (newValue: string) => void;
  /** 비활성 (제출 중 등) */
  readonly disabled?: boolean;
}

export function StudentMarkdownToolbar({
  textareaRef,
  onChange,
  disabled = false,
}: StudentMarkdownToolbarProps) {
  const wrap = useCallback(
    (prefix: string, suffix: string = prefix) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const selected = value.slice(start, end);
      const inner = selected.length > 0 ? selected : '텍스트';
      const newValue = value.slice(0, start) + prefix + inner + suffix + value.slice(end);
      onChange(newValue);
      // 다음 tick에 선택 복원
      requestAnimationFrame(() => {
        ta.focus();
        const cursorStart = start + prefix.length;
        const cursorEnd = cursorStart + inner.length;
        ta.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [onChange, textareaRef],
  );

  const prefixLine = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const value = ta.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      onChange(newValue);
      requestAnimationFrame(() => {
        ta.focus();
        const cursor = start + prefix.length;
        ta.setSelectionRange(cursor, cursor);
      });
    },
    [onChange, textareaRef],
  );

  return (
    <div
      className="flex gap-1 mb-1"
      role="toolbar"
      aria-label="텍스트 서식"
    >
      <button
        type="button"
        onClick={() => wrap('**')}
        disabled={disabled}
        className="px-2 py-1 text-sm font-bold text-sp-text rounded hover:bg-sp-surface disabled:opacity-40"
        aria-label="굵게"
        title="굵게"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => wrap('*')}
        disabled={disabled}
        className="px-2 py-1 text-sm italic text-sp-text rounded hover:bg-sp-surface disabled:opacity-40"
        aria-label="기울임"
        title="기울임"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => prefixLine('- ')}
        disabled={disabled}
        className="px-2 py-1 text-xs text-sp-text rounded hover:bg-sp-surface disabled:opacity-40"
        aria-label="목록"
        title="목록"
      >
        • 목록
      </button>
      <button
        type="button"
        onClick={() => prefixLine('> ')}
        disabled={disabled}
        className="px-2 py-1 text-xs text-sp-text rounded hover:bg-sp-surface disabled:opacity-40"
        aria-label="인용"
        title="인용"
      >
        ❝ 인용
      </button>
    </div>
  );
}
