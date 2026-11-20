// Parent dashboard shell: sidebar navigation, child switcher, hash routing.
import { store } from '../store.js';
import { h, esc } from '../util.js';
import { root, logout } from '../main.js';
import CONFIG from '../config.js';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: '🏠', load: () => import('./overview.js') },
  { id: 'lessons', label: 'Lessons', icon: '📚', load: () => import('./lessons.js') },
  { id: 'planner', label: 'Planner', icon: '📅', load: () => import('./planner.js') },
  { id: 'progress', label: 'Progress & gaps', icon: '📈', load: () => import('./progress.js') },
  { id: 'review', label: 'Review work', icon: '✅', load: () => import('./review.js'), badge: 'review' },
  { id: 'creations', label: 'Creations & moods', icon: '🎨', load: () => import('./creations.js') },
  { id: 'chats', label: 'Helper chats', icon: '🦉', load: () => import('./chats.js'), badge: 'flags' },
  { id: 'spelling', label: 'Spelling lists', icon: '🔤', load: () => import('./spelling.js') },
  { id: 'notes', label: 'Notes to kids', icon: '💌', load: () => import('./notes.js') },
  { id: 'reports', label: 'Reports', icon: '🖨️', load: () => import('./reports.js') },
  { id: 'settings', label: 'Settings', icon: '⚙️', load: () => import('./settings.js'), admin: true },
];

export const state = { me: null, kids: [], kidId: null, settings: null };
let els = null;

export async function mountParent(me) {
  state.me = me;
  state.settings = await store.settings(true);
  state.kids = await store.children();
  state.kidId = state.kidId && state.kids.some(k => k.id === state.kidId) ? state.kidId : state.kids[0]?.id || null;
  root().innerHTML = '';
  const side = h('aside', { class: 'pd-side' });
  const main = h('main', { class: 'pd-main' });
  const nav = h('nav', { class: 'pd-nav' });
  side.append(h('div', { class: 'logo' }, '🦉 ', h('span', {}, CONFIG.appName)), nav,
    h('div', { class: 'pd-user' }, h('div', { class: 'av' }, me.avatar || '🙂'), h('div', { style: { flex: 1 } }, h('b', { style: { color: '#fff' } }, me.name), h('div', { class: 'small', style: { opacity: .7 } }, me.role === 'admin' ? 'Administrator' : 'Parent')),
      h('button', { class: 'icon-btn', title: 'Log out', style: { color: '#fff' }, onclick: () => logout() }, '🚪')),
    h('div', { class: 'small', style: { opacity: .5, padding: '10px 8px 0' } }, store.mode === 'cloud' ? '☁️ Cloud sync on' : '💻 Saved on this device'));
  const top = h('div', { class: 'mobile-top' }, h('button', { class: 'icon-btn', style: { color: '#fff' }, onclick: () => side.classList.toggle('open') }, '☰'), h('b', {}, CONFIG.appName));
  root().append(top, h('div', { class: 'pd' }, side, main));
  els = { side, main, nav };
  window.onhashchange = route;
  route();
}

export function go(page, arg) { location.hash = `#/p/${page}${arg ? '/' + encodeURIComponent(arg) : ''}`; }

export async function refreshBadges() {
  if (!els) return;
  const [asg, docs, chats] = await Promise.all([store.list('assignments'), store.list('documents'), store.list('chats')]);
  const counts = {
    review: asg.filter(a => a.status === 'submitted').length + docs.filter(d => d.submitted && !d.reviewed).length,
    flags: chats.filter(c => c.flagged && !c.flagSeen).length,
  };
  els.nav.querySelectorAll('[data-badge]').forEach(a => { const n = counts[a.dataset.badge]; const b = a.querySelector('.n'); b.textContent = n; b.classList.toggle('hidden', !n); });
  return counts;
}

async function route() {
  if (!els || !document.body.contains(els.main)) { window.onhashchange = null; return; }
  const m = /^#\/p\/([\w-]+)(?:\/(.+))?/.exec(location.hash);
  let page = PAGES.find(p => p.id === m?.[1]) || PAGES[0];
  if (page.admin && !store.isAdmin) page = PAGES[0];
  const arg = m?.[2] ? decodeURIComponent(m[2]) : null;
  els.nav.innerHTML = '';
  PAGES.filter(p => !p.admin || store.isAdmin).forEach(p => els.nav.append(h('a', { href: `#/p/${p.id}`, class: p === page ? 'on' : '', 'data-badge': p.badge || null }, h('span', {}, p.icon), p.label, p.badge ? h('span', { class: 'n hidden' }) : null)));
  els.side.classList.remove('open');
  window.onbeforeunload = null;
  els.main.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
  try {
    const mod = await page.load();
    els.main.innerHTML = '';
    await mod.render(els.main, state, arg);
  } catch (e) {
    console.error(e);
    els.main.innerHTML = `<div class="card"><h3>😕 This page had a problem</h3><p>${esc(e.message)}</p></div>`;
  }
  refreshBadges();
  scrollTo(0, 0);
}

export function rerender() { route(); }

// Header with title, optional child switcher and action buttons.
export function header(main, title, { kidSwitch = false, all = false, actions = [] } = {}) {
  const head = h('div', { class: 'pd-head' }, h('h1', {}, title), h('span', { class: 'spacer' }));
  if (kidSwitch && state.kids.length) {
    const sw = h('div', { class: 'kid-switch no-print' });
    const opts = all ? [{ id: 'all', name: state.kids.length > 2 ? 'Everyone' : 'Both', avatar: '👫' }, ...state.kids] : state.kids;
    if (!all && state.kidId === 'all') state.kidId = state.kids[0].id;
    opts.forEach(k => sw.append(h('button', { class: state.kidId === k.id ? 'on' : '', onclick: () => { state.kidId = k.id; route(); } }, `${k.avatar || ''} ${k.name}`)));
    head.append(sw);
  }
  actions.forEach(a => head.append(a));
  main.append(head);
  return head;
}

export const kidById = id => state.kids.find(k => k.id === id);
