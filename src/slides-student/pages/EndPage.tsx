/**
 * 학생 SPA 종료 화면.
 */

export function EndPage(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 text-center">
      <div className="text-6xl mb-6" aria-hidden>👋</div>
      <h1 className="text-xl font-bold mb-3">수업이 종료되었어요</h1>
      <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
        참여해 주셔서 고마워요.
        <br />
        창을 닫으셔도 됩니다.
      </p>
      <p className="mt-8 text-xs text-slate-500 max-w-sm">
        응답 데이터는 수업 후 180일 자동 삭제됩니다.
      </p>
    </div>
  );
}
