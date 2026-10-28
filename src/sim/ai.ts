import { EQUIPMENT, EQUIP_BY_ID } from '../data/equipment';
import type { EquipCat } from '../data/schema';
import { canProduce, exportable, quality, TECH_BY_ID } from './equip';
import { activeK, availableTechs, researchSlots, submitBill, techCost, industryCap, lineDemand } from './domestic';
import {
  atWar, declareWar, divStats, terrainDefense, endWar, enemiesOf, fillDivision, friendly, maxOrg, orderMove, warScore, warsOf,
} from './military';
import type { Country, Division, GameState } from './types';
import { requirements } from './units';
import { sendAid } from './actions';
import { clamp, getRel, km, rand } from './util';
import { coreProvinces, prov } from './world';

function ownDivisions(s: GameState, tag: string): Division[] {
  return Object.values(s.divisions).filter((d) => d.owner === tag);
}

/** Provinces controlled by `tag` that border provinces controlled by an enemy (or a hostile neighbour in peacetime). */
export function frontProvinces(s: GameState, tag: string): { prov: number; pressure: number }[] {
  const enemies = new Set(enemiesOf(s, tag));
  const peace = enemies.size === 0;
  const out: { prov: number; pressure: number }[] = [];
  s.provinces.forEach((st, i) => {
    if (st.controller !== tag) return;
    let pressure = 0;
    for (const n of prov(i).adj) {
      const ctl = s.provinces[n].controller;
      if (ctl === tag) continue;
      if (enemies.has(ctl)) pressure += 2;
      else if (peace && getRel(s, tag, ctl) < -40) pressure += 1;
    }
    if (pressure > 0) out.push({ prov: i, pressure });
  });
  return out;
}

/** Spread divisions over the front (or key provinces in peacetime). Greedy nearest assignment. */
export function autoDeploy(s: GameState, tag: string, only?: Division[]): void {
  const c = s.countries[tag];
  if (!c?.alive) return;
  // leave divisions that are fighting or already attacking alone
  const divs = (only ?? ownDivisions(s, tag)).filter((d) => !d.inBattle && !(d.path.length && atWar(s, s.provinces[d.path[0]].controller, tag)));
  if (!divs.length) return;
  let front = frontProvinces(s, tag);
  const slots: number[] = [];
  const reserve = only ? 0 : Math.floor(divs.length * 0.15);
  if (front.length) {
    front.sort((a, b) => b.pressure - a.pressure || a.prov - b.prov);
    front = front.slice(0, Math.max(1, divs.length - reserve));
    let total = 0;
    for (const f of front) total += f.pressure;
    const n = divs.length - reserve;
    for (const f of front) {
      const k = Math.max(1, Math.round((f.pressure / total) * n));
      for (let i = 0; i < k && slots.length < n; i++) slots.push(f.prov);
    }
    while (slots.length < n) slots.push(front[slots.length % front.length].prov);
  } else {
    const core = coreProvinces(tag)
      .filter((p) => s.provinces[p].controller === tag)
      .sort((a, b) => prov(b).cityPop - prov(a).cityPop);
    if (!core.length) return;
    for (let i = 0; slots.length < divs.length - reserve; i++) slots.push(core[i % Math.min(core.length, 8)]);
  }
  for (let i = 0; i < reserve; i++) slots.push(c.capital);
  const free = [...divs];
  for (const slot of slots) {
    if (!free.length) break;
    let best = 0, bd = Infinity;
    for (let i = 0; i < free.length; i++) {
      const d = free[i];
      const dist = d.prov === slot ? -1 : km(prov(d.prov), prov(slot));
      if (dist < bd) { bd = dist; best = i; }
    }
    const d = free.splice(best, 1)[0];
    if (d.prov !== slot && d.path[d.path.length - 1] !== slot) orderMove(s, d, slot);
  }
}

/** Offensive orders for an AI country at war. */
export function aiAttack(s: GameState, tag: string): void {
  const divs = ownDivisions(s, tag).filter((d) => !d.inBattle && !d.path.length && d.training <= 0);
  const byProv = new Map<number, Division[]>();
  for (const d of divs) {
    if (d.org < maxOrg(d) * 0.7) continue;
    if (!byProv.has(d.prov)) byProv.set(d.prov, []);
    byProv.get(d.prov)!.push(d);
  }
  const allDivs = Object.values(s.divisions);
  for (const [pid, here] of byProv) {
    const targets = prov(pid).adj.filter((n) => atWar(s, s.provinces[n].controller, tag));
    if (!targets.length) continue;
    let bestT = -1, bestRatio = 0;
    for (const t of targets) {
      const def = allDivs.filter((x) => x.prov === t && atWar(s, x.owner, tag));
      const defP = def.reduce((a, x) => { const st = divStats(x); return a + (st.def * (1 + 0.9 * x.entrench) + st.soft * 0.3) * terrainDefense(s, t); }, 0);
      const atkP = here.reduce((a, x) => { const st = divStats(x); return a + st.soft + st.hard; }, 0);
      const ratio = defP > 0 ? atkP / defP : 99;
      if (ratio > bestRatio) { bestRatio = ratio; bestT = t; }
    }
    if (bestT < 0 || bestRatio < 1.6) continue;
    // never strip a front province bare: one division always stays to hold the line
    if (here.length < 2) continue;
    const undefended = bestRatio >= 99;
    const attackers = here.slice(0, here.length - 1).slice(0, undefended ? 1 : 3);
    for (const d of attackers) orderMove(s, d, bestT);
  }
}

// ---------------- monthly AI ----------------
const MAIN_CATS: EquipCat[] = ['inf', 'tank', 'ifv', 'spg', 'mlrs', 'sam', 'fighter', 'destroyer', 'frigate', 'submarine'];

export function aiResearch(s: GameState, c: Country): void {
  const slots = researchSlots(c);
  while (c.research.length < slots) {
    const cands = availableTechs(c);
    if (!cands.length) return;
    // prefer techs unlocking own-designed equipment and cheap catch-up techs
    const ownUnlock = new Set(EQUIPMENT.filter((e) => e.origin === c.tag || e.partners?.includes(c.tag)).map((e) => e.tech));
    cands.sort((a, b) => {
      const sa = techCost(s, c, a) * (ownUnlock.has(a.id) ? 0.5 : 1) * (a.effects ? 0.8 : 1);
      const sb = techCost(s, c, b) * (ownUnlock.has(b.id) ? 0.5 : 1) * (b.effects ? 0.8 : 1);
      return sa - sb;
    });
    c.research.push({ tech: cands[0].id, progress: 0 });
  }
}

export function aiProduction(s: GameState, c: Country, initial = false): void {
  if (initial) estimateProcurement(s, c);
  const budget = Math.min(Math.max(0, c.stats.procurement), industryCap(c));
  if (budget <= 0.01) { c.lines = []; return; }
  const coastal = coreProvinces(c.tag).some((p) => prov(p).coastal);
  const picks: string[] = [];
  for (const cat of MAIN_CATS) {
    if (['destroyer', 'frigate', 'submarine'].includes(cat) && (!coastal || budget < 3)) continue;
    const best = EQUIPMENT.filter((e) => e.cat === cat && canProduce(c, e)).sort((a, b) => quality(b) - quality(a))[0];
    if (best) picks.push(best.id);
  }
  if (!picks.length) {
    c.lines = [];
    aiBuyAbroad(s, c, budget);
    return;
  }
  const weights: Partial<Record<EquipCat, number>> = { inf: 0.04, tank: 0.18, ifv: 0.14, spg: 0.08, mlrs: 0.05, sam: 0.1, fighter: 0.26, destroyer: 0.08, frigate: 0.04, submarine: 0.03 };
  const keep = c.lines.filter((l) => picks.includes(l.equip));
  for (const id of picks) {
    let l = keep.find((x) => x.equip === id);
    if (!l) { l = { id: s.nextId++, equip: id, lines: 1, eff: initial ? 0.8 : 0.3, progress: 0 }; keep.push(l); }
    const e = EQUIP_BY_ID[id];
    const share = (weights[e.cat] ?? 0.05) * budget; // B$/yr for this item
    const perLine = (e.perLineYear * e.cost) / 1000;
    l.lines = Math.max(1, Math.round(share / perLine));
  }
  c.lines = keep;
  void lineDemand;
}

function estimateProcurement(s: GameState, c: Country): void {
  const pcap = (c.gdp * 1e9) / (c.pop * 1e6);
  const mil = (c.gdp * c.budget.military) / 100;
  c.stats.procurement = mil - (activeK(s, c.tag, true) * 1000 * Math.max(3000, pcap * 1.1)) / 1e9 - mil * 0.2;
}

function aiBuyAbroad(s: GameState, c: Country, budget: number): void {
  if (c.purchases.length > 3 || budget < 0.05) return;
  const cats: EquipCat[] = ['tank', 'ifv', 'spg', 'sam', 'fighter'];
  const cat = cats[Math.floor(rand(s) * cats.length)];
  const sellers = EQUIPMENT.filter((e) => e.cat === cat && exportable(e) && e.year <= 2026 && s.countries[e.origin]?.alive && getRel(s, c.tag, e.origin) >= 0 && !atWar(s, c.tag, e.origin))
    .filter((e) => e.cost * 1.25 * 10 / 1000 < budget * 0.5)
    .sort((a, b) => quality(b) - quality(a));
  const e = sellers[0];
  if (!e) return;
  const qty = Math.max(1, Math.floor((budget * 0.4 * 1000) / (e.cost * 1.25)));
  c.purchases.push({ id: s.nextId++, equip: e.id, qty: Math.min(qty, 200), from: e.origin, daysLeft: 180 });
  c.stats.prodSpending += (Math.min(qty, 200) * e.cost * 1.25) / 1000;
}

function aiDivisions(s: GameState, c: Country): void {
  const divs = ownDivisions(s, c.tag);
  const cap = Math.max(2, Math.round(divs.length * 1.3) + 2);
  if (divs.length >= cap || c.manpower < 15) return;
  // pick the template whose requirements are best covered by the stockpile
  let best: { t: (typeof c.templates)[number]; cover: number } | null = null;
  for (const t of c.templates) {
    const req = requirements(t.battalions);
    let cover = 1;
    for (const [cat, slot] of Object.entries(req.byCat)) {
      let have = 0;
      for (const [id, n] of Object.entries(c.stockpile)) if (EQUIP_BY_ID[id]?.cat === cat) have += n;
      cover = Math.min(cover, have / slot!.count);
    }
    if (!best || cover > best.cover) best = { t, cover };
  }
  if (!best || best.cover < 0.8) return;
  createDivision(s, c, best.t.id);
  // wartime: form up to two more divisions a month while equipment and manpower last
  if (warsOf(s, c.tag).length && c.manpower > 30) for (let i = 0; i < 2; i++) aiDivisionsOnce(s, c);
}

function aiDivisionsOnce(s: GameState, c: Country): void {
  for (const t of c.templates) {
    const req = requirements(t.battalions);
    let ok = c.manpower * 1000 > req.men;
    for (const [cat, slot] of Object.entries(req.byCat)) {
      let have = 0;
      for (const [id, n] of Object.entries(c.stockpile)) if (EQUIP_BY_ID[id]?.cat === cat) have += n;
      if (have < slot!.count * 0.8) ok = false;
    }
    if (ok) { createDivision(s, c, t.id); return; }
  }
}

export function createDivision(s: GameState, c: Country, templateId: number): Division | null {
  const t = c.templates.find((x) => x.id === templateId);
  if (!t) return null;
  const n = ownDivisions(s, c.tag).length + 1;
  const d: Division = {
    id: s.nextId++,
    owner: c.tag,
    name: `제${n + 100}${t.name.replace(/^표준 /, '')}`,
    battalions: JSON.parse(JSON.stringify(t.battalions)),
    prov: c.capital,
    path: [],
    moveProgress: 0,
    equip: {},
    men: 0,
    org: 10,
    training: 60,
    corps: null,
    entrench: 0,
    inBattle: false,
  };
  s.divisions[d.id] = d;
  fillDivision(c, d, 0.2);
  return d;
}

function aiAir(s: GameState, c: Country): void {
  const enemies = enemiesOf(s, c.tag);
  const wings = Object.values(s.airWings).filter((w) => w.owner === c.tag);
  if (!enemies.length) {
    for (const w of wings) w.theater = null;
    return;
  }
  // main theatre: where we have the most front pressure -> own country if being invaded, else the main enemy
  const invaded = coreProvinces(c.tag).some((p) => atWar(s, s.provinces[p].controller, c.tag));
  const mainEnemy = enemies.slice().sort((a, b) => (s.countries[b]?.gdp ?? 0) - (s.countries[a]?.gdp ?? 0))[0];
  const theater = invaded ? c.tag : mainEnemy;
  wings.forEach((w, i) => {
    w.theater = i % 4 === 3 && !invaded ? c.tag : theater;
    const e = EQUIP_BY_ID[w.equip];
    w.mission = e?.cat === 'fighter' && (e.r.a2a ?? 0) >= (e.r.a2g ?? 0) * 0.8 ? 'superiority' : 'cas';
  });
}

function aiWarPolicy(s: GameState, c: Country): void {
  const wars = warsOf(s, c.tag);
  if (!wars.length) return;
  if (s.bills.some((b) => b.country === c.tag && !b.result)) return;
  if (c.budget.military < 6 && c.gov !== 'democracy') {
    submitBill(s, { country: c.tag, kind: 'budget', title: '전시 추경 (국방비 증액)', budget: { ...c.budget, military: Math.min(c.budget.military + 1.5, 12) }, tax: c.tax, stance: { econ: 0, hawk: 0.5 } });
  } else if (c.laws.economy === 'civilian') {
    submitBill(s, { country: c.tag, kind: 'law', title: '부분 동원령', law: { economy: 'partial' }, stance: { econ: 0, hawk: 0.5 } });
  }
}

function aiPeace(s: GameState, c: Country): void {
  for (const w of warsOf(s, c.tag)) {
    if (w.attackers[0] !== c.tag) continue;
    if (w.attackers.includes(s.player) || w.defenders.includes(s.player)) continue;
    if (s.day - w.start < 365) continue;
    const sc = warScore(s, w.id, 'attackers');
    if (Math.abs(sc) < 0.1 && rand(s) < 0.08) endWar(s, w.id, null, false);
    else if (sc > 0.3 && rand(s) < 0.05) endWar(s, w.id, w.attackers, true);
  }
}

function aiAggression(s: GameState, c: Country): void {
  if (c.gov === 'democracy' || s.tension < 70 || warsOf(s, c.tag).length) return;
  if (rand(s) > 0.01) return;
  const myPower = ownDivisions(s, c.tag).length;
  for (const n of neighbours(s, c.tag)) {
    if (getRel(s, c.tag, n) > -70 || n === s.player) continue;
    const theirs = ownDivisions(s, n).length;
    const allies = s.alliances.some((a) => a.mutualDefense && a.members.includes(n));
    if (!allies && myPower > theirs * 2.5) {
      declareWar(s, c.tag, n, false);
      return;
    }
  }
}

export function neighbours(s: GameState, tag: string): string[] {
  const out = new Set<string>();
  s.provinces.forEach((st, i) => {
    if (st.owner !== tag) return;
    for (const n of prov(i).adj) {
      const o = s.provinces[n].owner;
      if (o !== tag) out.add(o);
    }
  });
  return [...out];
}

/** Friendly democracies at peace send part of their spare land equipment to embattled defenders. */
function aiAid(s: GameState, c: Country): void {
  if (warsOf(s, c.tag).length) return;
  for (const w of s.wars)
    for (const d of w.defenders) {
      if (d === c.tag || getRel(s, c.tag, d) < 50) continue;
      sendAid(s, c.tag, d, 0.03, true);
    }
}

export function aiMonthly(s: GameState, c: Country): void {
  aiAid(s, c);
  aiResearch(s, c);
  aiProduction(s, c);
  aiDivisions(s, c);
  aiAir(s, c);
  aiWarPolicy(s, c);
  aiPeace(s, c);
  aiAggression(s, c);
  // drift relations slowly toward 0 except at war
  void friendly;
  void TECH_BY_ID;
  void clamp;
}
