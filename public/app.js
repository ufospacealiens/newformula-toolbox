import { parseTools, mergeTool, formatSize } from './tools-core.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const phone = window.matchMedia('(max-width: 720px)');
const MAX_BALLS = 8, MIN_SLOTS = 8, NEW_DAYS = 14;
let tools = [], selected = -1, lastFocus = null; // selected 是 -1：沒有選工具，右邊顯示介紹

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
const touchOnly = window.matchMedia('(hover: none)');
// PC 下載（橘紅）和網頁版（藍）的差別：圖示、文字、顏色都不同
const KIND = {
  '下載': { key: 'download', tag: 'PC 下載', long: 'PC 版', go: '下載 PC 版' },
  '網頁': { key: 'web', tag: '網頁版', long: '網頁版', go: '開啟網頁版' },
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
  $('count').setAttribute('aria-label', '已收納 ' + tools.length + ' 件工具');
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
    if (t.icon) { const img = el('img'); img.src = 'icons/' + t.icon; img.alt = ''; img.width = 72; img.height = 72; b.append(img); }
    b.append(setName(el('span', 'slot-name'), t.name));
    const strip = el('span', 'slot-kind');
    strip.append(ballSvg('k-' + kind.key), el('span', '', kind.tag));
    b.append(strip);
    if (t.date && isNew(t.date)) b.append(el('span', 'slot-new', 'NEW'));
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
  if (selected < 0) return;
  const t = tools[selected], panel = $('panel');
  $('p-icon').hidden = !t.icon;
  if (t.icon) $('p-icon').src = 'icons/' + t.icon;
  const kind = kindOf(t);
  panel.classList.toggle('kind-web', kind.key === 'web');
  panel.classList.toggle('kind-download', kind.key === 'download');
  $('p-type').replaceChildren(ballSvg('k-' + kind.key), el('span', '', kind.long));
  setName($('p-name'), t.name);
  $('p-desc').textContent = t.desc || '';
  const spec = $('spec');
  spec.replaceChildren();
  [['適用', t.platform, ''], ['版本', t.version, 'm'], ['大小', formatSize(t.size), 'm'], ['更新日期', t.date && t.date.replaceAll('-', '/'), 'm']].forEach(([k, v, c]) => {
    if (!v) return;
    const row = el('div');
    row.append(el('dt', '', k), el('dd', c, v));
    spec.append(row);
  });
  const notes = t.notes || [];
  $('notes').hidden = !notes.length;
  $('notes').open = false;
  $('notes-list').replaceChildren(...notes.map((n) => el('li', '', n)));
  const go = $('go');
  if (t.url) {
    go.href = t.url;
    go.replaceChildren(ballSvg('k-' + kind.key), el('span', '', kind.go));
    if (t.type === '網頁') { go.target = '_blank'; go.rel = 'noopener'; } else { go.removeAttribute('target'); go.rel = 'noopener'; }
  } else {
    go.removeAttribute('href');
    go.removeAttribute('target');
    go.textContent = '還沒開放下載';
  }
  // 用手機或平板看 PC 軟體時，提醒不能安裝
  $('pc-note').hidden = !(kind.key === 'download' && (phone.matches || touchOnly.matches));
  panel.classList.remove('swap');
  void panel.offsetWidth;
  panel.classList.add('swap');
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
  setHash(location.pathname + location.search);
}
function setHash(url) {
  try { history.replaceState(null, '', url); } catch { /* 預覽環境不支援時略過 */ }
}

function openSheet() {
  lastFocus = document.activeElement;
  document.body.classList.add('sheet-open');
  $('veil').hidden = false;
  [$('top'), $('rack'), $('intro')].forEach((e) => { e.inert = true; });
  $('panel').setAttribute('role', 'dialog');
  $('panel').setAttribute('aria-modal', 'true');
  $('panel').scrollTop = 0;
  $('close').focus({ preventScroll: true });
}
function closeSheet() {
  if (!document.body.classList.contains('sheet-open')) return;
  document.body.classList.remove('sheet-open');
  $('veil').hidden = true;
  [$('top'), $('rack'), $('intro')].forEach((e) => { e.inert = false; });
  $('panel').removeAttribute('role');
  $('panel').removeAttribute('aria-modal');
  lastFocus?.focus?.({ preventScroll: true });
  deselect();
}
$('close').onclick = closeSheet;
$('veil').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); deselect(); } });
phone.addEventListener('change', () => { closeSheet(); if (phone.matches) deselect(); else showPanel(); });
$('home').onclick = (e) => { e.preventDefault(); closeSheet(); deselect(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

// 點空白處取消選取；拖曳選字、捲動、點捲軸都不算
let down = null;
const isBlank = (e) => e.target instanceof Element && !e.target.closest('.slot, .panel, button, a, summary') && e.clientX < document.documentElement.clientWidth;
document.addEventListener('pointerdown', (e) => { down = e.button === 0 && isBlank(e) ? { x: e.clientX, y: e.clientY } : null; });
document.addEventListener('pointercancel', () => { down = null; });
document.addEventListener('pointerup', (e) => {
  if (down && !phone.matches && isBlank(e) && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) deselect();
  down = null;
});

async function getJson(path) {
  try { const r = await fetch(path, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
function redraw(keepId) {
  drawCount();
  drawRack();
  const i = tools.findIndex((t) => t.id === keepId);
  select(i, i >= 0); // 網址沒有指定工具時，先顯示介紹
}
async function start() {
  try {
    const res = await fetch('tools.txt', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    tools = parseTools(await res.text());
    if (!tools.length) throw new Error('empty');
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
  const releases = await getJson('releases.json');
  tools = tools.map((t) => mergeTool(t, t.release && releases[t.release]));
  redraw(location.hash.slice(1));
  // 軟體自己的線上更新清單最後讀，讀到才更新畫面
  const live = await getJson('/api/live');
  if (Object.keys(live).length) {
    tools = tools.map((t) => mergeTool(t, live[t.id]));
    showPanel();
  }
}
start();
