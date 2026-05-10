import { beforeEach, describe, expect, it } from 'vitest';
import { ManageInteractiveLesson } from './ManageInteractiveLesson';
import type {
  IInteractiveLessonRepository,
  InteractiveLessonsData,
} from '@domain/repositories/IInteractiveLessonRepository';
import type {
  OverlayConfig,
  OverlayPosition,
} from '@domain/entities/InteractiveSlides';
import { asLessonId, asOverlayId, asSlideId } from '@domain/valueObjects/InteractiveSlidesIds';

class FakeRepo implements IInteractiveLessonRepository {
  data: InteractiveLessonsData | null = null;
  loadAll(): Promise<InteractiveLessonsData | null> {
    return Promise.resolve(this.data);
  }
  saveAll(data: InteractiveLessonsData): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }
}

const POSITION: OverlayPosition = {
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 20,
};

const POLL_CONFIG: OverlayConfig = {
  type: 'poll',
  question: '어떤 거?',
  options: [
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
  ],
  multiSelect: false,
};

let idCounter = 0;
const makeIdSeq = (): string => `id-${++idCounter}`;
const NOW = 1000;

describe('ManageInteractiveLesson', () => {
  let repo: FakeRepo;
  let manage: ManageInteractiveLesson;

  beforeEach(() => {
    idCounter = 0;
    repo = new FakeRepo();
    manage = new ManageInteractiveLesson({
      repo,
      clock: () => NOW,
      makeId: makeIdSeq,
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('Lesson CRUD', () => {
    it('createLesson: 빈 제목 fallback', async () => {
      const lesson = await manage.createLesson('   ');
      expect(lesson.title).toBe('새 수업');
      const all = await manage.loadAll();
      expect(all).toHaveLength(1);
    });

    it('updateLesson: title 변경 + updatedAt 갱신', async () => {
      const lesson = await manage.createLesson('초기');
      await manage.updateLesson(lesson.id, { title: '변경됨' });
      const all = await manage.loadAll();
      expect(all[0]!.title).toBe('변경됨');
    });

    it('deleteLesson: 해당 lesson만 제거', async () => {
      const a = await manage.createLesson('A');
      const b = await manage.createLesson('B');
      await manage.deleteLesson(a.id);
      const all = await manage.loadAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(b.id);
    });

    it('없는 lessonId delete는 noop', async () => {
      await expect(manage.deleteLesson(asLessonId('ghost'))).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('replaceSlides', () => {
    it('Google Slides fetch 결과 반영 + 활동 잃음', async () => {
      const lesson = await manage.createLesson('수업');
      // 슬라이드를 만들어주기 위해 replaceSlides 1차 호출
      await manage.replaceSlides(
        lesson.id,
        { type: 'google-slides', presentationId: 'p', revisionId: 'r1' },
        [{ pageNumber: 1, imagePath: 'file:///s1.png', pageId: 'p1' }],
      );
      let all = await manage.loadAll();
      expect(all[0]!.slides).toHaveLength(1);
      const firstSlideId = all[0]!.slides[0]!.id;

      // 활동 추가
      await manage.addOverlay(
        lesson.id,
        firstSlideId,
        'poll',
        POSITION,
        POLL_CONFIG,
      );
      all = await manage.loadAll();
      expect(all[0]!.slides[0]!.overlays).toHaveLength(1);

      // revisionId 변경 → replaceSlides 재호출 → 활동 잃음 (의도된 동작)
      await manage.replaceSlides(
        lesson.id,
        { type: 'google-slides', presentationId: 'p', revisionId: 'r2' },
        [
          { pageNumber: 1, imagePath: 'file:///s1.png', pageId: 'p1' },
          { pageNumber: 2, imagePath: 'file:///s2.png', pageId: 'p2' },
        ],
      );
      all = await manage.loadAll();
      expect(all[0]!.slides).toHaveLength(2);
      expect(all[0]!.slides[0]!.overlays).toEqual([]);
      expect(all[0]!.source.type).toBe('google-slides');
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('Overlay 조작', () => {
    let lessonId: ReturnType<typeof asLessonId>;
    let slideId: ReturnType<typeof asSlideId>;

    beforeEach(async () => {
      const lesson = await manage.createLesson('수업');
      lessonId = lesson.id;
      await manage.replaceSlides(
        lessonId,
        { type: 'google-slides', presentationId: 'p', revisionId: 'r' },
        [{ pageNumber: 1, imagePath: 'file:///s.png', pageId: 'p1' }],
      );
      const all = await manage.loadAll();
      slideId = all[0]!.slides[0]!.id;
    });

    it('addOverlay: 슬라이드의 overlays 배열에 추가', async () => {
      await manage.addOverlay(lessonId, slideId, 'poll', POSITION, POLL_CONFIG);
      const all = await manage.loadAll();
      expect(all[0]!.slides[0]!.overlays).toHaveLength(1);
      expect(all[0]!.slides[0]!.overlays[0]!.position).toEqual(POSITION);
      expect(all[0]!.slides[0]!.overlays[0]!.autoActivate).toBe(false);
    });

    it('updateOverlayPosition: 위치만 변경', async () => {
      const overlayId = await manage.addOverlay(
        lessonId,
        slideId,
        'poll',
        POSITION,
        POLL_CONFIG,
      );
      const newPos: OverlayPosition = {
        xPercent: 50,
        yPercent: 50,
        widthPercent: 40,
        heightPercent: 30,
      };
      await manage.updateOverlayPosition(lessonId, overlayId, newPos);
      const all = await manage.loadAll();
      expect(all[0]!.slides[0]!.overlays[0]!.position).toEqual(newPos);
    });

    it('setOverlayAutoActivate: 토글', async () => {
      const overlayId = await manage.addOverlay(
        lessonId,
        slideId,
        'poll',
        POSITION,
        POLL_CONFIG,
      );
      await manage.setOverlayAutoActivate(lessonId, overlayId, true);
      const all = await manage.loadAll();
      expect(all[0]!.slides[0]!.overlays[0]!.autoActivate).toBe(true);
    });

    it('deleteOverlay: 단일 오버레이만 제거', async () => {
      const o1 = await manage.addOverlay(lessonId, slideId, 'poll', POSITION, POLL_CONFIG);
      const o2 = await manage.addOverlay(lessonId, slideId, 'poll', POSITION, POLL_CONFIG);
      await manage.deleteOverlay(lessonId, o1);
      const all = await manage.loadAll();
      expect(all[0]!.slides[0]!.overlays).toHaveLength(1);
      expect(all[0]!.slides[0]!.overlays[0]!.id).toBe(o2);
    });

    it('cloneOverlayForRecreate: 위치/크기/타입 복제, 새 ID + autoActivate=false', async () => {
      const original = await manage.addOverlay(
        lessonId,
        slideId,
        'poll',
        POSITION,
        POLL_CONFIG,
      );
      // 자동활성화 ON 후 복제
      await manage.setOverlayAutoActivate(lessonId, original, true);
      const cloned = await manage.cloneOverlayForRecreate(lessonId, original);
      expect(cloned).not.toBeNull();
      expect(cloned).not.toBe(original);

      const all = await manage.loadAll();
      const overlays = all[0]!.slides[0]!.overlays;
      expect(overlays).toHaveLength(2);
      const clone = overlays.find((o) => o.id === cloned)!;
      expect(clone.position).toEqual(POSITION);
      expect(clone.config.type).toBe('poll');
      expect(clone.autoActivate).toBe(false); // 원본 토글과 무관하게 false로 시작
    });

    it('cloneOverlayForRecreate: 없는 오버레이는 null', async () => {
      const r = await manage.cloneOverlayForRecreate(
        lessonId,
        asOverlayId('ghost'),
      );
      expect(r).toBeNull();
    });
  });
});
