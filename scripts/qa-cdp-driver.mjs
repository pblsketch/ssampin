/* QA 도구 (2026-09-08 신설) — Electron 렌더러를 CDP 로 조종한다. 외부 패키지 없음(Node 22+ WebSocket). 사용법은 docs/03-analysis/pre-release-device-qa-20260908.md 끝 절.
 *
 *   node scripts/qa-cdp-driver.mjs targets
 *   node scripts/qa-cdp-driver.mjs eval "<js expression, may return promise>" [--target=<substr>]
 *   node scripts/qa-cdp-driver.mjs shot <out.png> [--target=<substr>]
 *   node scripts/qa-cdp-driver.mjs click <x> <y> | type "<text>" | key <Enter|Escape|Tab|Space|ArrowDown...> [--target=]
 *   node scripts/qa-cdp-driver.mjs run <file.mjs>   (file exports default async (cdp) => {...})
 */
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT ?? '9333';
const args = process.argv.slice(2);
const targetOpt = (args.find((a) => a.startsWith('--target=')) ?? '').slice('--target='.length);
const positional = args.filter((a) => !a.startsWith('--'));

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  return res.json();
}

export async function connect(substr = targetOpt) {
  const targets = await listTargets();
  const pages = targets.filter((t) => t.type === 'page');
  const pick =
    (substr ? pages.find((t) => (t.url + ' ' + t.title).includes(substr)) : null) ??
    pages.find(
      (t) =>
        t.url.includes('5173') &&
        !t.url.includes('?mode=') &&
        !t.url.includes('sidepin') &&
        !t.url.includes('widget'),
    ) ??
    pages[0];
  if (!pick) throw new Error('no page target');
  const ws = new WebSocket(pick.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const myId = ++id;
      pending.set(myId, { res, rej });
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const cdp = {
    target: pick,
    send,
    events,
    close: () => ws.close(),
    async eval(expr) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails)
        throw new Error(
          r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails),
        );
      return r.result.value;
    },
    async shot(out) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      return out;
    },
    async click(x, y, opts = {}) {
      const base = { x, y, button: 'left', clickCount: 1, ...opts };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    },
    async drag(x1, y1, x2, y2, steps = 8) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x1,
        y: y1,
        button: 'left',
        clickCount: 1,
      });
      for (let i = 1; i <= steps; i++) {
        const x = x1 + ((x2 - x1) * i) / steps;
        const y = y1 + ((y2 - y1) * i) / steps;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
        await new Promise((r) => setTimeout(r, 40));
      }
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: x2,
        y: y2,
        button: 'left',
        clickCount: 1,
      });
    },
    async type(text) {
      await send('Input.insertText', { text });
    },
    async key(key, opts = {}) {
      const map = {
        Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
        Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
        Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
        Space: { code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
        ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
        ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38 },
        ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
        ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39 },
        Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8 },
      };
      const k = map[key] ?? { code: key, windowsVirtualKeyCode: key.charCodeAt(0), text: key };
      const params = { key, ...k, ...opts };
      await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...params });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    },
    /** 화면 텍스트로 요소 중심 좌표 찾기 (renderer 안에서 실행) */
    async find(text, { role, index = 0, exact = false } = {}) {
      return this.eval(`(() => {
        const want = ${JSON.stringify(text)}; const role = ${JSON.stringify(role ?? null)}; const exact = ${exact};
        const sel = role === 'button' ? 'button,[role=button]' : role === 'input' ? 'input,textarea,[contenteditable=true]' : '*';
        const els = [...document.querySelectorAll(sel)].filter(e => {
          const t = ((e.innerText || '').trim() || (e.value || '') || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim();
          const hit = exact ? t === want : t.includes(want);
          if (!hit) return false;
          const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
        });
        // 가장 안쪽(작은) 요소 우선
        els.sort((a,b) => a.getBoundingClientRect().width*a.getBoundingClientRect().height - b.getBoundingClientRect().width*b.getBoundingClientRect().height);
        const e = els[${index}]; if (!e) return null;
        e.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height, tag: e.tagName, text: (e.innerText||e.value||'').slice(0,80), count: els.length };
      })()`);
    },
    async clickText(text, opts = {}) {
      const f = await this.find(text, opts);
      if (!f) throw new Error(`not found: ${text}`);
      await this.click(f.x, f.y);
      return f;
    },
    async wait(ms) {
      await new Promise((r) => setTimeout(r, ms));
    },
    async waitFor(text, { timeout = 10000, ...opts } = {}) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const f = await this.find(text, opts);
        if (f) return f;
        await this.wait(250);
      }
      throw new Error(`timeout waiting: ${text}`);
    },
  };
  return cdp;
}

if (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  process.argv[1].endsWith('qa-cdp-driver.mjs')
) {
  const [cmd, ...rest] = positional;
  if (cmd === 'targets') {
    const t = await listTargets();
    for (const x of t) console.log(x.type, '|', x.title, '|', x.url);
  } else if (cmd === 'run') {
    const mod = await import(`file:///${path.resolve(rest[0]).replace(/\\/g, '/')}`);
    const cdp = await connect();
    try {
      await mod.default(cdp);
    } finally {
      cdp.close();
    }
  } else {
    const cdp = await connect();
    try {
      if (cmd === 'eval') console.log(JSON.stringify(await cdp.eval(rest[0]), null, 1));
      else if (cmd === 'shot') console.log(await cdp.shot(rest[0]));
      else if (cmd === 'click') await cdp.click(Number(rest[0]), Number(rest[1]));
      else if (cmd === 'type') await cdp.type(rest[0]);
      else if (cmd === 'key') await cdp.key(rest[0]);
      else if (cmd === 'find')
        console.log(JSON.stringify(await cdp.find(rest[0], { role: rest[1] })));
      else console.log('unknown cmd');
    } finally {
      cdp.close();
    }
  }
}
