# ADR-012: 메모 교실 공유 수신 확인증 — "쌤핀 서버 무경유" 원칙의 메타데이터 예외

- **상태**: active
- **일자**: 2026-06-12
- **컨텍스트**: ADR-011로 보드 내용은 선생님 개인 Google Drive에만 저장된다. 그러나 교실 페이지는 Drive 읽기 전용(anyone-with-link reader)이라 "재생됐다"는 답장을 쓸 수 없어, 교사가 교무실에서 주목/낭독의 실제 재생 여부와 교실 화면 생존을 확인할 방법이 없었다(사용자 질문 2026-06-12).
- **결정**: Supabase 테이블 `memo_share_presence`(보드당 1행 upsert)를 수신 확인 채널로 추가한다. 사용자 명시 승인("이정도는 구현해도 좋을 거 같아").
  - 담는 것: board_id(Drive fileId)·last_seen_at·sound_on·last_ack_nonce·last_ack_result('played'/'sound-off'/'fallback-voice')·last_ack_at — **메모 내용·제목 등 텍스트는 일절 없음**
  - 교실 페이지: 60초 heartbeat + 재생 직후 ack upsert (fire-and-forget, 실패해도 보드 표시 무영향)
  - 쌤핀 앱: 모달 열림 동안 10초 폴링 → "교실 화면 연결됨/안 보임" 칩 + 재생 확인 토스트(35초 timeout)
  - RLS: anon insert/update/select 허용 + 길이·enum 가드. 링크를 아는 자의 spoof 가능하나 노출 정보가 "화면 켜짐/재생됨" 메타뿐이라 보드 내용(Drive) 이상 노출 없음
  - 행이 보드당 1개라 증가·정리 불필요
- **한계(고지)**: "브라우저가 재생함"까지 확인 — 전자칠판 자체 볼륨/음소거는 감지 불가
- **영향**: SC-10 메타테스트("memoShare 경로 supabase 호출은 ShortLinkClient 한정")에 MemoSharePresenceClient 허용 추가. migration 037 prod 적용 + anon upsert/select/가드 curl 검증 완료(2026-06-12)
