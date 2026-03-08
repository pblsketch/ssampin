/**
 * 쌤핀 AI 챗봇 — 관리용 문서 임베딩 API
 *
 * 관리자 인증 필요 (Bearer 토큰)
 * 액션: list / delete / upsert
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 타입 정의 ──────────────────────────────────────────────

interface EmbedDocument {
  content: string;
  metadata: {
    source: string;
    category: string;
    title: string;
  };
}

interface EmbedRequest {
  action: 'upsert' | 'delete' | 'list';
  documents?: EmbedDocument[];
  source?: string;
}

interface GeminiBatchEmbeddingResponse {
  embeddings: Array<{ values: number[] }>;
}

// ── CORS ──────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── 헬퍼 ──────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── 메인 핸들러 ───────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 관리자 인증
    const authHeader = req.headers.get('authorization');
    const adminKey = Deno.env.get('ADMIN_API_KEY');

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return jsonResponse({ error: '인증 실패' }, 401);
    }

    const body = (await req.json()) as EmbedRequest;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    switch (body.action) {
      // 문서 목록 조회
      case 'list': {
        const { data, error } = await supabase
          .from('ssampin_docs')
          .select('id, metadata, created_at, updated_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return jsonResponse({ documents: data, count: data?.length ?? 0 });
      }

      // 소스별 문서 삭제
      case 'delete': {
        if (!body.source) {
          return jsonResponse({ error: 'source 필드가 필요합니다' }, 400);
        }

        const { error } = await supabase
          .from('ssampin_docs')
          .delete()
          .eq('metadata->>source', body.source);

        if (error) throw error;
        return jsonResponse({ ok: true, message: `${body.source} 문서 삭제 완료` });
      }

      // 문서 임베딩 생성 및 저장
      case 'upsert': {
        if (!body.documents?.length) {
          return jsonResponse({ error: 'documents 배열이 필요합니다' }, 400);
        }

        const apiKey = Deno.env.get('GOOGLE_API_KEY')!;
        const texts = body.documents.map((d) => d.content);

        // 배치 임베딩 생성 (gemini-embedding-001, 768차원)
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: texts.map((text) => ({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text }] },
                taskType: 'RETRIEVAL_DOCUMENT',
                outputDimensionality: 768,
              })),
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`임베딩 생성 실패 (${response.status}): ${errorBody}`);
        }

        const embedData = (await response.json()) as GeminiBatchEmbeddingResponse;

        // DB에 삽입
        const rows = body.documents.map((doc, i) => ({
          content: doc.content,
          embedding: JSON.stringify(embedData.embeddings[i].values),
          metadata: { ...doc.metadata, version: '0.2.7' },
        }));

        const { error } = await supabase.from('ssampin_docs').insert(rows);
        if (error) throw error;

        return jsonResponse({
          ok: true,
          message: `${rows.length}개 문서 임베딩 저장 완료`,
          count: rows.length,
        });
      }

      default:
        return jsonResponse({ error: `알 수 없는 action: ${String(body.action)}` }, 400);
    }
  } catch (error) {
    console.error('Embed error:', error);
    return jsonResponse({ error: '처리 중 오류 발생' }, 500);
  }
});
