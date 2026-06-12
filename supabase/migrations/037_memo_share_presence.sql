-- 메모 교실 공유 — 교실 화면 수신 확인증 (presence + attention ack)
--
-- 배경: 보드 내용은 선생님 개인 Google Drive에만 저장(ADR-011, 쌤핀 서버 무저장).
-- 교실 페이지는 Drive 읽기 전용(anyone-with-link reader)이라 "잘 재생됐다"는
-- 답장을 Drive에 쓸 수 없다. 이 테이블은 그 답장 채널 — **메모 내용은 일절
-- 담기지 않으며**(board_id·재생 결과·시각뿐), 사용자 승인 하의 메타데이터 예외다
-- (2026-06-12, ADR-012).
--
-- 설계: 보드당 1행 upsert — 페이지가 60초 heartbeat + 재생 직후 ack를 갱신.
-- 행이 늘어나지 않아 정리(cleanup) 불필요.

create table memo_share_presence (
  -- Drive 보드 JSON fileId (추측 불가 33자+). 보드를 아는 사람만 조회 의미 있음
  board_id        text primary key,
  -- 교실 페이지의 마지막 생존 신호 시각
  last_seen_at    timestamptz not null default now(),
  -- 교실 화면의 소리 토글 상태 (🔔)
  sound_on        boolean not null default false,
  -- 마지막으로 처리한 주목 신호의 nonce — 앱이 자기가 보낸 nonce와 대조
  last_ack_nonce  text,
  -- 'played' | 'sound-off' | 'fallback-voice' (남성 음성 없음 폴백)
  last_ack_result text,
  last_ack_at     timestamptz
);

alter table memo_share_presence enable row level security;

-- 교실 페이지(비로그인 anon)가 자기 보드 행을 쓰고, 쌤핀 앱(anon)이 읽는다.
-- 링크를 아는 누구나 쓰기/읽기 가능하지만 담긴 정보가 "화면 켜짐/재생됨" 메타뿐이라
-- 보드 내용(Drive) 이상의 정보 노출이 없다. 값 길이 가드로 오남용 저장 차단.
create policy memo_presence_anon_select on memo_share_presence
  for select to anon using (true);
create policy memo_presence_anon_insert on memo_share_presence
  for insert to anon
  with check (
    char_length(board_id) between 20 and 80
    and (last_ack_nonce is null or char_length(last_ack_nonce) <= 64)
    and (last_ack_result is null or last_ack_result in ('played', 'sound-off', 'fallback-voice'))
  );
create policy memo_presence_anon_update on memo_share_presence
  for update to anon
  using (true)
  with check (
    char_length(board_id) between 20 and 80
    and (last_ack_nonce is null or char_length(last_ack_nonce) <= 64)
    and (last_ack_result is null or last_ack_result in ('played', 'sound-off', 'fallback-voice'))
  );
