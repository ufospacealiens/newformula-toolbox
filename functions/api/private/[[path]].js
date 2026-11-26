// 私人下載：輸入密碼後才看得到清單、下載得到檔案。外人連軟體名稱都看不到。
// Cloudflare 上要設定兩樣（正式版和預覽版都要）：
//   R2 儲存空間綁定，名稱 PRIVATE：放 tools.txt（格式和公開清單一樣，多一個「檔案」欄位）和軟體檔案
//   機密變數 PRIVATE_PASSWORD：密碼，只有使用者知道。換密碼後，所有人都要重新輸入
// 要公開某個軟體時，檔案不用搬：把那一段移到公開的 tools.txt（保留「檔案」），就不需要密碼也能下載。
import { parseTools, fileUrl } from '../../../public/tools-core.js';

const COOKIE = 'nf_private', DAYS = 30, MAX_FAILS = 5, FAIL_WINDOW = 10 * 60e3;
const enc = new TextEncoder();
const fails = new Map(); // 同一台伺服器上，同一個 IP 打錯幾次

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
async function sign(password, exp) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode('nf-private:' + exp)));
}
// 比對時不論對錯都花一樣的時間
function same(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function unlocked(request, env) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=(\\d{13})\\.([0-9a-f]{64})'));
  if (!m || Number(m[1]) < Date.now()) return false;
  return same(m[2], await sign(env.PRIVATE_PASSWORD, m[1]));
}

// 兩份清單：私人的放在 R2，公開的是網站上的 tools.txt
async function privateTools(env) {
  const obj = await env.PRIVATE.get('tools.txt');
  return obj ? parseTools(await obj.text()) : [];
}
async function publicTools(request, env) {
  try {
    const res = await env.ASSETS.fetch(new URL('/tools.txt', request.url));
    return res.ok ? parseTools(await res.text()) : [];
  } catch { return []; }
}

// 私人清單給網頁用；大小沒填就用檔案實際大小
async function readList(env) {
  return Promise.all((await privateTools(env)).map(async (t) => {
    const out = { id: t.id, name: t.name, desc: t.desc, type: t.type, platform: t.platform, colorValue: t.colorValue, icon: t.icon, version: t.version, size: t.size, date: t.date, url: t.url };
    if (t.file) {
      const head = await env.PRIVATE.head(t.file);
      out.url = head ? fileUrl(t.file) : '';
      if (head && !out.size) out.size = head.size;
    }
    return out;
  }));
}

function sendFile(obj, key, method, isPublic) {
  const name = key.split('/').pop();
  return new Response(method === 'HEAD' ? null : obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequest({ request, env, params }) {
  const path = [].concat(params.path || []).join('/');
  const method = request.method;
  if (!env.PRIVATE || !env.PRIVATE_PASSWORD) return json({ error: 'not-ready' }, 503);

  if (method === 'POST') {
    // 只接受從自己網站送出的要求
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin' }, 403);
  }

  if (path === 'login' && method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || '?', now = Date.now();
    const f = fails.get(ip);
    if (f && now - f.since < FAIL_WINDOW && f.count >= MAX_FAILS) return json({ error: 'too-many' }, 429);
    const body = await request.json().catch(() => ({}));
    // 前後空白、換行、全形數字都不算錯（設定密碼時多按 Enter 或用中文輸入法打數字，看起來一樣卻對不上）
    const norm = (s) => String(s).normalize('NFKC').trim();
    const ok = typeof body.password === 'string' && same(await sha(norm(body.password)), await sha(norm(env.PRIVATE_PASSWORD)));
    if (!ok) {
      const g = f && now - f.since < FAIL_WINDOW ? f : { since: now, count: 0 };
      g.count++;
      fails.set(ip, g);
      await new Promise((r) => setTimeout(r, 800)); // 讓猜密碼變慢
      return json({ error: 'wrong' }, 401);
    }
    fails.delete(ip);
    const exp = String(now + DAYS * 864e5);
    const cookie = `${COOKIE}=${exp}.${await sign(env.PRIVATE_PASSWORD, exp)}; Path=/api/private; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
    return json({ tools: await readList(env) }, 200, { 'Set-Cookie': cookie });
  }

  if (path === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/api/private; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
  }

  if (path.startsWith('file/') && (method === 'GET' || method === 'HEAD')) {
    const key = path.slice(5);
    // 公開清單上的檔案誰都能下載；私人清單上的要先解鎖；兩份清單都沒有的一律不給
    const isPublic = (await publicTools(request, env)).some((t) => t.file === key);
    if (!isPublic) {
      if (!(await unlocked(request, env))) return json({ error: 'locked' }, 401);
      if (!(await privateTools(env)).some((t) => t.file === key)) return json({ error: 'not-found' }, 404);
    }
    const obj = method === 'HEAD' ? await env.PRIVATE.head(key) : await env.PRIVATE.get(key);
    return obj ? sendFile(obj, key, method, isPublic) : json({ error: 'not-found' }, 404);
  }

  if (!(await unlocked(request, env))) return json({ error: 'locked' }, 401);
  if (path === 'list' && method === 'GET') return json({ tools: await readList(env) });
  return json({ error: 'not-found' }, 404);
}
