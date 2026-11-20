// Word Wizard — a child-friendly dictionary & thesaurus with pronunciation, syllable clapping and pictures.
import { store } from '../store.js';
import { h, toast, uid, timeAgo } from '../util.js';
import { completeJSON, screenKidMessage } from '../ai.js';
import { say, micButton, storedImg, sfx } from '../media.js';
import { kidPicture } from './doclib.js';

const cache = new Map();
export async function explainWord(word, child) {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const r = await completeJSON({
    task: 'tutor', maxTokens: 500, temperature: 0.3,
    messages: [
      { role: 'system', content: 'You are a children\'s dictionary for UK 8-year-olds (British spelling). Return ONLY JSON: {"word":"","syllables":"en-or-mous","partOfSpeech":"noun/verb/adjective/…","meaning":"simple meaning in under 15 words","example":"a fun example sentence","synonyms":["up to 5 more interesting words with the same meaning"],"antonyms":["up to 3"],"rhymes":["up to 4"],"emoji":"one emoji","didYouKnow":"optional fun fact about the word (origin etc), one sentence"}. If the word is rude or not suitable for children, return {"word":"","meaning":"Let\'s look up a different word!"}.' },
      { role: 'user', content: `Word: ${word}${child ? ` (for ${child.name}, ${child.yearGroup || 'Year 3'})` : ''}` },
    ],
  });
  cache.set(key, r);
  return r;
}

export async function open(win, ctx, args = {}) {
  const { me, settings } = ctx;
  const q = h('input', { class: 'input big-input', placeholder: 'Type a word…', autocapitalize: 'off' });
  const out = h('div', { class: 'ww-out' });
  const side = h('div', { class: 'ww-side' });
  win.body.append(h('div', { class: 'ww' },
    h('div', { class: 'ww-main' },
      h('div', { class: 'ww-hero' }, h('div', { class: 'ww-hat' }, '🪄'), h('h2', {}, 'Word Wizard'), h('p', { class: 'muted' }, 'Find out what a word means, how to say it, and some WOW words to use instead.')),
      h('div', { class: 'row' }, q, micButton(t => { q.value = t.split(/\s+/)[0]; look(); }, { cls: 'btn btn-lg' }), h('button', { class: 'btn btn-primary btn-lg', onclick: () => look() }, '🔎')),
      out),
    side));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') look(); });

  async function drawSide() {
    const mine = (await store.list('words', { childId: me.id })).sort((a, b) => b.ts - a.ts);
    side.innerHTML = '';
    side.append(h('h4', {}, `📒 My words (${mine.length})`));
    if (!mine.length) side.append(h('p', { class: 'small muted' }, 'Words you look up are saved here.'));
    mine.slice(0, 40).forEach(w => side.append(h('button', { class: 'ww-chip', onclick: () => { q.value = w.word; look(); } }, `${w.emoji || '🔤'} ${w.word}`)));
  }

  async function look(word = q.value.trim()) {
    word = word.replace(/[^a-zA-Z' -]/g, '').trim();
    if (!word) return;
    if (screenKidMessage(word, settings).blocked) { out.innerHTML = '<div class="empty">Let\'s look up a different word! 🙂</div>'; return; }
    out.innerHTML = '<div class="empty"><span class="spinner"></span> Waving my wand…</div>';
    try {
      const w = await explainWord(word, me);
      if (!w.word) { out.innerHTML = `<div class="empty">${w.meaning || 'Hmm, try another word.'}</div>`; return; }
      sfx('star');
      const saved = await store.list('words', { childId: me.id });
      let rec = saved.find(x => x.word.toLowerCase() === w.word.toLowerCase());
      if (!rec) { rec = { id: uid('wd_'), childId: me.id, word: w.word, meaning: w.meaning, emoji: w.emoji, ts: Date.now() }; await store.put('words', rec); store.log('word', { title: w.word }); drawSide(); }
      const pic = h('div', { class: 'ww-pic' }, rec.imageId ? storedImg(rec.imageId) : h('button', { class: 'btn', onclick: async e => {
        const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Drawing…';
        try { const { id } = await kidPicture(ctx, `a simple picture that shows the meaning of the word "${w.word}" (${w.meaning})`, { source: 'words', label: `picture of “${w.word}”` }); rec.imageId = id; await store.put('words', rec); pic.innerHTML = ''; pic.append(storedImg(id)); }
        catch (err) { toast(err.message, 'warn', 5000); b.disabled = false; b.textContent = '🎨 Show me a picture'; }
      } }, '🎨 Show me a picture'));
      const sylls = (w.syllables || w.word).split(/[-·]/);
      const chips = (title, arr, cls) => arr?.length ? h('div', { class: 'ww-row' }, h('b', {}, title), h('div', { class: 'chip-bank' }, ...arr.map(s => h('button', { class: `chipx ${cls}`, onclick: () => { q.value = s; look(s); } }, s)))) : null;
      out.innerHTML = '';
      out.append(h('div', { class: 'ww-card' },
        h('div', { class: 'row' }, h('span', { class: 'ww-emoji' }, w.emoji || '🔤'), h('div', { style: { flex: 1 } }, h('div', { class: 'ww-word' }, w.word), h('div', { class: 'muted' }, w.partOfSpeech || '')),
          h('button', { class: 'btn btn-lg', title: 'Say it', onclick: () => say(w.word) }, '🔊')),
        h('div', { class: 'ww-syl' }, h('span', { class: 'small muted' }, 'Clap it: '), ...sylls.map((s, i) => h('span', { class: 'syl', style: { animationDelay: i * .15 + 's' } }, s)), h('button', { class: 'btn btn-sm', onclick: async () => { for (const s of sylls) { sfx('pop'); await new Promise(r => setTimeout(r, 450)); } say(w.word); } }, '👏')),
        h('p', { class: 'ww-meaning' }, w.meaning),
        w.example ? h('p', { class: 'ww-ex' }, `“${w.example}”`, ' ', h('button', { class: 'icon-btn', onclick: () => say(w.example) }, '🔊')) : null,
        chips('✨ WOW words:', w.synonyms, 'syn'), chips('↔️ Opposites:', w.antonyms, 'ant'), chips('🎵 Rhymes with:', w.rhymes, 'rhy'),
        w.didYouKnow ? h('div', { class: 'feedback info' }, '💡 ', w.didYouKnow) : null, pic));
    } catch (e) { out.innerHTML = ''; out.append(h('div', { class: 'empty' }, '😕 ', e.message)); }
  }
  drawSide();
  if (args.word) { q.value = args.word; look(); }
  return { handle: a => { if (a?.word) { q.value = a.word; look(); } } };
}
