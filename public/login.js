// Google 登入完回到這裡：網址後面帶著身分證明（#id_token=…），交給伺服器確認後回到遊戲區
const p = new URLSearchParams(location.hash.slice(1));
try { history.replaceState(null, '', location.pathname); } catch { /* 把身分證明從網址拿掉 */ }
const msg = document.getElementById('msg'), back = document.getElementById('back');
const show = (text) => { msg.textContent = text; back.hidden = false; };

async function run() {
  if (p.get('error')) return show(p.get('error') === 'access_denied' ? '你取消了登入。' : '登入沒有成功，請回到遊戲區再試一次。');
  if (!p.get('id_token')) return show('登入沒有成功，請回到遊戲區再試一次。');
  try {
    const r = await fetch('/api/game/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: p.get('id_token'), state: p.get('state') }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return show(r.status === 400 ? '登入等太久了，請回到遊戲區再按一次登入。' : '登入沒有成功，請回到遊戲區再試一次。');
    try { if (d.isNew) sessionStorage.setItem('nf-game-new', '1'); } catch { /* 無痕模式 */ }
    location.replace('/#games');
  } catch {
    show('連不上網站，請檢查網路後再試一次。');
  }
}
run();
