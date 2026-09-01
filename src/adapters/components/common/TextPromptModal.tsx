/**
 * 한 줄 입력 받기 — 브라우저 `prompt()` 를 대신한다.
 *
 * ★왜 만들었나 (2026-09-01)
 * Electron 은 `window.prompt()` 를 **지원하지 않는다.** 부르면 그 자리에서 오류가 나고
 * 화면은 아무 반응도 하지 않는다. 그동안 이름 바꾸기·탭 이름 짓기 버튼들이 눌러도
 * 아무 일이 없었고, 사용자는 "버튼이 고장 났다"고 느꼈다.
 * (실측: 2026-08 한 달간 `prompt() is not supported` 168건 · 18명)
 *
 * ★모양은 새로 만들지 않았다. 교무실 `MyNameModal` 이 쓰는 짜임과 색을 그대로 따른다 —
 *   같은 일(한 줄 받기)에 다른 생김새를 하나 더 만들 이유가 없다.
 *
 * ★쓰는 쪽은 `useTextPrompt()` 를 쓴다. `prompt()` 처럼 **한 줄로 기다렸다 받는** 모양이라
 *   기존 호출부를 거의 그대로 옮길 수 있다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@adapters/components/common/Modal';

export interface TextPromptOptions {
  /** 모달 제목 */
  readonly title: string;
  /** 입력칸 위 설명 */
  readonly label: string;
  /** 처음 채워 둘 값 */
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  /** 확인 버튼 글자. 기본 '확인' */
  readonly confirmLabel?: string;
  /**
   * 값 검사. 문제가 있으면 **사용자에게 보여줄 한국어 문구**를, 없으면 null 을 돌려준다.
   * 검사에서 막히면 모달이 닫히지 않는다 — 닫고 나서 실패를 알리면 쓴 내용이 날아간다.
   */
  readonly validate?: (value: string) => string | null;
}

interface TextPromptModalProps extends TextPromptOptions {
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

export function TextPromptModal({
  title,
  label,
  initialValue = '',
  placeholder,
  maxLength,
  confirmLabel = '확인',
  validate,
  onSubmit,
  onCancel,
}: TextPromptModalProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const message = validate?.(value) ?? null;
    if (message !== null) {
      setError(message);
      return;
    }
    onSubmit(value);
  };

  return (
    <Modal isOpen onClose={onCancel} title={title} size="sm">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <div>
          <label
            htmlFor="sp-text-prompt"
            className="mb-1.5 block text-sm font-sp-medium text-sp-text"
          >
            {label}
          </label>
          <input
            id="sp-text-prompt"
            type="text"
            value={value}
            onChange={(e) => {
              if (maxLength !== undefined && e.target.value.length > maxLength) return;
              setValue(e.target.value);
              if (error !== null) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          {maxLength !== undefined && (
            <p className="mt-1 text-right text-xs text-sp-muted tabular-nums">
              {value.length}/{maxLength}
            </p>
          )}
        </div>

        {error !== null && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-sp-text">
            <span className="material-symbols-outlined text-icon-sm shrink-0 text-red-400">
              error
            </span>
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * `prompt()` 처럼 쓰는 훅.
 *
 * ```tsx
 * const { prompt, promptElement } = useTextPrompt();
 * // ...
 * const next = await prompt({ title: '이름 바꾸기', label: '새 이름', initialValue: name });
 * if (next === null) return;   // 취소
 * // ...
 * return (<>{promptElement} ...</>);
 * ```
 *
 * 취소하거나 화면을 떠나면 `null` 을 돌려준다 — `prompt()` 와 같다.
 */
export function useTextPrompt() {
  const [options, setOptions] = useState<TextPromptOptions | null>(null);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const settle = useCallback((value: string | null) => {
    setOptions(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const prompt = useCallback((next: TextPromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      // 앞선 물음이 아직 살아 있으면 취소로 닫는다 — 기다리는 쪽을 매달아 두지 않는다.
      resolveRef.current?.(null);
      resolveRef.current = resolve;
      setOptions(next);
    });
  }, []);

  // 화면을 떠날 때 기다리는 쪽을 반드시 풀어 준다. 안 그러면 `await` 가 영영 안 끝난다.
  useEffect(() => {
    return () => {
      resolveRef.current?.(null);
      resolveRef.current = null;
    };
  }, []);

  /**
   * ★`document.body` 로 옮겨 그린다(포털).
   *
   * `Modal` 은 `position: fixed` 로 화면 전체를 덮는데, 유리 모드에서 조상 중 하나라도
   * `backdrop-filter` 를 걸고 있으면 **fixed 가 그 상자 안에 갇힌다.** 이 저장소에서
   * 이미 한 번 겪은 함정이라(사이드바 안 모달), 부르는 자리를 따지지 않고 여기서 막는다.
   * 이 훅은 카드 안·설정 안·도구 안 어디서든 불리므로 조상을 예측할 수 없다.
   */
  const promptElement =
    options === null || typeof document === 'undefined'
      ? null
      : createPortal(
          <TextPromptModal
            {...options}
            onSubmit={(value) => settle(value)}
            onCancel={() => settle(null)}
          />,
          document.body,
        );

  return { prompt, promptElement } as const;
}
