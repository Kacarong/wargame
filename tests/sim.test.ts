import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { prov, setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import { step } from '../src/sim/tick';
import { declareWar, occupiedShare } from '../src/sim/military';
import { EQUIPMENT, EQUIP_BY_ID } from '../src/data/equipment';
import { TECHS } from '../src/data/tech';
import { COUNTRY_DATA } from '../src/data/countries';
import type { GameState } from '../src/sim/types';
import { addLine, buyEquipment, justifyWar, proposeBudget, proposeLaw, proposeWar } from '../src/sim/actions';
import { atWar, divStats, reconcileDivision } from '../src/sim/military';
import { requirements } from '../src/sim/units';

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
    const ctl0 = s.provinces.map((p) => p.controller);
    let maxBattles = 0;
    let maxOcc = 0;
    for (let i = 0; i < 120; i++) {
      step(s);
      maxBattles = Math.max(maxBattles, s.battles.filter((b) => [b.attacker, b.defender].some((t) => t === 'KOR' || t === 'PRK')).length);
      maxOcc = Math.max(maxOcc, occupiedShare(s, 'KOR'), occupiedShare(s, 'PRK'));
    }
    const koreanProvChanged = s.provinces.filter((p, i) => ['KOR', 'PRK'].includes(prov(i).owner) && p.controller !== ctl0[i]).length;
    expect(maxBattles).toBeGreaterThan(0); // Korean-front battles actually took place
    expect(maxOcc).toBeGreaterThan(0.05); // and the front moved
    expect(koreanProvChanged).toBeGreaterThan(0);
    expect(s.countries.KOR.stats.casualties + s.countries.PRK.stats.casualties).toBeGreaterThan(0);
    console.log('battles', s.battles.length, 'KOR occ', occupiedShare(s, 'KOR').toFixed(2), 'PRK occ', occupiedShare(s, 'PRK').toFixed(2), 'wars', s.wars.map((w) => `${w.name}: ${w.attackers}/${w.defenders}`));
    console.log('KOR divs', Object.values(s.divisions).filter((d) => d.owner === 'KOR').length, 'PRK divs', Object.values(s.divisions).filter((d) => d.owner === 'PRK').length, 'cas KOR', s.countries.KOR.stats.casualties.toFixed(0), 'PRK', s.countries.PRK.stats.casualties.toFixed(0));
    expect(finite(s)).toEqual([]);
  }, 120000);
});

describe('player flows', () => {
  it('democracy: justification -> parliament war vote; budget & law bills; production & purchase', () => {
    const s = newGame('KOR');
    const kor = s.countries.KOR;
    expect(proposeWar(s, 'KOR', 'PRK')).toMatch(/명분/);
    expect(justifyWar(s, 'KOR', 'PRK')).toBeNull();
    for (let i = 0; i < 31; i++) step(s);
    expect(proposeWar(s, 'KOR', 'PRK')).toBeNull();
    expect(proposeBudget(s, 'KOR', { ...kor.budget, military: 3.0 }, kor.tax)).toBeNull();
    expect(proposeLaw(s, 'KOR', { conscription: 'total' }, '총동원')).toBeNull();
    for (let i = 0; i < 15; i++) step(s);
    const results = s.bills.filter((b) => b.country === 'KOR' && b.result).map((b) => `${b.title}: ${b.result!.passed ? '가결' : '부결'} ${b.result!.yes}/${b.result!.no}`);
    console.log(results.join('\n'), '\nat war:', atWar(s, 'KOR', 'PRK'));
    expect(results.length).toBe(3);
    expect(kor.laws.conscription).not.toBe('total'); // peacetime total mobilisation should be voted down
    expect(addLine(s, 'KOR', 'k2')).toBeNull();
    expect(buyEquipment(s, 'KOR', 'f35a', 20)).toBeNull();
    expect(buyEquipment(s, 'KOR', 'su57', 5)).toBeTruthy();
    expect(finite(s)).toEqual([]);
  }, 60000);
});

describe('order of battle changes', () => {
  it('switching tank companies to K1A2 swaps the K2s back into the stockpile', () => {
    const s = newGame('KOR');
    const c = s.countries.KOR;
    const d = Object.values(s.divisions).find((x) => x.owner === 'KOR' && (x.equip.k2 ?? 0) > 0)!;
    const k2Held = d.equip.k2;
    const tankNeed = requirements(d.battalions).byCat.tank!.count;
    for (const b of d.battalions) for (const comp of b.companies) if (comp.type === 'tank') comp.equip = 'k1a2';
    c.stockpile.k1a2 = (c.stockpile.k1a2 ?? 0) + tankNeed * 2;
    const k2Stock = c.stockpile.k2 ?? 0;
    reconcileDivision(c, d);
    expect(d.equip.k2 ?? 0).toBe(0);
    expect(d.equip.k1a2).toBe(tankNeed);
    expect(c.stockpile.k2).toBe(k2Stock + k2Held);
  });

  it('removing every battalion returns all men and equipment', () => {
    const s = newGame('KOR');
    const c = s.countries.KOR;
    const d = Object.values(s.divisions).find((x) => x.owner === 'KOR')!;
    const men = d.men;
    const mp = c.manpower;
    const k21 = c.stockpile.k21 ?? 0;
    const heldK21 = d.equip.k21 ?? 0;
    d.battalions = [];
    reconcileDivision(c, d);
    const st = divStats(d);
    expect(d.men).toBe(0);
    expect(Object.keys(d.equip)).toEqual([]);
    expect(st.soft).toBe(0);
    expect(st.fill).toBe(0);
    expect(c.manpower).toBeCloseTo(mp + men / 1000, 6);
    expect(c.stockpile.k21 ?? 0).toBe(k21 + heldK21);
  });

  it('removing one battalion trims only its share', () => {
    const s = newGame('KOR');
    const c = s.countries.KOR;
    const d = Object.values(s.divisions).find((x) => x.owner === 'KOR' && x.battalions.some((b) => b.kind === 'tank_bn'))!;
    const idx = d.battalions.findIndex((b) => b.kind === 'tank_bn');
    d.battalions.splice(idx, 1);
    reconcileDivision(c, d);
    const req = requirements(d.battalions);
    const tanks = Object.entries(d.equip).filter(([id]) => EQUIP_BY_ID[id].cat === 'tank').reduce((a, [, n]) => a + n, 0);
    expect(tanks).toBeLessThanOrEqual(req.byCat.tank?.count ?? 0);
    expect(d.men).toBeLessThanOrEqual(req.men);
  });
});
