// First-run wizard: storage → Dad's admin account → family → AI key.
import { store, LS } from './store.js';
import { esc, h, toast } from './util.js';
import { root, enter } from './main.js';
import { profileForm } from './profileform.js';
import { complete } from './ai.js';
import CONFIG from './config.js';

function frame(step, total, inner) {
  root().innerHTML = `<div class="splash"><div class="splash-inner">
    <div class="logo">🦉 <span>${esc(CONFIG.appName)}</span></div><p class="muted" style="margin-top:0">Home-school learning platform · first-time setup</p>
    <div class="setup-box"><div class="steps">${Array.from({ length: total }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div><div id="sx"></div></div></div></div>`;
  const el = document.getElementById('sx');
  if (typeof inner === 'string') el.innerHTML = inner; else el.append(inner);
  return el;
}

export function showSetup() { stepWelcome(); }

function stepWelcome() {
  const cloud = store.mode === 'cloud';
  const el = frame(0, 4, `
    <h2>👋 Welcome!</h2>
    <p>This sets up your family's learning space. Dad's account becomes the <b>administrator</b> (the only one who can change settings and AI models). Then you'll add Mum and the children.</p>
    <div class="card" style="margin:14px 0">
      ${cloud ? `<h3>☁️ Cloud sync is connected</h3><p class="small muted">Everyone can sign in from any device and see the same progress. Data is stored in your own Supabase project.</p>`
      : `<h3>💻 Saving on this device</h3><p class="small muted">Everything is stored in this browser. That's perfect if the kids use one family computer. To let Mum and Dad check progress from their own phones, connect free cloud sync (Supabase) — see README.md, or paste the details below.</p>
         <details><summary style="cursor:pointer;font-weight:800">Connect cloud sync for this device</summary>
         <label class="field" style="margin-top:10px"><span>Supabase project URL</span><input class="input" id="sbu" placeholder="https://xxxx.supabase.co"></label>
         <label class="field"><span>Supabase anon (public) key</span><input class="input" id="sbk" placeholder="eyJ..."></label>
         <p class="small muted">Tip: put these in <code>js/config.js</code> instead so every device connects automatically.</p>
         <button class="btn" id="sbsave">Connect &amp; reload</button></details>`}
    </div>
    <div class="row"><span class="spacer"></span><button class="btn btn-primary btn-lg" id="next">Let's go →</button></div>`);
  el.querySelector('#sbsave')?.addEventListener('click', () => {
    const u = el.querySelector('#sbu').value.trim(), k = el.querySelector('#sbk').value.trim();
    if (!u || !k) return toast('Paste both the URL and the anon key', 'warn');
    LS.set('supabaseUrl', u); LS.set('supabaseKey', k); location.reload();
  });
  el.querySelector('#next').onclick = stepAdmin;
}

function stepAdmin() {
  const form = profileForm({ name: 'Dad' }, { role: 'admin', isNew: true });
  const wrap = h('div', {},
    h('h2', {}, '🧔 Dad\'s account (administrator)'),
    h('p', { class: 'muted' }, 'You\'ll use this to manage settings, AI models, the API key and the family.'),
    form.el);
  const btn = h('button', { class: 'btn btn-primary btn-lg' }, 'Create my account →');
  wrap.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: stepWelcome }, '← Back'), h('span', { class: 'spacer' }), btn));
  frame(1, 4, wrap);
  btn.onclick = async () => {
    try {
      const p = form.read();
      btn.disabled = true; btn.textContent = 'Creating…';
      await store.setupAdmin(p);
      toast('Account created', 'good');
      stepFamily();
    } catch (e) { btn.disabled = false; btn.textContent = 'Create my account →'; toast(e.message, 'error'); }
  };
}

function stepFamily() {
  const forms = [];
  const list = h('div');
  const add = (p, role) => { const f = profileForm(p, { role, isNew: true }); forms.push(f); list.append(f.el); };
  add({ name: 'Mum' }, 'parent');
  add({}, 'child'); add({}, 'child');
  const wrap = h('div', {},
    h('h2', {}, '👨‍👩‍👧‍👦 Add the family'),
    h('p', { class: 'muted' }, 'Mum gets a parent account (track progress, create and edit lessons). Children log in by tapping their picture and typing a PIN. You can change all of this later in Settings → Family.'),
    list,
    h('button', { class: 'btn btn-sm', onclick: () => add({}, 'child') }, '+ Add another child'));
  const btn = h('button', { class: 'btn btn-primary btn-lg' }, 'Save family →');
  wrap.append(h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn btn-ghost', onclick: stepAI }, 'Skip for now'), h('span', { class: 'spacer' }), btn));
  frame(2, 4, wrap);
  btn.onclick = async () => {
    let people;
    try {
      // Rows left completely blank are ignored.
      people = forms.map(f => { try { return [f, f.read()]; } catch (e) { const nm = f.el.querySelector('[name=name]').value.trim(); if (!nm) return null; throw e; } }).filter(Boolean);
    } catch (e) { return toast(e.message, 'error'); }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      for (const [f, p] of people) {
        await store.createUser(p);
        forms.splice(forms.indexOf(f), 1); f.el.remove(); // so a retry after an error doesn't duplicate
      }
      await store.profiles();
      toast('Family saved', 'good');
      stepAI();
    } catch (e) { btn.disabled = false; btn.textContent = 'Save family →'; toast(e.message, 'error'); }
  };
}

function stepAI() {
  const el = frame(3, 4, `
    <h2>✨ Connect the AI (OpenRouter)</h2>
    <p>Lessons, marking, gap analysis and the kids' helper use AI through <b>your own OpenRouter key</b>, so you only pay for what you use (typically pennies per lesson).</p>
    <ol class="small" style="line-height:1.8">
      <li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> and sign in.</li>
      <li>Create a key — tip: set a monthly <b>credit limit</b> on it (e.g. £10).</li>
      <li>Paste it below. You can change models later in Settings → AI.</li>
    </ol>
    <label class="field"><span>OpenRouter API key</span><input class="input" id="key" placeholder="sk-or-v1-…" autocomplete="off"></label>
    <div class="row"><button class="btn" id="test">Test key</button><span id="res" class="small"></span></div>
    <div class="row" style="margin-top:18px"><button class="btn btn-ghost" id="skip">Skip for now</button><span class="spacer"></span><button class="btn btn-primary btn-lg" id="save">Finish ✓</button></div>`);
  const key = () => el.querySelector('#key').value.trim();
  el.querySelector('#test').onclick = async () => {
    const res = el.querySelector('#res'); res.innerHTML = '<span class="spinner"></span>';
    try { const t = await complete({ task: 'tutor', apiKey: key(), maxTokens: 20, messages: [{ role: 'user', content: 'Say "Hello from the AI!"' }] }); res.innerHTML = `<span class="pill good">✓ Works</span> ${esc(t.slice(0, 60))}`; }
    catch (e) { res.innerHTML = `<span class="pill bad">✗</span> ${esc(e.message)}`; }
  };
  const finish = async (withKey) => {
    try {
      const s = await store.settings(true);
      if (withKey && key()) s.apiKey = key();
      await store.saveSettings(s);
      await enter(store.me);
    } catch (e) { toast(e.message, 'error'); }
  };
  el.querySelector('#save').onclick = () => finish(true);
  el.querySelector('#skip').onclick = () => finish(false);
}
