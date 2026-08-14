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
    answer:
      '시간표 직접 입력, 좌석배치, 메모, 할 일, 담임 기록 같은 핵심 기능은 오프라인에서 동작해요. 날씨, 급식 자동 조회, NEIS, Google 연동, 공유 링크가 필요한 기능은 인터넷이 필요합니다.',
  },
  {
    question: '데이터는 어디에 저장되나요?',
    answer:
      '출결·관찰·상담 기록, 시간표, 자리 배치 같은 본체 자료는 선생님 컴퓨터에만 저장돼요. 다만 학생·보호자와 온라인으로 주고받아야 하는 기능(과제 수합, 전자 서명, 설문, 상담 예약)을 쓰시면 그 기능에 필요한 자료가 Supabase 클라우드에 저장되고(과제 제출물만은 선생님의 Google 드라이브에 보관돼요), 앱 안의 AI 도우미에 질문하시면 질문 글이 답변 생성을 위해 업스테이지·Google로 전송돼요. Google 드라이브 백업은 이와 별개로, 켜신 경우에만 앱 데이터 사본이 선생님 드라이브의 쌤핀 전용 폴더에 저장됩니다. 어떤 자료가 어디로 가는지는 개인정보처리방침 제11조·제13조에 항목별로 적어두었습니다.',
  },
  {
    question: '보안 경고가 뜨는데 괜찮은가요?',
    answer:
      '쌤핀은 안전한 프로그램이에요. 개인 개발 앱이라 아직 Microsoft 인증서가 없어서 경고가 뜰 수 있어요. "추가 정보 → 실행"을 클릭하시거나, 백신의 실시간 감시를 잠시 끄고 설치해보세요. 자세한 방법은 위의 "설치 안내" 섹션을 확인해주세요.',
  },
  {
    question: 'Mac에서도 쓸 수 있나요?',
    answer:
      'macOS는 현재 베타로 지원해요. Apple Silicon(M1~M4)용과 Intel용 파일이 따로 있으니, 🍎 메뉴 → "이 Mac에 관하여"의 칩 항목을 확인하고 맞는 파일을 받아주세요. Apple 인증서가 없어 처음 실행 시 보안 경고가 뜨는데, 경고 창에서 "완료"를 누른 뒤 시스템 설정 → 개인정보 보호 및 보안에서 "그래도 열기"를 클릭하면 실행됩니다. 자세한 방법은 위의 설치 안내 섹션을 확인해주세요.',
  },
  {
    question: '업데이트는 어떻게 하나요?',
    answer:
      'Windows는 앱이 자동으로 새 버전을 알려주고, 알림에서 "업데이트" 버튼만 누르면 돼요. macOS(베타)는 자동 설치가 지원되지 않아, 알림에서 "새 버전 다운로드"를 누르면 받아지는 DMG 파일을 열어 응용 프로그램 폴더에 덮어쓰면 됩니다. 데이터는 그대로 유지돼요.',
  },
  {
    question: '구글 캘린더·드라이브 동기화가 안 돼요',
    answer:
      '설정의 Google 연동 탭에서 연결 상태를 확인하고, 연결 해제 후 다시 연결해보세요. 학교 네트워크나 인앱 브라우저가 Google 로그인을 막는 경우도 있어 Chrome/Safari 같은 외부 브라우저에서 다시 시도하면 해결되는 경우가 많아요. 자세한 순서는 사용 가이드의 Google 연동 문제 해결 문서에 정리해두었습니다.',
  },
  {
    question: '학운위 심의를 받아야 하나요?',
    answer:
      '심의 대상인지는 학교가 판단하실 사항이라 저희가 단정해 드리지 않습니다. 판단에 필요한 사실만 정확히 말씀드리면, 쌤핀은 학생 계정을 만들지 않고 학생에게서 직접 정보를 받지도 않지만, 선생님이 과제 수합·전자 서명 같은 협업 기능을 쓰시면 학생 이름이 클라우드에 저장됩니다. 그래서 심의가 필요하다고 보시는 학교를 위해 심의자료와 개인정보 관련 서식을 미리 준비해 두었으니 pblsketch@gmail.com으로 요청해 주세요. 자세한 처리 내역은 개인정보처리방침에 공개하고 있습니다.',
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
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">자주 묻는 질문</h2>
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
                <div className="pb-5 text-sm leading-relaxed text-sp-muted">{faq.answer}</div>
              </details>
            </FadeIn>
          ))}
        </div>

        {/* 피드백 링크 */}
        <FadeIn delay={0.4}>
          <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-sp-border bg-sp-card p-6 text-center shadow-sm sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
            <p className="text-sm text-sp-muted">더 궁금한 것이 있으신가요?</p>
            <div className="flex gap-3">
              <button
                onClick={handleOpenChat}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sp-accent/10 px-4 py-2 text-sm font-medium text-sp-accent transition-colors hover:bg-sp-accent/15"
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
