# Architecture Decisions

결정은 시간순으로 기록한다. 변경 시 기존 결정을 삭제하지 않고 상태를 `superseded`로 바꾼다.

> **본문은 파일 하나씩** — `docs/03-decisions/ADR-NNN.md`. 이 파일은 목록만 둔다(한 줄 = ADR 하나).
> **새 결정**: 마지막 번호 + 1 로 파일을 만들고, 여기 맨 아래에 한 줄 추가. 상태가 바뀌면 파일 본문과 이 줄을 함께 고친다.
> ADR-012 는 두 건이 같은 번호로 기록돼 있어 두 번째를 `ADR-012b` 로 구분했다. `ADR-V-*` 는 번호 없이 만들어진 예전 파일이다.

---

- [ADR-001 · Clean Architecture 4 레이어](docs/03-decisions/ADR-001.md) — active · 프로젝트 초기
- [ADR-002 · 로컬 JSON 저장 (오프라인 우선)](docs/03-decisions/ADR-002.md) — active · 프로젝트 초기
- [ADR-003 · Zustand 상태관리](docs/03-decisions/ADR-003.md) — active · 프로젝트 초기
- [ADR-004 · sp-\* CSS 변수 기반 테마 시스템](docs/03-decisions/ADR-004.md) — active · v2.x
- [ADR-005 · 지침 분리 전략 (하네스 엔지니어링)](docs/03-decisions/ADR-005.md) — active · 2026-05-19
- [ADR-006 · PDCA 문서 구조](docs/03-decisions/ADR-006.md) — active · 2026-05-19 (기존 구조 문서화)
- [ADR-007 · 위젯 모드 휠 sign 컨벤션 — blink 채택 + SSOT helper로 추출](docs/03-decisions/ADR-007.md) — active · 2026-05-23
- [ADR-008 · native-desktop resize SetWindowPos sync 채택 — Electron setBounds WS_CHILD 회귀](docs/03-decisions/ADR-008.md) — active · 2026-05-23
- [ADR-009 · 점심 위치 1급 도메인 승격 + 표 내 인라인 위·아래 버튼 (C안)](docs/03-decisions/ADR-009.md) — active · 2026-05-29
- [ADR-010 · MultiSurvey v2 미감 정량 게이트 재정의 — sp-\* ratio ±20% 폐기 + 3종 새 게이트](docs/03-decisions/ADR-010.md) — active · 2026-05-30
- [ADR-011 · 메모 교실 공유 저장소 — Supabase 폐기, 선생님 개인 Google Drive 채택](docs/03-decisions/ADR-011.md) — active · 2026-06-11
- [ADR-012 · 협업보드 템플릿 주입 — 보드 생성 시점 서버 Y.Doc 시딩 (Teacher ExcalidrawBinding 미부착)](docs/03-decisions/ADR-012.md) — active · 2026-06-12
- [ADR-013 · 학생 페이지 공용 셸 — --sps-\* 네임스페이스 신설 (DN-10 토큰 불가침)](docs/03-decisions/ADR-013.md) — active · 2026-06-12
- [ADR-012b · 메모 교실 공유 수신 확인증 — "쌤핀 서버 무경유" 원칙의 메타데이터 예외](docs/03-decisions/ADR-012b.md) — active · 2026-06-12
- [ADR-014 · 생기부 작성 근거 자료 — 신규 RecordEvidence 엔티티 (basisObservationIds 와 역할 분리)](docs/03-decisions/ADR-014.md) — active · 2026-06-24
- [ADR-015 · 근거 자료 4대 개선 + 성적/점수 AI 미노출(길 A)](docs/03-decisions/ADR-015.md) — active · 2026-06-24
- [ADR-016 · 근거 자료 엑셀 일괄 등록 — 유형은 업로드 후 분류](docs/03-decisions/ADR-016.md) — active · 2026-06-24
- [ADR-017 · 아이콘 모드 확장형 창 프로토콜 — compact 유지 + 필요 시 확장 + 클릭 통과](docs/03-decisions/ADR-017.md) — 채택 (v2.2.7 후보)
- [ADR-018 · 모바일(src/mobile) 구조·네이밍 규칙 + 게이트 화이트리스트 승계 원칙](docs/03-decisions/ADR-018.md) — active · 2026-07-03
- [ADR-019 · 출결 동기화 기록 단위 병합 + 업로드 유예 자동 재동기화](docs/03-decisions/ADR-019.md) — active · 2026-07-06
- [ADR-020 · macOS는 베타 지원 — Apple 개발자 프로그램 미가입 확정](docs/03-decisions/ADR-020.md) — active · 2026-07-08
- [ADR-021 · 출결 개선 — 담임 그리드 단일 기록자 + headless 코어 공유 + 기재요령 별표 8 정합 집계](docs/03-decisions/ADR-021.md) — active · 2026-07-10
- [ADR-022 · 출결 그리드 v2 — 팔레트 입력 모델 + 자동 저장 + 좌석 뷰 (ADR-021 대체 UX)](docs/03-decisions/ADR-022.md) — active (ADR-021의 담임 그리드 UX를 대체·확장. 도메인·저장·집계 결정은 ADR-021 유지) · 2026-07-11
- [ADR-023 · 동기화 2차 하드닝 — 파일 쓰기 직렬화(공용 락 + 의도 저장) + StudentRecord 항목 단위 병합](docs/03-decisions/ADR-023.md) — active · 2026-07-14
- [ADR-024 · 동기화 매니페스트 라이프사이클 — no-op 업로드 무기록 + 장부 분리 + 파일별 uploadedBy](docs/03-decisions/ADR-024.md) — active · 2026-07-21
- [ADR-025 · 1회성 안내 UI는 설정 로드 완료 후에만 판정하고, 지연 저장은 저장 시점 상태를 읽는다](docs/03-decisions/ADR-025.md) — active · 2026-07-22
- [ADR-026 · 모바일 담임 출결의 학생 원천은 담임 명렬표이며, 명단이 비면 저장하지 않는다](docs/03-decisions/ADR-026.md) — active · 2026-07-22
- [ADR-027 · 출결 이중 장부의 삭제는 원본 출결부를 먼저 지우고, 실패하면 사본도 남긴다(fail-closed)](docs/03-decisions/ADR-027.md) — active · 2026-07-22
- [ADR-028 · student-records 삭제 전파 툼스톤 — ISO 문자열 축 + 저장 조립 단일화](docs/03-decisions/ADR-028.md) — active · 2026-07-23
- [ADR-029 · ~ ADR-037: 학년도·학기 전환 + 보관함 (일괄 등재)](docs/03-decisions/ADR-029.md) — active · **일자**: 2026-08-06
- [ADR-038 · 의존성 취약점은 "배포되는 코드" 기준으로 다루고, override는 정확 버전으로 핀하지 않는다](docs/03-decisions/ADR-038.md) — active · **일자**: 2026-08-07
- [ADR-039 · "장부와 실제 내용이 다름"은 충돌이 아니다 — 미업로드 로컬 변경과 빈 봉투 유실을 가른다](docs/03-decisions/ADR-039.md) — active · **일자**: 2026-08-10
- [ADR-040 · "마지막 동기화 시각"은 동기화 대상에서 빼내 기기 전용 저장소에 둔다](docs/03-decisions/ADR-040.md) — active · **일자**: 2026-08-10 (v2.3.5)
- [ADR-041 · Drive 조건부 갱신은 ETag 헤더에 의존하지 않는다 — 브라우저는 그 헤더를 읽을 수 없다](docs/03-decisions/ADR-041.md) — active · **일자**: 2026-08-11 (v2.3.6)
- [ADR-042 · 모드 적용 실패의 정정은 main이 settings.json에 직접 쓴다 — renderer 단독 정정 금지](docs/03-decisions/ADR-042.md) — active · **일자**: 2026-08-11 (v2.3.7)
- [ADR-043 · 사용자에게 도달해야 하는 알림은 "메인 창 전용 UI"로 만들지 않는다](docs/03-decisions/ADR-043.md) — active · **일자**: 2026-08-11 (v2.3.7)
- [ADR-044 · 진도를 다른 반에 옮길 때 교시는 복사하지 않는다 — 대상 반 시간표가 정한다](docs/03-decisions/ADR-044.md) — active · **일자**: 2026-08-11
- [ADR-045 · 외부 서버 조회는 "사용자가 직접 누른 경로"에만 얹는다 — 자동 새로고침에 태우지 않는다](docs/03-decisions/ADR-045.md) — active · **일자**: 2026-08-12
- [ADR-046 · 학기는 달력이 아니라 학교가 정한다 — 개학일을 받되 앱이 날짜를 지어내지 않는다](docs/03-decisions/ADR-046.md) — active · **일자**: 2026-08-12
- [ADR-047 · 교시 이름은 만들어지는 문자열이 아니라 저장되는 값이다 — 표시 정본 하나 + 이름 보존 계약](docs/03-decisions/ADR-047.md) — active · **일자**: 2026-08-13
- [ADR-048 · 고객지원 챗봇의 '답변 생성'만 업스테이지 Solar로 옮긴다 — 임베딩은 DB 차원에 묶여 Gemini 유지](docs/03-decisions/ADR-048.md) — active · **일자**: 2026-08-14
- [ADR-049 · 챗봇의 '개발자 전달'은 답변을 대신하지 않는다 — 그리고 모델 판단에만 맡기지 않는다](docs/03-decisions/ADR-049.md) — active · **일자**: 2026-08-14
- [ADR-050 · 챗봇 지식베이스는 '쌓는 곳'이 아니라 '교체하는 곳'이다 — 그리고 자동 검사는 위젯 화면을 못 본다](docs/03-decisions/ADR-050.md) — active · **일자**: 2026-08-14
- [ADR-051 · 위젯 드래그 및 모드 전환 시 화면 경계 제한(Clamping) 및 가시성 자동 보장](docs/03-decisions/ADR-051.md) — active · **일자**: 2026-08-17
- [ADR-052 · 인앱 AI(OpenCode Zen)는 보류한다 — 무료 경로가 없고 비용이 쌤핀에 남는다](docs/03-decisions/ADR-052.md) — 보류(on hold) · **일자**: 2026-08-18
- [ADR-053 · 배율이 다른 모니터로 위젯을 옮기면, 드래그가 끝난 뒤에 크기를 다시 잡는다](docs/03-decisions/ADR-053.md) — active · **일자**: 2026-08-18
- [ADR-054 · 위젯 크기는 "숫자"가 아니라 "무엇으로 정해졌는가"로 기억한다](docs/03-decisions/ADR-054.md) — active · **일자**: 2026-08-18 · **커밋**: `8a91aa1f`
- [ADR-055 · 자료 저장 위치는 "쌤핀 폴더 전체"가 아니라 "선생님 자료"만 옮긴다](docs/03-decisions/ADR-055.md) — active · **일자**: 2026-08-19
- [ADR-056 · 이미 합쳐진 기능의 출시를 미룰 때는 되돌리지 말고 입구를 막는다](docs/03-decisions/ADR-056.md) — active · **일자**: 2026-08-19 · **관련**: `docs/01-plan/features/photo-name-learning.plan.md` O7·§12
- [ADR-057 · 학기 차시는 "세어서 알려주되, 어떻게 셌는지도 함께 연다"](docs/03-decisions/ADR-057.md) — active · **일자**: 2026-08-20 · **관련**: `docs/01-plan/features/lesson-count-and-progress-assist.plan.md` (v1.2)
- [ADR-058 · 앱 시작 모습은 켬/끔 토글이 아니라 "어떤 모습으로 열지" 한 번의 선택이다](docs/03-decisions/ADR-058.md) — active · **일자**: 2026-08-20 · **관련**: ADR-056 이후 옆핀 마감 작업
- [ADR-059 · 하루 출결은 "한 종류만"이 아니라 "교시별 사실 그대로" 담고, 접기는 통계에서만 한다](docs/03-decisions/ADR-059.md) — 채택
- [ADR-060 · 상담 슬롯은 "누가 막았는지"를 기록하고, 차단 사유 문구는 저장하지 않는다](docs/03-decisions/ADR-060.md) — 채택
- [ADR-061 · 인앱 AI 공급자를 OpenCode Zen에서 업스테이지 Solar로 바꾼다 — ADR-052 보류 사유 재검토](docs/03-decisions/ADR-061.md) — 재검토 완료 · **착수 여부는 오너 판단 대기** · **일자**: 2026-08-20~21
- [ADR-062 · 온라인 교무실은 "DB 잠그고 함수로만 연다" — 부서 간 격리와 관리자 토큰 분리](docs/03-decisions/ADR-062.md) — active · 2026-08-21
- [ADR-063 · 구글에서 되돌아온 일정은 로컬의 "신분증"을 바꾸지 못한다](docs/03-decisions/ADR-063.md) — active · 2026-08-21
- [ADR-064 · 연락처는 새 저장소를 만들지 않는다 — 교직원만 신설, 학생·보호자는 명렬표가 정본](docs/03-decisions/ADR-064.md)
- [ADR-065 · 자료실 파일은 쌤핀 서버를 지나지 않는다 — 서버는 업로드 세션 주소만 내준다](docs/03-decisions/ADR-065.md) — 확정 · **일자**: 2026-08-21 · **관련**: 온라인 교무실 M3, ADR-062
- [ADR-066 · 알림 예약은 출처별로 나누고, 울리기 직전에 정본을 다시 본다 — 할 일 시각 알람](docs/03-decisions/ADR-066.md) — 확정 · **일자**: 2026-08-22 · **계획서**: `docs/01-plan/features/todo-check-alarm-board-mention.plan.md`
- [ADR-067 · 쌤핀 AI는 직전 대화를 함께 싣는다 — §8.2(단발 질문) 뒤집음](docs/03-decisions/ADR-067.md) — 확정 · **일자**: 2026-08-23 · **발단**: 오너 실사용 신고
- [ADR-068 · 교무실 글쓰기 편집기는 Lexical — 계획서의 TipTap 추천을 뒤집는다](docs/03-decisions/ADR-068.md)
- [ADR-069 · 교무실 본문은 형식 칸을 따로 둔다 — 편집기 구조로 저장하고, html·markdown 은 쓰지 않는다](docs/03-decisions/ADR-069.md)
- [ADR-070 · 새 대형 기능은 "실험실 기능"으로 내보낸다 — 쌤핀 AI·온라인 교무실·쿨메신저](docs/03-decisions/ADR-070.md)
- [ADR-071 · 임시저장은 말머리·태그·첨부를 배열 칸으로 함께 보관한다 — 자동 저장은 검증 실패로 끊지 않는다](docs/03-decisions/ADR-071.md)
- [ADR-072 · 생기부 초안을 쌤핀 AI로 옮긴다 — 막는 자리는 프롬프트가 아니라 입력이다](docs/03-decisions/ADR-072.md)
- [ADR-073 · Drive 동기화는 3방향 판정과 v2 네임스페이스로 간다 — 장부만 보고 충돌을 만들지 않는다](docs/03-decisions/ADR-073.md)
- [ADR-074 · 학생에게 닿는 쓰기 3종(출결·관찰·채점)을 연다 — 등급 경계는 그대로 두고, 이름을 별칭으로 가린 채](docs/03-decisions/ADR-074.md)
- [ADR-075 · 옆핀이 고른 모니터를 시스템이 덮어쓰지 않는다 — AC-18을 뒤집는다](docs/03-decisions/ADR-075.md)
- [ADR-076 · 상담 예약의 수업 시간 제외는 날짜마다 따로 계산한다 — 첫 날짜 하나로 나머지를 짐작하지 않는다](docs/03-decisions/ADR-076.md)
- [ADR-077 · 유리에서 "떠 있는 면"은 표시(`data-sp-floating`)를 달고, 그 계약을 회귀 검사가 지킨다](docs/03-decisions/ADR-077.md)
- [ADR-078 · 발표 중 옆핀 가리기는 "순한 등급"으로 한다 — 추측으로 판단하는 감지기에 최대 반응을 물리지 않는다](docs/03-decisions/ADR-078.md)
- [ADR-079 · 교무실 계측은 "부서 단위 행"을 만들지 않는다 — 화면에서 가리는 게 아니라 SQL 에서 안 꺼낸다](docs/03-decisions/ADR-079.md)
- [ADR-080 · 옆핀 PIN 잠금 — 해제 상태를 상태 기계가 들고, 재잠금은 시간이 아니라 사건에 건다](docs/03-decisions/ADR-080.md)
- [ADR-081 · 계측은 "이름만" 담고, 모바일은 롤업에서 갈라 둔다](docs/03-decisions/ADR-081.md)
- [ADR-082 · "내 AI로 실행" — 선생님 본인 구독 CLI(Claude Code·Codex)를 쌤핀이 대신 띄운다. 구글은 약관상 뺀다](docs/03-decisions/ADR-082.md) — active(계획 단계, 착수는 S0 실측 후) · **일자**: 2026-09-04 · **계획서**: `docs/01-plan/features/assist-own-subscription-cli.plan.md`
- [ADR-083 · 탐구 흐름은 "창고에서 묶는다" — 슬롯은 기록의 속성, 주제는 쌓인 뒤에 드러난다](docs/03-decisions/ADR-083.md)
- [ADR-084 · "내 AI" 2차: 고르기를 화면으로 꺼내고, 첨부를 연다 (2026-09-05)](docs/03-decisions/ADR-084.md)
- [ADR-085 · 생기부 초안 3차 — 근거는 보드 한 장, AI 초안은 오른쪽 패널, 문단에는 형광펜 (ADR-083 두 곳 수정)](docs/03-decisions/ADR-085.md)
- [ADR-086 · 관찰 입력 → 주제별 근거: 저장이 실패를 실패라고 말하게, 본문을 먼저 쓰게 (2026-09-07)](docs/03-decisions/ADR-086.md)

- [ADR-V · 실시간 담벼락 v2 릴리즈 라벨](docs/03-decisions/ADR-V-realtime-wall-v2-release-labels.md) — 번호 없음(예전 파일)
