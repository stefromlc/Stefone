// Writer — a kid-friendly word processor.
import { store } from '../store.js';
import { h, debounce, toast, sanitize, speak, textOf, modal, md, esc } from '../util.js';
import { complete, aiReady } from '../ai.js';

const FONTS = [['Nunito', 'Rounded'], ['Comic Sans MS, Chalkboard SE, cursive', 'Comic'], ['Georgia, serif', 'Book'], ['Arial, sans-serif', 'Plain'], ['Courier New, monospace', 'Typewriter']];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc) doc = { id: undefined, childId: me.id, type: 'doc', title: 'My document', content: '', createdAt: Date.now() };
  win.setTitle(doc.title);

  const page = h('div', { class: 'writer-page', contenteditable: 'true', spellcheck: 'true', lang: 'en-GB', 'data-ph': 'Start writing here… ✏️' });
  page.innerHTML = sanitize(doc.content || '');
  const title = h('input', { class: 'input', value: doc.title, style: { width: '190px', padding: '6px 10px' }, oninput: () => { doc.title = title.value || 'My document'; win.setTitle(doc.title); autosave(); } });
  const status = h('span', { class: 'muted' }, '');
  const wc = h('span');
  const exec = (cmd, val = null) => { page.focus(); document.execCommand(cmd, false, val); autosave(); updateCount(); };
  const tb = (label, title, fn) => h('button', { class: 'tb', title, onmousedown: e => e.preventDefault(), onclick: fn }, label);

  const font = h('select', { class: 'input', style: { width: '120px', padding: '5px' }, onchange: () => exec('fontName', font.value) }, ...FONTS.map(([v, l]) => h('option', { value: v }, l)));
  const size = h('select', { class: 'input', style: { width: '80px', padding: '5px' }, onchange: () => exec('fontSize', size.value) }, ...[['2', 'Small'], ['3', 'Normal'], ['4', 'Big'], ['5', 'Bigger'], ['6', 'Huge'], ['7', 'Giant']].map(([v, l]) => h('option', { value: v, selected: v === '3' }, l)));
  const color = h('input', { type: 'color', value: '#1f2440', title: 'Text colour', style: { width: '34px', height: '30px', border: 0, background: 'none' }, oninput: () => exec('foreColor', color.value) });
  const hl = h('input', { type: 'color', value: '#fff3a0', title: 'Highlight', style: { width: '34px', height: '30px', border: 0, background: 'none' }, oninput: () => exec('hiliteColor', hl.value) });

  const toolbar = h('div', { class: 'app-toolbar' },
    title, h('span', { class: 'sep' }), font, size,
    tb(h('b', {}, 'B'), 'Bold', () => exec('bold')), tb(h('i', {}, 'I'), 'Italic', () => exec('italic')), tb(h('u', {}, 'U'), 'Underline', () => exec('underline')),
    color, hl, h('span', { class: 'sep' }),
    tb('H1', 'Big heading', () => exec('formatBlock', 'H1')), tb('H2', 'Small heading', () => exec('formatBlock', 'H2')), tb('¶', 'Normal text', () => exec('formatBlock', 'P')),
    tb('•', 'Bullet list', () => exec('insertUnorderedList')), tb('1.', 'Numbered list', () => exec('insertOrderedList')),
    tb('⬅', 'Align left', () => exec('justifyLeft')), tb('↔', 'Centre', () => exec('justifyCenter')), tb('➡', 'Align right', () => exec('justifyRight')),
    h('span', { class: 'sep' }),
    tb('↶', 'Undo', () => exec('undo')), tb('↷', 'Redo', () => exec('redo')),
    tb('😀', 'Emoji', e => emojiPicker(e.currentTarget)),
    h('span', { class: 'sep' }),
    tb('🔊', 'Read my writing to me', () => speak(page.innerText)),
    tb('🦉 Check', 'Get tips on my writing', checkWriting),
    tb('📤 Send', 'Send to Mum & Dad', sendToParents),
    tb('🖨', 'Print', printDoc),
  );
  const wrap = h('div', { class: 'writer-page-wrap' }, page);
  win.body.append(toolbar, wrap, h('div', { class: 'statusbar' }, wc, h('span', { class: 'spacer' }), status));

  function updateCount() { const n = (page.innerText.trim().match(/\S+/g) || []).length; wc.textContent = `${n} word${n === 1 ? '' : 's'}`; }
  const autosave = debounce(async () => {
    doc.content = sanitize(page.innerHTML);
    if (!doc.id && !textOf(doc.content).trim()) return;
    status.textContent = 'Saving…';
    await store.put('documents', doc);
    status.textContent = '✓ Saved';
  }, 1200);
  page.addEventListener('input', () => { autosave(); updateCount(); });
  win.onClose(() => autosave.flush());
  updateCount();
  setTimeout(() => page.focus(), 60);

  function emojiPicker(anchor) {
    const set = '😀 😂 😍 🤩 😎 🥳 😢 😡 👍 👏 🙌 ❤️ ⭐ 🌈 ☀️ 🌧️ ❄️ 🌳 🌸 🐶 🐱 🦊 🐼 🦄 🐉 🦖 🚀 🛸 🏰 ⚽ 🎨 🎵 📚 ✏️ 🍕 🍎 🎂 🎁 🏆 ✅'.split(' ');
    const m = modal({ title: 'Pick an emoji', body: h('div', { class: 'av-pick' }, ...set.map(e => h('button', { onclick: () => { m.close(); page.focus(); document.execCommand('insertText', false, e); autosave(); } }, e))), actions: [] });
  }

  async function checkWriting() {
    const text = page.innerText.trim();
    if ((text.match(/\S+/g) || []).length < 5) return toast('Write a little more first! ✏️', 'warn');
    if (!(await aiReady())) return toast('The helper is not switched on yet — ask a grown-up.', 'warn');
    const out = h('div', { class: 'md' }, h('span', { class: 'spinner' }), ' Ollie is reading your writing…');
    modal({ title: '🦉 Tips for your writing', body: out });
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

  async function sendToParents() {
    autosave.flush();
    doc.submitted = true; doc.submittedAt = Date.now(); doc.content = sanitize(page.innerHTML);
    await store.put('documents', doc);
    store.log('doc_sent', { title: doc.title });
    toast('📤 Sent to Mum & Dad!', 'good');
  }

  function printDoc() {
    const w = window.open('', '_blank');
    if (!w) return toast('Printing is blocked on this device', 'warn');
    w.document.write(`<html><head><title>${esc(doc.title)}</title><style>body{font-family:Nunito,Arial,sans-serif;font-size:18px;line-height:1.6;max-width:720px;margin:40px auto}</style></head><body>${sanitize(page.innerHTML)}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }
}
