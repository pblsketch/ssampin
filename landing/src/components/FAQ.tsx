import FadeIn from './FadeIn';

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
    question: 'Mac에서도 쓸 수 있나요?',
    answer:
      '현재는 Windows만 지원해요. Mac 버전은 요청이 많으면 만들어볼게요!',
  },
  {
    question: '데이터는 어디에 저장되나요?',
    answer: '내 컴퓨터에만 저장돼요. 서버로 전송되지 않아요.',
  },
  {
    question: '업데이트는 어떻게 하나요?',
    answer:
      '앱이 자동으로 새 버전을 알려줘요. 알림이 오면 "업데이트" 버튼만 누르면 돼요.',
  },
  {
    question: '바이러스 아닌가요? 경고가 떠요!',
    answer:
      '개인 개발 앱이라 Microsoft 인증서가 아직 없어요. "추가 정보 → 실행"을 눌러주시면 안전하게 설치돼요.',
  },
  {
    question: '급식 정보는 어떻게 나오나요?',
    answer:
      'NEIS(나이스) 공식 API에서 자동으로 가져와요. 설정에서 학교만 검색하면 매일 급식이 표시돼요.',
  },
  {
    question: '쌤도구는 뭔가요?',
    answer:
      '타이머, 랜덤 뽑기, 점수판, 룰렛, 주사위, 투표, QR코드 등 수업에 바로 쓸 수 있는 12가지 교실 도구예요.',
  },
  {
    question: 'PIN 잠금은 왜 필요한가요?',
    answer:
      '학생이 볼 수 있는 상황에서 담임메모나 성적 같은 민감한 정보를 보호할 수 있어요. 기능별로 잠금을 설정할 수 있어요.',
  },
];

export default function FAQ() {
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
      </div>
    </section>
  );
}
