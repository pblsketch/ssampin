import { create } from 'zustand';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import type { CreateAssignmentParams } from '@usecases/assignment/CreateAssignment';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import type { SubmissionDetail } from '@usecases/assignment/GetSubmissions';
import type { ExtractSubmissionTexts } from '@usecases/assignment/ExtractSubmissionTexts';
import {
  assignmentServicePort,
  assignmentSupabaseClient,
  createAssignmentUseCases,
  authenticateGoogle,
  shortLinkClient,
  assignmentRepository,
  getExtractSubmissionTexts,
} from '@adapters/di/container';

interface AssignmentState {
  // 상태
  assignments: AssignmentWithStatus[];
  currentAssignment: AssignmentWithStatus | null;
  submissions: SubmissionDetail[];
  isLoading: boolean;
  error: string | null;
  selectedAssignmentId: string | null;

  // Google Drive 관련
  driveConnected: boolean;
  needsGoogleConnect: boolean;

  // 과제 목록
  loadAssignments: () => Promise<void>;

  // 과제 생성
  createAssignment: (
    params: CreateAssignmentParams & { customLinkCode?: string },
  ) => Promise<Assignment>;

  // 과제 상세 + 제출 현황 로드
  loadAssignmentDetail: (assignmentId: string) => Promise<void>;

  // 선택된 과제 ID
  selectAssignment: (id: string) => void;

  // 과제 삭제
  deleteAssignment: (assignmentId: string) => Promise<void>;

  // 미제출자 목록 텍스트 생성
  getMissingListText: (assignmentId: string) => Promise<string>;

  // 제출 현황 폴링 (30초 간격)
  startSubmissionPolling: (assignmentId: string) => () => void;

  /**
   * 본문을 못 뽑은 제출 파일을 다시 시도한다(교사가 부르는 경로).
   * 이미 뽑아 둔 것은 건드리지 않으므로 눌러도 대역폭을 다시 쓰지 않는다.
   */
  retrySubmissionTexts: (assignmentId: string) => Promise<void>;

  // Google Drive 연결
  connectDrive: () => Promise<void>;

  // 서버가 들고 있는 교사 토큰을 지금 것으로 다시 맞춤 ([Google 계정 연결하기] 단추)
  reconnectGoogleDrive: () => Promise<boolean>;

  // 서버에 마지막으로 올린 교사 토큰의 지문과 시각.
  // 시각만 보면 "연결 해제 → 다시 연결"을 간격 안에 한 교사가 그대로 막힌다.
  // 그래서 토큰이 바뀌었는지(지문)를 같이 본다.
  lastTokenPush: { fingerprint: string; at: number } | null;

  /**
   * 연결 안내 패널에 띄울 구체적인 사유.
   * null 이면 화면이 기본 문구를 쓴다. 계정 어긋남처럼 "어느 계정으로 돌아가야 하는지"를
   * 알려야 하는 경우에 채운다.
   */
  connectNotice: string | null;
}

const NEEDS_GOOGLE_MESSAGE =
  'Google 계정 연결이 필요합니다. 설정 → Google 계정에서 다시 연결해주세요.';

/** 구글 로그인은 살아 있는데 서버 저장만 실패한 경우 — 다시 로그인해도 소용없으니 재시도를 안내한다 */
const SAVE_FAILED_MESSAGE =
  '학생 제출 준비를 서버에 저장하지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.';

/**
 * 과제를 만든 계정과 지금 로그인한 계정이 다를 때의 안내.
 *
 * 학생 파일은 서버가 **과제를 만든 계정**의 토큰으로 올린다. 다른 계정으로 로그인하면
 * 토큰은 새 계정 자리에 저장되고 과제는 옛 계정을 가리키므로, 앱에는 "연결됨"이라고 뜨는데
 * 학생은 계속 막힌다. 어느 계정으로 돌아가야 하는지까지 알려 줘야 선생님이 스스로 푼다.
 */
function accountMismatchMessage(assignmentEmail: string, currentEmail: string): string {
  return `이 과제는 ${assignmentEmail} 계정으로 만들었습니다. 지금은 ${currentEmail} 계정으로 로그인되어 있어 학생이 제출할 수 없습니다. ${assignmentEmail} 계정으로 다시 연결해주세요.`;
}

/**
 * 과제를 만든 계정과 지금 계정이 어긋났는지 확인한다.
 * 계정을 모르는 과제(v2.4.5 이하에서 만든 것)는 대조할 수 없으므로 건너뛴다.
 */
function findAccountMismatch(
  assignments: readonly { teacherEmail?: string }[],
  currentEmail: string | null,
): string | null {
  if (!currentEmail) return null;
  const mismatched = assignments.find((a) => a.teacherEmail && a.teacherEmail !== currentEmail);
  return mismatched?.teacherEmail ?? null;
}

/**
 * **같은 토큰**을 다시 올리기까지의 최소 간격.
 *
 * loadAssignments 는 사용자가 화면을 여는 순간 말고도 드라이브 동기화([syncRegistry] 13번),
 * 온라인 복귀, 새로고침 단추에서 불린다. 간격을 두지 않으면 과제가 있는 교사는
 * 그때마다 서버 왕복이 한 번씩 더 붙는다.
 *
 * ★ 간격은 **토큰이 그대로일 때만** 적용한다. 토큰이 달라졌다면(재로그인·연결 해제 후 재연결)
 * 간격이 남아 있어도 즉시 올린다. 시간만 보고 건너뛰면 "연결 해제 → 다시 연결 → 과제수합"을
 * 10분 안에 한 교사에게 이 신고가 그대로 재현된다(앱은 멀쩡, 학생만 못 냄).
 */
const SAME_TOKEN_REPUSH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 리프레시 토큰의 지문(FNV-1a 32bit).
 *
 * 토큰이 바뀌었는지만 알면 되므로 **되돌릴 수 없는 해시**만 남긴다 —
 * 토큰 조각을 스토어 상태에 들고 있지 않기 위해서다.
 * 충돌이 나도 손해는 "간격 안에서 한 번 덜 올림"뿐이고, 간격이 지나면 어차피 다시 올린다.
 */
function tokenFingerprint(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 서버에 보관된 **교사의 구글 연결**을 지금 토큰으로 갱신한다.
 *
 * 왜 필요한가 — 학생이 낸 파일은 학생 브라우저가 아니라 **서버(submit-assignment)가
 * 교사 토큰으로 대신** 드라이브에 올린다. 그래서 이 토큰이 끊기면 교사 화면은 멀쩡해 보이는데
 * (제출 현황 조회는 이 토큰을 쓰지 않는다) 학생 쪽에만
 * "교사의 Google 인증이 만료되었습니다"가 뜬다.
 *
 * 그런데 이 값은 **과제를 만들 때 딱 한 번만** 저장되고 그 뒤로 갱신하는 길이 없었다.
 * 서버가 리프레시 토큰으로 스스로 늘려 쓰지만, 그 리프레시 토큰이 무효가 되면
 * (교사가 연결을 끊었다 다시 잇거나 구글에서 권한을 회수한 경우)
 * 앱에서 아무리 다시 로그인해도 **서버는 옛 토큰을 그대로 들고 있었다.**
 * 게다가 연결 해제는 리프레시 토큰을 revoke 하므로([AuthenticateGoogle.disconnect])
 * "로그아웃 후 재로그인"은 서버 사본을 확정 무효화하기만 했다 — 2026-08-27 사용자 신고.
 *
 * 온라인 교무실이 같은 결함을 같은 방식으로 고쳤다 ([useStaffRoomStore.pushAdminToken]).
 *
 * 결과를 셋으로 나누는 이유 — "구글을 다시 이어야 한다"와 "서버에 저장만 실패했다"는
 * 사용자가 해야 할 일이 다르다. 뭉뚱그리면 이미 로그인된 교사에게 또 로그인하라고 시키게 되고,
 * 그건 이 신고를 만든 것과 똑같은 헛수고다.
 *
 * @param lastPush 직전에 올린 지문·시각. 주면 "같은 토큰 + 간격 이내"일 때 건너뛴다(자동 경로용).
 *                 안 주면 무조건 올린다([Google 계정 연결하기]·과제 생성처럼 사용자가 부른 경로).
 * @returns result — 'ok' 갱신 완료 · 'skipped' 이미 같은 토큰이 올라가 있음 ·
 *                   'not-connected' 구글 로그인부터 필요 · 'save-failed' 일시 장애(재시도 대상).
 *          fingerprint — 지금 토큰의 지문 (읽지 못했으면 null)
 */
type TokenPushResult = 'ok' | 'skipped' | 'not-connected' | 'save-failed';

interface TokenPushOutcome {
  result: TokenPushResult;
  fingerprint: string | null;
}

async function pushTeacherToken(
  lastPush: { fingerprint: string; at: number } | null = null,
): Promise<TokenPushOutcome> {
  let refreshToken: string | null;
  let accessToken: string;

  try {
    if (!(await authenticateGoogle.isConnected())) {
      return { result: 'not-connected', fingerprint: null };
    }

    accessToken = await authenticateGoogle.getValidAccessToken();
    refreshToken = await authenticateGoogle.getRefreshToken();
  } catch (err) {
    // 토큰이 아예 없거나 INVALID_GRANT 로 폐기된 상태 — 구글 로그인부터 다시 해야 한다
    console.error('[Assignment] 구글 토큰을 읽지 못했습니다:', err);
    return { result: 'not-connected', fingerprint: null };
  }

  // 리프레시 토큰이 없으면 서버가 스스로 갱신할 수 없다 — 저장해도 한 시간짜리다
  if (!refreshToken) return { result: 'not-connected', fingerprint: null };

  const fingerprint = tokenFingerprint(refreshToken);

  // 같은 토큰을 방금 올렸으면 건너뛴다. 토큰이 달라졌으면 간격과 무관하게 즉시 올린다.
  if (
    lastPush &&
    lastPush.fingerprint === fingerprint &&
    Date.now() - lastPush.at < SAME_TOKEN_REPUSH_INTERVAL_MS
  ) {
    return { result: 'skipped', fingerprint };
  }

  try {
    const expiresAtMs = await authenticateGoogle.getExpiresAt();
    await assignmentServicePort.saveTeacherToken({
      accessToken,
      refreshToken,
      expiresAt: expiresAtMs
        ? new Date(expiresAtMs).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    return { result: 'ok', fingerprint };
  } catch (err) {
    // 서버가 구글에 확인해 보니 권한이 회수돼 있었다(401/403) — 이건 다시 로그인해야 낫는다.
    // 인터넷을 확인하라고 안내하면 정작 이 신고의 주된 원인에 엉뚱한 처방을 주게 된다.
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      console.error('[Assignment] 서버가 교사 구글 권한을 확인하지 못했습니다:', err);
      return { result: 'not-connected', fingerprint };
    }

    // 구글 로그인은 멀쩡한데 서버 저장만 실패했다 — 다시 로그인하라고 안내하면 안 된다
    console.error('[Assignment] 교사 구글 연결 갱신 실패:', err);
    return { result: 'save-failed', fingerprint };
  }
}

/**
 * 뽑아 둔 파일 본문을 제출 목록에 입힌다.
 *
 * ★제출 목록을 화면에 넣는 **모든 자리**에서 이걸 태워야 한다. 30초 폴링은 서버 응답으로
 *  목록을 통째로 갈아 끼우는데(`set({ submissions: details })`), 여기서 다시 입히지 않으면
 *  방금 채운 본문이 30초마다 사라지고 근거 창고 미리보기가 "(본문 추출 안 됨)"으로 깜빡인다.
 */
function withCachedTexts(
  details: readonly SubmissionDetail[],
  extractor: ExtractSubmissionTexts,
): SubmissionDetail[] {
  return details.map((detail) => {
    if (!detail.submission) return detail;
    const text = extractor.textFor(detail.submission);
    if (text === undefined) return detail;
    return { ...detail, submission: { ...detail.submission, extractedText: text } };
  });
}

function submissionsOf(details: readonly SubmissionDetail[]): Submission[] {
  return details.map((d) => d.submission).filter((s): s is Submission => s !== undefined);
}

/** 같은 과제에 대해 추출을 두 번 겹쳐 돌리지 않는다(화면 진입 + 폴링이 겹칠 수 있다). */
const extractionInFlight = new Set<string>();

export const useAssignmentStore = create<AssignmentState>((set, get) => {
  // 토큰 getter (기존 Google OAuth 인증 재사용)
  const getAccessToken = () => authenticateGoogle.getValidAccessToken();

  /**
   * 아직 본문이 없는 제출 파일을 내려받아 본문을 뽑는다.
   *
   * 화면을 막지 않는다(부르는 쪽이 기다리지 않는다). 한 건이 끝날 때마다 그 제출물만 갱신해
   * 교사가 기다리는 동안 본문이 하나씩 채워진다. 인터넷이 없으면 조용히 대기한다.
   */
  async function runTextExtraction(
    assignmentId: string,
    details: readonly SubmissionDetail[],
    force = false,
  ): Promise<void> {
    if (extractionInFlight.has(assignmentId)) return;
    extractionInFlight.add(assignmentId);
    try {
      const extractor = getExtractSubmissionTexts(getAccessToken);
      await extractor.run({
        assignmentId,
        submissions: submissionsOf(details),
        knownAssignmentIds: get().assignments.map((a) => a.id),
        force,
        isStillWanted: () => get().selectedAssignmentId === assignmentId,
        onExtracted: (submissionId, text) => {
          if (text === undefined) return;
          // 그 사이 교사가 다른 과제로 옮겼다면 남의 목록에 쓰지 않는다.
          if (get().selectedAssignmentId !== assignmentId) return;
          set((state) => ({
            submissions: state.submissions.map((d) =>
              d.submission?.id === submissionId
                ? { ...d, submission: { ...d.submission, extractedText: text } }
                : d,
            ),
          }));
        },
      });
    } catch (err) {
      // 본문 추출은 있으면 좋은 것이지 없으면 과제수합이 멈추는 것이 아니다.
      console.warn('[Assignment] 제출 파일 본문을 뽑지 못했습니다:', err);
    } finally {
      extractionInFlight.delete(assignmentId);
    }
  }

  return {
    assignments: [],
    currentAssignment: null,
    submissions: [],
    isLoading: false,
    error: null,
    selectedAssignmentId: null,
    driveConnected: false,
    needsGoogleConnect: false,
    lastTokenPush: null,
    connectNotice: null,

    selectAssignment: (id: string) => {
      set({ selectedAssignmentId: id });
    },

    loadAssignments: async () => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        const assignments = await useCases.getAssignments.execute();
        // 목록을 제대로 불러왔으면 "Google 연결이 필요합니다" 안내는 더 이상 사실이 아니다.
        // 여기서 내려 주지 않으면 한 번 뜬 경고가 앱을 껐다 켤 때까지 남는다.
        set({ assignments, isLoading: false, needsGoogleConnect: false, connectNotice: null });

        // 과제수합을 열 때마다 서버가 들고 있는 교사 토큰을 지금 것으로 맞춘다.
        // 이래야 "재로그인했는데도 학생이 못 낸다"가 스스로 풀린다.
        // 과제가 없으면 서버가 대신 올려 줄 일도 없으므로 올리지 않는다
        // (과제수합을 쓰지 않는 교사의 토큰은 서버에 두지 않는다).
        // 화면 표시를 막지 않도록 기다리지 않는다 — 실패해도 목록 조회는 성공이다.
        // 실패했을 때는 lastTokenPush 를 갱신하지 않아 다음에 열 때 곧바로 다시 시도한다.
        if (assignments.length > 0) {
          void (async () => {
            // 과제를 만든 계정과 지금 계정이 다르면 토큰을 아무리 올려도 소용없다
            // (토큰은 새 계정 자리에 저장되고 과제는 옛 계정을 가리킨다).
            const mismatchedEmail = findAccountMismatch(
              assignments,
              await authenticateGoogle.getEmail().catch(() => null),
            );
            if (mismatchedEmail) {
              const currentEmail = (await authenticateGoogle.getEmail().catch(() => null)) ?? '';
              set({
                needsGoogleConnect: true,
                connectNotice: accountMismatchMessage(mismatchedEmail, currentEmail),
              });
              return;
            }

            const { result, fingerprint } = await pushTeacherToken(get().lastTokenPush);
            if (result === 'ok' && fingerprint) {
              set({ lastTokenPush: { fingerprint, at: Date.now() }, connectNotice: null });
              return;
            }
            if (result === 'not-connected') {
              // 서버가 학생 파일을 못 올리는 상태다. 여기서 알리지 않으면 화면은 "연결됨"인 채
              // 학생만 막히고, 선생님은 신고가 들어올 때까지 모른다 — 이 신고가 그랬다.
              set({ needsGoogleConnect: true, connectNotice: NEEDS_GOOGLE_MESSAGE });
            }
          })();
        }
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
      }
    },

    createAssignment: async (params) => {
      set({ isLoading: true, error: null });
      try {
        const { customLinkCode, ...assignmentParams } = params;
        const useCases = createAssignmentUseCases(getAccessToken);

        // 서버가 학생 제출 파일을 대신 올릴 수 있도록 교사 토큰을 먼저 맞춘다.
        // 실패해도 과제 생성은 계속한다 — 이미 저장돼 있을 수 있고, 목록을 열 때
        // (loadAssignments)와 [Google 계정 연결하기] 로 다시 시도된다.
        // 단, 실패를 조용히 삼키지는 않는다 — pushTeacherToken 이 console.error 로 남긴다.
        const pushed = await pushTeacherToken();
        if (pushed.result === 'ok' && pushed.fingerprint) {
          set({ lastTokenPush: { fingerprint: pushed.fingerprint, at: Date.now() } });
        }

        const assignment = await useCases.createAssignment.execute(assignmentParams);

        // 숏링크 생성 (실패해도 과제 생성에는 영향 없음)
        let finalAssignment = assignment;
        try {
          // 과제 마감일 + 90일을 만료일로 설정
          const expiresAt = new Date(
            new Date(assignment.deadline).getTime() + 90 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const shortUrl = await shortLinkClient.createShortLink(
            assignment.shareUrl,
            customLinkCode || undefined,
            expiresAt,
          );
          if (shortUrl !== assignment.shareUrl) {
            finalAssignment = { ...assignment, shortUrl };
            // 로컬 저장소에 shortUrl 반영
            const data = await assignmentRepository.getAssignments();
            const existing = data?.assignments ?? [];
            await assignmentRepository.saveAssignments({
              assignments: existing.map((a) => (a.id === assignment.id ? { ...a, shortUrl } : a)),
            });
          }
        } catch {
          // 숏링크 생성 실패는 무시 — 원본 URL로 동작
        }

        // 목록 새로고침
        await get().loadAssignments();
        set({ isLoading: false });
        return finalAssignment;
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
        throw err;
      }
    },

    loadAssignmentDetail: async (assignmentId) => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        const submissions = await useCases.getSubmissions.execute(assignmentId);

        // 현재 과제 찾기
        const { assignments } = get();
        const current = assignments.find((a) => a.id === assignmentId) ?? null;

        // 지난번에 뽑아 둔 파일 본문을 먼저 입히고(즉시), 아직 없는 것만 뒤에서 뽑는다.
        const extractor = getExtractSubmissionTexts(getAccessToken);
        await extractor.ready();
        const withTexts = withCachedTexts(submissions, extractor);

        set({
          currentAssignment: current,
          submissions: withTexts,
          isLoading: false,
        });

        // 화면 표시를 막지 않는다 — 본문은 준비되는 대로 하나씩 채워진다.
        void runTextExtraction(assignmentId, withTexts);
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
      }
    },

    deleteAssignment: async (assignmentId) => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        await useCases.deleteAssignment.execute(assignmentId);
        // 과제를 지웠으면 그 과제로 뽑아 둔 학생 글도 함께 지운다(필요 없어진 원문을 남기지 않는다)
        await getExtractSubmissionTexts(getAccessToken)
          .purgeAssignment(assignmentId)
          .catch(() => undefined);
        // 목록 새로고침
        await get().loadAssignments();
        set({ currentAssignment: null, submissions: [], isLoading: false });
      } catch (err) {
        set({
          error: (err as Error).message,
          isLoading: false,
        });
      }
    },

    getMissingListText: async (assignmentId) => {
      const useCases = createAssignmentUseCases(getAccessToken);
      return useCases.copyMissingList.execute(assignmentId);
    },

    startSubmissionPolling: (assignmentId) => {
      const adminKey = (() => {
        const data = get().assignments.find((a) => a.id === assignmentId);
        return data?.adminKey ?? '';
      })();

      // Track previous submission count for new submission detection
      let prevSubmissionCount = get().submissions.filter((s) => s.status !== 'missing').length;

      const stopPolling = assignmentSupabaseClient.startPolling(
        assignmentId,
        adminKey,
        async (submissions) => {
          // 제출 현황 업데이트 시 submissions detail 재로드
          try {
            const useCases = createAssignmentUseCases(getAccessToken);
            const details = await useCases.getSubmissions.execute(assignmentId);

            // Detect new submissions
            const currentSubmittedCount = details.filter((s) => s.status !== 'missing').length;
            if (currentSubmittedCount > prevSubmissionCount) {
              const newSubmissions = details.filter((d) => {
                if (d.status === 'missing') return false;
                const prevDetail = get().submissions.find(
                  (s) => s.studentNumber === d.studentNumber,
                );
                return !prevDetail || prevDetail.status === 'missing';
              });

              if (newSubmissions.length > 0) {
                const names = newSubmissions
                  .map((s) => `${s.studentNumber}번 ${s.studentName}`)
                  .join(', ');
                window.dispatchEvent(
                  new CustomEvent('ssampin:new-submission', {
                    detail: { names, count: newSubmissions.length },
                  }),
                );
              }
            }
            prevSubmissionCount = currentSubmittedCount;

            // 서버 응답은 본문을 모른다 — 다시 입히지 않으면 방금 채운 본문이 여기서 지워진다.
            const extractor = getExtractSubmissionTexts(getAccessToken);
            await extractor.ready();
            const withTexts = withCachedTexts(details, extractor);
            set({ submissions: withTexts });

            // 새로 들어온 제출물만 뽑는다(이미 뽑은 것은 캐시라 다시 내려받지 않는다).
            void runTextExtraction(assignmentId, withTexts);

            // assignments 목록도 업데이트
            const { assignments } = get();
            set({
              assignments: assignments.map((a) =>
                a.id === assignmentId
                  ? {
                      ...a,
                      submissions,
                      submittedCount: submissions.length,
                    }
                  : a,
              ),
            });
          } catch {
            // 폴링 에러는 무시
          }
        },
        30_000,
      );

      return stopPolling;
    },

    retrySubmissionTexts: async (assignmentId) => {
      await runTextExtraction(assignmentId, get().submissions, true);
    },

    connectDrive: async () => {
      try {
        await authenticateGoogle.getValidAccessToken();
        set({ driveConnected: true });
      } catch {
        set({ driveConnected: false });
        throw new Error('Google Drive 연결에 실패했습니다');
      }
    },

    reconnectGoogleDrive: async () => {
      set({ isLoading: true, error: null });

      // 계정이 어긋났으면 토큰을 올려도 학생 제출은 안 풀린다 — 성공했다고 말하면 안 된다.
      // 화면에 올라온 목록(get().assignments)이 아니라 저장소를 읽는다 — 목록 조회가
      // 실패한 상태에서 이 단추를 누르는 경우가 바로 그 상황이라 메모리가 비어 있을 수 있다.
      const currentEmail = await authenticateGoogle.getEmail().catch(() => null);
      const stored = await assignmentRepository.getAssignments().catch(() => null);
      const mismatchedEmail = findAccountMismatch(stored?.assignments ?? [], currentEmail);
      if (mismatchedEmail) {
        const notice = accountMismatchMessage(mismatchedEmail, currentEmail ?? '');
        set({
          isLoading: false,
          needsGoogleConnect: true,
          error: notice,
          connectNotice: notice,
        });
        return false;
      }

      // 사용자가 직접 누른 복구 동작이므로 간격을 무시하고 즉시 올린다(인자 없이 호출).
      const { result, fingerprint } = await pushTeacherToken();

      if (result === 'not-connected') {
        // 구글이 아예 안 이어져 있거나 리프레시 토큰이 없다 — 먼저 구글 로그인을 해야 한다.
        // 여기서 조용히 넘어가면 신고와 똑같은 상황(앱은 멀쩡, 학생만 못 냄)이 다시 만들어진다.
        set({
          isLoading: false,
          needsGoogleConnect: true,
          error: NEEDS_GOOGLE_MESSAGE,
          connectNotice: NEEDS_GOOGLE_MESSAGE,
        });
        return false;
      }

      if (result === 'save-failed') {
        // 구글 로그인은 살아 있다. 여기서 needsGoogleConnect 를 올리면 이미 로그인한 교사에게
        // 또 로그인하라고 시키게 되고, 새 과제 단추까지 사라진 채 앱을 껐다 켤 때까지 남는다.
        set({ isLoading: false, error: SAVE_FAILED_MESSAGE });
        return false;
      }

      // 남은 경우는 'ok' 뿐이다 — 인자 없이 불렀으므로 'skipped' 는 나올 수 없다.
      // (설령 나오더라도 "서버에 이미 같은 토큰이 있다"는 뜻이라 성공으로 보는 게 맞다.)
      set({
        isLoading: false,
        needsGoogleConnect: false,
        error: null,
        connectNotice: null,
        lastTokenPush: fingerprint ? { fingerprint, at: Date.now() } : null,
      });
      return true;
    },
  };
});
