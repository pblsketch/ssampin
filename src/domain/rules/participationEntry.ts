/**
 * participationEntry — 학생이 **어떤 주소로 들어오는가**를 한 곳에서 정한다.
 *
 * 길은 두 가지다.
 *   ① 인터넷 주소 — 터널 + 짧은 코드(`ssampin.app/s/ABCD`). 어느 망에서든 들어온다.
 *   ② 같은 Wi-Fi 주소 — `http://125.177.195.51:63108`. **교사 컴퓨터와 같은 Wi-Fi에 붙은 기기만** 된다.
 *
 * ②는 한 반 30명이 모두 학교 Wi-Fi에 붙어 있을 때만 쓸모가 있어서, 실제 수업에서는
 * 기대하기 어렵다(오너 판단, 2026-09-22). 그래서 **①을 정식 경로로 두고 ②는 ①이 끝내
 * 실패했을 때만 경고와 함께 내놓는다.**
 *
 * 옛 동작은 반대였다 — 서버가 뜨자마자 ②를 먼저 띄우고 ①은 그 뒤에 조용히 덮어썼다.
 * 터널은 최대 30초(첫 사용이면 cloudflared 내려받기까지) 걸리므로, 그 사이 선생님이
 * **되지도 않을 주소를 불러 줄 수 있었다.**
 *
 * ②를 아예 없애지는 않는다 — 2026-08-27 에 "학교망이 인터넷을 막아 초대 단추가 통째로
 * 사라진다"는 실제 신고가 있었다. 그때도 수업은 열려야 한다.
 */

export type EntryAccessKind =
  /** 인터넷 주소를 만드는 중 — 아직 학생에게 안내하면 안 된다 */
  | 'preparing'
  /** 인터넷 주소(짧은 주소·코드). 어느 망에서든 들어온다 */
  | 'internet'
  /** 같은 Wi-Fi 주소. 보조 경로다 */
  | 'local';

export interface EntryAccess {
  readonly kind: EntryAccessKind;
  /** 학생에게 안내할 주소. `preparing` 이면 빈 문자열 */
  readonly url: string;
  /** 짧은 입장 코드. 인터넷 주소일 때만 있을 수 있다 */
  readonly code: string | null;
}

/** 지금 주소를 학생에게 안내해도 되는가 (준비 중에는 안 된다) */
export function canInviteStudents(access: EntryAccess): boolean {
  return access.kind !== 'preparing' && access.url.length > 0;
}

/** 화면 제목 */
export function entryAccessLabel(kind: EntryAccessKind): string {
  switch (kind) {
    case 'preparing':
      return '인터넷 참여 주소를 준비하고 있어요';
    case 'internet':
      return '학생 입장 대기 중';
    case 'local':
      return '같은 Wi-Fi 주소로 입장 대기 중';
  }
}

/**
 * 이 주소의 한계를 말해 주는 경고. 없으면 null.
 * 선생님이 주소를 불러 주기 **전에** 읽어야 하는 문장이다.
 */
export function entryAccessWarning(kind: EntryAccessKind): string | null {
  switch (kind) {
    case 'preparing':
      return null;
    case 'internet':
      return null;
    case 'local':
      return '인터넷 참여 주소를 만들지 못했어요. 이 주소는 선생님 컴퓨터와 같은 Wi-Fi에 연결한 기기에서만 열려요. 휴대전화 데이터를 쓰는 학생은 들어올 수 없어요.';
  }
}

/**
 * 교실 화면(TV·빔프로젝터)에 쓸 **짧은** 한 줄. 없으면 null.
 * 선생님용 경고문은 뒷자리에서 읽기에 너무 길다.
 */
export function entryAccessClassroomNote(kind: EntryAccessKind): string | null {
  switch (kind) {
    case 'preparing':
      return '주소가 만들어지면 여기에 QR이 보여요';
    case 'internet':
      return null;
    case 'local':
      return '선생님과 같은 Wi-Fi에 연결해야 들어올 수 있어요';
  }
}

/** 준비 중일 때 선생님에게 보여 줄 안내 */
export const ENTRY_PREPARING_HINT =
  '학교 밖에서도 들어올 수 있는 주소를 만드는 중이에요. 처음 한 번은 조금 오래 걸릴 수 있어요.';
