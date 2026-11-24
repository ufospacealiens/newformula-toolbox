// 讀取各軟體的線上更新清單，讓官網的版本、大小、下載網址跟著更新。
// 有問題的來源會略過，網站就顯示 tools.txt 裡的資料。
import { parseTools, readManifest } from '../../public/tools-core.js';

export async function onRequestGet({ request, env }) {
  const list = await env.ASSETS.fetch(new URL('/tools.txt', request.url));
  const tools = parseTools(await list.text()).filter((t) => t.source);
  const live = {};
  await Promise.all(tools.map(async (t) => {
    try {
      const res = await fetch(t.source, { cf: { cacheTtl: 300, cacheEverything: true }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const text = (await res.text()).replace(/^﻿/, '');
      const data = readManifest(JSON.parse(text), t.source, res.headers.get('Last-Modified'));
      if (data) live[t.id] = data;
    } catch { /* 來源暫時讀不到 */ }
  }));
  return Response.json(live, { headers: { 'Cache-Control': 'public, max-age=120', 'X-Content-Type-Options': 'nosniff' } });
}
