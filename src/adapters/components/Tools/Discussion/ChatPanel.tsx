import { useRef, useEffect } from 'react';

interface ChatEntry {
  name: string;
  emoji: string;
  avatarColor: string;
  text: string;
  time: string;
}

interface StudentStance {
  id: string;
  name: string;
  emoji: string;
  avatarColor: string;
  signal: string;
  position: number;
}

interface ChatPanelProps {
  chats: ChatEntry[];
  students?: StudentStance[];
  toolType?: 'valueline' | 'trafficlight';
}

export type { ChatEntry };

function formatTime(isoTime: string): string {
  try {
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) return isoTime;
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return isoTime;
  }
}

function getStanceBadge(
  studentName: string,
  students: StudentStance[] | undefined,
  toolType: 'valueline' | 'trafficlight' | undefined
): React.ReactNode {
  if (!students || !toolType) return null;
  const student = students.find((s) => s.name === studentName);
  if (!student) return null;

  if (toolType === 'trafficlight') {
    const signalMap: Record<string, { dot: string; label: string }> = {
      red: { dot: 'bg-red-500', label: '반대' },
      yellow: { dot: 'bg-yellow-500', label: '보류' },
      green: { dot: 'bg-green-500', label: '찬성' },
    };
    const info = signalMap[student.signal];
    if (!info) return null;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        <span className={`w-2 h-2 rounded-full ${info.dot}`} />
        <span className="text-caption text-sp-muted">{info.label}</span>
      </span>
    );
  }

  // Value line
  const pos = student.position;
  let label: string;
  let colorClass: string;
  if (pos < 0.35) {
    label = '반대';
    colorClass = 'text-red-400';
  } else if (pos > 0.65) {
    label = '찬성';
    colorClass = 'text-blue-400';
  } else {
    label = '중립';
    colorClass = 'text-sp-muted';
  }
  return (
    <span className={`text-caption ml-1 ${colorClass}`}>{label}</span>
  );
}

export function ChatPanel({ chats, students, toolType }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats.length]);

  return (
    <div className="w-72 border-l border-sp-border flex flex-col h-full bg-sp-surface/30">
      <div className="px-4 py-3 border-b border-sp-border bg-sp-card/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent text-icon-sm">chat</span>
          <h3 className="text-xs font-bold text-sp-text tracking-wide">
            채팅
          </h3>
          <span className="ml-auto text-caption bg-sp-accent/15 text-sp-accent px-1.5 py-0.5 rounded-full font-medium">
            {chats.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-12 gap-2">
            <span className="material-symbols-outlined text-sp-border text-3xl">forum</span>
            <p className="text-xs text-sp-muted text-center">
              아직 채팅이 없습니다.
            </p>
          </div>
        ) : (
          chats.map((chat, idx) => (
            <div
              key={idx}
              className="bg-sp-card/60 rounded-xl px-3 py-2 border border-sp-border/50 hover:border-sp-border transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-caption font-bold shrink-0"
                  style={{ backgroundColor: chat.avatarColor || '#6366f1' }}
                >
                  {chat.emoji || '?'}
                </div>
                <span className="font-bold text-sp-text text-xs">{chat.name}</span>
                {getStanceBadge(chat.name, students, toolType)}
                <span className="ml-auto text-caption text-sp-muted font-mono">
                  {formatTime(chat.time)}
                </span>
              </div>
              <p className="text-sp-text text-xs leading-relaxed pl-[26px]">
                {chat.text}
              </p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
