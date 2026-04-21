import fs from 'node:fs/promises';
import path from 'node:path';

const files = [
  '학급자리배치도.pdf',
  '학교일정.pdf',
  '학급시간표.pdf',
  '교사시간표.pdf',
  '담임메모.pdf',
];

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

for (const f of files) {
  const p = path.join('test', f);
  const bytes = await fs.readFile(p);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  console.log('\n========', f, '========');
  console.log(`pages=${doc.numPages}, size=${(bytes.length/1024/1024).toFixed(2)}MB`);
  for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
    const page = await doc.getPage(i);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const txt = content.items.map((it) => it.str).join(' | ');
    console.log(`-- page ${i} (${width.toFixed(0)}x${height.toFixed(0)}) --`);
    console.log(txt.slice(0, 1200));
  }
}
