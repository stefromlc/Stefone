// Paint — brush, pencil, eraser, fill, line, rectangle, circle, text, stickers, pictures & AI colouring pages.
import { store } from '../store.js';
import { h, toast, modal } from '../util.js';
import { fileToDataUrl, micButton, loadImage } from '../media.js';
import { nameIt, openPicker, kidPicture } from './doclib.js';

const PALETTE = ['#000000', '#ffffff', '#868e96', '#e03131', '#f76707', '#fcc419', '#37b24d', '#1c7ed6', '#7048e8', '#d6336c', '#8d5524', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#e5dbff'];
const STAMPS = ['⭐', '❤️', '🌸', '🦋', '🐶', '🐱', '🦄', '🌈', '☀️', '🌳', '🚀', '🏠', '🐉', '🍦', '🎈', '👑'];
const TOOLS = [['brush', '🖌️', 'Brush'], ['pencil', '✏️', 'Pencil'], ['eraser', '🧽', 'Rubber'], ['fill', '🪣', 'Fill'], ['line', '📏', 'Line'], ['rect', '⬛', 'Rectangle'], ['circle', '⚪', 'Circle'], ['text', '🔤', 'Text'], ['stamp', '⭐', 'Sticker']];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc) doc = { childId: me.id, type: 'drawing', title: '', content: '' };
  win.setTitle(doc.title || 'Untitled picture');
  const W = 1100, H = 700;
  const cv = h('canvas', { width: W, height: H });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  let tool = 'brush', color = '#1c7ed6', size = 10, stamp = '⭐', dirty = false, fillShapes = false;
  const undo = [], redo = [];
  const status = h('span', { class: 'save-status' });
  const setDirty = d => { dirty = d; win.markDirty(d); status.textContent = d ? '● Not saved' : doc.id ? '✓ Saved' : ''; status.classList.toggle('unsaved', d); };
  const pushUndo = () => { undo.push(g.getImageData(0, 0, W, H)); if (undo.length > 30) undo.shift(); redo.length = 0; };
  const drawImageFit = (src, cover = false) => new Promise(res => { const img = new Image(); img.onload = () => { const k = cover ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height); const w = img.width * k, hh = img.height * k; g.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh); res(); }; img.src = src; });
  if (doc.content) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, W, H); img.src = doc.content; }
  if (args.imageId) { const src = await loadImage(args.imageId); if (src) { await drawImageFit(src); setDirty(true); } }

  async function save({ copy = false } = {}) {
    if (!doc.title || copy) { const n = await nameIt(copy ? doc.title + ' (copy)' : '', 'picture'); if (!n) throw new Error('Not saved'); if (copy) doc = { ...doc, id: undefined, createdAt: undefined }; doc.title = n; win.setTitle(n); }
    doc.content = cv.toDataURL('image/jpeg', 0.85);
    await store.put('documents', doc); setDirty(false);
  }
  win.guard({ isDirty: () => dirty, save: () => save(), name: () => doc.title || 'your picture' });
  const doSave = () => save().then(() => toast('💾 Saved!', 'good')).catch(e => e.message !== 'Not saved' && toast(e.message, 'error'));

  const toolsEl = h('div', { class: 'paint-tools' });
  TOOLS.forEach(([id, ic, label]) => toolsEl.append(h('button', { class: `pt ${tool === id ? 'on' : ''}`, title: label, 'data-t': id, onclick: () => { tool = id; toolsEl.querySelectorAll('.pt').forEach(x => x.classList.toggle('on', x.dataset.t === id)); stampRow.classList.toggle('hidden', id !== 'stamp'); } }, h('span', {}, ic), h('small', {}, label))));
  const sw = h('div', { class: 'paint-pal' });
  const custom = h('input', { type: 'color', value: color, title: 'Any colour', oninput: () => { color = custom.value; sw.querySelectorAll('.swatch').forEach(x => x.classList.remove('on')); } });
  PALETTE.forEach(c => sw.append(h('button', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, onclick: e => { color = c; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } })));
  sw.append(custom);
  const sizeSel = h('input', { type: 'range', min: 2, max: 80, value: size, oninput: () => { size = +sizeSel.value; sizeDot.style.width = sizeDot.style.height = Math.min(40, size) + 'px'; } });
  const sizeDot = h('span', { class: 'size-dot', style: { width: size + 'px', height: size + 'px' } });
  const fillChk = h('label', { class: 'check small' }, h('input', { type: 'checkbox', onchange: e => { fillShapes = e.target.checked; } }), 'Filled shapes');
  const stampRow = h('div', { class: 'stamp-row hidden' }, ...STAMPS.map(s => h('button', { class: s === stamp ? 'on' : '', onclick: e => { stamp = s; stampRow.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, s)));
  const tb = (label, title, fn) => h('button', { class: 'tb', title, onclick: fn }, label);

  win.body.append(
    h('div', { class: 'app-toolbar' },
      tb('📄 New', 'New picture', () => ctx.openApp('paint')), tb('📂 Open', 'Open a picture', () => openPicker(ctx, 'drawing')),
      h('button', { class: 'btn btn-sm btn-primary', onclick: doSave }, '💾 Save'), h('span', { class: 'sep' }),
      tb('↶', 'Undo', () => { if (undo.length) { redo.push(g.getImageData(0, 0, W, H)); g.putImageData(undo.pop(), 0, 0); setDirty(true); } }),
      tb('↷', 'Redo', () => { if (redo.length) { undo.push(g.getImageData(0, 0, W, H)); g.putImageData(redo.pop(), 0, 0); setDirty(true); } }),
      tb('🗑', 'Clear', () => { pushUndo(); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); setDirty(true); }),
      h('span', { class: 'sep' }),
      h('label', { class: 'tb', title: 'Add a photo or picture' }, '🖼️ Add picture', h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; pushUndo(); await drawImageFit(await fileToDataUrl(f, 1400)); setDirty(true); e.target.value = ''; } })),
      tb('🎨 Colouring page', 'Ask the AI for a colouring page', colouringPage),
      tb('📤 Send', 'Send to Mum & Dad', async () => { try { await save(); } catch { return; } doc.submitted = true; doc.submittedAt = Date.now(); doc.reviewed = false; await store.put('documents', doc); store.log('doc_sent', { title: doc.title }); toast('📤 Sent!', 'good'); }),
      tb('🖼 Wallpaper', 'Use as my desktop wallpaper', async () => { const { saveImage } = await import('../media.js'); const id = await saveImage(cv.toDataURL('image/jpeg', 0.85), { kind: 'wallpaper', childId: me.id }); ctx.setWallpaper(null, id); toast('🖼 New wallpaper!', 'good'); }),
      h('span', { class: 'spacer' }), status),
    h('div', { class: 'paint-main' },
      h('div', { class: 'paint-side' }, toolsEl, h('div', { class: 'paint-size' }, sizeDot, sizeSel), fillChk),
      h('div', { class: 'paint-area' }, cv)),
    h('div', { class: 'paint-bottom' }, sw, stampRow));

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  let drawing = false, last = null, start = null, snap = null;
  cv.addEventListener('pointerdown', async e => {
    cv.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (tool === 'text') {
      const txt = await textPrompt(); if (!txt) return;
      pushUndo(); g.fillStyle = color; g.font = `800 ${size * 2 + 14}px Nunito, sans-serif`; g.textBaseline = 'middle'; g.fillText(txt, p.x, p.y); setDirty(true); return;
    }
    pushUndo(); setDirty(true);
    if (tool === 'fill') return flood(Math.round(p.x), Math.round(p.y), color);
    if (tool === 'stamp') { g.font = `${size * 4 + 24}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(stamp, p.x, p.y); g.textAlign = 'start'; return; }
    drawing = true; last = p; start = p; snap = ['line', 'rect', 'circle'].includes(tool) ? g.getImageData(0, 0, W, H) : null;
    if (!snap) dot(p);
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    if (snap) { g.putImageData(snap, 0, 0); shape(start, p); return; }
    stroke(last, p); last = p;
  });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const w = () => (tool === 'pencil' ? Math.max(2, size / 4) : size);
  function style() { g.strokeStyle = g.fillStyle = tool === 'eraser' ? '#fff' : color; g.lineWidth = w(); g.lineCap = g.lineJoin = 'round'; }
  function dot(p) { style(); g.beginPath(); g.arc(p.x, p.y, w() / 2, 0, Math.PI * 2); g.fill(); }
  function stroke(a, b) { style(); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  function shape(a, b) {
    style(); g.beginPath();
    if (tool === 'line') { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); return; }
    if (tool === 'rect') g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    fillShapes ? g.fill() : g.stroke();
  }
  function textPrompt() {
    return new Promise(res => {
      const inp = h('input', { class: 'input big-input', placeholder: 'Type your words' });
      let done = false;
      const m = modal({ title: '🔤 Add words', cls: 'modal-kid', body: inp, actions: [{ label: 'Cancel' }, { label: 'Add', cls: 'btn-primary', onClick: () => { done = true; res(inp.value.trim()); } }], onClose: () => { if (!done) res(''); } });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { done = true; res(inp.value.trim()); m.close(); } });
    });
  }
  function flood(x, y, hex) {
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const idx = (x, y) => (y * W + x) * 4;
    const t = idx(x, y), tr = d[t], tg = d[t + 1], tb2 = d[t + 2];
    const [nr, ng, nb] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tb2 - nb) < 10) return;
    const match = i => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb2) < 90;
    const stack = [[x, y]];
    while (stack.length) {
      let [cx, cy] = stack.pop();
      while (cy >= 0 && match(idx(cx, cy))) cy--;
      cy++; let l = false, r = false;
      while (cy < H && match(idx(cx, cy))) {
        const i = idx(cx, cy); d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = 255;
        if (cx > 0) { if (match(idx(cx - 1, cy))) { if (!l) { stack.push([cx - 1, cy]); l = true; } } else l = false; }
        if (cx < W - 1) { if (match(idx(cx + 1, cy))) { if (!r) { stack.push([cx + 1, cy]); r = true; } } else r = false; }
        cy++;
      }
    }
    g.putImageData(img, 0, 0);
  }
  async function colouringPage() {
    const inp = h('input', { class: 'input', placeholder: 'e.g. a castle with a dragon' });
    const out = h('div');
    modal({
      title: '🎨 Make a colouring page', cls: 'modal-kid', body: h('div', {}, h('p', {}, 'What should your colouring page show?'), h('div', { class: 'row' }, inp, micButton(t => { inp.value = t; })), out),
      actions: [{ label: 'Cancel' }, { label: '🎨 Make it', cls: 'btn-primary', onClick: async () => {
        if (!inp.value.trim()) { toast('Tell me what to draw', 'warn'); return false; }
        out.innerHTML = '<p><span class="spinner"></span> Drawing the outlines…</p>';
        try {
          const { data } = await kidPicture(ctx, `black-and-white colouring-book page: ${inp.value.trim()}. Thick clean black outlines on pure white, no shading, no grey, no colour, large simple shapes for a child to colour in`, { aspect: '16:9', source: 'paint', label: `colouring page: ${inp.value.trim()}` });
          pushUndo(); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); await drawImageFit(data); setDirty(true);
          toast('Now grab the 🪣 fill tool and colour it in!', 'good', 4500);
          tool = 'fill'; toolsEl.querySelectorAll('.pt').forEach(x => x.classList.toggle('on', x.dataset.t === 'fill'));
        } catch (e) { out.innerHTML = ''; toast(e.message, 'warn', 5000); return false; }
      } }],
    });
  }
  setDirty(!!args.imageId);
}
