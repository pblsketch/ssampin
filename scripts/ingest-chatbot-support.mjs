/** 한 건의 지원 문답만 갱신한다. node --env-file=.env scripts/ingest-chatbot-support.mjs */
import { createClient } from '@supabase/supabase-js';
import { TRANSCRIPT_SUPPORT_DOCUMENT } from './chatbot-support-qa.mjs';
import { embedPassages } from './gemini-embedding.mjs';

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(TRANSCRIPT_SUPPORT_DOCUMENT, null, 2));
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_API_KEY)
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
  // 차원·형식 검사는 embedPassages 가 한다(1536, 유한수).
  const [vector] = await embedPassages(
    [
      {
        title: TRANSCRIPT_SUPPORT_DOCUMENT.metadata.title,
        text: TRANSCRIPT_SUPPORT_DOCUMENT.content,
      },
    ],
    GOOGLE_API_KEY,
  );
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
