// 在程式和樣式的網址後面加上內容代碼（?v=…），瀏覽器就能放心快取，內容一改就抓新的。
// 改過 app.js、account.js、styles.css、tools-core.js、font-chars.js 之後執行：node scripts/stamp.mjs
// 只檢查：node scripts/stamp.mjs --check
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const PUB = new URL('../public/', import.meta.url), check = process.argv.includes('--check');
const load = (f) => fs.readFileSync(new URL(f, PUB), 'utf8');
const ver = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);
const stamp = (text, file, v) => text.replace(new RegExp(file.replaceAll('.', '\\.') + '(\\?v=[0-9a-f]+)?(?=["\'])', 'g'), file + '?v=' + v);

let app = load('app.js'), html = load('index.html');
const before = app + html;
for (const f of ['tools-core.js', 'font-chars.js', 'account.js']) { const v = ver(load(f)); app = stamp(app, f, v); html = stamp(html, f, v); }
html = stamp(html, 'app.js', ver(app));
html = stamp(html, 'styles.css', ver(load('styles.css')));
const same = before === app + html;
if (check) { console.log(same ? 'PASS 網址代碼正確' : 'FAIL 請執行 node scripts/stamp.mjs'); process.exit(same ? 0 : 1); }
fs.writeFileSync(new URL('app.js', PUB), app);
fs.writeFileSync(new URL('index.html', PUB), html);
console.log(same ? '沒有變動' : '已更新網址代碼');
