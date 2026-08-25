-- ============================================
-- 챗봇 임베딩 공급자 교체: Gemini(768) → 업스테이지(4096)
--
-- 배경
--   2026-08-25 구글 API 키가 무효화되면서 도움말 챗봇이 **모든 질문에 500** 으로 죽었다.
--   질문 → 벡터 변환이 검색보다 앞단이고 폴백이 없어, 키 하나가 기능 전체를 멈췄다.
--   답변 생성은 이미 업스테이지(solar-pro3)였으므로 임베딩도 같은 공급자로 모아
--   **관리할 키를 하나로 줄인다**(UPSTAGE_API_KEY).
--
-- ⚠️ 이 마이그레이션은 ssampin_docs 를 **비운다.**
--   768차원 벡터는 4096차원으로 캐스팅할 수 없어서 지우고 다시 넣는 수밖에 없다.
--   본문·메타데이터는 저장소에서 전부 재생성된다 —
--     scripts/ingest-chatbot-qa.mjs  (system-qa 349 + feature-summary 61)
--     scripts/embed-docs.ts          (user-guide / troubleshoot-guide / README / FAQ.tsx)
--   적용 후 **반드시 두 스크립트를 돌려야 한다.** 안 그러면 챗봇이 근거 문서 0건으로
--   답한다(에러는 안 나고 답 품질만 조용히 떨어진다).
--
-- 색인에 대해
--   001 에 있던 ivfflat 색인은 **실제 DB 에 만들어져 있지 않았다**(생성 실패 후 방치된
--   것으로 보인다). 어차피 pgvector 의 ivfflat/hnsw 는 2000차원까지만 지원해 4096 에는
--   걸 수 없다. 문서가 500건 안팎이라 전수 스캔이 더 정확하고 체감 차이도 없다.
--   문서가 수천 건으로 늘면 embedding-passage 에 dimensions=1024 를 주고 칼럼을
--   vector(1024) 로 줄인 뒤 색인을 거는 쪽이 맞다.
--
-- 검색 함수(match_*, hybrid_search_*)는 인자가 차원 없는 `vector` 라 손대지 않는다.
-- ============================================

drop index if exists idx_ssampin_docs_embedding;

delete from ssampin_docs;

alter table ssampin_docs
  alter column embedding type vector(4096);
