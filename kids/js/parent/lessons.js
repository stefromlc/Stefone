// Lesson library (with bulk publishing), multi-child AI generator and the full interactive lesson editor.
import { store } from '../store.js';
import { h, esc, toast, modal, confirmDlg, md, today, fmtDate, uid, promptDlg, addDays } from '../util.js';
import { SUBJECTS, SKILLS, subject, skillName, skillSubject } from '../skills.js';
import { generateLesson, improveSection, aiReady, generateActivities, adaptLesson } from '../ai.js';
import { header, go, state, kidById } from './shell.js';
import { childData, recentMistakes } from './data.js';
import { renderPlayer } from '../apps/player.js';
import { TYPES, blanksOf } from '../apps/activities.js';
import { illustrateLesson, generateImage, saveImage, storedImg, fileToDataUrl } from '../media.js';
import { YEAR_GROUPS } from '../profileform.js';

export async function render(main, st, arg) {
  if (!arg) return library(main);
  if (arg === 'new') return generator(main, {});
  if (arg === 'blank') return editor(main, blankLesson(), true);
  if (arg.startsWith('bridge:')) { const [, kidId, skill, ...t] = arg.split(':'); return generator(main, { kidId, skill, topicHint: t.join(':') }); }
  const l = await store.get('lessons', arg);
  if (!l) { main.append(h('div', { class: 'card' }, 'Lesson not found. ', h('a', { href: '#/p/lessons' }, 'Back to library'))); return; }
  return editor(main, l, false);
}

const blankLesson = () => ({ title: 'New lesson', subject: 'maths', topic: '', yearGroup: kidById(state.kidId)?.yearGroup || 'Year 3', durationMins: 30, objectives: [], intro: '', sections: [{ id: uid('s'), type: 'text', title: 'Learn', body: '' }], activities: [], skills: [], offlineActivity: '', parentNotes: '' });

export function subjectSelect(value, attrs = {}) {
  return h('select', { class: 'input', ...attrs }, ...SUBJECTS.map(s => h('option', { value: s.id, selected: s.id === value }, `${s.icon} ${s.name}`)));
}
export function skillSelect(value, attrs = {}) {
  const sel = h('select', { class: 'input', ...attrs });
  for (const s of SUBJECTS) {
    const ids = Object.keys(SKILLS).filter(k => skillSubject(k) === s.id);
    if (!ids.length) continue;
    sel.append(h('optgroup', { label: s.name }, ...ids.map(id => h('option', { value: id, selected: id === value }, SKILLS[id]))));
  }
  return sel;
}

/** Clickable child chips; returns { el, set } where set is a live Set of selected ids. */
export function kidPicker(initial) {
  const set = new Set(initial);
  const el = h('div', { class: 'kid-chips' });
  state.kids.forEach(k => {
    const b = h('button', { type: 'button', class: `kid-chip ${set.has(k.id) ? 'on' : ''}`, style: { '--kc': k.color || '#5b5bd6' }, onclick: () => { set.has(k.id) ? set.delete(k.id) : set.add(k.id); b.classList.toggle('on'); el.dispatchEvent(new Event('change')); } },
      h('span', { class: 'av' }, k.avatar), h('span', {}, k.name), h('small', {}, k.yearGroup || ''));
    el.append(b);
  });
  return { el, set };
}

/** School days (Mon–Fri) starting from a date. */
export function schoolDays(from, n) {
  const out = []; let d = from;
  while (out.length < n) { const wd = new Date(d + 'T12:00:00').getDay(); if (wd !== 0 && wd !== 6) out.push(d); d = addDays(d, 1); }
  return out;
}
const asgFor = (lessonId, childId, date) => ({ id: uid('as_'), lessonId, childId, date, status: 'assigned', answers: {}, progress: 0, assignedBy: state.me.name });

// ─────────────── Library ───────────────
async function library(main) {
  header(main, '📚 Lessons', { actions: [h('button', { class: 'btn', onclick: () => go('lessons', 'blank') }, '+ Blank lesson'), h('button', { class: 'btn btn-ai', onclick: () => go('lessons', 'new') }, '✨ Create with AI')] });
  const [lessons, asgs] = await Promise.all([store.list('lessons'), store.list('assignments')]);
  const sel = new Set();
  const q = h('input', { class: 'input', placeholder: 'Search lessons…', style: { maxWidth: '260px' } });
  const sf = h('select', { class: 'input', style: { maxWidth: '200px' } }, h('option', { value: '' }, 'All subjects'), ...SUBJECTS.map(s => h('option', { value: s.id }, `${s.icon} ${s.name}`)));
  const af = h('select', { class: 'input', style: { maxWidth: '200px' } }, h('option', { value: '' }, 'Assigned or not'), h('option', { value: 'no' }, 'Not assigned yet'), ...state.kids.map(k => h('option', { value: k.id }, `Assigned to ${k.name}`)));
  const bulk = h('div', { class: 'bulk-bar hidden' });
  const tbody = h('tbody');
  const all = h('input', { type: 'checkbox', title: 'Select all' });
  main.append(h('div', { class: 'card' },
    h('div', { class: 'row wrap', style: { marginBottom: '10px' } }, q, sf, af, h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${lessons.length} lessons`)),
    bulk,
    h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', { style: { width: '30px' } }, all), ...['Lesson', 'Subject', 'Activities', 'Assigned', ''].map(t => h('th', {}, t)))), tbody))));
  let rows = [];
  const drawBulk = () => {
    bulk.classList.toggle('hidden', !sel.size);
    bulk.innerHTML = '';
    bulk.append(h('b', {}, `${sel.size} selected`),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => bulkAssign([...sel].map(id => lessons.find(l => l.id === id))) }, '📅 Publish to children…'),
      h('button', { class: 'btn btn-sm', onclick: () => { sel.clear(); draw(); } }, 'Clear'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-danger', onclick: async () => {
        if (!(await confirmDlg(`Delete ${sel.size} lesson(s) and their assignments?`, { ok: 'Delete', danger: true }))) return;
        for (const id of sel) { for (const a of asgs.filter(x => x.lessonId === id)) await store.remove('assignments', a.id); await store.remove('lessons', id); }
        toast('Deleted'); sel.clear(); main.innerHTML = ''; library(main);
      } }, '🗑 Delete'));
  };
  const draw = () => {
    const term = q.value.toLowerCase();
    rows = lessons.filter(l => (!sf.value || l.subject === sf.value) && (!term || `${l.title} ${l.topic}`.toLowerCase().includes(term))
      && (!af.value || (af.value === 'no' ? !asgs.some(a => a.lessonId === l.id) : asgs.some(a => a.lessonId === l.id && a.childId === af.value)))).sort((a, b) => b.createdAt - a.createdAt);
    tbody.innerHTML = '';
    all.checked = rows.length && rows.every(l => sel.has(l.id));
    if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: 6 }, h('div', { class: 'empty' }, h('span', { class: 'big' }, '📭'), lessons.length ? 'No lessons match.' : 'No lessons yet — create your first one with AI!'))));
    rows.forEach(l => {
      const s = subject(l.subject);
      const n = asgs.filter(a => a.lessonId === l.id);
      const types = [...new Set((l.activities || []).map(a => TYPES[a.type]?.icon).filter(Boolean))].join(' ');
      const cb = h('input', { type: 'checkbox', checked: sel.has(l.id), onchange: e => { e.target.checked ? sel.add(l.id) : sel.delete(l.id); drawBulk(); } });
      tbody.append(h('tr', { class: sel.has(l.id) ? 'selected' : '' },
        h('td', {}, cb),
        h('td', {}, h('div', { class: 'row' }, l.coverImageId ? storedImg(l.coverImageId, { class: 'lib-thumb' }) : h('span', { class: 'lib-thumb lib-emoji', style: { background: s.color + '22' } }, s.icon),
          h('div', {}, h('a', { href: `#/p/lessons/${l.id}`, style: { fontWeight: 800, color: 'inherit' } }, l.title), h('div', { class: 'small muted' }, `${l.topic || ''}${l.bridgingFor ? ' · 🌉 bridging' : ''}${l.personalisedFor ? ` · 🎯 for ${kidById(l.personalisedFor)?.name || 'one child'}` : ''}${l.source === 'ai' ? ' · ✨ AI' : ''}`)))),
        h('td', {}, h('span', { class: 'pill', style: { background: s.color + '22', color: s.color } }, `${s.icon} ${s.name}`)),
        h('td', { class: 'small' }, `${l.activities?.length || 0} `, h('span', { title: 'Activity types' }, types)),
        h('td', { class: 'small' }, n.length ? [...new Set(n.map(a => kidById(a.childId)?.avatar || ''))].join(' ') + ` ${n.filter(a => a.completedAt).length}/${n.length} done` : '—'),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn btn-sm', onclick: () => assignDialog(l).then(ok => ok && (main.innerHTML = '', library(main))) }, '📅'), ' ',
          h('button', { class: 'btn btn-sm', title: 'Preview', onclick: () => previewLesson(l) }, '👁'), ' ',
          h('button', { class: 'btn btn-sm', title: 'Edit', onclick: () => go('lessons', l.id) }, '✏️'))));
    });
    drawBulk();
  };
  all.onchange = () => { rows.forEach(l => all.checked ? sel.add(l.id) : sel.delete(l.id)); draw(); };
  q.oninput = draw; sf.onchange = draw; af.onchange = draw; draw();

  function bulkAssign(list) {
    const kp = kidPicker(state.kids.map(k => k.id));
    const date = h('input', { class: 'input', type: 'date', value: today(), style: { maxWidth: '180px' } });
    const spread = h('select', { class: 'input', style: { maxWidth: '280px' } }, h('option', { value: 'same' }, 'All on the same day'), h('option', { value: 'daily', selected: list.length > 1 }, 'One per school day'), h('option', { value: 'two' }, 'Two per school day'));
    modal({
      title: `📅 Publish ${list.length} lesson${list.length > 1 ? 's' : ''}`,
      body: h('div', {}, h('div', { class: 'field' }, h('span', {}, 'Children'), kp.el), h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Starting'), date), h('label', { class: 'field' }, h('span', {}, 'Spread'), spread)),
        h('p', { class: 'small muted' }, 'Lessons already assigned to a child on the same day are skipped.')),
      actions: [{ label: 'Cancel' }, {
        label: 'Publish', cls: 'btn-primary', onClick: async () => {
          if (!kp.set.size) { toast('Pick at least one child', 'warn'); return false; }
          const per = spread.value === 'same' ? list.length : spread.value === 'two' ? 2 : 1;
          const days = schoolDays(date.value || today(), Math.ceil(list.length / per));
          let n = 0;
          for (const [i, l] of list.entries()) {
            const d = spread.value === 'same' ? (date.value || today()) : days[Math.floor(i / per)];
            for (const kid of kp.set) { if (asgs.some(a => a.lessonId === l.id && a.childId === kid && a.date === d)) continue; await store.put('assignments', asgFor(l.id, kid, d)); n++; }
          }
          toast(`✅ Published ${n} lesson${n === 1 ? '' : 's'}`, 'good');
          sel.clear(); main.innerHTML = ''; library(main);
        },
      }],
    });
  }
}

// ─────────────── Preview & assign ───────────────
export function previewLesson(lesson) {
  const kid = kidById(state.kidId) || state.kids[0] || { id: 'preview', name: 'Preview', age: 8 };
  const box = h('div', { class: 'preview-box' });
  const m = modal({ title: `👁 Preview — ${lesson.title}`, body: box, wide: true, actions: [] });
  const p = renderPlayer(box, { lesson, child: kid, preview: true, onExit: () => m.close() });
  const obs = new MutationObserver(() => { if (!document.body.contains(box)) { p.destroy(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}

export function assignDialog(lesson, { date = today(), kidIds } = {}) {
  if (!state.kids.length) { toast('Add children first (Settings → Family)', 'warn'); return Promise.resolve(false); }
  const kp = kidPicker(kidIds || (lesson.personalisedFor ? [lesson.personalisedFor] : state.kids.map(k => k.id)));
  const dateIn = h('input', { class: 'input', type: 'date', value: date });
  return new Promise(res => modal({
    title: `📅 Assign “${lesson.title}”`,
    body: h('div', {}, h('div', { class: 'field' }, h('span', {}, 'Who?'), kp.el), h('label', { class: 'field' }, h('span', {}, 'Which day?'), dateIn)),
    actions: [{ label: 'Cancel' }, {
      label: 'Assign', cls: 'btn-primary', onClick: async () => {
        if (!kp.set.size) { toast('Pick at least one child', 'warn'); return false; }
        for (const kid of kp.set) await store.put('assignments', asgFor(lesson.id, kid, dateIn.value || today()));
        toast(`Assigned to ${[...kp.set].map(id => kidById(id)?.name).join(' & ')} for ${fmtDate(dateIn.value)}`, 'good');
        res(true);
      },
    }],
    onClose: () => res(false),
  }));
}

// ─────────────── AI generator (multi-child, multi-topic) ───────────────
async function generator(main, { kidId, skill, topicHint }) {
  header(main, skill ? '🌉 Bridging lesson' : '✨ Create lessons with AI', { actions: [h('button', { class: 'btn', onclick: () => go('lessons') }, '← Library')] });
  if (!(await aiReady())) {
    main.append(h('div', { class: 'alert info' }, 'AI is not connected. ', store.isAdmin ? h('a', { href: '#/p/settings/ai' }, 'Add an OpenRouter key in Settings') : 'Ask Dad to add an OpenRouter key in Settings.', ' — or ', h('a', { href: '#/p/lessons/blank' }, 'write a lesson by hand'), '.'));
    return;
  }
  const settings = await store.settings();
  const kp = kidPicker(kidId ? [kidId] : state.kids.map(k => k.id));
  const modeWrap = h('div', { class: 'seg' });
  let mode = skill ? 'each' : 'shared';
  const drawMode = () => {
    modeWrap.innerHTML = '';
    [['shared', '🧑‍🤝‍🧑 One shared lesson', 'Same lesson for everyone — quicker & cheaper'], ['each', '🎯 Personalised for each child', 'Pitched to each child’s year, interests and gaps']].forEach(([v, l, d]) =>
      modeWrap.append(h('button', { type: 'button', class: mode === v ? 'on' : '', onclick: () => { mode = v; drawMode(); summary(); } }, h('b', {}, l), h('small', {}, d))));
    modeWrap.classList.toggle('hidden', kp.set.size < 2);
  };
  kp.el.addEventListener('change', () => { drawMode(); summary(); });
  const subj = subjectSelect(skill ? skillSubject(skill) : 'maths');
  const topics = h('textarea', { class: 'input', rows: 3, placeholder: 'One topic per line, e.g.\nEquivalent fractions\nThe Romans in Britain\nLife cycle of a frog' }, topicHint || (skill ? skillName(skill) : ''));
  const dur = h('select', { class: 'input' }, ...[15, 20, 30, 45, 60].map(n => h('option', { value: n, selected: n === 30 }, `${n} minutes`)));
  const diff = h('select', { class: 'input' }, ...[['easier — build confidence', 'Easier'], ['right at their level', 'At their level'], ['a stretch — challenge them', 'Stretch']].map(([v, l], i) => h('option', { value: v, selected: skill ? i === 0 : i === 1 }, l)));
  const count = h('select', { class: 'input' }, ...[4, 5, 6, 8, 10].map(n => h('option', { value: n, selected: n === 6 }, `${n} activities`)));
  const focus = skillSelect(skill || ''); focus.prepend(h('option', { value: '', selected: !skill }, '(let the AI choose)'));
  const interactive = h('input', { type: 'checkbox', checked: true });
  const pics = h('input', { type: 'checkbox', checked: settings.media?.lessonImages !== false && !!settings.models.image });
  const qcheck = h('input', { type: 'checkbox', checked: true });
  const notes = h('textarea', { class: 'input', rows: 2, placeholder: 'Anything else? e.g. "Use football examples", "Include a short reading passage", "Link to our trip to the museum"' });
  const publish = h('input', { type: 'checkbox', checked: true });
  const pubDate = h('input', { class: 'input', type: 'date', value: today(), style: { maxWidth: '170px' } });
  const spread = h('select', { class: 'input', style: { maxWidth: '230px' } }, h('option', { value: 'daily' }, 'one topic per school day'), h('option', { value: 'same' }, 'all on that day'));
  const sum = h('div', { class: 'small muted' });
  const jobsEl = h('div');
  const btn = h('button', { class: 'btn btn-ai btn-lg' }, '✨ Generate');
  const topicList = () => topics.value.split('\n').map(t => t.trim()).filter(Boolean);
  function summary() {
    const n = topicList().length, k = kp.set.size;
    const total = mode === 'each' && k > 1 ? n * k : n;
    sum.textContent = n && k ? `Will create ${total} lesson${total === 1 ? '' : 's'}${pics.checked ? ` with up to ${settings.media?.lessonImageCount ?? 3} pictures each` : ''} and ${publish.checked ? `publish to ${[...kp.set].map(id => kidById(id)?.name).join(' & ')}` : 'save them to the library'}.` : 'Pick at least one child and enter a topic.';
    btn.textContent = total > 1 ? `✨ Generate ${total} lessons` : '✨ Generate lesson';
  }
  [topics, publish, pics].forEach(x => x.addEventListener('input', summary)); publish.onchange = pics.onchange = summary;
  drawMode();
  if (skill && kidId) {
    const d = await childData(kidId);
    const m = d.mastery.find(x => x.skill === skill);
    jobsEl.append(h('div', { class: 'alert info' }, '🌉', h('div', {}, h('b', {}, `${kidById(kidId)?.name} is at ${m ? Math.round(m.mastery * 100) + '%' : '?'} on ${skillName(skill)}. `), 'The AI will look at recent mistakes to find the misconception and re-teach it a different way.')));
  }
  main.append(h('div', { class: 'card ai-box' },
    h('div', { class: 'field' }, h('span', {}, 'Who is it for?'), kp.el), modeWrap,
    h('div', { class: 'grid2', style: { marginTop: '12px' } },
      h('label', { class: 'field' }, h('span', {}, 'Subject'), subj),
      h('label', { class: 'field' }, h('span', {}, 'Focus skill'), focus),
      h('label', { class: 'field', style: { gridColumn: '1 / -1' } }, h('span', {}, 'Topic(s) — one per line to make several lessons at once'), topics),
      h('label', { class: 'field' }, h('span', {}, 'Length'), dur),
      h('label', { class: 'field' }, h('span', {}, 'Difficulty'), diff),
      h('label', { class: 'field' }, h('span', {}, 'Activities'), count),
      h('div', { class: 'field' }, h('span', {}, 'Extras'), h('label', { class: 'check' }, interactive, '🧩 Interactive activities (drag, match, sort, number lines…)'), h('label', { class: 'check' }, pics, `🎨 AI illustrations${settings.models.image ? '' : ' (no picture model set)'}`), h('label', { class: 'check' }, qcheck, '🔍 Double-check every question with AI (recommended)'))),
    h('label', { class: 'field' }, h('span', {}, 'Extra instructions'), notes),
    h('div', { class: 'row wrap' }, h('label', { class: 'check' }, publish, 'Publish to the children from'), pubDate, spread),
    h('div', { class: 'row', style: { marginTop: '12px' } }, sum, h('span', { class: 'spacer' }), btn), jobsEl));
  summary();

  btn.onclick = async () => {
    const tl = topicList();
    if (!tl.length) return toast('Please enter a topic', 'warn');
    if (!kp.set.size) return toast('Pick at least one child', 'warn');
    btn.disabled = true;
    const kids = [...kp.set].map(kidById);
    const personal = mode === 'each' && kids.length > 1;
    const dates = spread.value === 'same' ? tl.map(() => pubDate.value || today()) : schoolDays(pubDate.value || today(), tl.length);
    const jobs = tl.flatMap((topic, ti) => (personal ? kids.map(k => ({ topic, kids: [k], date: dates[ti] })) : [{ topic, kids, date: dates[ti] }]));
    jobsEl.innerHTML = '';
    const list = h('div', { class: 'job-list' });
    jobsEl.append(h('h4', {}, `Creating ${jobs.length} lesson${jobs.length > 1 ? 's' : ''}…`), list);
    jobs.forEach(j => { j.row = h('div', { class: 'job' }, h('span', { class: 'st' }, '⏳'), h('b', {}, j.topic), h('span', { class: 'small muted' }, j.kids.map(k => `${k.avatar} ${k.name}`).join(' ')), h('span', { class: 'spacer' }), h('span', { class: 'msg small muted' }, 'Waiting…')); list.append(j.row); });
    const set = (j, st, msg) => { j.row.querySelector('.st').textContent = st; j.row.querySelector('.msg').innerHTML = msg; };
    const mistakesFor = async k => (skill ? recentMistakes((await childData(k.id)).evidence, skill) : []);
    const queue = [...jobs];
    const worker = async () => {
      while (queue.length) {
        const j = queue.shift();
        try {
          set(j, '✍️', 'Writing the lesson…');
          const child = j.kids.length === 1 ? j.kids[0] : { ...j.kids[0], gender: j.kids.every(k => k.gender === j.kids[0].gender) ? j.kids[0].gender : '', name: j.kids.map(k => k.name).join(' and '), interests: j.kids.map(k => k.interests).filter(Boolean).join('; '), learningNotes: '' };
          const lesson = await generateLesson({
            child, subject: subj.value, topic: j.topic, durationMins: +dur.value, difficulty: diff.value, activityCount: +count.value, interactive: interactive.checked, withImages: pics.checked, check: qcheck.checked, onStage: m => set(j, '✍️', m),
            focusSkills: focus.value ? [focus.value] : [], mistakes: j.kids.length === 1 ? await mistakesFor(j.kids[0]) : [], notes: notes.value.trim(),
          });
          Object.assign(lesson, { source: 'ai', createdBy: state.me.name });
          if (j.kids.length === 1) { lesson.yearGroup = j.kids[0].yearGroup || lesson.yearGroup; if (personal || kids.length === 1) lesson.personalisedFor = j.kids[0].id; }
          if (skill) lesson.bridgingFor = { childId: j.kids[0].id, skill };
          if (pics.checked) { set(j, '🎨', 'Painting pictures…'); await illustrateLesson(lesson, { onStage: m => set(j, '🎨', m) }); }
          await store.put('lessons', lesson);
          if (publish.checked) for (const k of j.kids) await store.put('assignments', asgFor(lesson.id, k.id, j.date));
          set(j, '✅', `<a href="#/p/lessons/${lesson.id}">${esc(lesson.title)}</a>${publish.checked ? ` · ${fmtDate(j.date)}` : ''}`);
        } catch (e) { set(j, '❌', esc(e.message)); }
      }
    };
    await Promise.all([worker(), worker()]);
    btn.disabled = false;
    toast('✨ Done! Open a lesson to check it over.', 'good', 5000);
  };
}

// ─────────────── Editor ───────────────
function imageControl({ getId, setId, getPrompt, setPrompt, aspect = '4:3', onChange }) {
  const wrap = h('div', { class: 'img-ctl' });
  const draw = () => {
    wrap.innerHTML = '';
    const id = getId();
    const prompt = h('input', { class: 'input', value: getPrompt() || '', placeholder: 'Describe a picture… (e.g. a frog on a lily pad)', oninput: () => setPrompt(prompt.value) });
    wrap.append(id ? h('div', { class: 'img-prev' }, storedImg(id), h('button', { class: 'icon-btn', title: 'Remove picture', onclick: () => { setId(null); onChange(); draw(); } }, '✕')) : null,
      h('div', { class: 'row' }, prompt,
        h('button', { class: 'btn btn-sm btn-ai', title: 'Make a picture with AI', onclick: async e => {
          if (!prompt.value.trim()) return toast('Describe the picture first', 'warn');
          const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
          try { setId(await saveImage(await generateImage(prompt.value.trim(), { aspect }), { kind: 'lesson', prompt: prompt.value.trim() })); onChange(); draw(); toast('Picture ready', 'good'); }
          catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = '✨'; }
        } }, '✨'),
        h('label', { class: 'btn btn-sm', title: 'Upload a picture' }, '⬆️', h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; setId(await saveImage(await fileToDataUrl(f, 1100), { kind: 'lesson', prompt: 'upload' })); onChange(); draw(); } }))));
  };
  draw();
  return wrap;
}

function lines(v) { return String(v || '').split('\n').map(x => x.trim()).filter(Boolean); }

function activityEditor(a, onDirty) {
  const box = h('div');
  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('span', { class: 'hint' }, hint) : null);
  const ta = (val, on, rows = 4, ph = '') => { const t = h('textarea', { class: 'input', rows, placeholder: ph }, val); t.oninput = () => { on(t.value); onDirty(); }; return t; };
  const num = (val, on, step = 'any') => { const i = h('input', { class: 'input', type: 'number', step, value: val ?? '' }); i.oninput = () => { on(parseFloat(i.value)); onDirty(); }; return i; };
  const txt = (val, on, ph = '') => { const i = h('input', { class: 'input', value: val ?? '', placeholder: ph }); i.oninput = () => { on(i.value); onDirty(); }; return i; };
  switch (a.type) {
    case 'mcq': case 'multi': {
      const multi = a.type === 'multi';
      a.options ||= ['', '', '']; if (multi) a.answers ||= [0];
      const drawOpts = () => {
        box.innerHTML = '';
        a.options.forEach((o, k) => {
          const inp = txt(o, v => { a.options[k] = v; });
          const mark = multi ? h('input', { type: 'checkbox', checked: a.answers.includes(k), title: 'Correct', onchange: e => { a.answers = e.target.checked ? [...a.answers, k] : a.answers.filter(x => x !== k); onDirty(); } })
            : h('input', { type: 'radio', name: `ans-${a.id}`, checked: a.answer === k, title: 'Correct answer', onchange: () => { a.answer = k; onDirty(); } });
          box.append(h('div', { class: 'row', style: { marginBottom: '4px' } }, mark, inp, h('button', { class: 'btn btn-sm', onclick: () => { a.options.splice(k, 1); if (multi) a.answers = a.answers.filter(x => x !== k).map(x => (x > k ? x - 1 : x)); else if (a.answer >= a.options.length) a.answer = 0; onDirty(); drawOpts(); } }, '✕')));
        });
        box.append(h('button', { class: 'btn btn-sm', onclick: () => { a.options.push(''); drawOpts(); } }, '+ option'), h('span', { class: 'small muted' }, multi ? '  ☑ = correct (tick all that apply)' : '  ● = correct answer'));
      };
      drawOpts(); break;
    }
    case 'numeric': box.append(h('div', { class: 'grid3' }, field('Correct answer', num(a.answer, v => { a.answer = v; })), field('Unit', txt(a.unit, v => { a.unit = v; }, 'optional')), field('Allowed error', num(a.tolerance, v => { a.tolerance = v || undefined; }), 'e.g. 0.5'))); break;
    case 'short': box.append(h('div', { class: 'grid2' }, field('Model answer', txt(a.answer, v => { a.answer = v; })), field('Also accept (separate with ;)', txt((a.accept || []).join('; '), v => { a.accept = v.split(';').map(x => x.trim()).filter(Boolean); })))); break;
    case 'writing': box.append(h('div', { class: 'grid2' }, field('What a good answer includes (AI marks against this)', ta(a.rubric || '', v => { a.rubric = v; }, 2)), field('Target words', num(a.minWords || 30, v => { a.minWords = v; }, 1)))); break;
    case 'draw': box.append(field('What the drawing must show (the AI looks at the picture)', ta(a.rubric || '', v => { a.rubric = v; }, 2))); break;
    case 'speak': box.append(field('Sentence to read aloud', ta(a.target || '', v => { a.target = v; }, 2), 'Checked with speech recognition — keep it under 20 words.')); break;
    case 'order': box.append(field('Items in the CORRECT order (one per line) — the child sees them shuffled', ta((a.items || []).join('\n'), v => { a.items = lines(v); }, 5))); break;
    case 'match': box.append(field('Pairs, one per line: left = right', ta((a.pairs || []).map(p => p.join(' = ')).join('\n'), v => { a.pairs = lines(v).map(l => l.split('=').map(x => x.trim())).filter(p => p.length === 2 && p[0] && p[1]); }, 5, 'cat = kitten\ndog = puppy'))); break;
    case 'sort': box.append(h('div', { class: 'grid2' }, field('Groups (separate with ;)', txt((a.categories || []).join('; '), v => { a.categories = v.split(';').map(x => x.trim()).filter(Boolean); }, 'Solid; Liquid; Gas')),
      field('Items, one per line: item = group', ta((a.items || []).map(i => `${i.text} = ${i.cat}`).join('\n'), v => { a.items = lines(v).map(l => l.split('=').map(x => x.trim())).filter(p => p.length === 2).map(([text, cat]) => ({ text, cat })); }, 6, 'ice = Solid\nmilk = Liquid')))); break;
    case 'fillblank': {
      const bank = h('input', { type: 'checkbox', checked: a.bank !== false, onchange: e => { a.bank = e.target.checked; onDirty(); } });
      box.append(field('Text — put [[double brackets]] round each missing word', ta(a.text || '', v => { a.text = v; }, 3, 'Plants need [[water]] and [[sunlight]] to grow.')),
        h('div', { class: 'grid2' }, field('Extra wrong words for the word bank (;)', txt((a.distractors || []).join('; '), v => { a.distractors = v.split(';').map(x => x.trim()).filter(Boolean); })), h('label', { class: 'check' }, bank, 'Show a word bank')));
      break;
    }
    case 'numberline': box.append(h('div', { class: 'grid3' }, field('Start', num(a.min ?? 0, v => { a.min = v; })), field('End', num(a.max ?? 10, v => { a.max = v; })), field('Correct value', num(a.answer, v => { a.answer = v; })),
      field('Snap step', num(a.step ?? 1, v => { a.step = v; })), field('Tick every', num(a.tickEvery, v => { a.tickEvery = v || undefined; })), field('Labels (;)', txt((a.labels || []).join('; '), v => { a.labels = v.split(';').map(x => x.trim()).filter(Boolean); }, '0; 5; 10')))); break;
  }
  return box;
}

async function editor(main, lesson, isNew) {
  const L = structuredClone(lesson);
  L.sections ||= []; L.activities ||= []; L.objectives ||= [];
  let dirty = isNew;
  const asgs = isNew ? [] : (await store.list('assignments')).filter(a => a.lessonId === L.id);
  const saveBtn = h('button', { class: 'btn btn-primary' }, '💾 Save');
  header(main, isNew ? 'New lesson' : 'Edit lesson', {
    actions: [h('button', { class: 'btn', onclick: () => go('lessons') }, '← Library'),
      h('button', { class: 'btn', onclick: () => previewLesson(collect()) }, '👁 Preview as child'),
      !isNew ? h('button', { class: 'btn btn-ai', onclick: () => versionDialog() }, '✨ Make a version…') : null,
      h('button', { class: 'btn', onclick: async () => { try { await save(false); } catch { return; } assignDialog(L).then(() => go('lessons', L.id)); } }, '📅 Assign'), saveBtn],
  });
  const markDirty = () => { dirty = true; saveBtn.textContent = '💾 Save *'; };
  const ed = h('div'); main.append(ed);
  ed.addEventListener('input', markDirty); ed.addEventListener('change', markDirty);

  if (asgs.length) ed.append(h('div', { class: 'alert info' }, '📅', h('div', {}, `Assigned ${asgs.length} time${asgs.length > 1 ? 's' : ''}: `, ...asgs.map(a => h('span', { class: 'pill', style: { marginRight: '4px' } }, `${kidById(a.childId)?.avatar || ''} ${fmtDate(a.date)} · ${a.status.replace('_', ' ')}`)))));
  if (L.qualityCheck) ed.append(h('div', { class: 'alert info' }, '🔍', h('div', {}, h('b', {}, 'Every question was double-checked by AI. '), L.qualityCheck.changes?.length ? `Fixed: ${L.qualityCheck.changes.join(' · ')}` : 'No problems found.')));
  if (L.parentNotes) ed.append(h('div', { class: 'alert' }, '📝', h('div', { class: 'md', html: md('**Notes for parents:** ' + L.parentNotes) })));

  const f = {
    title: h('input', { class: 'input', value: L.title, style: { fontSize: '1.2em', fontWeight: 800 } }),
    subject: subjectSelect(L.subject),
    topic: h('input', { class: 'input', value: L.topic || '' }),
    yearGroup: h('select', { class: 'input' }, ...YEAR_GROUPS.map(y => h('option', { selected: y === L.yearGroup }, y))),
    duration: h('input', { class: 'input', type: 'number', min: 5, max: 120, value: L.durationMins || 30 }),
    objectives: h('textarea', { class: 'input', rows: 3, placeholder: 'One per line, e.g. I can find a half of a shape' }, (L.objectives || []).join('\n')),
    intro: h('textarea', { class: 'input', rows: 3 }, L.intro || ''),
    offline: h('textarea', { class: 'input', rows: 2 }, L.offlineActivity || ''),
    notes: h('textarea', { class: 'input', rows: 2 }, L.parentNotes || ''),
  };
  ed.append(h('div', { class: 'card' },
    h('label', { class: 'field' }, h('span', {}, 'Title'), f.title),
    h('div', { class: 'grid3' }, h('label', { class: 'field' }, h('span', {}, 'Subject'), f.subject), h('label', { class: 'field' }, h('span', {}, 'Topic'), f.topic), h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Year'), f.yearGroup), h('label', { class: 'field' }, h('span', {}, 'Minutes'), f.duration))),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Learning objectives'), f.objectives), h('label', { class: 'field' }, h('span', {}, 'Introduction (hook) — markdown'), f.intro)),
    h('div', { class: 'field' }, h('span', {}, '🖼️ Cover picture'), imageControl({ getId: () => L.coverImageId, setId: id => { L.coverImageId = id; }, getPrompt: () => L.coverImagePrompt, setPrompt: v => { L.coverImagePrompt = v; }, aspect: '16:9', onChange: markDirty }))));

  // Sections
  const secWrap = h('div');
  const secType = h('select', { class: 'input', style: { width: '170px' } }, h('option', { value: 'text' }, '📖 Teaching text'), h('option', { value: 'fact' }, '💡 Did you know?'), h('option', { value: 'flashcards' }, '🃏 Flashcards'));
  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row wrap' }, h('h3', { style: { margin: 0 } }, '📖 Learning sections'), h('span', { class: 'spacer' }), secType, h('button', { class: 'btn btn-sm', onclick: () => { L.sections.push({ id: uid('s'), type: secType.value, title: secType.value === 'fact' ? 'Did you know?' : secType.value === 'flashcards' ? 'Key words' : 'New section', body: '', cards: secType.value === 'flashcards' ? [] : undefined }); markDirty(); drawSections(); } }, '+ Add')),
    h('p', { class: 'small muted' }, 'Shown one at a time with read-aloud. Markdown supported: **bold**, lists, tables. Add pictures with ✨ (AI) or ⬆️ (upload).'), secWrap));
  function drawSections() {
    secWrap.innerHTML = '';
    L.sections.forEach((s, i) => {
      s.type ||= 'text';
      const t = h('input', { class: 'input', value: s.title, oninput: () => { s.title = t.value; } });
      const b = h('textarea', { class: 'input', rows: s.type === 'text' ? 6 : 2, oninput: () => { s.body = b.value; } }, s.body);
      const prev = h('div', { class: 'md card hidden', style: { marginTop: '6px' } });
      const extra = s.type === 'flashcards' ? h('label', { class: 'field', style: { marginTop: '8px' } }, h('span', {}, 'Cards, one per line: front = back'),
        (() => { const c = h('textarea', { class: 'input', rows: 4, placeholder: 'habitat = the natural home of an animal' }, (s.cards || []).map(x => `${x.front} = ${x.back}`).join('\n')); c.oninput = () => { s.cards = lines(c.value).map(l => { const [front, ...rest] = l.split('='); return { front: front.trim(), back: rest.join('=').trim() }; }); }; return c; })()) : null;
      secWrap.append(h('div', { class: 'editor-sec' },
        h('div', { class: 'row' }, h('b', {}, `${i + 1}.`), h('span', { class: 'pill' }, { text: '📖', fact: '💡', flashcards: '🃏' }[s.type]), t,
          h('button', { class: 'btn btn-sm', onclick: () => { prev.classList.toggle('hidden'); prev.innerHTML = md(b.value); } }, '👁'),
          s.type === 'text' ? h('button', { class: 'btn btn-sm btn-ai', title: 'Rewrite with AI', onclick: async e => {
            const instr = await promptDlg('✨ Improve this section', 'What should the AI change?', 'Make it simpler and more fun, with a clear worked example');
            if (!instr) return;
            const btn = e.target; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
            try { s.body = await improveSection({ lesson: L, section: s, instruction: instr, child: kidById(state.kidId) }); b.value = s.body; markDirty(); toast('Section updated', 'good'); }
            catch (err) { toast(err.message, 'error'); }
            btn.disabled = false; btn.textContent = '✨';
          } }, '✨') : null,
          h('button', { class: 'btn btn-sm', title: 'Move up', onclick: () => { if (i) { [L.sections[i - 1], L.sections[i]] = [L.sections[i], L.sections[i - 1]]; markDirty(); drawSections(); } } }, '↑'),
          h('button', { class: 'btn btn-sm', title: 'Delete', onclick: () => { L.sections.splice(i, 1); markDirty(); drawSections(); } }, '🗑')),
        b, extra, prev,
        h('details', { class: 'img-details', open: !!s.imageId }, h('summary', {}, s.imageId ? '🖼️ Picture' : '🖼️ Add a picture'), imageControl({ getId: () => s.imageId, setId: id => { s.imageId = id; }, getPrompt: () => s.imagePrompt, setPrompt: v => { s.imagePrompt = v; }, onChange: markDirty }))));
    });
  }
  drawSections();

  // Activities
  const actWrap = h('div');
  const addType = h('select', { class: 'input', style: { width: '210px' } }, ...Object.entries(TYPES).map(([v, t]) => h('option', { value: v }, `${t.icon} ${t.label}`)));
  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row wrap' }, h('h3', { style: { margin: 0 } }, '🧩 Activities'), h('span', { class: 'spacer' }), addType, h('button', { class: 'btn btn-sm', onclick: () => { L.activities.push(newActivity(addType.value, f.subject.value)); markDirty(); drawActs(); } }, '+ Add'),
      h('button', { class: 'btn btn-sm btn-ai', title: 'Let the AI write new activities of this type', onclick: async e => {
        const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
        try { const acts = await generateActivities({ lesson: collect(), type: addType.value, count: 2, child: kidById(L.personalisedFor) || kidById(state.kidId) }); L.activities.push(...acts); markDirty(); drawActs(); toast(`✨ Added ${acts.length} activities`, 'good'); }
        catch (err) { toast(err.message, 'error'); }
        b.disabled = false; b.textContent = '✨ Add 2 with AI';
      } }, '✨ Add 2 with AI')),
    h('p', { class: 'small muted' }, 'Most types are marked instantly. Short answers, writing and drawings are marked by AI (or by you in Review). Each activity is tagged with a skill, which powers progress tracking and gap detection.'), actWrap));
  function drawActs() {
    actWrap.innerHTML = '';
    L.activities.forEach((a, i) => {
      const t = TYPES[a.type] || {};
      const prompt = h('textarea', { class: 'input', rows: 2, oninput: () => { a.prompt = prompt.value; } }, a.prompt);
      const skill = skillSelect(a.skill, { onchange: () => { a.skill = skill.value; } });
      const hint = h('input', { class: 'input', value: a.hint || '', placeholder: 'Hint (optional)', oninput: () => { a.hint = hint.value; } });
      const expl = h('input', { class: 'input', value: a.explanation || '', placeholder: 'Explanation shown after answering', oninput: () => { a.explanation = expl.value; } });
      actWrap.append(h('div', { class: 'editor-sec' },
        h('div', { class: 'row' }, h('b', {}, `Q${i + 1}`), h('span', { class: 'pill brand' }, `${t.icon} ${t.label}`), h('span', { class: 'spacer' }), h('div', { style: { width: '250px' } }, skill),
          h('button', { class: 'btn btn-sm', title: 'Try it', onclick: () => previewLesson({ ...collect(), sections: [], intro: '', activities: [a] }) }, '👁'),
          h('button', { class: 'btn btn-sm btn-ai', title: 'Swap for a fresh AI question like this', onclick: async e => {
            const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
            try { const [n] = await generateActivities({ lesson: collect(), like: a, child: kidById(L.personalisedFor) || kidById(state.kidId) }); if (n) { L.activities[i] = n; markDirty(); drawActs(); toast('✨ New question', 'good'); } else toast('The AI could not make that one — try again', 'warn'); }
            catch (err) { toast(err.message, 'error'); }
            b.disabled = false; b.textContent = '✨';
          } }, '✨'),
          h('button', { class: 'btn btn-sm', title: 'Move up', onclick: () => { if (i) { [L.activities[i - 1], L.activities[i]] = [L.activities[i], L.activities[i - 1]]; markDirty(); drawActs(); } } }, '↑'),
          h('button', { class: 'btn btn-sm', onclick: () => { L.activities.splice(i, 1); markDirty(); drawActs(); } }, '🗑')),
        prompt, h('div', { style: { margin: '8px 0' } }, activityEditor(a, markDirty)), h('div', { class: 'grid2' }, hint, expl),
        h('details', { class: 'img-details', open: !!a.imageId }, h('summary', {}, '🖼️ Picture for this question'), imageControl({ getId: () => a.imageId, setId: id => { a.imageId = id; }, getPrompt: () => a.imagePrompt, setPrompt: v => { a.imagePrompt = v; }, onChange: markDirty }))));
    });
    if (!L.activities.length) actWrap.append(h('p', { class: 'muted' }, 'No activities yet.'));
  }
  drawActs();

  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } },
    h('label', { class: 'field' }, h('span', {}, '🏃 Away-from-the-screen challenge (shown to the child at the end)'), f.offline),
    h('label', { class: 'field' }, h('span', {}, '📝 Notes for parents (never shown to the child)'), f.notes),
    h('div', { class: 'row' }, !isNew ? h('button', { class: 'btn btn-danger', onclick: del }, '🗑 Delete lesson') : null,
      !isNew ? h('button', { class: 'btn', onclick: dup }, '⧉ Duplicate') : null, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary btn-lg', onclick: () => save(true).catch(() => { }) }, '💾 Save lesson'))));

  function versionDialog() {
    const kp = kidPicker(L.personalisedFor ? [L.personalisedFor] : state.kids.slice(0, 1).map(k => k.id));
    let dir = 'easier';
    const seg = h('div', { class: 'seg' }, ...[['easier', '🌱 Easier', 'More support'], ['harder', '🚀 Harder', 'A stretch'], ['personal', '🎯 Personalised', 'Their interests'], ['shorter', '⏱ Shorter', '15 minutes']].map(([v, l, d]) => h('button', { type: 'button', class: v === dir ? 'on' : '', onclick: e => { dir = v; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, h('b', {}, l), h('small', {}, d))));
    const date = h('input', { class: 'input', type: 'date', value: today(), style: { maxWidth: '170px' } });
    const assign = h('input', { type: 'checkbox', checked: true });
    const out = h('div');
    modal({
      title: `✨ Make a version of “${L.title}”`, wide: true,
      body: h('div', {}, h('div', { class: 'field' }, h('span', {}, 'For'), kp.el), h('div', { class: 'field' }, h('span', {}, 'How should it change?'), seg),
        h('div', { class: 'row', style: { marginTop: '8px' } }, h('label', { class: 'check' }, assign, 'Assign it on'), date), out),
      actions: [{ label: 'Cancel' }, { label: '✨ Create', cls: 'btn-ai', onClick: async () => {
        if (!kp.set.size) { toast('Pick a child', 'warn'); return false; }
        const made = [];
        for (const id of kp.set) {
          const kid = kidById(id);
          out.append(h('p', {}, h('span', { class: 'spinner' }), ` Writing a ${dir} version for ${kid.name}…`));
          try {
            const v = await adaptLesson({ lesson: collect(), child: kid, direction: dir });
            Object.assign(v, { source: 'ai', createdBy: state.me.name, personalisedFor: id, adaptedFrom: L.id, yearGroup: kid.yearGroup || v.yearGroup });
            await store.put('lessons', v); made.push(v);
            if (assign.checked) await store.put('assignments', asgFor(v.id, id, date.value || today()));
          } catch (e) { toast(e.message, 'error'); return false; }
        }
        toast(`✨ Created ${made.length} version${made.length > 1 ? 's' : ''}`, 'good');
        go('lessons', made[0].id);
      } }],
    });
  }

  function collect() {
    Object.assign(L, {
      title: f.title.value.trim() || 'Untitled lesson', subject: f.subject.value, topic: f.topic.value.trim(), yearGroup: f.yearGroup.value, durationMins: +f.duration.value || 30,
      objectives: lines(f.objectives.value), intro: f.intro.value, offlineActivity: f.offline.value, parentNotes: f.notes.value,
    });
    L.skills = [...new Set(L.activities.map(a => a.skill).filter(Boolean))];
    return L;
  }
  function problems() {
    const out = [];
    L.activities.forEach((a, i) => {
      const n = `Q${i + 1}`;
      if (!a.prompt.trim()) out.push(`${n} needs a question`);
      if (['mcq', 'multi'].includes(a.type) && a.options.filter(o => o.trim()).length < 2) out.push(`${n} needs at least 2 options`);
      if (a.type === 'order' && (a.items || []).length < 2) out.push(`${n} needs at least 2 items to order`);
      if (a.type === 'match' && (a.pairs || []).length < 2) out.push(`${n} needs at least 2 pairs`);
      if (a.type === 'sort' && ((a.items || []).length < 2 || (a.categories || []).length < 2 || a.items.some(x => !a.categories.includes(x.cat)))) out.push(`${n}: every item must use one of the groups`);
      if (a.type === 'fillblank' && !blanksOf(a.text).length) out.push(`${n} needs at least one [[gap]]`);
      if (a.type === 'numberline' && (isNaN(a.answer) || a.max <= a.min)) out.push(`${n}: check the number line values`);
      if (a.type === 'speak' && !a.target?.trim()) out.push(`${n} needs a sentence to read`);
    });
    return out;
  }
  async function save(announce = true) {
    collect();
    const p = problems();
    if (p.length) { toast(p[0], 'warn', 4500); throw new Error('invalid'); }
    await store.put('lessons', L);
    dirty = false; saveBtn.textContent = '💾 Save';
    if (announce) toast('Lesson saved', 'good');
    if (isNew) { isNew = false; history.replaceState(null, '', `#/p/lessons/${L.id}`); }
  }
  saveBtn.onclick = () => save(true).catch(() => { });
  async function del() {
    if (!(await confirmDlg(`Delete “${L.title}”${asgs.length ? ` and its ${asgs.length} assignment(s)` : ''}? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
    for (const a of asgs) await store.remove('assignments', a.id);
    await store.remove('lessons', L.id);
    toast('Lesson deleted'); go('lessons');
  }
  async function dup() {
    if (dirty) { try { await save(false); } catch { return; } }
    const copy = structuredClone(collect()); delete copy.id; delete copy.createdAt; delete copy.personalisedFor; copy.title += ' (copy)';
    await store.put('lessons', copy); toast('Duplicated', 'good'); go('lessons', copy.id);
  }
  window.onbeforeunload = () => (dirty ? 'You have unsaved changes' : undefined);
}

function newActivity(type, subj) {
  const sk = Object.keys(SKILLS).find(k => skillSubject(k) === subj) || 'general.other';
  const base = { id: uid('a'), type, prompt: '', skill: sk, hint: '', explanation: '' };
  const defaults = {
    mcq: { options: ['', '', ''], answer: 0 }, multi: { options: ['', '', '', ''], answers: [0] }, numeric: { answer: 0, unit: '' }, short: { answer: '', accept: [] },
    writing: { rubric: '', minWords: 30 }, order: { items: [] }, match: { pairs: [] }, sort: { categories: [], items: [] }, fillblank: { text: '', bank: true, distractors: [] },
    numberline: { min: 0, max: 10, step: 1, answer: 5, labels: ['0', '5', '10'], tickEvery: 1 }, draw: { rubric: '' }, speak: { target: '' },
  };
  return { ...base, ...structuredClone(defaults[type] || {}) };
}
