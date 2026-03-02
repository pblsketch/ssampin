'use client';

import { motion } from 'framer-motion';
import DownloadButton from './DownloadButton';

export default function Hero() {
  return (
    <section className="relative bg-sp-bg py-24 md:py-36">
      {/* 상단 구분선 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-sp-border/60" />

      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_auto] md:items-end md:gap-16">

          {/* 왼쪽: 헤드라인 */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* 배지 */}
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sp-border bg-sp-surface px-3.5 py-1.5">
                <span className="text-xs text-sp-accent">●</span>
                <span className="text-xs font-medium tracking-wide text-sp-muted">
                  Windows 교사용 대시보드
                </span>
              </div>

              {/* 헤드라인 */}
              <h1 className="text-[2.6rem] font-extrabold leading-[1.18] tracking-tight text-sp-text md:text-[3.75rem]">
                중요한 걸{' '}
                <br className="md:hidden" />
                핀으로 꽂아두는
                <br />
                <span className="text-white">선생님의 대시보드</span>
              </h1>

              {/* 서브 카피 */}
              <p className="mt-6 max-w-xl text-base leading-relaxed text-sp-muted md:text-lg">
                시간표, 자리 배치, 일정, 급식, 날씨, 쌤도구까지
                <br className="hidden md:block" />
                한 화면에서 관리하세요.
              </p>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10"
            >
              <DownloadButton />
            </motion.div>
          </div>

          {/* 오른쪽: 통계 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="hidden flex-col gap-px overflow-hidden rounded-2xl border border-sp-border md:flex"
          >
            {[
              { label: '핵심 기능', value: '9가지', sub: '올인원' },
              { label: '완전 무료', value: '₩0', sub: '광고 없음' },
              { label: '오프라인', value: '100%', sub: '로컬 저장' },
            ].map((stat, i) => (
              <div
                key={i}
                className="flex min-w-[160px] flex-col gap-0.5 bg-sp-surface px-6 py-5"
              >
                <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-muted">
                  {stat.label}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-sp-text">
                    {stat.value}
                  </span>
                  <span className="text-xs text-sp-muted">{stat.sub}</span>
                </div>
              </div>
            ))}
          </motion.div>

        </div>

        {/* 하단 구분선 + 키워드 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-16 flex items-center gap-6 border-t border-sp-border pt-6"
        >
          <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-border">
            포함 기능
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {[
              '시간표',
              '자리 배치',
              '일정 관리',
              '급식 정보',
              '날씨 · 미세먼지',
              '쌤도구',
              'PIN 잠금',
              '미니 창 모드',
            ].map((kw) => (
              <span key={kw} className="text-xs text-sp-muted">
                {kw}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
