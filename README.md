# 쌤핀 (SsamPin)

![SsamPin Banner](docs/screenshot.png)

교사를 위한 똑똑한 데스크톱 대시보드 쌤핀(SsamPin)입니다.
앱 하나로 일정, 메모, 시간표, 학생 좌석 등 교실 업무를 더욱 스마트하게 관리하세요.

## 🌟 주요 기능

- **위젯 지원**: 화면의 일부를 차지하는 투명 위젯과 항상 위에 표시 모드 지원
- **시간표 관리**: 학교급(초/중/고) 프리셋 설정, 시간 관리 
- **학생명단 및 좌석**: 학생 명단 관리, 랜덤 좌석 배치, 드래그 앤 드롭 이동
- **메모 및 할일**: 메모 드래그 편집, Todo 체킹
- **일정 관리**: 컬러 라벨링된 일정과 학급 행사
- **온보딩 마법사**: 첫 시작 시 편리한 설정 가이드
- **내보내기/공유**: Excel, HWPX, PDF 형식 내보내기 및 .ssampin 일정 파일 공유

## 🏗️ 아키텍처 다이어그램 (Clean Architecture)

본 프로젝트는 의존성 규칙을 준수하여 **Clean Architecture(클린 아키텍처)** 기반으로 구축되었습니다.

```mermaid
graph TD
    Domain[Domain Layer<br/>(Entities, Rules, Ports)]
    UseCases[UseCases Layer<br/>(Application Logic)]
    Adapters[Adapters Layer<br/>(React Components, UI State, Controllers)]
    Infrastructure[Infrastructure Layer<br/>(Electron, FileSystem, Excel/HWPX Export)]

    UseCases -.->|Imports| Domain
    Adapters -.->|Imports| UseCases
    Adapters -.->|Imports| Domain
    Infrastructure -.->|Implements| Domain
    
    style Domain fill:#2d3748,stroke:#4fd1c5,stroke-width:2px,color:#fff
    style UseCases fill:#2d3748,stroke:#63b3ed,stroke-width:2px,color:#fff
    style Adapters fill:#2d3748,stroke:#f6ad55,stroke-width:2px,color:#fff
    style Infrastructure fill:#2d3748,stroke:#fc8181,stroke-width:2px,color:#fff
```

## 🛠 기술 스택

- **프론트엔드**: React 18, TypeScript, Tailwind CSS, Zustand
- **빌드 및 툴링**: Vite, ESLint
- **데스크톱 앱**: Electron, Electron-builder

## 📥 다운로드

**다운로드 페이지**: https://ssampin.com

1. 위 페이지에서 최신 설치 파일을 다운로드 받아 실행해 주세요.
2. 설치된 `쌤핀` 앱을 실행합니다.

> **Note**: `.ssampin` 일정을 더블클릭하면 쌤핀 앱이 자동으로 실행되며 가져오기 화면이 뜹니다.

## 🧑‍💻 개발 환경 설정

로컬 환경에서 직접 빌드하거나 개발 모드로 실행하려면 다음을 따르세요:

### 요구사항
- Node.js 18 이상

### 의존성 설치
```bash
npm install
```

### 개발 모드 실행
```bash
npm run electron:dev
```
- 브라우저 개발 모드: `npm run dev`

### 빌드 및 패키징
```bash
npm run electron:build
```
> Windows 환경에서 NSIS 인스톨러로 빌드됩니다. (release 폴더에 저장)

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참고하세요.
