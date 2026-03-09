import FadeIn from './FadeIn';

const tools = [
  { emoji: '⏱️', name: '타이머', desc: '시간 제한 활동에 딱!' },
  { emoji: '🔀', name: '랜덤 뽑기', desc: '공정한 발표자 선정' },
  { emoji: '🚦', name: '신호등', desc: '활동 시작과 멈춤' },
  { emoji: '📊', name: '점수판', desc: '팀별 점수 관리' },
  { emoji: '🎯', name: '룰렛', desc: '돌려서 정하기' },
  { emoji: '🎲', name: '주사위', desc: '운에 맡겨볼까?' },
  { emoji: '🪙', name: '동전', desc: '앞? 뒤?' },
  { emoji: '🔗', name: 'QR코드', desc: '링크를 순식간에 공유' },
  { emoji: '🤫', name: '활동 기호', desc: '수업 모드를 한눈에' },
  { emoji: '🗳️', name: '투표', desc: '의견을 모아봐요' },
  { emoji: '📝', name: '주관식 설문', desc: '자유롭게 의견을 들어봐요' },
  { emoji: '☁️', name: '워드클라우드', desc: '떠오르는 단어를 모아봐요' },
  { emoji: '🪑', name: '자리 뽑기', desc: '내 손으로 뽑는 내 자리' },
  { emoji: '🌳', name: '숲소리', desc: '교육 웹진' },
  { emoji: '🎯', name: 'PBL스케치', desc: '수업 및 평가 설계 도구' },
  { emoji: '📎', name: '과제수합', desc: '링크 하나로 과제 수합' },
];

export default function ClassroomTools() {
  return (
    <section className="bg-sp-bg py-16">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            쌤도구 16가지
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            수업에 바로 쓰는 쌤도구
          </h2>
          <p className="mt-3 text-base text-sp-muted">
            타이머, 투표, 워드클라우드, QR코드까지 — 클릭 한 번이면 준비 끝
          </p>
        </FadeIn>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tools.map((tool, i) => (
            <FadeIn key={tool.name} delay={i * 0.04}>
              <div className="rounded-lg bg-white/[0.03] p-4 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">{tool.emoji}</p>
                <p className="mt-2 text-sm font-semibold text-sp-text">{tool.name}</p>
                <p className="mt-0.5 text-xs text-sp-muted">{tool.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
