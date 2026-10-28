// Static data schema (equipment catalog, tech tree, country scenario data).
// Runtime simulation state lives in src/sim/types.ts.

/** Equipment categories. Land categories are used in companies, air in squadrons, naval in fleets. */
export type EquipCat =
  | 'inf' // 보병 화기 세트 (1 unit = 1 soldier's kit)
  | 'tank' // 전차
  | 'ifv' // 보병전투차
  | 'apc' // 장갑차 / 상륙돌격장갑차
  | 'spg' // 자주포
  | 'towed' // 견인포
  | 'mlrs' // 다연장로켓
  | 'sam' // 지대공 미사일 / 방공
  | 'fighter' // 전투기 / 다목적 전투기
  | 'attacker' // 공격기 / 폭격기
  | 'heli' // 공격헬기
  | 'carrier' // 항공모함
  | 'destroyer' // 구축함 / 순양함
  | 'frigate' // 호위함 / 초계함
  | 'submarine'; // 잠수함

export const LAND_CATS: EquipCat[] = ['inf', 'tank', 'ifv', 'apc', 'spg', 'towed', 'mlrs', 'sam'];
export const AIR_CATS: EquipCat[] = ['fighter', 'attacker', 'heli'];
export const NAVAL_CATS: EquipCat[] = ['carrier', 'destroyer', 'frigate', 'submarine'];

export type Resource = 'steel' | 'oil' | 'chips' | 'rare';

/**
 * Ratings are on a 0-100 scale relative to the best in-service system of the same category in 2026.
 * Land  (inf/tank/ifv/apc/spg/towed/mlrs/sam): fire (vs soft targets), at (anti-armour), prot (protection), mob (mobility), aa (anti-air)
 * Air   (fighter/attacker/heli):               a2a, a2g, stealth, avionics, range
 * Naval (carrier/destroyer/frigate/submarine): sur (anti-ship), asw, aaw, land (land attack), prot (survivability), stealth
 */
export interface Equipment {
  id: string; // lowercase snake id, e.g. 'k2', 'm1a2_sepv3'
  name: string; // display name, e.g. 'K2 흑표'
  cat: EquipCat;
  origin: string; // ISO3 of the designer country, e.g. 'KOR'
  partners?: string[]; // joint programs: other ISO3s that may also produce it without a license
  year: number; // year the variant entered service (future programs allowed, e.g. 2032)
  tech: string; // Tech.id required to produce it
  cost: number; // unit cost in million USD (inf: per soldier kit, e.g. 0.004)
  r: Record<string, number>; // ratings, see above
  needs: Partial<Record<Resource, number>>; // relative resource intensity 0..1
  perLineYear: number; // max units per production line per year
  desc: string; // one short Korean sentence
}

export type TechCat = 'armor' | 'land' | 'artillery' | 'air' | 'naval' | 'electronics' | 'industry' | 'missile';

export type ModKey =
  | 'industryCap' // +x fraction defence-industry capacity
  | 'researchSpeed'
  | 'gdpGrowth' // +x percentage points annual growth
  | 'supply' // +x fraction supply throughput
  | 'landAttack'
  | 'landDefense'
  | 'airPower'
  | 'navalPower'
  | 'orgRecovery'
  | 'prodEfficiency'; // production line efficiency cap bonus

export interface Tech {
  id: string;
  name: string; // Korean
  cat: TechCat;
  year: number; // historical year the technology matured; countries start with techs <= their techYear
  cost: number; // research points
  req: string[]; // prerequisite tech ids
  desc: string; // Korean one-liner
  effects?: Partial<Record<ModKey, number>>;
}

export type GovType = 'democracy' | 'hybrid' | 'authoritarian';
export type Conscription = 'volunteer' | 'conscript' | 'extended' | 'total';

export interface PartyData {
  name: string;
  seats: number;
  econ: number; // -1 (left) .. 1 (right)
  hawk: number; // -1 (dovish) .. 1 (hawkish)
  gov: boolean; // part of government / ruling coalition at start
}

/** Hand-authored scenario data for important countries (start date 2026-01-01). */
export interface CountryData {
  tag: string; // ISO3
  name?: string; // Korean display name override (e.g. '북한')
  color?: string; // map colour, hex
  gdp: number; // nominal GDP, billion USD
  pop: number; // millions
  growth: number; // baseline real growth, % per year
  gov: GovType;
  leader: string; // head of government (Korean transliteration)
  leaderTitle: string; // '대통령', '총리', ...
  parliament: string; // legislature name
  parties: PartyData[];
  electionYear?: number; // next general legislative election year (democracies)
  electionEvery?: number; // years
  tax: number; // government revenue, % of GDP
  budget: { military: number; welfare: number; research: number; infra: number }; // % of GDP
  debt: number; // public debt, % of GDP
  milActive: number; // active personnel, thousands
  reserve: number; // reserve personnel, thousands
  conscription: Conscription;
  defIndustry: number; // defence industry output capacity, billion USD / year
  resources: Record<Resource, number>; // domestic self-sufficiency ratio (1 = fully self-sufficient, >1 exporter)
  techYear: number; // technological level: knows all techs with year <= techYear
  extraTechs?: string[];
  licenses?: string[]; // equipment ids it can produce under license
  divisions: { armored?: number; mech?: number; inf?: number; marine?: number; airborne?: number }; // active army divisions (division-equivalents)
  inventory: Record<string, number>; // equipment id -> count in service (land, air and naval)
  alliances: string[]; // alliance ids, see ALLIANCES
}

export interface AllianceData {
  id: string;
  name: string;
  members: string[];
  mutualDefense: boolean;
}
