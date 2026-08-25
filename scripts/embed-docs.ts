/**
 * 쌤핀 문서 임베딩 스크립트
 *
 * 사용법:
 *   npx tsx scripts/embed-docs.ts --all          # 모든 문서 임베딩
 *   npx tsx scripts/embed-docs.ts --all --dry-run # 청크만 확인 (임베딩 없이)
 *   npx tsx scripts/embed-docs.ts --file docs/user-guide.md  # 특정 파일만
 *
 * 환경변수:
 *   UPSTAGE_API_KEY           - 업스테이지 API 키
 *   SUPABASE_URL              - Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase 서비스 역할 키
 *
 * 임베딩 모델: 업스테이지 embedding-passage (4096차원)
 * SDK: @google/genai
 */

import * as fs from 'fs';
import * as path from 'path';

// .env 파일 로딩 (dotenv 없이 직접 파싱)
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
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── 타입 정의 ──────────────────────────────────────────────

/** 문서 청크 메타데이터 */
interface ChunkMetadata {
  source: string;
  category: 'faq' | 'guide' | 'feature' | 'troubleshoot' | 'release';
  title: string;
  version: string;
}

/** 문서 청크 */
interface DocumentChunk {
  content: string;
  metadata: ChunkMetadata;
}

/** CLI 인자 */
interface CliArgs {
  all: boolean;
  file: string | null;
  dryRun: boolean;
}

/** 임베딩 대상 파일 정보 */
interface EmbedTarget {
  file: string;
  category: ChunkMetadata['category'];
  parser: 'markdown' | 'faq';
}

// ── 상수 ──────────────────────────────────────────────────

/**
 * ★질문용(embedding-query)과 문서용(embedding-passage)은 **다른 모델**이다.
 *   비대칭 검색용으로 짝지어 학습돼 있어, 한쪽으로 통일하면 검색이 조용히 나빠진다.
 */
const PASSAGE_MODEL = 'embedding-passage';
const QUERY_MODEL = 'embedding-query';
const UPSTAGE_BASE_URL = process.env.UPSTAGE_BASE_URL ?? 'https://api.upstage.ai/v1';
const MAX_CHARS_PER_CHUNK = 1500;
const BATCH_SIZE = 100;
const INSERT_BATCH = 50;
const APP_VERSION = '1.7.6';

// ── 청킹 함수 ────────────────────────────────────────────

/**
 * 카테고리 자동 감지
 */
function detectCategory(
  title: string,
  fallback: ChunkMetadata['category'],
): ChunkMetadata['category'] {
  const lower = title.toLowerCase();
  if (lower.includes('faq') || lower.includes('자주 묻는')) return 'faq';
  if (lower.includes('문제') || lower.includes('해결') || lower.includes('오류'))
    return 'troubleshoot';
  if (lower.includes('기능') || lower.includes('도구') || lower.includes('위젯')) return 'feature';
  return fallback;
}

/**
 * 마크다운 문서를 섹션 기반으로 청킹
 * - ## 헤더 기준으로 1차 분할
 * - 길면 문단 단위로 2차 분할
 * - 오버랩 적용
 */
function chunkMarkdown(
  markdown: string,
  source: string,
  defaultCategory: ChunkMetadata['category'],
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0]?.trim() ?? '개요';
    const body = lines.slice(1).join('\n').trim();

    if (!body) continue;

    const category = detectCategory(title, defaultCategory);

    if (body.length <= MAX_CHARS_PER_CHUNK) {
      chunks.push({
        content: `## ${title}\n\n${body}`,
        metadata: { source, category, title, version: APP_VERSION },
      });
    } else {
      // 긴 섹션은 문단 단위 분할
      const paragraphs = body.split(/\n\n+/);
      let buffer = '';
      let chunkIndex = 0;

      for (const para of paragraphs) {
        if ((buffer + '\n\n' + para).length > MAX_CHARS_PER_CHUNK && buffer) {
          chunks.push({
            content: `## ${title} (${chunkIndex + 1})\n\n${buffer.trim()}`,
            metadata: { source, category, title, version: APP_VERSION },
          });
          // 오버랩: 마지막 200자 유지
          buffer = buffer.slice(-200) + '\n\n' + para;
          chunkIndex++;
        } else {
          buffer = buffer ? buffer + '\n\n' + para : para;
        }
      }

      if (buffer.trim()) {
        chunks.push({
          content: `## ${title} (${chunkIndex + 1})\n\n${buffer.trim()}`,
          metadata: { source, category, title, version: APP_VERSION },
        });
      }
    }
  }

  return chunks;
}

/**
 * FAQ.tsx 파일에서 Q&A 데이터를 파싱
 */
function parseFaqFile(faqFilePath: string): DocumentChunk[] {
  const content = fs.readFileSync(faqFilePath, 'utf-8');
  const chunks: DocumentChunk[] = [];

  const faqRegex = /\{\s*question:\s*['"`](.+?)['"`],\s*answer:\s*['"`]([\s\S]*?)['"`]\s*,?\s*\}/g;
  let match: RegExpExecArray | null;

  while ((match = faqRegex.exec(content)) !== null) {
    const question = match[1];
    const answer = match[2]?.replace(/\\n/g, '\n') ?? '';

    chunks.push({
      content: `Q: ${question}\nA: ${answer}`,
      metadata: {
        source: 'landing/src/components/FAQ.tsx',
        category: 'faq',
        title: question ?? '',
        version: APP_VERSION,
      },
    });
  }

  return chunks;
}

// ── 임베딩 생성 ───────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 업스테이지 임베딩 호출 한 번.
 *
 * ★예전에는 구글 SDK → REST 폴백 2단이었는데, 2026-08-25 구글 키가 무효화되자
 *   두 경로가 **같은 키를 써서 같이 죽었다.** 폴백이 폴백 구실을 못 했다.
 *   지금은 경로가 하나뿐이니, 대신 실패를 숨기지 않고 그대로 올린다.
 * ★응답 순서를 믿지 않고 index 로 되돌린다 — 어긋나면 본문과 벡터가 어긋난 채
 *   "엉뚱한 문서가 검색되는" 형태로만 드러나 알아채기 어렵다.
 */
async function embedBatch(texts: string[], apiKey: string, model: string): Promise<number[][]> {
  const response = await fetch(`${UPSTAGE_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    // Rate limit 시 재시도
    if (response.status === 429) {
      console.warn('  Rate limit 도달, 5초 후 재시도...');
      await sleep(5000);
      return embedBatch(texts, apiKey, model);
    }

    throw new Error(`업스테이지 임베딩 에러 (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
  };
  const sorted = [...data.data].sort((a, b) => a.index - b.index);

  if (sorted.length !== texts.length) {
    throw new Error(`임베딩 ${texts.length}건 요청, ${sorted.length}건 응답 — 개수 불일치`);
  }

  return sorted.map((d) => d.embedding);
}

/**
 * 문서 배치 임베딩 (embedding-passage, 4096차원)
 */
async function generateEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`  임베딩 생성 중... (${i + 1}~${i + batch.length}/${texts.length})`);

    allEmbeddings.push(...(await embedBatch(batch, apiKey, PASSAGE_MODEL)));

    // Rate limit 방지: 배치 간 500ms 대기
    if (i + BATCH_SIZE < texts.length) {
      await sleep(500);
    }
  }

  return allEmbeddings;
}

/**
 * 단일 텍스트 임베딩 (쿼리용, embedding-query)
 */
async function generateQueryEmbedding(text: string, apiKey: string): Promise<number[]> {
  const [vector] = await embedBatch([text], apiKey, QUERY_MODEL);
  return vector;
}

// ── Supabase 저장 ─────────────────────────────────────────

/**
 * 임베딩 결과를 Supabase ssampin_docs 테이블에 저장
 * - 기존 데이터 삭제 후 재삽입 (replace 전략)
 */
async function saveToSupabase(
  supabase: SupabaseClient,
  chunks: DocumentChunk[],
  embeddings: number[][],
  source: string,
): Promise<void> {
  console.log(`\n📦 Supabase 저장 시작 (${chunks.length}개 청크)...`);

  // 해당 소스의 기존 데이터 삭제
  const { error: deleteError } = await supabase
    .from('ssampin_docs')
    .delete()
    .eq('metadata->>source', source);

  if (deleteError) {
    console.warn(`  기존 데이터 삭제 경고: ${deleteError.message}`);
  }

  // 새 데이터 삽입 (50개씩 배치)
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((chunk, idx) => ({
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i + idx]),
      metadata: chunk.metadata,
    }));

    const { error: insertError } = await supabase.from('ssampin_docs').insert(batch);

    if (insertError) {
      throw new Error(`Supabase 삽입 에러: ${insertError.message}`);
    }

    console.log(`  저장 완료: ${i + 1}~${i + batch.length}`);
  }

  console.log(`✅ ${chunks.length}개 청크 저장 완료`);
}

// ── CLI 파싱 ──────────────────────────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    all: args.includes('--all'),
    file: args.find((_, i) => args[i - 1] === '--file') ?? null,
    dryRun: args.includes('--dry-run'),
  };
}

// ── 메인 ──────────────────────────────────────────────────

async function main(): Promise<void> {
  // 환경변수 검증
  const apiKey = process.env.UPSTAGE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const args = parseArgs();

  if (!args.dryRun && (!apiKey || !supabaseUrl || !supabaseKey)) {
    console.error('❌ 환경변수가 설정되지 않았습니다:');
    console.error('  UPSTAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('🚀 쌤핀 문서 임베딩 시작');
  console.log(`   모델: ${PASSAGE_MODEL} (4096차원)`);
  if (args.dryRun) console.log('   모드: DRY RUN (임베딩 생성 없이 청크만 확인)');
  console.log('');

  // 임베딩 대상 파일 목록
  const targets: EmbedTarget[] = [
    { file: 'docs/user-guide.md', category: 'guide', parser: 'markdown' },
    { file: 'docs/troubleshoot-guide.md', category: 'troubleshoot', parser: 'markdown' },
    { file: 'README.md', category: 'guide', parser: 'markdown' },
    { file: 'landing/src/components/FAQ.tsx', category: 'faq', parser: 'faq' },
  ];

  const filteredTargets = args.file
    ? targets.filter((t) => t.file === args.file || t.file.endsWith(args.file!))
    : targets;

  if (filteredTargets.length === 0) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${args.file}`);
    process.exit(1);
  }

  const supabase = !args.dryRun ? createClient(supabaseUrl!, supabaseKey!) : null;

  let totalChunks = 0;

  for (const target of filteredTargets) {
    const filePath = path.resolve(process.cwd(), target.file);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  파일 없음, 건너뜀: ${target.file}`);
      continue;
    }

    console.log(`📄 처리 중: ${target.file}`);

    const chunks =
      target.parser === 'faq'
        ? parseFaqFile(filePath)
        : chunkMarkdown(fs.readFileSync(filePath, 'utf-8'), target.file, target.category);

    console.log(`  청크 수: ${chunks.length}`);

    if (args.dryRun) {
      chunks.forEach((c, i) => {
        console.log(
          `  [${i + 1}] ${c.metadata.title} (${c.content.length}자) [${c.metadata.category}]`,
        );
      });
      console.log('');
      totalChunks += chunks.length;
      continue;
    }

    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts, apiKey!);

    await saveToSupabase(supabase!, chunks, embeddings, target.file);
    totalChunks += chunks.length;
  }

  console.log(
    `\n🎉 완료! 총 ${totalChunks}개 청크 ${args.dryRun ? '확인' : '임베딩 생성 및 저장'}`,
  );
}

main().catch((err: unknown) => {
  console.error('❌ 에러 발생:', err);
  process.exit(1);
});

// generateQueryEmbedding은 Phase 2 API에서 사용
export { generateQueryEmbedding };
