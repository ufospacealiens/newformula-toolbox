// 遊戲區帳號：Google 登入、金幣、每日禮包、救濟金（伺服器端）
// 網址：/api/game/…（functions/api/game/[[path]].js 轉到這裡）
// Cloudflare 上要設定（正式版和預覽版都要）：
//   D1 資料庫綁定，名稱 GAME_DB → 資料庫 newformula-game（表格見 schema/game.sql）
// Google 登入用的「用戶端 ID」寫在下面 CLIENT_ID（它本來就會出現在登入網址裡，不是密碼）。
// 不需要任何密碼或金鑰：Google 登入用「跳轉回來帶身分證明」的方式，伺服器用 Google 公開的鑰匙驗證。
//
// 規則（使用者 2026-11-26 決定）：
//   新帳號 1,000 金幣，所有遊戲共用；不能儲值、不能換錢、玩家之間不能送金幣
//   每日禮包 7 天一輪，漏領不會重來；台灣時間半夜 12 點換日
//   救濟金平常看不到，金幣不到 100 才出現，補到 500，每天一次
//   帳號只登一次（使用者 2026-11-26 決定）：官網是「登入中心」，進遊戲時發一張 1 分鐘、只能用一次的通行證帶過去；
//   登入狀態 60 天，有回來就自動延長

export const CLIENT_ID = '782901186509-l4g4a0p5l0kgrkbi9phphq7quju4h5cd.apps.googleusercontent.com'; // Google Cloud 專案 newformula-game 的「新配方官網」用戶端
export const START = 1000, RELIEF_BELOW = 100, RELIEF_TO = 500;
export const GIFTS = [100, 150, 200, 250, 300, 400, 1000];
const COOKIE = 'nf_game', OAUTH = 'nf_oauth', NEXT = 'nf_next', SESSION_DAYS = 60, RENEW_DAYS = 30, TICKET_MS = 60e3;
// 官網登入後可以帶著登入進去的遊戲（通行證只會發給這些網址）
export const GAMES = {
  'liar-dice': 'https://liar-dice.gametime-library-f5948618.workers.dev',
  'liar-dice-preview': 'https://liar-dice-preview.gametime-library-f5948618.workers.dev',
};
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const enc = new TextEncoder();

const json = (data, status = 200, cookies = []) => {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), { status, headers: h });
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const readCookie = (request, name) => (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))?.[1] || '';
const sessionCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const clearOauth = `${OAUTH}=; Path=/api/game; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
// 只有在自己電腦上測試時，才可以把 Google 換成假的
const isLocal = (url) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';
function gameTarget(key, url, env) {
  if (isLocal(url) && env.GAME_TARGETS) {
    try { const t = JSON.parse(env.GAME_TARGETS)[key]; if (t) return t; } catch { /* 測試設定寫錯就用正式的 */ }
  }
  return Object.hasOwn(GAMES, key) ? GAMES[key] : '';
}
const roomOf = (r) => (/^\d{4}$/.test(r || '') ? r : '');
const clearNext = `${NEXT}=; Path=/api/game; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const go = (location, cookies = []) => {
  const h = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
};

// 台灣日期（UTC+8）
export const twDay = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

export function cleanName(s) {
  const name = String(s || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
  return [...name].slice(0, 12).join('') || '玩家';
}

// 給網頁看的狀態
export function view(p, now) {
  const today = twDay(now), claimed = p.gift_day === today;
  return {
    name: p.name, coins: p.coins, today,
    gift: { pos: p.gift_pos, count: p.gift_count, claimed, amounts: GIFTS },
    relief: { available: p.coins < RELIEF_BELOW && p.relief_day !== today, usedToday: p.relief_day === today, below: RELIEF_BELOW, to: RELIEF_TO },
  };
}

// ---------- Google 身分證明（ID token）驗證 ----------
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64json = (s) => JSON.parse(new TextDecoder().decode(b64(s)));
let keyCache = { url: '', keys: [], until: 0 };
async function googleKeys(url, now, force) {
  if (!force && keyCache.url === url && keyCache.until > now) return keyCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error('certs ' + res.status);
  const age = Number((res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  keyCache = { url, keys: (await res.json()).keys || [], until: now + Math.min(age, 86400) * 1000 };
  return keyCache.keys;
}
export async function verifyGoogleIdToken(token, { clientId, nonce, now, certsUrl = GOOGLE_CERTS }) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('format');
  const header = b64json(parts[0]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  let jwk = (await googleKeys(certsUrl, now)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(certsUrl, now, true)).find((k) => k.kid === header.kid); // Google 換鑰匙了
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('signature');
  const c = b64json(parts[1]);
  if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') throw new Error('iss');
  if (c.aud !== clientId) throw new Error('aud');
  if (!(c.exp * 1000 > now - 60e3)) throw new Error('exp');
  if (!nonce || c.nonce !== nonce) throw new Error('nonce');
  if (typeof c.sub !== 'string' || !/^[\w-]{1,64}$/.test(c.sub)) throw new Error('sub');
  return c;
}

// ---------- 資料庫 ----------
export async function currentPlayer(request, env, now) {
  const token = readCookie(request, COOKIE);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.GAME_DB.prepare('SELECT p.*, s.expires_at AS session_expires FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?1 AND s.expires_at > ?2')
    .bind(await sha(token), now).first();
}
// 開一個新的登入狀態（Google 登入或通行證），回傳要放進 Cookie 的隨機碼
async function startSession(db, id, now) {
  const token = randomHex(32);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE player_id = ?1 AND expires_at < ?2').bind(id, now),
    db.prepare('INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha(token), id, now + SESSION_DAYS * 864e5),
  ]);
  return token;
}
const log = (db, id, delta, balance, reason, now) =>
  db.prepare('INSERT INTO coin_log (player_id, delta, balance, reason, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, delta, balance, reason, now).run();

export async function handleGame(request, env, path, now = Date.now()) {
  const url = new URL(request.url), method = request.method;
  const clientId = String(env.GOOGLE_CLIENT_ID || CLIENT_ID).trim();
  const ready = Boolean(env.GAME_DB && clientId);
  const db = env.GAME_DB;

  if (method === 'POST') {
    // 只接受從自己網站送出的要求
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'origin' }, 403);
  }

  if (path === 'me' && method === 'GET') {
    if (!ready) return json({ ready: false, logged: false });
    const p = await currentPlayer(request, env, now);
    if (!p) return json({ ready: true, logged: false });
    // 有回來就自動延長：剩不到 30 天時，重新算 60 天
    const cookies = [];
    if (p.session_expires - now < RENEW_DAYS * 864e5) {
      const token = readCookie(request, COOKIE);
      await db.prepare('UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2').bind(now + SESSION_DAYS * 864e5, await sha(token)).run();
      cookies.push(sessionCookie(token, SESSION_DAYS * 86400));
    }
    return json({ ready: true, logged: true, ...view(p, now) }, 200, cookies);
  }
  if (!ready) return json({ error: 'not-ready' }, 503);

  // 1. 按「登入」：記下這次的暗號，跳到 Google
  if (path === 'auth/start' && method === 'GET') {
    const state = randomHex(16), nonce = randomHex(16);
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: url.origin + '/login', response_type: 'id_token', scope: 'openid profile', nonce, state, prompt: 'select_account' });
    const h = new Headers({ Location: ((isLocal(url) && env.GOOGLE_AUTH_URL) || GOOGLE_AUTH) + '?' + q, 'Cache-Control': 'no-store' });
    h.append('Set-Cookie', `${OAUTH}=${state}.${nonce}; Path=/api/game; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    // 從遊戲來登入的：登入完要帶通行證回到那個遊戲（和房號）
    const next = url.searchParams.get('next') || '';
    h.append('Set-Cookie', gameTarget(next, url, env)
      ? `${NEXT}=${next}~${roomOf(url.searchParams.get('r'))}; Path=/api/game; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      : clearNext);
    return new Response(null, { status: 302, headers: h });
  }

  // 帶著登入進遊戲：已登入就發通行證跳過去；還沒登入就先登入，登完再跳過去
  if (path === 'pass' && method === 'GET') {
    const key = url.searchParams.get('to') || '', room = roomOf(url.searchParams.get('r'));
    const target = gameTarget(key, url, env);
    if (!target) return go('/#games');
    const p = await currentPlayer(request, env, now);
    if (!p) return go('/api/game/auth/start?' + new URLSearchParams({ next: key, r: room }));
    const ticket = randomHex(32);
    await db.batch([
      db.prepare('DELETE FROM tickets WHERE expires_at < ?1').bind(now),
      db.prepare('INSERT INTO tickets (token_hash, player_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha(ticket), p.id, now + TICKET_MS),
    ]);
    return go(target + '/api/game/ticket?' + new URLSearchParams(room ? { t: ticket, r: room } : { t: ticket }));
  }

  // 遊戲收到通行證：換成自己網站的登入狀態（通行證用過就作廢）
  if (path === 'ticket' && method === 'GET') {
    const t = url.searchParams.get('t') || '', room = roomOf(url.searchParams.get('r'));
    const back = '/' + (room ? '?r=' + room : '');
    if (!/^[0-9a-f]{64}$/.test(t)) return go(back);
    const row = await db.prepare('DELETE FROM tickets WHERE token_hash = ?1 RETURNING player_id, expires_at').bind(await sha(t)).first();
    if (!row || row.expires_at <= now) return go(back);
    const token = await startSession(db, row.player_id, now);
    return go(back, [sessionCookie(token, SESSION_DAYS * 86400)]);
  }

  // 2. Google 帶著身分證明回到 /login（login.html），網頁再送來這裡
  if (path === 'login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const m = readCookie(request, OAUTH).match(/^([0-9a-f]{32})\.([0-9a-f]{32})$/);
    if (!m || body.state !== m[1] || typeof body.id_token !== 'string') return json({ error: 'state' }, 400, [clearOauth]);
    let claims;
    try {
      claims = await verifyGoogleIdToken(body.id_token, { clientId, nonce: m[2], now, certsUrl: (isLocal(url) && env.GOOGLE_CERTS_URL) || GOOGLE_CERTS });
    } catch {
      return json({ error: 'token' }, 401, [clearOauth]);
    }
    const id = 'g:' + claims.sub;
    const created = await db.prepare('INSERT INTO players (id, name, coins, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING RETURNING id')
      .bind(id, cleanName(claims.given_name || claims.name), START, now).first();
    if (created) await log(db, id, START, START, 'start', now);
    const token = await startSession(db, id, now);
    const p = await db.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first();
    // 從遊戲來登入的，登完直接帶通行證回去
    const [nextKey = '', nextRoom = ''] = readCookie(request, NEXT).split('~');
    const next = gameTarget(nextKey, url, env)
      ? '/api/game/pass?' + new URLSearchParams(roomOf(nextRoom) ? { to: nextKey, r: nextRoom } : { to: nextKey })
      : '';
    return json({ isNew: Boolean(created), next, ...view(p, now) }, 200, [clearOauth, clearNext, sessionCookie(token, SESSION_DAYS * 86400)]);
  }

  if (path === 'logout' && method === 'POST') {
    const token = readCookie(request, COOKIE);
    if (/^[0-9a-f]{64}$/.test(token)) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha(token)).run();
    return json({ ok: true }, 200, [sessionCookie('', 0)]);
  }

  const p = await currentPlayer(request, env, now);
  if (!p) return json({ error: 'login' }, 401);
  const today = twDay(now);

  // 每日禮包：一天一次，接著上次領到的那一天
  if (path === 'gift' && method === 'POST') {
    const pos = ((p.gift_pos % 7) + 7) % 7, amount = GIFTS[pos];
    if (p.gift_day === today) return json({ error: 'claimed', ...view(p, now) }, 409);
    const row = await db.prepare('UPDATE players SET coins = coins + ?1, gift_pos = (?4 + 1) % 7, gift_count = gift_count + 1, gift_day = ?2 WHERE id = ?3 AND gift_pos = ?5 AND (gift_day IS NULL OR gift_day <> ?2) RETURNING *')
      .bind(amount, today, p.id, pos, p.gift_pos).first();
    if (!row) return json({ error: 'claimed' }, 409);
    await log(db, p.id, amount, row.coins, 'gift-day' + (pos + 1), now);
    return json({ amount, day: pos + 1, ...view(row, now) });
  }

  // 救濟金：金幣不到 100 才能領，補到 500，一天一次
  if (path === 'relief' && method === 'POST') {
    if (p.coins >= RELIEF_BELOW || p.relief_day === today) return json({ error: 'not-available', ...view(p, now) }, 409);
    const row = await db.prepare('UPDATE players SET coins = ?1, relief_day = ?2 WHERE id = ?3 AND coins = ?4 AND (relief_day IS NULL OR relief_day <> ?2) RETURNING *')
      .bind(RELIEF_TO, today, p.id, p.coins).first();
    if (!row) return json({ error: 'not-available' }, 409);
    await log(db, p.id, RELIEF_TO - p.coins, row.coins, 'relief', now);
    return json({ amount: RELIEF_TO - p.coins, ...view(row, now) });
  }

  return json({ error: 'not-found' }, 404);
}
