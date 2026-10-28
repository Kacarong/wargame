import { EQUIP_BY_ID } from '../data/equipment';
import { TECHS } from '../data/tech';
import type { Resource, Tech } from '../data/schema';
import { NAVAL_CATS, AIR_CATS } from '../data/schema';
import { TECH_BY_ID } from './equip';
import { atWar, declareWar, enemiesOf, occupiedShare, warsOf } from './military';
import type { Bill, Budget, Country, GameState, Laws } from './types';
import { clamp, log, rand, yearOf } from './util';

export const LAW_INFO = {
  conscription: {
    name: '병역 제도',
    options: {
      volunteer: { name: '모병제', desc: '징집 가능 인구 1.5%. 경제 부담 없음.', rate: 0.015, growth: 0, approval: 0 },
      conscript: { name: '징병제', desc: '징집 가능 인구 3%. 성장률 -0.1%p, 지지율 -3.', rate: 0.03, growth: -0.1, approval: -3 },
      extended: { name: '확대 징병', desc: '징집 가능 인구 6%. 성장률 -0.4%p, 지지율 -10.', rate: 0.06, growth: -0.4, approval: -10 },
      total: { name: '총동원', desc: '징집 가능 인구 12%. 성장률 -1.5%p, 지지율 -25.', rate: 0.12, growth: -1.5, approval: -25 },
    },
  },
  economy: {
    name: '경제 동원',
    options: {
      civilian: { name: '평시 경제', desc: '방산 생산력 기본. 경제 정상.', target: 0 },
      partial: { name: '부분 동원', desc: '방산 생산력 최대 +75%. 성장률 최대 -0.75%p.', target: 0.5 },
      war: { name: '전시 경제', desc: '방산 생산력 최대 +150%. 성장률 최대 -1.5%p. 평시에 쓰면 안정도 하락.', target: 1 },
    },
  },
  trade: {
    name: '무역 정책',
    options: {
      free: { name: '자유무역', desc: '자원 수입 100%, 성장률 +0.3%p.', factor: 1, growth: 0.3 },
      balanced: { name: '균형 무역', desc: '자원 수입 85%.', factor: 0.85, growth: 0 },
      protection: { name: '보호무역', desc: '자원 수입 60%, 성장률 -0.4%p, 지지율 +2.', factor: 0.6, growth: -0.4 },
    },
  },
  press: {
    name: '언론 정책',
    options: {
      free: { name: '언론 자유', desc: '안정도 보너스 없음.', stab: 0, ws: 0 },
      limited: { name: '언론 제한', desc: '안정도 +5, 전쟁지지도 +5. 민주국가에서 지지율 -5.', stab: 5, ws: 5 },
      controlled: { name: '언론 통제', desc: '안정도 +12, 전쟁지지도 +15. 민주국가에서 지지율 -15.', stab: 12, ws: 15 },
    },
  },
} as const;

const CONSCRIPT_ORDER = ['volunteer', 'conscript', 'extended', 'total'];
const ECON_ORDER = ['civilian', 'partial', 'war'];

export function worldGdp(s: GameState): number {
  let g = 0;
  for (const c of Object.values(s.countries)) if (c.alive) g += c.gdp;
  return g;
}

export function sanctionedShare(s: GameState, tag: string, wg: number): number {
  let g = 0;
  for (const [x, list] of Object.entries(s.sanctions)) if (list.includes(tag) && s.countries[x]?.alive) g += s.countries[x].gdp;
  return g / wg;
}

export function techMods(c: Country, key: keyof NonNullable<Tech['effects']>): number {
  let v = 0;
  for (const t of c.techs) v += TECH_BY_ID[t]?.effects?.[key] ?? 0;
  return v;
}

export function interestRate(c: Country): number {
  return 0.018 + Math.max(0, c.debt / c.gdp - 1.3) * 0.004;
}

export function industryCap(c: Country): number {
  return c.defIndustry * (1 + 1.5 * c.mobilization) * (1 + techMods(c, 'industryCap'));
}

let activeCache: { s: GameState; day: number; map: Map<string, number> } | null = null;

/** Active personnel in thousands (division troops + air crews/ground staff + ship crews). Cached per day. */
export function activeK(s: GameState, tag: string, fresh = false): number {
  if (fresh || !activeCache || activeCache.s !== s || activeCache.day !== s.day) {
    const map = new Map<string, number>();
    const add = (t: string, v: number) => map.set(t, (map.get(t) ?? 0) + v);
    for (const d of Object.values(s.divisions)) add(d.owner, d.men / 1000);
    for (const w of Object.values(s.airWings)) add(w.owner, w.count * 0.08); // ~80 personnel per aircraft incl. ground crew
    for (const f of Object.values(s.fleets))
      for (const [id, n] of Object.entries(f.ships)) {
        const e = EQUIP_BY_ID[id];
        add(f.owner, n * (e?.cat === 'carrier' ? 5 : e?.cat === 'destroyer' ? 0.35 : e?.cat === 'submarine' ? 0.1 : 0.2));
      }
    activeCache = { s, day: s.day, map };
  }
  return activeCache.map.get(tag) ?? 0;
}

export function researchSlots(c: Country): number {
  const rb = (c.gdp * c.budget.research) / 100;
  return clamp(2 + Math.floor(Math.log10(rb + 1) * 1.2), 2, 5);
}

export function techCost(s: GameState, c: Country, t: Tech): number {
  const y = yearOf(s.day);
  let cost = t.cost;
  if (t.year <= y - 3) cost *= 0.6; // catch-up on known technology
  if (t.year > y) cost *= 1 + 0.2 * (t.year - y);
  return cost / (1 + techMods(c, 'researchSpeed'));
}

export function availableTechs(c: Country): Tech[] {
  return TECHS.filter((t) => !c.techs.includes(t.id) && t.req.every((r) => c.techs.includes(r)) && !c.research.some((r) => r.tech === t.id));
}

// ---------------- daily economy ----------------
export function economyTick(s: GameState, c: Country, wg: number): void {
  const sanc = sanctionedShare(s, c.tag, wg);
  const trade = LAW_INFO.trade.options[c.laws.trade];
  const tradeF = trade.factor * (1 - Math.min(0.9, sanc * 2));
  const resAvail = {} as Record<Resource, number>;
  for (const r of ['steel', 'oil', 'chips', 'rare'] as Resource[]) {
    const self = c.resources[r];
    resAvail[r] = self >= 1 ? 1 : clamp(self + (1 - self) * tradeF, 0, 1);
  }
  c.stats.resAvail = resAvail;

  const target = LAW_INFO.economy.options[c.laws.economy].target;
  if (c.mobilization < target) c.mobilization = Math.min(target, c.mobilization + 1 / 180);
  else if (c.mobilization > target) c.mobilization = Math.max(target, c.mobilization - 1 / 90);

  const pcap = (c.gdp * 1e9) / (c.pop * 1e6);
  const revenue = (c.gdp * c.tax) / 100;
  const personnel = (activeK(s, c.tag) * 1000 * Math.max(3000, pcap * 1.1)) / 1e9;
  const milBudget = (c.gdp * c.budget.military) / 100;
  const atWarNow = warsOf(s, c.tag).length > 0;
  const om = milBudget * 0.2 + (atWarNow ? c.gdp * 0.005 : 0);
  const procurement = milBudget - personnel - om;
  const rate = interestRate(c);
  const interest = c.debt * rate;
  const spending = (c.gdp * (c.budget.military + c.budget.welfare + c.budget.research + c.budget.infra + c.otherSpend)) / 100 + interest + (atWarNow ? c.gdp * 0.005 : 0);
  const unspent = Math.max(0, procurement - c.stats.prodSpending);
  c.debt = Math.max(0, c.debt + (spending - unspent - revenue) / 365);
  c.stats.revenue = revenue;
  c.stats.spending = spending - unspent;
  c.stats.personnelCost = personnel;
  c.stats.procurement = procurement;

  const consc = LAW_INFO.conscription.options[c.laws.conscription];
  const occ = occupiedShare(s, c.tag);
  // The scenario's baseline growth already reflects each country's real situation (sanctions, oil imports,
  // mobilisation...). Policy terms therefore apply as *changes* relative to the starting point.
  const b = (c.base ??= {
    infra: c.budget.infra, research: c.budget.research, stability: c.stability, mob: c.mobilization,
    sanc, oil: resAvail.oil, chips: resAvail.chips, debt: c.debt / c.gdp, consc: consc.growth, trade: trade.growth,
  });
  let g = c.baseGrowth;
  g += (c.budget.infra - b.infra) * 0.25;
  g += (c.budget.research - b.research) * 0.3;
  g += trade.growth - b.trade;
  g += ((c.stability - b.stability) / 50) * 0.8;
  g -= (c.mobilization - b.mob) * 1.5;
  g -= (c.tax - c.baseTax) * 0.08;
  g -= (sanc - b.sanc) * 3;
  g -= Math.max(0, c.debt / c.gdp - Math.max(1.5, b.debt)) * 0.5;
  g -= Math.max(0, b.oil - resAvail.oil) * 3 + Math.max(0, b.chips - resAvail.chips) * 1.5;
  g += techMods(c, 'gdpGrowth');
  g -= occ * 8;
  g += consc.growth - b.consc;
  c.stats.growth = g;
  c.gdp *= 1 + g / 100 / 365;

  // research points
  const rb = (c.gdp * c.budget.research) / 100;
  const edu = pcap > 30000 ? 1.2 : pcap > 10000 ? 1 : 0.7;
  c.stats.rpPerDay = Math.sqrt(Math.max(0, rb)) * edu * (0.5 + c.stability / 100);

  // manpower
  const pool = c.pop * 1000 * consc.rate;
  const serving = activeK(s, c.tag);
  if (c.manpower + serving < pool) c.manpower += pool / (365 * 3);
}

// ---------------- research ----------------
export function researchTick(s: GameState, c: Country): void {
  if (!c.research.length) return;
  const per = c.stats.rpPerDay / c.research.length;
  for (const slot of [...c.research]) {
    slot.progress += per;
    const t = TECH_BY_ID[slot.tech];
    if (!t) {
      c.research = c.research.filter((r) => r !== slot);
      continue;
    }
    if (slot.progress >= techCost(s, c, t)) {
      c.techs.push(t.id);
      c.research = c.research.filter((r) => r !== slot);
      if (c.tag === s.player) log(s, `연구 완료: ${t.name}`, [c.tag]);
    }
  }
}

// ---------------- production ----------------
export function lineDemand(c: Country, lineIdx: number): number {
  const l = c.lines[lineIdx];
  const e = EQUIP_BY_ID[l.equip];
  if (!e) return 0;
  return (l.lines * e.perLineYear * e.cost) / 1000; // B$/yr at full efficiency
}

export function productionTick(s: GameState, c: Country): void {
  const budgetDay = Math.min(Math.max(0, c.stats.procurement), industryCap(c)) / 365;
  let demand = 0;
  for (let i = 0; i < c.lines.length; i++) demand += (lineDemand(c, i) * c.lines[i].eff) / 365;
  const scale = demand > 0 ? Math.min(1, budgetDay / demand) : 0;
  const effCap = 1 + techMods(c, 'prodEfficiency');
  let spent = 0;
  for (const l of c.lines) {
    const e = EQUIP_BY_ID[l.equip];
    if (!e) continue;
    let resF = 1;
    for (const [r, w] of Object.entries(e.needs) as [Resource, number][]) resF = Math.min(resF, 1 - w * (1 - c.stats.resAvail[r]));
    const units = ((l.lines * e.perLineYear) / 365) * l.eff * scale * resF;
    spent += (units * e.cost) / 1000;
    l.progress += units;
    l.eff = Math.min(effCap, l.eff + 0.004);
    if (l.progress >= 1) {
      const n = Math.floor(l.progress);
      l.progress -= n;
      deliver(s, c, l.equip, n);
    }
  }
  c.stats.prodSpending = spent * 365;
  for (const p of [...c.purchases]) {
    p.daysLeft--;
    if (p.daysLeft <= 0) {
      deliver(s, c, p.equip, p.qty);
      c.purchases = c.purchases.filter((x) => x !== p);
      if (c.tag === s.player) log(s, `해외 구매 장비 인도: ${EQUIP_BY_ID[p.equip]?.name} ${p.qty}대`, [c.tag]);
    }
  }
}

/** New equipment: ships join the main fleet, aircraft reinforce/create wings, the rest goes to the stockpile. */
export function deliver(s: GameState, c: Country, id: string, n: number): void {
  const e = EQUIP_BY_ID[id];
  if (!e) return;
  if (NAVAL_CATS.includes(e.cat)) {
    let fleet = Object.values(s.fleets).find((f) => f.owner === c.tag);
    if (!fleet) {
      const fid = s.nextId++;
      fleet = s.fleets[fid] = { id: fid, owner: c.tag, name: `${c.name} 주력함대`, ships: {} };
    }
    fleet.ships[id] = (fleet.ships[id] ?? 0) + n;
    if (c.tag === s.player) log(s, `${e.name} ${n}척 취역`, [c.tag]);
    return;
  }
  if (AIR_CATS.includes(e.cat)) {
    const size = e.cat === 'heli' ? 12 : e.cat === 'attacker' ? 16 : 20;
    let left = n;
    for (const w of Object.values(s.airWings)) {
      if (w.owner !== c.tag || w.equip !== id || w.count >= size) continue;
      const add = Math.min(left, size - w.count);
      w.count += add;
      left -= add;
      if (!left) break;
    }
    if (left > 0) {
      c.stockpile[id] = (c.stockpile[id] ?? 0) + left;
      const ready = Math.floor(c.stockpile[id] / size);
      for (let i = 0; i < ready; i++) {
        const wid = s.nextId++;
        const k = Object.values(s.airWings).filter((w) => w.owner === c.tag && w.equip === id).length + 1;
        const kind = e.cat === 'heli' ? '공격헬기대대' : e.cat === 'attacker' ? '공격비행대대' : '전투비행대대';
        s.airWings[wid] = { id: wid, owner: c.tag, name: `${e.name} ${kind} ${k}`, equip: id, count: size, theater: null, mission: e.cat === 'fighter' ? 'superiority' : 'cas' };
        c.stockpile[id] -= size;
        if (c.tag === s.player) log(s, `신규 비행대대 창설: ${s.airWings[wid].name}`, [c.tag]);
      }
    }
    return;
  }
  c.stockpile[id] = (c.stockpile[id] ?? 0) + n;
}

// ---------------- politics (monthly) ----------------
export function politicsMonthly(s: GameState, c: Country): void {
  const consc = LAW_INFO.conscription.options[c.laws.conscription];
  const press = LAW_INFO.press.options[c.laws.press];
  const atWarNow = warsOf(s, c.tag).length > 0;
  const defending = s.wars.some((w) => w.defenders.includes(c.tag));
  const ww = Math.min(30, (c.stats.casualties / (c.pop * 1e6)) * 3e4);
  const demo = c.gov === 'democracy';
  let appT = 50;
  appT += (c.budget.welfare - c.baseWelfare) * 2.5;
  appT += (c.stats.growth - 2) * 4;
  appT -= (c.tax - c.baseTax) * 1.8;
  appT += consc.approval;
  appT -= ww;
  appT -= c.debt / c.gdp > 1 ? 5 : 0;
  if (demo) appT -= c.laws.press === 'limited' ? 5 : c.laws.press === 'controlled' ? 15 : 0;
  if (!demo) appT += 10;
  if (c.laws.trade === 'protection') appT += 2;
  c.approval = clamp(c.approval + (appT - c.approval) * 0.15, 0, 100);

  const occ = occupiedShare(s, c.tag);
  let stT = 30 + c.approval * 0.5 + press.stab + (c.gov === 'authoritarian' ? 10 : 0) - occ * 40;
  if (c.laws.economy === 'war' && !atWarNow) stT -= 10;
  c.stability = clamp(c.stability + (stT - c.stability) * 0.2, 0, 100);

  const govHawk = avgGovHawk(c);
  let wsT = 25 + govHawk * 15 + s.tension * 0.2 + press.ws - ww + (defending ? 25 : atWarNow ? 5 : 0);
  wsT += enemiesOf(s, c.tag).length ? 5 : 0;
  c.warSupport = clamp(c.warSupport + (wsT - c.warSupport) * 0.2, 0, 100);

  if (c.nextElection !== null && s.day >= c.nextElection) election(s, c);
}

function avgGovHawk(c: Country): number {
  let seats = 0, h = 0;
  for (const p of c.parties) if (p.gov) { seats += p.seats; h += p.hawk * p.seats; }
  return seats ? h / seats : 0;
}

export function govShare(c: Country): number {
  const total = c.parties.reduce((a, p) => a + p.seats, 0);
  return c.parties.filter((p) => p.gov).reduce((a, p) => a + p.seats, 0) / Math.max(1, total);
}

function election(s: GameState, c: Country): void {
  c.nextElection = (c.nextElection ?? s.day) + c.electionEvery * 365;
  if (c.gov === 'authoritarian') return;
  const total = c.parties.reduce((a, p) => a + p.seats, 0);
  const share = govShare(c);
  let newShare = clamp(share + ((c.approval - 45) / 100) * 0.7 + (rand(s) - 0.5) * 0.06, 0.15, 0.85);
  if (c.gov === 'hybrid') newShare = Math.max(newShare, 0.55);
  const govSeats = c.parties.filter((p) => p.gov).reduce((a, p) => a + p.seats, 0) || 1;
  const oppSeats = total - govSeats || 1;
  for (const p of c.parties) p.seats = Math.round(p.gov ? (p.seats / govSeats) * newShare * total : (p.seats / oppSeats) * (1 - newShare) * total);
  let msg = `${c.parliament} 총선거: 여당 ${Math.round(newShare * 100)}% 의석 확보.`;
  if (newShare < 0.5) {
    // government change: largest opposition party forms a coalition
    const opp = c.parties.filter((p) => !p.gov).sort((a, b) => b.seats - a.seats);
    for (const p of c.parties) p.gov = false;
    const lead = opp[0];
    lead.gov = true;
    let seats = lead.seats;
    for (const p of opp.slice(1).sort((a, b) => Math.abs(a.econ - lead.econ) - Math.abs(b.econ - lead.econ))) {
      if (seats > total / 2) break;
      p.gov = true;
      seats += p.seats;
    }
    c.leader = `${lead.name} 대표`;
    c.approval = 55;
    msg += ` 정권 교체! ${lead.name} 주도 정부 출범.`;
  }
  log(s, `${c.name} ${msg}`, [c.tag], c.tag === s.player);
}

// ---------------- bills ----------------
export function lawStance(c: Country, law: Partial<Laws>): { econ: number; hawk: number } {
  let econ = 0, hawk = 0;
  if (law.conscription) hawk += (CONSCRIPT_ORDER.indexOf(law.conscription) - CONSCRIPT_ORDER.indexOf(c.laws.conscription)) * 0.45;
  if (law.economy) hawk += (ECON_ORDER.indexOf(law.economy) - ECON_ORDER.indexOf(c.laws.economy)) * 0.5;
  if (law.trade) econ += law.trade === 'free' ? 0.5 : law.trade === 'protection' ? -0.3 : 0;
  if (law.press) hawk += law.press === 'controlled' ? 0.3 : law.press === 'limited' ? 0.15 : -0.2;
  return { econ, hawk };
}

export function budgetStance(c: Country, b: Budget, tax: number): { econ: number; hawk: number } {
  const dm = b.military - c.budget.military;
  const dw = b.welfare - c.budget.welfare;
  const dt = tax - c.tax;
  return { hawk: dm * 0.35, econ: -dw * 0.12 - dt * 0.1 };
}

export function submitBill(s: GameState, bill: Omit<Bill, 'id' | 'daysLeft'>): Bill {
  const b: Bill = { ...bill, id: s.nextId++, daysLeft: s.countries[bill.country].gov === 'democracy' ? 14 : 3 };
  s.bills.push(b);
  if (bill.country === s.player) log(s, `${s.countries[bill.country].parliament}에 법안 제출: ${bill.title}`, [bill.country]);
  return b;
}

export function predictVote(s: GameState, b: Bill): { yes: number; no: number; byParty: { name: string; seats: number; yes: boolean }[] } {
  const c = s.countries[b.country];
  let yes = 0, no = 0;
  const byParty = c.parties.map((p, i) => {
    let score = (p.gov ? 0.35 : -0.3) + p.hawk * b.stance.hawk + p.econ * b.stance.econ + ((c.approval - 50) / 100) * (p.gov ? 0.5 : -0.3);
    if (b.kind === 'war') score += (c.warSupport - 50) / 60 + (p.hawk - 0.2) * 0.6;
    // militarisation without a war is a hard sell to any legislature
    if (b.kind !== 'war' && b.stance.hawk > 0 && !atPeaceExempt(s, c.tag)) score -= b.stance.hawk * 0.6;
    if (b.law?.press && b.law.press !== 'free' && c.gov === 'democracy') score -= p.gov ? 0.2 : 0.6;
    // deterministic per-bill noise
    score += (((b.id * 7919 + i * 104729) % 1000) / 1000 - 0.5) * 0.2;
    const y = score > 0;
    if (y) yes += p.seats; else no += p.seats;
    return { name: p.name, seats: p.seats, yes: y };
  });
  return { yes, no, byParty };
}

function atPeaceExempt(s: GameState, tag: string): boolean {
  return warsOf(s, tag).length > 0 || s.tension > 70;
}

export function billTick(s: GameState): void {
  for (const b of [...s.bills]) {
    if (b.result) continue;
    b.daysLeft--;
    if (b.daysLeft > 0) continue;
    const c = s.countries[b.country];
    let passed: boolean;
    let yes = 0, no = 0;
    if (c.gov === 'authoritarian') {
      passed = true;
      yes = c.parties.reduce((a, p) => a + p.seats, 0);
      if (b.kind === 'war' && c.warSupport < 40) c.stability = clamp(c.stability - 8, 0, 100);
    } else {
      const v = predictVote(s, b);
      yes = v.yes;
      no = v.no;
      passed = yes > no || (c.gov === 'hybrid' && govShare(c) > 0.5 && c.approval > 25);
    }
    b.result = { yes, no, passed };
    if (passed) applyBill(s, b);
    if (b.country === s.player)
      log(s, `${c.parliament} 표결 — ${b.title}: ${passed ? '가결' : '부결'} (찬성 ${yes} / 반대 ${no})`, [c.tag], true);
    s.bills = s.bills.filter((x) => !x.result || x.country === s.player);
  }
  // keep only the last 12 resolved bills for the player
  const resolved = s.bills.filter((b) => b.result);
  if (resolved.length > 12) {
    const drop = new Set(resolved.slice(0, resolved.length - 12));
    s.bills = s.bills.filter((b) => !drop.has(b));
  }
}

function applyBill(s: GameState, b: Bill): void {
  const c = s.countries[b.country];
  if (b.kind === 'law' && b.law) Object.assign(c.laws, b.law);
  if (b.kind === 'budget' && b.budget) {
    c.budget = { ...b.budget };
    if (b.tax !== undefined) c.tax = b.tax;
  }
  if (b.kind === 'war' && b.target) {
    const just = c.justifications.find((j) => j.target === b.target && j.daysLeft <= 0);
    if (!atWar(s, c.tag, b.target) && s.countries[b.target]?.alive) declareWar(s, c.tag, b.target, !!just);
    c.justifications = c.justifications.filter((j) => j.target !== b.target);
  }
}
