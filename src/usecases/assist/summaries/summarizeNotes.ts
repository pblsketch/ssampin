/**
 * 노트 **목록**을 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★본문은 보내지 않는다(계획서 §2 확정). 노트는 메모지와 성격이 다르다 — 수업 계획·회의록
 * 처럼 길고, 학생 개별 사정이 문단째 들어가는 자리다. "어느 노트에 무엇이 있는지"만 알면
 * 선생님이 앱에서 열어 보면 된다.
 *
 * 노트책·구역·페이지 제목은 전부 자유 입력이라 freeTextFields 대상이다.
 */

/** summarizeNotes 가 필요로 하는 최소 필드 (Notebook / NoteSection / NotePage 와 호환) */
export interface NoteSources {
  readonly notebooks: readonly {
    readonly id: string;
    readonly title: string;
    readonly archived: boolean;
  }[];
  readonly sections: readonly {
    readonly id: string;
    readonly notebookId: string;
    readonly title: string;
  }[];
  readonly pages: readonly {
    readonly sectionId: string;
    readonly title: string;
    readonly pinned: boolean;
    /** ISO 8601 */
    readonly updatedAt: string;
  }[];
}

export interface SummarizeNotesOptions {
  /** 보관한 노트책의 페이지도 포함할지. 기본 false */
  readonly includeArchived?: boolean;
  /** 담을 건수 상한. 기본 60건 */
  readonly maxItems?: number;
}

export interface NotesSummary {
  /** 조건에 맞는 **전체** 페이지 수 */
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly notebook: string;
    readonly section: string;
    readonly title: string;
    readonly pinned: boolean;
    /** YYYY-MM-DD */
    readonly updated: string;
  }[];
}

export function summarizeNotes(src: NoteSources, opts: SummarizeNotesOptions = {}): NotesSummary {
  const includeArchived = opts.includeArchived ?? false;
  const maxItems = opts.maxItems ?? 60;

  const notebookById = new Map(src.notebooks.map((n) => [n.id, n]));
  const sectionById = new Map(src.sections.map((s) => [s.id, s]));

  const rows = src.pages
    .map((page) => {
      const section = sectionById.get(page.sectionId);
      const notebook = section ? notebookById.get(section.notebookId) : undefined;
      return { page, section, notebook };
    })
    // 노트책이 사라진 고아 페이지는 담지 않는다 — 어디 것인지 말할 수 없으면 답에 쓸모가 없다.
    .filter((row) => row.notebook !== undefined)
    .filter((row) => includeArchived || row.notebook?.archived !== true)
    .sort((a, b) => {
      // 고정한 페이지가 먼저, 그다음 최근에 고친 순.
      const pin = Number(b.page.pinned) - Number(a.page.pinned);
      return pin !== 0 ? pin : b.page.updatedAt.localeCompare(a.page.updatedAt);
    });

  return {
    total: rows.length,
    truncated: rows.length > maxItems,
    items: rows.slice(0, maxItems).map(({ page, section, notebook }) => ({
      notebook: notebook?.title ?? '',
      section: section?.title ?? '',
      title: page.title,
      pinned: page.pinned,
      updated: page.updatedAt.slice(0, 10),
    })),
  };
}
