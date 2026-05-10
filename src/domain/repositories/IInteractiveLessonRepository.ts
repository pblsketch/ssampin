/**
 * 수업 템플릿(InteractiveLesson) 영속화 인터페이스.
 *
 * - **세션(LessonSession)**: 수업이 한 번 진행된 인스턴스 — 메인 프로세스 `ISessionRepository`가 관리.
 * - **수업(InteractiveLesson)**: 슬라이드+활동 배치를 담는 재사용 가능한 템플릿 — 본 인터페이스가 관리.
 *
 * 구현체(`JsonInteractiveLessonsRepository`)는 어댑터 레이어에서 `IStoragePort` 위에 동작.
 * 단일 파일(`interactiveSlidesLessons.json`)에 모든 수업 템플릿을 모아 저장.
 */

import type { InteractiveLesson } from '@domain/entities/InteractiveSlides';

export interface InteractiveLessonsData {
  readonly version: 1;
  readonly lessons: readonly InteractiveLesson[];
}

export interface IInteractiveLessonRepository {
  /** 모든 수업 템플릿 로드. 파일 없으면 null */
  loadAll(): Promise<InteractiveLessonsData | null>;

  /** 전체 데이터 덮어쓰기 저장 (writeback 패턴, 상위에서 atomic하게 변경) */
  saveAll(data: InteractiveLessonsData): Promise<void>;
}
