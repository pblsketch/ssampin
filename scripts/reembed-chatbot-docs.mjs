/**
 * 챗봇 지식 문서 벡터 재적재 — 본문은 그대로 두고 embedding 만 다시 채운다 (ADR-142).
 *
 * 사용법:
 *   node --env-file=.env scripts/reembed-chatbot-docs.mjs --dry-run       # 백업·건수만
 *   node --env-file=.env scripts/reembed-chatbot-docs.mjs                 # 전 문서
 *   node --env-file=.env scripts/reembed-chatbot-docs.mjs --only-missing  # 벡터 빈 문서만(이어하기)
 *
 * 환경변수: GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (값은 출력하지 않는다)
 *
 * ★무엇을 하든 먼저 전 문서를 로컬(OS 임시 폴더)에 백업한다. ssampin_docs 에는 Q&A 스크립트가
 *   만든 문서와 문서 파일에서 만든 문서가 섞여 있어, 날아가면 출처별로 다시 만들어야 한다.
 * ★문서를 지우거나 새로 넣지 않는다. id 로 embedding 칸만 고친다.
 * ★끝에 벡터가 빈 문서가 0건인지 확인한다. 0건이 아니면 실패로 끝난다(080 적용 전 관문).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  embedPassages,
} from './gemini-embedding.mjs';

const PAGE = 1000;
const UPDATE_CONCURRENCY = 5;

async function fetchAllDocs(supabase, onlyMissing) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('ssampin_docs')
      .select('id,content,metadata')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (onlyMissing) query = query.is('embedding', null);
    const { data, error } = await query;
    if (error) throw new Error(`문서 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function countMissing(supabase) {
  const { count, error } = await supabase
    .from('ssampin_docs')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);
  if (error) throw new Error(`빈 벡터 집계 실패: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyMissing = process.argv.includes('--only-missing');
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || (!dryRun && !GOOGLE_API_KEY)) {
    throw new Error(
      '필수 환경변수가 없습니다 (GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1) 전량 백업 (only-missing 이어도 전체를 백업한다)
  const all = await fetchAllDocs(supabase, false);
  const backupPath = path.join(
    os.tmpdir(),
    `ssampin-docs-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(all));
  const bySource = {};
  for (const row of all) {
    const source = row.metadata?.source ?? '(없음)';
    bySource[source] = (bySource[source] ?? 0) + 1;
  }
  console.log(`백업 ${all.length}건 → ${backupPath}`);
  console.log('출처별:', JSON.stringify(bySource));

  const targets = onlyMissing ? await fetchAllDocs(supabase, true) : all;
  console.log(`대상 ${targets.length}건 (${onlyMissing ? '벡터 빈 문서만' : '전 문서'})`);
  if (dryRun) {
    console.log(
      `DRY RUN — 벡터 빈 문서 ${await countMissing(supabase)}건. 아무것도 바꾸지 않았다.`,
    );
    return;
  }

  // 2) 임베딩
  console.log(`모델 ${GEMINI_EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}차원)`);
  const vectors = await embedPassages(
    targets.map((row) => ({ title: row.metadata?.title, text: row.content })),
    GOOGLE_API_KEY,
  );

  // 3) id 로 embedding 칸만 갱신
  let done = 0;
  for (let i = 0; i < targets.length; i += UPDATE_CONCURRENCY) {
    const slice = targets.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      slice.map(async (row, k) => {
        const { error } = await supabase
          .from('ssampin_docs')
          .update({ embedding: JSON.stringify(vectors[i + k]) })
          .eq('id', row.id);
        if (error) throw new Error(`id=${row.id} 갱신 실패: ${error.message}`);
      }),
    );
    done += slice.length;
    if (done % 100 === 0 || done === targets.length)
      console.log(`  갱신 ${done}/${targets.length}`);
  }

  // 4) 관문 — 빈 벡터 0건
  const missing = await countMissing(supabase);
  if (missing !== 0)
    throw new Error(`벡터가 빈 문서가 ${missing}건 남았다 — --only-missing 으로 다시 돌릴 것`);
  console.log(`완료. 벡터 빈 문서 0건, 전체 ${all.length}건 그대로.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
