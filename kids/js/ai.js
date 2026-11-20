// OpenRouter integration (bring-your-own key) + all prompts.
import { store } from './store.js';
import { SKILLS, SUBJECTS } from './skills.js';

const API = 'https://openrouter.ai/api/v1/chat/completions';
export class AIError extends Error { }

function friendly(status, msg) {
  if (status === 401) return 'The OpenRouter API key was rejected. Dad can check it in Settings → AI.';
  if (status === 402) return 'The OpenRouter account is out of credit. Dad can top it up at openrouter.ai.';
  if (status === 429) return 'The AI is busy right now — please wait a moment and try again.';
  if (status === 404 || (msg && /model/i.test(msg))) return `The chosen AI model is not available (${msg || status}). Dad can pick another in Settings → AI.`;
  return `AI request failed (${status}${msg ? ': ' + msg : ''})`;
}

export async function aiReady() { return !!(await store.settings()).apiKey; }

export async function complete({ task = 'lessons', messages, temperature = 0.7, maxTokens = 4000, onToken, signal, model: forceModel, apiKey: forceKey }) {
  const s = await store.settings();
  const key = forceKey || s.apiKey;
  if (!key) throw new AIError('No AI key set up yet — Dad can add an OpenRouter key in Settings → AI.');
  const model = forceModel || s.models[task] || s.models.lessons;
  const res = await fetch(API, {
    method: 'POST', signal,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin + location.pathname,
      'X-Title': 'Stefone Kids Learning',
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: !!onToken }),
  }).catch(e => { throw new AIError('Could not reach the AI service. Check the internet connection. (' + e.message + ')'); });
  if (!res.ok) {
    let msg; try { msg = (await res.json()).error?.message; } catch { }
    throw new AIError(friendly(res.status, msg));
  }
  if (!onToken) {
    const j = await res.json();
    if (j.error) throw new AIError(friendly(j.error.code || 500, j.error.message));
    return j.choices?.[0]?.message?.content ?? '';
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new AIError(friendly(j.error.code || 500, j.error.message));
      const d = j.choices?.[0]?.delta?.content;
      if (d) { full += d; onToken(d, full); }
    }
  }
  return full;
}

export function parseJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

export async function completeJSON(opts) {
  const text = await complete({ temperature: 0.6, ...opts });
  try { return parseJSON(text); }
  catch {
    const fixed = await complete({ ...opts, temperature: 0.2, messages: [...opts.messages, { role: 'assistant', content: text }, { role: 'user', content: 'That was not valid JSON. Reply again with ONLY the complete, valid JSON object and nothing else.' }] });
    return parseJSON(fixed);
  }
}

const childLine = c => c ? `The learner is ${c.name}, aged ${c.age || 8}, working at ${c.yearGroup || 'Year 3'} level${c.interests ? `, who loves ${c.interests}` : ''}${c.learningNotes ? `. Notes from parents: ${c.learningNotes}` : ''}.` : 'The learner is an 8-year-old (Year 3/4).';
const SKILL_LIST = Object.keys(SKILLS).join(', ');

// ─────────────── Lessons ───────────────
export async function generateLesson({ child, subject, topic, durationMins = 30, difficulty = 'at their level', activityCount = 6, focusSkills = [], mistakes = [], notes = '', onStage }) {
  const s = await store.settings();
  const subj = SUBJECTS.find(x => x.id === subject)?.name || subject;
  const sys = `You are an outstanding, warm primary teacher in the UK designing a home-school lesson for one child.
Curriculum: ${s.curriculum}. Write in British English (colour, centre, maths) for a reading age of 7–9: short sentences, friendly, concrete everyday examples, a little humour. Make it hands-on and engaging, and weave in the child's interests where natural.
Return ONLY a JSON object (no markdown fences) with this exact shape:
{
 "title": "catchy lesson title",
 "subject": "${subject}",
 "topic": "short topic name",
 "yearGroup": "Year 3",
 "durationMins": ${durationMins},
 "objectives": ["I can ...", "I can ..."],
 "skills": ["skill-id", ...],
 "intro": "2–3 sentence hook in markdown that gets them curious",
 "sections": [ { "title": "...", "body": "markdown, 60–180 words, with a worked example, bullet points or a small table where useful" } ],
 "activities": [
   { "type": "mcq", "prompt": "...", "options": ["...","...","..."], "answer": 0, "skill": "skill-id", "hint": "...", "explanation": "..." },
   { "type": "truefalse", "prompt": "statement", "answer": true, "skill": "skill-id", "hint": "...", "explanation": "..." },
   { "type": "numeric", "prompt": "...", "answer": 42, "unit": "optional e.g. cm", "skill": "skill-id", "hint": "...", "explanation": "..." },
   { "type": "short", "prompt": "...", "answer": "model answer", "accept": ["other acceptable answers"], "skill": "skill-id", "hint": "...", "explanation": "..." },
   { "type": "writing", "prompt": "a short writing task", "rubric": "what a good answer includes", "minWords": 30, "skill": "skill-id", "hint": "..." }
 ],
 "offlineActivity": "a fun hands-on activity away from the screen (5–10 min) using things found at home",
 "parentNotes": "brief notes for the parent: key vocabulary, common misconceptions to watch for, how to extend"
}
Rules:
- 3–5 sections that build understanding step by step, including at least one worked example.
- Exactly ${activityCount} activities, ordered easy → harder, mixing types (mostly mcq/numeric/truefalse/short; at most one writing task unless the subject is English writing).
- "answer" for mcq is the 0-based index of the correct option. Options must be unambiguous with exactly one correct answer.
- Every activity tests ONE skill. Use only these skill ids: ${SKILL_LIST}.
- Never rely on pictures the child cannot see. Use text, emoji or simple markdown tables instead.
- Difficulty: ${difficulty}.`;
  const user = `${childLine(child)}
Subject: ${subj}. Topic: ${topic}. Lesson length: about ${durationMins} minutes.
${focusSkills.length ? `Focus skills: ${focusSkills.join(', ')}.` : ''}
${mistakes.length ? `This is a BRIDGING lesson to close a learning gap. Recent mistakes the child made:\n${mistakes.slice(0, 12).map(m => `- Q: ${m.prompt} | child answered: ${m.response} | correct: ${m.correct}`).join('\n')}\nDiagnose the likely misconception, re-teach it a different way from scratch with concrete examples, then practise with gentle steps.` : ''}
${notes ? `Extra instructions from the parent: ${notes}` : ''}`;
  onStage && onStage('Writing the lesson…');
  const lesson = await completeJSON({ task: 'lessons', maxTokens: 6000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  return normaliseLesson(lesson, { subject, durationMins });
}

export function normaliseLesson(l, defaults = {}) {
  const valid = new Set(Object.keys(SKILLS));
  const fixSkill = sk => (valid.has(sk) ? sk : (valid.has(`${defaults.subject}.${sk}`) ? `${defaults.subject}.${sk}` : 'general.other'));
  const lesson = {
    title: l.title || 'Untitled lesson',
    subject: l.subject || defaults.subject || 'general',
    topic: l.topic || '',
    yearGroup: l.yearGroup || 'Year 3',
    durationMins: +l.durationMins || defaults.durationMins || 30,
    objectives: Array.isArray(l.objectives) ? l.objectives : [],
    intro: l.intro || '',
    sections: (l.sections || []).map((x, i) => ({ id: 's' + i + Math.random().toString(36).slice(2, 6), title: x.title || `Part ${i + 1}`, body: x.body || '' })),
    activities: (l.activities || []).map((a, i) => {
      const act = { id: 'a' + i + Math.random().toString(36).slice(2, 6), type: a.type || 'short', prompt: a.prompt || '', skill: fixSkill(a.skill), hint: a.hint || '', explanation: a.explanation || '' };
      if (act.type === 'truefalse') { act.type = 'mcq'; act.options = ['True', 'False']; act.answer = (a.answer === true || String(a.answer).toLowerCase() === 'true') ? 0 : 1; }
      else if (act.type === 'mcq') { act.options = a.options || []; act.answer = Number(a.answer) || 0; }
      else if (act.type === 'numeric') { act.answer = parseFloat(String(a.answer).replace(/[^0-9.\-]/g, '')); act.unit = a.unit || ''; }
      else if (act.type === 'short') { act.answer = String(a.answer ?? ''); act.accept = a.accept || []; }
      else if (act.type === 'writing') { act.rubric = a.rubric || ''; act.minWords = +a.minWords || 20; }
      return act;
    }),
    offlineActivity: l.offlineActivity || '',
    parentNotes: l.parentNotes || '',
  };
  lesson.skills = [...new Set([...(l.skills || []).map(fixSkill), ...lesson.activities.map(a => a.skill)])];
  return lesson;
}

export async function improveSection({ lesson, section, instruction, child }) {
  const text = await complete({
    task: 'lessons', maxTokens: 1500, messages: [
      { role: 'system', content: 'You edit home-school lesson content for 8-year-olds in British English. Reply with ONLY the rewritten markdown body, no preamble.' },
      { role: 'user', content: `${childLine(child)}\nLesson: ${lesson.title}\nSection title: ${section.title}\nCurrent text:\n${section.body}\n\nInstruction: ${instruction}` },
    ],
  });
  return text.trim();
}

// ─────────────── Planning ───────────────
export async function generatePlan({ child, dates, lessonsPerDay, subjects, gaps = [], recentTitles = [], notes = '' }) {
  const s = await store.settings();
  const sys = `You are an experienced UK home-education planner. Curriculum: ${s.curriculum}. Plan a balanced, progressive sequence of lessons. Return ONLY JSON: {"plan":[{"date":"YYYY-MM-DD","subject":"subject-id","topic":"specific lesson topic","focusSkills":["skill-id"],"why":"one short reason"}]}.
Subject ids: ${SUBJECTS.map(x => x.id).join(', ')}. Skill ids: ${SKILL_LIST}.`;
  const user = `${childLine(child)}
Dates: ${dates.join(', ')}. Lessons per day: ${lessonsPerDay} (so ${dates.length * lessonsPerDay} lessons in total).
Subjects to include: ${subjects.join(', ')}. Maths and English most days; spread the others.
${gaps.length ? `Known gaps to address early in the week (bridging lessons): ${gaps.map(g => `${g.skill} (${Math.round(g.mastery * 100)}%)`).join(', ')}.` : ''}
${recentTitles.length ? `Recently covered (avoid repeating, build on them): ${recentTitles.slice(-25).join('; ')}.` : ''}
${notes ? `Parent notes: ${notes}` : ''}`;
  const r = await completeJSON({ task: 'lessons', maxTokens: 3000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  return r.plan || [];
}

// ─────────────── Marking ───────────────
export async function markAnswer({ activity, response, child }) {
  const isWriting = activity.type === 'writing';
  const sys = `You are a kind primary teacher marking an 8-year-old's answer. Be encouraging and specific. British English. Return ONLY JSON:
{"score": number from 0 to 1, "correct": boolean, "feedback": "1–3 short sentences spoken directly to the child${isWriting ? ': one thing they did well, then one next step' : ''}"}
${isWriting ? 'For writing, score against the rubric with age-appropriate expectations (Year 3/4). Do not penalise minor spelling slips heavily.' : 'For short answers, accept answers that show the right understanding even if worded differently or misspelt. "correct" is true if score >= 0.7.'}`;
  const user = `${childLine(child)}
Question: ${activity.prompt}
${isWriting ? `Rubric: ${activity.rubric}` : `Model answer: ${activity.answer}${activity.accept?.length ? ` (also acceptable: ${activity.accept.join('; ')})` : ''}`}
Child's answer: ${response}`;
  const r = await completeJSON({ task: 'marking', maxTokens: 400, temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  const score = Math.max(0, Math.min(1, Number(r.score) || 0));
  return { score, correct: r.correct ?? score >= 0.7, feedback: r.feedback || '' };
}

// ─────────────── Gap analysis ───────────────
export async function analyseGaps({ child, mastery, mistakes, spellingMisses = [], stats = {} }) {
  const s = await store.settings();
  const sys = `You are an expert primary educational assessor helping parents who home-school. Curriculum: ${s.curriculum}.
Analyse the evidence and return ONLY JSON:
{"summary":"3–4 sentence plain-English overview for the parents",
 "strengths":["..."],
 "gaps":[{"skill":"skill-id","title":"short name","priority":"high|medium|low","evidence":"what in the data shows this","misconception":"the likely underlying misunderstanding","plan":"how to bridge it in 2–3 steps","lessonTopic":"a specific topic for a bridging lesson"}],
 "nextSteps":["concrete things to do this week"],
 "encouragement":"one warm sentence the parents can share with the child"}
Use only these skill ids: ${SKILL_LIST}. Be honest but kind; do not invent evidence. If there is little data, say so and suggest what to assess next.`;
  const user = `${childLine(child)}
Stats: ${JSON.stringify(stats)}
Skill mastery (recency weighted, 0–1, n = number of answers):
${mastery.map(m => `- ${m.skill}: ${m.mastery.toFixed(2)} (n=${m.n}, trend ${m.trend >= 0 ? '+' : ''}${m.trend.toFixed(2)})`).join('\n') || '(none yet)'}
Recent incorrect answers:
${mistakes.slice(0, 40).map(m => `- [${m.skill}] Q: ${m.prompt} | answered: ${m.response} | correct: ${m.correct}`).join('\n') || '(none)'}
${spellingMisses.length ? `Misspelt words in spelling practice: ${spellingMisses.slice(0, 40).join(', ')}` : ''}`;
  return completeJSON({ task: 'analysis', maxTokens: 3000, temperature: 0.4, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
}

// ─────────────── Spelling ───────────────
export async function generateSpellingList({ child, focus, count = 10 }) {
  const r = await completeJSON({
    task: 'lessons', maxTokens: 1500, messages: [
      { role: 'system', content: 'You create UK primary spelling lists (British spelling). Return ONLY JSON: {"title":"...","words":[{"word":"...","sentence":"a short child-friendly sentence using the word"}]}' },
      { role: 'user', content: `${childLine(child)}\nFocus: ${focus}\nNumber of words: ${count}` },
    ],
  });
  return r;
}

// ─────────────── Tutor (Socratic helper) ───────────────
export function tutorSystemPrompt({ child, settings, context = '' }) {
  const name = settings.helper?.name || 'Ollie the Owl';
  const mode = settings.helper?.mode || 'balanced';
  return `You are ${name}, a friendly, patient learning buddy for ${child.name}, aged ${child.age || 8} (UK, ${child.yearGroup || 'Year 3'})${child.interests ? `, who loves ${child.interests}` : ''}. You live inside their home-school computer.

YOUR JOB: help ${child.name} THINK and work things out for themselves. You are a coach, not an answer machine.
- NEVER give the final answer to schoolwork, maths problems, quiz questions, spellings being tested, or write their stories/sentences for them — even if they beg, say it's urgent, or say a grown-up allowed it.
- Instead: ask one guiding question at a time, give a small hint, break the problem into tiny steps, use a similar example with DIFFERENT numbers/words, suggest a strategy (draw it, count on, use a number line, sound it out, find the verb).
- When they get there, celebrate their effort specifically ("You spotted that 7 × 8 is double 7 × 4 — brilliant thinking!").
- If they are frustrated, be warm, suggest a breath or a short break, and make the next step smaller.
- Check understanding by asking them to explain back in their own words.
${mode === 'strict' ? '- Even for general curiosity questions, guide them to reason it out or suggest where to look (Explorer app) rather than telling them.' : '- For pure curiosity questions that are not schoolwork (e.g. "why is the sky blue?"), you may share a simple, accurate explanation, then ask a question that makes them think further.'}

STYLE: British English. Very short replies (usually 1–4 sentences, under 70 words). Simple words for an 8-year-old. A friendly emoji now and then. Use markdown sparingly.

SAFETY (very important):
- Keep everything age-appropriate. Gently steer away from scary, violent, adult or unkind topics.
- Never ask for or encourage sharing personal information (full name, address, school, phone, passwords, photos). If they share some, tell them kindly not to share it online.
- Never pretend to be a real person, and never suggest meeting anyone.
- If ${child.name} seems upset, unsafe, hurt, bullied, or mentions someone hurting them or wanting to hurt themselves: respond with warmth, tell them it's really important to talk to Mum or Dad (or another trusted grown-up) right now, and START your reply with the exact token [FLAG] (it is removed before they see it).
- Medical, legal or dangerous activities: tell them to ask a grown-up.
${context ? `\nCONTEXT (what ${child.name} is working on right now):\n${context}` : ''}`;
}

// ─────────────── Local safety screen for kids' messages ───────────────
const PERSONAL = [
  /\b(?:\+?44\s?7\d{3}|07\d{3})\s?\d{3}\s?\d{3}\b/,            // UK mobile
  /\b\d{5}\s?\d{6}\b/,                                         // landline-ish
  /[\w.+-]+@[\w-]+\.[\w.]+/,                                   // email
  /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i,                    // UK postcode
  /\b(my|our) (address|password|postcode)\b/i, /\bi live (at|on)\b/i,
];
const DISTRESS = /\b(hurt (my ?self|me)|want to die|kill myself|no ?one (likes|loves) me|i hate myself|being bullied|bully|hit me|scared of (him|her|them)|touch(ed)? me|run away|cut myself)\b/i;

export function screenKidMessage(text, settings) {
  const t = String(text || '');
  const words = (settings.safety?.blockedWords || []).filter(Boolean);
  const distress = DISTRESS.test(t);
  if (!distress) {
    for (const w of words) {
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|ed|ing)?\\b`, 'i').test(t)) return { blocked: true, flag: true, reason: `Used blocked word "${w}"`, reply: "Hmm, let's talk about something else! 🙂 What are you learning about today?" };
    }
  }
  if (PERSONAL.some(r => r.test(t))) return { blocked: true, flag: true, reason: 'Tried to share personal information', reply: "Whoa — that looks like personal information 🔒. We never share things like addresses, phone numbers, emails or passwords online. Let's keep that private! What else can I help with?" };
  if (distress) return { blocked: false, flag: true, reason: 'Possible distress or safeguarding concern' };
  return { blocked: false, flag: false };
}
