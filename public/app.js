import { parseTools, mergeTool, formatSize, fileUrl } from './tools-core.js?v=a0a8d81e';
import { ALL, HEAVY } from './font-chars.js?v=e51e91bf';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const phone = window.matchMedia('(max-width: 720px)');
const MAX_BALLS = 8, MIN_SLOTS = 8, NEW_DAYS = 14;
let tools = [], selected = -1, lastFocus = null; // selected 是 -1：沒有選工具，右邊顯示介紹
let pub = [], priv = [], games = [], mode = 'tools'; // 公開工具、私人軟體、遊戲區、目前分區

// 標誌螢幕裡的像素扳手
const WRENCH = ['......##..', '.....##...', '.....##..#', '.....##.##', '.....#####', '....#####.', '...####...', '..###.....', '.###......', '.##.......'];
const wrench = $('wrench');
WRENCH.forEach((row, y) => [...row].forEach((c, x) => {
  if (c !== '#') return;
  const r = document.createElementNS(SVG, 'rect');
  r.setAttribute('x', 47.5 + x * 2.5); r.setAttribute('y', 61 + y * 2.5);
  r.setAttribute('width', 2.6); r.setAttribute('height', 2.6);
  wrench.append(r);
}));

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
// 名稱有「 - 」時，固定在「-」前面換行，不會斷在字中間
function setName(e, name) {
  const i = name.indexOf(' - ');
  if (i < 0) { e.textContent = name; return e; }
  e.replaceChildren(el('span', 'nm', name.slice(0, i)), ' ', el('span', 'nm', name.slice(i + 1)));
  return e;
}
function ballSvg(symbol, color, className) {
  const s = document.createElementNS(SVG, 'svg'), u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', '#' + symbol);
  s.setAttribute('aria-hidden', 'true');
  if (className) s.setAttribute('class', className);
  if (color) s.style.color = color;
  s.append(u);
  return s;
}
const touchOnly = window.matchMedia('(hover: none)'), calm = window.matchMedia('(prefers-reduced-motion: reduce)');
// PC 下載（橘紅）、網頁版（藍）與遊戲（紫）的差別：圖示、文字、顏色都不同
const KIND = {
  '下載': { key: 'download', tag: 'PC 下載', long: 'PC 版', go: '下載 PC 版' },
  '網頁': { key: 'web', tag: '網頁版', long: '網頁版', go: '開啟網頁版' },
  '遊戲': { key: 'game', tag: '線上遊玩', long: '線上小遊戲', go: '開始遊玩' },
};
const kindOf = (t) => KIND[t.type];
const pad = (n) => String(n).padStart(2, '0');
function isNew(date) {
  const age = (Date.now() - new Date(date + 'T00:00:00+08:00').getTime()) / 864e5;
  return age >= 0 && age < NEW_DAYS;
}

function drawCount() {
  const box = $('balls');
  box.replaceChildren();
  const many = tools.length > MAX_BALLS;
  const shown = many ? tools.slice(0, 1) : tools;
  shown.forEach((t, i) => {
    const b = el('button', 'ball');
    b.type = 'button';
    b.setAttribute('aria-label', t.name);
    b.title = t.name;
    b.style.setProperty('--i', i);
    b.append(ballSvg('ball', t.colorValue));
    b.onclick = () => select(i, true);
    b.onmouseenter = () => light(i, true);
    b.onmouseleave = () => light(i, false);
    box.append(b);
  });
  if (!many && tools.length < 6) for (let i = tools.length; i < 6; i++) {
    const s = el('span', 'ball');
    s.style.setProperty('--i', i);
    s.append(ballSvg('ball-empty'));
    box.append(s);
  }
  $('num').textContent = 'x' + pad(tools.length);
  $('count').setAttribute('aria-label', '已收納 ' + tools.length + (mode === 'games' ? ' 款遊戲' : ' 件工具'));
  $('count').setAttribute('role', 'group');
}

function drawRack() {
  const rack = $('rack');
  rack.replaceChildren();
  tools.forEach((t, i) => {
    const kind = kindOf(t);
    const b = el('button', 'slot kind-' + kind.key);
    b.type = 'button';
    b.id = 'slot-' + t.id;
    b.setAttribute('aria-pressed', 'false');
    b.append(el('span', 'slot-no', pad(i + 1)), ballSvg('ball', t.colorValue, 'slot-ball'));
    if (t.icon) { const img = el('img'); img.src = 'icons/' + t.icon; img.alt = ''; img.width = 72; img.height = 72; img.decoding = 'async'; b.append(img); }
    b.append(setName(el('span', 'slot-name'), t.name));
    const strip = el('span', 'slot-kind');
    strip.append(ballSvg('k-' + kind.key), el('span', '', kind.tag));
    b.append(strip);
    if (t.date && isNew(t.date)) b.append(el('span', 'slot-new', 'NEW'));
    if (t.private) { const lock = el('span', 'slot-lock'); lock.append(ballSvg('k-lock'), el('span', 'sr', '私人')); b.append(lock); }
    b.onclick = () => select(i, true);
    b.onmouseenter = () => light(i, true);
    b.onmouseleave = () => light(i, false);
    b.onkeydown = (e) => moveFocus(e, i);
    rack.append(b);
  });
  const total = Math.max(MIN_SLOTS, Math.ceil(tools.length / 4) * 4);
  for (let i = tools.length; i < total; i++) { const s = el('div', 'slot-empty'); s.setAttribute('aria-hidden', 'true'); rack.append(s); }
}

// 滑鼠移到球或格子上，兩邊一起亮
function light(i, on) {
  if (touchOnly.matches) return; // 手機沒有滑鼠，點過不要留下黑框
  $('balls').children[i]?.classList.toggle('lit', on && tools.length <= MAX_BALLS);
  $('rack').children[i]?.classList.toggle('lit', on);
}
// 方向鍵切換格子
function moveFocus(e, i) {
  const cols = getComputedStyle($('rack')).gridTemplateColumns.split(' ').length;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (!step) return;
  const next = i + step;
  if (next < 0 || next >= tools.length) return;
  e.preventDefault();
  $('rack').children[next].focus();
  if (!phone.matches) select(next, false);
}

function showPanel() {
  document.body.classList.toggle('has-tool', selected >= 0);
  if (selected >= 0) fillPanel(tools[selected]);
}
function fillPanel(t) {
  const panel = $('panel');
  $('p-icon').hidden = !t.icon;
  if (t.icon) $('p-icon').src = 'icons/' + t.icon;
  const kind = kindOf(t);
  panel.classList.toggle('kind-web', kind.key === 'web');
  panel.classList.toggle('kind-download', kind.key === 'download');
  panel.classList.toggle('kind-game', kind.key === 'game');
  $('p-type').replaceChildren(ballSvg('k-' + kind.key), el('span', '', kind.long));
  setName($('p-name'), t.name);
  $('p-desc').textContent = t.desc || '';
  const spec = $('spec');
  spec.replaceChildren();
  [['適用', t.platform, ''], ['下載', t.private && '私人（需要密碼）', ''], ['版本', t.version, 'm'], ['大小', formatSize(t.size), 'm'], ['更新日期', t.date && t.date.replaceAll('-', '/'), 'm']].forEach(([k, v, c]) => {
    if (!v) return;
    const row = el('div');
    row.append(el('dt', '', k), el('dd', c, v));
    spec.append(row);
  });
  const go = $('go');
  if (t.url) {
    go.href = t.url;
    go.replaceChildren(ballSvg('k-' + kind.key), el('span', '', kind.go));
    if (t.type === '網頁' || t.type === '遊戲') { go.target = '_blank'; go.rel = 'noopener'; } else { go.removeAttribute('target'); go.rel = 'noopener'; }
  } else {
    go.removeAttribute('href');
    go.removeAttribute('target');
    go.textContent = '還沒開放下載';
  }
  // 用手機或平板看 PC 軟體時，提醒不能安裝
  $('pc-note').hidden = !(kind.key === 'download' && (phone.matches || touchOnly.matches));
  // 電腦版換內容時淡入；手機由說明牌自己滑出
  if (!phone.matches && !calm.matches) for (const e of [panel.querySelector('.p-head'), $('p-desc'), spec]) e.animate?.([{ transform: 'translateY(6px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease' });
}

function select(i, byUser) {
  selected = i;
  [...$('rack').children].forEach((c, j) => { if (c.matches('.slot')) c.setAttribute('aria-pressed', String(j === i)); });
  showPanel();
  if (!byUser) return;
  setHash('#' + tools[i].id);
  if (phone.matches) openSheet();
}

// 不選任何工具，回到介紹
function deselect() {
  if (selected < 0) return;
  select(-1, false);
  setHash(mode === 'games' ? '#games' : location.pathname + location.search);
}
let hashTimer = 0;
function setHash(url) {
  // 手機等動畫結束再改網址，滑動比較順
  clearTimeout(hashTimer);
  const run = () => { try { history.replaceState(null, '', url); } catch { /* 預覽環境不支援時略過 */ } };
  if (phone.matches) hashTimer = setTimeout(run, 400); else run();
}

// 手機的說明牌：先把內容準備好（sheet-ready），下一格再滑出（sheet-open），動畫才不會卡
const sheetPanel = $('panel'), veil = $('veil'), SLIDE = 320;
const frame = () => new Promise((r) => requestAnimationFrame(r));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let sheetTurn = 0; // 每次開關加一，中途反悔時舊的動作就失效
function lockPage(on) {
  [$('top'), $('mode-bar'), $('rack'), $('intro'), $('intro-games')].forEach((e) => { if (e) e.inert = on; });
  sheetPanel.inert = phone.matches && !on; // 手機關著時先放在畫面外備好，但不能操作
  if (on) { sheetPanel.setAttribute('role', 'dialog'); sheetPanel.setAttribute('aria-modal', 'true'); } else { sheetPanel.removeAttribute('role'); sheetPanel.removeAttribute('aria-modal'); }
}
async function openSheet() {
  const turn = ++sheetTurn;
  lastFocus = document.activeElement;
  document.body.classList.add('sheet-ready');
  sheetPanel.scrollTop = 0;
  lockPage(true);
  await Promise.race([Promise.resolve($('p-icon').decode?.()).catch(() => {}), pause(80)]);
  await frame();
  await frame();
  if (turn !== sheetTurn) return;
  document.body.classList.add('sheet-open');
  await pause(SLIDE);
  if (turn === sheetTurn) $('close').focus({ preventScroll: true });
}
function closeSheet() {
  if (!document.body.classList.contains('sheet-ready')) return;
  const turn = ++sheetTurn;
  document.body.classList.remove('sheet-open', 'dragging');
  sheetPanel.style.transform = '';
  lockPage(false);
  lastFocus?.focus?.({ preventScroll: true });
  deselect();
  setTimeout(() => { if (turn === sheetTurn) document.body.classList.remove('sheet-ready'); }, SLIDE);
}
$('close').onclick = closeSheet;
veil.onclick = closeSheet;

// 往下拉關閉說明牌；打開時後面的畫面不跟著動
let drag = null;
sheetPanel.addEventListener('touchstart', (e) => {
  const ok = phone.matches && e.touches.length === 1 && document.body.classList.contains('sheet-open');
  drag = ok ? { y: e.touches[0].clientY, dy: 0, lastY: e.touches[0].clientY, lastT: e.timeStamp, speed: 0, atTop: sheetPanel.scrollTop <= 0, scrolls: sheetPanel.scrollHeight > sheetPanel.clientHeight + 1, height: sheetPanel.clientHeight } : null;
}, { passive: true });
sheetPanel.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const y = e.touches[0].clientY, dy = y - drag.y;
  // 內容可以捲動時，往上滑或還沒捲到頂，交給一般捲動
  if (!drag.on && drag.scrolls && (dy < 0 || !drag.atTop)) { drag = null; return; }
  if (e.cancelable) e.preventDefault();
  if (dy > 0 && e.timeStamp > drag.lastT) drag.speed = (y - drag.lastY) / (e.timeStamp - drag.lastT);
  drag.lastY = y; drag.lastT = e.timeStamp; drag.dy = Math.max(0, dy);
  if (!drag.on && drag.dy > 4) { drag.on = true; document.body.classList.add('dragging'); }
  if (drag.on && !drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) { drag.raf = 0; sheetPanel.style.transform = 'translateY(' + drag.dy + 'px)'; } });
}, { passive: false });
function endDrag(e) {
  const d = drag;
  drag = null;
  if (!d?.on) return;
  cancelAnimationFrame(d.raf);
  const far = d.dy > Math.min(140, d.height * 0.3), flick = d.speed > 0.5 && d.dy > 30;
  if (e.type === 'touchend' && (far || flick)) { closeSheet(); return; }
  document.body.classList.remove('dragging');
  sheetPanel.style.transform = '';
}
sheetPanel.addEventListener('touchend', endDrag);
sheetPanel.addEventListener('touchcancel', endDrag);
veil.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

// 小人只在看得到的時候動
if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => $('art').classList.toggle('still', e.intersectionRatio < 0.5), { threshold: [0, 0.5] }).observe($('art'));

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('unlock').open) { closeSheet(); deselect(); } });
phone.addEventListener('change', () => { closeSheet(); if (phone.matches) deselect(); else showPanel(); lockPage(false); });
$('home').onclick = (e) => {
  e.preventDefault();
  closeSheet();
  if (mode !== 'tools') switchMode('tools', { updateHash: true });
  else deselect();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 點空白處取消選取；拖曳選字、捲動、點捲軸都不算
let down = null;
const isBlank = (e) => e.target instanceof Element && !e.target.closest('.slot, .panel, button, a, summary, dialog') && e.clientX < document.documentElement.clientWidth;
document.addEventListener('pointerdown', (e) => { down = e.button === 0 && isBlank(e) ? { x: e.clientX, y: e.clientY } : null; });
document.addEventListener('pointercancel', () => { down = null; });
document.addEventListener('pointerup', (e) => {
  if (down && !phone.matches && isBlank(e) && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) deselect();
  down = null;
});

// 字型檔只帶用到的字；出現新字（改文字、新版更新內容）時再向 Google Fonts 補齊
const asked = new Set();
function loadMissingFonts() {
  const want = (text, have) => [...new Set(text)].filter((c) => c > '\u007f' && /\S/.test(c) && !have.includes(c));
  const allItems = [...pub, ...priv, ...games];
  const text = document.body.textContent + JSON.stringify(allItems), heads = allItems.map((t) => t.name).join('') + $('intro-title').textContent + ($('intro-games-title')?.textContent || '');
  for (const [weights, chars] of [['400;500', want(text, ALL)], ['900', want(heads, HEAVY)]]) {
    const fresh = chars.filter((c) => !asked.has(weights + c)).slice(0, 400);
    if (!fresh.length) continue;
    fresh.forEach((c) => asked.add(weights + c));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@' + weights + '&display=swap&text=' + encodeURIComponent(fresh.join(''));
    document.head.append(link);
  }
}

// 私人下載：輸入密碼後，私人軟體接在公開工具後面。是否解鎖由伺服器的 Cookie 決定，這裡只記「上次有解鎖」，免得每個人都多問一次
const FLAG = 'nf-private', dialog = $('unlock');
function remembered() { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } }
function remember(on) { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* 無痕模式 */ } }
async function privateApi(path, body) {
  try {
    const r = await fetch('/api/private/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch { return { status: 0, data: {} }; }
}
function updateModeUI() {
  document.body.classList.toggle('is-games', mode === 'games');
  $('tab-tools')?.setAttribute('aria-selected', String(mode === 'tools'));
  $('tab-games')?.setAttribute('aria-selected', String(mode === 'games'));
  $('rack')?.setAttribute('aria-label', mode === 'games' ? '遊戲欄位' : '工具欄位');
  if ($('cnt-tools')) $('cnt-tools').textContent = pad(pub.length + priv.length);
  if ($('cnt-games')) $('cnt-games').textContent = pad(games.length);
}
function switchMode(next, { keepId = '', updateHash = true } = {}) {
  const target = next === 'games' && games.length ? 'games' : 'tools';
  closeSheet();
  mode = target;
  tools = mode === 'games' ? games : [...pub, ...priv];
  selected = -1;
  updateModeUI();
  redraw(keepId);
  if (!document.body.classList.contains('sheet-ready')) lockPage(false);
  if (updateHash && !keepId) setHash(mode === 'games' ? '#games' : location.pathname + location.search);
}
$('tab-tools')?.addEventListener('click', () => switchMode('tools'));
$('tab-games')?.addEventListener('click', () => switchMode('games'));
$('mode-bar')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const next = mode === 'tools' ? 'games' : 'tools';
    switchMode(next);
    $(next === 'games' ? 'tab-games' : 'tab-tools')?.focus();
  }
});

function setPrivate(list, fromLink) {
  const ids = new Set(pub.map((t) => t.id));
  const keep = selected >= 0 ? tools[selected]?.id : location.hash.slice(1);
  priv = (Array.isArray(list) ? list : []).filter((t) => t && t.id && t.name && !ids.has(t.id)).map((t) => ({ ...t, type: t.type === '網頁' ? '網頁' : '下載', private: true }));
  const open = priv.length > 0;
  $('lock').classList.toggle('open', open);
  $('lock').querySelector('use').setAttribute('href', open ? '#k-unlock' : '#k-lock');
  if (!pub.length) return;
  const hitPriv = priv.some((t) => t.id === keep);
  if (mode === 'games' && !(fromLink && hitPriv)) { updateModeUI(); loadMissingFonts(); return; }
  if (fromLink && hitPriv) mode = 'tools';
  tools = [...pub, ...priv];
  updateModeUI();
  drawCount();
  drawRack();
  const i = tools.findIndex((t) => t.id === keep);
  select(i, false);
  // 網址指定的是私人軟體時，手機和公開工具一樣直接打開說明牌
  if (i >= 0 && fromLink && phone.matches) openSheet();
  loadMissingFonts();
}
async function loadPrivate() {
  const { status, data } = await privateApi('list');
  if (status === 200) setPrivate(data.tools, selected < 0);
  else if (status === 401) remember(false);
}
const ERRORS = { 0: '連不上網站，請檢查網路後再試', 401: '密碼不對，請再試一次', 429: '打錯太多次了，請 10 分鐘後再試', 503: '私人下載還沒設定好' };
function showDialog() {
  const open = priv.length > 0;
  $('unlock-ask').hidden = open;
  $('unlock-done').hidden = !open;
  $('unlock-ok').textContent = open ? '鎖上' : '解鎖';
  $('unlock-cancel').textContent = open ? '關閉' : '取消';
  $('unlock-err').textContent = '';
  $('unlock-pw').value = '';
  $('unlock-ok').disabled = false;
  dialog.showModal();
  if (!open) $('unlock-pw').focus();
}
$('lock').onclick = showDialog;
$('unlock-cancel').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // 點視窗外面關閉
$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('unlock-ok');
  if (btn.disabled) return;
  if (priv.length) { // 已解鎖：鎖上
    btn.disabled = true;
    await privateApi('logout', {});
    remember(false);
    setPrivate([]);
    dialog.close();
    return;
  }
  const password = $('unlock-pw').value;
  if (!password) { $('unlock-err').textContent = '請輸入密碼'; $('unlock-pw').focus(); return; }
  btn.disabled = true;
  btn.textContent = '確認中…';
  const { status, data } = await privateApi('login', { password });
  btn.disabled = false;
  btn.textContent = '解鎖';
  if (status === 200) {
    remember(true);
    setPrivate(data.tools);
    dialog.close();
    if (!priv.length) { $('unlock-err').textContent = ''; }
    return;
  }
  $('unlock-err').textContent = ERRORS[status] || '出了點問題，請稍後再試';
  $('unlock-pw').select();
});

async function getJson(path) {
  try { const r = await fetch(path); return r.ok ? await r.json() : {}; } catch { return {}; }
}
function redraw(keepId) {
  drawCount();
  drawRack();
  const i = tools.findIndex((t) => t.id === keepId);
  select(i, i >= 0); // 網址沒有指定工具時，先顯示介紹
}
async function start() {
  // 所有清單同時讀，不用一個等一個
  const releasesReady = getJson('releases.json'), liveReady = getJson('/api/live');
  const gamesReady = fetch('games.txt').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  let parsedTools = [];
  try {
    const res = await fetch('tools.txt');
    if (!res.ok) throw new Error(String(res.status));
    parsedTools = parseTools(await res.text());
    if (!parsedTools.length) throw new Error('empty');
  } catch {
    const box = el('div', 'error', '工具清單讀不到，請檢查網路後再試一次。');
    const retry = el('button', '', '重新讀取');
    retry.onclick = start;
    box.append(el('br'), retry);
    $('rack').replaceChildren(box);
    $('panel').hidden = true;
    return;
  }
  $('panel').hidden = false;
  const [releases, gamesText] = await Promise.all([releasesReady, gamesReady]);
  games = parseTools(gamesText);
  // 「檔案」放在私人空間、但已經公開的軟體，直接從那裡下載
  pub = parsedTools.map((t) => mergeTool(t.file && !t.url ? { ...t, url: fileUrl(t.file) } : t, t.release && releases[t.release]));
  const hash = location.hash.slice(1);
  const startInGames = games.length > 0 && (hash === 'games' || games.some((g) => g.id === hash));
  switchMode(startInGames ? 'games' : 'tools', { keepId: hash === 'games' ? '' : hash, updateHash: false });
  // 手機先在背後準備好說明牌和字型，第一次點開才不會卡
  if (phone.matches) setTimeout(() => { if (selected < 0 && tools[0]) fillPanel(tools[0]); document.fonts?.load?.('500 16px "NF Mono"'); document.body.classList.add('sheet-warm'); }, 600);
  loadMissingFonts();
  if (remembered()) loadPrivate();
  // 軟體自己的線上更新清單最後讀，讀到才更新畫面
  const live = await liveReady;
  if (Object.keys(live).length) {
    pub = pub.map((t) => mergeTool(t, live[t.id]));
    if (mode === 'tools') {
      tools = [...pub, ...priv];
      showPanel();
    }
    loadMissingFonts();
  }
}
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h === 'games' || games.some((g) => g.id === h)) switchMode('games', { keepId: h === 'games' ? '' : h, updateHash: false });
  else switchMode('tools', { keepId: h, updateHash: false });
});
start();
