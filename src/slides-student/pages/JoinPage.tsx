/**
 * 학생 SPA 입장 화면 (Plan §2-1).
 *
 * 6자 참여코드 + 이름 입력. 200자 자동 삭제 고지 포함 (PIPA §11.1).
 */

import { useEffect, useState } from 'react';

const SHORT_CODE_REGEX = /^[ACDEFGHJKLMNPQRTUVWXY3479]{6}$/;

export interface JoinPageProps {
  readonly defaultCode: string;
  readonly joining: boolean;
  readonly error: string | null;
  readonly onJoin: (sessionCode: string, studentName: string) => void;
}

export function JoinPage({
  defaultCode,
  joining,
  error,
  onJoin,
}: JoinPageProps): JSX.Element {
  const [code, setCode] = useState(defaultCode.toUpperCase());
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (defaultCode) setCode(defaultCode.toUpperCase());
  }, [defaultCode]);

  const codeValid = SHORT_CODE_REGEX.test(code);
  const nameValid = name.trim().length > 0 && name.trim().length <= 20;
  const canSubmit = codeValid && nameValid && !joining;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onJoin(code, name.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4 py-8">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
        <header className="text-center space-y-2">
          <div className="text-4xl" aria-hidden>📊</div>
          <h1 className="text-xl font-bold">수업 들어가기</h1>
          <p className="text-sm text-slate-400">
            선생님이 알려준 코드를 입력해 주세요.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-xs text-slate-400 mb-1">
              참여 코드 (6자)
            </label>
            <input
              id="code"
              type="text"
              autoFocus
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-center text-2xl font-mono tracking-[0.4em] uppercase focus:outline-none focus:border-blue-500"
              aria-invalid={touched && !codeValid}
              placeholder="------"
            />
            {touched && !codeValid && (
              <p className="mt-1 text-xs text-red-400">
                헷갈리는 글자는 빠져 있어요. 코드를 다시 확인해 주세요.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-xs text-slate-400 mb-1">
              이름
            </label>
            <input
              id="name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              maxLength={20}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base focus:outline-none focus:border-blue-500"
              aria-invalid={touched && !nameValid}
              placeholder="홍길동"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-400/30 rounded-lg text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-4 py-3 bg-blue-500 text-white font-bold rounded-xl text-sm hover:bg-blue-500/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {joining ? '연결 중…' : '들어가기'}
          </button>

          <p className="text-xs text-slate-500 text-center">
            응답 데이터는 수업 후 180일 자동 삭제됩니다.
          </p>
        </form>
      </div>
    </div>
  );
}
