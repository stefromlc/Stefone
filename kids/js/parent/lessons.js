// Lesson library, AI lesson generator and the full lesson editor.
import { store } from '../store.js';
import { h, esc, toast, modal, confirmDlg, md, today, fmtDate, uid, promptDlg } from '../util.js';
import { SUBJECTS, SKILLS, subject, skillName, skillSubject } from '../skills.js';
import { generateLesson, improveSection, aiReady } from '../ai.js';
import { header, go, state, kidById } from './shell.js';
import { childData, recentMistakes } from './data.js';
import { renderPlayer } from '../apps/player.js';
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

const blankLesson = () => ({ title: 'New lesson', subject: 'maths', topic: '', yearGroup: kidById(state.kidId)?.yearGroup || 'Year 3', durationMins: 30, objectives: [], intro: '', sections: [{ id: uid('s'), title: 'Learn', body: '' }], activities: [], skills: [], offlineActivity: '', parentNotes: '' });

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

// ─────────────── Library ───────────────
async function library(main) {
  header(main, '📚 Lessons', { actions: [h('button', { class: 'btn', onclick: () => go('lessons', 'blank') }, '+ Blank lesson'), h('button', { class: 'btn btn-ai', onclick: () => go('lessons', 'new') }, '✨ Create with AI')] });
  const [lessons, asgs] = await Promise.all([store.list('lessons'), store.list('assignments')]);
  const q = h('input', { class: 'input', placeholder: 'Search lessons…', style: { maxWidth: '280px' } });
  const sf = h('select', { class: 'input', style: { maxWidth: '220px' } }, h('option', { value: '' }, 'All subjects'), ...SUBJECTS.map(s => h('option', { value: s.id }, `${s.icon} ${s.name}`)));
  const tbody = h('tbody');
  main.append(h('div', { class: 'card' }, h('div', { class: 'row wrap', style: { marginBottom: '10px' } }, q, sf, h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${lessons.length} lessons`)),
    h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Lesson', 'Subject', 'Skills', 'Qs', 'Assigned', ''].map(t => h('th', {}, t)))), tbody))));
  const draw = () => {
    const term = q.value.toLowerCase();
    const rows = lessons.filter(l => (!sf.value || l.subject === sf.value) && (!term || `${l.title} ${l.topic}`.toLowerCase().includes(term))).sort((a, b) => b.createdAt - a.createdAt);
    tbody.innerHTML = '';
    if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: 6 }, h('div', { class: 'empty' }, h('span', { class: 'big' }, '📭'), lessons.length ? 'No lessons match.' : 'No lessons yet — create your first one with AI!'))));
    rows.forEach(l => {
      const s = subject(l.subject);
      const n = asgs.filter(a => a.lessonId === l.id);
      tbody.append(h('tr', {},
        h('td', {}, h('a', { href: `#/p/lessons/${l.id}`, style: { fontWeight: 800, color: 'inherit' } }, l.title), h('div', { class: 'small muted' }, `${l.topic || ''}${l.bridgingFor ? ' · 🌉 bridging lesson' : ''}${l.source === 'ai' ? ' · ✨ AI' : ''}`)),
        h('td', {}, h('span', { class: 'pill', style: { background: s.color + '22', color: s.color } }, `${s.icon} ${s.name}`)),
        h('td', { class: 'small' }, (l.skills || []).slice(0, 3).map(skillName).join(', ')),
        h('td', {}, l.activities?.length || 0),
        h('td', { class: 'small' }, n.length ? `${n.length} (${n.filter(a => a.completedAt).length} done)` : '—'),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn btn-sm', onclick: () => assignDialog(l) }, '📅 Assign'), ' ',
          h('button', { class: 'btn btn-sm', onclick: () => previewLesson(l) }, '👁'), ' ',
          h('button', { class: 'btn btn-sm', onclick: () => go('lessons', l.id) }, '✏️'))));
    });
  };
  q.oninput = draw; sf.onchange = draw; draw();
}

// ─────────────── Preview & assign ───────────────
export function previewLesson(lesson) {
  const kid = kidById(state.kidId) || state.kids[0] || { id: 'preview', name: 'Preview', age: 8 };
  const box = h('div', { style: { height: '70vh', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' } });
  const m = modal({ title: `👁 Preview — ${lesson.title}`, body: box, wide: true, actions: [] });
  const p = renderPlayer(box, { lesson, child: kid, preview: true, onExit: () => m.close() });
  const obs = new MutationObserver(() => { if (!document.body.contains(box)) { p.destroy(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}

export function assignDialog(lesson, { date = today(), kidIds } = {}) {
  if (!state.kids.length) return toast('Add children first (Settings → Family)', 'warn');
  const chosen = new Set(kidIds || (state.kidId && state.kidId !== 'all' ? [state.kidId] : state.kids.map(k => k.id)));
  const dateIn = h('input', { class: 'input', type: 'date', value: date });
  const checks = state.kids.map(k => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(k.id), onchange: e => e.target.checked ? chosen.add(k.id) : chosen.delete(k.id) }), `${k.avatar} ${k.name}`));
  return new Promise(res => modal({
    title: `📅 Assign “${lesson.title}”`,
    body: h('div', {}, h('div', { class: 'field' }, h('span', {}, 'Who?'), ...checks), h('label', { class: 'field' }, h('span', {}, 'Which day?'), dateIn)),
    actions: [{ label: 'Cancel' }, {
      label: 'Assign', cls: 'btn-primary', onClick: async () => {
        if (!chosen.size) { toast('Pick at least one child', 'warn'); return false; }
        for (const kid of chosen) await store.put('assignments', { id: uid('as_'), lessonId: lesson.id, childId: kid, date: dateIn.value || today(), status: 'assigned', answers: {}, progress: 0, assignedBy: state.me.name });
        toast(`Assigned to ${[...chosen].map(id => kidById(id)?.name).join(' & ')} for ${fmtDate(dateIn.value)}`, 'good');
        res(true);
      },
    }],
    onClose: () => res(false),
  }));
}

// ─────────────── AI generator ───────────────
async function generator(main, { kidId, skill, topicHint }) {
  header(main, skill ? '🌉 Bridging lesson' : '✨ Create a lesson with AI', { actions: [h('button', { class: 'btn', onclick: () => go('lessons') }, '← Library')] });
  if (!(await aiReady())) {
    main.append(h('div', { class: 'alert info' }, 'AI is not connected. ', store.isAdmin ? h('a', { href: '#/p/settings/ai' }, 'Add an OpenRouter key in Settings') : 'Ask Dad to add an OpenRouter key in Settings.', ' — or ', h('a', { href: '#/p/lessons/blank' }, 'write a lesson by hand'), '.'));
    return;
  }
  const kid = kidById(kidId) || kidById(state.kidId) || state.kids[0];
  const kidSel = h('select', { class: 'input' }, ...state.kids.map(k => h('option', { value: k.id, selected: kid && k.id === kid.id }, `${k.avatar} ${k.name} (${k.yearGroup || ''})`)), h('option', { value: '' }, 'Not personalised'));
  const subj = subjectSelect(skill ? skillSubject(skill) : 'maths');
  const topic = h('input', { class: 'input', placeholder: 'e.g. Equivalent fractions, The Romans in Britain, Life cycle of a frog', value: topicHint || (skill ? skillName(skill) : '') });
  const dur = h('select', { class: 'input' }, ...[15, 20, 30, 45, 60].map(n => h('option', { value: n, selected: n === 30 }, `${n} minutes`)));
  const diff = h('select', { class: 'input' }, ...[['easier — build confidence', 'Easier'], ['right at their level', 'At their level'], ['a stretch — challenge them', 'Stretch']].map(([v, l], i) => h('option', { value: v, selected: skill ? i === 0 : i === 1 }, l)));
  const count = h('select', { class: 'input' }, ...[4, 5, 6, 8, 10].map(n => h('option', { value: n, selected: n === 6 }, `${n} questions`)));
  const focus = skillSelect(skill || '', {}); focus.prepend(h('option', { value: '', selected: !skill }, '(let the AI choose)'));
  const notes = h('textarea', { class: 'input', rows: 3, placeholder: 'Anything else? e.g. "Use football examples", "Include a short reading passage", "Link to our trip to the museum"' });
  const assignToo = h('input', { type: 'checkbox', checked: true });
  const assignDate = h('input', { class: 'input', type: 'date', value: today(), style: { maxWidth: '170px' } });
  const status = h('div');
  const btn = h('button', { class: 'btn btn-ai btn-lg' }, '✨ Generate lesson');
  let mistakes = [];
  if (skill && kid) {
    const d = await childData(kid.id);
    mistakes = recentMistakes(d.evidence, skill);
    const m = d.mastery.find(x => x.skill === skill);
    status.append(h('div', { class: 'alert info' }, '🌉', h('div', {}, h('b', {}, `${kid.name} is at ${m ? Math.round(m.mastery * 100) + '%' : '?'} on ${skillName(skill)}. `), mistakes.length ? `The AI will look at ${Math.min(12, mistakes.length)} recent mistakes to find the misconception and re-teach it a different way.` : 'No specific mistakes recorded — the AI will re-teach the fundamentals.')));
  }
  main.append(h('div', { class: 'card ai-box' },
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'For'), kidSel),
      h('label', { class: 'field' }, h('span', {}, 'Subject'), subj),
      h('label', { class: 'field', style: { gridColumn: '1 / -1' } }, h('span', {}, 'Topic'), topic),
      h('label', { class: 'field' }, h('span', {}, 'Length'), dur),
      h('label', { class: 'field' }, h('span', {}, 'Difficulty'), diff),
      h('label', { class: 'field' }, h('span', {}, 'Questions'), count),
      h('label', { class: 'field' }, h('span', {}, 'Focus skill'), focus)),
    h('label', { class: 'field' }, h('span', {}, 'Extra instructions'), notes),
    h('div', { class: 'row wrap' }, h('label', { class: 'check' }, assignToo, 'Assign to them on'), assignDate, h('span', { class: 'spacer' }), btn),
    status));
  btn.onclick = async () => {
    if (!topic.value.trim()) return toast('Please enter a topic', 'warn');
    btn.disabled = true;
    status.innerHTML = '';
    const prog = h('div', { class: 'progress-line', style: { margin: '14px 0 6px' } }, h('i', { style: { width: '8%' } }));
    const msg = h('div', { class: 'small muted' }, 'Planning the lesson…');
    status.append(prog, msg);
    let pctDone = 8; const iv = setInterval(() => { pctDone = Math.min(92, pctDone + 3); prog.firstChild.style.width = pctDone + '%'; }, 900);
    try {
      const child = kidById(kidSel.value);
      const lesson = await generateLesson({
        child, subject: subj.value, topic: topic.value.trim(), durationMins: +dur.value, difficulty: diff.value, activityCount: +count.value,
        focusSkills: focus.value ? [focus.value] : [], mistakes, notes: notes.value.trim(), onStage: s => { msg.textContent = s; },
      });
      clearInterval(iv); prog.firstChild.style.width = '100%';
      lesson.source = 'ai'; lesson.createdBy = state.me.name;
      if (skill) lesson.bridgingFor = { childId: kidSel.value, skill };
      if (child) lesson.yearGroup = child.yearGroup || lesson.yearGroup;
      await store.put('lessons', lesson);
      if (assignToo.checked && child) await store.put('assignments', { id: uid('as_'), lessonId: lesson.id, childId: child.id, date: assignDate.value || today(), status: 'assigned', answers: {}, progress: 0, assignedBy: state.me.name });
      toast(`✨ Lesson created${assignToo.checked && child ? ` and assigned to ${child.name}` : ''} — check it over below`, 'good', 4500);
      go('lessons', lesson.id);
    } catch (e) {
      clearInterval(iv); btn.disabled = false;
      status.innerHTML = ''; status.append(h('div', { class: 'alert bad' }, '😕 ', e.message));
    }
  };
}

// ─────────────── Editor ───────────────
async function editor(main, lesson, isNew) {
  const L = structuredClone(lesson);
  L.sections ||= []; L.activities ||= []; L.objectives ||= [];
  let dirty = isNew;
  const asgs = isNew ? [] : (await store.list('assignments')).filter(a => a.lessonId === L.id);
  const saveBtn = h('button', { class: 'btn btn-primary' }, '💾 Save');
  header(main, isNew ? 'New lesson' : 'Edit lesson', {
    actions: [h('button', { class: 'btn', onclick: () => go('lessons') }, '← Library'),
      h('button', { class: 'btn', onclick: () => previewLesson(collect()) }, '👁 Preview as child'),
      h('button', { class: 'btn', onclick: async () => { try { await save(false); } catch { return; } assignDialog(L).then(() => go('lessons', L.id)); } }, '📅 Assign'), saveBtn],
  });
  const markDirty = () => { dirty = true; saveBtn.textContent = '💾 Save *'; };
  const ed = h('div'); main.append(ed);
  ed.addEventListener('input', markDirty); ed.addEventListener('change', markDirty);

  if (asgs.length) ed.append(h('div', { class: 'alert info' }, '📅', h('div', {}, `Assigned ${asgs.length} time${asgs.length > 1 ? 's' : ''}: `, ...asgs.map(a => h('span', { class: 'pill', style: { marginRight: '4px' } }, `${kidById(a.childId)?.avatar || ''} ${fmtDate(a.date)} · ${a.status.replace('_', ' ')}`)))));
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
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Learning objectives'), f.objectives), h('label', { class: 'field' }, h('span', {}, 'Introduction (hook) — markdown'), f.intro))));

  // Sections
  const secWrap = h('div');
  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, '📖 Teaching sections'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', onclick: () => { L.sections.push({ id: uid('s'), title: 'New section', body: '' }); markDirty(); drawSections(); } }, '+ Section')), h('p', { class: 'small muted' }, 'Shown one at a time with read-aloud. Markdown supported: **bold**, lists, tables.'), secWrap));
  function drawSections() {
    secWrap.innerHTML = '';
    L.sections.forEach((s, i) => {
      const t = h('input', { class: 'input', value: s.title, oninput: () => { s.title = t.value; } });
      const b = h('textarea', { class: 'input', rows: 6, oninput: () => { s.body = b.value; } }, s.body);
      const prev = h('div', { class: 'md card hidden', style: { marginTop: '6px' } });
      secWrap.append(h('div', { class: 'editor-sec' },
        h('div', { class: 'row' }, h('b', {}, `${i + 1}.`), t,
          h('button', { class: 'btn btn-sm', onclick: () => { prev.classList.toggle('hidden'); prev.innerHTML = md(b.value); } }, '👁'),
          h('button', { class: 'btn btn-sm btn-ai', onclick: async e => {
            const instr = await promptDlg('✨ Improve this section', 'What should the AI change?', 'Make it simpler and more fun, with a clear worked example');
            if (!instr) return;
            const btn = e.target; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
            try { s.body = await improveSection({ lesson: L, section: s, instruction: instr, child: kidById(state.kidId) }); b.value = s.body; markDirty(); toast('Section updated', 'good'); }
            catch (err) { toast(err.message, 'error'); }
            btn.disabled = false; btn.textContent = '✨';
          } }, '✨'),
          h('button', { class: 'btn btn-sm', title: 'Move up', onclick: () => { if (i) { [L.sections[i - 1], L.sections[i]] = [L.sections[i], L.sections[i - 1]]; markDirty(); drawSections(); } } }, '↑'),
          h('button', { class: 'btn btn-sm', title: 'Delete', onclick: () => { L.sections.splice(i, 1); markDirty(); drawSections(); } }, '🗑')),
        b, prev));
    });
  }
  drawSections();

  // Activities
  const actWrap = h('div');
  const addType = h('select', { class: 'input', style: { width: '170px' } }, ...[['mcq', 'Multiple choice'], ['numeric', 'Number answer'], ['short', 'Short answer'], ['writing', 'Writing task']].map(([v, l]) => h('option', { value: v }, l)));
  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row wrap' }, h('h3', { style: { margin: 0 } }, '❓ Questions & activities'), h('span', { class: 'spacer' }), addType, h('button', { class: 'btn btn-sm', onclick: () => { L.activities.push(newActivity(addType.value, L.subject)); markDirty(); drawActs(); } }, '+ Add')),
    h('p', { class: 'small muted' }, 'Multiple choice and number answers are marked instantly. Short answers and writing are marked by AI (or by you in Review). Each question is tagged with a skill — that powers progress tracking and gap detection.'), actWrap));
  function drawActs() {
    actWrap.innerHTML = '';
    L.activities.forEach((a, i) => {
      const prompt = h('textarea', { class: 'input', rows: 2, oninput: () => { a.prompt = prompt.value; } }, a.prompt);
      const skill = skillSelect(a.skill, { onchange: () => { a.skill = skill.value; } });
      const hint = h('input', { class: 'input', value: a.hint || '', placeholder: 'Hint (optional)', oninput: () => { a.hint = hint.value; } });
      const expl = h('input', { class: 'input', value: a.explanation || '', placeholder: 'Explanation shown after answering', oninput: () => { a.explanation = expl.value; } });
      const specific = h('div');
      if (a.type === 'mcq') {
        const drawOpts = () => {
          specific.innerHTML = '';
          a.options.forEach((o, k) => {
            const inp = h('input', { class: 'input', value: o, oninput: () => { a.options[k] = inp.value; } });
            specific.append(h('div', { class: 'row', style: { marginBottom: '4px' } }, h('input', { type: 'radio', name: `ans-${a.id}`, checked: a.answer === k, title: 'Correct answer', onchange: () => { a.answer = k; } }), inp, h('button', { class: 'btn btn-sm', onclick: () => { a.options.splice(k, 1); if (a.answer >= a.options.length) a.answer = 0; markDirty(); drawOpts(); } }, '✕')));
          });
          specific.append(h('button', { class: 'btn btn-sm', onclick: () => { a.options.push(''); drawOpts(); } }, '+ option'), h('span', { class: 'small muted' }, '  ● = correct answer'));
        };
        drawOpts();
      } else if (a.type === 'numeric') {
        const ans = h('input', { class: 'input', type: 'number', step: 'any', value: a.answer ?? '', oninput: () => { a.answer = parseFloat(ans.value); } });
        const unit = h('input', { class: 'input', value: a.unit || '', placeholder: 'unit (optional)', oninput: () => { a.unit = unit.value; } });
        specific.append(h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Correct answer'), ans), h('label', { class: 'field' }, h('span', {}, 'Unit'), unit)));
      } else if (a.type === 'short') {
        const ans = h('input', { class: 'input', value: a.answer || '', oninput: () => { a.answer = ans.value; } });
        const acc = h('input', { class: 'input', value: (a.accept || []).join('; '), placeholder: 'Other accepted answers, separated by ;', oninput: () => { a.accept = acc.value.split(';').map(x => x.trim()).filter(Boolean); } });
        specific.append(h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Model answer'), ans), h('label', { class: 'field' }, h('span', {}, 'Also accept'), acc)));
      } else if (a.type === 'writing') {
        const rub = h('textarea', { class: 'input', rows: 2, oninput: () => { a.rubric = rub.value; } }, a.rubric || '');
        const mw = h('input', { class: 'input', type: 'number', value: a.minWords || 30, oninput: () => { a.minWords = +mw.value; } });
        specific.append(h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'What a good answer includes (used for AI marking)'), rub), h('label', { class: 'field' }, h('span', {}, 'Target words'), mw)));
      }
      actWrap.append(h('div', { class: 'editor-sec' },
        h('div', { class: 'row' }, h('b', {}, `Q${i + 1}`), h('span', { class: 'pill brand' }, { mcq: 'Multiple choice', numeric: 'Number', short: 'Short answer', writing: 'Writing' }[a.type]), h('span', { class: 'spacer' }), h('div', { style: { width: '260px' } }, skill),
          h('button', { class: 'btn btn-sm', title: 'Move up', onclick: () => { if (i) { [L.activities[i - 1], L.activities[i]] = [L.activities[i], L.activities[i - 1]]; markDirty(); drawActs(); } } }, '↑'),
          h('button', { class: 'btn btn-sm', onclick: () => { L.activities.splice(i, 1); markDirty(); drawActs(); } }, '🗑')),
        prompt, h('div', { style: { margin: '8px 0' } }, specific), h('div', { class: 'grid2' }, hint, expl)));
    });
    if (!L.activities.length) actWrap.append(h('p', { class: 'muted' }, 'No questions yet.'));
  }
  drawActs();

  ed.append(h('div', { class: 'card', style: { marginTop: '14px' } },
    h('label', { class: 'field' }, h('span', {}, '🏃 Away-from-the-screen challenge (shown to the child at the end)'), f.offline),
    h('label', { class: 'field' }, h('span', {}, '📝 Notes for parents (never shown to the child)'), f.notes),
    h('div', { class: 'row' }, !isNew ? h('button', { class: 'btn btn-danger', onclick: del }, '🗑 Delete lesson') : null,
      !isNew ? h('button', { class: 'btn', onclick: dup }, '⧉ Duplicate') : null, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary btn-lg', onclick: () => save(true).catch(() => { }) }, '💾 Save lesson'))));

  function collect() {
    Object.assign(L, {
      title: f.title.value.trim() || 'Untitled lesson', subject: f.subject.value, topic: f.topic.value.trim(), yearGroup: f.yearGroup.value, durationMins: +f.duration.value || 30,
      objectives: f.objectives.value.split('\n').map(x => x.trim()).filter(Boolean), intro: f.intro.value, offlineActivity: f.offline.value, parentNotes: f.notes.value,
    });
    L.skills = [...new Set(L.activities.map(a => a.skill).filter(Boolean))];
    return L;
  }
  async function save(announce = true) {
    collect();
    if (L.activities.some(a => a.type === 'mcq' && a.options.filter(o => o.trim()).length < 2)) { toast('Each multiple-choice question needs at least 2 options', 'warn'); throw new Error('invalid'); }
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
    const copy = structuredClone(collect()); delete copy.id; delete copy.createdAt; copy.title += ' (copy)';
    await store.put('lessons', copy); toast('Duplicated', 'good'); go('lessons', copy.id);
  }
  window.onbeforeunload = () => (dirty ? 'You have unsaved changes' : undefined);
}

function newActivity(type, subj) {
  const sk = Object.keys(SKILLS).find(k => skillSubject(k) === subj) || 'general.other';
  const base = { id: uid('a'), type, prompt: '', skill: sk, hint: '', explanation: '' };
  if (type === 'mcq') Object.assign(base, { options: ['', '', ''], answer: 0 });
  if (type === 'numeric') Object.assign(base, { answer: 0, unit: '' });
  if (type === 'short') Object.assign(base, { answer: '', accept: [] });
  if (type === 'writing') Object.assign(base, { rubric: '', minWords: 30 });
  return base;
}
