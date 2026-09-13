import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsTranscriptSupport,
  TRANSCRIPT_SUPPORT_REQUEST,
} from '../supabase/functions/_shared/transcriptSupport.ts';

test('성적 인식 실패와 직전 사용자 질문을 잇는 재시도를 인식한다', () => {
  for (const message of [
    '학생 성적을 인식하지 못했어요',
    '전과목성적일람표를 해도 안되',
    '나이스 성적 엑셀 학생 0명',
    '성적 열람표 파일 업로드 실패',
  ])
    assert.equal(needsTranscriptSupport(message), true, message);
  const history = [{ role: 'user', content: '나이스 전과목 성적 일람표 인식이 안돼요' }];
  for (const message of ['그래도 안돼요', 'xlsx로 저장해도 안됩니다', '양식은 어디로 보내나요?'])
    assert.equal(needsTranscriptSupport(message, history), true, message);
});

test('일반 성적 질문과 다른 문제로 넘어간 대화에는 적용하지 않는다', () => {
  for (const message of [
    '성적 엑셀 가져오는 방법',
    '성적을 수정하고 싶어요',
    '시간표 엑셀 인식 안돼요',
    '앱 실행이 안돼요',
    '양식은 어디로 보내나요?',
  ])
    assert.equal(needsTranscriptSupport(message), false, message);
  assert.equal(
    needsTranscriptSupport('그래도 안돼요', [{ role: 'assistant', content: '성적 엑셀' }]),
    false,
  );
  assert.equal(
    needsTranscriptSupport('앱 실행이 안돼요', [
      { role: 'user', content: '성적 엑셀 인식 안돼요' },
    ]),
    false,
  );
});

test('메일 요청은 원본 보관과 실제 값 삭제 및 구조 유지를 명시한다', () => {
  for (const text of [
    'pblsketch@gmail.com',
    '복사본',
    '실제 성적을 모두 삭제',
    '원본은 보관',
    '숨긴 행·열·시트',
    '병합 셀은 유지',
    '보내지 않으셔도',
  ])
    assert.ok(TRANSCRIPT_SUPPORT_REQUEST.includes(text), text);
});
