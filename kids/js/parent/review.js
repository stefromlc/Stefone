// Review & mark children's work: lesson answers (AI-marked or pending) and documents they sent.
import { store } from '../store.js';
import { h, esc, toast, md, pct, fmtDate, timeAgo, sanitize, uid, fmtDuration } from '../util.js';
import { subject, skillSubject } from '../skills.js';
import { markAnswer, aiReady } from '../ai.js';
import { header, go, state, kidById, refreshBadges, rerender } from './shell.js';
import { lessonsMap } from './data.js';
import { correctText, responseText, starsFor } from '../apps/player.js';
import { storedImg } from '../media.js';

export async function render(main, st, arg) {
  if (arg) { const a = await store.get('assignments', arg); if (a) return reviewAssignment(main, a); }
  header(main, '✅ Review work');
  const [asgs, docs, L] = await Promise.all([store.list('assignments'), store.list('documents'), lessonsMap()]);
  const kname = id => { const k = kidById(id); return k ? `${k.avatar} ${k.name}` : '?'; };
  const since = Date.now() - 14 * 86400000;
  const needs = asgs.filter(a => a.status === 'submitted' && L[a.lessonId]).sort((a, b) => a.completedAt - b.completedAt);
  const recent = asgs.filter(a => a.status === 'complete' && a.completedAt > since && L[a.lessonId]).sort((a, b) => b.completedAt - a.completedAt);
  const reviewed = asgs.filter(a => a.status === 'reviewed' && L[a.lessonId]).sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0)).slice(0, 15);
  const sent = docs.filter(d => d.submitted && !d.reviewed).sort((a, b) => b.submittedAt - a.submittedAt);

  const section = (title, items, row, empty) => {
    const c = h('div', { class: 'card', style: { marginBottom: '14px' } }, h('h3', {}, `${title} (${items.length})`));
    if (!items.length) c.append(h('p', { class: 'muted' }, empty));
    items.forEach(x => c.append(row(x)));
    main.append(c);
  };
  const asgRow = a => { const l = L[a.lessonId]; return h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }, onclick: () => go('review', a.id) },
    h('span', {}, subject(l.subject).icon), h('div', { style: { flex: 1 } }, h('b', {}, l.title), h('div', { class: 'small muted' }, `${kname(a.childId)} · ${timeAgo(a.completedAt || a.updatedAt)}${a.timeSpentSec ? ' · ' + fmtDuration(a.timeSpentSec) : ''}`)),
    a.score != null ? h('span', { class: 'pill' }, pct(a.score)) : null, h('button', { class: 'btn btn-sm' }, 'Open →')); };
  section('📝 Needs your review', needs, asgRow, 'Nothing waiting — answers the AI could not mark (or writing without AI) appear here.');
  section('📤 Work sent by the kids', sent, d => h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }, onclick: () => reviewDoc(main, d) },
    h('span', {}, { doc: '📝', sheet: '📊', drawing: '🖼️' }[d.type]), h('div', { style: { flex: 1 } }, h('b', {}, d.title), h('div', { class: 'small muted' }, `${kname(d.childId)} · ${timeAgo(d.submittedAt)}`)), h('button', { class: 'btn btn-sm' }, 'Open →')), 'When the kids press “Send” in Writer, Sheets or Paint it appears here.');
  section('✅ Recently completed (auto-marked)', recent, asgRow, 'No completed lessons in the last 2 weeks.');
  section('🗂 Reviewed', reviewed, asgRow, 'Nothing reviewed yet.');
}

async function reviewAssignment(main, a) {
  const lesson = await store.get('lessons', a.lessonId);
  const kid = kidById(a.childId);
  header(main, `Review: ${lesson.title}`, { actions: [h('button', { class: 'btn', onclick: () => go('review') }, '← All work')] });
  main.append(h('p', { class: 'muted' }, `${kid?.avatar || ''} ${kid?.name || ''} · ${a.completedAt ? 'finished ' + fmtDate(a.completedAt) : 'not finished yet'} · ${fmtDuration(a.timeSpentSec || 0)} · status: ${a.status.replace('_', ' ')}`));
  const edits = {};
  const pending = lesson.activities.filter(act => a.answers?.[act.id]?.pending);
  if (pending.length && await aiReady()) main.append(h('div', { class: 'alert info' }, '✨', h('div', { style: { flex: 1 } }, `${pending.length} answer(s) not marked yet.`), h('button', { class: 'btn btn-sm btn-ai', onclick: async e => {
    e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span> Marking…';
    for (const act of pending) { try { const r = await markAnswer({ activity: act, response: a.answers[act.id].response, child: kid }); Object.assign(a.answers[act.id], r, { pending: false }); } catch (err) { toast(err.message, 'error'); } }
    await store.put('assignments', a); rerender();
  } }, '✨ AI-mark them')));

  lesson.activities.forEach((act, i) => {
    const ans = a.answers?.[act.id];
    const card = h('div', { class: 'card', style: { marginBottom: '10px' } }, h('div', { class: 'row' }, h('b', {}, `Q${i + 1}`), h('span', { class: 'pill' }, act.type), h('span', { class: 'spacer' }), ans?.hintUsed ? h('span', { class: 'pill warn' }, 'used hint') : null),
      h('div', { class: 'md', html: md(act.prompt) }));
    if (!ans) { card.append(h('p', { class: 'muted' }, 'Not answered.')); main.append(card); return; }
    const resp = responseText(act, ans.response);
    card.append(act.type === 'draw' && ans.imageId ? h('div', { class: 'act-img' }, storedImg(ans.imageId)) : h('div', { style: { background: '#f6f7fc', borderRadius: '10px', padding: '10px 12px', whiteSpace: 'pre-wrap' } }, String(resp ?? '')));
    if (!['writing', 'draw'].includes(act.type)) card.append(h('p', { class: 'small' }, h('b', {}, 'Expected: '), correctText(act)));
    else if (act.rubric) card.append(h('p', { class: 'small' }, h('b', {}, 'Rubric: '), act.rubric));
    if (ans.feedback && !ans.pending) card.append(h('p', { class: 'small' }, h('b', {}, '🤖 Feedback given: '), ans.feedback));
    const cur = ans.score;
    const scoreBtns = h('div', { class: 'row' }, h('b', { class: 'small' }, 'Score:'));
    [[0, '✗ 0%'], [0.5, '½ 50%'], [1, '✓ 100%']].forEach(([v, l]) => scoreBtns.append(h('button', { class: `btn btn-sm ${cur === v ? 'btn-primary' : ''}`, onclick: e => { edits[act.id] = { ...(edits[act.id] || {}), score: v }; scoreBtns.querySelectorAll('.btn').forEach(b => b.classList.remove('btn-primary')); e.target.classList.add('btn-primary'); } }, l)));
    scoreBtns.append(h('span', { class: 'small muted' }, cur == null ? 'not marked yet' : `currently ${pct(cur)}`));
    const note = h('input', { class: 'input', placeholder: `Note to ${kid?.name || 'child'} about this answer (optional)`, value: ans.parentNote || '', oninput: () => { edits[act.id] = { ...(edits[act.id] || {}), note: note.value }; } });
    card.append(scoreBtns, h('div', { style: { marginTop: '6px' } }, note));
    main.append(card);
  });
  const comment = h('textarea', { class: 'input', rows: 3, placeholder: `Overall comment for ${kid?.name || 'your child'} — they'll see this in My Lessons` }, a.parentComment || '');
  main.append(h('div', { class: 'card' }, h('label', { class: 'field' }, h('span', {}, '💬 Overall comment'), comment),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary btn-lg', onclick: save }, '✓ Mark as reviewed'))));

  async function save() {
    for (const [id, e] of Object.entries(edits)) {
      const ans = a.answers[id]; const act = lesson.activities.find(x => x.id === id);
      if (e.note != null) ans.parentNote = e.note;
      if (e.score != null) {
        Object.assign(ans, { score: e.score, correct: e.score >= 0.7, pending: false, markedBy: state.me.name });
        await store.put('evidence', { id: `${a.id}_${id}`, childId: a.childId, skill: act.skill, subject: skillSubject(act.skill), score: e.score, weight: 1, ts: ans.ts || Date.now(), source: 'lesson', ref: a.id, lessonTitle: lesson.title, prompt: act.prompt, response: responseText(act, ans.response).slice(0, 400), correct: correctText(act) });
      }
    }
    // any still-pending answers that now have a score need evidence too
    for (const act of lesson.activities) {
      const ans = a.answers?.[act.id];
      if (ans && ans.score != null && !edits[act.id]?.score && ans.markedBy == null && ans.pending === false)
        await store.put('evidence', { id: `${a.id}_${act.id}`, childId: a.childId, skill: act.skill, subject: skillSubject(act.skill), score: ans.score, weight: 1, ts: ans.ts || Date.now(), source: 'lesson', ref: a.id, lessonTitle: lesson.title, prompt: act.prompt, response: responseText(act, ans.response).slice(0, 400), correct: correctText(act) });
    }
    const scored = Object.values(a.answers || {}).filter(x => x.score != null);
    a.score = scored.length ? scored.reduce((t, x) => t + x.score, 0) / scored.length : null;
    a.stars = starsFor(a.score);
    Object.assign(a, { parentComment: comment.value.trim(), status: a.completedAt ? 'reviewed' : a.status, reviewedAt: Date.now(), reviewedBy: state.me.name, feedbackSeen: false });
    await store.put('assignments', a);
    toast('Reviewed ✓', 'good');
    refreshBadges(); go('review');
  }
}

function reviewDoc(main, d) {
  main.innerHTML = '';
  const kid = kidById(d.childId);
  header(main, `${{ doc: '📝', sheet: '📊', drawing: '🖼️' }[d.type]} ${d.title}`, { actions: [h('button', { class: 'btn', onclick: () => go('review') }, '← All work')] });
  main.append(h('p', { class: 'muted' }, `${kid?.avatar || ''} ${kid?.name || ''} · sent ${timeAgo(d.submittedAt)}`));
  const view = h('div', { class: 'card' });
  if (d.type === 'doc') view.innerHTML = `<div style="font-size:17px;line-height:1.6">${sanitize(d.content || '')}</div>`;
  else if (d.type === 'drawing') view.append(h('img', { src: d.content, style: { maxWidth: '100%', borderRadius: '8px' } }));
  else {
    const cells = d.content?.cells || {};
    const keys = Object.keys(cells); const maxR = Math.max(1, ...keys.map(k => +k.slice(1))); const maxC = Math.max(0, ...keys.map(k => k.charCodeAt(0) - 65));
    const t = h('table', { class: 'tbl' });
    for (let r = 1; r <= maxR; r++) { const tr = h('tr'); for (let c = 0; c <= maxC; c++) { const k = String.fromCharCode(65 + c) + r; tr.append(h('td', { style: { background: cells[k]?.bg || '', fontWeight: cells[k]?.b ? 800 : 400 } }, cells[k]?.v ?? '')); } t.append(tr); }
    view.append(h('p', { class: 'small muted' }, 'Raw cell values (formulas shown as typed):'), t);
  }
  const fb = h('textarea', { class: 'input', rows: 3, placeholder: `Feedback for ${kid?.name || 'your child'} — appears as a note on their desktop` }, d.feedback || '');
  main.append(view, h('div', { class: 'card', style: { marginTop: '14px' } }, h('label', { class: 'field' }, h('span', {}, '💬 Feedback'), fb),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', onclick: async () => {
      d.reviewed = true; d.feedback = fb.value.trim(); d.reviewedBy = state.me.name;
      await store.put('documents', d);
      if (d.feedback) await store.put('notes', { id: uid('nt_'), childId: d.childId, from: state.me.name, fromAvatar: state.me.avatar, text: `About “${d.title}”: ${d.feedback}`, ts: Date.now(), read: false });
      toast('Done ✓', 'good'); refreshBadges(); go('review');
    } }, '✓ Mark as reviewed'))));
}
