/**
 * 실제 마우스 드래그 주입 + 표본 채취 (자식 프로세스)
 *
 * 왜 별도 프로세스인가 — Windows의 창 끌기는 **중첩 메시지 루프**(modal drag loop) 안에서
 * 돌아간다. 그 동안 Electron 메인 프로세스의 자바스크립트는 멈춰 있어 스스로를 계측할 수 없다.
 * 그래서 창 밖에서 `GetWindowRect`로 들여다보는 관찰자를 따로 띄운다.
 *
 * 사용: ELECTRON_RUN_AS_NODE=1 electron drag-sampler.mjs <hwnd10> <grabX> <grabY> <endX>
 */
import koffi from 'koffi';

const [hwndStr, grabXStr, grabYStr, endXStr] = process.argv.slice(2);
const hwnd = BigInt(hwndStr);
const grabX = Number(grabXStr);
const grabY = Number(grabYStr);
const endX = Number(endXStr);

const user32 = koffi.load('user32.dll');
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void*, void*)');
const SetCursorPos = user32.func('int __stdcall SetCursorPos(int, int)');
const GetCursorPos = user32.func('int __stdcall GetCursorPos(void*)');
const mouse_event = user32.func('void __stdcall mouse_event(uint32, int, int, uint32, void*)');

const LEFTDOWN = 0x0002;
const LEFTUP = 0x0004;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const rectBuf = Buffer.alloc(16);
function rect() {
  if (GetWindowRect(hwnd, rectBuf) === 0) return null;
  const left = rectBuf.readInt32LE(0);
  const top = rectBuf.readInt32LE(4);
  const right = rectBuf.readInt32LE(8);
  const bottom = rectBuf.readInt32LE(12);
  return { left, top, width: right - left, height: bottom - top };
}
const ptBuf = Buffer.alloc(8);
function cursor() {
  GetCursorPos(ptBuf);
  return { x: ptBuf.readInt32LE(0), y: ptBuf.readInt32LE(4) };
}

const origin = cursor();
const samples = [];

SetCursorPos(grabX, grabY);
sleep(250);
const before = rect();
mouse_event(LEFTDOWN, 0, 0, 0, null);
sleep(200);

const STEPS = 40;
for (let i = 1; i <= STEPS; i += 1) {
  const x = Math.round(grabX + ((endX - grabX) * i) / STEPS);
  SetCursorPos(x, grabY);
  sleep(55);
  const r = rect();
  const c = cursor();
  if (r)
    samples.push({
      i,
      cx: c.x,
      left: r.left,
      top: r.top,
      w: r.width,
      h: r.height,
      off: c.x - r.left,
    });
}

mouse_event(LEFTUP, 0, 0, 0, null);
sleep(350);
const after = rect();

// 커서 원위치 복구 — 사용자 마우스를 빼앗은 채로 끝내지 않는다.
SetCursorPos(origin.x, origin.y);

console.log(
  JSON.stringify({ before, after, grab: { x: grabX, y: grabY }, endX, samples }, null, 0),
);
