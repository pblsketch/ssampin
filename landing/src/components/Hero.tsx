'use client';

import { motion } from 'framer-motion';
import DownloadButton from './DownloadButton';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-sp-bg py-24 md:py-32">
      {/* 배경 블러 장식 */}
      <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-0 h-[400px] w-[400px] rounded-full bg-purple-500/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <p className="mb-6 text-5xl">📌</p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-sp-text md:text-6xl">
            중요한 걸 핀으로 꽂아두는
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              선생님의 대시보드
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg text-sp-muted md:text-xl">
            시간표, 좌석배치, 일정, 메모를
            <br className="hidden md:block" />
            한 화면에서 관리하세요
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
          className="mt-10"
        >
          <DownloadButton />
        </motion.div>
      </div>
    </section>
  );
}
