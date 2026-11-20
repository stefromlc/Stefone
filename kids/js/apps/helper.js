// Helper — a Socratic AI learning buddy that guides rather than gives answers.
import { store } from '../store.js';
import { h, md, speak, toast, esc, today } from '../util.js';
import { complete, tutorSystemPrompt, screenKidMessage } from '../ai.js';

export async function open(win, ctx, args = {}) {
  const { me, settings } = ctx;
  const helperName = settings.helper?.name || 'Ollie the Owl';
  win.setTitle(helperName);
  let chats = (await store.list('chats', { childId: me.id })).sort((a, b) => b.updatedAt - a.updatedAt);
  let chat = null, busy = false;

  const side = h('div', { class: 'chat-side' });
  const log = h('div', { class: 'chat-log' });
  const ta = h('textarea', { class: 'input', placeholder: `Ask ${helperName.split(' ')[0]} for help…`, spellcheck: 'true', lang: 'en-GB' });
  const send = h('button', { class: 'btn btn-primary btn-lg', onclick: () => submit() }, 'Send ➤');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = SR && settings.helper?.allowVoice !== false ? h('button', { class: 'btn btn-lg', title: 'Talk instead of typing', onclick: listen }, '🎤') : null;
  const ctxBar = h('div', { class: 'small', style: { padding: '6px 14px', background: '#f3f0ff', display: 'none' } });
  win.body.append(h('div', { class: 'chat' }, side, h('div', { class: 'chat-main' }, ctxBar, log, h('div', { class: 'chat-input' }, ta, mic, send))));
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

  function drawSide() {
    side.innerHTML = '';
    side.append(h('button', { class: 'btn btn-primary', style: { width: '100%', marginBottom: '8px' }, onclick: () => newChat() }, '+ New chat'));
    chats.slice(0, 40).forEach(c => side.append(h('div', { class: `c ${chat && chat.id === c.id ? 'on' : ''}`, onclick: () => { chat = c; drawSide(); drawLog(); } }, c.title || 'New chat')));
  }
  function newChat(context = '') {
    chat = { childId: me.id, title: '', messages: [], context, flagged: false, flagReasons: [] };
    drawSide(); drawLog(); ta.focus();
  }
  function bubble(m) {
    const b = h('div', { class: `msg ${m.role} ${m.flagged ? 'flagged' : ''}` });
    if (m.role === 'assistant') { b.append(h('div', { class: 'md', html: md(m.content) })); b.append(h('button', { class: 'icon-btn say', title: 'Read aloud', onclick: () => speak(m.content) }, '🔊')); }
    else b.textContent = m.content;
    return b;
  }
  function drawLog() {
    log.innerHTML = '';
    ctxBar.style.display = chat?.context ? 'block' : 'none';
    if (chat?.context) ctxBar.textContent = '📌 Helping with: ' + chat.context.split('\n')[0].slice(0, 140);
    if (!chat || !chat.messages.length) {
      const sugg = chat?.context ? ["I don't understand this part", 'Can you give me a hint?', 'Can you explain it a different way?', 'Am I on the right track?']
        : ['Help me with my times tables', 'How do I start a story?', 'Why is the sky blue?', 'Can you quiz me on spellings?', 'What is a fraction?'];
      log.append(h('div', { class: 'owl-intro' }, h('div', { class: 'big' }, '🦉'), h('h2', {}, `Hi ${me.name}! I'm ${helperName}.`),
        h('p', {}, "I won't just tell you the answers — I'll help you work them out yourself, like a real detective! 🔎"),
        h('div', { class: 'suggest' }, ...sugg.map(s => h('button', { onclick: () => { ta.value = s; submit(); } }, s)))));
      return;
    }
    chat.messages.forEach(m => log.append(bubble(m)));
    log.scrollTop = log.scrollHeight;
  }

  async function messagesToday() {
    const d = new Date().toDateString();
    return chats.reduce((n, c) => n + (c.messages || []).filter(m => m.role === 'user' && new Date(m.ts).toDateString() === d).length, 0);
  }

  async function flag(reason) {
    chat.flagged = true; chat.flagReasons = [...new Set([...(chat.flagReasons || []), reason])];
    store.log('helper_flag', { reason });
  }

  async function submit() {
    const text = ta.value.trim();
    if (!text || busy) return;
    if (!chat) newChat();
    const limit = settings.helper?.dailyMessageLimit || 0;
    if (limit && (await messagesToday()) >= limit) return toast(`That's all the questions for today! Try working it out yourself or ask Mum or Dad. 💪`, 'warn', 5000);
    ta.value = '';
    const um = { role: 'user', content: text, ts: Date.now() };
    const screen = screenKidMessage(text, settings);
    if (screen.flag) { um.flagged = true; await flag(screen.reason); }
    chat.messages.push(um);
    if (!chat.title) chat.title = text.slice(0, 40);
    if (!chats.includes(chat)) chats.unshift(chat);
    drawSide(); drawLog();
    if (screen.blocked) {
      chat.messages.push({ role: 'assistant', content: screen.reply, ts: Date.now() });
      await persist(); drawLog(); return;
    }
    busy = true; send.disabled = true;
    const am = { role: 'assistant', content: '', ts: Date.now() };
    chat.messages.push(am);
    const b = bubble(am); b.querySelector('.md').innerHTML = '<span class="spinner"></span>';
    log.append(b); log.scrollTop = log.scrollHeight;
    try {
      const history = chat.messages.slice(0, -1).slice(-20).map(m => ({ role: m.role, content: m.content }));
      const full = await complete({
        task: 'tutor', temperature: 0.6, maxTokens: 400,
        messages: [{ role: 'system', content: tutorSystemPrompt({ child: me, settings, context: chat.context }) }, ...history],
        onToken: (_, f) => { b.querySelector('.md').innerHTML = md(f.replace(/^\s*\[FLAG\]\s*/, '')); log.scrollTop = log.scrollHeight; },
      });
      am.content = full.replace(/^\s*\[FLAG\]\s*/, '').trim() || "Hmm, I'm not sure. Can you ask me another way?";
      if (/^\s*\[FLAG\]/.test(full)) { am.flagged = true; await flag('Helper noticed a wellbeing/safety concern'); }
      b.querySelector('.md').innerHTML = md(am.content);
    } catch (e) {
      am.content = `😕 ${e.message}`;
      b.querySelector('.md').textContent = am.content;
    }
    busy = false; send.disabled = false;
    await persist();
    ta.focus();
  }
  async function persist() { await store.put('chats', chat); }

  function listen() {
    const r = new SR(); r.lang = 'en-GB'; r.interimResults = true;
    mic.textContent = '🔴';
    r.onresult = e => { ta.value = [...e.results].map(x => x[0].transcript).join(''); };
    r.onend = () => { mic.textContent = '🎤'; ta.focus(); };
    r.onerror = () => { mic.textContent = '🎤'; toast('Could not hear you — try typing instead', 'warn'); };
    r.start();
  }

  if (args.context) newChat(args.context); else if (chats[0] && chats[0].updatedAt > Date.now() - 3600_000) { chat = chats[0]; drawSide(); drawLog(); } else newChat();
  return { handle: a => { if (a?.context) newChat(a.context); } };
}
