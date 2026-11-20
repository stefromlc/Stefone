// Story Studio — make an illustrated picture book. Ollie coaches (never writes it for you), AI paints pages, AI voice narrates.
import { store } from '../store.js';
import { h, toast, md, modal, uid } from '../util.js';
import { complete } from '../ai.js';
import { micButton, storedImg, say, stopAudio, sfx, saveImage, loadImage } from '../media.js';
import { nameIt, openPicker, kidPicture } from './doclib.js';

const SPARKS = [
  ['🐉', 'A dragon who is scared of the dark'], ['🚀', 'A rocket that lands in your garden'], ['🧚', 'A tiny fairy living in a teacup'], ['🦖', 'A dinosaur who wants to go to school'],
  ['🗝️', 'A mysterious key found on the beach'], ['🐙', 'An octopus who runs a café'], ['🌪️', 'A magic wind that swaps everyone\'s pets'], ['🤖', 'A robot who learns to laugh'],
];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc && !args.imageId) return start();
  if (!doc) doc = { childId: me.id, type: 'story', title: '', pages: [{ id: uid('p'), text: '', imageId: args.imageId || null }] };
  return studio();

  function start() {
    win.body.innerHTML = '';
    const own = h('input', { class: 'input big-input', placeholder: 'Or type your own idea…' });
    win.body.append(h('div', { class: 'app-pad tpl-pick' }, h('h2', {}, '📚 Let\'s make a story book!'), h('p', { class: 'muted' }, 'Pick a story spark to get started:'),
      h('div', { class: 'tpl-grid' }, ...SPARKS.map(([e, t]) => h('button', { class: 'tpl tpl-wide', onclick: () => begin(t) }, h('span', { class: 'e' }, e), t))),
      h('div', { class: 'row', style: { maxWidth: '560px', margin: '16px auto' } }, own, h('button', { class: 'btn btn-primary btn-lg', onclick: () => begin(own.value.trim() || 'My own story') }, 'Go ▶')),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', onclick: () => openPicker(ctx, 'story') }, '📂 Open a story I saved'))));
  }
  function begin(spark) {
    doc = { childId: me.id, type: 'story', title: '', spark, pages: [{ id: uid('p'), text: '', imageId: null }] };
    studio(true);
  }

  function studio(fresh) {
    let dirty = !!fresh || !!args.imageId, cur = 0;
    win.body.innerHTML = '';
    win.setTitle(doc.title || 'New story');
    const status = h('span', { class: 'save-status' });
    const setDirty = d => { dirty = d; win.markDirty(d); status.textContent = d ? '● Not saved' : '✓ Saved'; status.classList.toggle('unsaved', d); };
    async function save() {
      if (!doc.title) { const n = await nameIt(doc.spark && doc.spark !== 'My own story' ? doc.spark : '', 'story'); if (!n) throw new Error('Not saved'); doc.title = n; win.setTitle(n); }
      doc.coverImageId = doc.pages.find(p => p.imageId)?.imageId || null;
      await store.put('documents', doc); setDirty(false);
    }
    win.guard({ isDirty: () => dirty, save, name: () => doc.title || 'your story' });
    const doSave = () => save().then(() => toast('💾 Saved!', 'good')).catch(e => e.message !== 'Not saved' && toast(e.message, 'error'));

    const strip = h('div', { class: 'st-strip' });
    const pic = h('div', { class: 'st-pic' });
    const text = h('textarea', { class: 'st-text', spellcheck: 'true', lang: 'en-GB', placeholder: 'Write this page of your story… ✏️' });
    const coach = h('div', { class: 'st-coach md' });
    const pageNo = h('b');
    text.oninput = () => { doc.pages[cur].text = text.value; setDirty(true); drawStrip(); };

    const drawStrip = () => {
      strip.innerHTML = '';
      doc.pages.forEach((p, i) => strip.append(h('button', { class: `st-thumb ${i === cur ? 'on' : ''}`, onclick: () => { cur = i; drawPage(); } }, p.imageId ? storedImg(p.imageId) : h('span', { class: 'st-num' }, i + 1), h('small', {}, (p.text || '…').slice(0, 24)))));
      strip.append(h('button', { class: 'st-thumb st-add', onclick: () => { doc.pages.splice(cur + 1, 0, { id: uid('p'), text: '', imageId: null }); cur++; setDirty(true); drawPage(); } }, '+', h('small', {}, 'New page')));
    };
    const drawPage = () => {
      const p = doc.pages[cur];
      text.value = p.text || '';
      pageNo.textContent = `Page ${cur + 1} of ${doc.pages.length}`;
      pic.innerHTML = '';
      if (p.imageId) pic.append(storedImg(p.imageId), h('button', { class: 'icon-btn st-rm', title: 'Remove picture', onclick: () => { p.imageId = null; setDirty(true); drawPage(); } }, '✕'));
      else pic.append(h('div', { class: 'st-pic-empty' }, h('div', { style: { fontSize: '44px' } }, '🖼️'), h('div', {}, 'Add a picture to this page'),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn-primary', onclick: illustrate }, '🎨 Paint it from my words'), h('button', { class: 'btn', onclick: drawIt }, '🖌️ Draw it myself'))));
      coach.innerHTML = '';
      drawStrip();
    };

    async function illustrate() {
      const p = doc.pages[cur];
      if ((p.text || '').trim().split(/\s+/).length < 4) return toast('Write a sentence or two first — then I can paint it!', 'warn');
      pic.innerHTML = '<div class="st-pic-empty"><div class="brush-anim">🖌️</div>Painting your page…</div>';
      try {
        const story = doc.pages.slice(0, cur).map(x => x.text).join(' ').slice(-600);
        const { id } = await kidPicture(ctx, `Picture-book illustration for a children's story. Story so far: ${story}\nThis page: ${p.text}. Keep characters consistent and friendly.`, { aspect: '4:3', source: 'stories', label: p.text.slice(0, 140) });
        p.imageId = id; setDirty(true); sfx('star');
      } catch (e) { toast(e.message, 'warn', 5000); }
      drawPage();
    }
    async function drawIt() {
      // open Paint; when the child sends it back we can't link automatically, so offer a simple in-place canvas
      const cv = h('canvas', { width: 800, height: 600, class: 'draw-cv' });
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 600);
      let col = '#1f2440', last = null;
      const P = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); last = P(e); };
      cv.onpointermove = e => { if (!last) return; const p = P(e); g.strokeStyle = col; g.lineWidth = col === '#ffffff' ? 30 : 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; };
      cv.onpointerup = () => { last = null; };
      const cols = ['#1f2440', '#e03131', '#f76707', '#fcc419', '#37b24d', '#1c7ed6', '#7048e8', '#d6336c', '#8d5524', '#ffffff'];
      modal({ title: '🖌️ Draw your page', wide: true, body: h('div', {}, h('div', { class: 'row wrap' }, ...cols.map(c => h('button', { class: 'swatch', style: { background: c }, onclick: () => { col = c; } }))), cv),
        actions: [{ label: 'Cancel' }, { label: '✓ Use my drawing', cls: 'btn-primary', onClick: async () => { doc.pages[cur].imageId = await saveImage(cv.toDataURL('image/jpeg', 0.85), { kind: 'story', childId: me.id }); setDirty(true); drawPage(); } }] });
    }
    async function ideas() {
      coach.innerHTML = '<span class="spinner"></span> Ollie is thinking…';
      try {
        const so = doc.pages.map((p, i) => `Page ${i + 1}: ${p.text}`).join('\n');
        const r = await complete({ task: 'tutor', maxTokens: 300, temperature: 0.8, onToken: (_, f) => { coach.innerHTML = md(f); },
          messages: [{ role: 'system', content: `You are Ollie, a story coach for ${me.name}, aged ${me.age || 8} (UK). NEVER write the story for them. Ask 3 short, exciting "what if…?" or "how might…?" questions that spark ideas for what could happen next or how to describe it (senses, feelings, a surprise). Under 70 words, with an emoji each.` },
            { role: 'user', content: `Story idea: ${doc.spark || doc.title}\n${so || '(nothing written yet)'}` }] });
        coach.innerHTML = md(r);
      } catch (e) { coach.textContent = e.message; }
    }
    function readBook() {
      let i = 0, playing = true;
      const view = h('div', { class: 'book-view' });
      const m = modal({ title: `📖 ${doc.title || 'My story'}`, wide: true, cls: 'book-modal', body: view, actions: [], onClose: () => { playing = false; stopAudio(); } });
      const show = async () => {
        if (!playing) return;
        const p = doc.pages[i];
        view.innerHTML = '';
        view.append(h('div', { class: 'book-page' }, p.imageId ? storedImg(p.imageId) : null, h('p', {}, p.text || '…'), h('div', { class: 'small muted' }, `${i + 1} / ${doc.pages.length}`)),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', onclick: () => { stopAudio(); if (i > 0) { i--; show(); } } }, '⬅'), h('button', { class: 'btn', onclick: () => { stopAudio(); playing = false; } }, '⏸'), h('button', { class: 'btn', onclick: () => { stopAudio(); playing = true; if (i < doc.pages.length - 1) { i++; } show(); } }, '➡')));
        if (p.text) await say(p.text);
        if (playing && i < doc.pages.length - 1) { i++; setTimeout(show, 600); }
      };
      show();
    }
    const tb = (l, t, f) => h('button', { class: 'tb', title: t, onclick: f }, l);
    win.body.append(
      h('div', { class: 'app-toolbar' }, tb('📄 New', 'New story', () => ctx.openApp('stories', { start: true })), tb('📂 Open', 'Open', () => openPicker(ctx, 'story')), h('button', { class: 'btn btn-sm btn-primary', onclick: doSave }, '💾 Save'),
        h('span', { class: 'sep' }), tb('📖 Read my book', 'Read the whole book aloud', readBook),
        tb('📤 Send', 'Send to Mum & Dad', async () => { try { await save(); } catch { return; } doc.submitted = true; doc.submittedAt = Date.now(); doc.reviewed = false; await store.put('documents', doc); store.log('doc_sent', { title: doc.title }); toast('📤 Sent!', 'good'); }),
        h('span', { class: 'spacer' }), status),
      h('div', { class: 'st-main' },
        h('div', { class: 'st-page' }, pic,
          h('div', { class: 'st-write' }, h('div', { class: 'row' }, pageNo, h('span', { class: 'spacer' }), micButton(t => { text.value = (text.value ? text.value.trimEnd() + ' ' : '') + t; text.oninput(); }, { label: '🎤 Say it', cls: 'btn btn-sm' }),
            h('button', { class: 'btn btn-sm', onclick: () => say(text.value) }, '🔊'), h('button', { class: 'btn btn-sm btn-ai', onclick: ideas }, '💡 Ideas from Ollie'),
            h('button', { class: 'btn btn-sm', title: 'Delete this page', onclick: () => { if (doc.pages.length < 2) return; doc.pages.splice(cur, 1); cur = Math.max(0, cur - 1); setDirty(true); drawPage(); } }, '🗑')),
            doc.spark ? h('div', { class: 'small muted' }, `✨ Story spark: ${doc.spark}`) : null, text, coach))),
      strip);
    drawPage(); setDirty(dirty);
    setTimeout(() => text.focus(), 80);
  }
  return { handle: a => { if (a?.start) { doc = null; start(); } } };
}
