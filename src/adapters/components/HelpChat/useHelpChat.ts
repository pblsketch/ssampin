import { useState, useCallback, useRef, useEffect } from 'react';
import { searchOfflineFaq, searchOfflineFaqWithScore } from './offlineFaq';
import { fileToDataUrl, resizeImage } from './imageUtils';
import type {
  HelpChatMessage,
  HelpChatStatus,
  ChatApiResponse,
  ChatImage,
  EscalationPayload,
  EscalationApiResponse,
  FeedbackState,
} from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const CHAT_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-chat` : '';
const ESCALATE_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-escalate` : '';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 페이지 ID → 한국어 이름 매핑 */
const PAGE_NAMES: Record<string, string> = {
  dashboard: '대시보드',
  timetable: '시간표',
  seating: '자리배치',
  schedule: '일정 관리',
  homeroom: '담임 업무',
  'student-records': '학생 기록',
  todo: '할일',
  memo: '메모',
  meal: '급식',
  'class-management': '수업 관리',
  settings: '설정',
  export: '내보내기',
  tools: '쌤도구',
  bookmarks: '북마크',
};

/** 앱 컨텍스트 정보 (챗봇 API에 전달) */
function getAppContext(): { summary: string; currentPage: string } {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  const platform = navigator.platform;
  const screen = `${window.screen.width}x${window.screen.height}`;
  const currentPage = (window as any).__ssampin_current_page as string | undefined;
  const pageName = currentPage ? (PAGE_NAMES[currentPage] ?? currentPage) : '알 수 없음';
  return {
    summary: `[앱 v${version}, ${platform}, ${screen}, 현재 페이지: ${pageName}]`,
    currentPage: pageName,
  };
}

const WELCOME_MESSAGE: HelpChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '안녕하세요! 🎓 쌤핀 AI 도우미예요.\n\n쌤핀의 기능이나 사용법에 대해 궁금한 점이 있으면 편하게 물어보세요!\n\n예시:\n- "시간표 설정은 어떻게 하나요?"\n- "좌석 배치 방법을 알려주세요"\n- "위젯 모드가 뭔가요?"',
  timestamp: Date.now(),
};

/** 주제별 후속 질문 추천 매핑 */
const FOLLOW_UP_MAP: Record<string, string[]> = {
  '시간표': ['NEIS 시간표가 안 나와요', '과목 색상 바꾸기', '교사 시간표 설정'],
  '위젯': ['위젯 항상 위에 고정', '위젯에 보이는 정보 변경', '위젯 모드 종료'],
  '설정': ['테마 바꾸기', '폰트 변경', 'PIN 잠금 설정'],
  '자리': ['랜덤 배치 조건 설정', '짝꿍 모드 사용법', '자리배치 내보내기'],
  '일정': ['D-Day 추가하기', 'Google 캘린더 연동', 'NEIS 학사일정 연동'],
  '동기화': ['모바일 앱 연결 방법', 'Google Drive 백업', '데이터 복원'],
  '메모': ['메모 색상 변경', '메모 크기 조절', '위젯에서 메모 보기'],
  '급식': ['급식 알레르기 정보', '급식이 안 나와요'],
  '할일': ['우선순위 설정', '반복 할일 만들기', '할일 보관함'],
  '내보내기': ['엑셀로 내보내기', '한글(HWPX) 내보내기', 'PDF 내보내기'],
};

function getSuggestedQuestions(question: string, answer: string): string[] {
  const text = question + ' ' + answer;
  for (const [keyword, questions] of Object.entries(FOLLOW_UP_MAP)) {
    if (text.includes(keyword)) {
      return questions.slice(0, 3);
    }
  }
  return [];
}

/** AI 도움말 채팅 훅 */
export function useHelpChat() {
  const [messages, setMessages] = useState<HelpChatMessage[]>([WELCOME_MESSAGE]);
  const [status, setStatus] = useState<HelpChatStatus>('idle');
  const [escalationType, setEscalationType] = useState<'bug' | 'feature' | 'other' | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sessionIdRef = useRef(generateId());

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    const api = window.electronAPI;
    if (api?.onNetworkChange) {
      return api.onNetworkChange((online) => setIsOnline(online));
    }
    // 브라우저 폴백
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  /** 어시스턴트 메시지 추가 (피드백 상태 포함) */
  const addAssistantMessage = useCallback((content: string, extra?: Partial<HelpChatMessage>) => {
    const msg: HelpChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      feedbackState: 'pending',
      ...extra,
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  /** 메시지의 피드백 상태 변경 */
  const setMessageFeedback = useCallback((messageId: string, state: FeedbackState) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedbackState: state } : m)),
    );
  }, []);

  /** 모든 pending 피드백을 hidden으로 변경 */
  const hideAllPendingFeedback = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.feedbackState === 'pending' ? { ...m, feedbackState: 'hidden' as FeedbackState } : m,
      ),
    );
  }, []);

  /** 피드백에서 "개발자에게 전달" — 최근 대화를 에스컬레이션 */
  const escalateFromFeedback = useCallback(async () => {
    if (!isOnline || !ESCALATE_ENDPOINT || !SUPABASE_ANON_KEY) return;

    const lastUser = messages.filter((m) => m.role === 'user').pop();
    const lastBot = messages.filter((m) => m.role === 'assistant').pop();

    try {
      await fetch(ESCALATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          type: 'other',
          message: `[챗봇 미해결 피드백]\nQ: ${lastUser?.content ?? '(없음)'}\nA: ${lastBot?.content?.slice(0, 500) ?? '(없음)'}`,
          sessionId: sessionIdRef.current,
          appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
          appSettings: getAppContext().summary,
        }),
      });
    } catch {
      // 전송 실패는 무시 — 사용자에게 이미 UI로 안내
    }
  }, [messages, isOnline]);

  /** 오프라인 FAQ 응답 */
  const handleOfflineResponse = useCallback((query: string) => {
    const matches = searchOfflineFaq(query);
    if (matches.length > 0) {
      const content = matches
        .map((m) => `**Q: ${m.question}**\n${m.answer}`)
        .join('\n\n');
      const suggested = getSuggestedQuestions(query, content);
      addAssistantMessage(content, { isOffline: true, suggestedQuestions: suggested.length > 0 ? suggested : undefined });
    } else {
      addAssistantMessage(
        '현재 오프라인 상태예요. 인터넷에 연결하면 더 정확한 답변을 받으실 수 있어요!\n\n기본 FAQ에서 답을 찾지 못했어요.',
        { isOffline: true },
      );
    }
  }, [addAssistantMessage]);

  /** File[] → ChatImage[] 변환 */
  const convertFilesToChatImages = useCallback(async (files: File[]): Promise<ChatImage[]> => {
    const results: ChatImage[] = [];
    for (const file of files) {
      const raw = await fileToDataUrl(file);
      const dataUrl = await resizeImage(raw);
      results.push({
        id: generateId(),
        dataUrl,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
      });
    }
    return results;
  }, []);

  /** 메시지 전송 */
  const sendMessage = useCallback(async (text: string, imageFiles?: File[]) => {
    const trimmed = text.trim();
    if (!trimmed && (!imageFiles || imageFiles.length === 0)) return;
    if (status === 'loading') return;

    // 이미지 변환
    let chatImages: ChatImage[] | undefined;
    if (imageFiles && imageFiles.length > 0) {
      try {
        chatImages = await convertFilesToChatImages(imageFiles);
      } catch {
        // 이미지 변환 실패 시 텍스트만 전송
      }
    }

    // 이전 pending 피드백 숨기기
    hideAllPendingFeedback();

    // 유저 메시지 추가
    const userMsg: HelpChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      ...(chatImages && chatImages.length > 0 ? { images: chatImages } : {}),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStatus('loading');
    setEscalationType(null);

    // 오프라인이거나 API 미설정 → 로컬 FAQ
    if (!isOnline || !CHAT_ENDPOINT || !SUPABASE_ANON_KEY) {
      handleOfflineResponse(trimmed);
      setStatus('idle');
      return;
    }

    // FAQ-first 하이브리드: 고신뢰 FAQ 매칭 시 즉시 답변 표시
    const faqResults = searchOfflineFaqWithScore(trimmed);
    const topFaq = faqResults[0];
    if (topFaq !== undefined && topFaq.score >= 4) {
      const faqContent = faqResults
        .map((r) => `**Q: ${r.faq.question}**\n${r.faq.answer}`)
        .join('\n\n');
      const faqSuggested = getSuggestedQuestions(trimmed, faqContent);
      addAssistantMessage(`💡 빠른 답변이에요:\n\n${faqContent}`, {
        isOffline: false,
        suggestedQuestions: faqSuggested.length > 0 ? faqSuggested : undefined,
      });
      // 고신뢰 FAQ로 충분히 답변 가능 — API 호출 생략으로 응답 속도 향상
      if (topFaq.score >= 6) {
        setStatus('idle');
        return;
      }
      // 중간 신뢰도(4-5)면 API도 호출하여 더 정확한 답변 보강
    }

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      // API용 이미지 데이터 (base64 순수 데이터만 전송)
      const apiImages = chatImages?.map((img) => ({
        mimeType: img.mimeType,
        data: img.dataUrl.replace(/^data:image\/\w+;base64,/, ''),
      }));

      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionIdRef.current,
          history,
          source: 'app',
          appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
          isTest: !!import.meta.env.DEV,
          appContext: getAppContext().currentPage,
          ...(apiImages && apiImages.length > 0 ? { images: apiImages } : {}),
        }),
      });

      if (res.status === 429) {
        addAssistantMessage('⏳ 잠시 후 다시 시도해 주세요. 요청이 너무 많아요.');
        setStatus('idle');
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as ChatApiResponse;

      if (data.type === 'escalation') {
        addAssistantMessage(data.message, {
          responseType: 'escalation',
          escalationType: data.escalationType,
        });
        setEscalationType(data.escalationType ?? 'other');
        setStatus('escalation');
      } else {
        const suggested = data.suggestedQuestions ?? getSuggestedQuestions(trimmed, data.message);
        addAssistantMessage(data.message, {
          sources: data.sources,
          confidence: data.confidence,
          responseType: 'answer',
          suggestedQuestions: suggested.length > 0 ? suggested : undefined,
        });
        setStatus('idle');
      }
    } catch {
      // 네트워크 에러 → 오프라인 폴백
      const matches = searchOfflineFaq(trimmed);
      if (matches.length > 0) {
        const content = `⚡ 네트워크 연결이 불안정해요. 로컬 FAQ에서 찾은 답변이에요:\n\n${matches.map((m) => `**Q: ${m.question}**\n${m.answer}`).join('\n\n')}`;
        addAssistantMessage(content, { isOffline: true });
      } else {
        addAssistantMessage(
          '네트워크 연결이 불안정해요. 인터넷 연결을 확인해 주세요!',
          { isOffline: true },
        );
      }
      setStatus('error');
    }
  }, [messages, status, isOnline, handleOfflineResponse, addAssistantMessage, convertFilesToChatImages, hideAllPendingFeedback]);

  /** 에스컬레이션 제출 */
  const submitEscalation = useCallback(async (data: EscalationPayload, imageFiles?: File[]) => {
    setStatus('loading');

    if (!isOnline || !ESCALATE_ENDPOINT || !SUPABASE_ANON_KEY) {
      addAssistantMessage(
        '오프라인 상태에서는 전달이 어려워요. 인터넷에 연결한 후 다시 시도해 주세요.',
        { isOffline: true },
      );
      setEscalationType(null);
      setStatus('idle');
      return;
    }

    try {
      // 스크린샷 이미지 변환
      let apiImages: { mimeType: string; data: string }[] | undefined;
      if (imageFiles && imageFiles.length > 0) {
        const chatImages = await convertFilesToChatImages(imageFiles);
        apiImages = chatImages.map((img) => ({
          mimeType: img.mimeType,
          data: img.dataUrl.replace(/^data:image\/\w+;base64,/, ''),
        }));
      }

      const res = await fetch(ESCALATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          ...data,
          sessionId: sessionIdRef.current,
          appVersion: data.appVersion ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined),
          appSettings: getAppContext().summary,
          ...(apiImages && apiImages.length > 0 ? { images: apiImages } : {}),
        }),
      });

      const result = (await res.json()) as EscalationApiResponse;
      addAssistantMessage(
        result.ok
          ? '✅ 전달 완료! 빠르게 확인하겠습니다. 다른 질문이 있으면 편하게 물어보세요!'
          : '전달 중 문제가 발생했어요. 나중에 다시 시도해 주세요.',
      );
      setEscalationType(null);
      setStatus('idle');
    } catch {
      addAssistantMessage('전달 중 오류가 발생했어요. 나중에 다시 시도해 주세요.');
      setStatus('error');
    }
  }, [isOnline, addAssistantMessage, convertFilesToChatImages]);

  /** 에스컬레이션 취소 */
  const cancelEscalation = useCallback(() => {
    setEscalationType(null);
    setStatus('idle');
    addAssistantMessage('알겠어요! 다른 궁금한 점이 있으면 물어보세요 😊');
  }, [addAssistantMessage]);

  /** 대화 초기화 */
  const clearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setStatus('idle');
    setEscalationType(null);
    sessionIdRef.current = generateId();
  }, []);

  return {
    messages,
    status,
    escalationType,
    isOnline,
    sessionId: sessionIdRef.current,
    sendMessage,
    submitEscalation,
    cancelEscalation,
    clearChat,
    setMessageFeedback,
    hideAllPendingFeedback,
    escalateFromFeedback,
  };
}
