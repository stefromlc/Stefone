// Shared helpers: DOM, formatting, dialogs, speech, hashing.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export const today = () => localDate(new Date());
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function startOfWeek(dateStr = today()) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return localDate(d);
}
export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!s) return '';
  const d = typeof s === 'string' && s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleDateString('en-GB', opts);
}
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function timeAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(ts);
}
export const pct = v => (v == null || isNaN(v) ? '–' : Math.round(v * 100) + '%');

export function md(text) {
  const html = window.marked ? window.marked.parse(String(text || ''), { breaks: true }) : esc(text);
  return sanitize(html);
}
export function sanitize(html) {
  return window.DOMPurify ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : esc(html);
}

export function debounce(fn, ms = 400) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- toasts ----------
export function toast(msg, type = 'info', ms = 3200) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts' }); document.body.append(wrap); }
  const t = h('div', { class: `toast toast-${type}`, role: 'status' }, msg);
  wrap.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- modal dialogs ----------
export function modal({ title = '', body = '', actions = [{ label: 'Close' }], wide = false, cls = '', onClose } = {}) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: `modal ${wide ? 'modal-wide' : ''} ${cls}`, role: 'dialog', 'aria-modal': 'true' });
  const head = h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn modal-x', 'aria-label': 'Close', onclick: () => close() }, '✕'));
  const content = h('div', { class: 'modal-body' });
  if (typeof body === 'string') content.innerHTML = body; else if (body) content.append(body);
  const foot = h('div', { class: 'modal-foot' });
  const close = (val) => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(val); };
  for (const a of actions) {
    const b = h('button', { class: `btn ${a.cls || ''}` }, a.label);
    b.onclick = async () => {
      if (a.onClick) {
        b.disabled = true;
        try { const r = await a.onClick({ close, content, box }); if (r === false) { b.disabled = false; return; } }
        catch (e) { b.disabled = false; toast(e.message || String(e), 'error'); return; }
      }
      close(a.value);
    };
    foot.append(b);
  }
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.append(head, content);
  if (actions.length) box.append(foot);
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.body.append(back);
  setTimeout(() => { const f = content.querySelector('input,textarea,select'); f && f.focus(); }, 30);
  return { el: box, content, close };
}

export function confirmDlg(message, { title = 'Are you sure?', ok = 'Yes', danger = false } = {}) {
  return new Promise(res => {
    modal({
      title, body: h('p', {}, message),
      actions: [{ label: 'Cancel', value: false }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', value: true }],
      onClose: v => res(!!v),
    });
  });
}

export function promptDlg(title, label, value = '', { placeholder = '', type = 'text' } = {}) {
  return new Promise(res => {
    const input = h('input', { class: 'input', type, value, placeholder });
    const m = modal({
      title, body: h('label', { class: 'field' }, h('span', {}, label), input),
      actions: [{ label: 'Cancel', value: null }, { label: 'OK', cls: 'btn-primary', onClick: () => { res(input.value); } }],
      onClose: v => { if (v === null || v === undefined) res(null); },
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { res(input.value); m.close('done'); } });
  });
}

// ---------- speech ----------
let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  voice = vs.find(v => v.lang === 'en-GB' && /female|libby|sonia|serena|kate|google uk english female/i.test(v.name))
    || vs.find(v => v.lang === 'en-GB') || vs.find(v => v.lang && v.lang.startsWith('en')) || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export function speak(text, { rate = 0.95 } = {}) {
  if (!window.speechSynthesis) { toast('Read-aloud is not available in this browser', 'warn'); return; }
  speechSynthesis.cancel();
  const clean = String(text || '').replace(/[#*_`>|~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  // Split into chunks — some browsers stop long utterances.
  const parts = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  for (const p of parts) {
    const u = new SpeechSynthesisUtterance(p.trim());
    if (voice) u.voice = voice;
    u.lang = 'en-GB'; u.rate = rate;
    speechSynthesis.speak(u);
  }
}
export function stopSpeaking() { window.speechSynthesis && speechSynthesis.cancel(); window.__klStopAudio?.(); }
export function textOf(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

// ---------- crypto / files ----------
export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function download(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function readFileText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

export function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

export function confetti(n = 80) {
  const wrap = h('div', { class: 'confetti' });
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c'];
  for (let i = 0; i < n; i++) {
    const p = h('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.6 + 's';
    p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    wrap.append(p);
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 3800);
}

export const AVATARS = ['🦊', '🐼', '🐯', '🦄', '🐸', '🐙', '🦁', '🐨', '🐵', '🐧', '🐢', '🦖', '🐬', '🦉', '🐝', '🚀', '⚽', '🎨', '🌈', '🐱', '🐶', '🐰', '👨', '👩', '🧔', '👱‍♀️'];
export const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#20c997'];

/** Kid-friendly multiple-choice dialog. Resolves to the chosen value (or null if dismissed). */
export function choose({ title, message, icon = '', choices }) {
  return new Promise(res => {
    let done = false;
    const m = modal({
      title, cls: 'modal-kid',
      body: h('div', { class: 'choose-body' }, icon ? h('div', { class: 'choose-icon' }, icon) : null, h('p', {}, message)),
      actions: choices.map(c => ({ label: c.label, cls: c.cls || '', onClick: () => { done = true; res(c.value); } })),
      onClose: () => { if (!done) res(null); },
    });
    return m;
  });
}
