import { useMemo, type ReactNode } from 'react';

/**
 * 편제표 hwp → kordoc 변환 마크다운(HTML 표)을 React 표로 안전하게 재구성한다.
 * DOMParser 로 파싱 후 table/tr/td/th/br/텍스트만 화이트리스트 렌더 — dangerouslySetInnerHTML 미사용
 * (regression #7), rowspan/colspan/중첩표(선택과목 택N 박스) 보존.
 */

const CELL = 'border border-sp-border px-1.5 py-1 text-center align-middle text-sp-text';

function renderNode(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === 3) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text || null;
  }
  if (node.nodeType !== 1) return null;
  const el = node as HTMLElement;
  const kids = Array.from(el.childNodes).map((c, i) => renderNode(c, `${key}.${i}`));
  switch (el.tagName) {
    case 'TABLE':
      return (
        <table key={key} className="w-max min-w-full border-collapse text-xs tabular-nums">
          <tbody>{kids}</tbody>
        </table>
      );
    case 'THEAD':
    case 'TBODY':
      // kordoc 결과는 보통 tr 직접 — 혹시 있으면 행만 펼친다.
      return kids;
    case 'TR':
      return <tr key={key}>{kids}</tr>;
    case 'TD':
    case 'TH': {
      const rs = Number(el.getAttribute('rowspan')) || undefined;
      const cs = Number(el.getAttribute('colspan')) || undefined;
      if (el.tagName === 'TH') {
        return (
          <th
            key={key}
            rowSpan={rs}
            colSpan={cs}
            className={`${CELL} bg-sp-surface font-sp-semibold`}
          >
            {kids}
          </th>
        );
      }
      return (
        <td key={key} rowSpan={rs} colSpan={cs} className={CELL}>
          {kids}
        </td>
      );
    }
    case 'BR':
      return <br key={key} />;
    default:
      // 그 외 태그(script 등 비표 요소)는 자식 텍스트만 — 위험 요소 차단
      return <span key={key}>{kids}</span>;
  }
}

export function CurriculumMatrixView({ markdown }: { markdown: string }) {
  const content = useMemo<ReactNode>(() => {
    if (typeof DOMParser === 'undefined') return null;
    const clean = markdown.replace(/^\s*\[포맷:[^\]]*\]\s*/i, '');
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    return Array.from(doc.body.childNodes).map((n, i) => {
      if (n.nodeType === 3) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        // 표 사이의 "1. 2024학년도 입학생" 같은 텍스트는 소제목으로
        return t ? (
          <p key={`t${i}`} className="text-sm font-sp-semibold text-sp-text mt-3">
            {t}
          </p>
        ) : null;
      }
      return renderNode(n, `n${i}`);
    });
  }, [markdown]);

  if (content === null) {
    return <p className="text-xs text-sp-muted">표를 표시할 수 없어요.</p>;
  }
  return <div className="space-y-2 overflow-x-auto pb-2">{content}</div>;
}
