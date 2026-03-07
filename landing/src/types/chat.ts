/** AI 챗봇 관련 타입 정의 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
  confidence?: number;
}

export interface ChatResponseAnswer {
  type: 'answer';
  message: string;
  sources: string[];
  confidence: number;
}

export interface ChatResponseEscalation {
  type: 'escalation';
  message: string;
  escalationType: 'bug' | 'feature' | 'other';
}

export type ChatResponse = ChatResponseAnswer | ChatResponseEscalation;

export interface EscalationData {
  sessionId: string;
  type: 'bug' | 'feature' | 'other';
  message: string;
  email?: string;
  appVersion?: string;
}

export interface EscalationResponse {
  ok: boolean;
  message: string;
}

export type ChatStatus = 'idle' | 'loading' | 'error' | 'escalation';
