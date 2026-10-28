import type { EquipCat } from '../data/schema';
import type { Battalion, Company, CompanyType } from './types';

export interface CompanyDef {
  type: CompanyType;
  name: string;
  cat: EquipCat | null; // main equipment category
  count: number; // main equipment count
  men: number;
}

/** 중대(포대) 편제 기준. 병력은 모두 개인화기(inf) 세트를 함께 요구한다. */
export const COMPANY_DEFS: Record<CompanyType, CompanyDef> = {
  tank: { type: 'tank', name: '전차중대', cat: 'tank', count: 14, men: 62 },
  mech: { type: 'mech', name: '기계화보병중대', cat: 'ifv', count: 14, men: 130 },
  motor: { type: 'motor', name: '차량화보병중대', cat: 'apc', count: 13, men: 130 },
  inf: { type: 'inf', name: '보병중대', cat: null, count: 0, men: 150 },
  recon: { type: 'recon', name: '수색중대', cat: 'ifv', count: 8, men: 80 },
  spg: { type: 'spg', name: '자주포포대', cat: 'spg', count: 6, men: 70 },
  towed: { type: 'towed', name: '견인포포대', cat: 'towed', count: 6, men: 90 },
  mlrs: { type: 'mlrs', name: '다연장로켓포대', cat: 'mlrs', count: 6, men: 60 },
  sam: { type: 'sam', name: '방공포대', cat: 'sam', count: 4, men: 70 },
  eng: { type: 'eng', name: '공병중대', cat: null, count: 0, men: 120 },
  hq: { type: 'hq', name: '본부중대', cat: null, count: 0, men: 100 },
  amphib: { type: 'amphib', name: '상륙돌격장갑차중대', cat: 'apc', count: 14, men: 130 },
};

export interface BattalionKind {
  id: string;
  name: string;
  companies: CompanyType[];
}

export const BATTALION_KINDS: BattalionKind[] = [
  { id: 'tank_bn', name: '전차대대', companies: ['hq', 'tank', 'tank', 'tank'] },
  { id: 'mech_bn', name: '기계화보병대대', companies: ['hq', 'mech', 'mech', 'mech'] },
  { id: 'motor_bn', name: '차량화보병대대', companies: ['hq', 'motor', 'motor', 'motor'] },
  { id: 'inf_bn', name: '보병대대', companies: ['hq', 'inf', 'inf', 'inf', 'inf'] },
  { id: 'recon_bn', name: '수색대대', companies: ['hq', 'recon', 'recon', 'recon'] },
  { id: 'spg_bn', name: '자주포대대', companies: ['hq', 'spg', 'spg', 'spg'] },
  { id: 'towed_bn', name: '견인포대대', companies: ['hq', 'towed', 'towed', 'towed'] },
  { id: 'mlrs_bn', name: '다연장로켓대대', companies: ['hq', 'mlrs', 'mlrs', 'mlrs'] },
  { id: 'sam_bn', name: '방공대대', companies: ['hq', 'sam', 'sam', 'sam'] },
  { id: 'eng_bn', name: '공병대대', companies: ['hq', 'eng', 'eng', 'eng'] },
  { id: 'amphib_bn', name: '상륙돌격대대', companies: ['hq', 'amphib', 'amphib', 'amphib'] },
];

export const BATTALION_BY_ID: Record<string, BattalionKind> = Object.fromEntries(
  BATTALION_KINDS.map((b) => [b.id, b]),
);

export function makeBattalion(kindId: string, equipByCat: Partial<Record<EquipCat, string>>, no?: number): Battalion {
  const kind = BATTALION_BY_ID[kindId];
  const companies: Company[] = kind.companies.map((t) => {
    const def = COMPANY_DEFS[t];
    return def.cat ? { type: t, equip: equipByCat[def.cat] } : { type: t };
  });
  return { name: no ? `제${no}${kind.name}` : kind.name, kind: kindId, companies };
}

/** Division archetypes used for starting armies and default templates. */
export const DIVISION_ARCHETYPES: Record<string, { name: string; bns: [string, number][] }> = {
  armored: {
    name: '기갑사단',
    bns: [['tank_bn', 4], ['mech_bn', 3], ['recon_bn', 1], ['spg_bn', 3], ['mlrs_bn', 1], ['sam_bn', 1], ['eng_bn', 1]],
  },
  mech: {
    name: '기계화보병사단',
    bns: [['tank_bn', 2], ['mech_bn', 5], ['recon_bn', 1], ['spg_bn', 3], ['mlrs_bn', 1], ['sam_bn', 1], ['eng_bn', 1]],
  },
  inf: {
    name: '보병사단',
    bns: [['inf_bn', 9], ['tank_bn', 1], ['recon_bn', 1], ['towed_bn', 3], ['eng_bn', 1]],
  },
  marine: {
    name: '해병사단',
    bns: [['inf_bn', 6], ['amphib_bn', 2], ['tank_bn', 1], ['spg_bn', 2], ['eng_bn', 1]],
  },
  airborne: {
    name: '공수사단',
    bns: [['inf_bn', 9], ['towed_bn', 2], ['eng_bn', 1]],
  },
};

export function buildArchetype(arch: string, equipByCat: Partial<Record<EquipCat, string>>): Battalion[] {
  const a = DIVISION_ARCHETYPES[arch];
  const out: Battalion[] = [];
  const counters: Record<string, number> = {};
  for (const [kind, n] of a.bns) {
    for (let i = 0; i < n; i++) {
      counters[kind] = (counters[kind] ?? 0) + 1;
      out.push(makeBattalion(kind, equipByCat, counters[kind]));
    }
  }
  return out;
}

/** Equipment requirement of a set of battalions: preferred model -> count, plus personnel. */
export function requirements(battalions: Battalion[]): {
  byCat: Partial<Record<EquipCat, { count: number; preferred: Record<string, number> }>>;
  men: number;
} {
  const byCat: Partial<Record<EquipCat, { count: number; preferred: Record<string, number> }>> = {};
  let men = 0;
  for (const b of battalions)
    for (const c of b.companies) {
      const def = COMPANY_DEFS[c.type];
      men += def.men;
      if (def.cat && def.count > 0) {
        const slot = (byCat[def.cat] ??= { count: 0, preferred: {} });
        slot.count += def.count;
        if (c.equip) slot.preferred[c.equip] = (slot.preferred[c.equip] ?? 0) + def.count;
      }
    }
  const inf = (byCat.inf ??= { count: 0, preferred: {} });
  inf.count += men;
  return { byCat, men };
}

export function companyCount(battalions: Battalion[]): number {
  return battalions.reduce((s, b) => s + b.companies.length, 0);
}
