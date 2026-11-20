// Subject & skill taxonomy (aligned to the KS2 National Curriculum for England)
// and the mastery model used for progress tracking and gap detection.

export const SUBJECTS = [
  { id: 'maths', name: 'Maths', icon: '🔢', color: '#4dabf7' },
  { id: 'english', name: 'English', icon: '📚', color: '#f783ac' },
  { id: 'science', name: 'Science', icon: '🔬', color: '#51cf66' },
  { id: 'history', name: 'History', icon: '🏰', color: '#ffa94d' },
  { id: 'geography', name: 'Geography', icon: '🌍', color: '#20c997' },
  { id: 'computing', name: 'Computing', icon: '💻', color: '#748ffc' },
  { id: 'art', name: 'Art & Design', icon: '🎨', color: '#ff6b6b' },
  { id: 'dt', name: 'Design & Technology', icon: '🛠️', color: '#a9a9a9' },
  { id: 'music', name: 'Music', icon: '🎵', color: '#b197fc' },
  { id: 'languages', name: 'French', icon: '🇫🇷', color: '#339af0' },
  { id: 'pshe', name: 'PSHE & Wellbeing', icon: '💛', color: '#fcc419' },
  { id: 're', name: 'RE', icon: '🕊️', color: '#94d82d' },
  { id: 'pe', name: 'PE', icon: '🤸', color: '#ff8787' },
  { id: 'general', name: 'General', icon: '⭐', color: '#868e96' },
];
export const subject = id => SUBJECTS.find(s => s.id === id) || SUBJECTS[SUBJECTS.length - 1];

export const SKILLS = {
  'maths.place-value': 'Place value & number',
  'maths.addition-subtraction': 'Addition & subtraction',
  'maths.times-tables': 'Times tables',
  'maths.multiplication-division': 'Multiplication & division',
  'maths.mental-maths': 'Mental maths',
  'maths.fractions': 'Fractions',
  'maths.decimals': 'Decimals',
  'maths.measurement': 'Measurement',
  'maths.money': 'Money',
  'maths.time': 'Telling the time',
  'maths.geometry': 'Shape & geometry',
  'maths.position-direction': 'Position & direction',
  'maths.statistics': 'Statistics & graphs',
  'maths.problem-solving': 'Word problems & reasoning',
  'english.spelling': 'Spelling',
  'english.phonics': 'Phonics & word reading',
  'english.reading-comprehension': 'Reading comprehension',
  'english.vocabulary': 'Vocabulary',
  'english.grammar': 'Grammar',
  'english.punctuation': 'Punctuation',
  'english.writing-composition': 'Writing composition',
  'english.poetry': 'Poetry',
  'science.living-things': 'Living things & habitats',
  'science.animals-humans': 'Animals including humans',
  'science.plants': 'Plants',
  'science.rocks-soils': 'Rocks, fossils & soils',
  'science.light': 'Light & shadows',
  'science.forces-magnets': 'Forces & magnets',
  'science.states-of-matter': 'States of matter',
  'science.sound': 'Sound',
  'science.electricity': 'Electricity',
  'science.earth-space': 'Earth & space',
  'science.working-scientifically': 'Working scientifically',
  'history.chronology': 'Chronology & timelines',
  'history.prehistoric-britain': 'Stone Age to Iron Age',
  'history.ancient-civilisations': 'Ancient civilisations',
  'history.romans-anglo-saxons-vikings': 'Romans, Anglo-Saxons & Vikings',
  'history.local-british': 'Local & British history',
  'history.sources': 'Using historical sources',
  'geography.locational': 'Places & locations',
  'geography.maps': 'Maps, grid refs & compass',
  'geography.physical': 'Physical geography',
  'geography.human': 'Human geography',
  'computing.algorithms': 'Algorithms & coding',
  'computing.digital-literacy': 'Using computers',
  'computing.online-safety': 'Online safety',
  'art.skills': 'Art techniques & artists',
  'dt.skills': 'Design & making',
  'music.skills': 'Music',
  'languages.french': 'French',
  'pshe.wellbeing': 'Feelings & wellbeing',
  'pshe.relationships': 'Friendships & relationships',
  're.beliefs': 'Beliefs & festivals',
  'pe.skills': 'Physical activity',
  'general.other': 'Other',
};
export const skillName = id => SKILLS[id] || (id ? id.split('.').pop().replace(/-/g, ' ') : 'Other');
export const skillSubject = id => (id || 'general').split('.')[0];

// Year 3/4 statutory spelling list (National Curriculum, England)
export const Y34_WORDS = 'accident accidentally actual actually address answer appear arrive believe bicycle breath breathe build busy business calendar caught centre century certain circle complete consider continue decide describe different difficult disappear early earth eight eighth enough exercise experience experiment extreme famous favourite February forward forwards fruit grammar group guard guide heard heart height history imagine increase important interest island knowledge learn length library material medicine mention minute natural naughty notice occasion occasionally often opposite ordinary particular peculiar perhaps popular position possess possession possible potatoes pressure probably promise purpose quarter question recent regular reign remember sentence separate special straight strange strength suppose surprise therefore though although thought through various weight woman women'.split(' ');

/**
 * Evidence records look like { skill, score (0–1), weight (default 1), ts }.
 * Mastery is a recency-weighted average (half-life 30 days).
 */
export function computeMastery(evidence) {
  const now = Date.now();
  const by = {};
  for (const e of evidence) {
    if (!e.skill) continue;
    const b = by[e.skill] ||= { skill: e.skill, subject: skillSubject(e.skill), n: 0, w: 0, s: 0, last: 0, items: [] };
    const wt = (e.weight || 1) * Math.pow(0.5, (now - e.ts) / (30 * 86400000));
    b.w += wt; b.s += wt * e.score; b.n += e.weight || 1; b.last = Math.max(b.last, e.ts);
    b.items.push(e);
  }
  return Object.values(by).map(b => {
    const items = b.items.sort((a, c) => a.ts - c.ts);
    const avg = arr => arr.length ? arr.reduce((t, x) => t + x.score, 0) / arr.length : null;
    const recent = avg(items.slice(-5)), before = avg(items.slice(-10, -5));
    const mastery = b.w ? b.s / b.w : 0;
    return {
      skill: b.skill, subject: b.subject, name: skillName(b.skill), mastery, n: Math.round(b.n), last: b.last,
      trend: recent != null && before != null ? recent - before : 0,
      status: b.n < 3 ? 'new' : mastery >= 0.85 ? 'secure' : mastery >= 0.65 ? 'developing' : 'needs-help',
    };
  }).sort((a, c) => a.mastery - c.mastery);
}

export const STATUS_LABEL = { new: 'Getting started', secure: 'Secure', developing: 'Developing', 'needs-help': 'Needs help' };

export function subjectMastery(mastery) {
  const by = {};
  for (const m of mastery) { const b = by[m.subject] ||= { subject: m.subject, s: 0, n: 0 }; b.s += m.mastery * m.n; b.n += m.n; }
  return Object.values(by).map(b => ({ subject: b.subject, mastery: b.n ? b.s / b.n : 0, n: b.n })).sort((a, b) => b.n - a.n);
}

export function gapsFrom(mastery) {
  return mastery.filter(m => m.n >= 3 && m.mastery < 0.65);
}
