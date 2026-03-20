/** AI 도움말 챗봇 타입 정의 */

export interface ChatImage {
  readonly id: string;
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly fileName: string;
  readonly size: number;
}

export interface HelpChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: number;
  readonly sources?: readonly string[];
  readonly confidence?: number;
  readonly isOffline?: boolean;
  readonly responseType?: 'answer' | 'escalation';
  readonly escalationType?: 'bug' | 'feature' | 'other';
  readonly images?: readonly ChatImage[];
  readonly feedbackState?: FeedbackState;
}

export interface ChatApiResponse {
  readonly type: 'answer' | 'escalation';
  readonly message: string;
  readonly sources?: readonly string[];
  readonly confidence?: number;
  readonly escalationType?: 'bug' | 'feature' | 'other';
}

export interface EscalationPayload {
  readonly type: 'bug' | 'feature' | 'other';
  readonly message: string;
  readonly email?: string;
  readonly appVersion?: string;
  readonly appSettings?: string;
}

export interface EscalationApiResponse {
  readonly ok: boolean;
  readonly message: string;
}

export type FeedbackState = 'pending' | 'resolved' | 'unresolved' | 'hidden';

export type HelpChatStatus = 'idle' | 'loading' | 'error' | 'escalation';
