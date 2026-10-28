import { readFileSync } from 'node:fs';
import { setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import * as dom from '../src/sim/domestic';
import * as mil from '../src/sim/military';
import * as ai from '../src/sim/ai';
const meta = JSON.parse(readFileSync('public/data/provinces.json', 'utf8'));
setWorld({ provinces: meta.provinces, countries: meta.countries });
const s = newGame('KOR');
const T: Record<string, number> = {};
const time = (k: string, f: () => void) => { const t = performance.now(); f(); T[k] = (T[k] ?? 0) + performance.now() - t; };
for (let d = 0; d < 120; d++) {
  s.day++;
  const wg = dom.worldGdp(s);
  const cs = Object.values(s.countries).filter((c) => c.alive);
  time('econ', () => { for (const c of cs) dom.economyTick(s, c, wg); });
  time('research', () => { for (const c of cs) dom.researchTick(s, c); });
  time('prod', () => { for (const c of cs) dom.productionTick(s, c); });
  time('bills', () => dom.billTick(s));
  time('military', () => mil.militaryTick(s));
  time('war', () => mil.warTick(s));
  time('aiwar', () => { for (const c of cs) { if (c.tag === s.player || !mil.warsOf(s, c.tag).length) continue; if (s.day % 7 === 0) ai.autoDeploy(s, c.tag); else if (s.day % 2 === 0) ai.aiAttack(s, c.tag); } });
  if (d % 30 === 0) time('monthly', () => { for (const c of cs) { dom.politicsMonthly(s, c); if (c.tag !== s.player) ai.aiMonthly(s, c); } });
}
console.log(Object.entries(T).map(([k, v]) => `${k}=${(v / 120).toFixed(2)}ms/day`).join(' '), 'divs', Object.keys(s.divisions).length);
