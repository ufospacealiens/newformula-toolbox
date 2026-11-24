// 執行：node test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTools, readManifest, readReleases, mergeTool, compareVersions, formatSize } from './public/tools-core.js';
import { onRequestGet } from './functions/api/live.js';

const text = fs.readFileSync(new URL('./public/tools.txt', import.meta.url), 'utf8');
const tools = parseTools(text);
assert.deepEqual(tools.map((t) => t.id), ['game-time', 'mic', 'gofile', 'stock']);
assert.equal(tools[2].name, 'GoFile IDM / XDM 下載器');
assert.equal(tools[0].source.startsWith('https://'), true);
assert.equal(new Set(tools.map((t) => t.colorValue)).size, 4);
for (const t of tools) assert.ok(fs.existsSync(new URL('./public/icons/' + t.icon, import.meta.url)), t.icon);

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
assert.equal(mergeTool(tools[1], undefined), tools[1]);
assert.deepEqual([mergeTool(tools[1], r.mic).url, mergeTool(tools[1], { version: '9.9', size: null }).size], ['https://github.com/x/m.exe', 71778766]);
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
console.log('PASS 清單解析、手動編輯錯誤、線上更新清單、GitHub 發布、版本比較、來源故障');
