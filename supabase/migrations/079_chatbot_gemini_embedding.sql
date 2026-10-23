-- ============================================
-- 챗봇 임베딩 공급자 교체: 업스테이지(4096) → 제미나이 gemini-embedding-2(1536)  (ADR-142)
--
-- 배경
--   2026-10-14 업스테이지 무료 크레딧이 만료되면서 키가 정지돼, 질문 → 벡터 단계가 막힌
--   챗봇이 모든 질문에 500 을 냈다(2026-08-25 구글 키 때와 같은 모양). 쓰던
--   embedding-query/-passage 도 2026-12-31 종료다. 답변은 Claude 로 옮겼지만 Claude 에는
--   임베딩 모델이 없어, 키가 살아 있고 개인정보처리방침에도 이미 적힌 제미나이로 옮긴다.
--
-- ⚠️ 062 와 달리 문서를 지우지 않는다 — 벡터만 비운다.
--   4096 → 1536 은 캐스팅할 수 없어 embedding 을 null 로 바꾼다. 본문·메타데이터·fts(글자
--   검색 칸)는 그대로 남는다. 062 때처럼 통째로 비우면 문서 파일 출처 76건처럼 재생성 스크립트가
--   따로 있는 자료를 놓치기 쉽다.
--
-- 적용 순서 (반드시 이대로)
--   1) 이 파일 적용         — 이 시점부터 벡터 검색 결과가 비고, 글자 검색은 그대로 동작한다.
--   2) node --env-file=.env scripts/reembed-chatbot-docs.mjs  — 전 문서 벡터를 다시 채운다.
--   3) 080 적용            — 빈 벡터가 남아 있으면 not null 에서 실패한다(= 재적재 누락 검출).
--
-- 검색 함수(match_*, hybrid_search_*)는 인자가 차원 없는 `vector` 라 손대지 않는다.
-- ============================================

alter table ssampin_docs
  alter column embedding drop not null;

alter table ssampin_docs
  alter column embedding type vector(1536) using null::vector(1536);
