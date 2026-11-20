// Kids' "My Lessons" app: to-do list, lesson player, finished lessons with feedback.
import { store } from '../store.js';
import { esc, h, today, fmtDate, md, pct } from '../util.js';
import { subject } from '../skills.js';
import { renderPlayer, correctText, responseText } from './player.js';
import { storedImg } from '../media.js';

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let tab = args.tab || 'todo';
  let player = null;

  const exitPlayer = () => { player?.destroy(); player = null; win.setTitle('My Lessons'); ctx.refresh(); list(); };
  win.onClose(() => { player?.destroy(); ctx.refresh(); });

  async function startAssignment(id) {
    const a = await store.get('assignments', id);
    const lesson = a && await store.get('lessons', a.lessonId);
    if (!lesson) return list();
    win.setTitle(lesson.title);
    win.body.innerHTML = '';
    player = renderPlayer(win.body, {
      lesson, assignment: a, child: me, onExit: exitPlayer,
      onAskHelper: context => ctx.openApp('helper', { context }),
      autoRead: !!ctx.prefs?.autoRead, onAutoRead: v => { if (ctx.prefs) { ctx.prefs.autoRead = v; store.put('prefs', ctx.prefs); } },
    });
  }

  async function review(a) {
    const lesson = await store.get('lessons', a.lessonId);
    if (!lesson) return;
    if (a.status === 'reviewed' && !a.feedbackSeen) { a.feedbackSeen = true; store.put('assignments', a); }
    win.body.innerHTML = '';
    const pad = h('div', { class: 'app-pad kid-big' },
      h('button', { class: 'btn', onclick: list }, '⬅ Back'),
      h('h2', { style: { marginTop: '14px' } }, lesson.title),
      h('div', { class: 'stars', style: { fontSize: '32px' } }, '⭐'.repeat(a.stars || 0)),
      a.parentComment ? h('div', { class: 'feedback info' }, h('div', {}, `💬 ${a.reviewedBy || 'Mum & Dad'} said:`), h('div', { style: { fontWeight: 600, marginTop: '4px' } }, a.parentComment)) : null);
    lesson.activities.forEach((act, i) => {
      const ans = a.answers?.[act.id];
      if (!ans) return;
      const resp = responseText(act, ans.response);
      pad.append(h('div', { class: 'card', style: { margin: '12px 0' } },
        h('div', { class: 'md', style: { fontWeight: 700 }, html: md(`**${i + 1}.** ${act.prompt}`) }),
        h('p', {}, h('b', {}, 'You said: '), String(resp ?? '')),
        ans.pending ? h('span', { class: 'pill warn' }, 'Waiting for a grown-up to check') : h('span', { class: `pill ${ans.correct ? 'good' : 'bad'}` }, ans.correct ? '✓ Correct' : `✗ Answer: ${correctText(act)}`),
        ans.feedback ? h('p', { class: 'small' }, ans.feedback) : null,
        ans.parentNote ? h('p', { class: 'small' }, '💬 ', ans.parentNote) : null));
    });
    win.body.append(pad);
  }

  async function list() {
    const [asgs, lessons] = await Promise.all([store.list('assignments', { childId: me.id }), store.list('lessons')]);
    const L = Object.fromEntries(lessons.map(l => [l.id, l]));
    const t = today();
    const mine = asgs.filter(a => L[a.lessonId]);
    const todo = mine.filter(a => a.date <= t && ['assigned', 'in_progress'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date));
    const soon = mine.filter(a => a.date > t && ['assigned', 'in_progress'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date));
    const done = mine.filter(a => ['complete', 'submitted', 'reviewed'].includes(a.status)).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    win.body.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    [['todo', `📌 To do (${todo.length})`], ['soon', `📅 Coming up (${soon.length})`], ['done', `✅ Finished (${done.length})`]].forEach(([k, label]) =>
      tabs.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; list(); } }, label)));
    const pad = h('div', { class: 'app-pad' });
    win.body.append(tabs, pad);
    const card = (a, onclick, extra) => {
      const l = L[a.lessonId]; const s = subject(l.subject);
      const steps = 2 + (l.sections?.length || 0) + (l.activities?.length || 0);
      const prog = a.status === 'in_progress' ? Math.min(1, (a.progress || 0) / (steps - 1)) : null;
      return h('div', { class: `lesson-card ${onclick ? '' : 'static'}`, onclick },
        l.coverImageId ? h('div', { class: 'lc-cover' }, storedImg(l.coverImageId)) : h('div', { class: 'si', style: { background: s.color + '22' } }, s.icon),
        h('div', { style: { flex: 1, minWidth: 0 } }, h('b', { style: { fontSize: '1.1em' } }, l.title), h('div', { class: 'muted small' }, `${s.icon} ${s.name} · ${l.durationMins || 30} min · ${fmtDate(a.date)} · ${l.activities?.length || 0} activities`),
          prog != null ? h('div', { class: 'bar', style: { marginTop: '6px', maxWidth: '260px' } }, h('i', { style: { width: Math.round(prog * 100) + '%', background: s.color } })) : null),
        extra);
    };
    const items = tab === 'todo' ? todo : tab === 'soon' ? soon : done;
    if (!items.length) pad.append(h('div', { class: 'empty' }, h('span', { class: 'big' }, tab === 'todo' ? '🎉' : tab === 'soon' ? '📭' : '🌱'), tab === 'todo' ? 'Nothing to do right now — amazing!' : tab === 'soon' ? 'No lessons planned yet.' : 'Finished lessons will appear here.'));
    items.forEach(a => {
      if (tab === 'done') pad.append(card(a, () => review(a), h('div', { style: { textAlign: 'right' } }, h('div', {}, '⭐'.repeat(a.stars || 0)), a.score != null ? h('span', { class: 'small muted' }, pct(a.score)) : null, a.status === 'reviewed' && !a.feedbackSeen ? h('div', { class: 'pill brand' }, '💬 New feedback') : a.status === 'submitted' ? h('div', { class: 'pill warn' }, 'Being checked') : null)));
      else pad.append(card(a, tab === 'todo' ? () => startAssignment(a.id) : null, tab === 'todo' ? h('button', { class: 'btn btn-primary' }, a.status === 'in_progress' ? 'Carry on ▶' : 'Start ▶') : null));
    });
  }

  if (args.assignmentId) await startAssignment(args.assignmentId); else await list();
  return { handle: a => { if (a?.assignmentId) { player?.destroy(); startAssignment(a.assignmentId); } else if (a?.tab) { tab = a.tab; player?.destroy(); player = null; list(); } } };
}
