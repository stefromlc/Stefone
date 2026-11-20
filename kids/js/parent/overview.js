import { store } from '../store.js';
import { h, esc, today, fmtDuration, pct, timeAgo, md } from '../util.js';
import { subject, skillName } from '../skills.js';
import { header, go, refreshBadges } from './shell.js';
import { childData, summarise, lessonsMap } from './data.js';
import { computeRewards } from '../apps/stars.js';

export const ACT_LABEL = {
  login: a => '🔑 Logged in',
  lesson_start: a => `▶️ Started “${a.title}”`,
  lesson_complete: a => `✅ Finished “${a.title}”${a.score != null ? ` — ${pct(a.score)}` : ''}`,
  practice: a => `🎯 Practised ${a.title} — ${pct(a.score)}`,
  browse: a => `🧭 Read about “${a.title}”`,
  browse_search: a => `🔎 Searched “${a.q}”`,
  browse_blocked: a => `⛔ Blocked search “${a.q}”`,
  browse_site: a => `🌐 Opened ${a.title}`,
  helper_flag: a => `🚩 Helper flag: ${a.reason}`,
  doc_sent: a => `📤 Sent you “${a.title}”`,
  mood: a => `${a.mood} Feeling ${String(a.label || '').toLowerCase()} today`,
  journal: a => `📔 Wrote in their journal ${a.mood || ''}`,
  picture: a => `🎨 Made a picture: “${String(a.prompt || '').replace(/\. Style:.*$/, '').slice(0, 60)}”`,
  picture_blocked: a => `⛔ Picture request blocked: “${String(a.prompt || '').slice(0, 60)}”`,
  word: a => `🪄 Looked up “${a.title}”`,
  detective: a => `🔍 Photo Detective: ${a.title}`,
  reading: a => `📖 Reading Buddy: “${a.title}”${a.score != null ? ` — ${pct(a.score)}` : ''}`,
  game: a => `🧩 Played ${a.title}${a.score != null ? ` — ${pct(a.score)}` : ''}`,
  code: a => `🐢 Completed Code Turtle “${a.title}”`,
  search: a => `🔎 Ollie looked up: ${a.q}`,
};

export async function render(main, state) {
  header(main, `${new Date().getHours() < 12 ? 'Good morning' : 'Hello'}, ${state.me.name} 👋`, {
    actions: [h('button', { class: 'btn btn-ai', onclick: () => go('lessons', 'new') }, '✨ Create a lesson'), h('button', { class: 'btn', onclick: () => go('planner') }, '📅 Plan the week')],
  });
  if (!state.kids.length) {
    main.append(h('div', { class: 'card empty' }, h('span', { class: 'big' }, '👧👦'), 'No children yet. ', store.isAdmin ? h('a', { href: '#/p/settings/family' }, 'Add them in Settings → Family') : 'Ask Dad to add them in Settings.'));
    return;
  }
  // Alerts
  const alerts = h('div');
  main.append(alerts);
  if (!state.settings.apiKey) alerts.append(h('div', { class: 'alert info' }, '✨', h('div', {}, h('b', {}, 'AI is not connected yet. '), store.isAdmin ? h('a', { href: '#/p/settings/ai' }, 'Add your OpenRouter key') : 'Ask Dad to add an OpenRouter key in Settings.', ' — needed for AI lessons, marking, gap analysis and the kids\' helper.')));
  const counts = await refreshBadges();
  if (counts?.flags) alerts.append(h('div', { class: 'alert bad' }, '🚩', h('div', {}, h('b', {}, `${counts.flags} helper chat${counts.flags > 1 ? 's' : ''} flagged for your attention. `), h('a', { href: '#/p/chats' }, 'Review now'))));
  if (counts?.review) alerts.append(h('div', { class: 'alert' }, '✅', h('div', {}, h('b', {}, `${counts.review} piece${counts.review > 1 ? 's' : ''} of work waiting for review. `), h('a', { href: '#/p/review' }, 'Open review'))));

  const L = await lessonsMap();
  const grid = h('div', { class: 'grid2' });
  main.append(grid);
  const feed = [];
  for (const kid of state.kids) {
    const d = await childData(kid.id);
    const s = summarise(d, 7);
    const rw = await computeRewards(kid.id);
    const mood = await store.get('journal', `${kid.id}_${today()}`).catch(() => null);
    feed.push(...d.activity.map(a => ({ ...a, kid })));
    const todays = d.assignments.filter(a => a.date === today() || (a.date < today() && !a.completedAt)).filter(a => L[a.lessonId]).sort((a, b) => a.date.localeCompare(b.date));
    const card = h('div', { class: 'card' },
      h('div', { class: 'kid-card-head' }, h('div', { class: 'av', style: { background: (kid.color || '#ddd') + '33' } }, kid.avatar), h('div', { style: { flex: 1 } }, h('h3', { style: { margin: 0, fontSize: '1.3em' } }, kid.name), h('span', { class: 'muted small' }, `${kid.yearGroup || ''} · ⭐ ${rw.stars} · 🔥 ${rw.streak}-day streak${mood?.mood ? ` · today ${mood.mood} ${mood.moodLabel || ''}` : ''}`)),
        h('button', { class: 'btn btn-sm', onclick: () => { state.kidId = kid.id; go('progress'); } }, 'Progress →')),
      h('div', { class: 'stats-row' },
        stat(`${s.doneOfDue}/${s.due}`, 'Lessons (7 days)'), stat(pct(s.avgScore), 'Avg score'), stat(fmtDuration(s.todayTime), 'Time today'), stat(s.practiceRounds, 'Practice rounds')),
      h('h4', { style: { margin: '14px 0 6px' } }, "Today's lessons"));
    if (!todays.length) card.append(h('p', { class: 'muted small' }, 'Nothing scheduled. ', h('a', { href: '#/p/planner' }, 'Plan some lessons')));
    todays.forEach(a => { const l = L[a.lessonId]; const sj = subject(l.subject); card.append(h('div', { class: 'row', style: { padding: '5px 0', borderBottom: '1px dashed var(--line)' } }, h('span', {}, sj.icon), h('a', { href: `#/p/lessons/${l.id}`, style: { flex: 1, color: 'inherit', textDecoration: 'none', fontWeight: 700 } }, l.title), a.date < today() ? h('span', { class: 'pill warn' }, 'overdue') : null, statusPill(a))); });
    if (d.gaps.length) {
      card.append(h('h4', { style: { margin: '14px 0 6px' } }, '⚠️ Needs a bit of help with'));
      d.gaps.slice(0, 3).forEach(g => card.append(h('div', { class: 'row', style: { padding: '4px 0' } }, h('span', { style: { flex: 1 } }, skillName(g.skill)), h('span', { class: 'pill bad' }, pct(g.mastery)), h('button', { class: 'btn btn-sm btn-ai', onclick: () => go('lessons', `bridge:${kid.id}:${g.skill}`) }, '✨ Bridging lesson'))));
    }
    grid.append(card);
  }
  feed.sort((a, b) => b.ts - a.ts);
  main.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Recent activity'),
    ...(feed.length ? feed.slice(0, 20).map(a => h('div', { class: 'feed-item' }, h('span', {}, a.kid.avatar), h('span', { style: { flex: 1 } }, h('b', {}, a.kid.name), ' ', (ACT_LABEL[a.type] || (() => a.type))(a)), h('span', { class: 'muted small' }, timeAgo(a.ts)))) : [h('p', { class: 'muted' }, 'No activity yet.')])));
}

export function stat(v, l) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)); }
export function statusPill(a) {
  const map = { assigned: ['Not started', ''], in_progress: ['In progress', 'brand'], complete: [`Done${a.score != null ? ' · ' + pct(a.score) : ''}`, 'good'], submitted: ['Needs review', 'warn'], reviewed: [`Reviewed${a.score != null ? ' · ' + pct(a.score) : ''}`, 'good'] };
  const [t, c] = map[a.status] || [a.status, ''];
  return h('span', { class: `pill ${c}` }, t);
}
