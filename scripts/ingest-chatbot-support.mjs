/** 한 건의 지원 문답만 갱신한다. node --env-file=.env scripts/ingest-chatbot-support.mjs */
import { createClient } from '@supabase/supabase-js';
import { TRANSCRIPT_SUPPORT_DOCUMENT } from './chatbot-support-qa.mjs';

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(TRANSCRIPT_SUPPORT_DOCUMENT, null, 2));
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPSTAGE_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !UPSTAGE_API_KEY)
    throw new Error('필수 환경변수가 없습니다.');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const source = TRANSCRIPT_SUPPORT_DOCUMENT.metadata.source;
  const { data: previous, error: readError } = await supabase
    .from('ssampin_docs')
    .select('id,content,metadata')
    .eq('metadata->>source', source);
  if (readError) throw new Error('지원 문답 조회 실패');
  if (previous.length > 1) throw new Error('지원 문답이 중복되어 자동 갱신을 중단합니다.');
  const response = await fetch(
    `${process.env.UPSTAGE_BASE_URL ?? 'https://api.upstage.ai/v1'}/embeddings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTAGE_API_KEY}` },
      body: JSON.stringify({
        model: 'embedding-passage',
        input: [TRANSCRIPT_SUPPORT_DOCUMENT.content],
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`문답 임베딩 실패: HTTP ${response.status}`);
  const body = await response.json();
  const vector = body.data?.[0]?.embedding;
  if (
    !Array.isArray(vector) ||
    vector.length !== 4096 ||
    vector.some((value) => !Number.isFinite(value))
  )
    throw new Error('문답 임베딩 형식이 올바르지 않습니다.');
  const row = { ...TRANSCRIPT_SUPPORT_DOCUMENT, embedding: JSON.stringify(vector) };
  const { error } = previous.length
    ? await supabase
        .from('ssampin_docs')
        .update(row)
        .eq('id', previous[0].id)
        .eq('metadata->>source', source)
    : await supabase.from('ssampin_docs').insert(row);
  if (error) throw new Error('지원 문답 저장 실패');
  const { data: verified, error: verifyError } = await supabase
    .from('ssampin_docs')
    .select('content,metadata')
    .eq('metadata->>source', source);
  if (
    verifyError ||
    verified.length !== 1 ||
    verified[0].content !== row.content ||
    verified[0].metadata.title !== row.metadata.title
  )
    throw new Error('지원 문답 저장 후 확인 실패');
  console.log('지원 문답 1건 저장·직접 재조회 확인. 다른 문답은 변경하지 않았습니다.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
