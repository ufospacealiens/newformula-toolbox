// 遊戲區帳號（網頁端）：Google 登入、金幣、每日禮包、救濟金。伺服器在 lib/game-server.js
// 金幣一律以伺服器為準；這裡只負責顯示和動畫。
const $ = (id) => document.getElementById(id);
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const fmt = (n) => Math.max(0, Math.round(n)).toLocaleString('en-US');
const NEW_FLAG = 'nf-game-new', SOUND_FLAG = 'nf-game-sound';
let me = null, inGames = false, busy = false, reliefTried = false, welcomePending = false, lastCheck = 0;

// ---------- 音效：全部用程式即時合成，沒有音檔 ----------
const snd = { ctx: null, out: null, noise: null, on: true };
try { snd.on = localStorage.getItem(SOUND_FLAG) !== 'off'; } catch { /* 無痕模式 */ }
function ac() {
  if (!snd.ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { snd.ctx = new C(); } catch { return null; }
    snd.out = snd.ctx.createGain(); snd.out.gain.value = 0.55; snd.out.connect(snd.ctx.destination);
    const len = snd.ctx.sampleRate, b = snd.ctx.createBuffer(1, len, len), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    snd.noise = b;
  }
  if (snd.ctx.state === 'suspended') snd.ctx.resume().catch(() => {});
  return snd.ctx;
}
function env(g, t, vol, a, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(f, at, dur, o = {}) {
  if (!snd.on) return; const c = ac(); if (!c) return;
  const t = c.currentTime + at, osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  env(g, t, o.vol ?? 0.1, o.a ?? 0.005, dur);
  osc.connect(g); g.connect(snd.out); osc.start(t); osc.stop(t + dur + 0.05);
}
function hiss(at, dur, o = {}) {
  if (!snd.on) return; const c = ac(); if (!c) return;
  const t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = snd.noise; src.loop = true;
  f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t);
  if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
  f.Q.value = o.q ?? 1; env(g, t, o.vol ?? 0.2, o.a ?? 0.005, dur);
  src.connect(f); f.connect(g); g.connect(snd.out); src.start(t); src.stop(t + dur + 0.05);
}
const sfx = {
  coin(i) { const k = Math.pow(2, [0, 2, 4, 5, 7][i % 5] / 12); tone(1319 * k, 0, 0.07, { vol: 0.05 }); tone(1976 * k, 0.055, 0.2, { vol: 0.05 }); },
  shake(n) { hiss(0, 0.09, { f: 700 + n * 260, q: 3, vol: 0.3 }); hiss(0.1, 0.08, { f: 950 + n * 260, q: 3, vol: 0.24 }); tone(150 + n * 35, 0, 0.1, { type: 'triangle', vol: 0.2 }); },
  pop() { hiss(0, 0.3, { type: 'highpass', f: 1500, vol: 0.3 }); tone(540, 0, 0.22, { type: 'sine', vol: 0.35, to: 110 }); },
  sparkle() { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.06, 0.4, { type: 'triangle', vol: 0.09 })); },
  fanfare() {
    [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.75]].forEach(([f, t, d]) => { tone(f, t, d, { vol: 0.06 }); tone(f / 2, t, d, { type: 'triangle', vol: 0.12 }); });
    [523, 659, 784].forEach((f) => tone(f, 0.42, 0.95, { type: 'triangle', vol: 0.06 }));
  },
  wind() { hiss(0, 2.2, { type: 'lowpass', f: 450, fTo: 1400, q: 0.6, vol: 0.12, a: 0.7 }); },
  thud() { tone(150, 0, 0.35, { type: 'sine', vol: 0.55, to: 40 }); hiss(0, 0.25, { type: 'lowpass', f: 600, vol: 0.3 }); },
  ding() { tone(880, 0, 0.15, { type: 'triangle', vol: 0.12 }); tone(1319, 0.12, 0.4, { type: 'triangle', vol: 0.12 }); },
  tap() { tone(660, 0, 0.05, { type: 'triangle', vol: 0.08 }); },
  stamp() { tone(220, 0, 0.12, { type: 'triangle', vol: 0.2, to: 120 }); hiss(0, 0.06, { f: 800, vol: 0.15 }); },
};

// ---------- 小工具 ----------
const SVG = 'http://www.w3.org/2000/svg';
function coin(className = '') {
  const s = document.createElementNS(SVG, 'svg'), u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', '#coin');
  s.setAttribute('class', ('coin ' + className).trim());
  s.setAttribute('aria-hidden', 'true');
  s.append(u);
  return s;
}
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function anim(target, kf, o) {
  const opt = { fill: 'both', ...o };
  if (calm.matches) { opt.duration = Math.min(opt.duration || 300, 120); opt.delay = 0; }
  if (!target.animate) return Promise.resolve();
  return target.animate(kf, opt).finished.catch(() => {});
}
const wait = (ms) => new Promise((r) => setTimeout(r, calm.matches ? Math.min(ms, 80) : ms));
let toastTimer = 0;
function toast(text) {
  const t = $('game-toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
async function api(path, post) {
  try {
    const r = await fetch('/api/game/' + path, post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : { cache: 'no-store' });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch { return { status: 0, data: {} }; }
}

// ---------- 上方的帳號列 ----------
function setWallet(n) {
  $('wallet-num').textContent = fmt(n);
  $('wallet').setAttribute('aria-label', '我的金幣 ' + fmt(n));
}
function render() {
  const ready = Boolean(me?.ready);
  $('player').hidden = !ready; // 還沒設定好登入，就整條不顯示
  if (!ready) return;
  $('p-login').hidden = me.logged;
  $('p-me').hidden = !me.logged;
  if (!me.logged) return;
  if (!busy) setWallet(me.coins);
  const can = !me.gift.claimed;
  $('p-gift').classList.toggle('ready', can);
  $('p-dot').hidden = !can;
  $('p-avatar').textContent = [...me.name][0] || '玩';
  $('acct-name').textContent = me.name;
  $('sound-btn').textContent = snd.on ? '音效：開' : '音效：關';
  drawDays();
}
function drawDays() {
  const g = me.gift, full = g.claimed && g.pos === 0 && g.count > 0;
  $('gift-round').textContent = 'ROUND ' + (Math.floor((g.count - (g.claimed ? 1 : 0)) / 7) + 1);
  $('days').replaceChildren(...g.amounts.map((amount, i) => {
    const s = full || i < g.pos ? 'done' : i === g.pos ? (g.claimed ? 'tomorrow' : 'today') : 'later';
    const li = el('li', 'day ' + s + (i === 6 ? ' big' : ''));
    li.dataset.i = i;
    if (s === 'today') li.append(el('b', 'badge', '今天'));
    if (s === 'tomorrow') li.append(el('b', 'badge', '明天'));
    const coins = el('span', 'd-coins');
    for (let k = 0; k < (i === 6 ? 3 : 1); k++) coins.append(coin());
    li.append(el('span', 'd-label', `第 ${i + 1} 天${i === 6 ? '・大禮包' : ''}`), coins, el('span', 'd-amt', fmt(amount)));
    if (s === 'done') li.append(el('span', 'stamp', '已領'));
    return li;
  }));
  const btn = $('claim');
  btn.disabled = g.claimed;
  btn.textContent = g.claimed ? '今天領過了，明天再來' : `領取第 ${g.pos + 1} 天禮包　+${fmt(g.amounts[g.pos])}`;
}

// ---------- 領取畫面（禮盒、空投補給箱、金幣飛進錢包） ----------
const BOX = (kind) => `<div class="gbob" id="holder"><div class="box ${kind}" id="thing"><div class="box-body" id="thing-body"></div><div class="box-lid" id="thing-lid"><span class="bow"></span></div></div></div>`;
const CHUTE = 'M8 56 C 18 4, 142 4, 152 56 Q 134 46 116 56 Q 98 46 80 56 Q 62 46 44 56 Q 26 46 8 56 Z';
const CRATE = () => `<div class="drop" id="drop"><svg class="chute" id="chute" viewBox="0 0 160 100" aria-hidden="true">
  <defs><clipPath id="chute-clip"><path d="${CHUTE}"/></clipPath></defs>
  <path d="M10 56 L36 100 M44 56 L58 100 M80 56 L80 100 M116 56 L102 100 M150 56 L124 100" stroke="#25231F" stroke-width="2.5"/>
  <g clip-path="url(#chute-clip)"><rect width="160" height="60" fill="#C93A10"/><rect x="44" width="36" height="60" fill="#FFFDF6"/><rect x="116" width="36" height="60" fill="#FFFDF6"/></g>
  <path d="${CHUTE}" fill="none" stroke="#25231F" stroke-width="4" stroke-linejoin="round"/>
</svg><div class="crate" id="thing"><div class="crate-lid" id="thing-lid"></div><div class="crate-body" id="thing-body"><span>救濟金</span></div></div></div>`;

let stageAction = null, stageNum = 0;
function setStageNum(n) { stageNum = n; $('stage-num').textContent = fmt(n); }
function bumpStage() { const w = $('stage-wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }

function flash() {
  const f = el('div', 'flash'); $('zone').append(f);
  anim(f, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(3)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).then(() => f.remove());
}
function dust() {
  [-1, 1].forEach((d) => {
    const p = el('div', 'puff'); $('zone').append(p);
    anim(p, [{ transform: 'translateX(0) scale(.4)', opacity: 0.9 }, { transform: `translateX(${d * 80}px) scale(1.7)`, opacity: 0 }], { duration: 650, easing: 'ease-out' }).then(() => p.remove());
  });
}
function confetti() {
  if (calm.matches) return;
  const colors = ['#F2B807', '#6B4FA3', '#C93A10', '#2F5D8C', '#FFFDF6', '#B9C98C'];
  for (let i = 0; i < 46; i++) {
    const c = el('div', 'confetti');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    $('stage').append(c);
    const drift = (Math.random() - 0.5) * 160, spin = (Math.random() - 0.5) * 1080;
    anim(c, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${drift}px, 112vh) rotate(${spin}deg)` }],
      { duration: 1800 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(.3,.4,.6,1)' }).then(() => c.remove());
  }
}
function flyCoins(n, from, to) {
  return new Promise((res) => {
    const z = $('zone').getBoundingClientRect(), fx = z.left + z.width / 2 - 13, fy = z.top + z.height * 0.62 - 13;
    const t = $('stage-coin').getBoundingClientRect(), tx = t.left + t.width / 2 - 13, ty = t.top + t.height / 2 - 13;
    if (calm.matches) n = Math.min(n, 5);
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const c = el('div', 'fly');
      const s = coin('spin');
      s.style.animationDelay = -(Math.random() * 0.55).toFixed(2) + 's';
      c.append(s);
      c.style.left = fx + 'px'; c.style.top = fy + 'px';
      $('stage').append(c);
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 90;
      const bx = Math.cos(a) * r, by = Math.sin(a) * r * 0.7 - 50;
      anim(c, [
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: `translate(${bx}px,${by}px) scale(1.15)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${bx}px,${by + 12}px) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx - fx}px,${ty - fy}px) scale(.6)`, opacity: 1 },
      ], { duration: 1050, delay: i * 48, easing: 'cubic-bezier(.45,0,.3,1)' }).then(() => {
        c.remove(); arrived++;
        sfx.coin(arrived); bumpStage();
        setStageNum(arrived === n ? to : from + (to - from) * arrived / n);
        if (arrived === n) res();
      });
    }
  });
}
async function land() {
  sfx.wind();
  await anim($('drop'), [
    { transform: 'translateY(-105vh) rotate(-7deg)' },
    { transform: 'translateY(-62vh) rotate(6deg)', offset: 0.3 },
    { transform: 'translateY(-26vh) rotate(-5deg)', offset: 0.6 },
    { transform: 'translateY(-6vh) rotate(3deg)', offset: 0.85 },
    { transform: 'translateY(0) rotate(0)' },
  ], { duration: 2300, easing: 'cubic-bezier(.3,.5,.5,1)' });
  sfx.thud(); dust();
  anim($('stage-in'), [{ transform: 'translateY(0)' }, { transform: 'translateY(7px)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 280 });
  anim($('thing'), [{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.86)', offset: 0.3 }, { transform: 'scale(.96,1.05)', offset: 0.65 }, { transform: 'scale(1,1)' }], { duration: 450 });
  await anim($('chute'), [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(-60px,-50px) rotate(-20deg)', opacity: 0 }], { duration: 700, delay: 150, fill: 'forwards', easing: 'ease-in' });
}

// o: kind（gift / gold / welcome / relief）、title、sub、openLabel、landTitle、landSub、doneSub、from、claim()→{ amount, to }
function showStage(o) {
  return new Promise((done) => {
    busy = true;
    const stage = $('stage'), sTitle = $('stage-title'), sAmt = $('stage-amt'), sSub = $('stage-sub'), sBtn = $('stage-btn');
    setStageNum(o.from);
    $('rays').classList.remove('on');
    sAmt.hidden = true;
    sTitle.textContent = o.title;
    sSub.textContent = o.sub || '';
    $('prize').innerHTML = o.kind === 'relief' ? CRATE() : BOX(o.kind);
    sBtn.hidden = true;
    stageAction = null;
    stage.showModal();
    const finish = (label) => {
      sBtn.hidden = false; sBtn.textContent = label; sBtn.focus({ preventScroll: true });
      stageAction = () => { stageAction = null; stage.close(); $('prize').replaceChildren(); busy = false; done(); };
    };
    const ready = () => {
      if (o.landTitle) { sTitle.textContent = o.landTitle; sSub.textContent = o.landSub || ''; }
      sBtn.hidden = false; sBtn.textContent = o.openLabel; sBtn.dataset.role = 'open';
      sBtn.focus({ preventScroll: true });
      stageAction = open;
    };
    if (o.kind === 'relief') land().then(ready); else ready();

    async function open() {
      stageAction = null; sBtn.hidden = true; sBtn.dataset.role = ''; ac(); sfx.tap();
      const claiming = o.claim();
      $('holder')?.classList.remove('gbob');
      const thing = $('thing');
      for (let n = 0; n < 3; n++) {
        sfx.shake(n);
        const d = 6 + n * 3;
        await anim(thing, [
          { transform: 'rotate(0) scale(1)' }, { transform: `rotate(${-d}deg) scale(${1 + n * 0.03})` },
          { transform: `rotate(${d}deg) scale(${1 + n * 0.05})` }, { transform: `rotate(${-d / 2}deg) scale(${1 + n * 0.03})` },
          { transform: 'rotate(0) scale(1)' },
        ], { duration: 280, easing: 'ease-in-out' });
        await wait(110);
      }
      let got;
      try { got = await claiming; } catch {
        sSub.textContent = '連不上網站，等一下再試一次';
        finish('關閉');
        return;
      }
      sfx.pop(); flash();
      anim($('thing-lid'), [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: 'translate(40px,-150px) rotate(30deg)', opacity: 1, offset: 0.6 },
        { transform: 'translate(70px,-230px) rotate(50deg)', opacity: 0 },
      ], { duration: 720, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      anim($('thing-body'), [{ transform: 'scale(1,1)' }, { transform: 'scale(1.14,.84)', offset: 0.3 }, { transform: 'scale(.95,1.06)', offset: 0.65 }, { transform: 'scale(1,1)' }], { duration: 420 });
      $('rays').classList.add('on');
      sAmt.textContent = '+' + fmt(got.amount);
      sAmt.hidden = false;
      anim(sAmt, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 460 });
      if (o.kind === 'gold' || o.kind === 'welcome') { sfx.fanfare(); confetti(); } else sfx.sparkle();
      await flyCoins(o.kind === 'gold' ? 32 : o.kind === 'welcome' ? 28 : 16, o.from, got.to);
      sfx.ding();
      if (o.doneSub) sSub.textContent = o.doneSub;
      finish('收下');
    }
  });
}

function stampCell(i) {
  const s = document.querySelector(`#days .day[data-i="${i}"] .stamp`);
  if (!s) return;
  sfx.stamp();
  anim(s, [{ transform: 'rotate(-14deg) scale(2.2)', opacity: 0 }, { transform: 'rotate(-14deg) scale(.92)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-14deg) scale(1)', opacity: 1 }], { duration: 320, easing: 'ease-in' });
}

// ---------- 動作 ----------
async function welcome() {
  welcomePending = false;
  await showStage({
    kind: 'welcome', title: '歡迎來到新配方遊戲區', sub: '新玩家見面禮', openLabel: '打開見面禮', from: 0,
    doneSub: '這是你的起始金幣，之後每個遊戲都用它',
    claim: async () => ({ amount: me.coins, to: me.coins }),
  });
  render();
  if (!me.gift.claimed) toast('今天的每日禮包也可以領了');
}

function maybeRelief() {
  if (!inGames || busy || reliefTried || !me?.logged || !me.relief.available) return;
  reliefTried = true;
  const from = me.coins;
  showStage({
    kind: 'relief', from, title: '有東西從天上掉下來了…', openLabel: '打開補給箱',
    landTitle: '金幣用完了嗎？', landSub: `送你救濟金，幫你補到 ${fmt(me.relief.to)} 金幣`,
    doneSub: '每天可以領一次，別灰心，再來一局！',
    claim: async () => {
      const { status, data } = await api('relief', true);
      if (status !== 200) { if (data.name) me = { ...me, ...data }; throw new Error(String(status)); }
      me = { ...me, ...data };
      return { amount: data.amount, to: data.coins };
    },
  }).then(render);
}

async function claimGift() {
  if (busy || !me?.logged || me.gift.claimed) return;
  ac();
  const btn = $('claim'), pos = me.gift.pos, from = me.coins;
  btn.disabled = true;
  btn.textContent = '打開中…';
  const { status, data } = await api('gift', true);
  if (status !== 200) {
    if (data.name) me = { ...me, ...data };
    if (status === 401) await refresh();
    render();
    toast(status === 409 ? '今天已經領過了' : status === 401 ? '登入過期了，請重新登入' : '連不上網站，請稍後再試');
    return;
  }
  me = { ...me, ...data };
  $('gift-dlg').close();
  const amounts = me.gift.amounts;
  await showStage({
    kind: pos === 6 ? 'gold' : 'gift', from, openLabel: '打開禮包',
    title: pos === 6 ? '第 7 天大禮包！' : `第 ${pos + 1} 天禮包`,
    sub: pos === 6 ? '7 天全部領完了' : '',
    doneSub: pos === 6 ? '明天開始新的一輪' : `明天回來可以領第 ${pos + 2} 天：${fmt(amounts[pos + 1])} 金幣`,
    claim: async () => ({ amount: data.amount, to: data.coins }),
  });
  render();
  $('gift-dlg').showModal();
  stampCell(pos);
}

async function refresh() {
  const { status, data } = await api('me');
  if (status !== 200) return;
  const before = me;
  me = data;
  // 從遊戲回來時剛好輸光，再給一次自動出現的機會
  if (me.logged && me.relief.available && !(before?.relief?.available)) reliefTried = false;
  render();
}

function wire() {
  const dlgs = [$('gift-dlg'), $('acct-dlg')];
  for (const d of dlgs) d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // 點視窗外面關閉
  $('gift-x').onclick = () => $('gift-dlg').close();
  $('acct-x').onclick = () => $('acct-dlg').close();
  $('p-gift').onclick = () => { ac(); if (me?.logged) { drawDays(); $('gift-dlg').showModal(); } };
  $('p-avatar').onclick = () => $('acct-dlg').showModal();
  $('claim').onclick = claimGift;
  $('stage-btn').onclick = () => stageAction?.();
  $('zone').onclick = () => { if ($('stage-btn').dataset.role === 'open') stageAction?.(); };
  $('stage').addEventListener('cancel', (e) => e.preventDefault()); // 動畫中按 Esc 不關
  $('sound-btn').onclick = () => {
    snd.on = !snd.on;
    try { localStorage.setItem(SOUND_FLAG, snd.on ? 'on' : 'off'); } catch { /* 無痕模式 */ }
    if (snd.on) { ac(); sfx.tap(); }
    render();
  };
  $('logout-btn').onclick = async () => {
    $('logout-btn').disabled = true;
    await api('logout', true);
    $('logout-btn').disabled = false;
    me = { ready: true, logged: false };
    $('acct-dlg').close();
    render();
    toast('已經登出');
  };
  // 從別的分頁（例如玩完吹牛骰子）回來時，更新金幣
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !me?.logged || busy || Date.now() - lastCheck < 5000) return;
    lastCheck = Date.now();
    refresh().then(() => { if (inGames) maybeRelief(); });
  });
}

// 切到遊戲區時呼叫
export function accountMode(on) {
  inGames = on;
  if (!on || !me?.logged || busy) return;
  if (welcomePending) welcome();
  else maybeRelief();
}

export async function initAccount() {
  if (!$('player')) return;
  wire();
  try { welcomePending = sessionStorage.getItem(NEW_FLAG) === '1'; sessionStorage.removeItem(NEW_FLAG); } catch { /* 無痕模式 */ }
  const { status, data } = await api('me');
  me = status === 200 ? data : { ready: false };
  lastCheck = Date.now();
  if (!me.logged) welcomePending = false;
  render();
  accountMode(inGames);
}
