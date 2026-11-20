// Settings — administrator (Dad) only.
import { store, LS, DEFAULT_SETTINGS } from '../store.js';
import { h, esc, toast, modal, confirmDlg, download, readFileText, promptDlg } from '../util.js';
import { complete } from '../ai.js';
import { header, state, rerender, go } from './shell.js';
import { profileForm } from '../profileform.js';
import CONFIG from '../config.js';

const TABS = [['ai', '✨ AI & models'], ['family', '👨‍👩‍👧‍👦 Family'], ['safety', '🛡️ Helper & safety'], ['schedule', '⏰ School hours'], ['data', '💾 Data & backup']];
const COLLECTIONS = ['settings', 'lessons', 'assignments', 'evidence', 'practice', 'timelog', 'activity', 'chats', 'documents', 'notes', 'prefs', 'spelling_lists', 'analyses'];
const TASKS = [
  ['lessons', 'Lesson & plan generation', 'Writes full lessons and weekly plans. Use a strong model.'],
  ['analysis', 'Gap analysis', 'Analyses mistakes to find misconceptions. Use a strong model.'],
  ['tutor', 'Kids\' helper chat', 'Talks with the children. Fast & cheap is fine; must follow instructions well.'],
  ['marking', 'Marking answers', 'Marks short answers and writing. Fast & cheap is fine.'],
  ['vision', 'Looking at pictures (vision)', 'Marks drawings, Photo Detective, “show Ollie my work”. Must accept images.'],
];
const MEDIA = [
  ['image', 'Picture generation', 'Lesson illustrations, Picture Maker, Story Studio, colouring pages.', 'image'],
  ['tts', 'Voice (text-to-speech)', 'Reads lessons, stories and Ollie aloud in a natural voice.', 'speech'],
  ['stt', 'Listening (speech-to-text)', 'Lets the kids talk instead of type, and checks reading aloud.', 'transcription'],
];

export async function render(main, st, arg) {
  if (!store.isAdmin) { main.append(h('div', { class: 'card' }, 'Only the administrator can open Settings.')); return; }
  const tab = TABS.some(t => t[0] === arg) ? arg : 'ai';
  header(main, '⚙️ Settings');
  const tabs = h('div', { class: 'tabs', style: { marginBottom: '14px', padding: 0 } });
  TABS.forEach(([id, l]) => tabs.append(h('button', { class: tab === id ? 'on' : '', onclick: () => go('settings', id) }, l)));
  main.append(tabs);
  const s = structuredClone(await store.settings(true));
  const body = h('div');
  main.append(body);
  const saveBar = (fn) => h('div', { class: 'row', style: { marginTop: '14px' } }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary btn-lg', onclick: async () => { try { await fn(); await store.saveSettings(s); state.settings = await store.settings(); toast('Settings saved', 'good'); } catch (e) { toast(e.message, 'error'); } } }, '💾 Save settings'));
  await ({ ai, family, safety, schedule, data })[tab](body, s, saveBar);
}

// ─────────── AI ───────────
async function ai(body, s, saveBar) {
  const key = h('input', { class: 'input', type: 'password', value: s.apiKey, placeholder: 'sk-or-v1-…', autocomplete: 'off' });
  const res = h('span', { class: 'small' });
  const dl = h('datalist', { id: 'or-models' });
  const info = h('div', { class: 'small muted' }, 'Loading model list from OpenRouter…');
  let models = [];
  const inputs = {}, mediaInputs = {};
  const testOut = h('div', { class: 'small' });
  const voiceSel = h('input', { class: 'input', list: 'or-voices', value: s.voice?.ttsVoice || '' });
  const voiceDl = h('datalist', { id: 'or-voices' });
  const aiVoice = h('input', { type: 'checkbox', checked: s.voice?.aiVoice !== false });
  const aiStt = h('input', { type: 'checkbox', checked: s.voice?.aiTranscribe !== false });
  const lessonImgs = h('input', { type: 'checkbox', checked: s.media?.lessonImages !== false });
  const lessonImgCount = h('input', { class: 'input', type: 'number', min: 1, max: 6, value: s.media?.lessonImageCount ?? 3, style: { width: '64px', display: 'inline-block', padding: '3px 6px' } });
  const kidPics = h('input', { type: 'checkbox', checked: s.media?.kidPictures !== false });
  const kidPicLimit = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: s.media?.kidPicturesPerDay ?? 15, style: { width: '64px', display: 'inline-block', padding: '3px 6px' } });
  const sounds = h('input', { type: 'checkbox', checked: s.sounds !== false });
  const loadVoices = async () => {
    voiceDl.innerHTML = '';
    const id = (mediaInputs.tts?.value || s.models.tts || '').trim(); if (!id) return;
    try {
      const j = await (await fetch(`https://openrouter.ai/api/v1/audio/speech/models/${id}`)).json();
      const m = j.data || j;
      const voice = m.supported_parameters?.voice || m.parameters?.voice || m.voice || {};
      const list = voice.enum || voice.values || (Array.isArray(voice) ? voice : []);
      list.forEach(v => voiceDl.append(h('option', { value: typeof v === 'string' ? v : v.id || v.name })));
    } catch { }
  };
  voiceSel.after?.(voiceDl);
  const applyMedia = () => {
    for (const [id, inp] of Object.entries(mediaInputs)) s.models[id] = inp.value.trim();
    s.voice = { ...s.voice, ttsVoice: voiceSel.value.trim(), aiVoice: aiVoice.checked, aiTranscribe: aiStt.checked };
    s.media = { ...s.media, lessonImages: lessonImgs.checked, lessonImageCount: +lessonImgCount.value || 3, kidPictures: kidPics.checked, kidPicturesPerDay: +kidPicLimit.value || 0 };
    s.sounds = sounds.checked;
  };
  async function testVoice() {
    applyMedia(); const prev = store._settings; store._settings = { ...prev, ...s, apiKey: key.value.trim() || prev.apiKey };
    testOut.innerHTML = '<span class="spinner"></span>';
    try { const { say } = await import('../media.js'); await say('Hello! I am Ollie the Owl. Shall we learn something amazing today?', { onStart: st => { if (st === 'playing') testOut.textContent = '🔊 Playing…'; } }); testOut.textContent = '✓ Done (if you heard a robotic voice, the AI voice failed — check the model and voice id).'; }
    catch (e) { testOut.textContent = e.message; }
    store._settings = prev;
  }
  async function testPicture() {
    applyMedia(); const prev = store._settings; store._settings = { ...prev, ...s, apiKey: key.value.trim() || prev.apiKey };
    testOut.innerHTML = '<span class="spinner"></span> Painting…';
    try { const { generateImage } = await import('../media.js'); const d = await generateImage('a friendly owl teacher reading a book to woodland animals'); testOut.innerHTML = ''; testOut.append(h('img', { src: d, style: { maxWidth: '200px', borderRadius: '10px', display: 'block' } })); }
    catch (e) { testOut.textContent = e.message; }
    store._settings = prev;
  }
  const priceOf = id => { const m = models.find(x => x.id === id); if (!m) return ''; const p = m.pricing || {}; const per = v => (parseFloat(v) * 1e6).toFixed(2); return `≈ $${per(p.prompt)} in / $${per(p.completion)} out per 1M tokens · ${m.context_length?.toLocaleString?.() || '?'} context`; };
  body.append(h('div', { class: 'card' },
    h('h3', {}, '🔑 OpenRouter API key'),
    h('p', { class: 'small muted' }, 'Get one at ', h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener' }, 'openrouter.ai/keys'), '. Strongly recommended: set a monthly credit limit on the key. The key is stored ', store.mode === 'cloud' ? 'in your Supabase database (readable by signed-in family members, because the kids\' helper needs it).' : 'in this browser only.'),
    h('div', { class: 'row' }, key, h('button', { class: 'btn', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; } }, '👁'), h('button', { class: 'btn', onclick: test }, 'Test')), res),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '🧠 Models'), h('p', { class: 'small muted' }, 'Pick any model on OpenRouter for each job. Start typing to search (e.g. “claude”, “gemini”, “gpt”, “llama”).'), dl,
      ...TASKS.map(([id, label, hint]) => {
        const inp = h('input', { class: 'input', list: 'or-models', value: s.models[id] || DEFAULT_SETTINGS.models[id] });
        const p = h('div', { class: 'small muted' });
        inp.oninput = () => { p.textContent = priceOf(inp.value); };
        inputs[id] = { inp, p };
        return h('label', { class: 'field' }, h('span', {}, label), inp, h('span', { class: 'hint' }, hint), p);
      }), info,
      h('button', { class: 'btn btn-sm', onclick: () => { for (const [id, { inp }] of Object.entries(inputs)) { inp.value = DEFAULT_SETTINGS.models[id]; inp.oninput(); } } }, 'Reset to recommended')),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '🎨🔊🎤 Pictures, voice & listening'),
      h('p', { class: 'small muted' }, 'OpenRouter also has picture, voice and speech-recognition models. Leave a box empty to turn that feature off (the browser\'s own voice and speech recognition are used instead, where available).'),
      ...MEDIA.map(([id, label, hint, mod]) => {
        const dlm = h('datalist', { id: `or-${mod}` });
        const inp = h('input', { class: 'input', list: `or-${mod}`, value: s.models[id] ?? '' });
        mediaInputs[id] = inp;
        fetch(`https://openrouter.ai/api/v1/models?output_modalities=${mod}`).then(r => r.json()).then(j => (j.data || []).forEach(m => dlm.append(h('option', { value: m.id }, m.name)))).catch(() => { });
        return h('label', { class: 'field' }, h('span', {}, label), inp, dlm, h('span', { class: 'hint' }, hint));
      }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, 'Voice'), voiceSel, h('span', { class: 'hint' }, 'Voices depend on the voice model. Type a voice id if the list is empty.')),
        h('div', { class: 'field' }, h('span', {}, 'Try it'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: testVoice }, '🔊 Test voice'), h('button', { class: 'btn', onclick: testPicture }, '🎨 Test picture')), testOut)),
      h('label', { class: 'check' }, aiVoice, 'Use the AI voice for “Read to me” (falls back to the browser voice)'),
      h('label', { class: 'check' }, aiStt, 'Use AI speech recognition for the 🎤 buttons and Reading Buddy'),
      h('label', { class: 'check' }, lessonImgs, 'Add AI illustrations to new lessons — up to ', lessonImgCount, ' pictures per lesson'),
      h('label', { class: 'check' }, kidPics, 'Let the kids make AI pictures (Picture Maker, Story Studio, Writer, Paint) — up to ', kidPicLimit, ' per child per day'),
      h('label', { class: 'check' }, sounds, 'Fun sound effects on the kids\' desktop')),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '📘 Curriculum'),
      h('label', { class: 'field' }, h('span', {}, 'Curriculum the AI should follow'), h('input', { class: 'input', id: 'curr', value: s.curriculum })),
      h('p', { class: 'small muted' }, 'e.g. “National Curriculum for England (Key Stage 2)”, “Scottish Curriculum for Excellence (First Level)”, “Charlotte Mason-inspired, UK”.')),
    saveBar(() => {
      s.apiKey = key.value.trim();
      for (const [id, { inp }] of Object.entries(inputs)) s.models[id] = inp.value.trim() || DEFAULT_SETTINGS.models[id];
      applyMedia();
      s.curriculum = body.querySelector('#curr').value.trim() || DEFAULT_SETTINGS.curriculum;
    }));
  async function test() {
    res.innerHTML = '<span class="spinner"></span> Testing…';
    try { const t = await complete({ task: 'tutor', apiKey: key.value.trim(), model: inputs.tutor.inp.value.trim(), maxTokens: 20, messages: [{ role: 'user', content: 'Reply with exactly: Hello from the AI!' }] }); res.innerHTML = `<span class="pill good">✓ Working</span> ${esc(t.slice(0, 80))}`; }
    catch (e) { res.innerHTML = `<span class="pill bad">✗</span> ${esc(e.message)}`; }
  }
  body.append(voiceDl);
  mediaInputs.tts?.addEventListener('change', loadVoices); loadVoices();
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    models = (await r.json()).data || [];
    models.sort((a, b) => a.id.localeCompare(b.id)).forEach(m => dl.append(h('option', { value: m.id }, m.name)));
    info.textContent = `${models.length} models available.`;
    Object.values(inputs).forEach(({ inp }) => inp.oninput());
  } catch { info.textContent = 'Could not load the model list (you can still type a model id).'; }
}

// ─────────── Family ───────────
async function family(body) {
  const people = await store.profiles();
  const card = h('div', { class: 'card' });
  body.append(card);
  card.append(h('div', { class: 'row' }, h('h3', { style: { margin: 0, flex: 1 } }, 'Family members'), h('button', { class: 'btn', onclick: () => addPerson('parent') }, '+ Parent'), h('button', { class: 'btn btn-primary', onclick: () => addPerson('child') }, '+ Child')));
  const tbl = h('table', { class: 'tbl', style: { marginTop: '10px' } }, h('thead', {}, h('tr', {}, ...['', 'Name', 'Role', store.mode === 'cloud' ? 'Login email' : 'Login', 'Details', ''].map(t => h('th', {}, t)))));
  const tb = h('tbody'); tbl.append(tb); card.append(h('div', { style: { overflowX: 'auto' } }, tbl));
  people.forEach(p => tb.append(h('tr', {},
    h('td', { style: { fontSize: '28px' } }, p.avatar), h('td', {}, h('b', {}, p.name)),
    h('td', {}, h('span', { class: `pill ${p.role === 'admin' ? 'brand' : p.role === 'child' ? 'good' : ''}` }, { admin: 'Administrator', parent: 'Parent', child: 'Child' }[p.role])),
    h('td', { class: 'small' }, store.mode === 'cloud' ? p.email : p.role === 'child' ? 'Picture + PIN' : 'Picture + password'),
    h('td', { class: 'small muted' }, p.role === 'child' ? `${p.gender === 'girl' ? '👧 ' : p.gender === 'boy' ? '👦 ' : ''}${p.yearGroup || ''}, age ${p.age || '?'}${p.interests ? ' · loves ' + p.interests : ''}` : ''),
    h('td', { style: { whiteSpace: 'nowrap' } },
      h('button', { class: 'btn btn-sm', onclick: () => editPerson(p) }, '✏️ Edit'), ' ',
      h('button', { class: 'btn btn-sm', onclick: () => changeSecret(p) }, p.role === 'child' ? '🔢 PIN' : '🔑 Password'), ' ',
      p.id !== store.me.id ? h('button', { class: 'btn btn-sm', onclick: () => remove(p) }, '🗑') : null))));
  body.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Who can do what'), h('ul', { class: 'small', style: { lineHeight: 1.8 } },
    h('li', {}, h('b', {}, 'Administrator (you): '), 'everything, including Settings, AI models, API key and family accounts.'),
    h('li', {}, h('b', {}, 'Parent: '), 'create/edit/assign lessons, planner, progress & gap analysis, review work, read helper chats, notes and reports. Cannot open Settings.'),
    h('li', {}, h('b', {}, 'Child: '), 'their own desktop, lessons, files, practice and helper. They can only see their own work.'))));

  function addPerson(role) {
    const f = profileForm({}, { role, isNew: true });
    modal({ title: role === 'child' ? 'Add a child' : 'Add a parent', body: f.el, wide: true, actions: [{ label: 'Cancel' }, { label: 'Add', cls: 'btn-primary', onClick: async () => { const p = f.read(); await store.createUser(p); toast(`${p.name} added`, 'good'); state.kids = await store.children(); rerender(); } }] });
  }
  function editPerson(p) {
    const f = profileForm(p, { role: p.role, isNew: false });
    modal({ title: `Edit ${p.name}`, body: f.el, wide: true, actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async () => { const np = f.read(); await store.updateProfile(np); if (np.id === store.me.id) Object.assign(store.me, np); state.kids = await store.children(); toast('Saved', 'good'); rerender(); } }] });
  }
  function changeSecret(p) {
    const kid = p.role === 'child';
    const cloudOther = store.mode === 'cloud' && p.id !== store.me.id;
    const old = h('input', { class: 'input', type: 'password', autocomplete: 'off' });
    const nw = h('input', { class: 'input', type: kid ? 'tel' : 'password', inputmode: kid ? 'numeric' : null, autocomplete: 'new-password' });
    modal({
      title: `${kid ? 'New PIN' : 'New password'} for ${p.name}`,
      body: h('div', {}, cloudOther ? h('label', { class: 'field' }, h('span', {}, `Current ${kid ? 'PIN' : 'password'}`), old, h('span', { class: 'hint' }, 'Needed in cloud mode. Forgotten it? Reset the user in Supabase → Authentication → Users.')) : null,
        h('label', { class: 'field' }, h('span', {}, kid ? 'New PIN (4–8 numbers)' : 'New password (8+ characters)'), nw)),
      actions: [{ label: 'Cancel' }, { label: 'Change', cls: 'btn-primary', onClick: async () => {
        const v = nw.value.trim();
        if (kid ? !/^\d{4,8}$/.test(v) : v.length < 8) { toast(kid ? 'PIN must be 4–8 numbers' : 'At least 8 characters', 'warn'); return false; }
        await store.setSecret(p.id, v, old.value, p.role, p.email); toast('Changed', 'good');
      } }],
    });
  }
  async function remove(p) {
    if (!(await confirmDlg(`Remove ${p.name}? Their login stops working. ${p.role === 'child' ? 'Their lessons and work stay in the database (you can export a backup first).' : ''}${store.mode === 'cloud' ? ' (Also delete the user in Supabase → Authentication to remove the login completely.)' : ''}`, { ok: 'Remove', danger: true }))) return;
    await store.deleteUser(p.id); state.kids = await store.children(); toast('Removed'); rerender();
  }
}

// ─────────── Helper & safety ───────────
function safety(body, s, saveBar) {
  const name = h('input', { class: 'input', value: s.helper.name });
  const mode = h('select', { class: 'input' }, h('option', { value: 'balanced', selected: s.helper.mode === 'balanced' }, 'Balanced — guides on schoolwork, may explain simple facts for curiosity questions'), h('option', { value: 'strict', selected: s.helper.mode === 'strict' }, 'Strict — never gives answers, always guides them to work it out'));
  const limit = h('input', { class: 'input', type: 'number', min: 0, value: s.helper.dailyMessageLimit });
  const voice = h('input', { type: 'checkbox', checked: s.helper.allowVoice !== false });
  const words = h('textarea', { class: 'input', rows: 3 }, (s.safety.blockedWords || []).join(', '));
  const sites = structuredClone(s.safety.allowedSites || []);
  const siteWrap = h('div');
  const drawSites = () => {
    siteWrap.innerHTML = '';
    sites.forEach((x, i) => {
      const ic = h('input', { class: 'input', value: x.icon || '🌐', style: { width: '60px' }, oninput: e => { x.icon = e.target.value; } });
      const nm = h('input', { class: 'input', value: x.name, placeholder: 'Name', oninput: e => { x.name = e.target.value; } });
      const url = h('input', { class: 'input', value: x.url, placeholder: 'https://…', oninput: e => { x.url = e.target.value; } });
      siteWrap.append(h('div', { class: 'row', style: { marginBottom: '6px' } }, ic, nm, url, h('button', { class: 'btn btn-sm', onclick: () => { sites.splice(i, 1); drawSites(); } }, '✕')));
    });
  };
  drawSites();
  body.append(
    h('div', { class: 'card' }, h('h3', {}, '🦉 Kids\' helper'),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', {}, 'Helper name'), name), h('label', { class: 'field' }, h('span', {}, 'Questions per child per day (0 = unlimited)'), limit)),
      h('label', { class: 'field' }, h('span', {}, 'Answering style'), mode),
      h('label', { class: 'check' }, voice, 'Allow talking to the helper with the microphone (where the browser supports it)'),
      h('p', { class: 'small muted' }, 'Every chat is saved for you to read in “Helper chats”. Messages that look like personal information (addresses, phone numbers, emails, passwords) are blocked before they reach the AI, and anything suggesting distress is flagged to you.')),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '⛔ Blocked words'), h('p', { class: 'small muted' }, 'Comma-separated. Blocks Explorer searches/pages and helper messages containing these words, and flags them for you.'), words),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '🌐 Approved websites (Explorer)'), h('p', { class: 'small muted' }, 'Shown as tiles in Explorer. Explorer otherwise only shows Simple English Wikipedia. Some sites refuse to load inside another page; the kids get an “open in new tab” button for those.'), siteWrap,
      h('button', { class: 'btn btn-sm', onclick: () => { sites.push({ name: '', url: 'https://', icon: '🌐' }); drawSites(); } }, '+ Add website')),
    saveBar(() => {
      s.helper = { ...s.helper, name: name.value.trim() || 'Ollie the Owl', mode: mode.value, dailyMessageLimit: +limit.value || 0, allowVoice: voice.checked };
      s.safety.blockedWords = words.value.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      s.safety.allowedSites = sites.filter(x => x.name && /^https:\/\//.test(x.url));
    }));
}

// ─────────── School hours ───────────
function schedule(body, s, saveBar) {
  const sc = s.schedule;
  const en = h('input', { type: 'checkbox', checked: sc.enabled });
  const start = h('input', { class: 'input', type: 'time', value: sc.start });
  const end = h('input', { class: 'input', type: 'time', value: sc.end });
  const limit = h('input', { class: 'input', type: 'number', min: 0, step: 15, value: sc.dailyLimitMins });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [1, 2, 3, 4, 5, 6, 0].map(d => h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '12px' } }, h('input', { type: 'checkbox', value: d, checked: sc.days.includes(d) }), dayNames[d]));
  body.append(h('div', { class: 'card' },
    h('label', { class: 'check' }, en, h('b', {}, 'Only allow the kids to log in during school hours')),
    h('div', { class: 'grid2', style: { maxWidth: '420px', marginTop: '10px' } }, h('label', { class: 'field' }, h('span', {}, 'Start'), start), h('label', { class: 'field' }, h('span', {}, 'Finish'), end)),
    h('div', { class: 'field' }, h('span', {}, 'School days'), h('div', {}, ...days)),
    h('label', { class: 'field', style: { maxWidth: '420px' } }, h('span', {}, 'Daily screen-time limit in minutes (0 = no limit)'), limit),
    h('p', { class: 'small muted' }, 'When time is up the kids see a friendly “time to stop” screen. Their work auto-saves. Parents can always log in.')),
    saveBar(() => { s.schedule = { enabled: en.checked, start: start.value, end: end.value, days: days.map(d => d.querySelector('input')).filter(i => i.checked).map(i => +i.value), dailyLimitMins: +limit.value || 0 }; }));
}

// ─────────── Data ───────────
function data(body) {
  const cloud = store.mode === 'cloud';
  body.append(
    h('div', { class: 'card' }, h('h3', {}, cloud ? '☁️ Cloud sync is ON' : '💻 Saved on this device'),
      cloud ? h('p', {}, 'Data is stored in your Supabase project and syncs across every device. Kids only see their own work (enforced by database security rules).')
        : h('div', {}, h('p', {}, 'Everything is stored in this browser on this computer. If you clear the browser\'s data, it is gone — export a backup regularly.'),
          h('p', {}, 'To let Mum and Dad track progress from their phones and the kids log in anywhere, turn on cloud sync — see “Cloud sync” in README.md (takes about 10 minutes, free). Then export a backup here and import it after switching.'))),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '💾 Backup'),
      h('p', { class: 'small muted' }, 'Export downloads all lessons, progress, work and settings as a JSON file. Import merges a backup into this system.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn btn-primary', onclick: exportAll }, '⬇️ Export backup'),
        h('label', { class: 'btn' }, '⬆️ Import backup', h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: e => importAll(e.target.files[0]) })))),
    !cloud ? h('div', { class: 'card', style: { marginTop: '14px', borderColor: 'var(--bad)' } }, h('h3', {}, '⚠️ Danger zone'),
      h('button', { class: 'btn btn-danger', onclick: resetAll }, 'Erase everything on this device')) : null,
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'ℹ️ About'), h('p', { class: 'small muted' }, `${CONFIG.appName} · storage: ${store.mode} · AI via OpenRouter (your key) · Encyclopedia: Simple English Wikipedia.`)));

  async function exportAll() {
    const out = { app: 'stefone-kids', version: 1, exportedAt: new Date().toISOString(), mode: store.mode, data: {} };
    for (const c of COLLECTIONS) out.data[c] = await store.list(c);
    if (store.mode === 'local') out.data.profiles = await store.backend.list('profiles');
    else out.profiles = await store.profiles();
    download(`stefone-kids-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1));
  }
  async function importAll(file) {
    if (!file) return;
    try {
      const j = JSON.parse(await readFileText(file));
      if (j.app !== 'stefone-kids') throw new Error('This is not a Stefone Kids backup');
      if (!(await confirmDlg(`Import ${Object.values(j.data).reduce((n, a) => n + a.length, 0)} records from ${j.exportedAt?.slice(0, 10)}? Existing records with the same id are overwritten.`))) return;
      let idMap = {};
      if (store.mode === 'cloud' && j.mode === 'local') {
        // Children get new ids in the cloud: match them by name.
        const now = await store.profiles();
        for (const p of j.data.profiles || []) { const m = now.find(x => x.name.toLowerCase() === p.name.toLowerCase() && x.role === p.role); if (m) idMap[p.id] = m.id; }
      }
      const remap = doc => { if (doc.childId && idMap[doc.childId]) doc.childId = idMap[doc.childId]; if (doc.id && idMap[doc.id] && j.mode !== store.mode) doc.id = idMap[doc.id]; if (doc.bridgingFor?.childId && idMap[doc.bridgingFor.childId]) doc.bridgingFor.childId = idMap[doc.bridgingFor.childId]; return doc; };
      for (const c of COLLECTIONS) for (const doc of j.data[c] || []) {
        if (c === 'timelog' && idMap[doc.childId]) doc.id = `${idMap[doc.childId]}_${doc.date}`;
        await store.backend.put(c, remap(doc));
      }
      if (store.mode === 'local' && j.mode === 'local') for (const p of j.data.profiles || []) await store.backend.put('profiles', p);
      toast('Backup imported', 'good');
      state.kids = await store.children(); rerender();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function resetAll() {
    const t = await promptDlg('Erase everything', 'Type ERASE to delete all data on this device');
    if (t !== 'ERASE') return;
    await store.backend.clearAll(); LS.del('session'); LS.del('roster'); location.reload();
  }
}
