// Writer — a kid-friendly word processor with ribbon tabs, templates, pictures, dictation and AI writing tips.
import { store } from '../store.js';
import { h, toast, sanitize, textOf, modal, md, esc, fmtDate } from '../util.js';
import { complete, aiReady } from '../ai.js';
import { sayButton, micButton, fileToDataUrl, say } from '../media.js';
import { nameIt, openPicker, kidPicture } from './doclib.js';
import { explainWord } from './words.js';

const FONTS = [['Nunito', 'Rounded'], ['Patrick Hand', 'Handwriting'], ['Lexend', 'Easy-read'], ['Georgia, serif', 'Book'], ['Arial, sans-serif', 'Plain'], ['Courier New, monospace', 'Typewriter']];

const TEMPLATES = [
  { id: 'blank', icon: '📄', name: 'Blank page', html: '' },
  { id: 'story', icon: '🐉', name: 'Story', html: '<h1>My story title</h1><h2>Beginning</h2><p>Once upon a time…</p><h2>Middle</h2><p>Suddenly…</p><h2>End</h2><p>In the end…</p>' },
  { id: 'letter', icon: '✉️', name: 'Letter', html: '<p style="text-align:right">My address<br>Today\'s date</p><p>Dear …,</p><p>I am writing to tell you…</p><p>Love from,<br>…</p>' },
  { id: 'diary', icon: '📔', name: 'Diary', html: `<h1>Dear Diary</h1><p><b>${fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</b></p><p>Today I…</p><p>The best part was…</p><p>I felt…</p>` },
  { id: 'poem', icon: '🌈', name: 'Poem', html: '<h1 style="text-align:center">My poem</h1><p style="text-align:center">First line…<br>Second line…<br>Third line…<br>Fourth line…</p>' },
  { id: 'report', icon: '🦁', name: 'Fact file', html: '<h1>All about …</h1><h2>What is it?</h2><p>…</p><h2>Where is it found?</h2><p>…</p><h2>Amazing facts</h2><ul><li>…</li><li>…</li></ul><h2>Glossary</h2><p><b>word</b> – meaning</p>' },
  { id: 'instructions', icon: '🧁', name: 'Instructions', html: '<h1>How to …</h1><h2>You will need</h2><ul><li>…</li></ul><h2>What to do</h2><ol><li>First, …</li><li>Next, …</li><li>Then, …</li><li>Finally, …</li></ol>' },
  { id: 'review', icon: '⭐', name: 'Book review', html: '<h1>Book review</h1><p><b>Title:</b> …<br><b>Author:</b> …</p><h2>What happens</h2><p>…</p><h2>My favourite part</h2><p>…</p><h2>Stars</h2><p>⭐⭐⭐⭐⭐</p>' },
];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc && !args.template) return chooseTemplate();
  if (!doc) doc = { childId: me.id, type: 'doc', title: '', content: TEMPLATES.find(t => t.id === args.template)?.html || '' };
  return editorUI();

  function chooseTemplate() {
    win.setTitle('Writer');
    win.body.innerHTML = '';
    win.body.append(h('div', { class: 'app-pad tpl-pick' }, h('h2', {}, '✏️ What would you like to write?'),
      h('div', { class: 'tpl-grid' }, ...TEMPLATES.map(t => h('button', { class: 'tpl', onclick: () => { doc = { childId: me.id, type: 'doc', title: '', content: t.html }; editorUI(); } }, h('span', { class: 'e' }, t.icon), t.name))),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '16px' } }, h('button', { class: 'btn', onclick: () => openPicker(ctx, 'doc') }, '📂 Open something I saved'))));
  }

  function editorUI() {
    let dirty = false, savedRange = null, zoom = 1;
    win.body.innerHTML = '';
    win.setTitle(doc.title || 'Untitled');
    const page = h('div', { class: 'writer-page', contenteditable: 'true', spellcheck: 'true', lang: 'en-GB', 'data-ph': 'Start writing here… ✏️' });
    page.innerHTML = sanitize(doc.content || '');
    const status = h('span', { class: 'save-status' });
    const wc = h('span');
    const setDirty = d => { dirty = d; win.markDirty(d); status.textContent = d ? '● Not saved' : doc.id ? '✓ Saved' : ''; status.classList.toggle('unsaved', d); };
    const saveSel = () => { const s = getSelection(); if (s.rangeCount && page.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
    const restoreSel = () => { page.focus(); if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } };
    const exec = (cmd, val = null) => { restoreSel(); document.execCommand(cmd, false, val); setDirty(true); updateCount(); saveSel(); };
    const insertHTML = html => { restoreSel(); document.execCommand('insertHTML', false, html); setDirty(true); updateCount(); };
    const tb = (label, title, fn, cls = '') => h('button', { class: `tb ${cls}`, title, onmousedown: e => e.preventDefault(), onclick: fn }, label);
    const group = (name, ...items) => h('div', { class: 'rb-group' }, h('div', { class: 'rb-items' }, ...items), h('div', { class: 'rb-name' }, name));
    page.addEventListener('keyup', saveSel); page.addEventListener('mouseup', saveSel); page.addEventListener('blur', saveSel);

    async function save({ copy = false } = {}) {
      if (!doc.title || copy) {
        const n = await nameIt(copy ? `${doc.title} (copy)` : (page.querySelector('h1')?.textContent.trim() || ''), 'writing');
        if (!n) throw new Error('Not saved');
        if (copy) { doc = { ...doc, id: undefined, createdAt: undefined }; }
        doc.title = n; win.setTitle(n);
      }
      doc.content = sanitize(page.innerHTML);
      await store.put('documents', doc);
      setDirty(false);
    }
    win.guard({ isDirty: () => dirty, save: () => save(), name: () => doc.title || 'your writing' });

    // ── ribbon ──
    const font = h('select', { class: 'input rb-sel', title: 'Font', onmousedown: saveSel, onchange: () => exec('fontName', font.value) }, ...FONTS.map(([v, l]) => h('option', { value: v, style: { fontFamily: v } }, l)));
    const size = h('select', { class: 'input rb-sel', title: 'Size', onmousedown: saveSel, onchange: () => exec('fontSize', size.value), style: { width: '86px' } }, ...[['2', 'Small'], ['3', 'Normal'], ['4', 'Big'], ['5', 'Bigger'], ['6', 'Huge'], ['7', 'Giant']].map(([v, l]) => h('option', { value: v, selected: v === '3' }, l)));
    const colorBtn = (cmd, title, icon, cols) => {
      const b = tb(icon, title, () => { saveSel(); const pop = h('div', { class: 'color-pop' }, ...cols.map(c => h('button', { style: { background: c }, onmousedown: e => e.preventDefault(), onclick: () => { exec(cmd, c); pop.remove(); } }))); b.parentElement.append(pop); setTimeout(() => document.addEventListener('mousedown', () => pop.remove(), { once: true }), 0); });
      return h('span', { style: { position: 'relative' } }, b);
    };
    const textCols = ['#1f2440', '#e03131', '#f76707', '#f59f00', '#2f9e44', '#1c7ed6', '#7048e8', '#d6336c', '#868e96', '#ffffff'];
    const hlCols = ['#fff3bf', '#ffd8a8', '#d3f9d8', '#d0ebff', '#e5dbff', '#ffdeeb', 'transparent'];
    const tabs = {
      home: [
        group('Font', font, size, tb(h('b', {}, 'B'), 'Bold (Ctrl+B)', () => exec('bold')), tb(h('i', {}, 'I'), 'Italic', () => exec('italic')), tb(h('u', {}, 'U'), 'Underline', () => exec('underline')), colorBtn('foreColor', 'Text colour', h('span', { class: 'tb-col' }, 'A'), textCols), colorBtn('hiliteColor', 'Highlighter', '🖍️', hlCols)),
        group('Style', tb('H1', 'Big heading', () => exec('formatBlock', 'H1')), tb('H2', 'Small heading', () => exec('formatBlock', 'H2')), tb('¶', 'Normal text', () => exec('formatBlock', 'P'))),
        group('Paragraph', tb('•', 'Bullet list', () => exec('insertUnorderedList')), tb('1.', 'Numbered list', () => exec('insertOrderedList')), tb('⬅', 'Align left', () => exec('justifyLeft')), tb('↔', 'Centre', () => exec('justifyCenter')), tb('➡', 'Align right', () => exec('justifyRight'))),
        group('Undo', tb('↶', 'Undo (Ctrl+Z)', () => exec('undo')), tb('↷', 'Redo', () => exec('redo'))),
      ],
      insert: [
        group('Pictures', h('label', { class: 'tb', title: 'Picture from this computer', onmousedown: saveSel }, '🖼️ Picture', h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; insertHTML(`<img src="${await fileToDataUrl(f, 900)}" style="max-width:100%">`); e.target.value = ''; } })),
          tb('🎨 AI picture', 'Ask the AI to draw a picture', aiPicture)),
        group('Add', tb('😀 Emoji', 'Emoji', e => emojiPicker()), tb('▦ Table', 'Table', () => insertHTML('<table class="w-table"><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>')),
          tb('➖ Line', 'Dividing line', () => insertHTML('<hr><p></p>')), tb('📅 Date', "Today's date", () => insertHTML(esc(fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))))),
      ],
      helpers: [
        group('Listen & talk', sayButton(() => page.innerText, '🔊 Read it to me', 'tb'), micButton(t => { restoreSel(); document.execCommand('insertText', false, (page.innerText.trim() ? ' ' : '') + t); setDirty(true); updateCount(); }, { label: '🎤 Talk to type', cls: 'tb' })),
        group('Ollie', tb('🦉 Check my writing', 'Two stars and a wish', checkWriting), tb('🪄 Word helper', 'Select a word, then press me', wordHelper)),
      ],
    };
    const ribbon = h('div', { class: 'ribbon' });
    const tabBar = h('div', { class: 'rb-tabs' });
    let tab = 'home';
    const drawRibbon = () => { ribbon.innerHTML = ''; ribbon.append(...tabs[tab]); tabBar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); };
    [['home', '🏠 Home'], ['insert', '➕ Insert'], ['helpers', '🦉 Helpers']].forEach(([k, l]) => tabBar.append(h('button', { 'data-t': k, onclick: () => { tab = k; drawRibbon(); } }, l)));
    const fileBtn = h('button', { class: 'file-btn', onclick: e => fileMenu(e.currentTarget) }, '📄 File ▾');
    const saveBtn = h('button', { class: 'btn btn-sm btn-primary', onclick: () => save().then(() => toast('💾 Saved!', 'good')).catch(e => e.message !== 'Not saved' && toast(e.message, 'error')) }, '💾 Save');
    const zoomSel = h('select', { class: 'input rb-sel', style: { width: '84px' }, onchange: () => { zoom = +zoomSel.value; page.style.zoom = zoom; } }, ...[0.8, 1, 1.25, 1.5].map(z => h('option', { value: z, selected: z === 1 }, `${Math.round(z * 100)}%`)));
    drawRibbon();
    win.body.append(h('div', { class: 'app-head' }, fileBtn, tabBar, h('span', { class: 'spacer' }), status, saveBtn), ribbon,
      h('div', { class: 'writer-page-wrap' }, page),
      h('div', { class: 'statusbar' }, wc, h('span', { class: 'spacer' }), 'Zoom', zoomSel));

    function updateCount() { const n = (page.innerText.trim().match(/\S+/g) || []).length; wc.textContent = `${n} word${n === 1 ? '' : 's'}`; }
    page.addEventListener('input', () => { setDirty(true); updateCount(); });
    updateCount(); setDirty(false);
    setTimeout(() => page.focus(), 60);

    function fileMenu(anchor) {
      const r = anchor.getBoundingClientRect(), wr = win.el.getBoundingClientRect();
      const m = h('div', { class: 'menu-pop', style: { left: r.left - wr.left + 'px', top: r.bottom - wr.top + 4 + 'px' } },
        h('button', { onclick: () => ctx.openApp('writer') }, '📄 New'), h('button', { onclick: () => openPicker(ctx, 'doc') }, '📂 Open…'),
        h('button', { onclick: () => saveBtn.click() }, '💾 Save'), h('button', { onclick: () => save({ copy: true }).then(() => toast('Saved a copy', 'good')).catch(() => { }) }, '⧉ Save a copy'),
        h('hr'), h('button', { onclick: sendToParents }, '📤 Send to Mum & Dad'), h('button', { onclick: printDoc }, '🖨 Print'));
      win.el.append(m);
      setTimeout(() => document.addEventListener('mousedown', ev => { if (!m.contains(ev.target)) m.remove(); }, { once: true }), 0);
      m.addEventListener('click', () => setTimeout(() => m.remove(), 0));
    }

    async function aiPicture() {
      saveSel();
      const inp = h('input', { class: 'input', placeholder: 'e.g. a dragon reading a book in a library' });
      const out = h('div');
      const mm = modal({
        title: '🎨 Make a picture', cls: 'modal-kid', body: h('div', {}, h('p', {}, 'Describe the picture you want:'), h('div', { class: 'row' }, inp, micButton(t => { inp.value = t; })), out),
        actions: [{ label: 'Cancel' }, { label: '🎨 Make it', cls: 'btn-primary', onClick: async () => {
          if (!inp.value.trim()) { toast('Describe it first', 'warn'); return false; }
          out.innerHTML = '<p><span class="spinner"></span> Painting… (about 10–20 seconds)</p>';
          try { const { data } = await kidPicture(ctx, inp.value.trim(), { source: 'writer' }); insertHTML(`<img src="${data}" alt="${esc(inp.value.trim())}" style="max-width:100%;border-radius:12px">`); }
          catch (e) { out.innerHTML = ''; toast(e.message, 'warn', 5000); return false; }
        } }],
      });
      setTimeout(() => inp.focus(), 50);
    }

    function emojiPicker() {
      saveSel();
      const set = '😀 😂 😍 🤩 😎 🥳 😢 😡 😱 🤔 👍 👏 🙌 ❤️ ⭐ 🌟 🌈 ☀️ 🌧️ ❄️ 🌳 🌸 🍄 🐶 🐱 🦊 🐼 🦁 🦄 🐉 🦖 🐙 🐠 🦋 🚀 🛸 🏰 🏝️ ⚽ 🎨 🎵 📚 ✏️ 🍕 🍎 🎂 🍦 🎁 🏆 ✅ ❓ ❗ 💡 🔥'.split(' ');
      const m = modal({ title: 'Pick an emoji', body: h('div', { class: 'av-pick' }, ...set.map(e => h('button', { onclick: () => { m.close(); restoreSel(); document.execCommand('insertText', false, e); setDirty(true); } }, e))), actions: [] });
    }

    async function checkWriting() {
      const text = page.innerText.trim();
      if ((text.match(/\S+/g) || []).length < 5) return toast('Write a little more first! ✏️', 'warn');
      if (!(await aiReady())) return toast('The helper is not switched on yet — ask a grown-up.', 'warn');
      const out = h('div', { class: 'md' }, h('span', { class: 'spinner' }), ' Ollie is reading your writing…');
      modal({ title: '🦉 Tips for your writing', body: h('div', {}, out, h('div', { class: 'row', style: { marginTop: '10px' } }, sayButton(() => out.innerText, '🔊 Read the tips'))) });
      try {
        const fb = await complete({
          task: 'tutor', maxTokens: 500, temperature: 0.5, onToken: (_, full) => { out.innerHTML = md(full); },
          messages: [
            { role: 'system', content: `You are a kind writing coach for ${me.name}, aged ${me.age || 8} (UK). Read their writing and reply in British English with: "⭐ Two stars:" two specific things they did well, then "🌟 One wish:" ONE thing to improve, and point to where (quote a few words) — e.g. a missing capital letter or full stop, a spelling to check, a more exciting word to try. Do NOT rewrite their work or correct it for them; help them find and fix it themselves. Under 90 words.` },
            { role: 'user', content: text.slice(0, 6000) },
          ],
        });
        out.innerHTML = md(fb);
      } catch (e) { out.textContent = e.message; }
    }

    async function wordHelper() {
      restoreSel();
      let word = getSelection().toString().trim();
      if (!word) { const sel = getSelection(); sel.modify?.('move', 'backward', 'word'); sel.modify?.('extend', 'forward', 'word'); word = sel.toString().trim(); saveSel(); }
      word = word.split(/\s+/)[0]?.replace(/[^a-zA-Z'-]/g, '');
      if (!word) return toast('Click on a word first, then press 🪄', 'warn');
      const out = h('div', {}, h('span', { class: 'spinner' }), ` Looking up “${word}”…`);
      const m = modal({ title: `🪄 ${word}`, body: out });
      try {
        const w = await explainWord(word, me);
        out.innerHTML = '';
        out.append(h('p', { style: { fontSize: '1.15em' } }, `${w.emoji || ''} `, h('b', {}, w.meaning)), w.example ? h('p', { class: 'muted' }, `“${w.example}”`) : null,
          w.synonyms?.length ? h('div', {}, h('b', {}, 'Swap it for a WOW word:'), h('div', { class: 'chip-bank' }, ...w.synonyms.map(s => h('button', { class: 'chipx', onclick: () => { restoreSel(); document.execCommand('insertText', false, s); setDirty(true); m.close(); } }, s)))) : null,
          h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn btn-sm', onclick: () => say(`${w.word}. ${w.meaning}. ${w.example || ''}`) }, '🔊 Say it')));
      } catch (e) { out.textContent = e.message; }
    }

    async function sendToParents() {
      if (dirty || !doc.id) { try { await save(); } catch { return; } }
      doc.submitted = true; doc.submittedAt = Date.now(); doc.reviewed = false;
      await store.put('documents', doc);
      store.log('doc_sent', { title: doc.title });
      toast('📤 Sent to Mum & Dad!', 'good');
    }

    function printDoc() {
      const w = window.open('', '_blank');
      if (!w) return toast('Printing is blocked on this device', 'warn');
      w.document.write(`<html><head><title>${esc(doc.title || 'My writing')}</title><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;800&family=Patrick+Hand&family=Lexend&display=swap" rel="stylesheet"><style>body{font-family:Nunito,Arial,sans-serif;font-size:18px;line-height:1.6;max-width:720px;margin:40px auto}img{max-width:100%}table{border-collapse:collapse}td{border:1px solid #999;padding:6px}</style></head><body>${sanitize(page.innerHTML)}</body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
    }
  }
}
