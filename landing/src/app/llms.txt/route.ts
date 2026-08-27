import { buildLlmsTxt, PLAIN_TEXT_HEADERS } from '@/content/llmsTxt';

// 빌드 시점에 한 번 만들어 정적으로 서빙한다.
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(), { headers: PLAIN_TEXT_HEADERS });
}
