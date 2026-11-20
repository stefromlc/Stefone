// Paint — brush, eraser, fill bucket, stamps, undo; saves drawings to My Files.
import { store } from '../store.js';
import { h, toast } from '../util.js';

const PALETTE = ['#000000', '#ffffff', '#868e96', '#e03131', '#f76707', '#fcc419', '#37b24d', '#1c7ed6', '#7048e8', '#d6336c', '#8d5524', '#ffc9c9', '#b2f2bb', '#a5d8ff'];
const STAMPS = ['⭐', '❤️', '🌸', '🦋', '🐶', '🐱', '🦄', '🌈', '☀️', '🌳', '🚀', '🏠'];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc) doc = { childId: me.id, type: 'drawing', title: 'My picture', content: '' };
  win.setTitle(doc.title);
  const W = 1000, H = 640;
  const cv = h('canvas', { width: W, height: H });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  if (doc.content) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0); img.src = doc.content; }
  let tool = 'brush', color = '#1c7ed6', size = 8, stamp = '⭐', dirty = false;
  const undo = [];
  const pushUndo = () => { undo.push(g.getImageData(0, 0, W, H)); if (undo.length > 25) undo.shift(); };

  const tools = h('div', { class: 'row', style: { gap: '2px' } });
  const tb = (id, label, title) => { const b = h('button', { class: `tb ${tool === id ? 'on' : ''}`, title, onclick: () => { tool = id; tools.querySelectorAll('.tb').forEach(x => x.classList.toggle('on', x === b)); } }, label); tools.append(b); };
  tb('brush', '🖌️', 'Brush'); tb('eraser', '🧽', 'Rubber'); tb('fill', '🪣', 'Fill'); tb('stamp', '⭐', 'Stamp'); tb('line', '📏', 'Line');
  const sw = h('div', { class: 'row', style: { gap: '4px' } });
  PALETTE.forEach(c => sw.append(h('button', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, onclick: e => { color = c; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } })));
  const sizeSel = h('input', { type: 'range', min: 2, max: 60, value: size, oninput: () => { size = +sizeSel.value; }, style: { width: '90px' } });
  const stampSel = h('select', { class: 'input', style: { width: '64px', padding: '4px' }, onchange: () => { stamp = stampSel.value; } }, ...STAMPS.map(s => h('option', {}, s)));
  const title = h('input', { class: 'input', value: doc.title, style: { width: '150px', padding: '6px 10px' }, oninput: () => { doc.title = title.value || 'My picture'; win.setTitle(doc.title); } });
  win.body.append(h('div', { class: 'app-toolbar' }, title, h('span', { class: 'sep' }), tools, h('span', { class: 'sep' }), sw, h('span', { class: 'sep' }), '✏️', sizeSel, stampSel,
    h('button', { class: 'tb', title: 'Undo', onclick: () => { if (undo.length) { g.putImageData(undo.pop(), 0, 0); dirty = true; } } }, '↶'),
    h('button', { class: 'tb', title: 'Clear', onclick: () => { pushUndo(); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); dirty = true; } }, '🗑'),
    h('button', { class: 'tb', title: 'Save', onclick: () => save(true) }, '💾 Save'),
    h('button', { class: 'tb', title: 'Send to Mum & Dad', onclick: async () => { doc.submitted = true; doc.submittedAt = Date.now(); await save(true); store.log('doc_sent', { title: doc.title }); toast('📤 Sent!', 'good'); } }, '📤')),
    h('div', { class: 'paint-area' }, cv));

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  let drawing = false, last = null, start = null, snap = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const p = pos(e); pushUndo(); dirty = true;
    if (tool === 'fill') return flood(Math.round(p.x), Math.round(p.y), color);
    if (tool === 'stamp') { g.font = `${size * 4 + 20}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(stamp, p.x, p.y); return; }
    drawing = true; last = p; start = p; snap = tool === 'line' ? g.getImageData(0, 0, W, H) : null;
    dot(p);
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    if (tool === 'line') { g.putImageData(snap, 0, 0); stroke(start, p); return; }
    stroke(last, p); last = p;
  });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  function style() { g.strokeStyle = g.fillStyle = tool === 'eraser' ? '#fff' : color; g.lineWidth = size; g.lineCap = g.lineJoin = 'round'; }
  function dot(p) { if (tool === 'line') return; style(); g.beginPath(); g.arc(p.x, p.y, size / 2, 0, Math.PI * 2); g.fill(); }
  function stroke(a, b) { style(); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  function flood(x, y, hex) {
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const idx = (x, y) => (y * W + x) * 4;
    const t = idx(x, y), tr = d[t], tg = d[t + 1], tb2 = d[t + 2];
    const [nr, ng, nb] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tb2 - nb) < 10) return;
    const match = i => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb2) < 60;
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
  async function save(announce) {
    doc.content = cv.toDataURL('image/jpeg', 0.85);
    await store.put('documents', doc); dirty = false;
    if (announce) toast('💾 Saved to My Files', 'good');
  }
  win.onClose(async () => { if (dirty) await save(false); });
}
