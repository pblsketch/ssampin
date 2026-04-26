/**
 * HandleStudentComment — 학생 댓글 추가 usecase.
 *
 * v1.14 Phase P2 (padlet mode). Design §3.2.
 *
 * 책임:
 *   - 도메인 규칙 `addStudentComment` 래핑
 *   - 추가 실패(50개 도달 / 빈 입력) 판정 → caller가 에러 UX 분기
 *
 * Clean Architecture: domain만 import. 서버 IPC 계층이 호출.
 */
import type {
  RealtimeWallComment,
  RealtimeWallPost,
  StudentCommentInput,
} from '@domain/entities/RealtimeWall';
import { addStudentComment } from '@domain/rules/realtimeWallRules';

export interface HandleStudentCommentInput {
  readonly post: RealtimeWallPost;
  readonly input: StudentCommentInput;
  readonly commentId: string;
  readonly now: number;
}

export type HandleStudentCommentResult =
  | {
      readonly ok: true;
      readonly post: RealtimeWallPost;
      readonly comment: RealtimeWallComment;
    }
  | {
      readonly ok: false;
      readonly reason: 'limit-reached' | 'invalid-input';
    };

/**
 * 학생 댓글 추가 처리.
 *
 * addStudentComment는 실패 시 원본 post를 그대로 반환하므로, 반환된 post의
 * comments 길이가 늘어났는지로 성공 여부를 판정한다. 실패 원인(limit/invalid)은
 * 휴리스틱으로 분기한다.
 */
export function handleStudentComment(
  args: HandleStudentCommentInput,
): HandleStudentCommentResult {
  const originalComments = args.post.comments ?? [];
  const nextPost = addStudentComment(args.post, args.input, args.commentId, args.now);
  const nextComments = nextPost.comments ?? [];

  if (nextComments.length === originalComments.length) {
    // 추가 실패. limit 도달 or 입력 무효 구분.
    if (originalComments.length >= 50) {
      return { ok: false, reason: 'limit-reached' };
    }
    return { ok: false, reason: 'invalid-input' };
  }

  const addedComment = nextComments[nextComments.length - 1];
  if (!addedComment) {
    return { ok: false, reason: 'invalid-input' };
  }

  return {
    ok: true,
    post: nextPost,
    comment: addedComment,
  };
}
