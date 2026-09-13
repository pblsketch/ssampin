export const SUPPORT_EMAIL = 'pblsketch@gmail.com';

export function needsTranscriptSupport(
  message: string,
  history: { role: string; content: string }[] = [],
): boolean {
  const compact = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  const isTranscript = (value: string) =>
    /성적/.test(value) && /일람표|열람표|엑셀|파일|나이스|neis|xlsx|xls|학생성적/.test(value);
  const failed = (value: string) =>
    /안돼|안되|안됩|안됨|못|실패|오류|0명|안열|안읽|안불러/.test(value);
  const current = compact(message);
  if (isTranscript(current) && failed(current)) return true;
  const previous = history.filter((item) => item.role === 'user').at(-1);
  if (!previous || !isTranscript(compact(previous.content))) return false;
  return (
    (/^(그래도|여전히|아직|똑같|계속|xlsx로|다시저장)/.test(current) && failed(current)) ||
    /^(양식|파일)(은|을)?어디로보내/.test(current)
  );
}

export const TRANSCRIPT_SUPPORT_ANSWER_PREFIX =
  '성적 일람표여도 머리글이나 학생별 행 배치가 달라 인식하지 못할 수 있어요. 앱에서 가져올 원본 성적표는 그대로 보관해 주세요. 아래 빈 양식은 오류 확인을 위해 메일로 받을 별도 복사본입니다. 빈 양식을 앱에 다시 올리는 것은 해결 방법이 아닙니다.\n\n';

export const TRANSCRIPT_SUPPORT_REQUEST = `양식 차이를 확인할 수 있도록, 나이스에서 내려받은 엑셀 성적 일람표(열람표)의 복사본에서 개인정보와 실제 성적을 모두 삭제하고 양식만 ${SUPPORT_EMAIL}로 보내 주실 수 있을까요?

원본은 보관해 주세요. 복사본의 모든 시트에서 학생 이름·번호·학번·생년월일·연락처, 학교·학급·교사 식별정보와 실제 점수·성취도·석차·등급을 삭제해 주세요. 숨긴 행·열·시트, 메모·댓글, 파일명과 문서 속성에도 개인정보가 없는지 확인해 주세요. 흰색 글씨로 가리거나 행·열을 숨기는 것만으로는 삭제되지 않습니다.

과목명과 머리글, 빈 학생 행, 행·열 배치와 병합 셀은 유지해 주세요. 파일을 닫았다 다시 열어 실제 값이 남지 않았는지 확인한 뒤 보내 주세요. 오류 문구와 쌤핀 버전을 메일 본문에 적어 주시면 도움이 됩니다. 원본 성적표나 개인정보가 남은 파일은 보내지 마시고, 이 대화에도 붙여 넣지 말아 주세요. 양식만 만들기 어렵다면 파일을 보내지 않으셔도 됩니다.`;

export const TRANSCRIPT_SUPPORT_DOCUMENT = {
  content: `Q: 학생 성적을 인식하지 못했어요 / 전과목 성적 일람표를 해도 안 돼요 / 전과목성적일람표 안됨 / 나이스 성적 열람표 엑셀 인식 실패 / NEIS 성적 파일을 올려도 학생이 0명이에요 / xlsx로 저장해도 안돼요 / 성적 엑셀 양식이 달라요 / 양식은 어디로 보내나요?
A: 실제 NEIS 성적 일람표여도 머리글이나 학생별 행 배치에 따라 인식하지 못할 수 있어요. 파일이 잘못됐다고 단정하지 않겠습니다. 파일 자체가 열리지 않는 .xls는 엑셀에서 .xlsx로 다시 저장해 볼 수 있지만, 이미 시도했거나 일람표인데도 실패한다면 같은 안내만 반복하지 않고 양식을 확인하겠습니다.

앱에서 성적을 가져올 때는 학생과 실제 성적이 들어 있는 원본을 사용합니다. 개인정보 때문에 앱의 파일 인식이 제한되는 것은 아닙니다. 학생이 0명이라는 오류의 원인을 개인정보 탓으로 설명하지 마세요. 값을 지운 빈 양식을 앱에 다시 올리라고 안내하지 마세요. 빈 양식은 개발자가 파일 구조를 확인하기 위해 메일로 받는 별도 복사본이며, 성적 분석에 사용할 수 없습니다.

아래 요청을 그대로 안내하고, 원본 전송이나 스크린샷 전송 같은 대안을 추가하지 마세요. 개인정보 삭제가 어려우면 전송하지 않도록 안내합니다. 이미 .xlsx 저장을 시도했다면 같은 해결책을 다시 질문하지 마세요.

${TRANSCRIPT_SUPPORT_REQUEST}`,
  metadata: {
    source: 'support-neis-transcript-import',
    category: 'troubleshoot',
    title: 'NEIS 성적 일람표 인식 실패 — 개인정보 삭제한 빈 양식 메일 요청',
  },
};
