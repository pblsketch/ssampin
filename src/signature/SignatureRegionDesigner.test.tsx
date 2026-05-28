import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  PdfTemplate,
  SignatureParticipant,
  SignatureRegion,
} from '@domain/entities/SignatureRequest';
import { SignatureRegionDesigner } from './SignatureRegionDesigner';

/**
 * SSR 렌더 테스트만 — pdfjs-dist 동적 import + worker URL ?url 은 jsdom 에서 정확히 동작하지
 * 않으므로 클라이언트 인터랙션 (drag / Pattern 2) 은 별도 단위 테스트 또는 e2e 단계.
 *
 * 핵심 분기 (inferRowSpacing, replicateUniformRows, signatureRegionRules) 는 각각
 * inferRowSpacing.test.ts (15/15 PASS), signatureRegionRules.test.ts (20/20 PASS) 에서
 * 이미 단위 검증됨.
 */

const PDF_TEMPLATE: PdfTemplate = {
  storagePath: 'signature-templates/test/sample.pdf',
  pageCount: 3,
  fileSize: 12345,
  uploadedAt: '2026-05-28T00:00:00.000Z',
};

function makeParticipant(id: string, name: string, number?: number): SignatureParticipant {
  return {
    id,
    displayName: name,
    role: 'student',
    studentNumber: number,
    requiredSignatureKinds: ['student', 'parent'],
  };
}

describe('SignatureRegionDesigner SSR', () => {
  it('초기 상태에서 헤더, 페이지 indicator, Pattern 2 토글, 색상 안내를 렌더', () => {
    const html = renderToString(
      <SignatureRegionDesigner
        pdfTemplate={PDF_TEMPLATE}
        pdfUrl="https://example.com/sample.pdf"
        participants={[makeParticipant('p1', '홍길동', 1)]}
        onRegionsChange={() => {}}
      />,
    );
    expect(html).toContain('서명 영역 지정');
    expect(html).toContain('PDF 위에 사각형을 드래그');
    expect(html).toContain('data-testid="pattern2-toggle"');
    expect(html).toContain('Pattern 2 자동복제: 꺼짐');
    expect(html).toContain('data-testid="page-indicator"');
    expect(html).toContain('data-testid="designer-overlay"');
    expect(html).toContain('수동 사각형');
    expect(html).toContain('자동복제 사각형');
  });

  it('participants 수 / pageCount / regions 수 가 헤더에 표시된다', () => {
    const html = renderToString(
      <SignatureRegionDesigner
        pdfTemplate={PDF_TEMPLATE}
        pdfUrl="https://example.com/sample.pdf"
        participants={[makeParticipant('p1', '홍길동', 1), makeParticipant('p2', '김민서', 2)]}
        onRegionsChange={() => {}}
      />,
    );
    expect(html).toContain('3페이지');
    expect(html).toContain('참여자 2명');
    expect(html).toContain('영역 0개');
  });

  it('initialRegions 가 있으면 영역 수 + 부족 안내 (too-few-regions) 표시', () => {
    const region: SignatureRegion = {
      id: 'r1',
      pageIndex: 0,
      rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
      participantId: 'p1',
      signatureKind: 'student',
    };
    const html = renderToString(
      <SignatureRegionDesigner
        pdfTemplate={PDF_TEMPLATE}
        pdfUrl="https://example.com/sample.pdf"
        participants={[makeParticipant('p1', '홍길동', 1), makeParticipant('p2', '김민서', 2)]}
        initialRegions={[region]}
        onRegionsChange={() => {}}
      />,
    );
    expect(html).toContain('영역 1개');
    expect(html).toContain('data-testid="region-shortfall"');
    expect(html).toContain('명에게 자리가 부족');
    // 첫 페이지 region 이 SSR 에 렌더되었는지
    expect(html).toContain('data-testid="region-r1"');
  });

  it('SSR 마운트 시 onRegionsChange 콜백이 즉시 호출되지 않는다 (useEffect 는 client only)', () => {
    const onRegionsChange = vi.fn();
    renderToString(
      <SignatureRegionDesigner
        pdfTemplate={PDF_TEMPLATE}
        pdfUrl="https://example.com/sample.pdf"
        participants={[makeParticipant('p1', '홍길동', 1)]}
        initialRegions={[]}
        onRegionsChange={onRegionsChange}
      />,
    );
    expect(onRegionsChange).not.toHaveBeenCalled();
  });

  it('canvasWidth prop 으로 캔버스 컨테이너 크기를 조절할 수 있다', () => {
    const html = renderToString(
      <SignatureRegionDesigner
        pdfTemplate={PDF_TEMPLATE}
        pdfUrl="https://example.com/sample.pdf"
        participants={[makeParticipant('p1', '홍길동', 1)]}
        onRegionsChange={() => {}}
        canvasWidth={600}
      />,
    );
    expect(html).toContain('width:600px');
  });
});
