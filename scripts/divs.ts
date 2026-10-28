import { readFileSync } from 'node:fs';
import { setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import { divStats } from '../src/sim/military';
const meta = JSON.parse(readFileSync('public/data/provinces.json', 'utf8'));
setWorld({ provinces: meta.provinces, countries: meta.countries });
const s = newGame('JPN');
for (const t of (process.argv[2] ?? 'RUS,UKR,KOR,PRK,USA,CHN').split(',')) {
  const ds = Object.values(s.divisions).filter((d) => d.owner === t);
  const agg = { soft: 0, hard: 0, def: 0, fill: 0, men: 0 };
  for (const d of ds) { const st = divStats(d); agg.soft += st.soft; agg.hard += st.hard; agg.def += st.def; agg.fill += st.fill / ds.length; agg.men += d.men; }
  console.log(t, ds.length, Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, Math.round(k === 'fill' ? v * 100 : v)])), 'manpower', Math.round(s.countries[t].manpower));
  const d = ds[0]; const st = divStats(d); console.log('  e.g.', d.name, Math.round(st.soft), Math.round(st.hard), Math.round(st.def), Math.round(st.fill * 100) + '%', Object.entries(d.equip).map(([k, v]) => k + ':' + Math.round(v)).join(' '));
}
