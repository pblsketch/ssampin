'use client';

import { useState, useTransition } from 'react';
import { login } from './actions';

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#0a0e17' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: '#1a2332', border: '1px solid #2a3548' }}
      >
        <h1
          className="text-2xl font-bold text-center mb-2"
          style={{ color: '#e2e8f0' }}
        >
          관리자 인증
        </h1>
        <p
          className="text-sm text-center mb-8"
          style={{ color: '#94a3b8' }}
        >
          쌤핀 관리자 페이지에 접근하려면 비밀번호를 입력하세요.
        </p>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            required
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: '#0a0e17',
              border: '1px solid #2a3548',
              color: '#e2e8f0',
              '--tw-ring-color': '#3b82f6',
            } as React.CSSProperties}
          />

          {error && (
            <p className="text-sm text-center" style={{ color: '#f87171' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
          >
            {isPending ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
