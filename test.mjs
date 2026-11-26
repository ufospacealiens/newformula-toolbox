// 執行：node test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTools, readManifest, readReleases, mergeTool, compareVersions, formatSize } from './public/tools-core.js';
import { onRequestGet } from './functions/api/live.js';
import { onRequest as privateApi } from './functions/api/private/[[path]].js';

const text = fs.readFileSync(new URL('./public/tools.txt', import.meta.url), 'utf8');
const tools = parseTools(text);
assert.deepEqual(tools.map((t) => t.id), ['game-time', 'stock']);
// 私人軟體不能出現在公開的檔案裡（軟體改成公開時，把它的名字從這裡拿掉）
for (const f of ['tools.txt', 'index.html', 'releases.json']) assert.doesNotMatch(fs.readFileSync(new URL('./public/' + f, import.meta.url), 'utf8'), /麥克風|GoFile|MicVolume/i, f);
assert.equal(tools[0].source.startsWith('https://'), true);
assert.equal(new Set(tools.map((t) => t.colorValue)).size, tools.length);
for (const t of tools) assert.ok(fs.existsSync(new URL('./public/icons/' + t.icon, import.meta.url)), t.icon);

// 遊戲區清單檢查
const gamesText = fs.readFileSync(new URL('./public/games.txt', import.meta.url), 'utf8');
const games = parseTools(gamesText);
assert.deepEqual(games.map((g) => g.id), ['liar-dice']);
assert.equal(games[0].type, '遊戲');
assert.equal(games[0].url.startsWith('https://'), true);
assert.ok(fs.existsSync(new URL('./public/icons/' + games[0].icon, import.meta.url)), games[0].icon);

// 手動編輯容易發生的狀況
const messy = parseTools('﻿# 說明\r\n代號: A-1\r\n名稱: 甲\r\n網址：javascript:alert(1)\r\n圖示：../x.png\r\n代號：b\r\n名稱：乙\r\n類型：網頁\r\n不認得：x\r\n\r\n代號：b\r\n名稱：重複\r\n\r\n代號：有中文\r\n名稱：壞代號\r\n\r\n名稱：沒有代號');
assert.deepEqual(messy.map((t) => [t.id, t.type, t.url, t.icon]), [['a-1', '下載', '', ''], ['b', '網頁', '', '']]);
assert.deepEqual(parseTools(''), []);

// 線上更新清單
const src = 'https://files.test/updates/latest.json';
const good = readManifest({ version: '6.3.0', downloadUrl: 'https://files.test/a.exe', fileSize: 100, releaseNotes: '版本 6.3.0：第一點；第二點；' }, src, 'Mon, 23 Nov 2026 17:30:00 GMT');
assert.deepEqual(good, { version: '6.3.0', url: 'https://files.test/a.exe', size: 100, date: '2026-11-24', notes: ['第一點', '第二點'] });
assert.equal(readManifest({ version: '6.3.0', downloadUrl: 'https://evil.test/a.exe' }, src), null);
assert.equal(readManifest({ version: '6.3.0', downloadUrl: 'http://files.test/a.exe' }, src), null);
assert.equal(readManifest({ version: '<b>', downloadUrl: 'https://files.test/a.exe' }, src), null);
assert.equal(readManifest(null, src), null);

// GitHub 發布
const rel = (tag, name, extra = {}) => ({ tag_name: tag, body: '- 修正\n- 新增', published_at: '2026-11-20T00:00:00Z', assets: [{ name, size: 5, browser_download_url: 'https://github.com/x/' + name }], ...extra });
const r = readReleases([rel('gofile-1.9.0', 'a.exe'), rel('gofile-1.10.0', 'b.exe'), rel('mic-1.3.0', 'm.exe'), rel('mic-2.0.0', 'draft.exe', { draft: true }), rel('gofile-9.0.0', 'readme.txt'), rel('v1.0', 'z.exe')]);
assert.deepEqual([r.gofile.version, r.gofile.url, r.mic.version, Object.keys(r).length], ['1.10.0', 'https://github.com/x/b.exe', '1.3.0', 2]);
assert.deepEqual(r.mic.notes, ['修正', '新增']);
assert.deepEqual(readReleases({ message: 'Not Found' }), {});
assert.ok(compareVersions('1.10', '1.9') > 0 && compareVersions('2.0', '2.0.0') === 0);
assert.equal(mergeTool(tools[0], undefined), tools[0]);
assert.deepEqual([mergeTool(tools[0], r.mic).url, mergeTool(tools[0], { version: '9.9', size: null }).size], ['https://github.com/x/m.exe', 152374808]);
assert.equal(formatSize(152374808), '145 MB');

// Cloudflare Function：來源正常、壞掉、逾時都不能讓網站壞掉
const run = async (impl) => {
  const saved = globalThis.fetch; globalThis.fetch = impl;
  try { return await (await onRequestGet({ request: new Request('https://site.test/api/live'), env: { ASSETS: { fetch: async () => new Response(text) } } })).json(); } finally { globalThis.fetch = saved; }
};
const host = new URL(tools[0].source).origin;
const ok = await run(async () => new Response('﻿' + JSON.stringify({ version: '7.0.0', downloadUrl: host + '/r/7.exe', fileSize: 9 })));
assert.deepEqual([ok['game-time'].version, ok['game-time'].url], ['7.0.0', host + '/r/7.exe']);
assert.deepEqual(await run(async () => new Response('not json')), {});
assert.deepEqual(await run(async () => new Response('', { status: 500 })), {});
assert.deepEqual(await run(async () => { throw new Error('timeout'); }), {});
// 私人下載：沒密碼看不到清單、拿不到檔案；檔案只給清單上有的
const store = new Map([['tools.txt', '代號：mic\n名稱：測試軟體\n檔案：mic/a.exe\n\n代號：x\n名稱：壞路徑\n檔案：../secret\n\n代號：y\n名稱：最上層\n檔案：b.exe'],['mic/a.exe', 'EXE'], ['b.exe', 'B'], ['other.exe', 'NO']]);
const bucket = { get: async (k) => store.has(k) ? { body: store.get(k), size: store.get(k).length, text: async () => store.get(k) } : null, head: async (k) => store.has(k) ? { size: store.get(k).length } : null };
const env = { PRIVATE: bucket, PRIVATE_PASSWORD: 'correct horse' };
const call = (path, init = {}, e = env) => privateApi({ request: new Request('https://site.test/api/private/' + path, init), env: e, params: { path: path.split('/') } });
const post = (path, body, headers = {}, e = env) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, e);
assert.equal((await call('list', {}, {})).status, 503);
assert.equal((await call('list')).status, 401);
assert.equal((await call('file/mic/a.exe')).status, 401);
assert.equal((await post('login', { password: 'wrong' })).status, 401);
assert.equal((await post('login', { password: 'correct horse' }, { Origin: 'https://evil.test' })).status, 403);
const login = await post('login', { password: 'correct horse' });
assert.equal(login.status, 200);
const cookie = login.headers.get('Set-Cookie');
assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
const listed = (await login.json()).tools;
assert.deepEqual(listed.map((t) => [t.id, t.url, t.size]), [['mic', '/api/private/file/mic/a.exe', 3], ['x', '', null], ['y', '/api/private/file/b.exe', 1]]);
const auth = { headers: { Cookie: cookie.split(';')[0] } };
assert.equal((await call('list', auth)).status, 200);
const file = await call('file/mic/a.exe', auth);
assert.deepEqual([file.status, await file.text(), file.headers.get('Content-Disposition').startsWith('attachment')], [200, 'EXE', true]);
assert.equal((await call('file/other.exe', auth)).status, 404);
assert.equal((await call('list', { headers: { Cookie: cookie.split(';')[0].replace(/.$/, (c) => c === '0' ? '1' : '0') } })).status, 401);
assert.equal((await call('list', auth, { ...env, PRIVATE_PASSWORD: 'new password' })).status, 401); // 換密碼，舊的全部失效
for (let i = 0; i < 5; i++) await post('login', { password: 'x' + i }, { 'CF-Connecting-IP': '9.9.9.9' });
assert.equal((await post('login', { password: 'correct horse' }, { 'CF-Connecting-IP': '9.9.9.9' })).status, 429);
// 設定或輸入時多了換行、空白，或用了全形數字，都要能解鎖
assert.equal((await post('login', { password: '１２３４' }, { 'CF-Connecting-IP': '8.8.8.8' }, { ...env, PRIVATE_PASSWORD: '1234\n' })).status, 200);
assert.equal((await post('login', { password: ' 1234 ' }, { 'CF-Connecting-IP': '8.8.8.8' }, { ...env, PRIVATE_PASSWORD: '1234' })).status, 200);
assert.equal((await post('login', { password: '1235' }, { 'CF-Connecting-IP': '8.8.8.8' }, { ...env, PRIVATE_PASSWORD: '1234' })).status, 401);
// 公開時檔案不用搬：寫進公開清單的檔案，不用密碼就能下載；私人的還是要密碼
const pubEnv = { ...env, ASSETS: { fetch: async () => new Response('代號：b\n名稱：已公開\n檔案：b.exe') } };
const pubFile = await call('file/b.exe', {}, pubEnv);
assert.deepEqual([pubFile.status, await pubFile.text()], [200, 'B']);
assert.equal((await call('file/mic/a.exe', {}, pubEnv)).status, 401);
assert.equal((await call('file/other.exe', {}, pubEnv)).status, 401);
const liveFile = await (await onRequestGet({ request: new Request('https://site.test/api/live'), env: pubEnv })).json();
assert.deepEqual(liveFile.b, { url: '/api/private/file/b.exe', size: 1 });
// 說明牌不顯示更新內容（使用者決定），不要加回
for (const f of ['index.html', 'app.js']) assert.doesNotMatch(fs.readFileSync(new URL('./public/' + f, import.meta.url), 'utf8'), /這一版更新了什麼|notes-list/, f);
console.log('PASS 私人下載、清單解析、手動編輯錯誤、線上更新清單、GitHub 發布、版本比較、來源故障');
