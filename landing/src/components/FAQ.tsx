'use client';

import FadeIn from './FadeIn';

const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

const faqs = [
  {
    question: '무료인가요?',
    answer: '네, 완전 무료예요. 광고도 없어요.',
  },
  {
    question: '인터넷 없이도 되나요?',
    answer: '날씨와 급식을 제외한 모든 기능이 오프라인에서 동작해요.',
  },
  {
    question: '데이터는 어디에 저장되나요?',
    answer: '내 컴퓨터에만 저장돼요. 서버로 전송되지 않아서 개인정보 유출 걱정이 없어요.',
  },
  {
    question: '보안 경고가 뜨는데 괜찮은가요?',
    answer:
      '쌤핀은 안전한 프로그램이에요. 개인 개발 앱이라 아직 Microsoft 인증서가 없어서 경고가 뜰 수 있어요. "추가 정보 → 실행"을 클릭하시거나, 백신의 실시간 감시를 잠시 끄고 설치해보세요. 자세한 방법은 위의 "설치 안내" 섹션을 확인해주세요.',
  },
  {
    question: 'Mac에서도 쓸 수 있나요?',
    answer:
      '현재는 Windows만 지원해요. Mac 버전은 요청이 많으면 만들어볼게요!',
  },
  {
    question: '업데이트는 어떻게 하나요?',
    answer:
      '앱이 자동으로 새 버전을 알려줘요. 알림이 오면 "업데이트" 버튼만 누르면 돼요.',
  },
  {
    question: '학운위 심의를 받아야 하나요?',
    answer:
      '아니요. 쌤핀은 학생 개인정보를 수집·저장하지 않는 교사 개인용 도구예요. 모든 데이터는 선생님의 PC에만 저장되고 서버로 전송되지 않아요. 학운위 심의 대상은 "학생 개인정보를 수집·이용·제공·저장하는 소프트웨어"이므로, 쌤핀은 별도 심의 없이 사용 가능합니다.',
  },
];

export default function FAQ() {
  const handleOpenChat = () => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openChat = (window as any).__ssampin_open_chat;
      if (typeof openChat === 'function') {
        openChat();
      }
    }
  };

  return (
    <section className="bg-sp-surface py-20">
      <div className="mx-auto max-w-4xl px-6">
        <FadeIn>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            자주 묻는 질문
          </h2>
        </FadeIn>

        <div className="mt-10">
          {faqs.map((faq, i) => (
            <FadeIn key={faq.question} delay={i * 0.06}>
              <details className="group border-b border-sp-border/60 last:border-0">
                <summary className="flex cursor-pointer items-center justify-between py-5 font-medium text-sp-text">
                  <span>{faq.question}</span>
                  <span className="ml-4 shrink-0 text-sp-muted transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-sp-muted">
                  {faq.answer}
                </div>
              </details>
            </FadeIn>
          ))}
        </div>

        {/* 피드백 링크 */}
        <FadeIn delay={0.4}>
          <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-sp-border/40 bg-sp-card/50 p-6 text-center sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
            <p className="text-sm text-sp-muted">더 궁금한 것이 있으신가요?</p>
            <div className="flex gap-3">
              <button
                onClick={handleOpenChat}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sp-accent/10 px-4 py-2 text-sm font-medium text-blue-400 transition-colors hover:bg-sp-accent/20"
              >
                💬 AI에게 물어보기
              </button>
              <a
                href={FEEDBACK_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-4 py-2 text-sm font-medium text-sp-muted transition-colors hover:text-sp-text"
              >
                📋 건의사항 보내기
              </a>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
