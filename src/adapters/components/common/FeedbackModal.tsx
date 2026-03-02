import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

type FeedbackCategory = '버그 신고' | '기능 제안' | 'UI/UX 개선' | '기타';

const CATEGORIES: FeedbackCategory[] = ['버그 신고', '기능 제안', 'UI/UX 개선', '기타'];

const CATEGORY_ICONS: Record<FeedbackCategory, string> = {
  '버그 신고': 'bug_report',
  '기능 제안': 'lightbulb',
  'UI/UX 개선': 'palette',
  '기타': 'chat',
};

interface FeedbackModalProps {
  onClose: () => void;
}

type ModalState = 'form' | 'sent';

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { settings } = useSettingsStore();
  const feedbackEmail = settings.feedback?.email ?? 'pblsketch@gmail.com';
  const feedbackFormUrl = settings.feedback?.formUrl ?? '';

  const [state, setState] = useState<ModalState>('form');
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [clipboardCopied, setClipboardCopied] = useState(false);

  function buildMailtoBody(): string {
    const parts: string[] = [];
    if (category) parts.push(`[카테고리] ${category}`);
    parts.push(`[내용]\n${content.trim()}`);
    if (contact.trim()) parts.push(`[연락처] ${contact.trim()}`);
    return parts.join('\n\n');
  }

  function buildClipboardText(): string {
    const parts: string[] = [];
    if (category) parts.push(`카테고리: ${category}`);
    parts.push(`내용:\n${content.trim()}`);
    if (contact.trim()) parts.push(`연락처: ${contact.trim()}`);
    return parts.join('\n\n');
  }

  async function handleSubmit() {
    if (!content.trim()) return;

    // TODO: Google Forms 연동 시 feedbackFormUrl이 있으면 fetch POST로 전송
    // if (feedbackFormUrl) {
    //   try {
    //     await fetch(feedbackFormUrl, { method: 'POST', body: ... });
    //     setState('sent');
    //     return;
    //   } catch { /* fall through to clipboard */ }
    // }
    void feedbackFormUrl; // 미래 연동을 위해 참조 유지

    // 클립보드 복사
    try {
      await navigator.clipboard.writeText(buildClipboardText());
      setClipboardCopied(true);
    } catch {
      // 클립보드 API 실패 시 무시
    }

    // mailto 열기 (보조 수단)
    const subject = encodeURIComponent(`[쌤핀 건의사항]${category ? ` ${category}` : ''}`);
    const body = encodeURIComponent(buildMailtoBody());
    window.open(`mailto:${feedbackEmail}?subject=${subject}&body=${body}`);

    setState('sent');
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(feedbackEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={state === 'form' ? onClose : undefined}
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-md pointer-events-auto flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">rate_review</span>
              </div>
              <h2 className="text-lg font-bold text-sp-text">건의사항 보내기</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-sp-muted hover:text-sp-text transition-colors rounded-lg p-1 hover:bg-white/5"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {state === 'form' ? (
            /* ── 입력 폼 ── */
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* 카테고리 */}
              <div>
                <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">
                  카테고리 <span className="normal-case font-normal">(선택)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(category === cat ? null : cat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        category === cat
                          ? 'bg-sp-accent text-white border-sp-accent shadow-md shadow-sp-accent/20'
                          : 'border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text hover:bg-white/5'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">{CATEGORY_ICONS[cat]}</span>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 내용 */}
              <div>
                <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-2">내용</p>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="개선해주셨으면 하는 점을 자유롭게 적어주세요"
                  rows={4}
                  className="w-full bg-sp-surface border border-sp-border rounded-xl px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:ring-2 focus:ring-sp-accent/50 focus:border-sp-accent/50 resize-none transition-colors"
                />
              </div>

              {/* 연락처 */}
              <div>
                <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-2">
                  연락처 <span className="normal-case font-normal">(선택)</span>
                </p>
                <input
                  type="email"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="회신 받으실 이메일 (선택)"
                  className="w-full bg-sp-surface border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:ring-2 focus:ring-sp-accent/50 focus:border-sp-accent/50 transition-colors"
                />
              </div>

              {/* 버튼 */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-sp-border text-sp-muted hover:text-sp-text hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!content.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-sp-accent hover:bg-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  보내기
                </button>
              </div>
            </div>
          ) : (
            /* ── 전송 후 안내 ── */
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* 클립보드 복사 성공 배너 */}
              {clipboardCopied && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <span className="material-symbols-outlined text-green-400 shrink-0 text-[20px] mt-0.5">
                    content_copy
                  </span>
                  <p className="text-sm text-green-300 leading-relaxed">
                    건의사항 내용이 클립보드에 복사되었습니다.
                  </p>
                </div>
              )}

              {/* 안내 메시지 */}
              <div className="flex flex-col gap-2">
                <p className="text-sm text-sp-text leading-relaxed">
                  메일 앱이 열렸다면 그대로 보내주세요.
                </p>
                <p className="text-sm text-sp-muted leading-relaxed">
                  열리지 않았다면 아래 이메일에 복사한 내용을 붙여넣기 해주세요.
                </p>
              </div>

              {/* 이메일 주소 + 복사 버튼 */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-sp-surface border border-sp-border">
                <span className="material-symbols-outlined text-sp-muted text-[18px]">mail</span>
                <span className="text-sm text-sp-text font-medium flex-1 select-all">{feedbackEmail}</span>
                <button
                  type="button"
                  onClick={copyEmail}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    emailCopied
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border hover:border-sp-accent/50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {emailCopied ? 'check' : 'content_copy'}
                  </span>
                  {emailCopied ? '복사됨' : '복사'}
                </button>
              </div>

              {/* 다시 메일 열기 버튼 */}
              <button
                type="button"
                onClick={() => {
                  const subject = encodeURIComponent(`[쌤핀 건의사항]${category ? ` ${category}` : ''}`);
                  const body = encodeURIComponent(buildMailtoBody());
                  window.open(`mailto:${feedbackEmail}?subject=${subject}&body=${body}`);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-muted hover:text-sp-text hover:bg-white/5 text-sm font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                메일 앱 다시 열기
              </button>

              {/* 확인 버튼 */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-sp-accent hover:bg-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-sp-accent/20 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">check</span>
                확인
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
