/**
 * 바탕화면 모드용 로컬 HTTP 서버
 *
 * Lively Wallpaper가 접속할 수 있도록 위젯 화면을 로컬 웹서버로 서빙한다.
 * liveVote.ts의 패턴을 따르되, 정적 파일 서빙 방식.
 */
import { ipcMain } from 'electron';
import http from 'http';
import fs from 'fs';
import path from 'path';

let wallpaperServer: http.Server | null = null;
let wallpaperPort: number | null = null;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function registerWallpaperServerHandlers(): void {
  /**
   * wallpaper:start — 위젯 로컬 서버 시작
   * @returns { port, url }
   */
  ipcMain.handle('wallpaper:start', async (): Promise<{ port: number; url: string }> => {
    // 이미 실행 중이면 기존 포트 반환
    if (wallpaperServer && wallpaperPort) {
      return { port: wallpaperPort, url: `http://localhost:${wallpaperPort}` };
    }

    return new Promise((resolve, reject) => {
      const distPath = path.join(__dirname, '../dist');

      const server = http.createServer((req, res) => {
        let requestPath = req.url?.split('?')[0] ?? '/';

        // 루트 요청 → index.html + widget 쿼리
        if (requestPath === '/' || requestPath === '/index.html') {
          const indexPath = path.join(distPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, 'utf-8');
            // 위젯 모드 자동 주입: URL에 ?mode=widget이 없어도 위젯으로 동작하게
            html = html.replace(
              '</head>',
              `<script>
                // Lively 바탕화면 모드: 자동으로 위젯 모드 활성화
                if (!window.location.search.includes('mode=widget')) {
                  var url = new URL(window.location.href);
                  url.searchParams.set('mode', 'widget');
                  url.searchParams.set('wallpaper', 'true');
                  window.history.replaceState({}, '', url.toString());
                }
              </script></head>`,
            );
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
        }

        // URL 디코딩 + path traversal 방어
        try {
          requestPath = decodeURIComponent(requestPath);
        } catch {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }
        const normalizedPath = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');

        // 정적 파일 서빙
        const filePath = path.join(distPath, normalizedPath);
        // distPath 바깥으로의 접근 차단
        if (!filePath.startsWith(distPath)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(filePath).pipe(res);
        } else {
          // SPA 폴백: 존재하지 않는 경로 → index.html
          const indexPath = path.join(distPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        }
      });

      // 고정 포트 사용 (Lively에서 URL을 한 번만 등록하면 영구 유지)
      const WALLPAPER_PORT = 19580;

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`포트 ${WALLPAPER_PORT}이(가) 이미 사용 중입니다. 다른 프로그램이 해당 포트를 점유하고 있는지 확인하세요.`));
        } else {
          reject(new Error(`바탕화면 서버 시작 실패: ${err.message}`));
        }
      });

      server.listen(WALLPAPER_PORT, 'localhost', () => {
        wallpaperServer = server;
        wallpaperPort = WALLPAPER_PORT;
        const url = `http://localhost:${WALLPAPER_PORT}`;
        console.log(`[wallpaper] 바탕화면 서버 시작: ${url}`);
        resolve({ port: WALLPAPER_PORT, url });
      });
    });
  });

  /**
   * wallpaper:stop — 위젯 로컬 서버 종료
   */
  ipcMain.handle('wallpaper:stop', (): void => {
    if (wallpaperServer) {
      wallpaperServer.close();
      wallpaperServer = null;
      wallpaperPort = null;
      console.log('[wallpaper] 바탕화면 서버 종료');
    }
  });

  /**
   * wallpaper:status — 서버 상태 확인
   */
  ipcMain.handle('wallpaper:status', (): { running: boolean; port: number | null; url: string | null } => {
    return {
      running: wallpaperServer !== null,
      port: wallpaperPort,
      url: wallpaperPort ? `http://localhost:${wallpaperPort}` : null,
    };
  });
}

/**
 * 앱 종료 시 서버 정리 (main.ts의 before-quit에서 호출 가능)
 */
export function stopWallpaperServer(): void {
  if (wallpaperServer) {
    wallpaperServer.close();
    wallpaperServer = null;
    wallpaperPort = null;
  }
}
