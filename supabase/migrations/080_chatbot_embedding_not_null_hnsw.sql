-- ============================================
-- 챗봇 임베딩 재적재 마무리 (ADR-142) — 079 와 scripts/reembed-chatbot-docs.mjs 뒤에 적용
--
-- 1) not null 을 되돌린다. 재적재가 빠진 문서가 한 건이라도 있으면 여기서 실패한다 —
--    조용히 넘어가면 그 문서는 벡터 검색에서 영영 안 나온다.
-- 2) 1536차원은 pgvector HNSW 색인 상한(2000) 안이라 처음으로 벡터 색인을 건다.
--    (4096 시절에는 색인을 걸 수 없어 전수 비교했다 — 062 주석 참고)
-- ============================================

alter table ssampin_docs
  alter column embedding set not null;

create index if not exists idx_ssampin_docs_embedding_hnsw
  on ssampin_docs
  using hnsw (embedding vector_cosine_ops);
