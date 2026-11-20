// Reusable form for creating/editing a family member.
import { h, AVATARS, COLORS } from './util.js';
import { store } from './store.js';

export const YEAR_GROUPS = ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'];

export function profileForm(p = {}, { role = p.role || 'child', isNew = !p.id } = {}) {
  const cloud = store.mode === 'cloud';
  const kid = role === 'child';
  const state = { avatar: p.avatar || (kid ? AVATARS[Math.floor(Math.random() * 16)] : role === 'admin' ? '🧔' : '👩'), color: p.color || COLORS[Math.floor(Math.random() * COLORS.length)] };
  const inp = (name, attrs = {}) => h('input', { class: 'input', name, value: p[name] ?? '', ...attrs });
  const avPick = h('div', { class: 'av-pick' });
  AVATARS.forEach(a => avPick.append(h('button', { type: 'button', class: a === state.avatar ? 'on' : '', onclick: e => { state.avatar = a; avPick.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, a)));
  const colPick = h('div', { class: 'col-pick' });
  COLORS.forEach(c => colPick.append(h('button', { type: 'button', class: c === state.color ? 'on' : '', style: { background: c }, onclick: e => { state.color = c; colPick.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } })));
  const yg = h('select', { class: 'input', name: 'yearGroup' }, ...YEAR_GROUPS.map(y => h('option', { selected: (p.yearGroup || 'Year 3') === y }, y)));
  const secretLabel = kid ? 'Secret PIN (4–8 numbers)' : 'Password (8+ characters)';
  const el = h('div', { class: 'kid-row' },
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'Name'), inp('name', { placeholder: kid ? "Child's first name" : role === 'admin' ? 'Dad' : 'Mum', required: true })),
      cloud ? h('label', { class: 'field' }, h('span', {}, 'Login email'), inp('email', { type: 'email', placeholder: kid ? 'e.g. amy.kids@stefone.com (any address, no email is sent)' : 'you@example.com', disabled: !isNew }),
        h('span', { class: 'hint' }, kid ? 'Only used as a username — it does not need to be a real inbox.' : 'Used to sign in on new devices.')) : h('div'),
      isNew ? h('label', { class: 'field' }, h('span', {}, secretLabel), inp('secret', { type: kid ? 'tel' : 'password', inputmode: kid ? 'numeric' : null, autocomplete: 'new-password', value: '' })) : h('div'),
      kid ? h('label', { class: 'field' }, h('span', {}, 'Year group'), yg) : h('div'),
      kid ? h('label', { class: 'field' }, h('span', {}, 'Age'), inp('age', { type: 'number', min: 4, max: 12, value: p.age || 8 })) : null,
      kid ? h('label', { class: 'field' }, h('span', {}, 'Gender'), h('select', { class: 'input', name: 'gender' }, ...[['girl', '👧 Girl'], ['boy', '👦 Boy'], ['', 'Prefer not to say']].map(([v, l]) => h('option', { value: v, selected: (p.gender || '') === v }, l))), h('span', { class: 'hint' }, 'Used so lessons, stories and Ollie use the right words (he/she).')) : null,
      kid ? h('label', { class: 'field' }, h('span', {}, 'Loves / interests'), inp('interests', { placeholder: 'e.g. dinosaurs, football, Minecraft, space' }), h('span', { class: 'hint' }, 'The AI uses these to make lessons more fun.')) : null,
    ),
    kid ? h('label', { class: 'field' }, h('span', {}, 'Learning notes (only parents & AI see this)'), h('textarea', { class: 'input', name: 'learningNotes', rows: 2, placeholder: 'e.g. Confident reader, finds column subtraction tricky, prefers short tasks' }, p.learningNotes || '')) : null,
    h('div', { class: 'field' }, h('span', {}, 'Picture'), avPick),
    h('div', { class: 'field' }, h('span', {}, 'Colour'), colPick),
  );
  function read() {
    const v = n => el.querySelector(`[name="${n}"]`)?.value?.trim() ?? '';
    const out = { ...p, role, name: v('name'), avatar: state.avatar, color: state.color };
    if (cloud) out.email = (v('email') || p.email || '').toLowerCase();
    if (kid) Object.assign(out, { yearGroup: v('yearGroup'), age: +v('age') || 8, gender: v('gender'), interests: v('interests'), learningNotes: el.querySelector('[name="learningNotes"]').value.trim() });
    if (isNew) out.secret = v('secret');
    if (!out.name) throw new Error('Please enter a name');
    if (cloud && isNew && !/^\S+@\S+\.\S+$/.test(out.email)) throw new Error(`Please enter a login email for ${out.name}`);
    if (isNew) {
      if (kid && !/^\d{4,8}$/.test(out.secret)) throw new Error(`${out.name}'s PIN must be 4–8 numbers`);
      if (!kid && out.secret.length < 8) throw new Error(`${out.name}'s password must be at least 8 characters`);
    }
    return out;
  }
  return { el, read };
}
