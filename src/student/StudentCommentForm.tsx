import { useState } from 'react';
import type { StudentCommentInput } from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH,
  REALTIME_WALL_MAX_COMMENT_IMAGES,
} from '@domain/rules/realtimeWallRules';
import { useGraphemeCounter } from './useGraphemeCounter';
import { StudentCommentInputCollapsed } from './StudentCommentInputCollapsed';
import { StudentCommentInputExpanded } from './StudentCommentInputExpanded';

/**
 * v2.x — 학생 댓글 폼 (패들렛 패턴 2-state).
 *
 * 외부 props는 v2.1과 100% 호환 — 4 Board 호출처 무수정.
 *
 * 내부 흐름:
 *   - focused === false && !fullscreen → Collapsed 트리거 (placeholder + 우측 화살표)
 *   - focused === true || fullscreen   → Expanded 입력 영역 (autofocus textarea)
 *   - submit 후                        → focused=false, draft 초기화
 *   - cancel                           → focused=false, draft 보존 (다시 열면 복원)
 *
 * 회귀 보호:
 *   - StudentCommentFormProps 0 변경 (#5 commentInputSlot prop 시그니처 보존)
 *   - sessionToken 학생 화면 비노출 (#6) — onSubmit 시그니처 그대로
 *   - src/student/ 격리 (#7) — 교사 컴포넌트 직접 import 없음
 *   - useGraphemeCounter 재사용 (#9 IME counter)
 *   - REALTIME_WALL_MAX_COMMENT_IMAGES (#10 이미지 1장 한도)
 */

export interface StudentCommentFormProps {
  readonly postId: string;
  readonly nicknameDefault?: string;
  readonly onSubmit: (
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  readonly disabled?: boolean;
  readonly fullscreen?: boolean;
}

export function StudentCommentForm({
  postId,
  nicknameDefault,
  onSubmit,
  disabled = false,
  fullscreen = false,
}: StudentCommentFormProps) {
  const [nickname, setNickname] = useState(nicknameDefault ?? '');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  void postId;

  const graphemeCount = useGraphemeCounter(text);
  const trimmedNickname = nickname.trim();
  const trimmedText = text.trim();
  const canSubmit =
    !disabled &&
    trimmedNickname.length > 0 &&
    trimmedText.length > 0 &&
    graphemeCount <= REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      nickname: trimmedNickname,
      text: trimmedText,
      ...(images.length > 0 ? { images } : {}),
    });
    setText('');
    setImages([]);
    setFocused(false);
  };

  const handleCancel = () => {
    // draft(text/images)는 보존 — 사용자가 다시 열면 복원됨.
    setFocused(false);
  };

  const handleAddImage = (dataUrl: string) => {
    setImages((prev) =>
      [...prev, dataUrl].slice(0, REALTIME_WALL_MAX_COMMENT_IMAGES),
    );
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const isExpanded = focused || fullscreen;

  if (!isExpanded) {
    return (
      <StudentCommentInputCollapsed
        onExpand={() => setFocused(true)}
        disabled={disabled}
        hasDraft={trimmedText.length > 0 || images.length > 0}
      />
    );
  }

  return (
    <StudentCommentInputExpanded
      nickname={nickname}
      text={text}
      images={images}
      onNicknameChange={setNickname}
      onTextChange={setText}
      onAddImage={handleAddImage}
      onRemoveImage={handleRemoveImage}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      canSubmit={canSubmit}
      graphemeCount={graphemeCount}
      disabled={disabled}
      fullscreen={fullscreen}
    />
  );
}
