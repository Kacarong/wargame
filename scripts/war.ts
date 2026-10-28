import { readFileSync } from 'node:fs';
import { setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import { step } from '../src/sim/tick';
import { declareWar, occupiedShare, DEBUG } from '../src/sim/military';
import { fmtDate } from '../src/sim/util';
const meta = JSON.parse(readFileSync('public/data/provinces.json', 'utf8'));
setWorld({ provinces: meta.provinces, countries: meta.countries });
const s = newGame(process.argv[2] ?? 'JPN');
if (process.argv[3]) declareWar(s, process.argv[3], process.argv[4], false);
const days = +(process.argv[5] ?? 180);
for (let i = 0; i < days; i++) {
  step(s);
  if (i % 30 === 0) console.log(fmtDate(s.day), 'UKR occ', occupiedShare(s, 'UKR').toFixed(2), 'KOR occ', occupiedShare(s, 'KOR').toFixed(2), 'PRK occ', occupiedShare(s, 'PRK').toFixed(2), 'battles', s.battles.length, JSON.stringify(DEBUG), 'UKR divs', Object.values(s.divisions).filter(d=>d.owner==='UKR').length, 'RUS', Object.values(s.divisions).filter(d=>d.owner==='RUS').length);
}
for (const l of s.log.filter((l) => l.important)) console.log(fmtDate(l.day), l.text);
const p = s.countries.PRK; console.log('PRK', p.baseGrowth, p.stats.growth, p.stats.resAvail, p.laws, p.mobilization, p.tax, p.baseTax, p.debt/p.gdp, p.stability);
import { frontProvinces } from '../src/sim/ai';
import { prov } from '../src/sim/world';
const f = frontProvinces(s, 'UKR');
console.log('UKR front', f.map((x) => `${prov(x.prov).name}(${x.pressure}):${Object.values(s.divisions).filter((d) => d.prov === x.prov && d.owner === 'UKR').length}`).join(' '));
console.log('UKR div locations', Object.values(s.divisions).filter((d) => d.owner === 'UKR').map((d) => prov(d.prov).name + (d.path.length ? '>' + prov(d.path[d.path.length-1]).name : '')).join(', '));
