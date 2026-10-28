import { EQUIP_BY_ID } from '../data/equipment';
import type { EquipCat } from '../data/schema';
import { quality, TECH_BY_ID } from './equip';
import type { AirWing, Battle, Country, Division, GameState } from './types';
import { requirements } from './units';
import { addRel, clamp, km, log, rand } from './util';
import { coreProvinces, prov, world } from './world';

/** Debug counters for balance scripts (scripts/war.ts). */
export const DEBUG = { undefended: 0, won: 0, surrendered: 0 };

// ---------- static province value ----------
let VALUE: number[] | null = null;
export function provValue(id: number): number {
  if (!VALUE) {
    VALUE = world().provinces.map((p) => {
      const v = 1 + Math.log10(1 + p.cityPop / 1e5) * 3 + Math.log10(1 + p.area / 1e4);
      return p.capital ? v * 3 : v;
    });
  }
  return VALUE[id];
}

// ---------- war relations ----------
export function warsOf(s: GameState, tag: string) {
  return s.wars.filter((w) => w.attackers.includes(tag) || w.defenders.includes(tag));
}

export function atWar(s: GameState, a: string, b: string): boolean {
  if (a === b) return false;
  return s.wars.some(
    (w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.defenders.includes(a) && w.attackers.includes(b)),
  );
}

/** Same side in some war, or members of a common alliance. */
export function friendly(s: GameState, a: string, b: string): boolean {
  if (a === b) return true;
  if (atWar(s, a, b)) return false;
  if (s.wars.some((w) => (w.attackers.includes(a) && w.attackers.includes(b)) || (w.defenders.includes(a) && w.defenders.includes(b))))
    return true;
  return s.alliances.some((al) => al.mutualDefense && al.members.includes(a) && al.members.includes(b));
}

/** All tags friendly to `tag` (itself, mutual-defence allies, co-belligerents), excluding current enemies. */
export function friendSet(s: GameState, tag: string): Set<string> {
  const out = new Set<string>([tag]);
  for (const al of s.alliances) if (al.mutualDefense && al.members.includes(tag)) for (const m of al.members) out.add(m);
  for (const w of s.wars) {
    if (w.attackers.includes(tag)) for (const m of w.attackers) out.add(m);
    if (w.defenders.includes(tag)) for (const m of w.defenders) out.add(m);
  }
  for (const e of enemiesOf(s, tag)) out.delete(e);
  return out;
}

export function enemiesOf(s: GameState, tag: string): string[] {
  const out = new Set<string>();
  for (const w of warsOf(s, tag)) for (const t of w.attackers.includes(tag) ? w.defenders : w.attackers) out.add(t);
  return [...out];
}

// ---------- division stats ----------
const W: Record<EquipCat, { soft: number; hard: number; def: number; aa: number }> = {
  inf: { soft: 0.02, hard: 0.003, def: 0.03, aa: 0.002 },
  tank: { soft: 1.2, hard: 2.0, def: 1.5, aa: 0 },
  ifv: { soft: 0.8, hard: 0.6, def: 1.0, aa: 0.05 },
  apc: { soft: 0.3, hard: 0.1, def: 0.6, aa: 0.02 },
  spg: { soft: 3.0, hard: 0.8, def: 1.2, aa: 0 },
  towed: { soft: 2.4, hard: 0.5, def: 1.0, aa: 0 },
  mlrs: { soft: 4.0, hard: 0.6, def: 0.8, aa: 0 },
  sam: { soft: 0, hard: 0, def: 0.3, aa: 3 },
  fighter: { soft: 0, hard: 0, def: 0, aa: 0 },
  attacker: { soft: 0, hard: 0, def: 0, aa: 0 },
  heli: { soft: 0, hard: 0, def: 0, aa: 0 },
  carrier: { soft: 0, hard: 0, def: 0, aa: 0 },
  destroyer: { soft: 0, hard: 0, def: 0, aa: 0 },
  frigate: { soft: 0, hard: 0, def: 0, aa: 0 },
  submarine: { soft: 0, hard: 0, def: 0, aa: 0 },
};
const ARMORED: EquipCat[] = ['tank', 'ifv', 'apc', 'spg', 'mlrs'];

export interface DivStats {
  soft: number;
  hard: number;
  def: number;
  aa: number;
  armor: number;
  pierce: number;
  hardness: number;
  speed: number; // km/day
  reqMen: number;
  fill: number; // 0..1 overall equipment+men fill
}

const statCache = new WeakMap<Division, { men: number; eq: string; bns: Division['battalions']; st: DivStats }>();

/**
 * Cache key: personnel + per-model equipment counts. The order of battle is keyed by identity of the
 * battalions array (every UI/AI edit replaces it); in-place edits must call invalidateDivStats().
 */
function equipKey(d: Division): string {
  let k = '';
  for (const id in d.equip) k += id + ':' + Math.round(d.equip[id] * 100) + ',';
  return k;
}

/** Drop a division's cached combat stats (call after mutating its equipment or order of battle). */
export function invalidateDivStats(d: Division): void {
  statCache.delete(d);
}

export function divStats(d: Division): DivStats {
  const men = Math.round(d.men);
  const eq = equipKey(d);
  const hit = statCache.get(d);
  if (hit && hit.men === men && hit.bns === d.battalions && hit.eq === eq) return hit.st;
  let soft = 0, hard = 0, def = 0, aa = 0, armorSum = 0, armorN = 0, pierce = 0, vehicles = 0;
  let mobW = 0, mobN = 0;
  for (const [id, n] of Object.entries(d.equip)) {
    const e = EQUIP_BY_ID[id];
    if (!e || n <= 0) continue;
    const r = e.r;
    const w = W[e.cat];
    soft += (n * (r.fire ?? 0) * w.soft) / 100;
    hard += (n * (r.at ?? 0) * w.hard) / 100;
    def += (n * ((r.prot ?? 0) * 0.5 + (r.fire ?? 0) * 0.5) * w.def) / 100;
    aa += (n * (r.aa ?? 0) * w.aa) / 100;
    if (ARMORED.includes(e.cat)) {
      armorSum += n * (r.prot ?? 0);
      armorN += n;
      vehicles += n;
      mobW += n * (r.mob ?? 50);
      mobN += n;
    }
    if (e.cat === 'tank' || e.cat === 'ifv') pierce = Math.max(pierce, r.at ?? 0);
  }
  const req = requirements(d.battalions);
  let need = 0, have = 0;
  for (const [cat, slot] of Object.entries(req.byCat)) {
    need += slot!.count;
    let h = 0;
    for (const [id, n] of Object.entries(d.equip)) if (EQUIP_BY_ID[id]?.cat === cat) h += n;
    have += Math.min(h, slot!.count);
  }
  // a division with no units has nothing to fill: treat it as 0% (not 100%)
  const menFill = req.men ? clamp(d.men / req.men, 0, 1) : 0;
  const eqFill = need ? have / need : req.men ? 1 : 0;
  const mob = mobN ? mobW / mobN : 25;
  const motorised = vehicles * 10 > req.men * 0.25;
  const st: DivStats = {
    soft: soft * (0.3 + 0.7 * menFill),
    hard: hard * (0.3 + 0.7 * menFill),
    def: def * (0.3 + 0.7 * menFill),
    aa,
    armor: armorN ? armorSum / armorN : 0,
    pierce,
    hardness: clamp((vehicles * 6) / Math.max(1, d.men), 0, 0.85),
    speed: motorised ? 25 + mob * 0.35 : 18,
    reqMen: req.men,
    fill: (menFill + eqFill) / 2,
  };
  statCache.set(d, { men, eq, bns: d.battalions, st });
  return st;
}

export function maxOrg(d: Division): number {
  const st = divStats(d);
  return clamp(25 + 75 * st.fill - (d.training > 0 ? 35 : 0), 10, 100);
}

/** Draw equipment and manpower from the national pool into a division. */
export function fillDivision(c: Country, d: Division, maxPerCat: number, instant = false): void {
  const req = requirements(d.battalions);
  for (const [cat, slot] of Object.entries(req.byCat) as [EquipCat, { count: number; preferred: Record<string, number> }][]) {
    let held = 0;
    for (const [id, n] of Object.entries(d.equip)) if (EQUIP_BY_ID[id]?.cat === cat) held += n;
    let missing = Math.min(slot.count - held, instant ? Infinity : Math.max(1, slot.count * maxPerCat));
    if (missing <= 0.5) continue;
    // preferred models first, then the best other models of the category
    const order = Object.keys(slot.preferred)
      .concat(
        Object.keys(c.stockpile)
          .filter((id) => EQUIP_BY_ID[id]?.cat === cat && !(id in slot.preferred))
          .sort((a, b) => quality(EQUIP_BY_ID[b]) - quality(EQUIP_BY_ID[a])),
      );
    for (const id of order) {
      if (missing <= 0.5) break;
      const avail = Math.floor(c.stockpile[id] ?? 0);
      if (avail <= 0) continue;
      const take = Math.min(avail, Math.ceil(missing));
      c.stockpile[id] -= take;
      d.equip[id] = (d.equip[id] ?? 0) + take;
      missing -= take;
    }
  }
  const menMissing = req.men - d.men;
  if (menMissing > 0) {
    const cap = instant ? menMissing : Math.max(50, req.men * maxPerCat);
    const take = Math.min(menMissing, cap, c.manpower * 1000);
    d.men += take;
    c.manpower -= take / 1000;
  }
}

/**
 * Re-organise a division after its order of battle changed:
 *  - equipment of categories it no longer needs goes back to the stockpile,
 *  - units of a non-designated model are swapped 1:1 for the designated model when the stockpile has it,
 *  - anything beyond the new requirement (equipment and personnel) is returned.
 * Missing equipment is then refilled gradually by the normal daily reinforcement.
 */
export function reconcileDivision(c: Country, d: Division): void {
  const req = requirements(d.battalions);
  const give = (id: string, n: number) => {
    if (n <= 0) return;
    d.equip[id] -= n;
    c.stockpile[id] = (c.stockpile[id] ?? 0) + n;
    if (d.equip[id] <= 1e-9) delete d.equip[id];
  };
  for (const id of Object.keys(d.equip)) {
    const e = EQUIP_BY_ID[id];
    const slot = e ? req.byCat[e.cat] : undefined;
    if (!slot || slot.count <= 0) give(id, d.equip[id]);
  }
  for (const [cat, slot] of Object.entries(req.byCat) as [EquipCat, { count: number; preferred: Record<string, number> }][]) {
    const heldIds = () => Object.keys(d.equip).filter((id) => EQUIP_BY_ID[id]?.cat === cat);
    // 1:1 swap of non-designated models for designated ones available in the stockpile
    for (const [want, wantN] of Object.entries(slot.preferred)) {
      let deficit = wantN - (d.equip[want] ?? 0);
      for (const id of heldIds().sort((a, b) => quality(EQUIP_BY_ID[a]) - quality(EQUIP_BY_ID[b]))) {
        if (deficit <= 0) break;
        if (id === want) continue;
        const surplusOfId = (d.equip[id] ?? 0) - (slot.preferred[id] ?? 0);
        const n = Math.min(Math.floor(surplusOfId), Math.floor(c.stockpile[want] ?? 0), Math.floor(deficit));
        if (n <= 0) continue;
        give(id, n);
        c.stockpile[want] -= n;
        d.equip[want] = (d.equip[want] ?? 0) + n;
        deficit -= n;
      }
    }
    // trim excess beyond the new requirement: non-designated (worst first) before designated surplus
    let held = heldIds().reduce((a, id) => a + d.equip[id], 0);
    const order = heldIds().sort((a, b) => {
      const pa = a in slot.preferred ? 1 : 0;
      const pb = b in slot.preferred ? 1 : 0;
      return pa - pb || quality(EQUIP_BY_ID[a]) - quality(EQUIP_BY_ID[b]);
    });
    for (const id of order) {
      if (held <= slot.count) break;
      const keepMin = Math.min(d.equip[id], slot.preferred[id] ?? 0);
      const n = Math.min(d.equip[id] - keepMin, held - slot.count);
      give(id, n);
      held -= n;
    }
    for (const id of order) {
      if (held <= slot.count) break;
      const n = Math.min(d.equip[id] ?? 0, held - slot.count);
      give(id, n);
      held -= n;
    }
  }
  if (d.men > req.men) {
    c.manpower += (d.men - req.men) / 1000;
    d.men = req.men;
  }
  statCache.delete(d);
  d.org = Math.min(d.org, maxOrg(d));
}

/** Return a division's equipment & men to the national pool (disband). */
export function disband(s: GameState, d: Division): void {
  const c = s.countries[d.owner];
  if (c) {
    for (const [id, n] of Object.entries(d.equip)) c.stockpile[id] = (c.stockpile[id] ?? 0) + Math.floor(n);
    c.manpower += d.men / 1000;
  }
  delete s.divisions[d.id];
}

// ---------- supply ----------
const supplyCache = new Map<string, { day: number; map: Map<number, number> }>();

export function supplyMap(s: GameState, tag: string): Map<number, number> {
  const hit = supplyCache.get(tag);
  if (hit && s.day - hit.day < 10 && hit.day <= s.day) return hit.map;
  const c = s.countries[tag];
  const map = new Map<number, number>();
  const friends = friendSet(s, tag);
  const ok = (pid: number) => friends.has(s.provinces[pid].controller);
  const supplyTech = c.techs.reduce((a, t) => a + (TECH_BY_ID[t]?.effects?.supply ?? 0), 0);
  const oil = c.stats.resAvail.oil ?? 1;
  const base = (0.6 + 0.4 * oil) * (1 + supplyTech);
  // multi-source BFS: capital, plus own coastal provinces act as ports for overseas supply
  const queue: [number, number][] = [];
  if (s.provinces[c.capital].controller === tag) queue.push([c.capital, 0]);
  else {
    const any = coreProvinces(tag).find((p) => s.provinces[p].controller === tag);
    if (any !== undefined) queue.push([any, 4]);
  }
  const hops = new Map<number, number>();
  for (const [p, h] of queue) hops.set(p, h);
  for (let qi = 0; qi < queue.length; qi++) {
    const [p, h] = queue[qi];
    for (const n of prov(p).adj) {
      if (hops.has(n) || !ok(n)) continue;
      hops.set(n, h + 1);
      queue.push([n, h + 1]);
    }
  }
  for (const [p, h] of hops) map.set(p, clamp((1 - h * 0.025) * base, 0.35, 1.2));
  supplyCache.set(tag, { day: s.day, map });
  navyCache.delete(tag);
  return map;
}

export function supplyAt(s: GameState, tag: string, pid: number): number {
  const m = supplyMap(s, tag);
  const v = m.get(pid);
  if (v !== undefined) return v;
  // overseas: supplied by sea if coastal and the country has a navy
  let hasNavy = navyCache.get(tag);
  if (hasNavy === undefined) {
    hasNavy = Object.values(s.fleets).some((f) => f.owner === tag && Object.values(f.ships).some((n) => n > 0));
    navyCache.set(tag, hasNavy);
  }
  if (prov(pid).coastal && hasNavy) return 0.6;
  return 0.25;
}

const navyCache = new Map<string, boolean>();

export function invalidateSupply(tags?: string[]): void {
  if (!tags) {
    supplyCache.clear();
    navyCache.clear();
    return;
  }
  for (const t of tags) supplyCache.delete(t);
}

// ---------- air & naval power ----------
export function airPower(s: GameState, side: string[], theater: string, mission: 'superiority' | 'cas'): number {
  let p = 0;
  for (const w of Object.values(s.airWings)) {
    if (!side.includes(w.owner) || w.theater !== theater || w.mission !== mission || w.count <= 0) continue;
    const e = EQUIP_BY_ID[w.equip];
    if (!e) continue;
    const r = e.r;
    p += mission === 'superiority'
      ? w.count * ((r.a2a ?? 0) + (r.stealth ?? 0) * 0.6 + (r.avionics ?? 0) * 0.4)
      : w.count * ((r.a2g ?? 0) + (r.avionics ?? 0) * 0.3);
  }
  return p;
}

export function navalPower(s: GameState, side: string[]): number {
  let p = 0;
  for (const f of Object.values(s.fleets)) {
    if (!side.includes(f.owner)) continue;
    for (const [id, n] of Object.entries(f.ships)) {
      const e = EQUIP_BY_ID[id];
      if (!e || n <= 0) continue;
      const r = e.r;
      const weight = e.cat === 'carrier' ? 4 : e.cat === 'destroyer' ? 1.6 : e.cat === 'submarine' ? 1.4 : 0.8;
      p += n * weight * ((r.sur ?? 0) + (r.asw ?? 0) + (r.aaw ?? 0) + (r.prot ?? 0)) / 4;
    }
  }
  return p;
}

function sideOf(s: GameState, tag: string, enemy: string): string[] {
  const w = s.wars.find((x) => (x.attackers.includes(tag) && x.defenders.includes(enemy)) || (x.defenders.includes(tag) && x.attackers.includes(enemy)));
  if (!w) return [tag];
  return w.attackers.includes(tag) ? w.attackers : w.defenders;
}

/** Air superiority advantage of `tag` over `enemy` above theater, -1..1. */
export function airAdvantage(s: GameState, tag: string, enemy: string, theater: string): number {
  const a = airPower(s, sideOf(s, tag, enemy), theater, 'superiority');
  const b = airPower(s, sideOf(s, enemy, tag), theater, 'superiority');
  return (a - b) / (a + b + 50);
}

export function canNavalInvade(s: GameState, tag: string, enemy: string): boolean {
  const a = navalPower(s, sideOf(s, tag, enemy));
  const b = navalPower(s, sideOf(s, enemy, tag));
  return a > b * 1.2 && a > 0;
}

// ---------- orders ----------
/** Shortest path through passable provinces (own/friendly/enemy-at-war), BFS. */
export function findPath(s: GameState, tag: string, from: number, to: number): number[] | null {
  if (from === to) return [];
  const passable = (p: number) => {
    const ctl = s.provinces[p].controller;
    return ctl === tag || friendly(s, ctl, tag) || atWar(s, ctl, tag);
  };
  if (!passable(to)) return null;
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const p = q.shift()!;
    if (p === to) break;
    for (const n of prov(p).adj) {
      if (prev.has(n) || !passable(n)) continue;
      // do not path *through* enemy territory except the final target
      const ctl = s.provinces[n].controller;
      if (n !== to && atWar(s, ctl, tag)) continue;
      prev.set(n, p);
      q.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const path: number[] = [];
  for (let p = to; p !== from; p = prev.get(p)!) path.unshift(p);
  return path;
}

export function orderMove(s: GameState, d: Division, target: number): string | null {
  if (d.inBattle && d.path.length && d.path[0] === target) return null;
  const path = findPath(s, d.owner, d.prov, target);
  if (path) {
    d.path = path;
    d.moveProgress = 0;
    d.seaMove = false;
    return null;
  }
  // amphibious landing
  const from = prov(d.prov);
  const to = prov(target);
  const ctl = s.provinces[target].controller;
  if (from.coastal && to.coastal && km(from, to) < 2500) {
    if (atWar(s, ctl, d.owner)) {
      if (!canNavalInvade(s, d.owner, ctl)) return '해군력이 부족해 상륙작전을 할 수 없습니다 (적 대비 1.2배 이상 필요).';
    } else if (!(ctl === d.owner || friendly(s, ctl, d.owner))) return '전쟁 중이 아닌 나라에는 진입할 수 없습니다.';
    d.path = [target];
    d.moveProgress = 0;
    d.seaMove = true;
    return null;
  }
  return '이동 경로가 없습니다.';
}

// ---------- daily military update ----------
export function militaryTick(s: GameState): void {
  const divs = Object.values(s.divisions);
  for (const d of divs) d.inBattle = false;

  // movement
  for (const d of divs) {
    if (!d.path.length) {
      d.entrench = Math.min(1, d.entrench + 0.015);
      continue;
    }
    d.entrench = 0;
    const next = d.path[0];
    const ctl = s.provinces[next].controller;
    const hostile = atWar(s, ctl, d.owner);
    if (!hostile && !(ctl === d.owner || friendly(s, ctl, d.owner))) {
      d.path = [];
      continue;
    }
    const sup = supplyAt(s, d.owner, d.prov);
    const st = divStats(d);
    const dist = d.seaMove ? km(prov(d.prov), prov(next)) : Math.max(30, km(prov(d.prov), prov(next)) * 0.8);
    // advancing into hostile ground (mines, drones, partisans) is far slower than moving behind your own lines
    const speed = d.seaMove ? 350 : st.speed * clamp(sup, 0.4, 1) * (d.org < 20 ? 0.5 : 1) * (hostile ? 0.3 : 1);
    if (d.moveProgress < dist) {
      d.moveProgress += speed;
      if (d.moveProgress < dist) continue;
    }
    // arrived at the border of `next`
    if (hostile) {
      const defenders = divs.filter((x) => x.prov === next && atWar(s, x.owner, d.owner));
      if (defenders.length) {
        d.inBattle = true;
        continue; // battle resolution below
      }
      capture(s, next, d.owner);
      DEBUG.undefended++;
    }
    d.prov = next;
    d.path.shift();
    d.moveProgress = 0;
    if (!d.path.length) d.seaMove = false;
  }

  // battles
  const byTarget = new Map<number, Division[]>();
  for (const d of divs) if (d.inBattle && d.path.length) {
    const t = d.path[0];
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t)!.push(d);
  }
  const battles: Battle[] = [];
  for (const [pid, allAttackers] of byTarget) {
    // combat width: at most 3 attacking divisions engage at once (strongest first); the rest wait in reserve
    const attackers = allAttackers.sort((a, b) => b.org - a.org).slice(0, 3);
    for (const x of allAttackers.slice(3)) x.inBattle = false;
    const ctl = s.provinces[pid].controller;
    const defenders = divs.filter((x) => x.prov === pid && s.divisions[x.id] && atWar(s, x.owner, attackers[0].owner));
    if (!defenders.length) continue;
    for (const x of defenders) x.inBattle = true;
    const prev = s.battles.find((b) => b.prov === pid);
    battles.push({ prov: pid, attacker: attackers[0].owner, defender: defenders[0].owner, days: (prev?.days ?? 0) + 1 });
    resolveBattle(s, pid, attackers, defenders, ctl);
  }
  s.battles = battles;

  // recovery & reinforcement
  for (const d of Object.values(s.divisions)) {
    const c = s.countries[d.owner];
    const sup = supplyAt(s, d.owner, d.prov);
    if (d.training > 0) d.training--;
    if (!d.inBattle) {
      const orgTech = c.techs.reduce((a, t) => a + (TECH_BY_ID[t]?.effects?.orgRecovery ?? 0), 0);
      d.org = Math.min(maxOrg(d), d.org + 2.5 * clamp(sup, 0.2, 1) * (1 + orgTech) * (c.stats.procurement < 0 ? 0.5 : 1));
      if (sup > 0.45) {
        // weekly: swap in designated models that arrived from production since the last re-organisation
        if (s.day % 7 === d.id % 7) reconcileDivision(c, d);
        if (divStats(d).fill < 0.995) fillDivision(c, d, 0.02);
      }
    }
  }
}

function techMod(c: Country, key: 'landAttack' | 'landDefense'): number {
  return c.techs.reduce((a, t) => a + (TECH_BY_ID[t]?.effects?.[key] ?? 0), 0);
}

function resolveBattle(s: GameState, pid: number, A: Division[], D: Division[], ctl: string): void {
  const attTag = A[0].owner;
  const defTag = D[0].owner;
  const ca = s.countries[attTag];
  const cd = s.countries[defTag];
  const theater = prov(pid).owner;
  const agg = (ds: Division[]) => {
    let soft = 0, hard = 0, def = 0, hardness = 0, armor = 0, pierce = 0, men = 0, org = 0;
    for (const d of ds) {
      const st = divStats(d);
      const o = clamp(d.org / 100, 0.1, 1);
      soft += st.soft * (0.5 + 0.5 * o);
      hard += st.hard * (0.5 + 0.5 * o);
      def += st.def * (0.5 + 0.5 * o);
      hardness += st.hardness * d.men;
      armor += st.armor * d.men;
      pierce = Math.max(pierce, st.pierce);
      men += d.men;
      org += d.org;
    }
    return { soft, hard, def, hardness: men ? hardness / men : 0, armor: men ? armor / men : 0, pierce, men, org: org / ds.length };
  };
  const a = agg(A);
  const d = agg(D);
  const supA = A.reduce((x, dv) => x + supplyAt(s, attTag, dv.prov), 0) / A.length;
  const supD = supplyAt(s, defTag, pid);
  const air = airAdvantage(s, attTag, defTag, theater);
  const casA = air > -0.3 ? airPower(s, sideOf(s, attTag, defTag), theater, 'cas') * 0.02 : 0;
  const casD = air < 0.3 ? airPower(s, sideOf(s, defTag, attTag), theater, 'cas') * 0.02 : 0;
  const entrench = D.reduce((x, dv) => x + dv.entrench, 0) / D.length;
  const amph = A.some((x) => x.seaMove) ? 0.5 : 1;

  const atkA = (a.soft * (1 - d.hardness) + a.hard * d.hardness + casA) * (1 + techMod(ca, 'landAttack')) * (1 + 0.25 * air) * clamp(supA, 0.4, 1.1) * amph;
  const atkD = (d.soft * (1 - a.hardness) + d.hard * a.hardness + casD) * 0.6 * (1 - 0.25 * air) * clamp(supD, 0.4, 1.1);
  const defD = (d.def * (1 + 0.9 * entrench) * terrainDefense(s, pid) + atkD * 0.5) * (1 + techMod(cd, 'landDefense'));
  const r = clamp(atkA / Math.max(1, defD), 0.05, 20);
  const armorEdgeA = a.armor > d.pierce + 5 ? 0.7 : 1; // attackers' armour shrugs off defenders' AT
  const armorEdgeD = d.armor > a.pierce + 5 ? 0.7 : 1;

  const orgLossD = clamp(3 * Math.pow(r, 0.9), 0.3, 15) * armorEdgeD;
  const orgLossA = clamp((3.5 / Math.pow(r, 0.9)) * 0.8, 0.3, 15) * armorEdgeA;
  const casFracD = clamp(0.0015 * Math.pow(r, 0.8), 0.0003, 0.012) * armorEdgeD;
  const casFracA = clamp((0.0015 / Math.pow(r, 0.8)) * 1.2, 0.0003, 0.012) * armorEdgeA;
  for (const dv of D) { dv.org = Math.max(0, dv.org - orgLossD); applyLosses(s, dv, casFracD); }
  for (const dv of A) { dv.org = Math.max(0, dv.org - orgLossA); applyLosses(s, dv, casFracA); }
  // air attrition in theater
  airAttrition(s, attTag, defTag, theater);

  if (D.every((x) => x.org < 5)) {
    // defenders break: retreat or surrender
    for (const dv of D) retreat(s, dv);
    capture(s, pid, attTag);
    DEBUG.won++;
    const lead = A.slice().sort((x, y) => y.org - x.org)[0];
    lead.prov = pid;
    lead.path.shift();
    lead.moveProgress = 0;
    lead.seaMove = false;
    for (const x of A) if (x !== lead && x.path[0] === pid) { x.path = []; x.moveProgress = 0; }
    if (ca.tag === s.player || cd.tag === s.player)
      log(s, `${prov(pid).name} 전투: ${ca.name}군이 ${cd.name}군을 격파하고 점령했습니다.`, [attTag, defTag]);
  } else if (A.every((x) => x.org < 10)) {
    for (const x of A) { x.path = []; x.moveProgress = 0; }
    if (ca.tag === s.player || cd.tag === s.player)
      log(s, `${prov(pid).name} 전투: ${ca.name}군의 공세가 ${cd.name}군 방어선에 막혔습니다.`, [attTag, defTag]);
  }
  void ctl;
}

/** Defensive multiplier from fortifications and urban terrain. */
export function terrainDefense(s: GameState, pid: number): number {
  const p = prov(pid);
  const urban = p.cityPop > 3e6 ? 1.4 : p.cityPop > 1e6 ? 1.25 : 1;
  return urban * (1 + (s.forts?.[pid] ?? 0));
}

function applyLosses(s: GameState, d: Division, frac: number): void {
  const c = s.countries[d.owner];
  const lostMen = d.men * frac;
  d.men -= lostMen;
  c.stats.casualties += lostMen;
  for (const id of Object.keys(d.equip)) d.equip[id] = Math.max(0, d.equip[id] * (1 - frac * 0.8));
}

function airAttrition(s: GameState, a: string, b: string, theater: string): void {
  const pa = airPower(s, [a], theater, 'superiority');
  const pb = airPower(s, [b], theater, 'superiority');
  const hit = (w: AirWing, enemy: number, own: number) => {
    if (w.theater !== theater || w.count <= 0) return;
    const loss = w.count * 0.004 * (enemy / (own + enemy + 1));
    w.count = Math.max(0, w.count - loss);
  };
  for (const w of Object.values(s.airWings)) {
    if (w.owner === a) hit(w, pb, pa);
    else if (w.owner === b) hit(w, pa, pb);
  }
}

function retreat(s: GameState, d: Division): void {
  const options = prov(d.prov).adj.filter((n) => {
    const ctl = s.provinces[n].controller;
    return (ctl === d.owner || friendly(s, ctl, d.owner)) && !s.battles.some((b) => b.prov === n);
  });
  if (!options.length) {
    // encircled: the division surrenders
    const c = s.countries[d.owner];
    c.stats.casualties += d.men * 0.3;
    if (d.owner === s.player || s.countries[s.player] && atWar(s, s.player, d.owner))
      log(s, `${c.name}의 ${d.name}이(가) ${prov(d.prov).name}에서 포위되어 항복했습니다.`, [d.owner], true);
    DEBUG.surrendered++;
    delete s.divisions[d.id];
    return;
  }
  d.prov = options[Math.floor(rand(s) * options.length)];
  d.path = [];
  d.moveProgress = 0;
  d.org = Math.max(d.org, 2);
}

export function capture(s: GameState, pid: number, by: string): void {
  const st = s.provinces[pid];
  if (st.controller === by) return;
  const prevCtl = st.controller;
  // liberate allies' own provinces back to their owner
  st.controller = friendly(s, st.owner, by) && st.owner !== by ? st.owner : by;
  const involved = new Set<string>([by, prevCtl, st.owner]);
  for (const w of s.wars) if (w.attackers.includes(by) || w.defenders.includes(by)) for (const t of [...w.attackers, ...w.defenders]) involved.add(t);
  invalidateSupply([...involved]);
  const p = prov(pid);
  if (p.capital && st.owner === prevCtl) {
    const c = s.countries[prevCtl];
    if (c) {
      c.stability = Math.max(0, c.stability - 15);
      log(s, `${s.countries[by]?.name ?? by}이(가) ${c.name}의 수도 ${p.name}을(를) 점령했습니다!`, [by, prevCtl], true);
    }
  }
}

/** Fraction (0..1) of a country's core value controlled by its enemies. */
export function occupiedShare(s: GameState, tag: string): number {
  let total = 0, lost = 0;
  for (const pid of coreProvinces(tag)) {
    if (s.provinces[pid].owner !== tag) continue;
    const v = provValue(pid);
    total += v;
    const ctl = s.provinces[pid].controller;
    if (ctl !== tag && !friendly(s, ctl, tag)) lost += v;
  }
  return total ? lost / total : 0;
}

export function ownedProvinces(s: GameState, tag: string): number[] {
  const out: number[] = [];
  s.provinces.forEach((p, i) => { if (p.owner === tag) out.push(i); });
  return out;
}

// ---------- war lifecycle ----------
export function declareWar(s: GameState, attacker: string, target: string, justified: boolean): void {
  if (atWar(s, attacker, target)) return;
  const ca = s.countries[attacker];
  const ct = s.countries[target];
  const war = { id: s.nextId++, name: `${ca.name}-${ct.name} 전쟁`, attackers: [attacker], defenders: [target], start: s.day };
  s.wars.push(war);
  addRel(s, attacker, target, -60);
  s.tension = clamp(s.tension + 15, 0, 100);
  ct.warSupport = clamp(ct.warSupport + 30, 0, 100);
  ct.stability = clamp(ct.stability + 5, 0, 100);
  log(s, `${ca.name}이(가) ${ct.name}에 선전포고했습니다!`, [attacker, target], true);
  callUpReserves(s, attacker);
  callUpReserves(s, target);
  // defensive alliances
  for (const al of s.alliances) {
    if (!al.mutualDefense || !al.members.includes(target)) continue;
    for (const m of al.members) {
      const cm = s.countries[m];
      if (!cm || !cm.alive || m === target || m === attacker || war.defenders.includes(m) || war.attackers.includes(m)) continue;
      if (s.alliances.some((x) => x.mutualDefense && x.members.includes(m) && x.members.includes(attacker))) continue;
      war.defenders.push(m);
      callUpReserves(s, m);
      cm.warSupport = clamp(cm.warSupport + 15, 0, 100);
      log(s, `${cm.name}이(가) ${al.name}에 따라 ${ct.name} 편으로 참전했습니다.`, [m, target], true);
    }
  }
  // world reaction
  for (const c of Object.values(s.countries)) {
    if (c.tag === attacker || !c.alive) continue;
    addRel(s, c.tag, attacker, justified ? -5 : -20);
  }
  invalidateSupply();
}

/** Wartime call-up: half of the trained reservists become available manpower. */
export function callUpReserves(s: GameState, tag: string): void {
  const c = s.countries[tag];
  if (!c || c.reserveK < 1) return;
  const n = c.reserveK * 0.5;
  c.reserveK -= n;
  c.manpower += n;
  if (tag === s.player) log(s, `예비군 동원령: 예비역 ${Math.round(n * 1000).toLocaleString()}명 소집`, [tag], true);
}

/** End a war. `annex` = winners keep the provinces they control. */
export function endWar(s: GameState, warId: number, winners: string[] | null, annex: boolean): void {
  const w = s.wars.find((x) => x.id === warId);
  if (!w) return;
  const members = [...w.attackers, ...w.defenders];
  s.provinces.forEach((p, i) => {
    if (!members.includes(p.owner) || !members.includes(p.controller) || p.owner === p.controller) return;
    if (annex && winners && winners.includes(p.controller) && !winners.includes(p.owner)) {
      p.owner = p.controller;
    } else {
      p.controller = p.owner;
    }
    void i;
  });
  s.wars = s.wars.filter((x) => x.id !== warId);
  // pull divisions out of foreign territory
  for (const d of Object.values(s.divisions)) {
    const st = s.provinces[d.prov];
    if (st.owner !== d.owner && !friendly(s, st.owner, d.owner)) {
      const home = s.countries[d.owner]?.capital;
      if (home !== undefined && s.provinces[home].owner === d.owner) { d.prov = home; d.path = []; }
      else delete s.divisions[d.id];
    }
    d.path = d.path.filter((p) => !s.provinces[p] || s.provinces[p].controller === d.owner || friendly(s, s.provinces[p].controller, d.owner));
  }
  for (const t of members) {
    const c = s.countries[t];
    if (!c) continue;
    if (!ownedProvinces(s, t).length) {
      c.alive = false;
      for (const d of Object.values(s.divisions)) if (d.owner === t) delete s.divisions[d.id];
      for (const wg of Object.values(s.airWings)) if (wg.owner === t) delete s.airWings[wg.id];
      for (const f of Object.values(s.fleets)) if (f.owner === t) delete s.fleets[f.id];
      log(s, `${c.name}이(가) 지도에서 사라졌습니다.`, [t], true);
    } else if (s.provinces[c.capital].owner !== t) {
      c.capital = ownedProvinces(s, t).sort((a, b) => prov(b).cityPop - prov(a).cityPop)[0];
    }
  }
  s.tension = clamp(s.tension - 10, 0, 100);
  log(s, `${w.name}이(가) ${annex ? '점령지 할양 조건으로' : '현상 유지(백색평화)로'} 종전되었습니다.`, members, true);
  invalidateSupply();
}

export function warScore(s: GameState, warId: number, side: 'attackers' | 'defenders'): number {
  const w = s.wars.find((x) => x.id === warId);
  if (!w) return 0;
  const mine = side === 'attackers' ? w.attackers : w.defenders;
  const theirs = side === 'attackers' ? w.defenders : w.attackers;
  const lostTheirs = theirs.reduce((a, t) => Math.max(a, occupiedShare(s, t)), 0);
  const lostMine = mine.reduce((a, t) => Math.max(a, occupiedShare(s, t)), 0);
  return lostTheirs - lostMine;
}

/** Daily: capitulation checks. */
export function warTick(s: GameState): void {
  for (const w of [...s.wars]) {
    for (const side of ['attackers', 'defenders'] as const) {
      const list = w[side];
      for (const t of [...list]) {
        const c = s.countries[t];
        if (!c) continue;
        const occ = occupiedShare(s, t);
        const capLost = s.provinces[c.capital].controller !== t && !friendly(s, s.provinces[c.capital].controller, t);
        const own = Object.values(s.divisions).filter((d) => d.owner === t).length;
        if (occ > 0.8 || (capLost && occ > 0.5 && c.stability < 30) || (own === 0 && occ > 0.4)) {
          const leader = list[0] === t;
          log(s, `${c.name}이(가) 항복했습니다.`, [t], true);
          if (leader) {
            const winners = side === 'attackers' ? w.defenders : w.attackers;
            endWar(s, w.id, winners, true);
            break;
          } else {
            // minor member capitulates: occupiers annex what they hold of it, it leaves the war
            s.provinces.forEach((p) => {
              if (p.owner === t && p.controller !== t && !friendly(s, p.controller, t)) p.owner = p.controller;
            });
            w[side] = list.filter((x) => x !== t);
          }
        }
      }
      if (!s.wars.includes(w)) break;
    }
  }
}
