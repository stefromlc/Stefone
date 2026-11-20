// The kids' virtual desktop: wallpaper, icons, widgets, taskbar, start menu and a window manager.
import { store } from './store.js';
import { esc, h, today, greeting, toast, fmtDate, uid } from './util.js';
import { subject } from './skills.js';
import { root, logout } from './main.js';

export const APPS = {
  lessons: { name: 'My Lessons', icon: '📒', color: '#5b5bd6', w: 900, h: 640, single: true },
  writer: { name: 'Writer', icon: '📝', color: '#1c7ed6', w: 920, h: 640 },
  sheets: { name: 'Sheets', icon: '📊', color: '#2b8a3e', w: 900, h: 600 },
  explorer: { name: 'Explorer', icon: '🧭', color: '#e8590c', w: 960, h: 660, single: true },
  helper: { name: 'Helper', icon: '🦉', color: '#7048e8', w: 760, h: 620, single: true },
  practice: { name: 'Practice', icon: '🎯', color: '#d6336c', w: 760, h: 600, single: true },
  paint: { name: 'Paint', icon: '🖌️', color: '#f08c00', w: 920, h: 660 },
  files: { name: 'My Files', icon: '📁', color: '#495057', w: 720, h: 520, single: true },
  stars: { name: 'My Stars', icon: '⭐', color: '#f59f00', w: 720, h: 580, single: true },
};
const LOADERS = {
  lessons: () => import('./apps/lessons.js'), writer: () => import('./apps/writer.js'), sheets: () => import('./apps/sheets.js'),
  explorer: () => import('./apps/explorer.js'), helper: () => import('./apps/helper.js'), practice: () => import('./apps/practice.js'),
  paint: () => import('./apps/paint.js'), files: () => import('./apps/files.js'), stars: () => import('./apps/stars.js'),
};

export const WALLPAPERS = [
  'linear-gradient(135deg,#6ee7f9,#a78bfa 55%,#f472b6)',
  'linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364)',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#84fab0,#8fd3f4)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(160deg,#1a2a6c,#b21f1f,#fdbb2d)',
  'radial-gradient(circle at 30% 20%,#3a3f8f,#0b0d2b 70%)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
];

let ctx = null;

export function unmountDesktop() {
  if (!ctx) return;
  clearInterval(ctx.tick); clearInterval(ctx.clockTimer);
  document.removeEventListener('visibilitychange', ctx.onVis);
  ctx.wins.forEach(w => w.close(true));
  ctx = null;
}

export function lockReason(settings, secondsToday) {
  const sc = settings.schedule || {};
  if (sc.dailyLimitMins > 0 && secondsToday >= sc.dailyLimitMins * 60) return { icon: '⏰', title: "That's enough screen time today!", text: 'Brilliant work. Time to play, read a book or go outside. See you tomorrow!' };
  if (sc.enabled) {
    const now = new Date();
    const day = now.getDay();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!(sc.days || []).includes(day)) return { icon: '🏖️', title: 'No school today!', text: 'The school computer is resting. Enjoy your day off!' };
    if (hm < sc.start) return { icon: '🌅', title: 'School starts soon', text: `Come back at ${sc.start}.` };
    if (hm >= sc.end) return { icon: '🌙', title: 'School is finished for today', text: 'Great job today! The school computer opens again tomorrow.' };
  }
  return null;
}

function showLocked(reason) {
  root().innerHTML = `<div class="locked"><div><div class="big">${reason.icon}</div><h1>${esc(reason.title)}</h1><p style="font-size:1.2em">${esc(reason.text)}</p><button class="btn btn-lg" id="lo">Log out</button></div></div>`;
  document.getElementById('lo').onclick = logout;
}

export async function mountDesktop(me) {
  unmountDesktop();
  const settings = await store.settings(true);
  const timeId = `${me.id}_${today()}`;
  const tl = (await store.get('timelog', timeId)) || { id: timeId, childId: me.id, date: today(), seconds: 0 };
  const reason = lockReason(settings, tl.seconds);
  if (reason) return showLocked(reason);

  const prefs = (await store.get('prefs', me.id)) || { id: me.id, childId: me.id, wallpaper: 0 };
  ctx = { me, settings, prefs, wins: [], z: 100, openApp, refresh: () => renderWidgets(), tl };
  store.log('login');

  root().innerHTML = '';
  const desk = h('div', { class: 'desktop' });
  desk.style.setProperty('--wall', WALLPAPERS[prefs.wallpaper] || WALLPAPERS[0]);
  const icons = h('div', { class: 'desk-icons' });
  for (const [id, a] of Object.entries(APPS)) {
    // Single click opens — easier for young children than double-click.
    icons.append(h('button', { class: 'desk-icon', 'data-app': id, onclick: () => openApp(id) },
      h('span', { class: 'ic' }, a.icon, h('span', { class: 'badge hidden' })), a.name === 'Helper' ? (settings.helper?.name || 'Helper').split(' ')[0] : a.name));
  }
  const widgets = h('div', { class: 'widgets' });
  const taskbar = h('div', { class: 'taskbar' });
  const startBtn = h('button', { class: 'start-btn', style: { background: me.color || '#5b5bd6' }, onclick: e => { e.stopPropagation(); toggleStart(); } }, h('span', { class: 'av' }, me.avatar || '🙂'), me.name);
  const tasks = h('div', { class: 'row', style: { gap: '4px', flex: 1, overflow: 'hidden' } });
  const clock = h('div', { class: 'clock' });
  taskbar.append(startBtn, tasks, clock);
  desk.append(icons, widgets, taskbar);
  root().append(desk);
  Object.assign(ctx, { desk, widgets, tasks, clock, icons });
  desk.addEventListener('mousedown', e => { if (!e.target.closest('.start-menu') && !e.target.closest('.start-btn')) closeStart(); });

  const tickClock = () => { const d = new Date(); clock.innerHTML = `${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}<br><span class="muted">${fmtDate(d)}</span>`; };
  tickClock(); ctx.clockTimer = setInterval(tickClock, 15000);

  // Time tracking (+ limits) — counts a minute only while the tab is visible.
  ctx.tick = setInterval(async () => {
    if (document.hidden || !ctx) return;
    ctx.tl.seconds += 60;
    if (ctx.tl.date !== today()) ctx.tl = { id: `${me.id}_${today()}`, childId: me.id, date: today(), seconds: 60 };
    store.put('timelog', ctx.tl).catch(() => { });
    const r = lockReason(ctx.settings, ctx.tl.seconds);
    if (r) { toast('Saving your work…'); setTimeout(() => { unmountDesktop(); showLocked(r); }, 2500); }
  }, 60000);
  ctx.onVis = () => { };
  document.addEventListener('visibilitychange', ctx.onVis);

  await renderWidgets();
}

async function renderWidgets() {
  if (!ctx) return;
  const { me, widgets } = ctx;
  const [assignments, notes, lessons] = await Promise.all([
    store.list('assignments', { childId: me.id }), store.list('notes', { childId: me.id }), store.list('lessons'),
  ]);
  const lmap = Object.fromEntries(lessons.map(l => [l.id, l]));
  const t = today();
  const todo = assignments.filter(a => a.date <= t && !['submitted', 'reviewed', 'complete'].includes(a.status) && lmap[a.lessonId]).sort((a, b) => a.date.localeCompare(b.date));
  const doneToday = assignments.filter(a => a.completedAt && new Date(a.completedAt).toDateString() === new Date().toDateString());
  const newFeedback = assignments.filter(a => a.status === 'reviewed' && !a.feedbackSeen);
  widgets.innerHTML = '';
  const w = h('div', { class: 'widget' }, h('h3', {}, `${greeting()}, ${me.name}! ${me.avatar || ''}`));
  if (!todo.length) w.append(h('p', { style: { margin: '4px 0' } }, doneToday.length ? `🎉 All done for today! You finished ${doneToday.length} lesson${doneToday.length > 1 ? 's' : ''}.` : 'No lessons waiting right now. Try Practice or Explorer!'));
  else {
    w.append(h('p', { class: 'muted small', style: { margin: '0 0 6px' } }, `You have ${todo.length} lesson${todo.length > 1 ? 's' : ''} to do:`));
    todo.slice(0, 5).forEach(a => {
      const l = lmap[a.lessonId]; const s = subject(l.subject);
      w.append(h('div', { class: 'today-item', onclick: () => openApp('lessons', { assignmentId: a.id }) },
        h('span', { class: 'si' }, s.icon), h('div', { style: { flex: 1 } }, h('b', {}, l.title), h('span', { class: 'muted small' }, `${s.name} · ${l.durationMins || 30} min${a.date < t ? ' · from ' + fmtDate(a.date) : ''}${a.status === 'in_progress' ? ' · started' : ''}`)), h('span', {}, '▶️')));
    });
  }
  widgets.append(w);
  if (newFeedback.length) widgets.append(h('div', { class: 'widget', style: { cursor: 'pointer' }, onclick: () => openApp('lessons', { tab: 'done' }) }, h('b', {}, `💬 You have feedback on ${newFeedback.length} lesson${newFeedback.length > 1 ? 's' : ''}!`)));
  notes.filter(n => !n.read).sort((a, b) => b.ts - a.ts).slice(0, 2).forEach(n => {
    widgets.append(h('div', { class: 'widget note-widget' },
      h('div', { class: 'small muted' }, `${n.fromAvatar || '💌'} Note from ${n.from}`),
      h('p', { style: { fontSize: '1.15em', margin: '6px 0' } }, n.text),
      h('button', { class: 'btn btn-sm', onclick: async () => { n.read = true; await store.put('notes', n); renderWidgets(); } }, '👍 Thanks!')));
  });
  const lessonBadge = ctx.icons.querySelector('[data-app="lessons"] .badge');
  lessonBadge.textContent = todo.length; lessonBadge.classList.toggle('hidden', !todo.length);
}

// ───────── start menu ─────────
function closeStart() { ctx?.desk.querySelector('.start-menu')?.remove(); }
function toggleStart() {
  if (ctx.desk.querySelector('.start-menu')) return closeStart();
  const { me } = ctx;
  const m = h('div', { class: 'start-menu' },
    h('div', { class: 'row' }, h('div', { style: { fontSize: '40px' } }, me.avatar), h('div', {}, h('b', { style: { fontSize: '1.2em' } }, me.name), h('div', { class: 'muted small' }, me.yearGroup || ''))));
  const apps = h('div', { class: 'start-apps' });
  for (const [id, a] of Object.entries(APPS)) apps.append(h('button', { onclick: () => { closeStart(); openApp(id); } }, h('span', { class: 'e' }, a.icon), a.name));
  const walls = h('div', { class: 'walls' });
  WALLPAPERS.forEach((wp, i) => walls.append(h('button', { style: { background: wp }, title: 'Wallpaper', onclick: async () => { ctx.prefs.wallpaper = i; ctx.desk.style.setProperty('--wall', wp); await store.put('prefs', ctx.prefs); } })));
  m.append(apps, h('div', { class: 'small muted', style: { fontWeight: 800, margin: '6px 0' } }, '🎨 Wallpaper'), walls,
    h('div', { class: 'row', style: { marginTop: '14px' } }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: async () => { closeStart(); await closeAll(); logout(); } }, '🚪 Log out')));
  ctx.desk.append(m);
}
async function closeAll() { for (const w of [...ctx.wins]) await w.close(); }

// ───────── window manager ─────────
export async function openApp(id, args = {}) {
  if (!ctx) return;
  const def = APPS[id];
  if (def.single) {
    const existing = ctx.wins.find(w => w.appId === id);
    if (existing) { existing.restore(); existing.focus(); existing.instance?.handle?.(args); return existing; }
  }
  const win = createWindow(id, def, args.title);
  try {
    const mod = await LOADERS[id]();
    win.instance = (await mod.open(win, ctx, args)) || {};
  } catch (e) {
    console.error(e);
    win.body.innerHTML = `<div class="empty"><span class="big">😕</span>Sorry, this app had a problem.<br><span class="small">${esc(e.message)}</span></div>`;
  }
  return win;
}

function createWindow(appId, def, title) {
  const small = innerWidth < 820 || innerHeight < 560;
  const n = ctx.wins.length;
  const W = Math.min(def.w, innerWidth - 40), H = Math.min(def.h, innerHeight - 100);
  const left = Math.max(10, (innerWidth - W) / 2 - 120 + n * 28), top = Math.max(10, (innerHeight - 60 - H) / 2 + n * 24);
  const el = h('div', { class: `win ${small ? 'max' : ''}`, style: { left: left + 'px', top: top + 'px', width: W + 'px', height: H + 'px' } });
  const tEl = h('span', { class: 't' }, title || def.name);
  const bar = h('div', { class: 'win-bar', style: { background: def.color } }, h('span', { class: 'e' }, def.icon), tEl);
  const bMin = h('button', { title: 'Minimise' }, '–'), bMax = h('button', { title: 'Maximise' }, '▢'), bX = h('button', { class: 'x', title: 'Close' }, '✕');
  bar.append(bMin, bMax, bX);
  const body = h('div', { class: 'win-body' });
  const grip = h('div', { class: 'win-resize' });
  el.append(bar, body, grip);
  ctx.desk.append(el);

  const closers = [];
  const taskBtn = h('button', { class: 'task-btn' }, h('span', { class: 'e' }, def.icon), h('span', { class: 't' }, title || def.name));
  ctx.tasks.append(taskBtn);
  const win = {
    id: uid('w'), appId, el, body,
    setTitle(t) { tEl.textContent = t; taskBtn.querySelector('.t').textContent = t; },
    onClose(fn) { closers.push(fn); },
    focus() { ctx.wins.forEach(w => { w.el.classList.add('inactive'); w.taskBtn.classList.remove('active'); }); el.classList.remove('inactive'); taskBtn.classList.add('active'); el.style.zIndex = ++ctx.z; },
    restore() { el.classList.remove('min'); },
    minimise() { el.classList.add('min'); taskBtn.classList.remove('active'); },
    async close(force) {
      if (!force) for (const fn of closers) { if ((await fn()) === false) return false; }
      else closers.forEach(fn => { try { fn(true); } catch { } });
      el.remove(); taskBtn.remove();
      if (ctx) ctx.wins = ctx.wins.filter(w => w !== win);
      return true;
    },
    taskBtn,
  };
  ctx.wins.push(win);
  bMin.onclick = () => win.minimise();
  bMax.onclick = () => el.classList.toggle('max');
  bar.ondblclick = e => { if (e.target === bar || e.target === tEl) el.classList.toggle('max'); };
  bX.onclick = () => win.close();
  taskBtn.onclick = () => { if (el.classList.contains('min')) { win.restore(); win.focus(); } else if (taskBtn.classList.contains('active')) win.minimise(); else win.focus(); };
  el.addEventListener('pointerdown', () => win.focus(), true);

  // dragging
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || el.classList.contains('max')) return;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
    bar.setPointerCapture(e.pointerId);
    const mv = ev => {
      el.style.left = Math.min(innerWidth - 80, Math.max(-el.offsetWidth + 80, ox + ev.clientX - sx)) + 'px';
      el.style.top = Math.min(innerHeight - 110, Math.max(0, oy + ev.clientY - sy)) + 'px';
    };
    const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); };
    bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
  });
  // resizing
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight;
    grip.setPointerCapture(e.pointerId);
    const mv = ev => { el.style.width = Math.max(320, ow + ev.clientX - sx) + 'px'; el.style.height = Math.max(220, oh + ev.clientY - sy) + 'px'; };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  win.focus();
  return win;
}
