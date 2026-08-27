import { buildLlmsFullTxt, PLAIN_TEXT_HEADERS } from '@/content/llmsTxt';

// 도움말 본문 전체. 생성 AI 가 한 번에 읽고 인용할 수 있게 한 파일로 묶는다.
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsFullTxt(), { headers: PLAIN_TEXT_HEADERS });
}
