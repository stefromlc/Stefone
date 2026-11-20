// My Stars — stars, streak and badges (computed from real activity).
import { store } from '../store.js';
import { h, localDate, addDays, today } from '../util.js';
import { starsFor } from './player.js';

export async function computeRewards(childId) {
  const [asg, prac, docs, chats, acts] = await Promise.all([
    store.list('assignments', { childId }), store.list('practice', { childId }), store.list('documents', { childId }),
    store.list('chats', { childId }), store.list('activity', { childId }),
  ]);
  const done = asg.filter(a => a.completedAt);
  const stars = done.reduce((t, a) => t + (a.stars || 0), 0) + prac.reduce((t, p) => t + starsFor(p.correct / p.total), 0);
  const days = new Set([...done.map(a => localDate(new Date(a.completedAt))), ...prac.map(p => localDate(new Date(p.ts)))]);
  let streak = 0; let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  const badges = [
    ['🌱', 'First lesson', 'Finish your first lesson', done.length >= 1],
    ['📚', 'Bookworm', 'Finish 10 lessons', done.length >= 10],
    ['🏆', 'Lesson legend', 'Finish 25 lessons', done.length >= 25],
    ['💯', 'Perfect!', 'Get 100% in a lesson', done.some(a => a.score === 1)],
    ['🔥', 'On fire', '3 days in a row', streak >= 3],
    ['🌟', 'Super streak', '7 days in a row', streak >= 7],
    ['✖️', 'Times-table titan', '5 times-table rounds with 9+ right', prac.filter(p => p.skill === 'maths.times-tables' && p.correct / p.total >= 0.9).length >= 5],
    ['🔤', 'Spelling star', 'Get every spelling right', prac.some(p => p.kind === 'spelling' && p.correct === p.total)],
    ['⚡', 'Speedy', '10 maths questions in under 60 seconds', prac.some(p => p.kind === 'maths' && p.correct >= 9 && p.durationSec < 60)],
    ['✍️', 'Writer', 'Save 5 pieces of writing', docs.filter(x => x.type === 'doc').length >= 5],
    ['🎨', 'Artist', 'Save 3 pictures', docs.filter(x => x.type === 'drawing').length >= 3],
    ['🧭', 'Explorer', 'Read 10 encyclopedia pages', acts.filter(a => a.type === 'browse').length >= 10],
    ['🦉', 'Curious mind', 'Have 5 chats with the helper', chats.length >= 5],
  ].map(([e, name, desc, got]) => ({ e, name, desc, got }));
  return { stars, streak, days, badges, lessons: done.length };
}

export async function open(win, ctx) {
  const pad = h('div', { class: 'app-pad', style: { flex: 1, overflow: 'auto' } });
  win.body.append(pad);
  const r = await computeRewards(ctx.me.id);
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today(), i - 27));
  pad.append(
    h('div', { style: { textAlign: 'center' } }, h('div', { style: { fontSize: '64px' } }, '⭐'), h('h1', { style: { fontSize: '2.6em', margin: 0 } }, r.stars), h('p', { class: 'muted' }, 'stars collected')),
    h('div', { class: 'grid2', style: { margin: '18px 0' } },
      h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { style: { fontSize: '34px' } }, '🔥'), h('b', { style: { fontSize: '1.6em' } }, r.streak), h('div', { class: 'muted' }, 'day streak')),
      h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { style: { fontSize: '34px' } }, '📒'), h('b', { style: { fontSize: '1.6em' } }, r.lessons), h('div', { class: 'muted' }, 'lessons finished'))),
    h('h3', {}, 'My last 4 weeks'), h('div', { class: 'streak', style: { marginBottom: '18px' } }, ...last28.map(d => h('i', { class: r.days.has(d) ? 'on' : '', title: d }))),
    h('h3', {}, `Badges (${r.badges.filter(b => b.got).length}/${r.badges.length})`),
    h('div', { class: 'badge-grid' }, ...r.badges.map(b => h('div', { class: `badge-card ${b.got ? '' : 'off'}` }, h('div', { class: 'e' }, b.e), h('b', {}, b.name), h('div', { class: 'small muted' }, b.desc)))));
}
