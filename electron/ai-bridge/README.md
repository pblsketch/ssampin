# electron/ai-bridge (동봉 AI 브릿지 서버)

`index.mjs` 는 **ssampin-ai-bridge** 레포(`E:/github/ssampin-ai-bridge`)의 MCP 서버를
self-contained 로 번들한 산출물입니다. 쌤핀이 `ELECTRON_RUN_AS_NODE` 로 이 파일을 띄워
외부 AI(Claude/Codex/Antigravity)와 연결합니다(사용자 PC에 Node 미설치여도 동작).

> 이 디렉토리는 electron-builder `extraResources` 로 패키징되어 `resources/ai-bridge/` 에 들어갑니다.
> 메인 프로세스(`electron/ipc/aiBridge.ts`)가 패키징 시 `process.resourcesPath`, 개발 시
> `app.getAppPath()/electron/ai-bridge` 로 경로를 해석합니다.

## 재생성

브릿지 레포를 빌드한 뒤 esbuild 로 **완전 self-contained** 번들을 만듭니다(sdk/zod 포함 모든 의존 인라인):

```bash
# 1) 브릿지 빌드
cd E:/github/ssampin-ai-bridge && pnpm -r build

# 2) 번들 → 이 폴더의 index.mjs 로 출력 (sdk/zod 도 함께 인라인 — external 사용 금지)
cd E:/github/ssampin
node --input-type=module -e "import {build} from 'esbuild'; await build({entryPoints:['E:/github/ssampin-ai-bridge/packages/mcp/dist/index.js'],bundle:true,platform:'node',format:'esm',target:'node18',outfile:'electron/ai-bridge/index.mjs',legalComments:'none'});"
# (선두 셰뱅 1개만 유지. 결과 ~1MB.)
```

> Windows 의 `./node_modules/.bin/esbuild` 직접 실행은 bash 에서 "Exec format error" 가 날 수 있어
> 위처럼 esbuild JS API(node -e)로 호출한다.

> ⚠️ **v2.2.9 이전에는 `external:['@modelcontextprotocol/sdk','zod']`로 두 패키지를 번들에서 제외했었다.**
> 이 파일은 `resources/ai-bridge/`(app.asar **바깥**)에 배치되는데, external로 뺀 두 패키지는
> 런타임에 Node의 `node_modules` 상위 탐색으로 찾아야 한다. 그런데 app.asar 안의 진짜 `node_modules`는
> `resources/ai-bridge/`의 상위 경로 체인에 존재하지 않아(같은 폴더가 아니라 옆 폴더라서) 실제 설치된
> 앱에서는 반드시 `Cannot find module` 로 즉시 죽는다(로컬 개발 환경에서만 우연히 레포 `node_modules`가
> 상위에 있어 동작해 지금까지 발견되지 못했다). 그 결과 Claude Desktop·Codex·Antigravity 무엇으로
> 연결해도 "Could not attach to MCP server" 로 보였다 — 세 클라이언트가 모두 같은 `entry.command`/
> `entry.args`(electron/ipc/aiBridge.ts 의 `buildEntry()`)를 공유하기 때문이다. 반드시 external 없이
> 완전 번들해야 한다.

번들에 남는 동적 `require("ajv/...")` 경로는 현재 노출된 도구 흐름에서 실행되지 않음을
스모크로 확인했습니다(node_modules 없는 폴더에서 도구 로드 + PII 0). v2.2.9 재번들 후에도
동일하게 `node_modules` 없는 격리 폴더에서 `node index.mjs` 실행 → `[ssampin-mcp] connected (stdio)`
정상 출력을 재확인했습니다.
