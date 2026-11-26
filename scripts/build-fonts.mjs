// 只帶網站用到的字：從 Google Fonts 取得精簡字型，放進 public/fonts/。
// 網站文字有大改時執行一次：node scripts/build-fonts.mjs，再執行 node scripts/stamp.mjs。
// 沒執行也沒關係：新出現的字，網頁會自動向 Google Fonts 補齊（app.js 的 loadMissingFonts）。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTools } from '../public/tools-core.js';

const PUB = new URL('../public/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, PUB), 'utf8');
const ua = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const uniq = (s) => [...new Set([...s])].filter((c) => c > ' ').sort().join('');
const ascii = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('');

const html = read('index.html'), tools = parseTools(read('tools.txt'));
const games = fs.existsSync(new URL('games.txt', PUB)) ? parseTools(read('games.txt')) : [];
const body = html.slice(html.indexOf('<!--PAGE-->')).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
const code = (read('app.js') + read('account.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const names = [...tools, ...games].map((t) => t.name).join('');
let notes = '';
try { notes = JSON.stringify(await (await fetch('https://newformula.pages.dev/api/live')).json()); } catch { console.log('讀不到更新內容，略過'); }
const all = uniq(ascii + body + code.replace(/[\x00-\x7f]/g, '') + [...tools, ...games].map((t) => Object.values(t).join('')).join('') + read('releases.json') + notes + '　，。、；：「」（）％');
const heavy = uniq(ascii + '新配方的工具箱新配方的遊戲區工具箱遊戲區' + (html.match(/<h2 id="intro-title">([^<]+)/)?.[1] || '') + (html.match(/<h2 id="intro-games-title">([^<]+)/)?.[1] || '') + [...html.matchAll(/<h2[^>]*>([^<]+)/g)].map((m) => m[1]).join('') + '已領救濟金' + names + '％');

const jobs = [
  ['sans-400', 'Noto+Sans+TC:wght@400', all, 'NF Sans', 400], ['sans-500', 'Noto+Sans+TC:wght@500', all, 'NF Sans', 500], ['sans-900', 'Noto+Sans+TC:wght@900', heavy, 'NF Sans', 900],
  ['mono', 'IBM+Plex+Mono:wght@500', ascii, 'NF Mono', 500], ['pixel', 'Silkscreen', ascii, 'NF Pixel', 400],
];
const dir = new URL('fonts/', PUB);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);
const faces = [], preload = [];
for (const [name, family, text, css, weight] of jobs) {
  const sheet = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`, { headers: ua })).text();
  const urls = [...sheet.matchAll(/url\(([^)]+)\)\s*format\('woff2'\)/g)].map((m) => m[1]);
  if (urls.length !== 1) throw new Error(name + ' 取得 ' + urls.length + ' 個檔案');
  const data = Buffer.from(await (await fetch(urls[0], { headers: ua })).arrayBuffer());
  if (data.subarray(0, 4).toString() !== 'wOF2') throw new Error(name + ' 不是 woff2');
  const file = `fonts/${name}.${createHash('sha256').update(data).digest('hex').slice(0, 8)}.woff2`;
  fs.writeFileSync(new URL(file, PUB), data);
  faces.push(`@font-face { font-family: '${css}'; font-weight: ${weight}; font-display: swap; src: url(${file}) format('woff2'); }`);
  if (name.startsWith('sans')) preload.push(`<link rel="preload" as="font" type="font/woff2" crossorigin href="${file}">`);
  console.log(file, [...text].length + ' 字', Math.round(data.length / 1024) + ' KB');
}
const put = (f, a, z, text) => {
  const t = read(f), i = t.indexOf(a), j = t.indexOf(z);
  if (i < 0 || j < i) throw new Error(f + ' 找不到 ' + a);
  fs.writeFileSync(new URL(f, PUB), t.slice(0, i + a.length) + '\n' + text + '\n' + t.slice(j));
};
put('styles.css', '/*FONTS*/', '/*/FONTS*/', faces.join('\n'));
put('index.html', '<!--FONTS-->', '<!--/FONTS-->', preload.join('\n'));
fs.writeFileSync(new URL('font-chars.js', PUB), `// 由 scripts/build-fonts.mjs 產生：字型檔裡有的字\nexport const ALL = ${JSON.stringify(all.replace(/[\x00-\x7f]/g, ''))};\nexport const HEAVY = ${JSON.stringify(heavy.replace(/[\x00-\x7f]/g, ''))};\n`);
