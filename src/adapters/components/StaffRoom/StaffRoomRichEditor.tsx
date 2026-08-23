/**
 * 온라인 교무실 — 글쓰기 편집기 (Lexical)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §5.2 · 결정: ADR-068 · ADR-069
 *
 * 왜 Lexical 인가
 * ───────────────
 * 계획서 §5.2 는 TipTap 을 권했지만 **한국어 입력을 확인하지 않은 추천**이었다.
 * TipTap 에는 "한글 입력 중 엔터를 치면 마지막 글자가 사라진다"는 결함이
 * 2023년부터 열려 있다(ueberdosis/tiptap#4108 · #5605). 쌤핀 사용자는 전원
 * 한글로 글을 쓰므로 이 항목만 뒤집었다. 도입 후 크롬의 실제 입력기로 7가지
 * 상황을 확인했다(PROGRESS.md 2026-08-23).
 *
 * **편집기를 화면 여러 곳에 흩지 않는다.**
 * Lexical 은 아직 0.x 라 판올림 때 쓰는 법이 바뀔 수 있다. 바깥에서는 이
 * 컴포넌트 하나만 보이게 해서, 나중에 갈아끼울 때 고칠 자리를 한 곳으로 묶는다.
 * 그래서 이 파일은 Lexical 타입을 밖으로 내보내지 않고, 글자(JSON 문자열)만
 * 주고받는다.
 */
import { useCallback, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $patchStyleText } from '@lexical/selection';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type TextFormatType,
} from 'lexical';
import {
  STAFFROOM_TEXT_COLORS,
  STAFFROOM_TEXT_COLOR_LABELS,
  STAFFROOM_TEXT_SIZES,
  STAFFROOM_TEXT_SIZE_LABELS,
  staffRoomTextColorValue,
  staffRoomTextSizeValue,
  type StaffRoomTextColor,
  type StaffRoomTextSize,
} from '@domain/rules/staffRoomRichText';
import type { StaffRoomBodyFormat } from '@domain/entities/StaffRoomBoard';

/** 툴바에 놓을 꾸미기 — 오너가 보낸 그림의 B / I / U / S 에 해당한다 */
const FORMAT_BUTTONS: readonly {
  format: TextFormatType;
  icon: string;
  label: string;
}[] = [
  { format: 'bold', icon: 'format_bold', label: '굵게' },
  { format: 'italic', icon: 'format_italic', label: '기울임' },
  { format: 'underline', icon: 'format_underlined', label: '밑줄' },
  { format: 'strikethrough', icon: 'format_strikethrough', label: '취소선' },
];

/**
 * 툴바.
 *
 * ⚠️ **`onMouseDown` 과 `onClick` 의 역할을 나눠야 한다.** 둘 중 하나만 쓰면
 * 둘 다 틀린다. 브라우저 시험으로 양쪽 실패를 다 확인하고 정한 모양이다.
 *
 *  - `onMouseDown` 에서 **명령까지 보내면**(기존 메모 편집기 MemoRichEditor 의
 *    방식) 서식이 엉뚱한 곳에 걸린다. 메모는 브라우저 기본 기능
 *    (`document.execCommand`)을 쓰므로 그 방식이 맞지만, Lexical 은 선택 영역을
 *    자기가 따로 들고 있어서 아직 갱신되기 전에 명령을 받는다.
 *    → 실제 증상: "hello" 를 선택하고 굵게를 눌렀는데 " world" 가 굵어졌다.
 *
 *  - `onMouseDown` 을 **아예 안 막으면** 단추가 편집기의 초점을 뺏어간다.
 *    선택이 없어진 상태로 명령이 가서 첫 번째 누름이 통째로 무시되고,
 *    그 다음 누름부터 먹는다.
 *    → 실제 증상: 굵게를 켜고 쓴 "학년부" 는 안 굵고, 끄고 쓴 "회의는" 이 굵었다.
 *
 * 그래서 **초점 뺏기만 막고(onMouseDown), 명령은 선택이 자리잡은 뒤(onClick)**
 * 보낸다. 베껴 쓸 때 딸려오기 쉬운 함정이라 근거를 남겨 둔다.
 */
function Toolbar(): JSX.Element {
  const [editor] = useLexicalComposerContext();

  /**
   * 색·크기를 고른 글자에 입힌다.
   *
   * 값은 도메인이 정한 목록에서만 온다 — 자유 입력이 아니다. 화면에 글을 그릴 때
   * 같은 목록으로 다시 거르므로(ADR-069), 여기서 만든 값만 나중에 살아남는다.
   */
  const patch = useCallback(
    (property: string, value: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        // 빈 값은 `''` 가 아니라 **null** 로 보낸다. `''` 를 보내면 저장된 값에
        // `font-size: ;` 같은 빈 항목이 남는다(브라우저 확인에서 실제로 봤다).
        // 해롭진 않지만 글마다 쌓이고, 나중에 저장값을 읽는 사람을 헷갈리게 한다.
        $patchStyleText(selection, { [property]: value === '' ? null : value });
      });
    },
    [editor],
  );

  const buttonClass =
    'flex h-8 w-8 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text';
  const selectClass =
    'h-8 rounded border border-sp-border bg-sp-surface px-2 text-xs text-sp-text transition-colors hover:bg-black/5';

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-sp-border px-2 py-1.5">
      {/* 글자 크기 */}
      <select
        className={selectClass}
        aria-label="글자 크기"
        title="글자 크기"
        defaultValue="normal"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const size = e.target.value as StaffRoomTextSize;
          // '보통'은 빈 값 → 걸려 있던 크기를 지운다
          patch('font-size', staffRoomTextSizeValue(size));
        }}
      >
        {(Object.keys(STAFFROOM_TEXT_SIZES) as StaffRoomTextSize[]).map((size) => (
          <option key={size} value={size}>
            {STAFFROOM_TEXT_SIZE_LABELS[size]}
          </option>
        ))}
      </select>

      <span className="mx-0.5 h-5 w-px bg-sp-border" aria-hidden />

      {FORMAT_BUTTONS.map((btn) => (
        <button
          key={btn.format}
          type="button"
          // 초점 뺏기만 막고(onMouseDown), 실제 명령은 onClick 에서 보낸다.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, btn.format);
          }}
          className={buttonClass}
          aria-label={btn.label}
          title={btn.label}
        >
          <span className="material-symbols-outlined text-icon">{btn.icon}</span>
        </button>
      ))}

      <span className="mx-0.5 h-5 w-px bg-sp-border" aria-hidden />

      {/* 글자색 */}
      <select
        className={selectClass}
        aria-label="글자색"
        title="글자색"
        defaultValue="default"
        onChange={(e) => {
          const color = e.target.value as StaffRoomTextColor;
          // '기본'은 빈 값 → 걸려 있던 색을 지운다
          patch('color', staffRoomTextColorValue(color));
        }}
      >
        {(Object.keys(STAFFROOM_TEXT_COLORS) as StaffRoomTextColor[]).map((color) => (
          <option key={color} value={color}>
            {STAFFROOM_TEXT_COLOR_LABELS[color]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface StaffRoomRichEditorProps {
  /** 편집기 안내 문구 */
  placeholder?: string;
  /** 고칠 글의 본문. 새 글이면 빈 문자열 */
  initialBody?: string;
  /** 그 본문이 무슨 형식인지 — 맨글이면 글자를 그대로 옮겨 담는다 */
  initialBodyFormat?: StaffRoomBodyFormat;
  /**
   * 글자가 바뀔 때마다 부른다.
   *
   * `body` 는 저장할 값(편집기 구조), `plainText` 는 꾸밈을 뺀 순수 글자다.
   * 순수 글자를 함께 주는 이유: 글자 수 세기·"내용을 입력하세요" 판정에 쓰는데,
   * 구조 문자열의 길이를 세면 빈 글도 수백 자로 나온다.
   */
  onChange?: (body: string, plainText: string) => void;
}

export function StaffRoomRichEditor({
  placeholder = '내용을 입력하세요',
  initialBody = '',
  initialBodyFormat = 'plain',
  onChange,
}: StaffRoomRichEditorProps): JSX.Element {
  // 편집기는 처음 만들 때의 내용만 읽는다. 나중에 바뀐 값을 다시 넣으면 커서가
  // 글 맨 앞으로 튀므로, 첫 값만 붙잡아 둔다.
  const [initial] = useState(() => ({ body: initialBody, format: initialBodyFormat }));

  const handleChange = useCallback(
    (editorState: EditorState) => {
      if (!onChange) return;
      const plainText = editorState.read(() => $getRoot().getTextContent());
      onChange(JSON.stringify(editorState.toJSON()), plainText);
    },
    [onChange],
  );

  return (
    <div
      data-staffroom-editor
      className="overflow-hidden rounded-lg border border-sp-border bg-sp-surface"
    >
      <LexicalComposer
        initialConfig={{
          namespace: 'staffroom-post',
          // 편집기 안에서 예상 못한 오류가 나도 글쓰기 화면 전체가 흰 화면이
          // 되지 않게 한다. 조용히 삼키지 않고 기록은 남긴다.
          onError: (error: Error) => {
            console.error('[StaffRoomRichEditor] 편집기 오류:', error);
          },
          editorState:
            initial.format === 'lexical' && initial.body !== ''
              ? initial.body
              : initial.body !== ''
                ? () => {
                    // 맨글로 쓰인 옛 글을 고치는 경우 — 줄 단위로 옮겨 담는다.
                    // 그냥 버리면 선생님이 쓴 글이 사라진다.
                    const root = $getRoot();
                    root.clear();
                    for (const line of initial.body.split('\n')) {
                      const p = $createParagraphNode();
                      if (line !== '') p.append($createTextNode(line));
                      root.append(p);
                    }
                  }
                : undefined,
          theme: {
            text: {
              bold: 'font-bold',
              italic: 'italic',
              underline: 'underline',
              strikethrough: 'line-through',
            },
          },
        }}
      >
        <Toolbar />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-placeholder={placeholder}
                // 언제 보일지는 Lexical 이 판단한다 — 직접 "비었나"를 세면
                // 한글 조합 중(ㅎ→하→한)에 안내 문구가 깜빡인다.
                placeholder={
                  <div className="pointer-events-none absolute left-3 top-3 text-sm text-sp-muted">
                    {placeholder}
                  </div>
                }
                className="min-h-[12rem] w-full px-3 py-3 text-sm leading-relaxed text-sp-text outline-none"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleChange} />
        </div>
      </LexicalComposer>
    </div>
  );
}
