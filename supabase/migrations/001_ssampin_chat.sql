-- ============================================
-- 쌤핀 AI 챗봇 데이터베이스 스키마
-- Phase 1: 기반 구축
-- 임베딩: gemini-embedding-001 (outputDimensionality: 768)
-- ============================================

-- 1. pgvector 확장 활성화
create extension if not exists vector;

-- 2. 문서 임베딩 테이블
create table if not exists ssampin_docs (
  id bigserial primary key,
  content text not null,
  embedding vector(768) not null,           -- gemini-embedding-001 (768차원 지정)
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 벡터 검색 인덱스 (IVFFlat, 코사인 유사도)
create index if not exists idx_ssampin_docs_embedding
  on ssampin_docs
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- 메타데이터 GIN 인덱스 (카테고리 필터용)
create index if not exists idx_ssampin_docs_metadata
  on ssampin_docs using gin (metadata);

-- 3. 대화 로그 테이블
create table if not exists ssampin_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]',
  created_at timestamptz default now()
);

create index if not exists idx_ssampin_conversations_session
  on ssampin_conversations (session_id, created_at);

-- 4. 에스컬레이션 테이블
create table if not exists ssampin_escalations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  type text not null check (type in ('bug', 'feature', 'other')),
  summary text not null,
  user_email text,
  user_message text not null,
  conversation_context jsonb default '[]',
  email_sent boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_ssampin_escalations_created
  on ssampin_escalations (created_at desc);

-- 5. Rate Limiting 테이블
create table if not exists ssampin_rate_limits (
  id bigserial primary key,
  identifier text not null,
  endpoint text not null,
  requested_at timestamptz default now()
);

create index if not exists idx_ssampin_rate_limits_lookup
  on ssampin_rate_limits (identifier, endpoint, requested_at);

-- 6. 벡터 유사도 검색 함수
create or replace function match_ssampin_docs(
  query_embedding vector(768),
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sd.id,
    sd.content,
    sd.metadata,
    1 - (sd.embedding <=> query_embedding) as similarity
  from ssampin_docs sd
  where 1 - (sd.embedding <=> query_embedding) > match_threshold
  order by sd.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 7. 카테고리 필터 포함 벡터 검색 함수
create or replace function match_ssampin_docs_filtered(
  query_embedding vector(768),
  filter_category text default null,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sd.id,
    sd.content,
    sd.metadata,
    1 - (sd.embedding <=> query_embedding) as similarity
  from ssampin_docs sd
  where
    1 - (sd.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or sd.metadata->>'category' = filter_category)
  order by sd.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 8. RLS 정책
alter table ssampin_docs enable row level security;
alter table ssampin_conversations enable row level security;
alter table ssampin_escalations enable row level security;
alter table ssampin_rate_limits enable row level security;

create policy "Service role full access on ssampin_docs"
  on ssampin_docs for all using (auth.role() = 'service_role');
create policy "Service role full access on ssampin_conversations"
  on ssampin_conversations for all using (auth.role() = 'service_role');
create policy "Service role full access on ssampin_escalations"
  on ssampin_escalations for all using (auth.role() = 'service_role');
create policy "Service role full access on ssampin_rate_limits"
  on ssampin_rate_limits for all using (auth.role() = 'service_role');
