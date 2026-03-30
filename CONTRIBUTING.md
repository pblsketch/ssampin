# Contributing

쌤핀(SsamPin)에 기여해 주셔서 감사합니다! 이 문서는 프로젝트에 기여하는 방법을 안내합니다.

## 이슈 등록

- 버그 제보 시 **재현 절차**, **기대 동작**, **실제 동작**을 포함해 주세요.
- 기능 제안은 **사용 시나리오**와 **기대 효과**를 설명해 주세요.
- 중복 이슈가 있는지 먼저 검색해 주세요.

## Pull Request

1. 이 저장소를 **Fork** 합니다.
2. 기능/수정 브랜치를 생성합니다: `git checkout -b feat/기능이름` 또는 `git checkout -b fix/수정내용`
3. 변경사항을 커밋합니다: `git commit -m "feat: 간결한 설명"`
4. 브랜치를 푸시합니다: `git push origin feat/기능이름`
5. GitHub에서 **Pull Request**를 생성합니다.

### 커밋 메시지 형식

```
<type>: <설명>

type: feat | fix | docs | style | refactor | test | chore
```

예시:
- `feat: 좌석배치 랜덤 알고리즘 추가`
- `fix: 시간표 요일 표시 오류 수정`
- `docs: README 설치 방법 업데이트`

## 개발 환경 설정

```bash
git clone https://github.com/<your-fork>/ssampin.git
cd ssampin
npm install
npm run dev          # 브라우저 모드
npm run electron:dev # Electron 모드
```

## 코딩 컨벤션

프로젝트의 코딩 규칙은 [CLAUDE.md](CLAUDE.md)의 **코딩 컨벤션** 섹션을 참고해 주세요.

핵심 사항:
- TypeScript strict 모드 (`any` 타입 금지)
- Tailwind CSS 유틸리티 클래스 사용
- Clean Architecture 레이어 의존성 규칙 준수
- 모든 UI 텍스트는 한국어

## 아키텍처

`domain/ → usecases/ → adapters/ → infrastructure/` 순서의 의존성 규칙을 **반드시** 지켜 주세요. 자세한 내용은 [CLAUDE.md](CLAUDE.md)의 아키텍처 섹션을 참고하세요.

## 행동 강령

이 프로젝트는 [Contributor Covenant v2.1](CODE_OF_CONDUCT.md)을 따릅니다. 참여 시 이를 준수해 주세요.

## 보안 취약점

보안 관련 문제는 공개 이슈 대신 [SECURITY.md](SECURITY.md)의 절차를 따라 주세요.

## 라이선스

기여한 코드는 프로젝트의 기존 라이선스를 따릅니다.
