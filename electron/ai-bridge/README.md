# electron/ai-bridge (동봉 AI 브릿지 서버)

`index.mjs` 는 **ssampin-ai-bridge** 레포(`E:/github/ssampin-ai-bridge`)의 MCP 서버를
self-contained 로 번들한 산출물입니다. 쌤핀이 `ELECTRON_RUN_AS_NODE` 로 이 파일을 띄워
외부 AI(Claude/Codex/Antigravity)와 연결합니다(사용자 PC에 Node 미설치여도 동작).

> 이 디렉토리는 electron-builder `extraResources` 로 패키징되어 `resources/ai-bridge/` 에 들어갑니다.
> 메인 프로세스(`electron/ipc/aiBridge.ts`)가 패키징 시 `process.resourcesPath`, 개발 시
> `app.getAppPath()/electron/ai-bridge` 로 경로를 해석합니다.

## 재생성

브릿지 레포를 빌드한 뒤 esbuild 로 self-contained 번들을 만듭니다(모든 의존 인라인):

```bash
# 1) 브릿지 빌드
cd E:/github/ssampin-ai-bridge && pnpm -r build

# 2) 번들 → 이 폴더의 index.mjs 로 출력 (sdk/zod 는 external — 런타임에 앱 node_modules 에서 해석)
#    ⚠️ --external 누락 시 sdk/zod 가 인라인되어 번들이 ~1MB 로 4배 커지고 동적 require 경로가 늘어난다.
cd E:/github/ssampin
node --input-type=module -e "import {build} from 'esbuild'; await build({entryPoints:['E:/github/ssampin-ai-bridge/packages/mcp/dist/index.js'],bundle:true,platform:'node',format:'esm',target:'node18',outfile:'electron/ai-bridge/index.mjs',legalComments:'none',external:['@modelcontextprotocol/sdk','zod']});"
# (선두 셰뱅 1개만 유지. 결과 ~265KB, 상단에 sdk/zod 의 external import 2~3줄이 남으면 정상.)
```

> Windows 의 `./node_modules/.bin/esbuild` 직접 실행은 bash 에서 "Exec format error" 가 날 수 있어
> 위처럼 esbuild JS API(node -e)로 호출한다.

번들에 남는 동적 `require("ajv/...")` 경로는 현재 노출된 도구 흐름에서 실행되지 않음을
스모크로 확인했습니다(node_modules 없는 폴더에서 도구 로드 + PII 0).
