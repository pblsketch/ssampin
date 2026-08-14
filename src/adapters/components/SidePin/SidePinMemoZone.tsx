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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useSidePinMemos } from './useSidePinMemos';
import { SidePinMemoList } from './SidePinMemoList';
import { SidePinMemoEditor } from './SidePinMemoEditor';

/** 타자가 멈추고 이만큼 지나면 저장한다 */
export const SIDE_PIN_MEMO_SAVE_DELAY_MS = 600;

/** 빠른 추가로 만드는 메모의 색 — 기획서 §4 */
const QUICK_ADD_COLOR: MemoColor = 'yellow';

type Mode = { readonly kind: 'list' } | { readonly kind: 'edit'; readonly id: string };

export interface SidePinMemoZoneProps {
  /** 잠금·절전 등 보호 상태 */
  readonly locked: boolean;
  /** 지금 메모를 쓰는 중인지 창에 알린다 */
  readonly onEditorActivityChange: (activity: MemoEditorActivity) => void;
}

export function SidePinMemoZone({ locked, onEditorActivityChange }: SidePinMemoZoneProps) {
  const { items, loaded } = useSidePinMemos(locked);
  const memos = useMemoStore((state) => state.memos);
  const addMemo = useMemoStore((state) => state.addMemo);
  const updateMemo = useMemoStore((state) => state.updateMemo);
  const updateColor = useMemoStore((state) => state.updateColor);
  const deleteMemo = useMemoStore((state) => state.deleteMemo);

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editing = mode.kind === 'edit' ? memos.find((memo) => memo.id === mode.id) : undefined;

  /**
   * 마지막으로 저장한 내용. 이것과 같으면 저장하지 않는다.
   * 상태가 아니라 ref인 이유는, 이 값이 바뀌었다고 화면을 다시 그릴 필요가 없어서다.
   */
  const savedRef = useRef('');

  const goToList = useCallback(() => {
    setMode({ kind: 'list' });
    setConfirmingDelete(false);
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

  // 열어 둔 메모가 바깥에서 사라졌거나, 보호 상태가 되면 목록으로 돌린다.
  useEffect(() => {
    if (mode.kind !== 'edit') return;
    if (locked || (loaded && editing === undefined)) goToList();
  }, [mode, locked, loaded, editing, goToList]);

  // "쓰는 중"을 창에 알린다. 이게 없으면 타이핑 도중 패널이 접힌다.
  useEffect(() => {
    const activity: MemoEditorActivity = confirmingDelete
      ? 'dialog-open'
      : saving
        ? 'saving'
        : mode.kind === 'edit'
          ? 'editing'
          : 'idle';
    onEditorActivityChange(activity);
  }, [mode, saving, confirmingDelete, onEditorActivityChange]);

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
    setMode({ kind: 'edit', id });
  };

  const quickAdd = async (): Promise<void> => {
    // addMemo는 만든 메모를 돌려주지 않는다. 그래서 만들기 전후를 견줘 새 메모를 찾는다.
    const before = new Set(useMemoStore.getState().memos.map((memo) => memo.id));
    await addMemo('', QUICK_ADD_COLOR);
    const created = useMemoStore.getState().memos.find((memo) => !before.has(memo.id));
    if (created === undefined) return;
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

  if (mode.kind === 'edit' && editing !== undefined) {
    return (
      <SidePinMemoEditor
        content={draft}
        color={editing.color}
        saving={saving}
        confirmingDelete={confirmingDelete}
        onChange={setDraft}
        onColorChange={(color) => void updateColor(editing.id, color)}
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
      onOpen={openMemo}
      onAdd={() => void quickAdd()}
    />
  );
}
