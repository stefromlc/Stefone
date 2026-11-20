// "KidOS" — the children's virtual desktop: top bar, dock, launcher, widgets and a window manager
// with snapping, animations and save-before-close support.
import { store } from './store.js';
import { esc, h, today, greeting, toast, fmtDate, uid, choose, md } from './util.js';
import { subject } from './skills.js';
import { root, logout } from './main.js';
import { sfx, loadImage, say } from './media.js';

// ───────────────────────── App registry ─────────────────────────
export const APPS = {
  lessons: { name: 'My Lessons', icon: '📒', color: '#5b5bd6', cat: 'Learn', w: 1060, h: 760, single: true, load: () => import('./apps/lessons.js') },
  helper: { name: 'Ollie', icon: '🦉', color: '#7048e8', cat: 'Learn', w: 820, h: 660, single: true, load: () => import('./apps/helper.js') },
  practice: { name: 'Practice', icon: '🎯', color: '#d6336c', cat: 'Learn', w: 800, h: 640, single: true, load: () => import('./apps/practice.js') },
  reading: { name: 'Reading Buddy', icon: '📖', color: '#0c8599', cat: 'Learn', w: 860, h: 680, single: true, load: () => import('./apps/reading.js') },
  words: { name: 'Word Wizard', icon: '🪄', color: '#9c36b5', cat: 'Learn', w: 720, h: 620, single: true, load: () => import('./apps/words.js') },
  explorer: { name: 'Explorer', icon: '🧭', color: '#e8590c', cat: 'Learn', w: 1000, h: 700, single: true, load: () => import('./apps/explorer.js') },
  writer: { name: 'Writer', icon: '📝', color: '#1c7ed6', cat: 'Create', w: 980, h: 700, load: () => import('./apps/writer.js') },
  sheets: { name: 'Sheets', icon: '📊', color: '#2b8a3e', cat: 'Create', w: 960, h: 640, load: () => import('./apps/sheets.js') },
  paint: { name: 'Paint', icon: '🖌️', color: '#f08c00', cat: 'Create', w: 1000, h: 720, load: () => import('./apps/paint.js') },
  pictures: { name: 'Picture Maker', icon: '🎨', color: '#e64980', cat: 'Create', w: 900, h: 680, single: true, load: () => import('./apps/pictures.js') },
  stories: { name: 'Story Studio', icon: '📚', color: '#f76707', cat: 'Create', w: 1000, h: 720, load: () => import('./apps/stories.js') },
  music: { name: 'Music Maker', icon: '🎹', color: '#1098ad', cat: 'Create', w: 900, h: 560, single: true, load: () => import('./apps/music.js') },
  code: { name: 'Code Turtle', icon: '🐢', color: '#37b24d', cat: 'Create', w: 1000, h: 680, single: true, load: () => import('./apps/code.js') },
  games: { name: 'Brain Games', icon: '🧩', color: '#fd7e14', cat: 'Play', w: 860, h: 660, single: true, load: () => import('./apps/games.js') },
  journal: { name: 'My Journal', icon: '📔', color: '#c2255c', cat: 'Me', w: 820, h: 640, single: true, load: () => import('./apps/journal.js') },
  stars: { name: 'My Stars', icon: '⭐', color: '#f59f00', cat: 'Me', w: 760, h: 620, single: true, load: () => import('./apps/stars.js') },
  files: { name: 'My Files', icon: '📁', color: '#495057', cat: 'Me', w: 800, h: 580, single: true, load: () => import('./apps/files.js') },
  calculator: { name: 'Calculator', icon: '🧮', color: '#364fc7', cat: 'Tools', w: 360, h: 540, single: true, load: () => import('./apps/calculator.js') },
  timer: { name: 'Timer', icon: '⏱️', color: '#0b7285', cat: 'Tools', w: 420, h: 520, single: true, load: () => import('./apps/timer.js') },
};
const DOCK = ['lessons', 'helper', 'writer', 'pictures', 'explorer', 'practice', 'games', 'files'];
const CATS = { Learn: '🎓 Learn', Create: '✨ Create', Play: '🎮 Play', Me: '🙋 Me', Tools: '🧰 Tools' };

// ───────────────────────── Wallpapers ─────────────────────────
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(42);
const svgUrl = s => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;
function spaceSvg() {
  let stars = '';
  for (let i = 0; i < 140; i++) stars += `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 1000).toFixed(0)}" r="${(rnd() * 1.8 + .3).toFixed(1)}" fill="#fff" opacity="${(rnd() * .7 + .3).toFixed(2)}"/>`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g" cx="30%" cy="20%"><stop offset="0" stop-color="#3b2f8f"/><stop offset="1" stop-color="#0b0d2b"/></radialGradient><radialGradient id="p" cx="35%" cy="35%"><stop offset="0" stop-color="#ffb86b"/><stop offset="1" stop-color="#e8590c"/></radialGradient><radialGradient id="q" cx="35%" cy="35%"><stop offset="0" stop-color="#9be7ff"/><stop offset="1" stop-color="#1c7ed6"/></radialGradient></defs><rect width="1600" height="1000" fill="url(#g)"/>${stars}<circle cx="1250" cy="260" r="120" fill="url(#p)"/><ellipse cx="1250" cy="260" rx="210" ry="38" fill="none" stroke="#ffd8a8" stroke-width="10" opacity=".8" transform="rotate(-18 1250 260)"/><circle cx="1050" cy="760" r="60" fill="url(#q)"/><circle cx="430" cy="820" r="30" fill="#e9ecef"/><circle cx="420" cy="812" r="6" fill="#ced4da"/></svg>`);
}
function hillsSvg() {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74c0fc"/><stop offset="1" stop-color="#d0ebff"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#s)"/><circle cx="1300" cy="180" r="90" fill="#ffe066"/><g fill="#fff" opacity=".9"><ellipse cx="300" cy="180" rx="110" ry="40"/><ellipse cx="370" cy="160" rx="80" ry="45"/><ellipse cx="900" cy="120" rx="90" ry="32"/><ellipse cx="960" cy="105" rx="60" ry="35"/></g><path d="M0 700 Q 300 520 650 680 T 1600 620 V1000 H0Z" fill="#8ce99a"/><path d="M0 800 Q 400 660 800 790 T 1600 760 V1000 H0Z" fill="#51cf66"/><path d="M0 900 Q 500 800 1000 900 T 1600 880 V1000 H0Z" fill="#2f9e44"/><g fill="#2b8a3e"><circle cx="1200" cy="700" r="40"/><rect x="1194" y="720" width="12" height="60" fill="#8d5524"/><circle cx="260" cy="760" r="34"/><rect x="255" y="780" width="10" height="50" fill="#8d5524"/></g></svg>`);
}
function oceanSvg() {
  let bub = '';
  for (let i = 0; i < 40; i++) bub += `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 1000).toFixed(0)}" r="${(rnd() * 10 + 3).toFixed(0)}" fill="none" stroke="#fff" opacity=".35" stroke-width="2"/>`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22b8cf"/><stop offset="1" stop-color="#0b3c5d"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#o)"/>${bub}<path d="M0 860 Q 200 800 400 860 T 800 860 T 1200 860 T 1600 860 V1000 H0Z" fill="#f4d58d"/><g fill="#f76707"><path d="M300 400 q40 -30 80 0 q-40 30 -80 0z"/><path d="M380 400 l25 -18 v36z"/></g><g fill="#fcc419"><path d="M1100 300 q50 -36 100 0 q-50 36 -100 0z"/><path d="M1200 300 l30 -22 v44z"/></g><g fill="#2f9e44" opacity=".85"><path d="M150 1000 q-20 -120 10 -200 q30 80 0 200z"/><path d="M1400 1000 q-30 -160 15 -260 q35 100 -5 260z"/></g></svg>`);
}
function candySvg() {
  let d = '';
  const cs = ['#ffc9de', '#d0bfff', '#a5d8ff', '#b2f2bb', '#ffec99'];
  for (let i = 0; i < 70; i++) d += `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 1000).toFixed(0)}" r="${(rnd() * 26 + 8).toFixed(0)}" fill="${cs[i % 5]}" opacity=".8"/>`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#fff0f6"/>${d}</svg>`);
}
function rainbowSvg() {
  const cols = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#e7f5ff"/>${cols.map((c, i) => `<circle cx="800" cy="1050" r="${700 - i * 55}" fill="none" stroke="${c}" stroke-width="56"/>`).join('')}<g fill="#fff"><ellipse cx="240" cy="900" rx="220" ry="90"/><ellipse cx="1360" cy="900" rx="220" ry="90"/></g></svg>`);
}
export const WALLPAPERS = [
  { name: 'Space', css: spaceSvg() },
  { name: 'Hills', css: hillsSvg() },
  { name: 'Ocean', css: oceanSvg() },
  { name: 'Rainbow', css: rainbowSvg() },
  { name: 'Candy', css: candySvg() },
  { name: 'Dreamy', css: 'linear-gradient(135deg,#6ee7f9,#a78bfa 55%,#f472b6)' },
  { name: 'Sunset', css: 'linear-gradient(160deg,#1a2a6c,#b21f1f,#fdbb2d)' },
  { name: 'Mint', css: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
  { name: 'Peach', css: 'linear-gradient(135deg,#f6d365,#fda085)' },
  { name: 'Night', css: 'linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364)' },
];

const WORDS = [
  ['enormous', 'very, very big', 'The blue whale is an enormous animal.'], ['curious', 'wanting to find out about things', 'The curious cat peeped into the box.'],
  ['brave', 'ready to do something even when it is scary', 'It was brave of her to sing on stage.'], ['delicious', 'tasting really good', 'Grandma makes delicious pancakes.'],
  ['gigantic', 'huge', 'A gigantic wave crashed onto the beach.'], ['whisper', 'to speak very quietly', 'We whispered so the baby would not wake.'],
  ['investigate', 'to look carefully to find out the truth', 'The detective will investigate the missing biscuits.'], ['ancient', 'very, very old', 'The Egyptians built ancient pyramids.'],
  ['peculiar', 'strange or unusual', 'There was a peculiar smell in the kitchen.'], ['enormous', 'very big', 'An enormous dinosaur stomped past.'],
  ['glisten', 'to shine and sparkle (often when wet)', 'The dew glistened on the grass.'], ['furious', 'very, very angry', 'The giant was furious when Jack ran away.'],
  ['exhausted', 'extremely tired', 'After the race I was exhausted.'], ['magnificent', 'wonderful and impressive', 'The castle looked magnificent at night.'],
  ['nervous', 'a bit worried or scared', 'I felt nervous before my swimming test.'], ['habitat', 'the natural home of an animal or plant', 'The polar bear\'s habitat is the Arctic.'],
  ['predict', 'to say what you think will happen', 'Can you predict the end of the story?'], ['evaporate', 'when a liquid turns into a gas', 'The puddle evaporated in the sunshine.'],
  ['generous', 'happy to give and share', 'My generous friend shared his sweets.'], ['fragile', 'easily broken', 'Be careful — the vase is fragile.'],
  ['astonished', 'very surprised', 'She was astonished to see a unicorn.'], ['cautious', 'careful to avoid danger', 'Be cautious when crossing the road.'],
  ['transparent', 'see-through', 'Glass is transparent.'], ['determined', 'not giving up', 'He was determined to finish the puzzle.'],
  ['shimmer', 'to shine with a soft, wavy light', 'The lake shimmered in the moonlight.'], ['predator', 'an animal that hunts other animals', 'The shark is an ocean predator.'],
  ['enchanted', 'under a magic spell', 'They walked through the enchanted forest.'], ['vast', 'very large and wide', 'The desert was vast and empty.'],
  ['observe', 'to watch carefully', 'Scientists observe the stars with telescopes.'], ['grateful', 'feeling thankful', 'I am grateful for my friends.'],
];

let ctx = null;

export function unmountDesktop() {
  if (!ctx) return;
  clearInterval(ctx.tick); clearInterval(ctx.clockTimer);
  document.removeEventListener('keydown', ctx.onKey);
  window.removeEventListener('resize', ctx.onResize);
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

// ───────────────────────── Mount ─────────────────────────
export async function mountDesktop(me) {
  unmountDesktop();
  const settings = await store.settings(true);
  const timeId = `${me.id}_${today()}`;
  const tl = (await store.get('timelog', timeId)) || { id: timeId, childId: me.id, date: today(), seconds: 0 };
  const reason = lockReason(settings, tl.seconds);
  if (reason) return showLocked(reason);

  const prefs = { id: me.id, childId: me.id, wallpaper: 0, font: 'Nunito', textSize: 'normal', ...(await store.get('prefs', me.id)) };
  ctx = { me, settings, prefs, wins: [], z: 100, openApp, refresh: () => { renderWidgets(); renderTop(); }, tl, closeAllGuarded, setWallpaper, savePrefs };
  store.log('login');

  root().innerHTML = '';
  const desk = h('div', { class: 'kos', style: { '--accent': me.color || '#5b5bd6' } });
  const wall = h('div', { class: 'kos-wall' });
  const top = h('div', { class: 'kos-top' });
  const icons = h('div', { class: 'kos-icons' });
  const widgets = h('div', { class: 'kos-widgets' });
  const dock = h('div', { class: 'kos-dock' });
  const layer = h('div', { class: 'kos-layer' });
  desk.append(wall, icons, widgets, layer, top, dock);
  root().append(desk);
  Object.assign(ctx, { desk, wall, top, icons, widgets, dock, layer });
  applyPrefs();

  // desktop icons
  for (const [id, a] of Object.entries(APPS)) {
    icons.append(h('button', { class: 'kos-icon', 'data-app': id, title: a.name, onclick: () => openApp(id) },
      h('span', { class: 'ic', style: { '--c': a.color } }, a.icon, h('span', { class: 'badge hidden' })), h('span', { class: 'lb' }, a.name)));
  }
  desk.addEventListener('contextmenu', e => { if (e.target === wall || e.target === icons || e.target === desk) { e.preventDefault(); contextMenu(e.clientX, e.clientY); } });
  desk.addEventListener('pointerdown', e => { if (!e.target.closest('.kos-pop')) closePops(); });

  renderTop();
  renderDock();
  ctx.clockTimer = setInterval(renderClock, 15000);
  ctx.onKey = e => {
    if (e.key === 'Escape') closePops();
    if ((e.metaKey || e.ctrlKey) && e.key === ' ') { e.preventDefault(); launcher(); }
  };
  document.addEventListener('keydown', ctx.onKey);
  ctx.onResize = () => {
    if (!ctx) return;
    const r = ctx.layer.getBoundingClientRect();
    for (const w of ctx.wins) {
      const el = w.el;
      if (innerWidth < 820 || innerHeight < 600) { el.classList.add('max'); continue; }
      if (el.classList.contains('max') || el.classList.contains('snap-l') || el.classList.contains('snap-r')) continue;
      const wd = Math.min(el.offsetWidth, r.width - 10), ht = Math.min(el.offsetHeight, r.height - 10);
      el.style.width = wd + 'px'; el.style.height = ht + 'px';
      el.style.left = Math.max(5, Math.min(el.offsetLeft, r.width - wd - 5)) + 'px';
      el.style.top = Math.max(0, Math.min(el.offsetTop, r.height - ht - 5)) + 'px';
    }
  };
  window.addEventListener('resize', ctx.onResize);

  // Time tracking (+ limits) — counts a minute only while the tab is visible.
  ctx.tick = setInterval(async () => {
    if (document.hidden || !ctx) return;
    ctx.tl.seconds += 60;
    if (ctx.tl.date !== today()) ctx.tl = { id: `${me.id}_${today()}`, childId: me.id, date: today(), seconds: 60 };
    store.put('timelog', ctx.tl).catch(() => { });
    const sc = ctx.settings.schedule || {};
    if (sc.dailyLimitMins > 0 && sc.dailyLimitMins * 60 - ctx.tl.seconds === 300) toast('⏰ 5 minutes left today — time to save your work!', 'warn', 6000);
    const r = lockReason(ctx.settings, ctx.tl.seconds);
    if (r) { toast('Saving your work…'); await saveAll(); setTimeout(() => { unmountDesktop(); showLocked(r); }, 1500); }
  }, 60000);

  await renderWidgets();
  sfx('open');
}

async function applyPrefs() {
  const { prefs, desk, wall } = ctx;
  desk.classList.toggle('kos-large', prefs.textSize === 'large');
  desk.style.setProperty('--kfont', prefs.font === 'Lexend' ? "'Lexend', var(--font)" : 'var(--font)');
  if (prefs.wallpaperImage) {
    const src = await loadImage(prefs.wallpaperImage);
    if (src) { wall.style.background = `center / cover no-repeat url("${src}")`; return; }
  }
  const wp = WALLPAPERS[prefs.wallpaper] || WALLPAPERS[0];
  wall.style.background = wp.css.startsWith('url') ? `center / cover no-repeat ${wp.css}` : wp.css;
}
async function savePrefs() { await store.put('prefs', ctx.prefs); applyPrefs(); }
export async function setWallpaper(i, imageId) {
  if (!ctx) return;
  ctx.prefs.wallpaper = i ?? ctx.prefs.wallpaper; ctx.prefs.wallpaperImage = imageId || null;
  await savePrefs();
}

// ───────────────────────── Top bar ─────────────────────────
async function renderTop() {
  const { me, top } = ctx;
  top.innerHTML = '';
  const clock = h('div', { class: 'kos-clock' });
  const stats = h('button', { class: 'kos-chip', title: 'My Stars', onclick: () => openApp('stars') }, '⭐ …');
  const bell = h('button', { class: 'kos-chip kos-bell', title: 'Messages', onclick: e => { e.stopPropagation(); notifications(bell); } }, '🔔', h('span', { class: 'dot hidden' }));
  const snd = h('button', { class: 'kos-chip', title: 'Sounds on/off', onclick: () => { ctx.prefs.mute = !ctx.prefs.mute; store._settings.sounds = !ctx.prefs.mute; snd.textContent = ctx.prefs.mute ? '🔇' : '🔊'; savePrefs(); if (!ctx.prefs.mute) sfx('pop'); } }, ctx.prefs.mute ? '🔇' : '🔊');
  if (ctx.prefs.mute) store._settings.sounds = false;
  top.append(
    h('button', { class: 'kos-chip kos-brand', onclick: e => { e.stopPropagation(); launcher(); } }, '🦉 ', h('b', {}, 'Apps')),
    h('span', { class: 'spacer' }), clock, h('span', { class: 'spacer' }),
    stats, bell, snd,
    h('button', { class: 'kos-chip kos-me', onclick: e => { e.stopPropagation(); meMenu(e.currentTarget); } }, h('span', { class: 'av' }, me.avatar || '🙂'), me.name));
  Object.assign(ctx, { clockEl: clock, statsEl: stats, bellEl: bell });
  renderClock();
  const { computeRewards } = await import('./apps/stars.js');
  const r = await computeRewards(me.id);
  stats.textContent = `⭐ ${r.stars}  🔥 ${r.streak}`;
}
function renderClock() {
  if (!ctx?.clockEl) return;
  const d = new Date();
  ctx.clockEl.innerHTML = `<b>${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b> <span>${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}</span>`;
}

// ───────────────────────── Dock ─────────────────────────
function renderDock() {
  if (!ctx) return;
  const { dock } = ctx;
  dock.innerHTML = '';
  const item = (id, running) => {
    const a = APPS[id];
    const w = ctx.wins.filter(x => x.appId === id);
    return h('button', { class: `dock-i ${w.length ? 'run' : ''} ${w.some(x => x.active) ? 'act' : ''}`, title: a.name, 'data-app': id, onclick: () => {
      if (!w.length) return openApp(id);
      const top = w[w.length - 1];
      if (top.active && !top.el.classList.contains('min')) top.minimise(); else { top.restore(); top.focus(); }
    } }, h('span', { class: 'ic', style: { '--c': a.color } }, a.icon), h('span', { class: 'tip' }, a.name));
  };
  dock.append(h('button', { class: 'dock-i dock-launch', title: 'All apps', onclick: e => { e.stopPropagation(); launcher(); } }, h('span', { class: 'ic' }, '▦'), h('span', { class: 'tip' }, 'All apps')));
  DOCK.forEach(id => dock.append(item(id)));
  const extra = [...new Set(ctx.wins.map(w => w.appId))].filter(id => !DOCK.includes(id));
  if (extra.length) { dock.append(h('span', { class: 'dock-sep' })); extra.forEach(id => dock.append(item(id))); }
}

// ───────────────────────── Widgets ─────────────────────────
function ring(pctDone, label) {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 64 64" class="ring"><circle cx="32" cy="32" r="${r}" fill="none" stroke="#e9ecf5" stroke-width="8"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pctDone)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="15" font-weight="900" fill="#1f2440">${label}</text></svg>`;
}

async function renderWidgets() {
  if (!ctx) return;
  const { me, widgets } = ctx;
  const [assignments, notes, lessons, journal] = await Promise.all([
    store.list('assignments', { childId: me.id }), store.list('notes', { childId: me.id }), store.list('lessons'), store.get('journal', `${me.id}_${today()}`),
  ]);
  const L = Object.fromEntries(lessons.map(l => [l.id, l]));
  const t = today();
  const mine = assignments.filter(a => L[a.lessonId]);
  const todo = mine.filter(a => a.date <= t && ['assigned', 'in_progress'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date));
  const doneToday = mine.filter(a => a.completedAt && new Date(a.completedAt).toDateString() === new Date().toDateString());
  const total = todo.length + doneToday.length;
  const newFeedback = mine.filter(a => a.status === 'reviewed' && !a.feedbackSeen);
  const unread = notes.filter(n => !n.read);
  ctx.unread = { notes: unread, feedback: newFeedback };
  ctx.bellEl?.querySelector('.dot').classList.toggle('hidden', !(unread.length + newFeedback.length));
  widgets.innerHTML = '';

  // Today
  const w = h('div', { class: 'kw kw-today' },
    h('div', { class: 'kw-head' }, h('div', { html: ring(total ? doneToday.length / total : 1, total ? `${doneToday.length}/${total}` : '✓') }),
      h('div', {}, h('div', { class: 'kw-hi' }, `${greeting()}, ${me.name}!`), h('div', { class: 'muted small' }, todo.length ? `${todo.length} lesson${todo.length > 1 ? 's' : ''} to do today` : doneToday.length ? '🎉 All done for today — amazing!' : 'No lessons today. Explore, create or play!'))));
  todo.slice(0, 4).forEach(a => {
    const l = L[a.lessonId]; const s = subject(l.subject);
    w.append(h('button', { class: 'kw-lesson', onclick: () => openApp('lessons', { assignmentId: a.id }) },
      h('span', { class: 'si', style: { background: s.color + '26' } }, s.icon), h('span', { class: 'tx' }, h('b', {}, l.title), h('small', {}, `${s.name} · ${l.durationMins || 30} min${a.date < t ? ' · from ' + fmtDate(a.date) : ''}`)),
      h('span', { class: 'go' }, a.status === 'in_progress' ? '⏯' : '▶')));
  });
  if (todo.length > 4) w.append(h('button', { class: 'btn btn-sm', style: { width: '100%' }, onclick: () => openApp('lessons') }, `See all ${todo.length} →`));
  widgets.append(w);

  // Mood check-in (once a day)
  if (!journal?.mood) {
    const moods = [['😄', 'Great'], ['🙂', 'Good'], ['😐', 'OK'], ['😟', 'Worried'], ['😢', 'Sad']];
    widgets.append(h('div', { class: 'kw' }, h('div', { class: 'kw-title' }, 'How are you feeling today?'),
      h('div', { class: 'mood-row' }, ...moods.map(([e, l]) => h('button', { title: l, onclick: async () => {
        await store.put('journal', { ...(journal || {}), id: `${me.id}_${today()}`, childId: me.id, date: today(), mood: e, moodLabel: l });
        store.log('mood', { mood: e, label: l });
        sfx('pop');
        toast(['😟', '😢'].includes(e) ? "Thanks for telling me 💛 It's a good idea to talk to Mum or Dad about it." : 'Thanks for sharing! Have a brilliant day ✨', 'good', 4500);
        renderWidgets();
      } }, h('span', {}, e), h('small', {}, l))))));
  }

  // Notes from parents
  unread.sort((a, b) => b.ts - a.ts).slice(0, 2).forEach(n => {
    widgets.append(h('div', { class: 'kw kw-note' }, h('div', { class: 'small' }, `${n.fromAvatar || '💌'} Note from ${n.from}`), h('p', {}, n.text),
      h('button', { class: 'btn btn-sm', onclick: async () => { n.read = true; await store.put('notes', n); sfx('pop'); renderWidgets(); } }, '👍 Thanks!')));
  });
  if (newFeedback.length) widgets.append(h('button', { class: 'kw kw-feedback', onclick: () => openApp('lessons', { tab: 'done' }) }, `💬 New feedback on ${newFeedback.length} lesson${newFeedback.length > 1 ? 's' : ''}!`));

  // Word of the day
  const dayNo = Math.floor(Date.now() / 86400000);
  const [word, mean, ex] = WORDS[dayNo % WORDS.length];
  widgets.append(h('div', { class: 'kw kw-word' }, h('div', { class: 'kw-title' }, '🪄 Word of the day'),
    h('div', { class: 'row' }, h('b', { class: 'big-word' }, word), h('button', { class: 'icon-btn', title: 'Say it', onclick: () => say(`${word}. ${mean}. ${ex}`) }, '🔊')),
    h('div', { class: 'small' }, mean), h('div', { class: 'small muted' }, `“${ex}”`)));

  // Ask Ollie quick box
  const q = h('input', { class: 'input', placeholder: 'Ask Ollie anything…' });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) { openApp('helper', { ask: q.value.trim() }); q.value = ''; } });
  widgets.append(h('div', { class: 'kw kw-ask' }, h('span', { style: { fontSize: '26px' } }, '🦉'), q));

  const lb = ctx.icons.querySelector('[data-app="lessons"] .badge');
  lb.textContent = todo.length; lb.classList.toggle('hidden', !todo.length);
}

// ───────────────────────── Pop-ups: launcher, menus, notifications ─────────────────────────
function closePops() { ctx?.desk.querySelectorAll('.kos-pop').forEach(p => p.remove()); }

function launcher() {
  if (ctx.desk.querySelector('.kos-launcher')) return closePops();
  closePops();
  const q = h('input', { class: 'input kos-search', placeholder: '🔎 Find an app…' });
  const grid = h('div', { class: 'kl-cats' });
  const draw = () => {
    grid.innerHTML = '';
    const term = q.value.toLowerCase();
    for (const [cat, label] of Object.entries(CATS)) {
      const apps = Object.entries(APPS).filter(([, a]) => a.cat === cat && (!term || a.name.toLowerCase().includes(term)));
      if (!apps.length) continue;
      grid.append(h('div', { class: 'kl-cat' }, h('h4', {}, label), h('div', { class: 'kl-grid' }, ...apps.map(([id, a]) => h('button', { class: 'kl-app', onclick: () => { closePops(); openApp(id); } }, h('span', { class: 'ic', style: { '--c': a.color } }, a.icon), a.name)))));
    }
  };
  q.oninput = draw;
  q.onkeydown = e => { if (e.key === 'Enter') grid.querySelector('.kl-app')?.click(); };
  const pop = h('div', { class: 'kos-pop kos-launcher' }, h('div', { class: 'kl-inner' }, q, grid));
  pop.addEventListener('pointerdown', e => { if (e.target === pop) closePops(); });
  ctx.desk.append(pop);
  draw(); setTimeout(() => q.focus(), 30);
  sfx('click');
}

function meMenu(anchor) {
  closePops();
  const r = anchor.getBoundingClientRect();
  const { prefs } = ctx;
  const walls = h('div', { class: 'wall-pick' });
  WALLPAPERS.forEach((wp, i) => walls.append(h('button', { title: wp.name, class: !prefs.wallpaperImage && prefs.wallpaper === i ? 'on' : '', style: { background: wp.css.startsWith('url') ? `center/cover ${wp.css}` : wp.css }, onclick: () => { setWallpaper(i, null); closePops(); } })));
  const m = h('div', { class: 'kos-pop kos-menu', style: { top: r.bottom + 8 + 'px', right: (innerWidth - r.right) + 'px' } },
    h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { style: { fontSize: '40px' } }, ctx.me.avatar), h('div', {}, h('b', { style: { fontSize: '1.15em' } }, ctx.me.name), h('div', { class: 'small muted' }, ctx.me.yearGroup || ''))),
    h('div', { class: 'kw-title' }, '🖼️ Wallpaper'), walls,
    h('button', { class: 'btn btn-sm', style: { margin: '6px 0 12px' }, onclick: () => { closePops(); openApp('pictures', { wallpaper: true }); } }, '🎨 Make my own wallpaper'),
    h('div', { class: 'kw-title' }, '🔠 Text'),
    h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
      ...[['normal', 'Normal'], ['large', 'Bigger']].map(([v, l]) => h('button', { class: `btn btn-sm ${prefs.textSize === v ? 'btn-primary' : ''}`, onclick: () => { prefs.textSize = v; savePrefs(); closePops(); } }, l)),
      ...[['Nunito', 'Round'], ['Lexend', 'Easy-read']].map(([v, l]) => h('button', { class: `btn btn-sm ${prefs.font === v ? 'btn-primary' : ''}`, style: { fontFamily: v }, onclick: () => { prefs.font = v; savePrefs(); closePops(); } }, l))),
    h('button', { class: 'btn', style: { width: '100%' }, onclick: async () => { closePops(); if (await closeAllGuarded()) logout(); } }, '🚪 Log out'));
  ctx.desk.append(m);
}

function notifications(anchor) {
  closePops();
  const r = anchor.getBoundingClientRect();
  const { notes = [], feedback = [] } = ctx.unread || {};
  const m = h('div', { class: 'kos-pop kos-menu', style: { top: r.bottom + 8 + 'px', right: (innerWidth - r.right) + 'px', width: '320px' } }, h('div', { class: 'kw-title' }, '🔔 Messages'));
  if (!notes.length && !feedback.length) m.append(h('p', { class: 'muted' }, 'No new messages.'));
  notes.forEach(n => m.append(h('div', { class: 'notif' }, h('b', {}, `${n.fromAvatar || '💌'} ${n.from}`), h('div', {}, n.text))));
  feedback.forEach(a => m.append(h('button', { class: 'notif', onclick: () => { closePops(); openApp('lessons', { tab: 'done' }); } }, h('b', {}, '💬 New feedback'), h('div', {}, a.parentComment || 'Tap to see what Mum or Dad said'))));
  ctx.desk.append(m);
}

function contextMenu(x, y) {
  closePops();
  const m = h('div', { class: 'kos-pop kos-ctx', style: { left: x + 'px', top: y + 'px' } },
    h('button', { onclick: () => { closePops(); launcher(); } }, '▦  All apps'),
    h('button', { onclick: () => { closePops(); setWallpaper(((ctx.prefs.wallpaper || 0) + 1) % WALLPAPERS.length, null); } }, '🖼️  Next wallpaper'),
    h('button', { onclick: () => { closePops(); ctx.wins.forEach(w => w.minimise()); } }, '⬇️  Show desktop'),
    h('button', { onclick: () => { closePops(); renderWidgets(); renderTop(); } }, '🔄  Refresh'));
  ctx.desk.append(m);
}

// ───────────────────────── Window manager ─────────────────────────
export async function openApp(id, args = {}) {
  if (!ctx) return;
  const def = APPS[id];
  if (!def) return;
  closePops();
  if (def.single) {
    const existing = ctx.wins.find(w => w.appId === id);
    if (existing) { existing.restore(); existing.focus(); existing.instance?.handle?.(args); return existing; }
  }
  sfx('open');
  const win = createWindow(id, def, args.title);
  try {
    const mod = await def.load();
    win.instance = (await mod.open(win, ctx, args)) || {};
  } catch (e) {
    console.error(e);
    win.body.innerHTML = `<div class="empty"><span class="big">😕</span>Sorry, this app had a problem.<br><span class="small">${esc(e.message)}</span></div>`;
  }
  renderDock();
  return win;
}

/** Ask to save before closing. Returns true if it's OK to continue. */
async function askSave(win) {
  if (!win.dirty?.isDirty?.()) return true;
  win.restore(); win.focus();
  win.el.classList.add('attn'); setTimeout(() => win.el.classList.remove('attn'), 700);
  const name = win.dirty.name?.() || 'your work';
  const c = await choose({ title: 'Save your work?', icon: '💾', message: `Do you want to save “${name}” before you close it?`, choices: [{ label: 'Cancel', value: 'cancel' }, { label: "🗑 Don't save", value: 'discard', cls: 'btn-danger' }, { label: '💾 Save', value: 'save', cls: 'btn-primary' }] });
  if (c === 'save') { try { await win.dirty.save(); toast('💾 Saved!', 'good'); return true; } catch (e) { toast(e.message, 'error'); return false; } }
  return c === 'discard';
}

async function closeAllGuarded() {
  for (const w of [...ctx.wins]) { if (!(await w.close())) return false; }
  return true;
}
async function saveAll() {
  for (const w of [...(ctx?.wins || [])]) { try { if (w.dirty?.isDirty?.()) await w.dirty.save(); } catch { } }
}

function createWindow(appId, def, title) {
  const area = ctx.layer.getBoundingClientRect();
  const small = innerWidth < 820 || innerHeight < 600;
  const n = ctx.wins.length;
  const W = Math.min(def.w, area.width - 30), H = Math.min(def.h, area.height - 20);
  const left = Math.max(8, (area.width - W) / 2 + (n % 5) * 26 - 60), top = Math.max(6, (area.height - H) / 2 + (n % 5) * 22 - 20);
  const el = h('div', { class: `win ${small ? 'max' : ''}`, style: { left: left + 'px', top: top + 'px', width: W + 'px', height: H + 'px', '--c': def.color } });
  const tEl = h('span', { class: 't' }, title || def.name);
  const dirtyDot = h('span', { class: 'dirty-dot hidden', title: 'Not saved yet' }, '●');
  const bar = h('div', { class: 'win-bar' }, h('span', { class: 'e' }, def.icon), tEl, dirtyDot);
  const bMin = h('button', { class: 'wb wb-min', title: 'Hide' }, '–'), bMax = h('button', { class: 'wb wb-max', title: 'Make big' }, '⤢'), bX = h('button', { class: 'wb wb-x', title: 'Close' }, '✕');
  bar.append(h('span', { class: 'spacer' }), bMin, bMax, bX);
  const body = h('div', { class: 'win-body' });
  const grip = h('div', { class: 'win-resize' });
  el.append(bar, body, grip);
  ctx.layer.append(el);

  const closers = [];
  const win = {
    id: uid('w'), appId, el, body, active: false, dirty: null,
    setTitle(t) { tEl.textContent = t; },
    onClose(fn) { closers.push(fn); },
    /** Register save-before-close: { isDirty: () => bool, save: async () => {}, name: () => string } */
    guard(g) { win.dirty = g; },
    markDirty(d) { dirtyDot.classList.toggle('hidden', !d); },
    focus() { ctx.wins.forEach(w => { w.active = false; w.el.classList.add('inactive'); }); win.active = true; el.classList.remove('inactive'); el.style.zIndex = ++ctx.z; renderDock(); },
    restore() { el.classList.remove('min'); },
    minimise() { el.classList.add('min'); win.active = false; renderDock(); },
    async close(force) {
      if (!force) {
        if (!(await askSave(win))) return false;
        for (const fn of closers) { if ((await fn()) === false) return false; }
      } else closers.forEach(fn => { try { fn(true); } catch { } });
      if (!force) sfx('close');
      el.classList.add('closing');
      setTimeout(() => el.remove(), force ? 0 : 140);
      if (ctx) { ctx.wins = ctx.wins.filter(w => w !== win); renderDock(); const last = ctx.wins.filter(w => !w.el.classList.contains('min')).pop(); last?.focus(); }
      return true;
    },
  };
  ctx.wins.push(win);
  bMin.onclick = () => win.minimise();
  bMax.onclick = () => { el.classList.remove('snap-l', 'snap-r'); el.classList.toggle('max'); };
  bar.ondblclick = e => { if (!e.target.closest('button')) { el.classList.remove('snap-l', 'snap-r'); el.classList.toggle('max'); } };
  bX.onclick = () => win.close();
  el.addEventListener('pointerdown', () => { if (!win.active) win.focus(); }, true);
  body.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && win.dirty) { e.preventDefault(); win.dirty.save().then(() => toast('💾 Saved!', 'good')).catch(err => toast(err.message, 'error')); } });

  // dragging with snap (top = maximise, left/right edge = half screen)
  const hint = () => ctx.layer.querySelector('.snap-hint') || ctx.layer.appendChild(h('div', { class: 'snap-hint hidden' }));
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.button !== 0) return;
    const wasSnapped = el.classList.contains('max') || el.classList.contains('snap-l') || el.classList.contains('snap-r');
    const lr = ctx.layer.getBoundingClientRect();
    let sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, moved = false, snap = null;
    bar.setPointerCapture(e.pointerId);
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved && wasSnapped) { // un-snap under the cursor
        el.classList.remove('max', 'snap-l', 'snap-r');
        ox = ev.clientX - lr.left - el.offsetWidth / 2; oy = 0; sx = ev.clientX; sy = ev.clientY;
      }
      moved = true;
      el.style.left = Math.min(lr.width - 80, Math.max(-el.offsetWidth + 80, ox + ev.clientX - sx)) + 'px';
      el.style.top = Math.min(lr.height - 50, Math.max(0, oy + ev.clientY - sy)) + 'px';
      snap = ev.clientY - lr.top < 4 ? 'max' : ev.clientX - lr.left < 6 ? 'snap-l' : lr.right - ev.clientX < 6 ? 'snap-r' : null;
      const hn = hint(); hn.className = `snap-hint ${snap ? 'sh-' + snap : 'hidden'}`;
    };
    const up = () => {
      bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up);
      hint().className = 'snap-hint hidden';
      if (snap) el.classList.add(snap);
    };
    bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
  });
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight;
    grip.setPointerCapture(e.pointerId);
    const mv = ev => { el.style.width = Math.max(320, ow + ev.clientX - sx) + 'px'; el.style.height = Math.max(240, oh + ev.clientY - sy) + 'px'; };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  win.focus();
  return win;
}
