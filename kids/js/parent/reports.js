// Printable progress reports (also handy for home-education records / local authority reviews).
import { store } from '../store.js';
import { h, pct, fmtDate, fmtDuration, today, addDays, md } from '../util.js';
import { subject, skillName, STATUS_LABEL, subjectMastery, computeMastery, gapsFrom } from '../skills.js';
import { header, state, kidById } from './shell.js';
import { childData, lessonsMap } from './data.js';
import { masteryColor } from './charts.js';
import { computeRewards } from '../apps/stars.js';

export async function render(main) {
  header(main, '🖨️ Reports', { kidSwitch: true });
  const kid = kidById(state.kidId);
  if (!kid) return main.append(h('div', { class: 'card empty' }, 'No children yet.'));
  const from = h('input', { class: 'input', type: 'date', value: addDays(today(), -29), style: { maxWidth: '170px' } });
  const to = h('input', { class: 'input', type: 'date', value: today(), style: { maxWidth: '170px' } });
  const out = h('div');
  const presets = [['Last 7 days', 7], ['Last 30 days', 30], ['Last 90 days', 90], ['Last year', 365]];
  main.append(h('div', { class: 'card no-print' }, h('div', { class: 'row wrap' }, 'From', from, 'to', to, ...presets.map(([l, n]) => h('button', { class: 'btn btn-sm', onclick: () => { from.value = addDays(today(), -(n - 1)); to.value = today(); build(); } }, l)),
    h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', onclick: () => window.print() }, '🖨️ Print / Save as PDF'))), out);
  from.onchange = to.onchange = build;

  async function build() {
    const d = await childData(kid.id);
    const L = await lessonsMap();
    const f = new Date(from.value + 'T00:00:00').getTime(), t = new Date(to.value + 'T23:59:59').getTime();
    const done = d.assignments.filter(a => a.completedAt >= f && a.completedAt <= t).sort((a, b) => a.completedAt - b.completedAt);
    const scored = done.filter(a => a.score != null);
    const avg = scored.length ? scored.reduce((s, a) => s + a.score, 0) / scored.length : null;
    const mins = d.timelog.filter(x => x.date >= from.value && x.date <= to.value).reduce((s, x) => s + x.seconds, 0);
    const prac = d.practice.filter(p => p.ts >= f && p.ts <= t);
    const mastery = computeMastery(d.evidence.filter(e => e.ts <= t));
    const bySubj = {};
    done.forEach(a => { const l = L[a.lessonId]; if (!l) return; (bySubj[l.subject] ||= []).push({ a, l }); });
    const rw = await computeRewards(kid.id);
    const analysis = (await store.list('analyses', { childId: kid.id })).sort((a, b) => b.ts - a.ts)[0];
    out.innerHTML = '';
    out.append(h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'row' }, h('div', { style: { fontSize: '46px' } }, kid.avatar), h('div', { style: { flex: 1 } }, h('h2', { style: { margin: 0 } }, `${kid.name} — Learning report`), h('div', { class: 'muted' }, `${kid.yearGroup || ''} · ${fmtDate(from.value, { day: 'numeric', month: 'long', year: 'numeric' })} to ${fmtDate(to.value, { day: 'numeric', month: 'long', year: 'numeric' })}`))),
      h('div', { class: 'stats-row', style: { marginTop: '14px' } },
        st(done.length, 'Lessons completed'), st(pct(avg), 'Average score'), st(fmtDuration(mins), 'Time learning'), st(prac.length, 'Practice rounds')),
      h('h3', { style: { marginTop: '18px' } }, 'Subjects covered'),
      ...(Object.keys(bySubj).length ? Object.entries(bySubj).map(([s, items]) => h('div', { style: { marginBottom: '10px' } }, h('b', {}, `${subject(s).icon} ${subject(s).name} (${items.length})`),
        h('ul', { style: { margin: '4px 0' } }, ...items.map(({ a, l }) => h('li', {}, `${fmtDate(a.completedAt)} — ${l.title}${a.score != null ? ` (${pct(a.score)})` : ''}${a.parentComment ? ` — “${a.parentComment}”` : ''}`))))) : [h('p', { class: 'muted' }, 'No lessons completed in this period.')]),
      h('h3', { style: { marginTop: '18px' } }, 'Skills'),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Skill', 'Mastery', 'Answers', 'Status'].map(x => h('th', {}, x)))),
        h('tbody', {}, ...mastery.sort((a, b) => b.mastery - a.mastery).map(m => h('tr', {}, h('td', {}, `${subject(m.subject).icon} ${m.name}`), h('td', { style: { color: masteryColor(m.mastery), fontWeight: 800 } }, pct(m.mastery)), h('td', {}, m.n), h('td', {}, STATUS_LABEL[m.status]))))),
      gapsFrom(mastery).length ? h('div', {}, h('h3', { style: { marginTop: '18px' } }, 'Areas to work on'), h('ul', {}, ...gapsFrom(mastery).map(g => h('li', {}, `${g.name} — ${pct(g.mastery)}`)))) : null,
      analysis ? h('div', {}, h('h3', { style: { marginTop: '18px' } }, `AI analysis (${fmtDate(analysis.ts)})`), h('div', { class: 'md', html: md(analysis.result.summary || '') })) : null,
      h('h3', { style: { marginTop: '18px' } }, 'Achievements'),
      h('p', {}, `⭐ ${rw.stars} stars · 🔥 best current streak ${rw.streak} days · Badges: ${rw.badges.filter(b => b.got).map(b => `${b.e} ${b.name}`).join(', ') || 'none yet'}`),
      h('h3', { style: { marginTop: '18px' } }, 'Parent comments'),
      h('div', { contenteditable: 'true', style: { minHeight: '90px', border: '1px dashed var(--line)', borderRadius: '10px', padding: '10px' } }, '')));
  }
  const st = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  build();
}
