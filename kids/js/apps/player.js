// Interactive lesson player — used by the kids' Lessons app and the parents' "Preview" button.
import { store } from '../store.js';
import { h, md, stopSpeaking, speak, confetti, toast } from '../util.js';
import { subject, skillSubject } from '../skills.js';
import { renderActivity, markActivity, correctText, responseText, persistDrawing, TYPES } from './activities.js';
import { sayButton, storedImg, sfx, say } from '../media.js';

export { correctText, responseText };
export function starsFor(score) { return score == null ? 2 : score >= 0.9 ? 3 : score >= 0.7 ? 2 : 1; }
export const autoMark = markActivity;

const RETRY = new Set(['mcq', 'multi', 'numeric', 'short', 'order', 'match', 'sort', 'fillblank', 'numberline']);
const PRAISE = ['🎉 Brilliant!', '⭐ Spot on!', '👏 Well done!', '🚀 Super!', '🌟 Fantastic!', '💪 Great thinking!'];

/** renderPlayer(container, { lesson, assignment, child, preview, onExit, onAskHelper }) */
export function renderPlayer(container, opts) {
  const { lesson, child, preview } = opts;
  const asg = opts.assignment || { answers: {}, progress: 0 };
  asg.answers ||= {};
  const steps = [{ kind: 'intro' }, ...lesson.sections.map((s, i) => ({ kind: 'section', s, i })), ...lesson.activities.map((a, i) => ({ kind: 'act', a, i })), { kind: 'finish' }];
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
  const dots = h('div', { class: 'lp-dots' });
  let autoRead = !!opts.autoRead, combo = 0;
  const autoBtn = h('button', { class: `lp-auto ${autoRead ? 'on' : ''}`, title: 'Read every page to me automatically', onclick: () => { autoRead = !autoRead; autoBtn.classList.toggle('on', autoRead); opts.onAutoRead?.(autoRead); if (autoRead) speakStep(); else stopSpeaking(); } }, '🔊 Auto');
  const head = h('div', { class: 'lp-head', style: { '--sc': subj.color } }, h('span', { class: 'lp-subj' }, subj.icon), h('b', { class: 'lp-title' }, lesson.title), dots, autoBtn);
  const speakStep = () => {
    const st = steps[idx];
    if (st.kind === 'intro') say(`${lesson.title}. ${lesson.intro}`);
    else if (st.kind === 'section') say(`${st.s.title}. ${st.s.body || ''} ${(st.s.cards || []).map(c => c.front).join('. ')}`);
    else if (st.kind === 'act' && !asg.answers[st.a.id]) say(st.a.prompt + (st.a.options ? '. ' + st.a.options.join('. ') : ''));
  };
  const body = h('div', { class: 'lp-body' });
  const foot = h('div', { class: 'lp-foot' });
  const lpEl = h('div', { class: 'lp', tabindex: '-1' }, head, body, foot);
  container.append(lpEl);
  // Enter = press the main button (Check / Next / Start), except when typing in a box that handles Enter itself.
  lpEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.target.matches('input, textarea, [contenteditable]') || foot.contains(e.target)) return;
    const main = foot.querySelector('.btn-good:not(:disabled), .btn-primary:not(:disabled)');
    if (main) { e.preventDefault(); main.click(); }
  });

  const add = (...xs) => foot.append(...xs.filter(Boolean));
  const go = async n => { stopSpeaking(); idx = Math.max(0, Math.min(steps.length - 1, n)); if (!preview) { asg.progress = Math.max(asg.progress || 0, idx); await save(); } draw(); body.scrollTop = 0; };
  const btn = (label, cls, fn) => h('button', { class: `btn btn-lg ${cls || ''}`, onclick: fn }, label);
  const helperBtn = context => opts.onAskHelper ? h('button', { class: 'btn btn-lg', title: 'Ask Ollie for a hint', onclick: () => opts.onAskHelper(context) }, '🦉') : null;

  function drawDots() {
    dots.innerHTML = '';
    steps.forEach((st, i) => {
      let cls = st.kind === 'act' ? 'q' : st.kind === 'finish' ? 'f' : 'l';
      if (st.kind === 'act') { const a = asg.answers[st.a.id]; if (a) cls += a.pending ? ' pend' : a.correct ? ' ok' : ' no'; }
      if (i === idx) cls += ' cur';
      const reachable = preview || i <= Math.max(asg.progress || 0, idx);
      dots.append(h('button', { class: `lp-dot ${cls}`, title: st.kind === 'act' ? `Question ${st.i + 1}` : st.kind === 'section' ? st.s.title : st.kind, disabled: !reachable, onclick: () => go(i) }));
    });
  }

  function draw() {
    const st = steps[idx];
    drawDots();
    body.innerHTML = ''; foot.innerHTML = '';
    const back = idx > 0 && st.kind !== 'finish' ? btn('⬅', '', () => go(idx - 1)) : null;
    if (st.kind === 'intro') {
      body.append(h('div', { class: 'lp-intro' },
        lesson.coverImageId ? h('div', { class: 'lp-cover' }, storedImg(lesson.coverImageId)) : h('div', { class: 'lp-cover lp-cover-emoji', style: { background: subj.color + '22' } }, subj.icon),
        h('div', { class: 'row wrap' }, h('span', { class: 'pill', style: { background: subj.color + '22', color: subj.color } }, `${subj.icon} ${subj.name}`), h('span', { class: 'pill' }, `⏱ ${lesson.durationMins || 30} min`), h('span', { class: 'pill' }, `❓ ${lesson.activities.length} activities`)),
        h('h1', {}, lesson.title),
        lesson.objectives?.length ? h('div', { class: 'feedback info' }, h('div', {}, '🎯 Today I will learn:'), h('ul', { style: { margin: '6px 0 0' } }, ...lesson.objectives.map(o => h('li', {}, o)))) : null,
        h('div', { class: 'md', style: { marginTop: '14px' }, html: md(lesson.intro) })));
      add(opts.onExit ? btn('✕', 'btn-ghost', opts.onExit) : null, h('span', { class: 'spacer' }), sayButton(() => `${lesson.title}. ${(lesson.objectives || []).join('. ')}. ${lesson.intro}`, '🔊 Read to me', 'btn btn-lg'),
        btn(idx === 0 && (asg.progress || 0) > 0 && !preview ? 'Carry on ▶' : "Let's start! ▶", 'btn-primary', () => go(Math.max(1, preview ? 1 : asg.progress || 1))));
    } else if (st.kind === 'section') drawSection(st, back);
    else if (st.kind === 'act') drawActivity(st, back);
    else drawFinish();
    if (autoRead) setTimeout(speakStep, 250);
    setTimeout(() => { if (!lpEl.contains(document.activeElement)) lpEl.focus({ preventScroll: true }); }, 80);
  }

  function drawSection({ s, i }, back) {
    const kind = s.type || 'text';
    const label = kind === 'fact' ? '💡 Did you know?' : kind === 'flashcards' ? '🃏 Flip the cards' : `📖 Learn · part ${i + 1} of ${lesson.sections.length}`;
    const card = h('div', { class: `lp-sec lp-sec-${kind}` }, h('div', { class: 'lp-kicker' }, label), h('h2', {}, s.title));
    if (s.imageId) card.append(h('figure', { class: 'lp-fig' }, storedImg(s.imageId, { alt: s.title }), s.caption ? h('figcaption', {}, s.caption) : null));
    if (s.body) card.append(h('div', { class: 'md', html: md(s.body) }));
    if (kind === 'flashcards' && s.cards?.length) {
      card.append(h('div', { class: 'flash-grid' }, ...s.cards.map(c => {
        const f = h('button', { class: 'flash' }, h('div', { class: 'flash-in' }, h('div', { class: 'ff' }, c.front), h('div', { class: 'fb' }, c.back)));
        f.onclick = () => { f.classList.toggle('flipped'); sfx('pop'); if (f.classList.contains('flipped')) speak(c.back); };
        return f;
      })));
    }
    body.append(card);
    const text = `${s.title}. ${s.body || ''} ${(s.cards || []).map(c => `${c.front}: ${c.back}`).join('. ')}`;
    add(back, sayButton(() => text, '🔊 Read to me', 'btn btn-lg'), helperBtn(`Lesson "${lesson.title}", reading the part "${s.title}":\n${s.body || ''}`), h('span', { class: 'spacer' }), btn('Next ▶', 'btn-primary', () => go(idx + 1)));
  }

  function drawActivity({ a, i }, back) {
    const prev = asg.answers[a.id];
    let hintUsed = prev?.hintUsed || false, attempts = 0;
    const t = TYPES[a.type] || {};
    body.append(h('div', { class: 'lp-kicker' }, `${t.icon || '❓'} Question ${i + 1} of ${lesson.activities.length}`), h('div', { class: 'md lp-q', html: md(a.prompt) }));
    let checkFn = () => { };
    const widget = renderActivity(a, { prev, onEnter: () => checkFn() });
    body.append(widget.el);
    const fb = h('div');
    body.append(fb);
    const showResult = r => {
      fb.innerHTML = '';
      if (r.pending) { fb.append(h('div', { class: 'feedback info' }, r.feedback)); return; }
      const good = r.correct;
      const partial = !good && r.score > 0.4;
      fb.append(h('div', { class: `feedback ${good ? 'good' : 'bad'}` },
        h('div', { style: { fontSize: '1.15em' } }, good ? (r.secondTry ? '💪 Got it on the second go — well done for not giving up!' : PRAISE[i % PRAISE.length]) : partial ? `👍 Nearly! You got ${Math.round((r.secondTry ? r.score * 2 : r.score) * 100)}% right.` : "🤔 Not quite — that's OK, mistakes help us learn!"),
        good && combo >= 3 && !r.secondTry ? h('div', { class: 'combo' }, `🔥 ${combo} in a row!`) : null,
        r.feedback ? h('div', { style: { marginTop: '6px', fontWeight: 600 } }, r.feedback) : null,
        !good && ['mcq', 'numeric', 'short', 'multi'].includes(a.type) && correctText(a) ? h('div', { style: { marginTop: '6px', fontWeight: 600 } }, `The answer is: ${correctText(a)}`) : null,
        a.explanation ? h('div', { class: 'md', style: { marginTop: '6px', fontWeight: 500 }, html: md(a.explanation) }) : null));
    };
    if (prev) showResult(prev);
    const hintBtn = a.hint && !prev ? h('button', { class: 'btn btn-lg', onclick: () => { hintUsed = true; fb.innerHTML = ''; fb.append(h('div', { class: 'feedback info' }, '💡 ' + a.hint)); } }, '💡 Hint') : null;
    const checkBtn = btn(a.type === 'writing' || a.type === 'draw' ? 'Hand in ✓' : 'Check ✓', 'btn-good', check);
    checkFn = () => !prev && check();
    async function check() {
      const response = await widget.value();
      if (response == null || (!widget.ready() && a.type !== 'draw') || (a.type === 'draw' && !response)) return toast('Have a go first! 🙂', 'warn');
      if (['match', 'sort'].includes(a.type) && Object.keys(response).length < (a.type === 'match' ? a.pairs.length : a.items.length)) return toast('Finish placing all of them first!', 'warn');
      if (a.type === 'fillblank' && response.some(x => !String(x).trim())) return toast('Fill in every gap first!', 'warn');
      if (a.type === 'writing' && a.minWords && (String(response).match(/\S+/g) || []).length < Math.min(a.minWords, 10)) return toast(`Try writing a bit more — at least ${Math.min(a.minWords, 10)} words.`, 'warn');
      checkBtn.disabled = true; checkBtn.innerHTML = '<span class="spinner"></span> Checking…';
      const r = await markActivity(a, response, child);
      if (!r.correct && !r.pending && RETRY.has(a.type) && attempts === 0) {
        attempts = 1; combo = 0;
        sfx('bad');
        checkBtn.disabled = false; checkBtn.textContent = 'Check again ✓';
        fb.innerHTML = '';
        fb.append(h('div', { class: 'feedback bad' }, h('div', { style: { fontSize: '1.1em' } }, r.score > 0.4 ? `👍 Nearly — ${Math.round(r.score * 100)}% right. Have another go!` : '🤔 Not quite — have another go!'), h('div', { style: { marginTop: '6px', fontWeight: 600 } }, a.hint ? '💡 ' + a.hint : 'Read the question again carefully. You can do it! 💪')));
        if (a.type === 'mcq') widget.el.querySelectorAll('.choice.sel').forEach(c => { c.classList.add('tried'); c.classList.remove('sel'); });
        if (autoRead && a.hint) say(a.hint);
        return;
      }
      if (attempts === 1 && r.score != null) { r.score = r.score * 0.5; r.secondTry = true; }
      if (r.correct && !attempts) combo++; else if (!r.pending) combo = 0;
      const ans = { response: a.type === 'draw' ? 'drawing' : response, ...r, hintUsed, attempts: attempts + 1, ts: Date.now() };
      if (a.type === 'draw' && !preview) ans.imageId = await persistDrawing(response, { childId: child.id, ref: asg.id });
      else if (a.type === 'draw') ans.imageId = response;
      asg.answers[a.id] = ans;
      if (!preview) {
        if (r.score != null) await store.put('evidence', { id: `${asg.id}_${a.id}`, childId: child.id, skill: a.skill, subject: skillSubject(a.skill), score: hintUsed ? r.score * 0.8 : r.score, weight: 1, ts: Date.now(), source: 'lesson', ref: asg.id, lessonTitle: lesson.title, prompt: a.prompt, response: responseText(a, ans.response).slice(0, 400), correct: correctText(a) }).catch(() => { });
        asg.progress = Math.max(asg.progress || 0, idx);
        await save();
      }
      sfx(r.pending ? 'pop' : r.correct ? 'good' : 'bad');
      draw();
      if (r.correct) speak(PRAISE[i % PRAISE.length].replace(/^\S+\s/, ''));
    }
    add(back, sayButton(() => a.prompt + (a.options ? '. ' + a.options.map((o, k) => `${'ABCDEFG'[k]}: ${o}`).join('. ') : '') + (a.type === 'speak' ? '' : ''), '🔊', 'btn btn-lg'),
      helperBtn(`Lesson "${lesson.title}". The child is answering this question (do NOT give the answer): ${a.prompt}`), hintBtn, h('span', { class: 'spacer' }),
      prev ? btn('Next ▶', 'btn-primary', () => go(idx + 1)) : checkBtn);
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
      confetti(); sfx('star'); speak(`Fantastic work, ${child.name}! You earned ${stars} stars!`);
    }
    drawDots();
    body.append(h('div', { class: 'lp-finish' },
      unanswered.length ? h('div', {}, h('div', { style: { fontSize: '60px' } }, '🧗'), h('h2', {}, 'Almost there!'), h('p', {}, `You still have ${unanswered.length} question${unanswered.length > 1 ? 's' : ''} to answer.`), btn('Go to the next question', 'btn-primary', () => go(steps.findIndex(s => s.kind === 'act' && !asg.answers[s.a.id]))))
        : h('div', {},
          h('div', { class: 'stars big-stars' }, ...[0, 1, 2].map(k => h('span', { class: k < stars ? 'on' : '', style: { animationDelay: k * .25 + 's' } }, '⭐'))),
          h('h1', {}, `Lesson complete, ${child.name}!`),
          score != null ? h('p', { style: { fontSize: '1.3em' } }, `You got ${Math.round(score * 100)}% right.`) : null,
          pending ? h('p', {}, '📨 Some answers have been sent to Mum & Dad to check.') : null,
          lesson.offlineActivity ? h('div', { class: 'feedback info', style: { textAlign: 'left', maxWidth: '620px', margin: '18px auto' } }, h('div', {}, '🏃 Away-from-the-screen challenge'), h('div', { class: 'md', style: { fontWeight: 500 }, html: md(lesson.offlineActivity) })) : null,
          h('details', { class: 'lp-review' }, h('summary', {}, '📋 See all my answers'),
            ...lesson.activities.map((a, k) => { const an = asg.answers[a.id] || {}; return h('div', { class: 'lp-rev-row' }, h('span', { class: 'lp-rev-ic' }, an.pending ? '⏳' : an.correct ? (an.attempts > 1 ? '💪' : '✅') : '❌'), h('div', { style: { flex: 1 } }, h('b', {}, `${k + 1}. `, a.prompt.replace(/[*_#]/g, '').slice(0, 120)), !an.correct && !an.pending && correctText(a) && a.type !== 'writing' && a.type !== 'draw' ? h('div', { class: 'small muted' }, `Answer: ${correctText(a)}`) : null, h('button', { class: 'btn btn-sm', style: { marginTop: '4px' }, onclick: () => go(steps.findIndex(s => s.kind === 'act' && s.a.id === a.id)) }, 'Look again'))); })))));
    add(h('span', { class: 'spacer' }), opts.onExit ? btn(preview ? 'Close preview' : 'Back to my lessons', 'btn-primary', opts.onExit) : null);
  }

  draw();
  return { destroy: () => { clearInterval(timer); stopSpeaking(); save(); } };
}
