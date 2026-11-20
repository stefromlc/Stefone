// Spelling lists for the kids' Practice app.
import { store } from '../store.js';
import { h, toast, modal, confirmDlg, uid, timeAgo } from '../util.js';
import { generateSpellingList, aiReady } from '../ai.js';
import { header, state, kidById, rerender } from './shell.js';

export async function render(main) {
  header(main, '🔤 Spelling lists', { actions: [h('button', { class: 'btn', onclick: () => edit({ title: '', words: [], childIds: [] }) }, '+ New list'), h('button', { class: 'btn btn-ai', onclick: aiList }, '✨ Generate with AI')] });
  main.append(h('p', { class: 'muted' }, 'Lists appear in the kids\' Practice app. They hear each word (and a sentence) read aloud and type it. Mistakes feed the progress page. The Year 3/4 statutory word list is built in.'));
  const [lists, prac] = await Promise.all([store.list('spelling_lists'), store.list('practice')]);
  const grid = h('div', { class: 'grid3' });
  if (!lists.length) main.append(h('div', { class: 'card empty' }, h('span', { class: 'big' }, '🔤'), 'No lists yet.'));
  lists.sort((a, b) => b.createdAt - a.createdAt).forEach(l => {
    const runs = prac.filter(p => p.kind === 'spelling' && p.mode === l.title);
    grid.append(h('div', { class: 'card' }, h('h3', {}, l.title), h('p', { class: 'small muted' }, `${l.words.length} words · ${l.childIds?.length ? l.childIds.map(id => kidById(id)?.name).join(' & ') : 'Everyone'}`),
      h('p', { class: 'small' }, l.words.slice(0, 12).map(w => w.word).join(', '), l.words.length > 12 ? '…' : ''),
      runs.length ? h('p', { class: 'small' }, `Practised ${runs.length}× · best ${Math.max(...runs.map(r => r.correct))}/${l.words.length} · ${timeAgo(Math.max(...runs.map(r => r.ts)))}`) : h('p', { class: 'small muted' }, 'Not practised yet'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: () => edit(l) }, '✏️ Edit'), h('button', { class: 'btn btn-sm', onclick: async () => { if (await confirmDlg(`Delete “${l.title}”?`, { danger: true, ok: 'Delete' })) { await store.remove('spelling_lists', l.id); rerender(); } } }, '🗑'))));
  });
  main.append(grid);
}

function edit(list) {
  const title = h('input', { class: 'input', value: list.title, placeholder: 'e.g. Week 3 — words ending in -tion' });
  const words = h('textarea', { class: 'input', rows: 12, placeholder: 'One word per line. Optionally add a sentence after a | e.g.\nstation | We waited at the train station.' }, list.words.map(w => w.sentence ? `${w.word} | ${w.sentence}` : w.word).join('\n'));
  const chosen = new Set(list.childIds || []);
  const checks = state.kids.map(k => h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '12px' } }, h('input', { type: 'checkbox', checked: chosen.has(k.id), onchange: e => (e.target.checked ? chosen.add(k.id) : chosen.delete(k.id)) }), `${k.avatar} ${k.name}`));
  modal({
    title: list.id ? 'Edit spelling list' : 'New spelling list',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Title'), title), h('label', { class: 'field' }, h('span', {}, 'Words'), words), h('div', { class: 'field' }, h('span', {}, 'For (none ticked = everyone)'), h('div', {}, ...checks))),
    actions: [{ label: 'Cancel' }, {
      label: 'Save', cls: 'btn-primary', onClick: async () => {
        const ws = words.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [w, ...s] = l.split('|'); return { word: w.trim(), sentence: s.join('|').trim() }; }).filter(w => w.word);
        if (!title.value.trim() || !ws.length) { toast('Add a title and at least one word', 'warn'); return false; }
        await store.put('spelling_lists', { ...list, id: list.id || uid('sp_'), title: title.value.trim(), words: ws, childIds: [...chosen] });
        toast('Saved', 'good'); rerender();
      },
    }],
  });
}

async function aiList() {
  if (!(await aiReady())) return toast('Connect AI first (Settings → AI)', 'warn');
  const focus = h('input', { class: 'input', placeholder: 'e.g. prefixes un- and dis-, homophones, words with "ou", Year 3 science words' });
  const count = h('select', { class: 'input' }, ...[8, 10, 12, 15].map(n => h('option', { value: n, selected: n === 10 }, n)));
  const kidSel = h('select', { class: 'input' }, ...state.kids.map(k => h('option', { value: k.id }, `${k.avatar} ${k.name}`)));
  modal({
    title: '✨ Generate a spelling list',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Focus'), focus), h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Number of words'), count), h('label', { class: 'field' }, h('span', {}, 'Pitched for'), kidSel))),
    actions: [{ label: 'Cancel' }, {
      label: '✨ Generate', cls: 'btn-ai', onClick: async ({ content }) => {
        if (!focus.value.trim()) { toast('Enter a focus', 'warn'); return false; }
        content.append(h('p', {}, h('span', { class: 'spinner' }), ' Thinking up words…'));
        const r = await generateSpellingList({ child: kidById(kidSel.value), focus: focus.value.trim(), count: +count.value });
        setTimeout(() => edit({ title: r.title || focus.value, words: (r.words || []).map(w => (typeof w === 'string' ? { word: w } : w)), childIds: [] }), 50);
      },
    }],
  });
}
