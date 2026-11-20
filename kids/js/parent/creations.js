// Creations — everything the kids make: AI pictures (with prompts), story books, journals & moods, reading, words.
import { store } from '../store.js';
import { h, timeAgo, fmtDate, modal, pct, sanitize, addDays, today } from '../util.js';
import { header, state, kidById } from './shell.js';
import { storedImg, say } from '../media.js';

export async function render(main) {
  header(main, '🎨 Creations & wellbeing', { kidSwitch: true, all: true });
  const ids = state.kidId === 'all' ? state.kids.map(k => k.id) : [state.kidId];
  const all = async c => (await Promise.all(ids.map(id => store.list(c, { childId: id }).catch(() => [])))).flat();
  const [imgs, docs, journal, reading, words] = await Promise.all([all('images'), all('documents'), all('journal'), all('reading'), all('words')]);
  const kn = id => { const k = kidById(id); return k ? `${k.avatar} ${k.name}` : ''; };

  // moods
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const moodCard = h('div', { class: 'card' }, h('h3', {}, '💛 Moods (last 2 weeks)'));
  ids.forEach(id => moodCard.append(h('div', { class: 'row', style: { margin: '6px 0' } }, h('b', { style: { width: '110px' } }, kn(id)),
    ...days.map(d => { const j = journal.find(x => x.childId === id && x.date === d); return h('span', { class: 'mood-chip', title: `${fmtDate(d)}${j?.moodLabel ? ' · ' + j.moodLabel : ''}` }, j?.mood || '·'); }))));
  const worried = journal.filter(j => ['😟', '😢', '😡'].includes(j.mood) && j.date >= addDays(today(), -6));
  if (worried.length) moodCard.append(h('div', { class: 'alert', style: { marginTop: '8px' } }, '💛', h('div', {}, `${worried.length} not-so-happy check-in${worried.length > 1 ? 's' : ''} this week: `, worried.map(j => `${kn(j.childId)} ${j.mood} ${fmtDate(j.date)}`).join(', '), '. It might be worth a chat.')));
  main.append(moodCard);

  // pictures
  const pics = imgs.filter(i => i.kind === 'kid').sort((a, b) => b.ts - a.ts);
  main.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, `🖼️ AI pictures (${pics.length})`), h('p', { class: 'small muted' }, 'Every picture the kids asked the AI to make, with exactly what they typed.'),
    pics.length ? h('div', { class: 'gallery' }, ...pics.slice(0, 60).map(p => h('div', { class: 'creation' }, storedImg(p.id), h('div', { class: 'small' }, h('b', {}, kn(p.childId)), ' · ', timeAgo(p.ts)), h('div', { class: 'small muted' }, `“${(p.prompt || '').replace(/\. Style:.*$/, '').slice(0, 120)}”`), h('div', { class: 'small muted' }, p.source || '')))) : h('p', { class: 'muted' }, 'None yet.')));

  // stories & documents
  const books = docs.filter(d => d.type === 'story').sort((a, b) => b.updatedAt - a.updatedAt);
  const other = docs.filter(d => ['doc', 'drawing', 'sheet', 'code', 'song'].includes(d.type)).sort((a, b) => b.updatedAt - a.updatedAt);
  main.append(h('div', { class: 'grid2', style: { marginTop: '14px' } },
    h('div', { class: 'card' }, h('h3', {}, `📚 Story books (${books.length})`),
      ...(books.length ? books.map(b => h('div', { class: 'feed-item', style: { cursor: 'pointer' }, onclick: () => readBook(b) }, b.coverImageId ? storedImg(b.coverImageId, { class: 'lib-thumb' }) : h('span', {}, '📚'), h('span', { style: { flex: 1 } }, h('b', {}, b.title), h('div', { class: 'small muted' }, `${kn(b.childId)} · ${(b.pages || []).length} pages · ${timeAgo(b.updatedAt)}`)), h('span', { class: 'btn btn-sm' }, '📖 Read'))) : [h('p', { class: 'muted' }, 'None yet.')])),
    h('div', { class: 'card' }, h('h3', {}, `🗂 Other work (${other.length})`),
      ...(other.length ? other.slice(0, 25).map(d => h('div', { class: 'feed-item', style: { cursor: 'pointer' }, onclick: () => viewDoc(d) }, h('span', {}, { doc: '📝', drawing: '🖼️', sheet: '📊', code: '🐢', song: '🎵' }[d.type]), h('span', { style: { flex: 1 } }, h('b', {}, d.title || 'Untitled'), h('div', { class: 'small muted' }, `${kn(d.childId)} · ${timeAgo(d.updatedAt)}${d.submitted ? ' · 📤 sent to you' : ''}`)))) : [h('p', { class: 'muted' }, 'None yet.')]))));

  // reading & words & journal
  main.append(h('div', { class: 'grid2', style: { marginTop: '14px' } },
    h('div', { class: 'card' }, h('h3', {}, '📖 Reading Buddy'),
      ...(reading.length ? reading.sort((a, b) => b.ts - a.ts).slice(0, 15).map(r => h('div', { class: 'feed-item' }, h('span', {}, kn(r.childId)), h('span', { style: { flex: 1 } }, h('b', {}, r.title), h('div', { class: 'small muted' }, `${r.accuracy != null ? `read aloud ${pct(r.accuracy)} accurate, ${r.wpm} wpm · ` : ''}${r.quizScore != null ? `questions ${pct(r.quizScore)}` : ''}${r.missed?.length ? ` · tricky: ${r.missed.slice(0, 6).join(', ')}` : ''}`)), h('span', { class: 'small muted' }, timeAgo(r.ts)))) : [h('p', { class: 'muted' }, 'No reading sessions yet.')])),
    h('div', { class: 'card' }, h('h3', {}, '📔 Journal'),
      ...(journal.filter(j => j.text || j.grateful || j.learned).length ? journal.filter(j => j.text || j.grateful || j.learned).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(j => h('div', { class: 'feed-item' }, h('span', { class: 'mood-chip' }, j.mood || '📔'), h('span', { style: { flex: 1 } }, h('b', {}, `${kn(j.childId)} · ${fmtDate(j.date)}`), j.grateful ? h('div', { class: 'small' }, `🙏 ${j.grateful}`) : null, j.learned ? h('div', { class: 'small' }, `💡 ${j.learned}`) : null, j.text ? h('div', { class: 'small muted' }, j.text.slice(0, 220)) : null))) : [h('p', { class: 'muted' }, 'No journal entries yet.')]),
      words.length ? h('div', { style: { marginTop: '10px' } }, h('b', {}, `🪄 Words looked up (${words.length}): `), h('span', { class: 'small' }, words.sort((a, b) => b.ts - a.ts).slice(0, 40).map(w => w.word).join(', '))) : null)));

  function readBook(b) {
    let i = 0;
    const view = h('div', { class: 'book-view' });
    const draw = () => { const p = b.pages[i]; view.innerHTML = ''; view.append(h('div', { class: 'book-page' }, p.imageId ? storedImg(p.imageId) : null, h('p', {}, p.text), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', disabled: !i, onclick: () => { i--; draw(); } }, '⬅'), h('span', {}, `${i + 1}/${b.pages.length}`), h('button', { class: 'btn', onclick: () => say(p.text) }, '🔊'), h('button', { class: 'btn', disabled: i >= b.pages.length - 1, onclick: () => { i++; draw(); } }, '➡')))); };
    modal({ title: `📚 ${b.title} — by ${kidById(b.childId)?.name || ''}`, wide: true, body: view });
    draw();
  }
  function viewDoc(d) {
    const body = h('div');
    if (d.type === 'doc') body.innerHTML = `<div style="font-size:17px;line-height:1.6">${sanitize(d.content || '')}</div>`;
    else if (d.type === 'drawing') body.append(h('img', { src: d.content, style: { maxWidth: '100%', borderRadius: '10px' } }));
    else if (d.type === 'code') body.append(h('pre', { style: { background: '#1f2440', color: '#b2f2bb', padding: '12px', borderRadius: '10px' } }, d.content));
    else body.append(h('p', { class: 'muted' }, 'Open this from the child\'s desktop to see it fully.'));
    modal({ title: d.title || 'Untitled', wide: true, body });
  }
}
