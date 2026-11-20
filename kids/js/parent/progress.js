// Progress, mastery by skill, learning gaps and AI gap analysis.
import { store } from '../store.js';
import { h, esc, toast, modal, pct, fmtDuration, fmtDate, timeAgo, md, uid, today, addDays } from '../util.js';
import { subject, skillName, STATUS_LABEL, subjectMastery } from '../skills.js';
import { analyseGaps, aiReady } from '../ai.js';
import { header, go, state, kidById } from './shell.js';
import { childData, summarise, recentMistakes, dailySeries, tsDate, lessonsMap } from './data.js';
import { barChart, lineChart, masteryColor } from './charts.js';
import { stat } from './overview.js';
import { computeRewards } from '../apps/stars.js';

export async function render(main) {
  header(main, '📈 Progress & gaps', { kidSwitch: true });
  const kid = kidById(state.kidId);
  if (!kid) return main.append(h('div', { class: 'card empty' }, 'No children yet.'));
  const d = await childData(kid.id);
  const s30 = summarise(d, 30);
  const rw = await computeRewards(kid.id);
  const L = await lessonsMap();

  main.append(h('div', { class: 'card' }, h('div', { class: 'stats-row', style: { gridTemplateColumns: 'repeat(5,1fr)' } },
    stat(s30.completed, 'Lessons (30 days)'), stat(pct(s30.avgScore), 'Avg score (30 days)'), stat(fmtDuration(s30.timeSec), 'Learning time (30 days)'), stat(s30.practiceRounds, 'Practice rounds'), stat(`⭐ ${rw.stars}`, `🔥 ${rw.streak}-day streak`))));

  // charts
  const scored = d.assignments.filter(a => a.completedAt && a.score != null).sort((a, b) => a.completedAt - b.completedAt).slice(-20);
  const time14 = dailySeries(d.timelog, 14, xs => xs.reduce((t, x) => t + x.seconds, 0) / 60, x => x.date).map(x => ({ ...x, short: fmtDate(x.d, { weekday: 'narrow' }), label: fmtDate(x.d) }));
  main.append(h('div', { class: 'grid2', style: { marginTop: '14px' } },
    h('div', { class: 'card' }, h('h3', {}, 'Lesson scores (last 20)'), h('div', { html: lineChart(scored.map(a => ({ v: a.score, label: `${L[a.lessonId]?.title || 'Lesson'} · ${fmtDate(a.completedAt)}` }))) })),
    h('div', { class: 'card' }, h('h3', {}, 'Minutes on the computer (last 14 days)'), h('div', { html: barChart(time14, { fmt: v => Math.round(v) + ' min', color: kid.color || '#5b5bd6' }) }))));

  // subject mastery
  const subj = subjectMastery(d.mastery);
  const subjCard = h('div', { class: 'card' }, h('h3', {}, 'By subject'));
  if (!subj.length) subjCard.append(h('p', { class: 'muted' }, 'No answers recorded yet. Mastery appears after a few lessons or practice rounds.'));
  subj.forEach(x => { const sj = subject(x.subject); subjCard.append(h('div', { style: { margin: '10px 0' } }, h('div', { class: 'row' }, h('b', { style: { flex: 1 } }, `${sj.icon} ${sj.name}`), h('span', { class: 'small muted' }, `${x.n} answers`), h('b', {}, pct(x.mastery))), h('div', { class: 'bar' }, h('i', { style: { width: pct(x.mastery), background: masteryColor(x.mastery) } })))); });

  // gaps
  const gapCard = h('div', { class: 'card' }, h('h3', {}, '⚠️ Learning gaps'));
  if (!d.gaps.length) gapCard.append(h('p', { class: 'muted' }, d.mastery.length ? `No gaps detected — ${kid.name} is doing well! Skills below 65% (with 3+ answers) will show here.` : 'Gaps appear once there is enough evidence (3+ answers on a skill).'));
  d.gaps.forEach(g => gapCard.append(h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } },
    h('div', { style: { flex: 1 } }, h('b', {}, skillName(g.skill)), h('div', { class: 'small muted' }, `${g.n} answers · last ${timeAgo(g.last)}`)), h('span', { class: 'pill bad' }, pct(g.mastery)),
    h('button', { class: 'btn btn-sm', onclick: () => showMistakes(kid, d, g.skill) }, 'Mistakes'),
    h('button', { class: 'btn btn-sm btn-ai', onclick: () => go('lessons', `bridge:${kid.id}:${g.skill}`) }, '✨ Bridge it'))));
  main.append(h('div', { class: 'grid2', style: { marginTop: '14px' } }, subjCard, gapCard));

  // AI analysis
  const aiCard = h('div', { class: 'card ai-box', style: { marginTop: '14px' } });
  main.append(aiCard);
  const analyses = (await store.list('analyses', { childId: kid.id })).sort((a, b) => b.ts - a.ts);
  const drawAI = an => {
    aiCard.innerHTML = '';
    aiCard.append(h('div', { class: 'row' }, h('h3', { style: { margin: 0, flex: 1 } }, '🔍 AI learning analysis'), an ? h('span', { class: 'small muted' }, `Last run ${timeAgo(an.ts)}`) : null, h('button', { class: 'btn btn-ai', onclick: run }, an ? '↻ Run again' : '✨ Analyse now')));
    if (!an) { aiCard.append(h('p', { class: 'muted' }, `The AI looks at every answer ${kid.name} has given — especially the wrong ones — to find patterns and misconceptions, then suggests bridging lessons.`)); return; }
    const r = an.result;
    aiCard.append(h('div', { class: 'md', html: md(r.summary || '') }));
    if (r.strengths?.length) aiCard.append(h('h4', {}, '💪 Strengths'), h('ul', {}, ...r.strengths.map(x => h('li', {}, x))));
    if (r.gaps?.length) {
      aiCard.append(h('h4', {}, '🌉 Gaps & how to bridge them'));
      r.gaps.forEach(g => aiCard.append(h('div', { class: 'card', style: { margin: '8px 0' } },
        h('div', { class: 'row' }, h('b', { style: { flex: 1 } }, g.title || skillName(g.skill)), h('span', { class: `pill ${g.priority === 'high' ? 'bad' : g.priority === 'medium' ? 'warn' : ''}` }, g.priority || ''),
          h('button', { class: 'btn btn-sm btn-ai', onclick: () => go('lessons', `bridge:${kid.id}:${g.skill}:${g.lessonTopic || g.title || ''}`) }, '✨ Create bridging lesson')),
        g.evidence ? h('p', { class: 'small' }, h('b', {}, 'Evidence: '), g.evidence) : null,
        g.misconception ? h('p', { class: 'small' }, h('b', {}, 'Likely misconception: '), g.misconception) : null,
        g.plan ? h('p', { class: 'small' }, h('b', {}, 'Plan: '), g.plan) : null)));
    }
    if (r.nextSteps?.length) aiCard.append(h('h4', {}, '➡️ Next steps'), h('ul', {}, ...r.nextSteps.map(x => h('li', {}, x))));
    if (r.encouragement) aiCard.append(h('div', { class: 'alert info' }, '💌', h('div', {}, h('b', {}, `To share with ${kid.name}: `), r.encouragement)));
  };
  async function run() {
    if (!(await aiReady())) return toast('Connect AI first (Settings → AI)', 'warn');
    aiCard.querySelector('.btn-ai').disabled = true;
    aiCard.append(h('p', {}, h('span', { class: 'spinner' }), ' Analysing… (about 20–40 seconds)'));
    try {
      const spellingMisses = d.practice.filter(p => p.kind === 'spelling').flatMap(p => (p.missed || []).map(m => `${m.a} (wrote "${m.given}")`));
      const result = await analyseGaps({ child: kid, mastery: d.mastery, mistakes: recentMistakes(d.evidence), spellingMisses, stats: { lessonsLast30Days: s30.completed, avgScore: s30.avgScore, minutesLast30Days: Math.round(s30.timeSec / 60) } });
      const an = { id: uid('an_'), childId: kid.id, ts: Date.now(), result, by: state.me.name };
      await store.put('analyses', an);
      drawAI(an);
    } catch (e) { toast(e.message, 'error'); drawAI(analyses[0]); }
  }
  drawAI(analyses[0]);

  // skills table
  const tbl = h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'All skills'));
  if (!d.mastery.length) tbl.append(h('p', { class: 'muted' }, 'Nothing yet.'));
  [...d.mastery].sort((a, b) => a.subject.localeCompare(b.subject) || a.mastery - b.mastery).forEach(m => tbl.append(h('div', { class: 'skill-row' },
    h('div', {}, h('b', {}, `${subject(m.subject).icon} ${m.name}`), h('div', { class: 'small muted' }, `${m.n} answers · ${timeAgo(m.last)}${m.trend > 0.05 ? ' · 📈 improving' : m.trend < -0.05 ? ' · 📉 dipping' : ''}`)),
    h('div', { class: 'bar' }, h('i', { style: { width: pct(m.mastery), background: masteryColor(m.mastery) } })),
    h('b', {}, pct(m.mastery)),
    h('span', { class: `pill st ${m.status === 'secure' ? 'good' : m.status === 'developing' ? 'warn' : m.status === 'needs-help' ? 'bad' : ''}`, style: { cursor: 'pointer' }, onclick: () => showMistakes(kid, d, m.skill) }, STATUS_LABEL[m.status]))));
  main.append(tbl);

  // spelling
  const misses = {};
  d.practice.filter(p => p.kind === 'spelling').forEach(p => (p.missed || []).forEach(m => { misses[m.a] = (misses[m.a] || 0) + 1; }));
  const words = Object.entries(misses).sort((a, b) => b[1] - a[1]);
  if (words.length) main.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, '🔤 Tricky spellings'), h('div', { class: 'row wrap' }, ...words.slice(0, 40).map(([w, n]) => h('span', { class: 'pill warn' }, `${w}${n > 1 ? ` ×${n}` : ''}`))),
    h('p', { class: 'small muted' }, `${kid.name} can practise these in Practice → “My tricky words”.`)));
}

function showMistakes(kid, d, skill) {
  const items = d.evidence.filter(e => e.skill === skill).sort((a, b) => b.ts - a.ts);
  modal({
    title: `${kid.name} · ${skillName(skill)}`, wide: true,
    body: items.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['When', 'Question', 'Answer', 'Correct answer', 'Score'].map(t => h('th', {}, t)))),
      h('tbody', {}, ...items.slice(0, 60).map(e => h('tr', {}, h('td', { class: 'small' }, fmtDate(e.ts)), h('td', { class: 'small' }, e.prompt || ''), h('td', { class: 'small' }, e.response ?? ''), h('td', { class: 'small' }, e.score < 1 ? (e.correct || '') : ''), h('td', {}, h('span', { class: `pill ${e.score >= 0.7 ? 'good' : 'bad'}` }, pct(e.score)))))))
      : h('p', {}, 'No answers recorded.'),
    actions: [{ label: '✨ Create bridging lesson', cls: 'btn-ai', onClick: () => go('lessons', `bridge:${kid.id}:${skill}`) }, { label: 'Close' }],
  });
}
