// Weekly planner with drag-free scheduling and an AI week planner.
import { store } from '../store.js';
import { h, esc, toast, modal, confirmDlg, today, addDays, startOfWeek, fmtDate, uid, pct } from '../util.js';
import { SUBJECTS, subject, skillName } from '../skills.js';
import { generatePlan, generateLesson, aiReady } from '../ai.js';
import { header, go, state, kidById, rerender } from './shell.js';
import { childData, lessonsMap } from './data.js';
import { assignDialog, previewLesson } from './lessons.js';

let weekStart = startOfWeek();

export async function render(main) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  header(main, '📅 Planner', {
    actions: [
      h('button', { class: 'btn', onclick: () => { weekStart = addDays(weekStart, -7); rerender(); } }, '◀'),
      h('button', { class: 'btn', onclick: () => { weekStart = startOfWeek(); rerender(); } }, 'This week'),
      h('button', { class: 'btn', onclick: () => { weekStart = addDays(weekStart, 7); rerender(); } }, '▶'),
      h('button', { class: 'btn btn-ai', onclick: () => aiWeek(days) }, '✨ Plan this week with AI'),
    ],
  });
  main.append(h('p', { class: 'muted', style: { marginTop: '-8px' } }, `Week of ${fmtDate(weekStart, { day: 'numeric', month: 'long', year: 'numeric' })}`));
  if (!state.kids.length) return main.append(h('div', { class: 'card empty' }, 'Add children in Settings → Family first.'));
  const [asgs, L] = await Promise.all([store.list('assignments'), lessonsMap()]);
  const grid = h('div', { class: 'planner' }, h('div'));
  days.forEach(d => grid.append(h('div', { class: `hd ${d === today() ? 'today' : ''}` }, fmtDate(d))));
  for (const kid of state.kids) {
    grid.append(h('div', { class: 'kid' }, h('span', { style: { fontSize: '22px' } }, kid.avatar), kid.name));
    days.forEach((d, i) => {
      const cell = h('div', { class: `cell ${d === today() ? 'today' : ''} ${i > 4 ? 'weekend' : ''}` });
      asgs.filter(a => a.childId === kid.id && a.date === d && L[a.lessonId]).forEach(a => {
        const l = L[a.lessonId]; const s = subject(l.subject);
        cell.append(h('div', { class: `chip ${a.completedAt ? 'done' : ''} ${a.status === 'submitted' ? 'review' : ''}`, style: { '--c': s.color }, onclick: () => chipDialog(a, l, kid) },
          `${s.icon} ${l.title}`, a.completedAt ? h('div', { class: 'small muted' }, a.score != null ? `✓ ${pct(a.score)}` : '✓ done') : a.status === 'in_progress' ? h('div', { class: 'small muted' }, '… started') : null));
      });
      cell.append(h('button', { class: 'add', title: 'Add a lesson', onclick: () => pickLesson(kid, d) }, '+'));
      grid.append(cell);
    });
  }
  main.append(h('div', { class: 'card', style: { overflowX: 'auto' } }, grid),
    h('p', { class: 'small muted' }, 'Tip: unfinished lessons carry over — the kids see them on their desktop until they are done.'));
}

function chipDialog(a, l, kid) {
  const date = h('input', { class: 'input', type: 'date', value: a.date, style: { maxWidth: '180px' } });
  modal({
    title: `${subject(l.subject).icon} ${l.title}`,
    body: h('div', {},
      h('p', {}, `${kid.avatar} ${kid.name} · ${a.status.replace('_', ' ')}${a.score != null ? ` · score ${pct(a.score)}` : ''}${a.timeSpentSec ? ` · ${Math.round(a.timeSpentSec / 60)} min` : ''}`),
      h('label', { class: 'field' }, h('span', {}, 'Move to'), date),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-sm', onclick: () => previewLesson(l) }, '👁 Preview'),
        h('button', { class: 'btn btn-sm', onclick: () => go('lessons', l.id) }, '✏️ Edit lesson'),
        a.completedAt ? h('button', { class: 'btn btn-sm', onclick: () => go('review', a.id) }, '✅ See answers') : null)),
    actions: [
      { label: '🗑 Remove', cls: 'btn-danger', onClick: async () => { if (!(await confirmDlg('Remove this lesson from the plan? (The lesson stays in your library.)'))) return false; await store.remove('assignments', a.id); rerender(); } },
      { label: 'Save', cls: 'btn-primary', onClick: async () => { a.date = date.value; await store.put('assignments', a); rerender(); } },
    ],
  });
}

async function pickLesson(kid, date) {
  const lessons = (await store.list('lessons')).sort((a, b) => b.createdAt - a.createdAt);
  const q = h('input', { class: 'input', placeholder: 'Search your library…' });
  const list = h('div', { style: { maxHeight: '50vh', overflow: 'auto', marginTop: '8px' } });
  const m = modal({
    title: `Add a lesson for ${kid.name} — ${fmtDate(date)}`, body: h('div', {}, q, list),
    actions: [{ label: '✨ Create a new one with AI', cls: 'btn-ai', onClick: () => go('lessons', 'new') }, { label: 'Close' }],
  });
  const draw = () => {
    list.innerHTML = '';
    const t = q.value.toLowerCase();
    const rows = lessons.filter(l => !t || l.title.toLowerCase().includes(t) || (l.topic || '').toLowerCase().includes(t));
    if (!rows.length) list.append(h('p', { class: 'muted' }, 'No lessons in your library yet.'));
    rows.forEach(l => list.append(h('div', { class: 'result', onclick: async () => { await store.put('assignments', { id: uid('as_'), lessonId: l.id, childId: kid.id, date, status: 'assigned', answers: {}, progress: 0, assignedBy: state.me.name }); m.close(); toast('Added', 'good'); rerender(); } },
      h('b', {}, `${subject(l.subject).icon} ${l.title}`), h('div', { class: 'small muted' }, `${subject(l.subject).name} · ${l.activities?.length || 0} questions`))));
  };
  q.oninput = draw; draw();
}

// ───────── AI week planner ─────────
async function aiWeek(days) {
  if (!(await aiReady())) return toast('Connect AI first (Settings → AI)', 'warn');
  const kidSel = h('select', { class: 'input' }, ...state.kids.map(k => h('option', { value: k.id, selected: k.id === state.kidId }, `${k.avatar} ${k.name}`)), h('option', { value: '__both' }, '👫 Both (same plan, personalised separately)'));
  const weekdays = days.slice(0, 5).filter(d => d >= today());
  const dayChecks = days.map((d, i) => h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '10px' } }, h('input', { type: 'checkbox', value: d, checked: weekdays.includes(d) }), fmtDate(d, { weekday: 'short', day: 'numeric' })));
  const perDay = h('select', { class: 'input' }, ...[1, 2, 3, 4].map(n => h('option', { value: n, selected: n === 3 }, n)));
  const subjChecks = SUBJECTS.filter(s => s.id !== 'general').map(s => h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '10px' } }, h('input', { type: 'checkbox', value: s.id, checked: ['maths', 'english', 'science', 'history', 'geography'].includes(s.id) }), `${s.icon} ${s.name}`));
  const useGaps = h('input', { type: 'checkbox', checked: true });
  const notes = h('textarea', { class: 'input', rows: 2, placeholder: 'e.g. "We\'re visiting the Natural History Museum on Thursday", "Keep Friday light"' });
  const out = h('div');
  const body = h('div', {},
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'For'), kidSel), h('label', { class: 'field' }, h('span', {}, 'Lessons per day'), perDay)),
    h('div', { class: 'field' }, h('span', {}, 'Days'), h('div', {}, ...dayChecks)),
    h('div', { class: 'field' }, h('span', {}, 'Subjects'), h('div', {}, ...subjChecks)),
    h('label', { class: 'check' }, useGaps, 'Prioritise bridging lessons for skills they are struggling with'),
    h('label', { class: 'field' }, h('span', {}, 'Notes for the planner'), notes), out);
  let plan = null;
  const m = modal({
    title: '✨ Plan the week with AI', wide: true, body,
    actions: [{ label: 'Close' }, { label: '1. Draft plan', cls: 'btn-ai', onClick: async ({ box }) => { await draft(); return false; } }, { label: '2. Create & schedule lessons', cls: 'btn-primary', onClick: async () => { await build(); return false; } }],
  });
  const chosenDays = () => dayChecks.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value);
  const kidsFor = () => (kidSel.value === '__both' ? state.kids : [kidById(kidSel.value)]);

  async function draft() {
    const ds = chosenDays();
    if (!ds.length) return toast('Pick at least one day', 'warn');
    const subjects = subjChecks.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value);
    out.innerHTML = '<p><span class="spinner"></span> Planning the week… (about 20 seconds)</p>';
    try {
      const kid = kidsFor()[0];
      const d = await childData(kid.id);
      const L = await lessonsMap();
      const recent = d.assignments.sort((a, b) => a.date.localeCompare(b.date)).map(a => L[a.lessonId]?.title).filter(Boolean);
      plan = await generatePlan({ child: kid, dates: ds, lessonsPerDay: +perDay.value, subjects, gaps: useGaps.checked ? d.gaps : [], recentTitles: recent, notes: notes.value });
      drawPlan();
    } catch (e) { out.innerHTML = ''; out.append(h('div', { class: 'alert bad' }, e.message)); }
  }
  function drawPlan() {
    out.innerHTML = '';
    const tb = h('tbody');
    plan.forEach((p, i) => {
      p.include ??= true;
      const topic = h('input', { class: 'input', value: p.topic, oninput: () => { p.topic = topic.value; } });
      const subj = h('select', { class: 'input', onchange: () => { p.subject = subj.value; } }, ...SUBJECTS.map(s => h('option', { value: s.id, selected: s.id === p.subject }, `${s.icon} ${s.name}`)));
      tb.append(h('tr', {}, h('td', {}, h('input', { type: 'checkbox', checked: p.include, onchange: e => { p.include = e.target.checked; } })), h('td', { style: { whiteSpace: 'nowrap' } }, fmtDate(p.date)), h('td', { style: { width: '180px' } }, subj), h('td', {}, topic, h('div', { class: 'small muted' }, (p.focusSkills || []).map(skillName).join(', '), p.why ? ` — ${p.why}` : ''))));
    });
    out.append(h('h4', { style: { marginTop: '14px' } }, 'Draft plan — edit anything, untick to skip'), h('table', { class: 'tbl' }, tb));
  }
  async function build() {
    if (!plan) return toast('Draft a plan first', 'warn');
    const items = plan.filter(p => p.include && p.topic);
    const kids = kidsFor();
    const total = items.length * kids.length;
    if (!total) return;
    const prog = h('div', { class: 'progress-line' }, h('i', { style: { width: '2%' } }));
    const msg = h('div', { class: 'small muted' }, `Creating ${total} lessons… you can keep using the dashboard, but keep this tab open.`);
    out.prepend(h('div', { style: { margin: '10px 0' } }, prog, msg));
    let done = 0, failed = 0;
    const jobs = items.flatMap(p => kids.map(k => ({ p, k })));
    const worker = async () => {
      while (jobs.length) {
        const { p, k } = jobs.shift();
        try {
          const lesson = await generateLesson({ child: k, subject: p.subject, topic: p.topic, focusSkills: p.focusSkills || [], durationMins: 30 });
          Object.assign(lesson, { source: 'ai', createdBy: state.me.name, yearGroup: k.yearGroup || lesson.yearGroup });
          await store.put('lessons', lesson);
          await store.put('assignments', { id: uid('as_'), lessonId: lesson.id, childId: k.id, date: p.date, status: 'assigned', answers: {}, progress: 0, assignedBy: state.me.name });
        } catch (e) { failed++; console.warn(e); }
        done++;
        prog.firstChild.style.width = `${(done / total) * 100}%`;
        msg.textContent = `Created ${done - failed} of ${total}${failed ? ` (${failed} failed)` : ''}…`;
      }
    };
    await Promise.all([worker(), worker()]);
    toast(`✨ ${done - failed} lessons created and scheduled`, 'good', 5000);
    m.close(); rerender();
  }
}
