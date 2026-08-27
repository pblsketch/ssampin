/**
 * 설문 3형제(객관식·주관식·복합) 교사 주도 진행 — 학생 참여 링크 회귀 방지 (2026-08-27)
 *
 * 사용자 신고: "객관식 설문에서 링크 공유 버튼이 보이지 않음".
 * 근본 원인 두 가지였다.
 *   1. 공유 진입점 이름이 "학생 설문"이라 '링크'라는 말이 어디에도 없었다.
 *   2. 교사 주도 진행 화면에서는 터널(인터넷) URL이 있을 때만 초대 버튼을 그렸다.
 *      학교망에서 터널이 막히면 버튼이 통째로 사라지는데, 화면 가운데 안내문은
 *      여전히 그 버튼을 누르라고 가리켰다. 오류 문구조차 뜨지 않았다.
 *
 * 같은 유형의 신고가 실시간 담벼락에서도 있었다
 * (RealtimeWallTeacherActionBar.shareUx.test.tsx). 여기서도 못박아 둔다.
 *
 * 테스트 환경: vitest + react-dom/server (jsdom 불필요 — 위 담벼락 테스트와 같은 패턴).
 * 안내문에도 같은 낱말이 들어 있으므로, 문자열 포함이 아니라 **button 요소**를 집어서 본다.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TeacherControlPanel } from './TeacherControlPanel';

const baseProps = {
  phase: 'lobby' as const,
  currentQuestionIndex: 0,
  totalQuestions: 3,
  totalConnected: 0,
  totalAnswered: 0,
  roster: [],
  onActivate: () => {},
  onReveal: () => {},
  onAdvance: () => {},
  onPrev: () => {},
  onReopen: () => {},
  onEnd: () => {},
};

/** 학생 참여 링크 진입점 버튼의 사람이 읽는 이름 — 로비 안내문과 반드시 같아야 한다. */
const INVITE_BUTTON_LABEL = '학생 참여 링크';

/** SSR 출력에서 button 의 aria-label 만 모은다 (안내 문단은 걸리지 않는다). */
function buttonLabels(html: string): string[] {
  const labels: string[] = [];
  const re = /<button\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const label = /aria-label="([^"]*)"/.exec(match[1] ?? '')?.[1];
    if (label) labels.push(label);
  }
  return labels;
}

function hasInviteButton(html: string): boolean {
  return buttonLabels(html).some((l) => l.includes(INVITE_BUTTON_LABEL));
}

describe('TeacherControlPanel — 학생 참여 링크 진입점 회귀 방지', () => {
  it('터널 URL이 하나도 없어도 학생 참여 링크 버튼은 사라지지 않는다', () => {
    // 학교망이 터널을 막아 shortUrl·tunnelUrl 이 모두 없는 상태 (신고 재현 조건)
    const html = renderToString(
      <TeacherControlPanel
        {...baseProps}
        liveTunnelLoading={false}
        liveTunnelError="인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요."
      />,
    );

    expect(hasInviteButton(html)).toBe(true);
  });

  it('터널이 정상일 때도 같은 버튼이 그대로 보인다', () => {
    const html = renderToString(
      <TeacherControlPanel
        {...baseProps}
        liveDisplayUrl="https://ssampin.com/s/abcd"
        liveShortUrl="https://ssampin.com/s/abcd"
        liveFullUrl="https://example.trycloudflare.com"
        liveTunnelLoading={false}
      />,
    );

    expect(hasInviteButton(html)).toBe(true);
  });

  it('연결 준비 중에도 버튼이 보인다', () => {
    const html = renderToString(<TeacherControlPanel {...baseProps} liveTunnelLoading />);

    expect(hasInviteButton(html)).toBe(true);
  });

  it('로비 안내문은 실제로 존재하는 버튼 이름을 가리킨다', () => {
    // 예전에는 안내문이 "학생 초대"를 가리키는데 그 버튼이 렌더되지 않는 조합이 있었다.
    const html = renderToString(
      <TeacherControlPanel {...baseProps} liveTunnelError="인터넷 연결에 실패했습니다." />,
    );

    expect(html).toContain('아직 접속한 학생이 없습니다.');
    expect(html).toContain(`${INVITE_BUTTON_LABEL}] 버튼`);
    expect(hasInviteButton(html)).toBe(true);
  });

  it('진입점 이름에 "링크"라는 말이 들어 있다 (선생님이 찾는 낱말)', () => {
    expect(INVITE_BUTTON_LABEL).toContain('링크');
  });
});
