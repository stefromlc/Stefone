// Interactive lesson player — used by the kids' Lessons app and the parents' "Preview" button.
import { store } from '../store.js';
import { esc, h, md, speak, stopSpeaking, confetti, toast } from '../util.js';
import { subject, skillSubject } from '../skills.js';
import { markAnswer, aiReady } from '../ai.js';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = s => (String(s).trim().match(/\S+/g) || []).length;

export function starsFor(score) { return score == null ? 2 : score >= 0.9 ? 3 : score >= 0.7 ? 2 : 1; }

export function correctText(a) {
  if (a.type === 'mcq') return a.options?.[a.answer] ?? '';
  if (a.type === 'numeric') return `${a.answer}${a.unit ? ' ' + a.unit : ''}`;
  if (a.type === 'short') return a.answer;
  return a.rubric || '';
}

export async function autoMark(act, response, child) {
  if (act.type === 'mcq') { const ok = Number(response) === Number(act.answer); return { score: ok ? 1 : 0, correct: ok }; }
  if (act.type === 'numeric') {
    const v = parseFloat(String(response).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, ''));
    const ok = !isNaN(v) && Math.abs(v - Number(act.answer)) < 0.001;
    return { score: ok ? 1 : 0, correct: ok };
  }
  if (act.type === 'short') {
    const r = norm(response);
    if ([act.answer, ...(act.accept || [])].some(x => norm(x) && norm(x) === r)) return { score: 1, correct: true };
  }
  if (await aiReady()) {
    try { return await markAnswer({ activity: act, response, child }); }
    catch (e) { console.warn(e); }
  }
  return { score: null, correct: null, pending: true, feedback: 'Thanks! A grown-up will check this one. ⭐' };
}

/**
 * renderPlayer(container, { lesson, assignment, child, preview, onExit, onAskHelper })
 */
export function renderPlayer(container, opts) {
  const { lesson, child, preview } = opts;
  const asg = opts.assignment || { answers: {}, progress: 0 };
  asg.answers ||= {};
  const steps = [{ kind: 'intro' }, ...lesson.sections.map(s => ({ kind: 'section', s })), ...lesson.activities.map((a, i) => ({ kind: 'act', a, i })), { kind: 'finish' }];
  let idx = Math.min(asg.progress || 0, steps.length - 1);
  const subj = subject(lesson.subject);
  let timer = null, lastTick = Date.now();

  const save = async () => {
    if (preview || !asg.id) return;
    const now = Date.now();
    if (!document.hidden) asg.timeSpentSec = (asg.timeSpentSec || 0) + Math.min(60, (now - lastTick) / 1000);
    lastTick = now;
    await store.put('assignments', asg).catch(e => console.warn(e));
  };
  if (!preview) {
    timer = setInterval(save, 20000);
    if (asg.status === 'assigned') { asg.status = 'in_progress'; asg.startedAt = Date.now(); store.log('lesson_start', { title: lesson.title }); save(); }
  }

  container.innerHTML = '';
  const prog = h('div', { class: 'lp-progress' }, h('i'));
  const body = h('div', { class: 'lp-body' });
  const foot = h('div', { class: 'lp-foot' });
  const wrap = h('div', { class: 'lp' }, prog, body, foot);
  container.append(wrap);

  const add = (...xs) => foot.append(...xs.filter(Boolean));
  const go = async n => { stopSpeaking(); idx = Math.max(0, Math.min(steps.length - 1, n)); if (!preview) { asg.progress = Math.max(asg.progress || 0, idx); await save(); } draw(); body.scrollTop = 0; };
  const btn = (label, cls, fn) => h('button', { class: `btn btn-lg ${cls || ''}`, onclick: fn }, label);
  const sayBtn = text => h('button', { class: 'btn', onclick: () => speak(text) }, '🔊 Read to me');
  const helperBtn = context => opts.onAskHelper ? h('button', { class: 'btn', onclick: () => opts.onAskHelper(context) }, '🦉 Ask for help') : null;

  function draw() {
    const st = steps[idx];
    prog.firstChild.style.width = `${(idx / (steps.length - 1)) * 100}%`;
    body.innerHTML = ''; foot.innerHTML = '';
    const back = idx > 0 && st.kind !== 'finish' ? btn('⬅', '', () => go(idx - 1)) : null;
    if (st.kind === 'intro') {
      body.append(
        h('div', { class: 'row' }, h('span', { class: 'pill', style: { background: subj.color + '22', color: subj.color } }, `${subj.icon} ${subj.name}`), h('span', { class: 'pill' }, `⏱ ${lesson.durationMins || 30} min`)),
        h('h1', { style: { fontSize: '2em', margin: '12px 0' } }, lesson.title),
        lesson.objectives?.length ? h('div', { class: 'feedback info' }, h('div', {}, '🎯 Today I will learn:'), h('ul', { style: { margin: '6px 0 0' } }, ...lesson.objectives.map(o => h('li', {}, o)))) : null,
        h('div', { class: 'md', style: { marginTop: '16px' }, html: md(lesson.intro) }));
      add(opts.onExit ? btn('✕', 'btn-ghost', opts.onExit) : '', h('span', { class: 'spacer' }), sayBtn(`${lesson.title}. ${(lesson.objectives || []).join('. ')}. ${lesson.intro}`), btn(idx === 0 && (asg.progress || 0) > 0 ? 'Carry on ▶' : "Let's start! ▶", 'btn-primary', () => go(Math.max(1, preview ? 1 : asg.progress || 1))));
    } else if (st.kind === 'section') {
      body.append(h('div', { class: 'muted small', style: { fontWeight: 800 } }, `Learn · part ${steps.filter(s => s.kind === 'section').indexOf(st) + 1} of ${lesson.sections.length}`), h('h2', {}, st.s.title), h('div', { class: 'md', html: md(st.s.body) }));
      add(back, sayBtn(`${st.s.title}. ${st.s.body}`), helperBtn(`Lesson "${lesson.title}", reading the part "${st.s.title}":\n${st.s.body}`), h('span', { class: 'spacer' }), btn('Next ▶', 'btn-primary', () => go(idx + 1)));
    } else if (st.kind === 'act') drawActivity(st, back);
    else drawFinish();
  }

  function drawActivity({ a, i }, back) {
    const prev = asg.answers[a.id];
    let response = prev?.response ?? (a.type === 'mcq' ? null : '');
    let hintUsed = prev?.hintUsed || false;
    body.append(h('div', { class: 'muted small', style: { fontWeight: 800 } }, `Question ${i + 1} of ${lesson.activities.length}`), h('div', { class: 'md', style: { fontSize: '1.2em', fontWeight: 700 }, html: md(a.prompt) }));
    const area = h('div');
    body.append(area);
    const fb = h('div');
    body.append(fb);
    let input;
    if (a.type === 'mcq') {
      a.options.forEach((o, k) => {
        const c = h('button', { class: 'choice', onclick: () => { if (prev) return; response = k; area.querySelectorAll('.choice').forEach((b, j) => b.classList.toggle('sel', j === k)); } }, `${'ABCDEFG'[k]}.  ${o}`);
        if (prev) { if (k === a.answer) c.classList.add('right'); else if (k === Number(prev.response)) c.classList.add('wrong'); }
        area.append(c);
      });
    } else if (a.type === 'writing') {
      input = h('textarea', { class: 'input', rows: 9, spellcheck: 'true', lang: 'en-GB', placeholder: 'Write your answer here…', style: { fontSize: '1.1em' } }, response);
      const wc = h('div', { class: 'small muted' });
      const upd = () => { wc.textContent = `${wordCount(input.value)} words${a.minWords ? ` (aim for at least ${a.minWords})` : ''}`; };
      input.oninput = () => { response = input.value; upd(); }; upd();
      if (prev) input.readOnly = true;
      area.append(input, wc);
    } else {
      input = h('input', { class: 'input big-input', type: a.type === 'numeric' ? 'text' : 'text', inputmode: a.type === 'numeric' ? 'decimal' : 'text', value: response, placeholder: a.type === 'numeric' ? 'Type a number' : 'Type your answer', style: { maxWidth: a.type === 'numeric' ? '260px' : '100%' } });
      input.oninput = () => { response = input.value; };
      input.onkeydown = e => { if (e.key === 'Enter' && !prev) check(); };
      if (prev) input.readOnly = true;
      area.append(h('div', { class: 'row' }, input, a.unit ? h('b', {}, a.unit) : null));
      setTimeout(() => !prev && input.focus(), 50);
    }
    const showResult = r => {
      fb.innerHTML = '';
      if (r.pending) fb.append(h('div', { class: 'feedback info' }, r.feedback));
      else {
        const good = r.correct;
        fb.append(h('div', { class: `feedback ${good ? 'good' : 'bad'}` },
          h('div', { style: { fontSize: '1.15em' } }, good ? ['🎉 Brilliant!', '⭐ Spot on!', '👏 Well done!', '🚀 Super!'][i % 4] : '🤔 Not quite — that\'s OK, mistakes help us learn!'),
          r.feedback ? h('div', { style: { marginTop: '6px', fontWeight: 600 } }, r.feedback) : null,
          !good && a.type !== 'writing' && correctText(a) ? h('div', { style: { marginTop: '6px', fontWeight: 600 } }, `The answer is: ${correctText(a)}`) : null,
          a.explanation ? h('div', { class: 'md', style: { marginTop: '6px', fontWeight: 500 }, html: md(a.explanation) }) : null));
      }
    };
    if (prev) showResult(prev);
    const hintBtn = a.hint && !prev ? h('button', { class: 'btn btn-lg', onclick: () => { hintUsed = true; fb.innerHTML = ''; fb.append(h('div', { class: 'feedback info' }, '💡 ' + a.hint)); } }, '💡 Hint') : null;
    async function check() {
      if (response == null || String(response).trim() === '') return toast('Have a go first! 🙂', 'warn');
      if (a.type === 'writing' && a.minWords && wordCount(response) < Math.min(a.minWords, 10)) return toast(`Try writing a bit more — at least ${Math.min(a.minWords, 10)} words.`, 'warn');
      checkBtn.disabled = true; checkBtn.innerHTML = '<span class="spinner"></span> Checking…';
      const r = await autoMark(a, response, child);
      const ans = { response, ...r, hintUsed, ts: Date.now() };
      if (!preview) {
        asg.answers[a.id] = ans;
        if (r.score != null) await store.put('evidence', { id: `${asg.id}_${a.id}`, childId: child.id, skill: a.skill, subject: skillSubject(a.skill), score: hintUsed ? r.score * 0.8 : r.score, weight: 1, ts: Date.now(), source: 'lesson', ref: asg.id, lessonTitle: lesson.title, prompt: a.prompt, response: a.type === 'mcq' ? a.options[response] : String(response).slice(0, 400), correct: correctText(a) }).catch(() => { });
        asg.progress = Math.max(asg.progress || 0, idx);
        await save();
      } else asg.answers[a.id] = ans;
      draw();
      if (r.correct) speak(['Brilliant!', 'Spot on!', 'Well done!', 'Super!'][i % 4]);
    }
    const checkBtn = btn(a.type === 'writing' ? 'Hand in ✓' : 'Check ✓', 'btn-good', check);
    add(back, sayBtn(a.prompt + (a.type === 'mcq' ? '. ' + a.options.map((o, k) => `${'ABCDEFG'[k]}: ${o}`).join('. ') : '')), helperBtn(`Lesson "${lesson.title}". The child is answering this question (do NOT give the answer): ${a.prompt}${a.type === 'mcq' ? ' Options: ' + a.options.join(' / ') : ''}`), hintBtn, h('span', { class: 'spacer' }), prev ? btn('Next ▶', 'btn-primary', () => go(idx + 1)) : checkBtn);
  }

  async function drawFinish() {
    const scored = Object.values(asg.answers).filter(x => x.score != null);
    const score = scored.length ? scored.reduce((t, x) => t + x.score, 0) / scored.length : null;
    const pending = lesson.activities.some(a => asg.answers[a.id]?.pending);
    const unanswered = lesson.activities.filter(a => !asg.answers[a.id]);
    const stars = starsFor(score);
    if (!preview && !asg.completedAt && !unanswered.length) {
      Object.assign(asg, { score, stars, completedAt: Date.now(), status: pending ? 'submitted' : 'complete' });
      await save();
      store.log('lesson_complete', { title: lesson.title, score });
      confetti(); speak(`Fantastic work, ${child.name}! You earned ${stars} stars!`);
    }
    body.append(h('div', { style: { textAlign: 'center', paddingTop: '20px' } },
      unanswered.length ? h('div', {}, h('h2', {}, 'Almost there!'), h('p', {}, `You still have ${unanswered.length} question${unanswered.length > 1 ? 's' : ''} to answer.`), btn('Go to next question', 'btn-primary', () => go(steps.findIndex(s => s.kind === 'act' && !asg.answers[s.a.id]))))
        : h('div', {},
          h('div', { class: 'stars' }, '⭐'.repeat(stars) + '☆'.repeat(3 - stars)),
          h('h1', {}, `Lesson complete, ${child.name}!`),
          score != null ? h('p', { style: { fontSize: '1.3em' } }, `You got ${Math.round(score * 100)}% of the questions right.`) : null,
          pending ? h('p', {}, '📨 Some answers have been sent to Mum & Dad to check.') : null,
          lesson.offlineActivity ? h('div', { class: 'feedback info', style: { textAlign: 'left', maxWidth: '620px', margin: '18px auto' } }, h('div', {}, '🏃 Away-from-the-screen challenge'), h('div', { class: 'md', style: { fontWeight: 500 }, html: md(lesson.offlineActivity) })) : null)));
    add(h('span', { class: 'spacer' }), opts.onExit ? btn(preview ? 'Close preview' : 'Back to my lessons', 'btn-primary', opts.onExit) : null);
  }

  draw();
  return { destroy: () => { clearInterval(timer); stopSpeaking(); save(); } };
}
