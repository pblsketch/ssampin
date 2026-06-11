import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MAX_ITEMS } from '@domain/rules/memoShareRules';
import { Modal } from '@adapters/components/common/Modal';
import { useToastStore } from '@adapters/components/common/Toast';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMemoShareStore } from '@adapters/stores/useMemoShareStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';

/**
 * 메모 교실 공유 관리 모달 (plan.md v2 B-3, Design v0.2 §4).
 *
 * - 공유 중 보드 목록: 링크·QR·복사·숏링크·동기화 상태·공유 중지(확인 단계)
 * - 새 보드 만들기: 제목 + 포스트잇 체크박스 그리드 (최대 MAX_ITEMS)
 * - 최초 1회 개인정보 경고 / 구글 미로그인 시 기존 동기화 로그인 플로우 유도
 * - 학교 워크스페이스 403 등 오류는 store.error 배너로 표시
 * - 내부 스크롤: wrapping div `flex-1 min-h-0` (modal-scroll-overflow-fix 교훈)
 */

const COLOR_DOT_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

interface MemoShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoShareModal({ isOpen, onClose }: MemoShareModalProps) {
  const { show: showToast } = useToastStore();
  const isConnected = useGoogleAccountStore((s) => s.isConnected);
  const authLoading = useGoogleAccountStore((s) => s.isLoading);
  const startAuth = useGoogleAccountStore((s) => s.startAuth);

  const boards = useMemoShareStore((s) => s.boards);
  const error = useMemoShareStore((s) => s.error);
  const syncStatus = useMemoShareStore((s) => s.syncStatus);
  const pendingBoardIds = useMemoShareStore((s) => s.pendingBoardIds);
  const warningAcknowledged = useMemoShareStore((s) => s.warningAcknowledged);
  const deletedMemoNotice = useMemoShareStore((s) => s.deletedMemoNotice);
  const isCreating = useMemoShareStore((s) => s.isCreating);
  const {
    acknowledgeWarning,
    createBoard,
    stopSharing,
    createShortUrl,
    confirmDeletedMemoSync,
    dismissDeletedMemoNotice,
    retrySync,
  } = useMemoShareStore.getState();

  const memos = useMemoStore((s) => s.memos);
  const activeMemos = useMemo(() => memos.filter((m) => !m.archived), [memos]);

  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [qrBoardId, setQrBoardId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [stopConfirmId, setStopConfirmId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  // 모달 닫힐 때 일회성 상태 정리
  useEffect(() => {
    if (isOpen) return;
    setQrBoardId(null);
    setStopConfirmId(null);
  }, [isOpen]);

  // QR 생성 (ToolSignatureRoster 패턴)
  useEffect(() => {
    let cancelled = false;
    const board = boards.find((b) => b.id === qrBoardId);
    if (!board) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(board.shortUrl ?? board.shareUrl, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrBoardId, boards]);

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast('링크를 복사했어요.', 'success');
      } catch {
        showToast('복사에 실패했어요. 링크를 직접 선택해 주세요.', 'error');
      }
    },
    [showToast],
  );

  const toggleMemo = useCallback((memoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memoId)) next.delete(memoId);
      else if (next.size < MAX_ITEMS) next.add(memoId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    // 캔버스 표시 순서대로 공유 (선택 순서가 아닌 화면 순서)
    const memoIds = activeMemos.filter((m) => selectedIds.has(m.id)).map((m) => m.id);
    const board = await createBoard(memoIds, title.trim() || '우리 반 메모');
    if (board) {
      setSelectedIds(new Set());
      setTitle('');
      setQrBoardId(board.id);
      showToast('교실 공유를 시작했어요.', 'success');
    }
  }, [activeMemos, selectedIds, title, createBoard, showToast]);

  const handleStopSharing = useCallback(
    async (boardId: string) => {
      setStoppingId(boardId);
      const ok = await stopSharing(boardId);
      setStoppingId(null);
      setStopConfirmId(null);
      if (ok) showToast('공유를 중지하고 드라이브에서 완전히 삭제했어요.', 'success');
    },
    [stopSharing, showToast],
  );

  const canCreate = selectedIds.size > 0 && warningAcknowledged && !isCreating && isConnected;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="교실에 공유" size="lg">
      <div className="flex flex-1 min-h-0 flex-col">
        {!isConnected ? (
          /* ── 구글 미로그인 — 기존 동기화 로그인 플로우 유도 ── */
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span className="material-symbols-outlined text-5xl text-sp-muted">cloud_off</span>
            <div>
              <p className="text-base font-sp-semibold text-sp-text">구글 계정 연결이 필요해요</p>
              <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                공유한 메모는 선생님의 구글 드라이브에만 저장돼요.
                <br />
                쌤핀 서버에는 어떤 내용도 저장되지 않아요.
              </p>
            </div>
            <button
              onClick={() => void startAuth()}
              disabled={authLoading}
              className="flex items-center gap-2 rounded-xl bg-sp-accent px-5 py-2.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-icon">link</span>
              {authLoading ? '연결 중...' : '구글 계정 연결하기'}
            </button>
            <p className="text-xs text-sp-muted">
              학교 계정은 링크 공유가 막혀 있을 수 있어요. 그럴 땐 개인 구글 계정으로 로그인해
              주세요.
            </p>
          </div>
        ) : (
          <>
            {/* ── 본문 (내부 스크롤 — flex-1 min-h-0 필수) ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
              <p className="text-sm text-sp-muted">
                선택한 포스트잇을 링크 하나로 교실 화면(전자칠판)에 띄워요. 내용을 고치면 10초 안에
                교실 화면에도 반영돼요.
              </p>

              {/* 오류 배너 (학교 워크스페이스 403 안내 포함) */}
              {error !== null && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <span className="material-symbols-outlined mt-0.5 text-icon text-red-400">
                    error
                  </span>
                  <p className="text-sm leading-relaxed text-red-400">{error}</p>
                </div>
              )}

              {/* 공유 중 메모 삭제 — 확인 플로우 */}
              {deletedMemoNotice !== null && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-sm leading-relaxed text-amber-400">
                    삭제한 포스트잇 {deletedMemoNotice.memoIds.length}개가 아직 교실 화면에 남아
                    있어요. 교실 화면에서도 지울까요?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={confirmDeletedMemoSync}
                      className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-sp-semibold text-white transition-all hover:brightness-110 active:scale-95"
                    >
                      교실에서도 지우기
                    </button>
                    <button
                      onClick={dismissDeletedMemoNotice}
                      className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs font-sp-semibold text-sp-text transition-all hover:bg-sp-card active:scale-95"
                    >
                      나중에
                    </button>
                  </div>
                </div>
              )}

              {/* ── 공유 중인 보드 목록 ── */}
              {boards.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-sm font-sp-semibold text-sp-text">공유 중인 보드</h3>
                  <div className="mt-2 flex flex-col gap-3">
                    {boards.map((board) => {
                      const isPending = pendingBoardIds.includes(board.id);
                      const link = board.shortUrl ?? board.shareUrl;
                      return (
                        <div
                          key={board.id}
                          className="rounded-xl border border-sp-border bg-sp-surface p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-sp-semibold text-sp-text">
                                {board.title}
                              </span>
                              <span className="shrink-0 text-xs text-sp-muted">
                                포스트잇 {board.items.length}개
                              </span>
                            </div>
                            {/* 동기화 상태 칩 */}
                            {isPending ? (
                              <button
                                onClick={retrySync}
                                className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-sp-medium text-amber-400 transition-all hover:bg-amber-500/20"
                                title="다시 동기화 시도"
                              >
                                <span className="material-symbols-outlined text-sm">
                                  sync_problem
                                </span>
                                동기화 대기 중
                              </button>
                            ) : syncStatus === 'syncing' ? (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-sp-card px-2.5 py-1 text-xs font-sp-medium text-sp-muted">
                                <span className="material-symbols-outlined animate-spin text-sm">
                                  progress_activity
                                </span>
                                동기화 중
                              </span>
                            ) : (
                              <span className="flex shrink-0 items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-sp-medium text-green-400">
                                <span className="material-symbols-outlined text-sm">sensors</span>
                                공유 중
                              </span>
                            )}
                          </div>

                          {/* 링크 행 */}
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              readOnly
                              value={link}
                              onFocus={(e) => e.currentTarget.select()}
                              className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text outline-none"
                              aria-label="공유 링크"
                            />
                            <button
                              onClick={() => void handleCopy(link)}
                              className="flex shrink-0 items-center gap-1 rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs font-sp-medium text-sp-text transition-all hover:bg-sp-surface active:scale-95"
                              title="링크 복사"
                            >
                              <span className="material-symbols-outlined text-sm">
                                content_copy
                              </span>
                              복사
                            </button>
                            <button
                              onClick={() =>
                                setQrBoardId((prev) => (prev === board.id ? null : board.id))
                              }
                              className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-sp-medium transition-all active:scale-95 ${
                                qrBoardId === board.id
                                  ? 'border-sp-accent bg-sp-accent text-white'
                                  : 'border-sp-border bg-sp-card text-sp-text hover:bg-sp-surface'
                              }`}
                              title="QR 코드 보기"
                            >
                              <span className="material-symbols-outlined text-sm">qr_code_2</span>
                              QR
                            </button>
                            {board.shortUrl === undefined && (
                              <button
                                onClick={() => void createShortUrl(board.id)}
                                className="flex shrink-0 items-center gap-1 rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs font-sp-medium text-sp-text transition-all hover:bg-sp-surface active:scale-95"
                                title="짧은 링크 만들기"
                              >
                                <span className="material-symbols-outlined text-sm">compress</span>
                                짧은 링크
                              </button>
                            )}
                          </div>

                          {/* QR */}
                          {qrBoardId === board.id && qrDataUrl !== null && (
                            <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
                              <img
                                src={qrDataUrl}
                                alt={`${board.title} 공유 QR 코드`}
                                width={200}
                                height={200}
                              />
                            </div>
                          )}

                          {/* 공유 중지 (확인 단계) */}
                          <div className="mt-3 border-t border-sp-border pt-3">
                            {stopConfirmId === board.id ? (
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs leading-relaxed text-sp-muted">
                                  정말 중지할까요? 교실 화면에서 바로 사라지고, 드라이브에 올라간
                                  사본도 완전히 삭제돼요.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => void handleStopSharing(board.id)}
                                    disabled={stoppingId === board.id}
                                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-sp-semibold text-red-400 transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
                                  >
                                    {stoppingId === board.id ? '중지 중...' : '공유 중지'}
                                  </button>
                                  <button
                                    onClick={() => setStopConfirmId(null)}
                                    className="rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs font-sp-semibold text-sp-text transition-all hover:bg-sp-surface active:scale-95"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setStopConfirmId(board.id)}
                                className="flex items-center gap-1 text-xs font-sp-medium text-sp-muted transition-colors hover:text-red-400"
                              >
                                <span className="material-symbols-outlined text-sm">
                                  stop_circle
                                </span>
                                공유 중지
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── 새 보드 만들기 ── */}
              <section className="mt-5">
                <h3 className="text-sm font-sp-semibold text-sp-text">새로 공유하기</h3>

                {/* 최초 1회 개인정보 경고 */}
                {!warningAcknowledged && (
                  <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm leading-relaxed text-amber-400">
                      공유한 메모는 링크를 아는 누구나 볼 수 있어요. 학생 이름·연락처 같은
                      개인정보가 담긴 메모는 공유하지 말아 주세요. 공유를 중지하면 드라이브에서 바로
                      완전히 삭제돼요.
                    </p>
                    <button
                      onClick={acknowledgeWarning}
                      className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-sp-semibold text-slate-900 transition-all hover:brightness-110 active:scale-95"
                    >
                      확인했어요
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="보드 제목 (예: 우리 반 메모)"
                  maxLength={40}
                  className="mt-3 w-full rounded-xl border border-sp-border bg-sp-surface px-4 py-2.5 text-sm text-sp-text outline-none transition-colors placeholder:text-sp-muted focus:border-sp-accent"
                />

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-sp-muted">
                    공유할 포스트잇 선택{' '}
                    <span className="font-sp-semibold text-sp-text">
                      {selectedIds.size}/{MAX_ITEMS}
                    </span>
                  </p>
                  {activeMemos.length > 0 && (
                    <button
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.size === Math.min(activeMemos.length, MAX_ITEMS)
                            ? new Set()
                            : new Set(activeMemos.slice(0, MAX_ITEMS).map((m) => m.id)),
                        )
                      }
                      className="text-xs font-sp-medium text-sp-accent hover:underline"
                    >
                      전체 선택/해제
                    </button>
                  )}
                </div>

                {activeMemos.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-sp-border bg-sp-surface px-4 py-6 text-center text-sm text-sp-muted">
                    공유할 메모가 없어요. 먼저 메모를 작성해 주세요.
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {activeMemos.map((memo: Memo) => {
                      const checked = selectedIds.has(memo.id);
                      const full = !checked && selectedIds.size >= MAX_ITEMS;
                      return (
                        <button
                          key={memo.id}
                          onClick={() => toggleMemo(memo.id)}
                          disabled={full}
                          aria-pressed={checked}
                          className={`flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all active:scale-95 ${
                            checked
                              ? 'border-sp-accent bg-sp-surface ring-1 ring-sp-accent'
                              : 'border-sp-border bg-sp-surface hover:bg-sp-card'
                          } ${full ? 'opacity-40' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`h-3 w-3 rounded-full ${COLOR_DOT_BG[memo.color]}`} />
                            <span className="flex items-center gap-1">
                              {memo.image !== undefined && (
                                <span
                                  className="material-symbols-outlined text-sm text-sp-muted"
                                  title="이미지 포함"
                                >
                                  image
                                </span>
                              )}
                              <span
                                className={`material-symbols-outlined text-icon ${checked ? 'text-sp-accent' : 'text-sp-muted'}`}
                              >
                                {checked ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                            </span>
                          </div>
                          <p className="line-clamp-2 text-xs leading-relaxed text-sp-text">
                            {memo.content.trim() || (
                              <span className="italic text-sp-muted">내용 없음</span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* ── 푸터 ── */}
            <div className="flex items-center justify-end gap-2 border-t border-sp-border px-6 py-4">
              <button
                onClick={onClose}
                className="rounded-xl border border-sp-border bg-sp-surface px-4 py-2.5 text-sm font-sp-semibold text-sp-text transition-all hover:bg-sp-card active:scale-95"
              >
                닫기
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className="flex items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-icon">cast</span>
                {isCreating ? '공유 시작 중...' : '공유 시작'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
