// OpenRouter integration (bring-your-own key) + all prompts.
import { store } from './store.js';
import { SKILLS, SUBJECTS } from './skills.js';

const API = 'https://openrouter.ai/api/v1/chat/completions';
export class AIError extends Error { }

export function friendly(status, msg) {
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

export const pronouns = c => (c?.gender === 'girl' ? 'she/her' : c?.gender === 'boy' ? 'he/him' : 'they/them');
export const childLine = c => c ? `The learner is ${c.name}${c.gender ? ` (a ${c.gender}, ${pronouns(c)})` : ''}, aged ${c.age || 8}, working at ${c.yearGroup || 'Year 3'} level${c.interests ? `, who loves ${c.interests}` : ''}${c.learningNotes ? `. Notes from parents: ${c.learningNotes}` : ''}.` : 'The learner is an 8-year-old (Year 3/4).';
const SKILL_LIST = Object.keys(SKILLS).join(', ');

// ─────────────── Lessons ───────────────
export const ACTIVITY_SCHEMA = `
   { "type": "mcq", "prompt": "...", "options": ["...","...","..."], "answer": 0, ...common },
   { "type": "truefalse", "prompt": "statement", "answer": true, ...common },
   { "type": "multi", "prompt": "Which of these are ...? (choose all)", "options": ["a","b","c","d"], "answers": [0,2], ...common },
   { "type": "numeric", "prompt": "...", "answer": 42, "unit": "optional e.g. cm", ...common },
   { "type": "short", "prompt": "...", "answer": "model answer", "accept": ["other acceptable answers"], ...common },
   { "type": "order", "prompt": "Put these in order ...", "items": ["first","second","third","fourth"], ...common },
   { "type": "match", "prompt": "Match each ... to its ...", "pairs": [["left","right"],["left","right"],["left","right"]], ...common },
   { "type": "sort", "prompt": "Sort these into groups", "categories": ["Group A","Group B"], "items": [{"text":"item","cat":"Group A"}], ...common },
   { "type": "fillblank", "prompt": "Fill in the missing words", "text": "A [[noun]] is a naming word. The [[verb]] is the doing word.", "bank": true, "distractors": ["adjective"], ...common },
   { "type": "numberline", "prompt": "Show where 3/4 is on the number line", "min": 0, "max": 1, "step": 0.05, "answer": 0.75, "labels": ["0","1/2","1"], "tickEvery": 0.25, ...common },
   { "type": "writing", "prompt": "a short writing task", "rubric": "what a good answer includes", "minWords": 30, "skill": "skill-id", "hint": "..." },
   { "type": "draw", "prompt": "Draw ... (something checkable from a simple drawing)", "rubric": "what the drawing must show", "skill": "skill-id", "hint": "..." },
   { "type": "speak", "prompt": "Read this sentence aloud", "target": "the exact sentence to read (max 20 words)", "skill": "skill-id" }
 where ...common = "skill": "skill-id", "hint": "a helpful nudge", "explanation": "why the answer is right"`;

export async function generateLesson({ child, subject, topic, durationMins = 30, difficulty = 'at their level', activityCount = 6, focusSkills = [], mistakes = [], notes = '', interactive = true, withImages = true, check = true, onStage }) {
  const s = await store.settings();
  const subj = SUBJECTS.find(x => x.id === subject)?.name || subject;
  const sys = `You are an outstanding, warm primary teacher in the UK designing an interactive home-school lesson.
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
 "coverImagePrompt": "a description of a fun illustration for the lesson cover (no text in it)",
 "intro": "2–3 sentence hook in markdown that gets them curious",
 "sections": [
   { "type": "text", "title": "...", "body": "markdown, 60–180 words, with a worked example, bullet points or a small table where useful", "imagePrompt": "optional: an illustration that genuinely helps explain this section (no text in it)" },
   { "type": "fact", "title": "Did you know?", "body": "one amazing short fact (1–3 sentences)" },
   { "type": "flashcards", "title": "Key words", "body": "optional one-line instruction", "cards": [{"front":"word or question","back":"meaning or answer"}] }
 ],
 "activities": [${ACTIVITY_SCHEMA}
 ],
 "offlineActivity": "a fun hands-on activity away from the screen (5–10 min) using things found at home",
 "parentNotes": "brief notes for the parent: key vocabulary, common misconceptions to watch for, how to extend"
}
Rules:
- 3–6 sections that build understanding step by step, including at least one worked example; include a flashcards section for key vocabulary and a fact section when they fit.
- Exactly ${activityCount} activities, ordered easy → harder.${interactive ? ` Make it INTERACTIVE: use at least ${Math.min(4, Math.max(2, Math.floor(activityCount / 2)))} different interactive types (order, match, sort, fillblank, multi, numberline${subject === 'english' || subject === 'languages' ? ', speak' : ''}${['maths', 'science', 'geography', 'art'].includes(subject) ? ', draw' : ''}) alongside mcq/numeric/short. At most one writing and one draw task.` : ' Use mcq, truefalse, numeric and short answers (at most one writing task).'}
- mcq "answer" is the 0-based index; multi "answers" lists all correct indices. Options must be unambiguous.
- order: 3–6 items in the CORRECT order. match: 3–6 pairs. sort: 2–3 categories and 4–8 items. fillblank: wrap each missing word in [[double brackets]]; 2–5 blanks; include a word bank (bank: true) for younger learners.
- numberline: answer must sit on the step grid between min and max; give helpful labels.
- QUALITY: every question must make sense on its own and have exactly ONE clearly correct answer. Never ask about "the 7" in a number where 7 appears more than once (use numbers whose digits are all different, or name the position, e.g. "the digit in the hundreds place"). Numeric answers must be a single plain number (say the unit in the question). No trick questions. Double-check every answer key — children only get one or two tries.
- Every activity tests ONE skill. Use only these skill ids: ${SKILL_LIST}.
- ${withImages ? 'Add "imagePrompt" to 1–3 sections where a picture really helps (diagrams of real things, scenes, animals, places). ' : 'Do not include imagePrompt fields. '}Questions must never depend on a picture.
- Difficulty: ${difficulty}.`;
  const user = `${childLine(child)}
Subject: ${subj}. Topic: ${topic}. Lesson length: about ${durationMins} minutes.
${focusSkills.length ? `Focus skills: ${focusSkills.join(', ')}.` : ''}
${mistakes.length ? `This is a BRIDGING lesson to close a learning gap. Recent mistakes the child made:\n${mistakes.slice(0, 12).map(m => `- Q: ${m.prompt} | child answered: ${m.response} | correct: ${m.correct}`).join('\n')}\nDiagnose the likely misconception, re-teach it a different way from scratch with concrete examples, then practise with gentle steps.` : ''}
${notes ? `Extra instructions from the parent: ${notes}` : ''}`;
  onStage && onStage('Writing the lesson…');
  const lesson = await completeJSON({ task: 'lessons', maxTokens: 8000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  const out = normaliseLesson(lesson, { subject, durationMins });
  if (check) { onStage && onStage('Double-checking every question…'); await checkActivities(out, child); }
  return out;
}

/**
 * Second AI pass: a strict "question checker" that fixes ambiguous wording, wrong answer keys and
 * questions that don't make sense (e.g. "the value of the 7 in 7,758"). Mutates lesson.activities in place.
 * Never throws — if the check fails, the original questions are kept.
 */
export async function checkActivities(lesson, child) {
  if (!lesson.activities?.length) return lesson;
  try {
    const strip = a => { const { id, imageId, ...rest } = a; return rest; };
    const r = await completeJSON({
      task: 'analysis', maxTokens: 6000, temperature: 0.1,
      messages: [
        { role: 'system', content: `You are a meticulous UK primary-school quality checker. Check EVERY activity for a child (${childLine(child)}):
1. Exactly one clearly correct answer; the answer key is mathematically/factually right.
2. No ambiguity — e.g. asking for "the value of the 7" in 7,758 is ambiguous because 7 appears twice; fix it by changing the number so every digit is different, or by naming the position.
3. Wording is clear and age-appropriate; the question makes sense on its own without a picture.
4. numeric answers are a single plain number; mcq/multi options are distinct with the right indexes; order items have one sensible order; match pairs are one-to-one; sort items clearly belong to one group; fill-the-gap blanks have one obvious word; numberline answers lie between min and max on the step grid.
Fix any problem with the smallest change. Return ONLY JSON: {"activities":[the full list, same order, same shapes and fields],"changes":["one short note per fix (empty if none)"]}` },
        { role: 'user', content: JSON.stringify({ lesson: lesson.title, activities: lesson.activities.map(strip) }) },
      ],
    });
    const fixed = (r.activities || []).map(a => normaliseActivity(a));
    if (fixed.length === lesson.activities.length && fixed.every(Boolean)) {
      lesson.activities = fixed.map((a, i) => ({ ...a, id: lesson.activities[i].id, ...(lesson.activities[i].imageId ? { imageId: lesson.activities[i].imageId } : {}), skill: a.skill && a.skill !== 'general.other' ? a.skill : lesson.activities[i].skill }));
      lesson.qualityCheck = { at: Date.now(), changes: (r.changes || []).filter(Boolean).slice(0, 12) };
    }
  } catch (e) { console.warn('quality check skipped', e); }
  return lesson;
}

const rid = p => p + Math.random().toString(36).slice(2, 9);
export function normaliseActivity(a, fixSkill = x => x) {
  const act = { id: a.id || rid('a'), type: a.type || 'short', prompt: a.prompt || '', skill: fixSkill(a.skill), hint: a.hint || '', explanation: a.explanation || '' };
  if (a.imageId) act.imageId = a.imageId;
  const arr = x => (Array.isArray(x) ? x : []);
  switch (act.type) {
    case 'truefalse': act.type = 'mcq'; act.options = ['True', 'False']; act.answer = (a.answer === true || String(a.answer).toLowerCase() === 'true' || a.answer === 0) ? 0 : 1; break;
    case 'mcq': act.options = arr(a.options).map(String); act.answer = Math.min(Number(a.answer) || 0, Math.max(0, act.options.length - 1)); break;
    case 'multi': act.options = arr(a.options).map(String); act.answers = arr(a.answers).map(Number).filter(n => n >= 0 && n < act.options.length); if (!act.answers.length) act.answers = [0]; break;
    case 'numeric': act.answer = parseFloat(String(a.answer).replace(/[^0-9.\-]/g, '')); act.unit = a.unit || ''; if (a.tolerance) act.tolerance = +a.tolerance; break;
    case 'short': act.answer = String(a.answer ?? ''); act.accept = arr(a.accept).map(String); break;
    case 'writing': act.rubric = a.rubric || ''; act.minWords = +a.minWords || 20; break;
    case 'order': act.items = arr(a.items).map(String).filter(Boolean); break;
    case 'match': act.pairs = arr(a.pairs).filter(p => Array.isArray(p) && p.length >= 2).map(p => [String(p[0]), String(p[1])]); break;
    case 'sort': act.categories = arr(a.categories).map(String); act.items = arr(a.items).map(i => ({ text: String(i.text ?? i), cat: String(i.cat ?? act.categories[0]) })).filter(i => act.categories.includes(i.cat)); break;
    case 'fillblank': act.text = String(a.text || ''); act.bank = a.bank !== false; act.distractors = arr(a.distractors).map(String); break;
    case 'numberline': act.min = +a.min || 0; act.max = a.max != null ? +a.max : 10; act.step = +a.step || (act.max - act.min) / 20; act.answer = +a.answer; act.labels = arr(a.labels).map(String); if (a.tickEvery) act.tickEvery = +a.tickEvery; if (a.tolerance != null) act.tolerance = +a.tolerance; break;
    case 'draw': act.rubric = a.rubric || ''; break;
    case 'speak': act.target = String(a.target || a.answer || ''); break;
    default: act.type = 'short'; act.answer = String(a.answer ?? ''); act.accept = [];
  }
  // drop broken interactive items rather than showing an unusable question
  const broken = (act.type === 'order' && act.items.length < 2) || (act.type === 'match' && act.pairs.length < 2) || (act.type === 'sort' && act.items.length < 2) || (act.type === 'fillblank' && !/\[\[.+?\]\]/.test(act.text)) || (['mcq', 'multi'].includes(act.type) && act.options.length < 2) || (act.type === 'numberline' && (isNaN(act.answer) || act.max <= act.min)) || (act.type === 'speak' && !act.target);
  return broken ? null : act;
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
    coverImagePrompt: l.coverImagePrompt || '',
    sections: (l.sections || []).map((x, i) => {
      const sec = { id: rid('s'), type: ['text', 'fact', 'flashcards'].includes(x.type) ? x.type : 'text', title: x.title || `Part ${i + 1}`, body: x.body || '' };
      if (x.imagePrompt) sec.imagePrompt = x.imagePrompt;
      if (sec.type === 'flashcards') sec.cards = (x.cards || []).filter(c => c && c.front).map(c => ({ front: String(c.front), back: String(c.back || '') }));
      return sec;
    }),
    activities: (l.activities || []).map(a => normaliseActivity(a, fixSkill)).filter(Boolean),
    offlineActivity: l.offlineActivity || '',
    parentNotes: l.parentNotes || '',
  };
  lesson.skills = [...new Set([...(l.skills || []).map(fixSkill), ...lesson.activities.map(a => a.skill)])];
  return lesson;
}

export async function generateActivities({ lesson, type, count = 1, skill, child, like }) {
  const s = await store.settings();
  const valid = new Set(Object.keys(SKILLS));
  const r = await completeJSON({
    task: 'lessons', maxTokens: 2500, temperature: 0.8,
    messages: [
      { role: 'system', content: `You write activities for a UK primary home-school lesson (${s.curriculum}), British English, for a reading age of 7–9. Return ONLY JSON: {"activities":[...]} using these shapes:${ACTIVITY_SCHEMA}\nUse only these skill ids: ${SKILL_LIST}. Answers must be unambiguous and correct.` },
      { role: 'user', content: `${childLine(child)}\nLesson: ${lesson.title} (${lesson.topic || lesson.subject}).\nWhat the lesson teaches:\n${(lesson.sections || []).map(x => `- ${x.title}: ${String(x.body || '').slice(0, 300)}`).join('\n')}\n${like ? `Write ${count} NEW activity of type "${like.type}" testing the same skill as this one, but with different content (don't repeat it):\n${JSON.stringify(like)}` : `Write ${count} new ${type === 'mix' ? 'activities of different interactive types' : `"${type}" activities`}${skill ? ` testing ${skill}` : ''}, different from these existing ones: ${(lesson.activities || []).map(a => a.prompt).join(' | ').slice(0, 1500)}`}` },
    ],
  });
  const fix = sk => (valid.has(sk) ? sk : skill || like?.skill || lesson.skills?.[0] || 'general.other');
  const acts = (r.activities || (r.type ? [r] : [])).map(a => normaliseActivity(a, fix)).filter(Boolean);
  const tmp = { title: lesson.title, activities: acts };
  await checkActivities(tmp, child);
  return tmp.activities;
}

export async function adaptLesson({ lesson, child, direction, notes = '' }) {
  const s = await store.settings();
  const howTo = { easier: 'Make it EASIER: simpler language, smaller numbers, more worked examples, more scaffolding and hints, word banks.', harder: 'Make it HARDER: a stretch — bigger numbers, multi-step problems, reasoning and "explain why" questions.', personal: 'Keep the level but PERSONALISE it heavily to the learner\'s interests and notes.', shorter: 'Make a SHORTER 15-minute version with the key ideas and 4 activities.' }[direction] || '';
  const r = await completeJSON({
    task: 'lessons', maxTokens: 8000, temperature: 0.7,
    messages: [
      { role: 'system', content: `You adapt home-school lessons for UK primary children (${s.curriculum}), British English. Return ONLY the complete adapted lesson as JSON in exactly the same shape as the input (title, subject, topic, yearGroup, durationMins, objectives, skills, coverImagePrompt, intro, sections, activities, offlineActivity, parentNotes). Activity shapes:${ACTIVITY_SCHEMA}\nUse only these skill ids: ${SKILL_LIST}.` },
      { role: 'user', content: `${childLine(child)}\n${howTo}\n${notes ? 'Parent notes: ' + notes : ''}\n\nOriginal lesson JSON:\n${JSON.stringify({ ...lesson, id: undefined, createdAt: undefined, updatedAt: undefined }).slice(0, 14000)}` },
    ],
  });
  const out = normaliseLesson(r, { subject: lesson.subject, durationMins: lesson.durationMins });
  await checkActivities(out, child);
  // keep existing pictures where sections line up
  out.coverImageId = lesson.coverImageId;
  out.sections.forEach((sec, i) => { const old = lesson.sections[i]; if (old?.imageId && !sec.imageId) sec.imageId = old.imageId; });
  return out;
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
  return `You are ${name}, a friendly, patient learning buddy for ${child.name}${child.gender ? ` (a ${child.gender})` : ''}, aged ${child.age || 8} (UK, ${child.yearGroup || 'Year 3'})${child.interests ? `, who loves ${child.interests}` : ''}. You live inside their home-school computer.

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
