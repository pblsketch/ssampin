/**
 * liveAccessUrl — 라이브 도구의 "같은 Wi-Fi 직접 접속" 주소를 한 곳에서 만든다.
 *
 * 인터넷(터널) 연결이 실패해도 학생이 같은 Wi-Fi에 있으면 이 주소로 참여할 수 있다.
 * 여러 도구가 각자 문자열을 조립하다 보니 실패 화면에서 이 주소를 아예 빼먹는 곳이 있었다.
 */

export interface LiveServerInfo {
  port: number;
  localIPs: string[];
}

/** 서버 정보가 없거나 IP를 못 얻었으면 undefined — 호출부에서 안내를 생략하도록. */
export function buildLocalAccessUrl(info: LiveServerInfo | null | undefined): string | undefined {
  if (!info) return undefined;
  const ip = info.localIPs[0];
  if (!ip) return undefined;
  return `http://${ip}:${info.port}`;
}
