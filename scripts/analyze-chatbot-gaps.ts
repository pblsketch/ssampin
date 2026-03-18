/**
 * 쌤핀 챗봇 갭 분석 스크립트
 *
 * 사용법:
 *   npx tsx scripts/analyze-chatbot-gaps.ts                    # 기본 30일
 *   npx tsx scripts/analyze-chatbot-gaps.ts --days 7          # 최근 7일
 *   npx tsx scripts/analyze-chatbot-gaps.ts --output report.md # 파일 출력
 *
 * 환경변수:
 *   SUPABASE_URL              - Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase 서비스 역할 키
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env 파일 로딩 (embed-docs.ts와 동일한 패턴)
function loadEnvFile(): void {
  const envPaths = ['.env.local', '.env'];
  for (const envPath of envPaths) {
    const fullPath = path.resolve(process.cwd(), envPath);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}
loadEnvFile();

// ── 타입 정의 ──────────────────────────────────────────────

interface GapTopic {
  topic: string;
  gap_count: number;
  distinct_days: number;
  last_seen: string;
}

interface LowConfConversation {
  session_id: string;
  user_question: string;
  bot_response: string;
  gap_type: string;
  asked_at: string;
}

interface AvoidableEscalation {
  type: string;
  summary: string;
  user_message: string;
  escalated_at: string;
  has_related_doc: boolean;
}

interface PopularTopic {
  keyword: string;
  mention_count: number;
  unique_sessions: number;
}

interface CliArgs {
  days: number;
  output: string | null;
}

// ── CLI 파싱 ──────────────────────────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const outputIdx = args.indexOf('--output');
  return {
    days: daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? '30', 10) : 30,
    output: outputIdx >= 0 ? args[outputIdx + 1] ?? null : null,
  };
}

// ── 메인 ──────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다:');
    console.error('  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const args = parseArgs();
  const supabase = createClient(supabaseUrl, supabaseKey);
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();

  console.log(`🔍 쌤핀 챗봇 갭 분석 시작 (최근 ${args.days}일)\n`);

  // 1. 미답변 토픽 조회
  const { data: gapTopics } = await supabase
    .from('chatbot_unanswered_topics')
    .select('*')
    .order('gap_count', { ascending: false })
    .limit(15);

  // 2. 저신뢰 대화 조회
  const { data: lowConfConvs } = await supabase
    .from('chatbot_low_confidence_conversations')
    .select('*')
    .gte('asked_at', since)
    .order('asked_at', { ascending: false })
    .limit(50);

  // 3. 회피 가능 에스컬레이션 조회
  const { data: avoidableEscalations } = await supabase
    .from('chatbot_avoidable_escalations')
    .select('*')
    .gte('escalated_at', since)
    .order('escalated_at', { ascending: false })
    .limit(30);

  // 4. 인기 토픽 조회
  const { data: popularTopics } = await supabase
    .from('chatbot_popular_topics')
    .select('*')
    .order('mention_count', { ascending: false })
    .limit(20);

  // 5. 리포트 생성
  const report = generateReport(
    args.days,
    (gapTopics ?? []) as GapTopic[],
    (lowConfConvs ?? []) as LowConfConversation[],
    (avoidableEscalations ?? []) as AvoidableEscalation[],
    (popularTopics ?? []) as PopularTopic[],
  );

  if (args.output) {
    fs.writeFileSync(args.output, report, 'utf-8');
    console.log(`📄 리포트 저장: ${args.output}`);
  } else {
    console.log(report);
  }
}

function generateReport(
  days: number,
  gapTopics: GapTopic[],
  lowConfConvs: LowConfConversation[],
  avoidableEscalations: AvoidableEscalation[],
  popularTopics: PopularTopic[],
): string {
  const now = new Date().toISOString().split('T')[0];
  const gapTypeCount: Record<string, number> = {};
  for (const c of lowConfConvs) {
    gapTypeCount[c.gap_type] = (gapTypeCount[c.gap_type] ?? 0) + 1;
  }

  const noDocEscalations = avoidableEscalations.filter(e => !e.has_related_doc);

  let md = `# 쌤핀 챗봇 갭 분석 리포트\n\n`;
  md += `생성일: ${now}\n`;
  md += `분석 기간: 최근 ${days}일\n\n`;
  md += `---\n\n`;

  // 섹션 1: 미답변 토픽 TOP
  md += `## 1. 답변 실패 토픽 (Top ${Math.min(gapTopics.length, 10)})\n\n`;
  if (gapTopics.length > 0) {
    md += `| 순위 | 토픽 | 갭 횟수 | 발생 일수 | 최근 발생 |\n`;
    md += `|------|------|---------|-----------|----------|\n`;
    gapTopics.slice(0, 10).forEach((t, i) => {
      md += `| ${i + 1} | ${t.topic} | ${t.gap_count} | ${t.distinct_days}일 | ${t.last_seen?.split('T')[0] ?? '-'} |\n`;
    });
  } else {
    md += `데이터 없음 (기간 내 저신뢰 대화 없음)\n`;
  }
  md += `\n`;

  // 섹션 2: 저신뢰 대화 유형 분포
  md += `## 2. 저신뢰 대화 유형 분포\n\n`;
  md += `| 유형 | 건수 | 설명 |\n`;
  md += `|------|------|------|\n`;
  md += `| no_source | ${gapTypeCount['no_source'] ?? 0} | 관련 문서 없음 |\n`;
  md += `| admitted_ignorance | ${gapTypeCount['admitted_ignorance'] ?? 0} | "모르겠어요" 류 답변 |\n`;
  md += `| near_escalation | ${gapTypeCount['near_escalation'] ?? 0} | 에스컬레이션 근접 |\n`;
  md += `| low_source | ${gapTypeCount['low_source'] ?? 0} | 소스 부족 |\n`;
  md += `\n총 ${lowConfConvs.length}건의 저신뢰 대화\n\n`;

  // 섹션 3: 회피 가능 에스컬레이션
  md += `## 3. 회피 가능했던 에스컬레이션\n\n`;
  md += `총 ${avoidableEscalations.length}건 중 ${noDocEscalations.length}건이 관련 문서 없음\n\n`;
  if (noDocEscalations.length > 0) {
    md += `| 유형 | 사용자 메시지 | 요약 | 일시 |\n`;
    md += `|------|-------------|------|------|\n`;
    noDocEscalations.slice(0, 10).forEach(e => {
      const msg = (e.user_message ?? '').slice(0, 50).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const summary = (e.summary ?? '').slice(0, 30).replace(/\|/g, '\\|');
      md += `| ${e.type} | ${msg} | ${summary} | ${e.escalated_at?.split('T')[0] ?? '-'} |\n`;
    });
  }
  md += `\n`;

  // 섹션 4: 인기 토픽 비교
  md += `## 4. 인기 토픽 vs 갭 토픽\n\n`;
  const gapTopicSet = new Set(gapTopics.map(t => t.topic));
  md += `| 인기 토픽 | 질문 수 | 갭 여부 |\n`;
  md += `|----------|---------|--------|\n`;
  popularTopics.slice(0, 15).forEach(t => {
    const isGap = gapTopicSet.has(t.keyword) ? '⚠️ 갭 있음' : '✅ 충분';
    md += `| ${t.keyword} | ${t.mention_count} | ${isGap} |\n`;
  });
  md += `\n`;

  // 섹션 5: 권장 조치
  md += `## 5. 권장 조치\n\n`;
  if (gapTopics.length > 0) {
    gapTopics.slice(0, 5).forEach(t => {
      md += `- **${t.topic}**: docs/troubleshoot-guide.md에 관련 섹션 추가/보강 필요 (${t.gap_count}건 미답변)\n`;
    });
  } else {
    md += `현재 기간 내 특별한 갭이 감지되지 않았습니다.\n`;
  }
  md += `\n`;

  // 섹션 6: 미답변 질문 샘플
  md += `## 6. 미답변 질문 샘플 (최근 10건)\n\n`;
  if (lowConfConvs.length > 0) {
    lowConfConvs.slice(0, 10).forEach((c, i) => {
      const q = (c.user_question ?? '').slice(0, 80).replace(/\n/g, ' ');
      md += `${i + 1}. "${q}" (${c.gap_type})\n`;
    });
  } else {
    md += `데이터 없음\n`;
  }

  return md;
}

main().catch((err: unknown) => {
  console.error('❌ 에러:', err);
  process.exit(1);
});
