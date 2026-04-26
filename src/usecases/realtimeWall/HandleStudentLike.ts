/**
 * HandleStudentLike — 학생 좋아요 토글 usecase.
 *
 * v1.14 Phase P2 (padlet mode). Design §3.1.
 *
 * 책임:
 *   - 도메인 규칙 `toggleStudentLike` 래핑 (순수 pass-through)
 *   - Main IPC 계층이 이 함수를 호출해 post를 업데이트한 후 broadcast
 *
 * Clean Architecture: 이 usecase는 domain만 import. infrastructure/adapters 미사용.
 */
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { toggleStudentLike } from '@domain/rules/realtimeWallRules';

export interface HandleStudentLikeInput {
  readonly post: RealtimeWallPost;
  readonly sessionToken: string;
}

export interface HandleStudentLikeResult {
  readonly post: RealtimeWallPost;
  readonly likes: number;
  readonly likedBy: readonly string[];
}

/**
 * 학생 좋아요 토글 처리.
 *
 * 반환값 구조는 broadcast 메시지 `like-toggled` 페이로드와 일치해
 * 호출자가 바로 직렬화할 수 있다.
 */
export function handleStudentLike(
  input: HandleStudentLikeInput,
): HandleStudentLikeResult {
  const nextPost = toggleStudentLike(input.post, input.sessionToken);
  return {
    post: nextPost,
    likes: nextPost.likes ?? 0,
    likedBy: nextPost.likedBy ?? [],
  };
}
