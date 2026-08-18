/**
 * 메타 테스트 — Modal 안 wrapping div 의 height context 보존 확인.
 *
 * 회귀 시나리오 (2026-05-19 사용자 신고, dlekthf0109@naver.com):
 *   AssignmentCreateModal · SurveyCreateModal 등에서 옵션을 길게 추가하면
 *   하단 "만들기" 버튼이 viewport 밖으로 잘려 사용 불가.
 *
 * 근본 원인:
 *   Modal 베이스 패널은 `max-h-[calc(100vh-48px)] + overflow-hidden + flex flex-col`
 *   인데, children 의 wrapping `<div className="flex flex-col">` 가 `flex-1 min-h-0`
 *   을 갖지 않아 panel 의 max-h 컨텍스트를 상속하지 못하면 내부 `overflow-y-auto`
 *   가 발현되지 않고 footer 가 잘림.
 *
 * 검증 방식:
 *   1) Modal 베이스가 핵심 클래스 (`max-h-[calc(100vh-48px)]`, `overflow-hidden`,
 *      `flex flex-col`) 를 그대로 유지하는지 보장.
 *   2) 위험 후보 모달 13건은 `<Modal …>` 직속 첫 wrapping `<div>` 의 className 이
 *      `flex-1 min-h-0` 을 포함하거나 자체 `max-h-*` 컨텍스트를 갖는지 보장.
 *
 * 새 모달을 추가하면서 동일 패턴이 등장하면 MODALS_TO_GUARD 에 등록해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');

/**
 * Modal 안에 wrapping `<div className="flex flex-col ...">` 패턴을 갖는 모달.
 * 새 모달이 같은 구조를 채택하면 여기 등록해야 한다.
 */
const MODALS_TO_GUARD: ReadonlyArray<readonly [filePath: string, label: string]> = [
  ['src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx', 'AssignmentCreateModal'],
  ['src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx', 'SurveyCreateModal'],
  ['src/adapters/components/Schedule/CategoryManagementModal.tsx', 'CategoryManagementModal'],
  ['src/adapters/components/Schedule/DayScheduleModal.tsx', 'DayScheduleModal'],
  ['src/adapters/components/Timetable/NeisImportModal.tsx', 'NeisImportModal'],
  ['src/adapters/components/Todo/TodoCategoryModal.tsx', 'TodoCategoryModal'],
  [
    'src/adapters/components/StudentRecords/RecordCategoryManagementModal.tsx',
    'RecordCategoryManagementModal',
  ],
  ['src/adapters/components/Homeroom/shared/ExportModal.tsx', 'HomeroomExportModal'],
  [
    'src/adapters/components/Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx',
    'StudentCountReduceConfirmModal',
  ],
  ['src/adapters/components/Seating/SeatZoneModal.tsx', 'SeatZoneModal'],
  ['src/adapters/components/Export/ExportPreviewModal.tsx', 'ExportPreviewModal'],
  ['src/adapters/components/Tools/Sticker/StickerAddPickerModal.tsx', 'StickerAddPickerModal'],
  ['src/adapters/components/Tools/Sticker/StickerSettingsModal.tsx', 'StickerSettingsModal'],
  ['src/adapters/components/Memo/MemoShareModal.tsx', 'MemoShareModal'],
  // 2026-08-18 전수 스캔에서 뒤늦게 발견된 누락분 3건 (아래 FOOTER_OUTSIDE_SCROLL 도 함께 지킨다)
  ['src/adapters/components/Tools/ToolsGrid.tsx', 'ToolsGrid(쌤도구 정리하기)'],
  ['src/adapters/components/Schedule/EventFormModal.tsx', 'EventFormModal'],
  ['src/adapters/components/Timetable/TempChangeModal.tsx', 'TempChangeModal'],
];

/**
 * 푸터(확정 버튼 줄)가 스크롤 영역 '밖'에 있어야 하는 모달.
 *
 * 회귀 시나리오 (2026-08-18 전수 스캔):
 *   저장/추가 버튼이 overflow-y-auto 안에 들어가 있으면, 입력이 길어질수록
 *   버튼이 접힌 화면 아래로 밀려 "저장을 못 하겠다"가 된다. ToolsGrid 는
 *   높이 컨텍스트까지 끊겨 마우스로는 아예 도달 불가였다(실측: 버튼 y=2064, 화면 900).
 */
const FOOTER_OUTSIDE_SCROLL: ReadonlyArray<readonly [filePath: string, label: string]> = [
  ['src/adapters/components/Tools/ToolsGrid.tsx', 'ToolsGrid(쌤도구 정리하기)'],
  ['src/adapters/components/Schedule/EventFormModal.tsx', 'EventFormModal'],
  ['src/adapters/components/Timetable/TempChangeModal.tsx', 'TempChangeModal'],
];

/** 확정 성격의 버튼 라벨 — 이 버튼이 스크롤 영역 안에 있으면 안 된다. */
const CONFIRM_LABELS = ['저장', '추가', '수정', '변동 등록', '교체 등록'];

const TAG_RE = /<(\/?)([A-Za-z][\w.]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

function classNameOf(attrs: string): string {
  const m = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
  return m ? (m[1] ?? m[2] ?? '') : '';
}

function isScrollContainer(cls: string): boolean {
  return /overflow-y-auto|overflow-auto|overflow-y-scroll/.test(cls);
}

/** 확정 버튼이 스크롤 영역 안에 갇혀 있으면 그 스크롤 영역 className 을 돌려준다. */
function findTrappedConfirmButton(source: string): string | null {
  const start = source.search(/<Modal[\s\n]/);
  if (start === -1) return null;
  const region = source.slice(start);

  TAG_RE.lastIndex = 0;
  const stack: { tag: string; cls: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(region)) !== null) {
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrText = attrs ?? '';
    if (tag === 'button') {
      const after = region.slice(m.index, m.index + 400);
      const isConfirm =
        /type="submit"/.test(attrText) ||
        CONFIRM_LABELS.some((w) => new RegExp(`>\\s*${w}\\s*<`).test(after));
      if (isConfirm) {
        const scroller = stack.find((s) => isScrollContainer(s.cls));
        if (scroller) return scroller.cls;
      }
    }
    if (!selfClose) stack.push({ tag: tag ?? '', cls: classNameOf(attrText) });
  }
  return null;
}

/** Modal 베이스 컴포넌트가 보장해야 하는 패널 클래스. 베이스 회귀를 차단. */
const MODAL_BASE_CLASSES = ['max-h-[calc(100vh-48px)]', 'overflow-hidden', 'flex flex-col'];

describe('Modal scroll overflow (meta)', () => {
  it('Modal 베이스 패널은 height + overflow + flex 클래스를 유지한다', () => {
    const source = readFileSync(resolve(ROOT, 'src/adapters/components/common/Modal.tsx'), 'utf8');
    for (const cls of MODAL_BASE_CLASSES) {
      expect(
        source,
        `Modal.tsx 패널이 "${cls}" 클래스를 잃었습니다. 이 클래스가 없으면 children 의 ` +
          `flex-1 min-h-0 패턴이 작동하지 않아 footer 가 viewport 밖으로 잘립니다.`,
      ).toContain(cls);
    }
  });

  for (const [relPath, label] of MODALS_TO_GUARD) {
    it(`${label} (${relPath}) 의 wrapping div 가 height 컨텍스트를 갖는다`, () => {
      const fullPath = resolve(ROOT, relPath);
      const source = readFileSync(fullPath, 'utf8');

      // <Modal …> 다음 첫 wrapping <div className="…"> 의 className 추출.
      // 멀티라인을 허용한다.
      const match = source.match(/<Modal\b[\s\S]*?>\s*<div\s+className="([^"]+)"/);
      expect(
        match,
        `${label}: <Modal …> 직속 wrapping <div className="…"> 패턴을 찾지 못했습니다. ` +
          `구조가 바뀌었다면 MODALS_TO_GUARD 목록을 갱신하세요.`,
      ).not.toBeNull();

      const className = match![1] ?? '';
      const tokens = className.split(/\s+/);

      const hasFlex1MinH0 = tokens.includes('flex-1') && tokens.includes('min-h-0');
      const hasExplicitMaxH = tokens.some((t) => /^max-h-/.test(t));

      expect(
        hasFlex1MinH0 || hasExplicitMaxH,
        `${label}: <Modal> 직속 wrapping div className 이 'flex-1 min-h-0' 또는 'max-h-*' 를 ` +
          `포함해야 합니다. 현재 className: "${className}".\n` +
          `\n` +
          `이유: Modal 패널은 max-h-[calc(100vh-48px)] + overflow-hidden 인데, 자식 wrapping ` +
          `div 가 panel 의 flex 공간을 차지하지 않으면 (flex-1 min-h-0 없음) 내부 ` +
          `overflow-y-auto body 가 작동하지 않아 footer (예: '만들기' 버튼) 가 잘립니다.\n` +
          `\n` +
          `해결: <div className="flex flex-col flex-1 min-h-0"> 로 수정하세요.`,
      ).toBe(true);
    });
  }

  for (const [relPath, label] of FOOTER_OUTSIDE_SCROLL) {
    it(`${label} 의 확정 버튼은 스크롤 영역 밖에 있다`, () => {
      const source = readFileSync(resolve(ROOT, relPath), 'utf8');
      const trappedIn = findTrappedConfirmButton(source);

      expect(
        trappedIn,
        `${label}: 저장/추가 같은 확정 버튼이 스크롤 영역 안에 있습니다.\n` +
          `갇힌 스크롤 영역 className: "${trappedIn}"\n` +
          `\n` +
          `이유: 입력이 길어지면 버튼이 접힌 화면 아래로 밀려 사용자가 "저장이 안 된다"고 느낍니다.\n` +
          `\n` +
          `해결: 버튼 줄을 스크롤 <div> 바깥으로 빼고 shrink-0 을 주어 하단에 고정하세요.`,
      ).toBeNull();
    });
  }
});
