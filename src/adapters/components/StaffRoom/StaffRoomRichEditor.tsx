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
import { useCallback, useEffect, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { TOGGLE_LINK_COMMAND, AutoLinkNode, LinkNode } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';
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
import { isValidStaffRoomLinkHref } from '@domain/rules/staffRoomRichText';
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
 * 붙여넣기로 들어온 **위험한 주소를 저장 전에 벗겨낸다.**
 *
 * 남의 문서를 복사해 붙이면 편집기가 그 안의 `<a>` 를 그대로 링크 조각으로
 * 만든다. `javascript:alert(1)` 같은 주소도 함께 온다. 화면(StaffRoomRichText)이
 * 그리는 단계에서 이미 막지만, **그건 마지막 방어선이다** — 그 전에 위험한
 * 주소가 DB 에 저장되고 있었다(QA 에서 잡았다).
 *
 * 저장값에 남겨 두면 안 되는 이유:
 *  - 나중에 본문을 그리는 자리가 하나 더 생기면 그쪽이 막는다는 보장이 없다.
 *  - 내보내기·검색·백업 같은 다른 경로로 새어 나갈 수 있다.
 *
 * 링크만 벗기고 **글자는 남긴다.** 붙여넣은 문장이 통째로 사라지면 무엇이
 * 없어졌는지도 모른다.
 */
function SanitizeLinksPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const strip = (node: LinkNode) => {
      if (isValidStaffRoomLinkHref(node.getURL())) return;
      // 링크 껍데기만 걷어내고 안쪽 글자를 그 자리에 남긴다
      for (const child of node.getChildren()) node.insertBefore(child);
      node.remove();
    };
    return mergeRegister(
      editor.registerNodeTransform(LinkNode, strip),
      editor.registerNodeTransform(AutoLinkNode, strip),
    );
  }, [editor]);

  return null;
}

/**
 * 지금 고른 글자에 무엇이 걸려 있는가.
 *
 * 이걸 안 보여주면 선생님은 **굵게가 켜져 있는지 알 수 없다.** 눌러 보고
 * 글자를 쳐 봐야 아는 상태였다. 단추가 자기 상태를 말하게 한다.
 */
interface ActiveFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color: StaffRoomTextColor;
  size: StaffRoomTextSize;
}

const EMPTY_ACTIVE: ActiveFormat = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  color: 'default',
  size: 'normal',
};

/** 편집기가 돌려준 꾸밈 값 → 우리가 아는 이름. 모르는 값이면 기본으로 */
function nameOfColor(value: string): StaffRoomTextColor {
  for (const name of Object.keys(STAFFROOM_TEXT_COLORS) as StaffRoomTextColor[]) {
    if (name !== 'default' && staffRoomTextColorValue(name) === value) return name;
  }
  return 'default';
}
function nameOfSize(value: string): StaffRoomTextSize {
  for (const name of Object.keys(STAFFROOM_TEXT_SIZES) as StaffRoomTextSize[]) {
    if (name !== 'normal' && staffRoomTextSizeValue(name) === value) return name;
  }
  return 'normal';
}

/**
 * 툴바.
 *
 * 모양은 **앱이 이미 쓰는 말투를 따른다** — 메모 화면의 "색상 선택 + 동그라미"
 * (design examples/ssampin_memo_and_notes_screen)가 바로 이 문제를 이미 풀어
 * 놓았다. 새 미감을 지어내지 않고 그 방식을 정확히 가져왔다.
 *
 *   [ 가 보통 ]  [ 굵게 기울임 밑줄 취소선 ]  [ ● 기본 ]  [ 링크 ]
 *      크기 알약       한 덩어리로 묶은 서식       색 알약     동작
 *
 * 서식 넷을 한 덩어리로 묶은 이유: 성격이 같은 것끼리 붙이면 눈이 한 번에
 * 훑는다. 색·크기·링크는 각각 다른 일이라 떼어 놓았다.
 *
 * 서랍(크기·색·링크)은 **한 번에 하나만** 열린다. 둘이 겹쳐 뜨면 어지럽고,
 * 편집기가 아래로 밀려 글이 안 보인다.
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
  const [active, setActive] = useState<ActiveFormat>(EMPTY_ACTIVE);

  /** 어떤 서랍이 열려 있는가. 한 번에 하나만 */
  const [openMenu, setOpenMenu] = useState<'size' | 'color' | 'link' | null>(null);

  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkError, setLinkError] = useState<string | null>(null);

  // 커서를 옮길 때마다 그 자리의 꾸밈을 읽어 단추에 비춘다
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          setActive({
            bold: selection.hasFormat('bold'),
            italic: selection.hasFormat('italic'),
            underline: selection.hasFormat('underline'),
            strikethrough: selection.hasFormat('strikethrough'),
            color: nameOfColor($getSelectionStyleValueForProperty(selection, 'color', '')),
            size: nameOfSize($getSelectionStyleValueForProperty(selection, 'font-size', '')),
          });
        });
      }),
    [editor],
  );

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
        $patchStyleText(selection, { [property]: value === '' ? null : value });
      });
    },
    [editor],
  );

  const applyLink = () => {
    const trimmed = linkUrl.trim();
    if (trimmed === '' || trimmed === 'https://') {
      setLinkError('주소를 붙여넣어 주세요.');
      return;
    }
    if (!isValidStaffRoomLinkHref(trimmed)) {
      // 여기서 먼저 막는다. 그냥 넣으면 저장은 되는데 보여줄 때 도메인 검사에
      // 걸려 링크가 조용히 사라진다 — 쓴 사람은 이유를 모른다.
      setLinkError('http, https, mailto 로 시작하는 주소만 넣을 수 있어요.');
      return;
    }
    // ★글자를 고르지 않았으면 링크를 걸 곳이 없다 — 그냥 보내면 아무 일도 안 일어나는데
    //   서랍은 닫히고 입력칸은 초기화돼, 쓴 사람은 "왜 안 걸리지"만 겪는다.
    let hasSelection = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      hasSelection = $isRangeSelection(selection) && !selection.isCollapsed();
    });
    if (!hasSelection) {
      setLinkError('링크를 걸 글자를 먼저 선택해 주세요.');
      return;
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, trimmed);
    setOpenMenu(null);
    setLinkUrl('https://');
    setLinkError(null);
  };

  /** 초점을 뺏지 않는 단추 — 툴바의 모든 단추가 이걸 쓴다 */
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const toggleMenu = (menu: 'size' | 'color' | 'link') =>
    setOpenMenu((current) => (current === menu ? null : menu));

  /** 알약 하나. 눌린 상태면 강조색으로 채운다 */
  const pill = (on: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-all duration-sp-base ease-sp-out active:scale-95 ${
      on
        ? 'border-sp-accent bg-sp-accent text-white'
        : 'border-sp-border text-sp-muted hover:border-sp-accent hover:text-sp-text'
    }`;

  /** 지금 색을 보여주는 동그라미. 기본색은 글자색 그대로 */
  const swatchColor = (name: StaffRoomTextColor): string =>
    name === 'default' ? 'var(--sp-text)' : staffRoomTextColorValue(name);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-sp-border px-2.5 py-2">
        {/* 글자 크기 */}
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => toggleMenu('size')}
          className={pill(openMenu === 'size' || active.size !== 'normal')}
          aria-label="글자 크기"
          aria-expanded={openMenu === 'size'}
          title="글자 크기"
        >
          <span className="material-symbols-outlined text-icon-sm">format_size</span>
          {STAFFROOM_TEXT_SIZE_LABELS[active.size]}
        </button>

        {/* 서식 넷 — 성격이 같아 한 덩어리로 묶는다 */}
        <div className="flex items-center gap-0.5 rounded-full border border-sp-border p-0.5">
          {FORMAT_BUTTONS.map((btn) => {
            const on = active[btn.format as keyof ActiveFormat] === true;
            return (
              <button
                key={btn.format}
                type="button"
                // 초점 뺏기만 막고(onMouseDown), 실제 명령은 onClick 에서 보낸다.
                onMouseDown={keepFocus}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, btn.format)}
                aria-label={btn.label}
                aria-pressed={on}
                title={btn.label}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-sp-base ease-sp-out active:scale-90 ${
                  on
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:bg-black/5 hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm">{btn.icon}</span>
              </button>
            );
          })}
        </div>

        {/* 글자색 — 지금 색을 동그라미로 보여준다 */}
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => toggleMenu('color')}
          className={pill(openMenu === 'color')}
          aria-label="글자색"
          aria-expanded={openMenu === 'color'}
          title="글자색"
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-sp-border"
            style={{ backgroundColor: swatchColor(active.color) }}
            aria-hidden
          />
          {STAFFROOM_TEXT_COLOR_LABELS[active.color]}
        </button>

        {/* 링크 */}
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => toggleMenu('link')}
          className={pill(openMenu === 'link')}
          aria-label="링크"
          aria-expanded={openMenu === 'link'}
          title="링크 붙여넣기"
        >
          <span className="material-symbols-outlined text-icon-sm">link</span>
          링크
        </button>
      </div>

      {/* ── 서랍 ─────────────────────────────────────────────────── */}

      {openMenu === 'size' && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-sp-border bg-sp-bg px-2.5 py-2">
          {(Object.keys(STAFFROOM_TEXT_SIZES) as StaffRoomTextSize[]).map((size) => (
            <button
              key={size}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => {
                patch('font-size', staffRoomTextSizeValue(size));
                setOpenMenu(null);
              }}
              className={`rounded-lg border px-3 py-1.5 leading-none transition-all duration-sp-base ease-sp-out active:scale-95 ${
                active.size === size
                  ? 'border-sp-accent text-sp-text'
                  : 'border-sp-border text-sp-muted hover:text-sp-text'
              }`}
              // 고를 크기 그대로 보여준다 — 이름만 읽고 고르면 매번 되돌리게 된다
              style={{ fontSize: staffRoomTextSizeValue(size) || '1rem' }}
            >
              {STAFFROOM_TEXT_SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      )}

      {openMenu === 'color' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sp-border bg-sp-bg px-2.5 py-2.5">
          {(Object.keys(STAFFROOM_TEXT_COLORS) as StaffRoomTextColor[]).map((color) => {
            const on = active.color === color;
            return (
              <button
                key={color}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  patch('color', staffRoomTextColorValue(color));
                  setOpenMenu(null);
                }}
                aria-label={STAFFROOM_TEXT_COLOR_LABELS[color]}
                aria-pressed={on}
                title={STAFFROOM_TEXT_COLOR_LABELS[color]}
                className={`h-7 w-7 rounded-full border-2 transition-all duration-sp-base ease-sp-out hover:scale-110 active:scale-95 ${
                  on ? 'border-sp-accent' : 'border-sp-border'
                }`}
                style={{ backgroundColor: swatchColor(color) }}
              />
            );
          })}
          <span className="ml-1 text-xs text-sp-muted">
            {STAFFROOM_TEXT_COLOR_LABELS[active.color]}
          </span>
        </div>
      )}

      {openMenu === 'link' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sp-border bg-sp-bg px-2.5 py-2">
          <input
            type="text"
            value={linkUrl}
            autoFocus
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              // 한글 조합 중의 엔터는 글자 확정이지 "적용"이 아니다
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') setOpenMenu(null);
            }}
            placeholder="https://"
            aria-label="링크 주소"
            className="h-8 min-w-[14rem] flex-1 rounded-lg border border-sp-border bg-sp-surface px-2.5 text-xs text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={applyLink}
            className="h-8 rounded-full bg-sp-accent px-3.5 text-xs font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95"
          >
            적용
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => {
              // 고른 글자에서 링크를 뗀다
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
              setOpenMenu(null);
            }}
            className="h-8 rounded-full border border-sp-border px-3 text-xs text-sp-muted transition-colors hover:text-sp-text"
          >
            링크 떼기
          </button>
          {linkError !== null && <span className="text-xs text-sp-error">{linkError}</span>}
        </div>
      )}
    </>
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
          // 링크 조각을 쓰려면 편집기에 먼저 알려야 한다. 빠뜨리면 저장된 글을
          // 열 때 "모르는 조각"이라며 편집기가 오류를 낸다.
          nodes: [LinkNode, AutoLinkNode],
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
            // 쓰는 중에도 링크가 링크처럼 보이게 한다. 이게 없으면 주소를
            // 붙여넣고도 링크가 걸렸는지 알 수 없어 한 번 더 누르게 된다.
            link: 'text-sp-accent underline underline-offset-2 cursor-pointer',
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
          <LinkPlugin />
          {/* 주소를 그냥 붙여넣어도 링크가 되게 — 단추를 못 찾는 사람을 위해 */}
          <AutoLinkPlugin
            matchers={[
              (text: string) => {
                const match = /https?:\/\/[^\s]+/.exec(text);
                if (match === null) return null;
                return {
                  index: match.index,
                  length: match[0].length,
                  text: match[0],
                  url: match[0],
                };
              },
            ]}
          />
          {/* 편집 중에 링크를 눌러 열 수 있게 */}
          <ClickableLinkPlugin />
          <SanitizeLinksPlugin />
          <OnChangePlugin onChange={handleChange} />
        </div>
      </LexicalComposer>
    </div>
  );
}
