# 전과목 성적 다중 행 입력 구현 검증

작업 저장소: E:/github/ssampin, main. 기존 생기부·설정 관련 미커밋 변경을 보존했다. 커밋·배포 없음.

## 구현

- 교과목 머리글 아래 여러 행으로 구성된 학생 성적을 정규화. 번호/이름의 한쪽 또는 양쪽 세로 병합, HTML형 xls, 반복 표, 과목명 학점 접미사 대응.
- 반복 구간의 과목을 합치고 학생·과목 값·명시된 학급/학기 충돌 및 신원 없는 성적 행은 전체 가져오기를 중단한다.
- 전과목 경로만 성적 시트를 탐색. 여러 성적 시트는 자동 병합하지 않는다. 공용 로더의 단일 과목 첫 시트 계약 유지.
- 확인 후 반영으로 현재 성적 전체 교체. 취소·저장 실패는 현재 화면 유지. 원문 점수는 선택 필드 scoreText로 보존하며 계산하지 않는다.
- 석차 관련 정보 부족 안내와 실제 파일 전체 과목 수 표시. 사용자 가이드 갱신. ADR-115 작성 및 DECISIONS 목록 등록.

## 최종 검사

- npx tsc --noEmit: exit 0, 오류 0.
- npm run lint: exit 0, 오류 0/기존 경고 136.
- npm run test: exit 0, 773파일/10,662검사 통과, 10건 건너뜀. 207.81초.
- npm run regression-check: exit 0, 117/117.
- landing: npm run docs:check 통과(46문서/8내부링크/17이미지), npm run build 통과(65페이지).
- git diff --check: 통과.
- 로그: \_workspace/transcript-qa/\*-final.log. 추가 검사 코드는 NeisTranscriptExcelParser.test.ts, HomeroomGradeOverviewTab.test.tsx, ManageImportedTranscript.test.ts에 있다.

## 브라우저 검증

- 별도 로컬 origin http://127.0.0.1:5189/_workspace/transcript-qa/index.html 에 실제 성적 컴포넌트·실제 저장소를 마운트했다.
- 독립 가상 xlsx(2명/2과목)를 로컬 HTTP로 읽어 실제 파일 입력 change 경로에 전달.
- 미리보기의 학급/학기/학생과 취소 시 미저장 확인.
- 확인 후 반영 시 2명/2과목, 파일 점수 91.2(91), A/D·등급1/4와 지원 신호 표시 확인.
- 새로고침 후 저장 유지, 두 번째 학생의 84/73·B/C·2/3 확인.
- 여러 성적 시트 파일 오류 시 앞서 저장된 두 학생과 선택한 학생 값 유지 확인.
- 저장 실패·재시도·중복 반영 차단은 자동 컴포넌트/실제 스토어 검사로 확인.
- Windows 파일 선택창 경로는 Chrome 확장 프로그램 파일 URL 접근 설정 제한으로 미검증. 브라우저 내 가상 파일 주입과 구분한다.
- 실제 제보 파일/전체 NEIS 양식/Electron 패키지 실기기 확인은 미실행.
