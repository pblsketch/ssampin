/**
 * 옆핀 메모 칸 — 목록과 편집기를 오가며, 저장과 바깥 변화를 감당한다.
 *
 * 여기서 다루는 어려운 지점 셋:
 *
 * 1. **저장 시점.** 옆핀에는 저장 단추가 없다. 잠깐 적고 닫는 자리라 매번 누르게 하면
 *    목적에 어긋나고, 안 누른 채 닫으면 글이 사라진다. 그래서 타자가 멈추면 저장하고,
 *    목록으로 나갈 때 한 번 더 확인한다. **내용이 그대로면 저장하지 않는다** — 열어만
 *    봐도 수정 시각이 바뀌면 목록 순서가 멋대로 뒤집힌다.
 *
 * 2. **접힘 막기.** 옆핀은 마우스가 벗어나면 접힌다. 글 쓰는 사람은 키보드만 쓰므로
 *    "쓰는 중"을 창에 알려 두지 않으면 타이핑 도중 접혀 글이 날아간다.
 *
 * 3. **바깥 변화.** 메인 창이나 다른 기기에서 지운 메모를 여기서 열어 두고 있을 수 있다.
 *    그대로 두면 없는 메모에 글을 쓰다가 저장이 조용히 실패한다. 사라지면 목록으로 돌린다.
 *
 * 4. **파일 선택 창.** 이미지를 넣으려고 대화상자를 열면 옆핀은 포커스를 잃고, 마우스도
 *    패널 밖으로 나간다. 그동안 "쓰는 중"을 걸어 두지 않으면 패널이 접혀 고른 그림이
 *    붙을 자리가 사라진다. 취소에는 이벤트가 없어서 창이 포커스를 되찾는 것으로 알아챈다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { DEFAULT_MEMO_FONT_SIZE } from '@domain/valueObjects/MemoFontSize';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useSidePinMemos } from './useSidePinMemos';
import { SidePinMemoList } from './SidePinMemoList';
import { SidePinMemoEditor, type SidePinImageError } from './SidePinMemoEditor';

/** 타자가 멈추고 이만큼 지나면 저장한다 */
export const SIDE_PIN_MEMO_SAVE_DELAY_MS = 600;

/** 빠른 추가로 만드는 메모의 색 — 기획서 §4 */
const QUICK_ADD_COLOR: MemoColor = 'yellow';

/**
 * 파일 대화상자를 닫고 "쓰는 중"을 풀기까지 기다리는 시간(ms).
 *
 * 창이 포커스를 되찾는 것(focus)이 먼저고 고른 파일(change)이 그 다음이다. 곧바로 풀면
 * 그 틈에 패널이 접혀, 이미 고른 그림이 붙지 못한다. 한 박자 늦춰 change를 먼저 받는다.
 */
export const SIDE_PIN_IMAGE_PICKER_GRACE_MS = 400;

type Mode = { readonly kind: 'list' } | { readonly kind: 'edit'; readonly id: string };

export interface SidePinMemoZoneProps {
  /** 잠금·절전 등 보호 상태 */
  readonly locked: boolean;
  /** 지금 메모를 쓰는 중인지 창에 알린다 */
  readonly onEditorActivityChange: (activity: MemoEditorActivity) => void;
}

export function SidePinMemoZone({ locked, onEditorActivityChange }: SidePinMemoZoneProps) {
  /** 목록에서 찾는 말. 메모를 열었다 돌아와도 유지한다 — 결과로 되돌아와야 한다 */
  const [query, setQuery] = useState('');
  /** 검색 칸에 손이 가 있는가. 참이면 패널이 접히지 않는다 */
  const [searchFocused, setSearchFocused] = useState(false);

  const { items, loaded, total } = useSidePinMemos(locked, query);
  const memos = useMemoStore((state) => state.memos);
  const addMemo = useMemoStore((state) => state.addMemo);
  const updateMemo = useMemoStore((state) => state.updateMemo);
  const updateColor = useMemoStore((state) => state.updateColor);
  const updateFontSize = useMemoStore((state) => state.updateFontSize);
  const attachImage = useMemoStore((state) => state.attachImage);
  const detachImage = useMemoStore((state) => state.detachImage);
  const deleteMemo = useMemoStore((state) => state.deleteMemo);

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** 파일 대화상자가 열려 있는 동안 참 — 이 사이에는 패널이 접히면 안 된다 */
  const [pickingImage, setPickingImage] = useState(false);
  const [imageError, setImageError] = useState<SidePinImageError | null>(null);

  const editing = mode.kind === 'edit' ? memos.find((memo) => memo.id === mode.id) : undefined;

  /**
   * 마지막으로 저장한 내용. 이것과 같으면 저장하지 않는다.
   * 상태가 아니라 ref인 이유는, 이 값이 바뀌었다고 화면을 다시 그릴 필요가 없어서다.
   */
  const savedRef = useRef('');

  const goToList = useCallback(() => {
    setMode({ kind: 'list' });
    setConfirmingDelete(false);
    // 안내를 남겨 두면 다음에 연 메모에 엉뚱하게 붙어 있다.
    setImageError(null);
    setDraft('');
    savedRef.current = '';
  }, []);

  /** 바뀐 게 있을 때만 저장한다 */
  const flush = useCallback(
    async (id: string, content: string): Promise<void> => {
      if (content === savedRef.current) return;
      setSaving(true);
      try {
        await updateMemo(id, content);
        savedRef.current = content;
      } finally {
        setSaving(false);
      }
    },
    [updateMemo],
  );

  // 타자가 멈추면 저장한다.
  useEffect(() => {
    if (mode.kind !== 'edit') return;
    if (draft === savedRef.current) return;
    const id = mode.id;
    const timer = setTimeout(() => {
      void flush(id, draft);
    }, SIDE_PIN_MEMO_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, mode, flush]);

  // 잠기면 찾던 말도 지운다. 거르기는 `selectSidePinMemos`가 이미 막지만(내용을 안
  // 보여 주면서 개수만 줄이면 그 낱말이 든 메모 수가 새어 나간다), 화면에 검색 칸이
  // 남아 있으면 쳐도 아무 일이 없어 고장으로 보인다.
  useEffect(() => {
    if (locked) setQuery('');
  }, [locked]);

  // 열어 둔 메모가 바깥에서 사라졌거나, 보호 상태가 되면 목록으로 돌린다.
  useEffect(() => {
    if (mode.kind !== 'edit') return;
    if (locked || (loaded && editing === undefined)) goToList();
  }, [mode, locked, loaded, editing, goToList]);

  // "쓰는 중"을 창에 알린다. 이게 없으면 타이핑 도중 패널이 접힌다.
  useEffect(() => {
    const activity: MemoEditorActivity =
      confirmingDelete || pickingImage
        ? 'dialog-open'
        : saving
          ? 'saving'
          : // 검색 칸도 "쓰는 중"이다. 키보드로 찾는 말을 치는 동안 마우스는 대개 딴 데
            // 있어서, 이걸 빼면 다 치기도 전에 패널이 접힌다(메모 본문과 같은 문제).
            mode.kind === 'edit' || searchFocused
            ? 'editing'
            : 'idle';
    onEditorActivityChange(activity);
  }, [mode, saving, confirmingDelete, pickingImage, searchFocused, onEditorActivityChange]);

  /**
   * 파일 대화상자를 취소하면 알려 주는 이벤트가 없다. 창이 포커스를 되찾는 것으로
   * 끝났다고 본다. 고른 경우에도 focus가 먼저 오므로, 곧바로 풀지 않고 한 박자 기다려
   * change가 도착할 틈을 준다(§4).
   */
  useEffect(() => {
    if (!pickingImage) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (): void => {
      timer = setTimeout(() => setPickingImage(false), SIDE_PIN_IMAGE_PICKER_GRACE_MS);
    };
    window.addEventListener('focus', done);
    return () => {
      window.removeEventListener('focus', done);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pickingImage]);

  // 화면을 떠날 때는 반드시 손을 뗀다. 안 그러면 창이 영영 접히지 않는다.
  useEffect(() => {
    return () => onEditorActivityChange('idle');
  }, [onEditorActivityChange]);

  const openMemo = (id: string): void => {
    const memo = memos.find((m) => m.id === id);
    if (memo === undefined) return;
    savedRef.current = memo.content;
    setDraft(memo.content);
    setConfirmingDelete(false);
    setImageError(null);
    setMode({ kind: 'edit', id });
  };

  const quickAdd = async (): Promise<void> => {
    // addMemo는 만든 메모를 돌려주지 않는다. 그래서 만들기 전후를 견줘 새 메모를 찾는다.
    const before = new Set(useMemoStore.getState().memos.map((memo) => memo.id));
    await addMemo('', QUICK_ADD_COLOR);
    const created = useMemoStore.getState().memos.find((memo) => !before.has(memo.id));
    if (created === undefined) return;
    // 찾던 말을 남겨 두면, 방금 만든 메모가 그 말에 안 걸려 목록에서 사라진다.
    // 만드는 것과 찾는 것은 다른 일이다.
    setQuery('');
    savedRef.current = '';
    setDraft('');
    setConfirmingDelete(false);
    setMode({ kind: 'edit', id: created.id });
  };

  const leaveEditor = (): void => {
    if (mode.kind === 'edit') void flush(mode.id, draft);
    goToList();
  };

  const removeMemo = async (): Promise<void> => {
    if (mode.kind !== 'edit') return;
    const id = mode.id;
    // 지울 메모에 마지막 입력을 저장하지 않는다 — 지운 뒤 되살아나는 것처럼 보인다.
    savedRef.current = draft;
    goToList();
    await deleteMemo(id);
  };

  const applyImage = async (id: string, file: File): Promise<void> => {
    // 붙이는 동안에도 "쓰는 중"을 유지해야 한다. 리사이즈가 끝나기 전에 접히면
    // 결과가 화면에 닿지 못한다. saving이 그 역할을 그대로 한다.
    setSaving(true);
    try {
      const result = await attachImage(id, file, file.name);
      setImageError(result.ok ? null : result.reason);
    } finally {
      setSaving(false);
      // 대화상자는 이미 닫혔다. 여기서 확실히 풀어 두면 focus를 놓쳐도 안 걸린다.
      setPickingImage(false);
    }
  };

  if (mode.kind === 'edit' && editing !== undefined) {
    return (
      <SidePinMemoEditor
        content={draft}
        color={editing.color}
        // 예전에 만든 메모에는 글자 크기가 없을 수 있다. 없으면 기본값으로 본다.
        fontSize={editing.fontSize ?? DEFAULT_MEMO_FONT_SIZE}
        image={editing.image}
        imageError={imageError}
        saving={saving}
        confirmingDelete={confirmingDelete}
        onChange={setDraft}
        onColorChange={(color) => void updateColor(editing.id, color)}
        onFontSizeChange={(size: MemoFontSize) => void updateFontSize(editing.id, size)}
        onImagePickStart={() => {
          setImageError(null);
          setPickingImage(true);
        }}
        onImagePicked={(file) => void applyImage(editing.id, file)}
        onImagePickCancel={() => setPickingImage(false)}
        onImageRemove={() => {
          setImageError(null);
          void detachImage(editing.id);
        }}
        onImageErrorDismiss={() => setImageError(null)}
        onBack={leaveEditor}
        onAskDelete={() => setConfirmingDelete(true)}
        onCancelDelete={() => setConfirmingDelete(false)}
        onConfirmDelete={() => void removeMemo()}
      />
    );
  }

  return (
    <SidePinMemoList
      items={items}
      loaded={loaded}
      // 잠금 중에는 검색 칸을 띄우지 않는다 — 쳐도 걸러지지 않기 때문이다.
      total={locked ? 0 : total}
      query={query}
      onQueryChange={setQuery}
      onSearchFocusChange={setSearchFocused}
      onOpen={openMemo}
      onAdd={() => void quickAdd()}
    />
  );
}
