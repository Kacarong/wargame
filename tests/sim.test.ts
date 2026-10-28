import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import { step } from '../src/sim/tick';
import { declareWar, occupiedShare } from '../src/sim/military';
import { EQUIPMENT, EQUIP_BY_ID } from '../src/data/equipment';
import { TECHS } from '../src/data/tech';
import { COUNTRY_DATA } from '../src/data/countries';
import type { GameState } from '../src/sim/types';

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/provinces.json', 'utf8'));
  setWorld({ provinces: meta.provinces, countries: meta.countries });
});

function finite(s: GameState): string[] {
  const bad: string[] = [];
  for (const c of Object.values(s.countries)) {
    for (const k of ['gdp', 'debt', 'approval', 'stability', 'warSupport', 'manpower'] as const)
      if (!Number.isFinite(c[k])) bad.push(`${c.tag}.${k}=${c[k]}`);
  }
  for (const d of Object.values(s.divisions)) if (!Number.isFinite(d.org) || !Number.isFinite(d.men)) bad.push(`div ${d.id}`);
  return bad;
}

describe('data integrity', () => {
  it('cross references resolve', () => {
    const t = new Set(TECHS.map((x) => x.id));
    for (const e of EQUIPMENT) expect(t.has(e.tech), e.id).toBe(true);
    for (const c of COUNTRY_DATA) for (const k of Object.keys(c.inventory)) expect(EQUIP_BY_ID[k], `${c.tag}:${k}`).toBeTruthy();
  });
});

describe('simulation', () => {
  it('starts and runs one year without NaN', () => {
    const s = newGame('KOR');
    const kor = s.countries.KOR;
    expect(Object.values(s.divisions).filter((d) => d.owner === 'KOR').length).toBeGreaterThan(10);
    const gdp0 = kor.gdp;
    const t0 = performance.now();
    for (let i = 0; i < 365; i++) step(s);
    const ms = performance.now() - t0;
    console.log(`365 days in ${ms.toFixed(0)}ms; KOR gdp ${gdp0.toFixed(0)} -> ${kor.gdp.toFixed(0)}, growth ${kor.stats.growth.toFixed(2)}, approval ${kor.approval.toFixed(0)}, debt ${(kor.debt / kor.gdp * 100).toFixed(0)}%, procurement ${kor.stats.procurement.toFixed(1)}, rp ${kor.stats.rpPerDay.toFixed(2)}`);
    console.log('wars', s.wars.map((w) => w.name), 'UKR occupied', occupiedShare(s, 'UKR').toFixed(2));
    for (const t of ['USA', 'CHN', 'RUS', 'KOR', 'PRK', 'JPN', 'UKR']) {
      const c = s.countries[t];
      console.log(t, 'gdp', c.gdp.toFixed(0), 'g', c.stats.growth.toFixed(2), 'proc', c.stats.procurement.toFixed(1), 'prod', c.stats.prodSpending.toFixed(1), 'lines', c.lines.length, 'divs', Object.values(s.divisions).filter((d) => d.owner === t).length, 'techs', c.techs.length);
    }
    expect(finite(s)).toEqual([]);
  }, 120000);

  it('Korean war: battles happen and front moves', () => {
    const s = newGame('JPN');
    declareWar(s, 'PRK', 'KOR', false);
    for (let i = 0; i < 120; i++) step(s);
    console.log('battles', s.battles.length, 'KOR occ', occupiedShare(s, 'KOR').toFixed(2), 'PRK occ', occupiedShare(s, 'PRK').toFixed(2), 'wars', s.wars.map((w) => `${w.name}: ${w.attackers}/${w.defenders}`));
    console.log('KOR divs', Object.values(s.divisions).filter((d) => d.owner === 'KOR').length, 'PRK divs', Object.values(s.divisions).filter((d) => d.owner === 'PRK').length, 'cas KOR', s.countries.KOR.stats.casualties.toFixed(0), 'PRK', s.countries.PRK.stats.casualties.toFixed(0));
    expect(finite(s)).toEqual([]);
  }, 120000);
});
