/* ─────────────────── Word Cloud Utilities ─────────────────── */

export interface WordEntry {
  word: string;
  count: number;
  color: string;
  rotation: number;
}

export const WORD_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'];

export const KOREAN_STOPWORDS = new Set([
  '이', '가', '을', '를', '의', '에', '은', '는', '으로', '와', '과', '도', '만',
  '에서', '로', '이다', '하다', '것', '수', '있다', '없다', '그', '이런', '저런',
  '좋다', '나', '우리', '그냥', '그리고', '하지만', '그러나', '때문에', '위해',
]);

export const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'this', 'that', 'it', 'and', 'or',
  'but', 'not', 'so',
]);

export function buildWordFrequency(texts: string[], applyStopwords: boolean): WordEntry[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/[.,!?;:'"()\[\]{}<>~@#$%^&*+=|\\/_\-\d]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    for (const word of words) {
      if (applyStopwords && (KOREAN_STOPWORDS.has(word) || ENGLISH_STOPWORDS.has(word))) continue;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  return sorted.map(([word, count], idx) => ({
    word,
    count,
    color: WORD_COLORS[idx % WORD_COLORS.length]!,
    rotation: Math.round((Math.random() - 0.5) * 30), // -15 to +15
  }));
}
