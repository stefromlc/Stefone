// Reading Buddy — levelled AI passages, read-aloud with speech recognition (accuracy + words per minute),
// then comprehension questions. Results feed progress tracking.
import { store } from '../store.js';
import { h, toast, md, uid, esc } from '../util.js';
import { completeJSON, childLine, normaliseActivity } from '../ai.js';
import { say, stopAudio, startRecording, transcribe, sayButton, sfx, canListen } from '../media.js';
import { renderActivity, markActivity, correctText, responseText } from './activities.js';
import { skillSubject } from '../skills.js';

const TOPICS = ['🦁 Animals', '🚀 Space', '🏰 Knights & castles', '🌋 Volcanoes', '⚽ Sport', '🦖 Dinosaurs', '🌊 The ocean', '🧙 Magic adventure', '🤖 Robots', '🏛️ Ancient Egypt', '🌳 Nature', '😂 Something funny'];
const norm = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');

export async function open(win, ctx) {
  const { me } = ctx;
  const pad = h('div', { class: 'app-pad rb', style: { flex: 1, overflow: 'auto' } });
  win.body.append(pad);

  async function menu() {
    pad.innerHTML = '';
    const hist = (await store.list('reading', { childId: me.id })).sort((a, b) => b.ts - a.ts);
    const own = h('input', { class: 'input', placeholder: 'Or type a topic you love…' });
    const len = h('select', { class: 'input', style: { width: '160px' } }, h('option', { value: 'short' }, 'Short (≈80 words)'), h('option', { value: 'medium', selected: true }, 'Medium (≈130 words)'), h('option', { value: 'long' }, 'Long (≈200 words)'));
    const kind = h('select', { class: 'input', style: { width: '160px' } }, ...['story', 'facts', 'poem'].map(k => h('option', { value: k }, { story: '📖 A story', facts: '🔎 Facts', poem: '🎵 A poem' }[k])));
    pad.append(h('div', { class: 'rb-hero' }, h('div', { style: { fontSize: '60px' } }, '📖'), h('h2', {}, 'Reading Buddy'), h('p', { class: 'muted' }, 'Pick something to read. Listen first if you like, then read it out loud to me!')),
      h('div', { class: 'tpl-grid' }, ...TOPICS.map(t => h('button', { class: 'tpl', onclick: () => make(t.slice(t.indexOf(' ') + 1), len.value, kind.value) }, h('span', { class: 'e' }, t.split(' ')[0]), t.slice(t.indexOf(' ') + 1)))),
      h('div', { class: 'row wrap', style: { justifyContent: 'center', margin: '14px 0' } }, own, kind, len, h('button', { class: 'btn btn-primary', onclick: () => own.value.trim() && make(own.value.trim(), len.value, kind.value) }, 'Go ▶')));
    if (hist.length) pad.append(h('h3', {}, '📈 My reading'), h('div', { class: 'rb-hist' }, ...hist.slice(0, 8).map(r => h('div', { class: 'rb-h' }, h('b', {}, r.title), h('span', { class: 'small muted' }, `${r.accuracy != null ? `🎯 ${Math.round(r.accuracy * 100)}% accurate · ` : ''}${r.wpm ? `⚡ ${r.wpm} words/min · ` : ''}${r.quizScore != null ? `✅ quiz ${Math.round(r.quizScore * 100)}%` : ''}`)))));
  }

  async function make(topic, length, kind) {
    pad.innerHTML = '<div class="empty"><div class="brush-anim">📖</div>Writing something just for you…</div>';
    try {
      const words = { short: 80, medium: 130, long: 200 }[length];
      const r = await completeJSON({
        task: 'lessons', maxTokens: 2500, temperature: 0.8,
        messages: [{ role: 'system', content: `You write levelled reading passages for UK children (British English). Return ONLY JSON: {"title":"...","text":"the passage, about ${words} words, in short paragraphs separated by \\n\\n","tricky":["up to 5 tricky words from the text"],"questions":[4 questions using these shapes: {"type":"mcq","prompt":"...","options":["..","..",".."],"answer":0,"skill":"english.reading-comprehension","explanation":"..."} or {"type":"short","prompt":"...","answer":"...","accept":[],"skill":"english.reading-comprehension"} or {"type":"order","prompt":"Put these events in order","items":["...","...","..."],"skill":"english.reading-comprehension"} or {"type":"match","prompt":"Match each word to its meaning","pairs":[["word","meaning"]],"skill":"english.vocabulary"}]}. Include: one retrieval question, one inference question ("why do you think…"), one vocabulary question, and one sequencing or summary question. Age-appropriate, warm and fun.` },
          { role: 'user', content: `${childLine(me)}\nWrite ${kind === 'poem' ? 'a rhyming poem' : kind === 'facts' ? 'an information text' : 'a short story'} about: ${topic}. Pitch it at their reading level.` }],
      });
      const passage = { id: uid('rd_'), title: r.title || topic, text: String(r.text || ''), tricky: r.tricky || [], questions: (r.questions || []).map(q => normaliseActivity(q)).filter(Boolean) };
      read(passage);
    } catch (e) { pad.innerHTML = ''; pad.append(h('div', { class: 'empty' }, '😕 ', e.message), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', onclick: menu }, '⬅ Back'))); }
  }

  function read(p) {
    const result = { childId: me.id, title: p.title, ts: Date.now(), passageId: p.id };
    pad.innerHTML = '';
    const words = p.text.split(/(\s+)/);
    const textEl = h('div', { class: 'rb-text' });
    words.forEach(w => { if (/\S/.test(w)) textEl.append(h('span', { class: 'w', 'data-w': norm(w) }, w)); else textEl.append(w.includes('\n') ? h('br') : ' '); });
    const status = h('div', { class: 'rb-status' });
    const rec = h('button', { class: 'btn btn-lg btn-primary' }, '🎤 Start reading');
    let r = null, t0 = 0;
    canListen().then(ok => { if (!ok) { rec.disabled = true; rec.textContent = '🎤 Not available here'; } });
    rec.onclick = async () => {
      if (!r) {
        stopAudio();
        try { r = await startRecording(); } catch (e) { return toast('Microphone not available: ' + e.message, 'warn'); }
        t0 = Date.now(); rec.textContent = '⏹ I\'ve finished'; rec.classList.add('recording');
        status.textContent = 'Reading… take your time 🙂'; return;
      }
      const cur = r; r = null; rec.classList.remove('recording'); rec.disabled = true; rec.innerHTML = '<span class="spinner"></span> Listening back…';
      try {
        const { blob, seconds } = await cur.stop();
        const heard = (await transcribe(blob)).split(/\s+/).map(norm).filter(Boolean);
        const spans = [...textEl.querySelectorAll('.w')];
        // simple alignment: walk the passage, matching heard words within a small window
        let j = 0, hits = 0;
        spans.forEach(s => {
          const w = s.dataset.w; if (!w) return;
          const k = heard.slice(j, j + 7).indexOf(w);
          if (k >= 0) { s.classList.add('ok'); hits++; j += k + 1; } else s.classList.add('miss');
        });
        const total = spans.filter(s => s.dataset.w).length;
        result.accuracy = total ? hits / total : 0;
        result.wpm = Math.round(hits / Math.max(0.2, seconds / 60));
        result.missed = spans.filter(s => s.classList.contains('miss')).map(s => s.textContent.replace(/[^a-zA-Z']/g, '')).filter(Boolean).slice(0, 20);
        status.innerHTML = '';
        status.append(h('div', { class: `feedback ${result.accuracy >= 0.85 ? 'good' : 'info'}` }, `${result.accuracy >= 0.9 ? '🌟 Superstar reading!' : result.accuracy >= 0.75 ? '👏 Great reading!' : '💪 Good try — the orange words were tricky.'} You read ${Math.round(result.accuracy * 100)}% of the words, at ${result.wpm} words a minute.`,
          result.missed.length ? h('div', { class: 'small', style: { marginTop: '6px' } }, 'Tap an orange word to hear it.') : null));
        sfx(result.accuracy >= 0.75 ? 'good' : 'pop');
        await store.put('evidence', { id: 'ev_' + p.id + '_fluency', childId: me.id, skill: 'english.phonics', subject: 'english', score: result.accuracy, weight: 2, ts: Date.now(), source: 'reading', prompt: `Read aloud: ${p.title}`, response: `${Math.round(result.accuracy * 100)}% · ${result.wpm} wpm`, correct: result.missed.length ? `Tricky words: ${result.missed.join(', ')}` : '' });
        rec.disabled = false; rec.textContent = '🎤 Read it again';
      } catch (e) { toast(e.message, 'error'); rec.disabled = false; rec.textContent = '🎤 Try again'; }
    };
    textEl.addEventListener('click', e => { const w = e.target.closest('.w'); if (w) say(w.textContent.replace(/[^a-zA-Z' -]/g, '')); });
    pad.append(h('button', { class: 'btn', onclick: () => { stopAudio(); menu(); } }, '⬅ Back'),
      h('h2', { style: { margin: '12px 0' } }, p.title),
      p.tricky?.length ? h('div', { class: 'small' }, '🔑 Tricky words: ', ...p.tricky.map(w => h('button', { class: 'chipx', onclick: () => say(w) }, w))) : null,
      textEl,
      h('div', { class: 'row wrap', style: { justifyContent: 'center', margin: '14px 0' } }, sayButton(p.text, '👂 Listen first', 'btn btn-lg'), rec, h('button', { class: 'btn btn-lg btn-good', onclick: () => quiz(p, result) }, 'Questions ▶')),
      status);
  }

  async function quiz(p, result) {
    stopAudio();
    let i = 0, score = 0;
    const answers = [];
    const step = () => {
      pad.innerHTML = '';
      if (i >= p.questions.length) return finish();
      const q = p.questions[i];
      const w = renderActivity(q, {});
      const fb = h('div');
      const check = h('button', { class: 'btn btn-good btn-lg', onclick: async () => {
        const v = await w.value();
        if (!w.ready()) return toast('Have a go first 🙂', 'warn');
        check.disabled = true;
        const r = await markActivity(q, v, me);
        answers.push(r); if (r.score != null) score += r.score;
        await store.put('evidence', { id: `ev_${p.id}_${q.id}`, childId: me.id, skill: q.skill, subject: skillSubject(q.skill), score: r.score ?? 0.5, weight: 1, ts: Date.now(), source: 'reading', prompt: `${p.title}: ${q.prompt}`, response: responseText(q, v).slice(0, 300), correct: correctText(q) });
        sfx(r.correct ? 'good' : 'bad');
        fb.append(h('div', { class: `feedback ${r.correct ? 'good' : 'bad'}` }, r.correct ? '🎉 Yes!' : `🤔 Not quite. ${['mcq', 'short'].includes(q.type) ? 'Answer: ' + correctText(q) : ''}`, r.feedback ? h('div', {}, r.feedback) : null, q.explanation ? h('div', { class: 'small' }, q.explanation) : null));
        check.replaceWith(h('button', { class: 'btn btn-primary btn-lg', onclick: () => { i++; step(); } }, 'Next ▶'));
      } }, 'Check ✓');
      pad.append(h('div', { class: 'lp-kicker' }, `Question ${i + 1} of ${p.questions.length}`), h('div', { class: 'md lp-q', html: md(q.prompt) }), w.el, fb,
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => read(p) }, '📖 Look at the text'), h('span', { class: 'spacer' }), check));
    };
    async function finish() {
      result.quizScore = p.questions.length ? score / p.questions.length : null;
      await store.put('reading', { id: p.id, ...result });
      store.log('reading', { title: p.title, score: result.quizScore });
      sfx('star');
      pad.append(h('div', { class: 'lp-finish' }, h('div', { class: 'stars big-stars' }, ...[0, 1, 2].map(k => h('span', { class: k < (result.quizScore >= .9 ? 3 : result.quizScore >= .6 ? 2 : 1) ? 'on' : '' }, '⭐'))),
        h('h2', {}, 'Brilliant reading!'), h('p', {}, `Questions: ${Math.round((result.quizScore || 0) * 100)}%${result.accuracy != null ? ` · Reading aloud: ${Math.round(result.accuracy * 100)}%` : ''}`),
        h('button', { class: 'btn btn-primary btn-lg', onclick: menu }, '📚 Read something else')));
    }
    step();
  }

  await menu();
}
