/**
 * ManageInteractiveLesson — 수업 템플릿 CRUD + 활동 조작 유스케이스.
 *
 * 세션 단위 유스케이스(StartLessonSession, AdvanceSlide 등)는 메인 프로세스에서 동작하고,
 * 본 유스케이스는 렌더러에서 lesson 편집 시 사용 (Zustand store가 호출).
 *
 * 외부 의존: IInteractiveLessonRepository (도메인 포트)만 — domain 레이어 import 규칙 준수.
 */

import type {
  InteractiveLesson,
  OverlayConfig,
  OverlayPosition,
  OverlayType,
  Slide,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type { IInteractiveLessonRepository } from '@domain/repositories/IInteractiveLessonRepository';
import {
  asLessonId,
  asOverlayId,
  asSlideId,
  type LessonId,
  type OverlayId,
  type SlideId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface ManageInteractiveLessonDeps {
  readonly repo: IInteractiveLessonRepository;
  readonly clock: () => number;
  readonly makeId: () => string;
}

const SCHEMA_VERSION = 1 as const;

export class ManageInteractiveLesson {
  constructor(private readonly deps: ManageInteractiveLessonDeps) {}

  // ─────────────────────────────────────────────────────────────
  // Lesson CRUD
  // ─────────────────────────────────────────────────────────────

  async loadAll(): Promise<readonly InteractiveLesson[]> {
    const data = await this.deps.repo.loadAll();
    return data?.lessons ?? [];
  }

  async createLesson(title: string): Promise<InteractiveLesson> {
    const now = this.deps.clock();
    const newLesson: InteractiveLesson = {
      id: asLessonId(this.deps.makeId()),
      title: title.trim() || '새 수업',
      // 초기 source — connectGoogleSlides 또는 connectPdf로 채움
      source: { type: 'pdf', originalFileName: '', originalSize: 0 },
      slides: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.upsertLesson(newLesson);
    return newLesson;
  }

  async updateLesson(
    lessonId: LessonId,
    patch: Partial<Pick<InteractiveLesson, 'title'>>,
  ): Promise<void> {
    const cur = await this.findById(lessonId);
    if (!cur) return;
    const next: InteractiveLesson = {
      ...cur,
      ...patch,
      updatedAt: this.deps.clock(),
    };
    await this.upsertLesson(next);
  }

  async deleteLesson(lessonId: LessonId): Promise<void> {
    const data = (await this.deps.repo.loadAll()) ?? {
      version: SCHEMA_VERSION,
      lessons: [],
    };
    const filtered = data.lessons.filter((l) => l.id !== lessonId);
    if (filtered.length === data.lessons.length) return;
    await this.deps.repo.saveAll({ version: SCHEMA_VERSION, lessons: filtered });
  }

  /**
   * 슬라이드 소스(Google Slides fetch 결과 또는 PDF 렌더 결과)를 반영.
   * 기존 슬라이드는 모두 교체 — 활동 배치는 잃음 (UI에서 확인 다이얼로그 권장).
   */
  async replaceSlides(
    lessonId: LessonId,
    source: InteractiveLesson['source'],
    slides: readonly { pageNumber: number; imagePath: string; pageId?: string }[],
  ): Promise<void> {
    const cur = await this.findById(lessonId);
    if (!cur) return;
    const newSlides: Slide[] = slides.map((s) => ({
      id: asSlideId(s.pageId ?? this.deps.makeId()),
      pageNumber: s.pageNumber,
      imagePath: s.imagePath,
      overlays: [],
    }));
    const next: InteractiveLesson = {
      ...cur,
      source,
      slides: newSlides,
      updatedAt: this.deps.clock(),
    };
    await this.upsertLesson(next);
  }

  // ─────────────────────────────────────────────────────────────
  // Overlay 조작 (활동 배치)
  // ─────────────────────────────────────────────────────────────

  async addOverlay(
    lessonId: LessonId,
    slideId: SlideId,
    type: OverlayType,
    position: OverlayPosition,
    config: OverlayConfig,
  ): Promise<OverlayId> {
    const cur = await this.findById(lessonId);
    if (!cur) throw new Error(`Lesson not found: ${lessonId}`);
    const overlayId = asOverlayId(this.deps.makeId());
    const overlay: SlideOverlay = {
      id: overlayId,
      slideId,
      type,
      position,
      autoActivate: false,
      config,
      createdAt: this.deps.clock(),
    };
    const next = withSlideUpdate(cur, slideId, (slide) => ({
      ...slide,
      overlays: [...slide.overlays, overlay],
    }));
    if (next) await this.upsertLesson(setUpdatedAt(next, this.deps.clock()));
    return overlayId;
  }

  async updateOverlayPosition(
    lessonId: LessonId,
    overlayId: OverlayId,
    position: OverlayPosition,
  ): Promise<void> {
    await this.patchOverlay(lessonId, overlayId, (o) => ({ ...o, position }));
  }

  async updateOverlayConfig(
    lessonId: LessonId,
    overlayId: OverlayId,
    config: OverlayConfig,
  ): Promise<void> {
    await this.patchOverlay(lessonId, overlayId, (o) => ({ ...o, config }));
  }

  async setOverlayAutoActivate(
    lessonId: LessonId,
    overlayId: OverlayId,
    autoActivate: boolean,
  ): Promise<void> {
    await this.patchOverlay(lessonId, overlayId, (o) => ({
      ...o,
      autoActivate,
    }));
  }

  async deleteOverlay(
    lessonId: LessonId,
    overlayId: OverlayId,
  ): Promise<void> {
    const cur = await this.findById(lessonId);
    if (!cur) return;
    const next: InteractiveLesson = {
      ...cur,
      slides: cur.slides.map((s) => ({
        ...s,
        overlays: s.overlays.filter((o) => o.id !== overlayId),
      })),
      updatedAt: this.deps.clock(),
    };
    await this.upsertLesson(next);
  }

  /**
   * "닫고 새로 만들기" — UX 안전망 (Plan UX 리뷰 [2]).
   * 활성화된 오버레이는 수정 불가. 사용자가 위치를 다시 잡지 않도록
   * 위치/크기/타입을 그대로 복제한 새 비활성 오버레이를 추가.
   * 텍스트만 재편집 가능.
   */
  async cloneOverlayForRecreate(
    lessonId: LessonId,
    overlayId: OverlayId,
  ): Promise<OverlayId | null> {
    const cur = await this.findById(lessonId);
    if (!cur) return null;
    let original: SlideOverlay | null = null;
    for (const slide of cur.slides) {
      const found = slide.overlays.find((o) => o.id === overlayId);
      if (found) {
        original = found;
        break;
      }
    }
    if (!original) return null;
    const newId = asOverlayId(this.deps.makeId());
    const cloned: SlideOverlay = {
      ...original,
      id: newId,
      autoActivate: false,
      createdAt: this.deps.clock(),
    };
    const next = withSlideUpdate(cur, original.slideId, (slide) => ({
      ...slide,
      overlays: [...slide.overlays, cloned],
    }));
    if (next) await this.upsertLesson(setUpdatedAt(next, this.deps.clock()));
    return newId;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────

  private async findById(
    lessonId: LessonId,
  ): Promise<InteractiveLesson | null> {
    const data = await this.deps.repo.loadAll();
    return data?.lessons.find((l) => l.id === lessonId) ?? null;
  }

  private async upsertLesson(lesson: InteractiveLesson): Promise<void> {
    const data = (await this.deps.repo.loadAll()) ?? {
      version: SCHEMA_VERSION,
      lessons: [],
    };
    const next = data.lessons.some((l) => l.id === lesson.id)
      ? data.lessons.map((l) => (l.id === lesson.id ? lesson : l))
      : [...data.lessons, lesson];
    await this.deps.repo.saveAll({ version: SCHEMA_VERSION, lessons: next });
  }

  private async patchOverlay(
    lessonId: LessonId,
    overlayId: OverlayId,
    fn: (o: SlideOverlay) => SlideOverlay,
  ): Promise<void> {
    const cur = await this.findById(lessonId);
    if (!cur) return;
    const next: InteractiveLesson = {
      ...cur,
      slides: cur.slides.map((s) => ({
        ...s,
        overlays: s.overlays.map((o) => (o.id === overlayId ? fn(o) : o)),
      })),
      updatedAt: this.deps.clock(),
    };
    await this.upsertLesson(next);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function withSlideUpdate(
  lesson: InteractiveLesson,
  slideId: SlideId,
  fn: (slide: Slide) => Slide,
): InteractiveLesson | null {
  let changed = false;
  const slides = lesson.slides.map((s) => {
    if (s.id !== slideId) return s;
    changed = true;
    return fn(s);
  });
  if (!changed) return null;
  return { ...lesson, slides };
}

function setUpdatedAt(
  lesson: InteractiveLesson,
  now: number,
): InteractiveLesson {
  return { ...lesson, updatedAt: now };
}
