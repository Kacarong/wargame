import { EQUIPMENT, EQUIP_BY_ID } from '../data/equipment';
import { TECHS } from '../data/tech';
import type { EquipCat, Equipment, Tech } from '../data/schema';
import type { Country } from './types';

export const TECH_BY_ID: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function eq(id: string): Equipment {
  const e = EQUIP_BY_ID[id];
  if (!e) throw new Error(`unknown equipment ${id}`);
  return e;
}

/** Overall quality score of an equipment item (0-100), used for "best model" choices. */
export function quality(e: Equipment): number {
  const r = e.r;
  switch (e.cat) {
    case 'inf':
      return r.fire ?? 50;
    case 'tank':
      return (r.fire ?? 0) * 0.3 + (r.at ?? 0) * 0.3 + (r.prot ?? 0) * 0.3 + (r.mob ?? 0) * 0.1;
    case 'ifv':
    case 'apc':
      return (r.fire ?? 0) * 0.35 + (r.at ?? 0) * 0.15 + (r.prot ?? 0) * 0.35 + (r.mob ?? 0) * 0.15;
    case 'spg':
    case 'towed':
    case 'mlrs':
      return (r.fire ?? 0) * 0.7 + (r.mob ?? 0) * 0.2 + (r.prot ?? 0) * 0.1;
    case 'sam':
      return r.aa ?? 0;
    case 'fighter':
      return (r.a2a ?? 0) * 0.45 + (r.a2g ?? 0) * 0.15 + (r.stealth ?? 0) * 0.2 + (r.avionics ?? 0) * 0.2;
    case 'attacker':
    case 'heli':
      return (r.a2g ?? 0) * 0.6 + (r.avionics ?? 0) * 0.2 + (r.stealth ?? 0) * 0.2;
    default:
      return (r.sur ?? 0) * 0.25 + (r.asw ?? 0) * 0.2 + (r.aaw ?? 0) * 0.25 + (r.land ?? 0) * 0.1 + (r.prot ?? 0) * 0.2;
  }
}

const NO_EXPORT = new Set([
  'f22a', 'b2', 'b21', 'b52h', 'b1b', 'tu160', 'tu95ms', 'tu22m3', 'h6k', 'h20', 'f47', 'j20', 'j20a', 'type055',
  'ford', 'nimitz', 'type003', 'type002', 'virginia', 'columbia', 'yasen_m', 'borei_a', 'type093b', 'type094a',
  'ohio', 'seawolf', 'astute', 'sinpo', 'zumwalt', 'kirov', 'su57', 't14',
]);

export function exportable(e: Equipment): boolean {
  if (NO_EXPORT.has(e.id)) return false;
  if (e.cat === 'carrier') return false;
  return true;
}

export function hasTech(c: Country, tech: string): boolean {
  return c.techs.includes(tech);
}

/** Current in-game year; equipment cannot be mass-produced before its real service-entry year. */
let GAME_YEAR = 2026;
export function setGameYear(y: number): void {
  GAME_YEAR = y;
}
export function gameYear(): number {
  return GAME_YEAR;
}

/** Can the country set up domestic production lines for this item? */
/** Real production lines that are closed (retired classes, ended programmes). */
const DISCONTINUED = new Set([
  'f22a', 'b2', 'b1b', 'b52h', 'tu95ms', 'tu22m3', 'f14a', 'il28', 'mig21', 'mig23', 'f4e', 'f5e', 'f15c', 'su24m', 'tornado',
  'sa2', 'sa3', 'hawk', 'm48a5', 'm60a3', 't55', 't62m', 'type59', 'kirov', 'slava', 'ticonderoga', 'seawolf', 'ohio',
  'nimitz', 'oliver_perry', 'la_class', 'akula', 'oscar2', 'sovremenny', 'udaloy', 'kidd', 'kuznetsov', 'cdg', 'wasp',
  'vanguard', 'triomphant', 'romeo', 'krivak', 'najin', 'kdx1', 'pohang', 'type209', 'kilo877', 'm101', 'm114', 'd20', 'm46',
]);

export function discontinued(e: Equipment): boolean {
  return DISCONTINUED.has(e.id) || e.year < GAME_YEAR - 40;
}

export function canProduce(c: Country, e: Equipment): boolean {
  if (e.year > GAME_YEAR || discontinued(e)) return false;
  if (!hasTech(c, e.tech)) return false;
  if (e.origin === c.tag) return true;
  if (e.partners?.includes(c.tag)) return true;
  return c.licenses.includes(e.id);
}

export function producible(c: Country): Equipment[] {
  return EQUIPMENT.filter((e) => canProduce(c, e));
}

export function equipOfCat(cat: EquipCat): Equipment[] {
  return EQUIPMENT.filter((e) => e.cat === cat);
}

/** Best model of a category the country owns in its stockpile (by quality, requiring at least `min` units). */
export function bestInStock(c: Country, cat: EquipCat, min = 1): string | undefined {
  let best: Equipment | undefined;
  for (const [id, n] of Object.entries(c.stockpile)) {
    if (n < min) continue;
    const e = EQUIP_BY_ID[id];
    if (!e || e.cat !== cat) continue;
    if (!best || quality(e) > quality(best)) best = e;
  }
  return best?.id;
}

/** Best model of a category the country could field: in stock, producible, or held by divisions. */
export function preferredModel(c: Country, cat: EquipCat): string | undefined {
  const prod = producible(c)
    .filter((e) => e.cat === cat && e.year <= 2026 + 1)
    .sort((a, b) => quality(b) - quality(a))[0];
  const stock = bestInStock(c, cat, 20);
  if (prod && (!stock || quality(prod) >= quality(EQUIP_BY_ID[stock]))) return prod.id;
  return stock ?? prod?.id;
}

export function catName(cat: EquipCat): string {
  return CAT_NAMES[cat];
}

export const CAT_NAMES: Record<EquipCat, string> = {
  inf: '개인화기',
  tank: '전차',
  ifv: '보병전투차',
  apc: '장갑차',
  spg: '자주포',
  towed: '견인포',
  mlrs: '다연장로켓',
  sam: '방공무기',
  fighter: '전투기',
  attacker: '공격기·폭격기',
  heli: '공격헬기',
  carrier: '항공모함',
  destroyer: '구축함',
  frigate: '호위함',
  submarine: '잠수함',
};
