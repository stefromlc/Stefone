// Data helpers for the parent dashboard.
import { store } from '../store.js';
import { computeMastery, gapsFrom } from '../skills.js';
import { today, addDays, localDate } from '../util.js';

export async function lessonsMap() {
  const ls = await store.list('lessons');
  return Object.fromEntries(ls.map(l => [l.id, l]));
}

export async function childData(childId) {
  const [assignments, evidence, practice, timelog, activity, chats, docs] = await Promise.all([
    store.list('assignments', { childId }), store.list('evidence', { childId }), store.list('practice', { childId }),
    store.list('timelog', { childId }), store.list('activity', { childId }), store.list('chats', { childId }), store.list('documents', { childId }),
  ]);
  const mastery = computeMastery(evidence);
  return { assignments, evidence, practice, timelog, activity, chats, docs, mastery, gaps: gapsFrom(mastery) };
}

export function summarise(d, days = 7) {
  const since = addDays(today(), -(days - 1));
  const sinceTs = new Date(since + 'T00:00:00').getTime();
  const due = d.assignments.filter(a => a.date >= since && a.date <= today());
  const done = d.assignments.filter(a => a.completedAt && a.completedAt >= sinceTs);
  const scored = done.filter(a => a.score != null);
  const timeSec = d.timelog.filter(t => t.date >= since).reduce((s, t) => s + t.seconds, 0);
  const todayTime = d.timelog.find(t => t.date === today())?.seconds || 0;
  return {
    due: due.length, doneOfDue: due.filter(a => a.completedAt).length, completed: done.length,
    avgScore: scored.length ? scored.reduce((s, a) => s + a.score, 0) / scored.length : null,
    timeSec, todayTime, practiceRounds: d.practice.filter(p => p.ts >= sinceTs).length,
  };
}

export function recentMistakes(evidence, skill) {
  return evidence.filter(e => e.score < 0.7 && (!skill || e.skill === skill) && e.prompt)
    .sort((a, b) => b.ts - a.ts)
    .map(e => ({ skill: e.skill, prompt: e.prompt, response: e.response, correct: e.correct }));
}

export function dailySeries(items, days, valueFn, dateFn) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today(), -i);
    out.push({ d, v: valueFn(items.filter(x => dateFn(x) === d)) });
  }
  return out;
}
export const tsDate = ts => localDate(new Date(ts));
