/**
 * useInteractiveLessonStore — 수업 템플릿 편집 상태 (renderer Zustand).
 *
 * 책임:
 * - 수업 CRUD (load/create/update/delete)
 * - Google Slides URL 입력 → IPC `slides-source:fetch-from-google` 호출 → 슬라이드 채우기
 * - 활동 배치 (오버레이 add/update position/update config/delete/clone-for-recreate)
 *
 * **세션 라이프사이클은 별도** (`useSlidesSessionStore`).
 *
 * Plan §3 + Design §8.1 매핑.
 */

import { create } from 'zustand';
import type {
  InteractiveLesson,
  OverlayConfig,
  OverlayPosition,
  OverlayType,
} from '@domain/entities/InteractiveSlides';
import type {
  LessonId,
  OverlayId,
  SlideId,
} from '@domain/valueObjects/InteractiveSlidesIds';
import { interactiveLessonRepository } from '@adapters/di/container';
import { ManageInteractiveLesson } from '@usecases/interactiveSlides/ManageInteractiveLesson';

interface InteractiveLessonState {
  readonly lessons: readonly InteractiveLesson[];
  readonly isLoading: boolean;
  readonly fetchError: string | null;

  // Lesson CRUD
  loadAll: () => Promise<void>;
  createLesson: (title: string) => Promise<LessonId>;
  updateLessonTitle: (lessonId: LessonId, title: string) => Promise<void>;
  deleteLesson: (lessonId: LessonId) => Promise<void>;

  // Slide source
  /**
   * Google Slides URL → 이미지 캐시 → 수업의 slides 배열 갱신.
   * 기존 활동 배치는 잃음 (호출자가 확인 다이얼로그 표시 권장).
   */
  connectGoogleSlides: (lessonId: LessonId, url: string) => Promise<void>;

  /**
   * PDF 파일 → 모든 페이지 PNG 렌더 → 이미지 캐시 → 수업의 slides 배열 갱신.
   * - renderer 측 pdfjs-dist로 렌더, IPC로 PNG bytes만 메인에 전달.
   * - 캡: 50MB / 100 페이지 (Plan §3).
   * - 기존 활동 배치는 잃음.
   */
  connectPdf: (
    lessonId: LessonId,
    file: File,
    onProgress?: (p: { current: number; total: number }) => void,
  ) => Promise<void>;

  // Overlay 조작
  addOverlay: (
    lessonId: LessonId,
    slideId: SlideId,
    type: OverlayType,
    position: OverlayPosition,
    config: OverlayConfig,
  ) => Promise<OverlayId>;
  updateOverlayPosition: (
    lessonId: LessonId,
    overlayId: OverlayId,
    position: OverlayPosition,
  ) => Promise<void>;
  updateOverlayConfig: (
    lessonId: LessonId,
    overlayId: OverlayId,
    config: OverlayConfig,
  ) => Promise<void>;
  setOverlayAutoActivate: (
    lessonId: LessonId,
    overlayId: OverlayId,
    autoActivate: boolean,
  ) => Promise<void>;
  deleteOverlay: (lessonId: LessonId, overlayId: OverlayId) => Promise<void>;
  /** UX 안전망 — 활성화된 오버레이는 수정 불가, 닫고 새로 만들기 시 위치/크기 복제 */
  cloneOverlayForRecreate: (
    lessonId: LessonId,
    overlayId: OverlayId,
  ) => Promise<OverlayId | null>;
}

const manage = new ManageInteractiveLesson({
  repo: interactiveLessonRepository,
  clock: () => Date.now(),
  makeId: () => globalThis.crypto.randomUUID(),
});

export const useInteractiveLessonStore = create<InteractiveLessonState>(
  (set, get) => {
    const reload = async (): Promise<readonly InteractiveLesson[]> => {
      const lessons = await manage.loadAll();
      set({ lessons });
      return lessons;
    };

    return {
      lessons: [],
      isLoading: false,
      fetchError: null,

      loadAll: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, fetchError: null });
        try {
          await reload();
        } finally {
          set({ isLoading: false });
        }
      },

      createLesson: async (title) => {
        const lesson = await manage.createLesson(title);
        await reload();
        return lesson.id;
      },

      updateLessonTitle: async (lessonId, title) => {
        await manage.updateLesson(lessonId, { title });
        await reload();
      },

      deleteLesson: async (lessonId) => {
        await manage.deleteLesson(lessonId);
        await reload();
      },

      connectGoogleSlides: async (lessonId, url) => {
        const api = window.electronAPI?.interactiveSlides;
        if (!api) {
          set({ fetchError: 'Electron API를 사용할 수 없습니다.' });
          throw new Error('electronAPI.interactiveSlides 없음');
        }
        set({ fetchError: null });
        try {
          const result = await api.fetchFromGoogle({ url });
          // Source는 google-slides 타입으로 갱신
          // presentationId는 imagePath의 경로에서 추출 (예: ".../{presId}/{revId}/{pageId}.png")
          // 보다 안전한 방식: URL을 다시 파싱해서 보존
          await manage.replaceSlides(
            lessonId,
            {
              type: 'google-slides',
              presentationId: extractPresentationIdFromImagePath(
                result.slides[0]?.imagePath ?? '',
              ),
              revisionId: result.revisionId,
            },
            result.slides,
          );
          await reload();
        } catch (err) {
          const msg = err instanceof Error ? err.message : '슬라이드 가져오기 실패';
          set({ fetchError: msg });
          throw err;
        }
      },

      connectPdf: async (lessonId, file, onProgress) => {
        const api = window.electronAPI?.interactiveSlides;
        if (!api?.renderPdf) {
          set({ fetchError: 'Electron API를 사용할 수 없습니다.' });
          throw new Error('electronAPI.interactiveSlides.renderPdf 없음');
        }
        set({ fetchError: null });
        try {
          // 1. 파일 → ArrayBuffer
          const ab = await file.arrayBuffer();
          const bytes = new Uint8Array(ab);
          // 2. renderer에서 pdfjs로 모든 페이지 렌더 (코드 스플릿 동적 import)
          const { renderPdfToPngPages } = await import(
            '@adapters/components/Tools/InteractiveSlides/Editor/pdfRenderer'
          );
          const rendered = await renderPdfToPngPages(bytes, onProgress);
          // 3. IPC로 PNG bytes를 메인에 전달 → 캐시 저장
          const result = await api.renderPdf({
            contentHash: rendered.contentHash,
            originalFileName: file.name,
            originalSize: file.size,
            pages: rendered.pages,
          });
          // 4. 도메인에 source + slides 반영
          await manage.replaceSlides(
            lessonId,
            {
              type: 'pdf',
              originalFileName: file.name,
              originalSize: file.size,
            },
            result.slides,
          );
          await reload();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'PDF 가져오기 실패';
          set({ fetchError: msg });
          throw err;
        }
      },

      addOverlay: async (lessonId, slideId, type, position, config) => {
        const id = await manage.addOverlay(lessonId, slideId, type, position, config);
        await reload();
        return id;
      },

      updateOverlayPosition: async (lessonId, overlayId, position) => {
        await manage.updateOverlayPosition(lessonId, overlayId, position);
        await reload();
      },

      updateOverlayConfig: async (lessonId, overlayId, config) => {
        await manage.updateOverlayConfig(lessonId, overlayId, config);
        await reload();
      },

      setOverlayAutoActivate: async (lessonId, overlayId, autoActivate) => {
        await manage.setOverlayAutoActivate(lessonId, overlayId, autoActivate);
        await reload();
      },

      deleteOverlay: async (lessonId, overlayId) => {
        await manage.deleteOverlay(lessonId, overlayId);
        await reload();
      },

      cloneOverlayForRecreate: async (lessonId, overlayId) => {
        const newId = await manage.cloneOverlayForRecreate(lessonId, overlayId);
        await reload();
        return newId;
      },
    };
  },
);

/**
 * file:// 경로에서 presentationId 추출.
 * 캐시 경로 정책: `userData/cache/slides/{presentationId}/{revisionId}/{pageId}.png`
 * 추출 실패 시 빈 문자열 (UI에서 다시 fetch 시 source가 자동 갱신됨).
 */
function extractPresentationIdFromImagePath(imagePath: string): string {
  // 정규식: /slides/{pres}/{rev}/{page}.png 패턴
  const match = imagePath.match(/\/slides\/([A-Za-z0-9_-]+)\/[A-Za-z0-9_-]+\/[^/]+\.png/);
  return match ? match[1]! : '';
}
