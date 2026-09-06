import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS = resolve(SKILL_DIR, 'assets');

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p));
}

/** ffmpeg / ffprobe 경로 — PATH → 알려진 위치 → FFMPEG 환경변수 순. */
function findBin(name, envKey, candidates) {
  if (process.env[envKey] && existsSync(process.env[envKey])) return process.env[envKey];
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    encoding: 'utf8',
  });
  if (which.status === 0) {
    const hit = which.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (hit) return hit;
  }
  const found = firstExisting(candidates);
  if (found) return found;
  throw new Error(`${name} 을(를) 찾지 못했습니다. ${envKey} 환경변수로 경로를 지정하세요.`);
}

const HOME = process.env.USERPROFILE || process.env.HOME || '';

export const FFMPEG = () =>
  findBin('ffmpeg', 'FFMPEG', [`${HOME}/ffmpeg/bin/ffmpeg.exe`, 'C:/ffmpeg/bin/ffmpeg.exe']);
export const FFPROBE = () =>
  findBin('ffprobe', 'FFPROBE', [`${HOME}/ffmpeg/bin/ffprobe.exe`, 'C:/ffmpeg/bin/ffprobe.exe']);
export const CHROME = () =>
  findBin('chrome', 'CHROME', [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ]);

export function run(bin, args, { quiet = true } = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !quiet) {
    throw new Error(`${bin} 실패 (${r.status})\n${r.stderr || ''}`);
  }
  return r;
}

export function ff(args) {
  const r = run(FFMPEG(), ['-hide_banner', '-loglevel', 'error', ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg 실패\n${(r.stderr || '').trim()}`);
  return r;
}

/** 이미지·영상의 [폭, 높이]. */
export function dims(file) {
  const r = run(FFPROBE(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ]);
  const [w, h] = (r.stdout || '').trim().split(',').map(Number);
  if (!w || !h) throw new Error(`크기를 못 읽었습니다: ${file}`);
  return [w, h];
}

export function duration(file) {
  const r = run(FFPROBE(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  return Number((r.stdout || '').trim());
}

export const ensure = (d) => {
  mkdirSync(d, { recursive: true });
  return d;
};

/** Chrome 헤드리스 스크린샷. 플래그 두 개는 빼면 안 된다 — references/pitfalls.md 참고. */
export function shoot(htmlPath, query, outPng, w, h, { transparent = false } = {}) {
  const url = pathToFileURL(htmlPath).href + (query ? `?${query}` : '');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files', // file:// 폰트 로드 (없으면 한글 깨짐)
    '--run-all-compositor-stages-before-draw', // 그림자 아티팩트 방지
    '--force-device-scale-factor=1',
    '--virtual-time-budget=6000',
    `--window-size=${w},${h}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${outPng}`,
    url,
  ];
  run(CHROME(), args);
  if (!existsSync(outPng)) throw new Error(`스크린샷 실패: ${outPng}`);
}

/** 가로·세로를 짝수로 — yuv420p 인코딩 조건. */
export const even = (n) => (n % 2 ? n - 1 : n);
