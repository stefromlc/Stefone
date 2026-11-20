import { store } from './store.js';
import { esc, h, toast } from './util.js';
import CONFIG from './config.js';
import { root, enter } from './main.js';

function shell(inner) {
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning! ☀️' : hr < 18 ? 'Good afternoon! 🌤️' : 'Good evening! 🌙';
  const floaters = ['⭐', '🚀', '📚', '🎨', '🦉', '✏️', '🌈', '🧩', '🎵', '🔬'].map((e, i) => `<span class="floater" style="left:${(i * 10.3 + 3) % 96}%;animation-delay:${i * 1.7}s;animation-duration:${14 + (i % 4) * 4}s">${e}</span>`).join('');
  root().innerHTML = `<div class="splash">${floaters}<div class="splash-inner">
    <div class="login-clock">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <div class="logo">🦉 <span>${esc(CONFIG.appName)}</span></div>
    <div class="login-hello">${hello}</div>
    <div id="login-inner">${inner}</div></div></div>`;
  return document.getElementById('login-inner');
}

export async function showLogin() {
  const roster = await store.roster().catch(() => []);
  const kids = roster.filter(p => p.role === 'child');
  const grown = roster.filter(p => p.role !== 'child');
  if (!roster.length) return emailForm(true);
  const el = shell(`
    <p style="font-size:1.3em;font-weight:800;margin:6px 0 0">Who's learning today?</p>
    <div class="tiles" id="kid-tiles"></div>
    <p class="muted" style="font-weight:800;margin-bottom:0">Grown-ups</p>
    <div class="tiles small" id="grown-tiles"></div>
    ${store.mode === 'cloud' ? '<button class="btn btn-ghost" id="email-login">Sign in with email instead</button>' : ''}`);
  const tile = p => h('button', { class: 'tile', onclick: () => (p.role === 'child' ? pinScreen(p) : passwordScreen(p)) },
    h('div', { class: 'av', style: { background: (p.color || '#ddd') + '33' } }, p.avatar || '🙂'), h('b', {}, p.name));
  kids.forEach(k => el.querySelector('#kid-tiles').append(tile(k)));
  grown.forEach(g => el.querySelector('#grown-tiles').append(tile(g)));
  if (!kids.length) el.querySelector('#kid-tiles').innerHTML = '<p class="muted">No children added yet — Dad can add them in Settings → Family.</p>';
  el.querySelector('#email-login')?.addEventListener('click', () => emailForm(false));
}

async function doLogin(args, onFail) {
  try {
    const me = await store.login(args);
    await enter(me);
  } catch (e) { onFail(e); }
}

function pinScreen(kid) {
  let pin = '';
  const el = shell(`
    <div class="tile" style="margin:18px auto 0;cursor:default"><div class="av" style="background:${esc(kid.color || '#ddd')}33">${esc(kid.avatar || '🙂')}</div><b>${esc(kid.name)}</b></div>
    <p style="font-weight:800;font-size:1.15em;margin:14px 0 0">Type your secret PIN</p>
    <div class="pindots" id="dots"></div>
    <div class="pinpad" id="pad"></div>
    <div class="row" style="justify-content:center"><button class="btn" id="back">⬅ Back</button></div>`);
  const dots = el.querySelector('#dots'), pad = el.querySelector('#pad');
  const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
  const submit = () => {
    if (pin.length < 4) { toast('Your PIN has at least 4 numbers', 'warn'); return; }
    const p = pin;
    doLogin({ id: kid.id, email: kid.email, role: 'child', secret: p }, e => {
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      toast(e.message, 'error'); pin = ''; draw();
    });
  };
  const press = k => {
    if (k === '⌫') pin = pin.slice(0, -1);
    else if (k === '✓') return submit();
    else if (pin.length < 8) pin += k;
    draw();
  };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach(k => pad.append(h('button', { onclick: () => press(k), style: k === '✓' ? { background: '#8ce99a' } : null }, k)));
  const onKey = e => {
    if (!document.body.contains(pad)) return document.removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') press('✓');
  };
  document.addEventListener('keydown', onKey);
  el.querySelector('#back').onclick = () => { document.removeEventListener('keydown', onKey); showLogin(); };
  draw();
}

function passwordScreen(p) {
  const el = shell(`<div class="login-box">
    <div class="row" style="margin-bottom:14px"><div style="font-size:40px">${esc(p.avatar || '🙂')}</div><div><h2 style="margin:0">Hi ${esc(p.name)}</h2><span class="muted small">${p.role === 'admin' ? 'Administrator' : 'Parent'}</span></div></div>
    <form id="f"><label class="field"><span>Password</span><input class="input" type="password" id="pw" autocomplete="current-password" required></label>
    <div class="row"><button type="button" class="btn" id="back">Back</button><span class="spacer"></span><button class="btn btn-primary">Sign in</button></div></form></div>`);
  el.querySelector('#back').onclick = showLogin;
  el.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-primary'); btn.disabled = true;
    doLogin({ id: p.id, email: p.email, role: p.role, secret: el.querySelector('#pw').value }, err => { btn.disabled = false; toast(err.message, 'error'); });
  };
  setTimeout(() => el.querySelector('#pw').focus(), 50);
}

function emailForm(firstTime) {
  const el = shell(`<div class="login-box">
    <h2>Sign in</h2>
    ${firstTime ? '<p class="muted small">First time on this device? Sign in once and everyone\'s picture will appear here next time. Kids: use your email and PIN.</p>' : ''}
    <form id="f"><label class="field"><span>Email</span><input class="input" type="email" id="em" autocomplete="username" required></label>
    <label class="field"><span>Password or PIN</span><input class="input" type="password" id="pw" autocomplete="current-password" required></label>
    <div class="row">${firstTime ? '' : '<button type="button" class="btn" id="back">Back</button>'}<span class="spacer"></span><button class="btn btn-primary">Sign in</button></div></form></div>`);
  el.querySelector('#back')?.addEventListener('click', showLogin);
  el.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-primary'); btn.disabled = true;
    doLogin({ email: el.querySelector('#em').value.trim(), secret: el.querySelector('#pw').value }, err => { btn.disabled = false; toast(err.message, 'error'); });
  };
}
