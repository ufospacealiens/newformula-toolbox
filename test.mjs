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
// ---------- 遊戲區帳號：用電腦內建的 SQLite 假裝 Cloudflare D1，用自己產生的鑰匙假裝 Google ----------
const { DatabaseSync } = await import('node:sqlite');
const { handleGame, GIFTS, twDay, cleanName } = await import('./lib/game-server.js');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('./schema/game.sql', import.meta.url), 'utf8'));
const stmt = (q, args = []) => ({
  bind: (...a) => stmt(q, a),
  first: async () => sql.prepare(q).get(...args) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...args) }),
  run: async () => ({ meta: { changes: sql.prepare(q).run(...args).changes } }),
});
const GAME_DB = { prepare: (q) => stmt(q), batch: async (list) => { sql.exec('BEGIN'); try { for (const s of list) await s.run(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
const CID = 'test.apps.googleusercontent.com', SITE = 'https://newformula.pages.dev';
const genv = { GAME_DB, GOOGLE_CLIENT_ID: CID };
const keyPair = async () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const google = await keyPair(), stranger = await keyPair();
const jwk = { ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = (x) => Buffer.from(x).toString('base64url');
const idToken = async (claims, key = google.privateKey) => {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64u(JSON.stringify(claims));
  return h + '.' + p + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, Buffer.from(h + '.' + p)));
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => (String(u) === 'https://www.googleapis.com/oauth2/v3/certs' ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=3600' } }) : realFetch(u));
let clock = Date.parse('2026-11-26T03:00:00Z'); // 台灣時間 11/26 早上 11 點
const day = () => { clock += 864e5; };
const g = (path, { method = 'GET', cookie = '', body, origin, e = genv } = {}) => {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  if (origin) headers.Origin = origin;
  return handleGame(new Request(SITE + '/api/game/' + path, { method, headers, body: body && JSON.stringify(body) }), e, path, clock);
};
const gpost = (path, opts = {}) => g(path, { method: 'POST', body: {}, ...opts });
const cookieOf = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + '='));
// 還沒設定好：不顯示登入，也不能用
assert.deepEqual(await (await g('me', { e: {} })).json(), { ready: false, logged: false });
assert.equal((await g('auth/start', { e: { GAME_DB } })).status, 503);
assert.deepEqual(await (await g('me')).json(), { ready: true, logged: false });
// 1. 跳到 Google：只要名字，不要 email；回到 /login
async function start() {
  const res = await g('auth/start');
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('Location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual([to.searchParams.get('client_id'), to.searchParams.get('redirect_uri'), to.searchParams.get('scope'), to.searchParams.get('response_type')], [CID, SITE + '/login', 'openid profile', 'id_token']);
  const c = cookieOf(res, 'nf_oauth');
  assert.match(c, /HttpOnly; Secure; SameSite=Lax/);
  return { state: to.searchParams.get('state'), nonce: to.searchParams.get('nonce'), cookie: c.split(';')[0] };
}
const claims = (s, extra = {}) => ({ iss: 'https://accounts.google.com', aud: CID, sub: '1234567890', given_name: '<小明>', exp: clock / 1000 + 3600, iat: clock / 1000, nonce: s.nonce, ...extra });
const glogin = async (s, token) => gpost('login', { cookie: s.cookie, body: { id_token: token, state: s.state } });
let s = await start();
assert.equal((await gpost('login', { cookie: s.cookie, body: { id_token: await idToken(claims(s)), state: 'f'.repeat(32) } })).status, 400); // 暗號不對
assert.equal((await gpost('login', { body: { id_token: await idToken(claims(s)), state: s.state } })).status, 400); // 沒有從自己網站開始登入
assert.equal((await glogin(s, await idToken(claims(s, { aud: 'other' })))).status, 401); // 給別的網站的證明
assert.equal((await glogin(s, await idToken(claims(s, { nonce: 'x' })))).status, 401); // 被偷來重送的證明
assert.equal((await glogin(s, await idToken(claims(s, { exp: clock / 1000 - 3600 })))).status, 401); // 過期
assert.equal((await glogin(s, await idToken(claims(s), stranger.privateKey))).status, 401); // 不是 Google 簽的
assert.equal((await glogin(s, await idToken(claims(s, { iss: 'https://evil.test' })))).status, 401);
assert.equal((await glogin(s, 'not.a.token')).status, 401);
// 2. 第一次登入：送 1,000 金幣
let res = await glogin(s, await idToken(claims(s)));
assert.equal(res.status, 200);
let me = await res.json();
assert.deepEqual([me.isNew, me.coins, me.name, me.gift.pos, me.gift.claimed, me.relief.available], [true, 1000, '小明', 0, false, false]);
assert.match(cookieOf(res, 'nf_game'), /^nf_game=[0-9a-f]{64}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);
const who = cookieOf(res, 'nf_game').split(';')[0];
assert.equal(sql.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
assert.doesNotMatch(JSON.stringify(sql.prepare('SELECT * FROM players').all()), /@|email/); // 不存 email
// 再登入一次：不會再送
s = await start();
me = await (await glogin(s, await idToken(claims(s)))).json();
assert.deepEqual([me.isNew, me.coins], [false, 1000]);
assert.equal((await g('me', { cookie: who })).status, 200);
assert.equal((await (await g('me', { cookie: who })).json()).logged, true);
assert.equal((await (await g('me', { cookie: 'nf_game=' + 'a'.repeat(64) })).json()).logged, false);
// 3. 每日禮包：一天一次；漏領不會重來；7 天一輪
assert.equal((await gpost('gift')).status, 401);
assert.equal((await gpost('gift', { cookie: who, origin: 'https://evil.test' })).status, 403);
const both = await Promise.all([gpost('gift', { cookie: who }), gpost('gift', { cookie: who })]); // 同時按兩次
assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
me = await (await g('me', { cookie: who })).json();
assert.deepEqual([me.coins, me.gift.pos, me.gift.claimed, me.gift.count], [1100, 1, true, 1]);
clock = Date.parse('2026-11-26T15:59:00Z'); // 台灣 23:59，還是同一天
assert.equal((await gpost('gift', { cookie: who })).status, 409);
clock = Date.parse('2026-11-26T16:00:00Z'); // 台灣半夜 12 點換日
assert.equal(twDay(clock), '2026-11-27');
day(); day(); // 隔了 3 天才回來
me = await (await gpost('gift', { cookie: who })).json();
assert.deepEqual([me.amount, me.day, me.coins], [150, 2, 1250]);
for (const want of GIFTS.slice(2)) { day(); me = await (await gpost('gift', { cookie: who })).json(); assert.equal(me.amount, want); }
assert.deepEqual([me.coins, me.gift.pos, me.gift.count, me.gift.claimed], [1250 + 200 + 250 + 300 + 400 + 1000, 0, 7, true]);
day();
assert.equal((await (await gpost('gift', { cookie: who })).json()).amount, 100); // 新的一輪
// 4. 救濟金：金幣夠的時候拿不到；不到 100 才有，補到 500，一天一次
assert.equal((await gpost('relief', { cookie: who })).status, 409);
const lose = (n) => { const p = sql.prepare("UPDATE players SET coins = coins - ? WHERE id = 'g:1234567890' RETURNING coins").get(n); sql.prepare("INSERT INTO coin_log (player_id, delta, balance, reason, at) VALUES ('g:1234567890', ?, ?, 'test-lose', 0)").run(-n, p.coins); };
lose(me.coins - 30 + 100);
me = await (await g('me', { cookie: who })).json();
assert.deepEqual([me.coins, me.relief.available], [30, true]);
const twice = await Promise.all([gpost('relief', { cookie: who }), gpost('relief', { cookie: who })]);
assert.deepEqual(twice.map((r) => r.status).sort(), [200, 409]);
me = await (await g('me', { cookie: who })).json();
assert.deepEqual([me.coins, me.relief.available, me.relief.usedToday], [500, false, true]);
lose(500);
assert.equal((await gpost('relief', { cookie: who })).status, 409); // 今天領過了
day();
me = await (await gpost('relief', { cookie: who })).json();
assert.deepEqual([me.amount, me.coins], [500, 500]);
// 金幣進出紀錄對得起來
const sum = sql.prepare("SELECT SUM(delta) s FROM coin_log WHERE player_id = 'g:1234567890'").get().s;
assert.equal(sum, me.coins);
// 5. 登出：這個瀏覽器的登入失效
assert.match(cookieOf(await gpost('logout', { cookie: who }), 'nf_game'), /Max-Age=0/);
assert.equal((await (await g('me', { cookie: who })).json()).logged, false);
assert.deepEqual([cleanName(''), cleanName('  A\u0000b  c  '), cleanName('一二三四五六七八九十一二三四')], ['玩家', 'Ab c', '一二三四五六七八九十一二']);
globalThis.fetch = realFetch;
console.log('PASS 私人下載、清單解析、手動編輯錯誤、線上更新清單、GitHub 發布、版本比較、來源故障、遊戲帳號（登入、禮包、救濟金）');
