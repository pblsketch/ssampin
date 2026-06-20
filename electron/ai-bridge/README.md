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

# 2) self-contained 번들 → 이 폴더의 index.mjs 로 출력
cd E:/github/ssampin
./node_modules/.bin/esbuild \
  E:/github/ssampin-ai-bridge/packages/mcp/dist/index.js \
  --bundle --platform=node --format=esm --target=node18 \
  --outfile=electron/ai-bridge/index.mjs --legal-comments=none
# (선두 셰뱅 1개만 유지)
```

번들에 남는 동적 `require("ajv/...")` 경로는 현재 노출된 도구 흐름에서 실행되지 않음을
스모크로 확인했습니다(node_modules 없는 폴더에서 도구 로드 + PII 0).
