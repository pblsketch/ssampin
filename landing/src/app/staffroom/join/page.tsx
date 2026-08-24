import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '온라인 교무실 초대 | 쌤핀',
  description: '쌤핀 온라인 교무실 부서 초대를 받으셨습니다. 초대 코드를 확인하세요.',
  robots: { index: false, follow: false },
};

/**
 * 온라인 교무실 초대 링크 착지 페이지.
 *
 * 관리자가 발급한 초대 링크(https://www.ssampin.com/staffroom/join?code=XXXXXX)를
 * 단체방·문자로 받은 선생님이 누르면 여기로 온다.
 *
 * **여기서 부서에 들어가지는 않는다.** 입장은 쌤핀 앱 안에서 구글 로그인으로만 이뤄진다
 * (계획서 §7 — 링크·코드는 초대장일 뿐 열쇠가 아니다). 이 페이지가 하는 일은
 * 코드를 크게 보여주고 앱에서 어디를 눌러야 하는지 알려주는 것뿐이다.
 */

/** 초대 코드 형식 — 혼동 문자를 뺀 31자 알파벳 6자리 (앱과 같은 규칙) */
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

function normalizeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const STEPS = [
  '컴퓨터에서 쌤핀을 엽니다.',
  '설정 > 실험실 기능에서 "온라인 교무실"을 켜고 저장합니다. (이미 켜져 있으면 건너뜁니다)',
  '왼쪽 메뉴에서 온라인 교무실을 누릅니다.',
  '초대 코드로 참여를 누르고 위 코드를 넣습니다.',
  '구글 계정으로 본인 확인을 하면 부서에 들어갑니다.',
];

export default async function StaffRoomJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const code = normalizeCode(params.code);

  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-sp-muted transition-colors hover:text-sp-text"
          >
            <span aria-hidden="true">←</span>
            <span>쌤핀 홈으로</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">온라인 교무실 초대</h1>
        <p className="mt-2 text-sp-muted">
          선생님을 부서에 초대했습니다. 아래 코드를 쌤핀 앱에 넣어주세요.
        </p>

        {code ? (
          <div className="mt-8 rounded-xl border border-sp-border bg-sp-card p-8 text-center">
            <p className="text-sm text-sp-muted">초대 코드</p>
            <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-sp-accent">
              {code}
            </p>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-sp-border bg-sp-card p-8">
            <p className="font-semibold">초대 코드를 찾지 못했습니다.</p>
            <p className="mt-2 text-sm text-sp-muted">
              링크가 잘린 것 같습니다. 초대해 주신 선생님께 코드를 직접 여쭤보시고, 쌤핀 앱에서
              <span className="text-sp-text"> 설정 &gt; 실험실 기능</span>의 온라인 교무실을 켠 뒤
              <span className="text-sp-text"> 온라인 교무실 &gt; 초대 코드로 참여</span>에
              넣어주세요.
            </p>
          </div>
        )}

        <ol className="mt-8 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 rounded-lg border border-sp-border bg-sp-card p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-sm font-bold text-sp-bg">
                {index + 1}
              </span>
              <span className="text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm text-sp-muted">
          이 링크만으로는 부서에 들어갈 수 없습니다. 실제 입장은 쌤핀 앱에서 구글 계정으로 본인을
          확인한 뒤에 이뤄지고, 누가 언제 들어왔는지 관리자 화면에 남습니다.
        </p>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-sp-accent px-5 py-3 text-sm font-semibold text-sp-bg transition-opacity hover:opacity-90"
          >
            쌤핀 내려받기
          </Link>
        </div>
      </main>
    </div>
  );
}
