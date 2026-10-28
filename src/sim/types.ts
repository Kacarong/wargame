import type { AllianceData, Conscription, EquipCat, GovType, Resource } from '../data/schema';

export interface Party {
  name: string;
  seats: number;
  econ: number;
  hawk: number;
  gov: boolean;
}

export type EconomyLaw = 'civilian' | 'partial' | 'war';
export type TradeLaw = 'free' | 'balanced' | 'protection';
export type PressLaw = 'free' | 'limited' | 'controlled';

export interface Laws {
  conscription: Conscription;
  economy: EconomyLaw;
  trade: TradeLaw;
  press: PressLaw;
}

export interface Budget {
  military: number; // % of GDP
  welfare: number;
  research: number;
  infra: number;
}

export interface ProductionLine {
  id: number;
  equip: string;
  lines: number; // number of factory lines assigned
  eff: number; // 0..1 production efficiency (ramps up)
  progress: number; // fractional units produced but not yet delivered
}

export interface Purchase {
  id: number;
  equip: string;
  qty: number;
  from: string;
  daysLeft: number;
}

export interface ResearchSlot {
  tech: string;
  progress: number; // research points accumulated
}

export type CompanyType =
  | 'tank'
  | 'mech'
  | 'motor'
  | 'inf'
  | 'recon'
  | 'spg'
  | 'towed'
  | 'mlrs'
  | 'sam'
  | 'eng'
  | 'hq'
  | 'amphib';

export interface Company {
  type: CompanyType;
  equip?: string; // preferred equipment model for the company's main vehicle/weapon
}

export interface Battalion {
  name: string;
  kind: string; // battalion kind id (see units.ts)
  companies: Company[];
}

export interface DivisionTemplate {
  id: number;
  name: string;
  battalions: Battalion[];
}

export interface Division {
  id: number;
  owner: string;
  name: string;
  battalions: Battalion[];
  prov: number;
  path: number[]; // remaining provinces to move through
  moveProgress: number; // km travelled towards path[0]
  equip: Record<string, number>; // equipment actually held
  men: number; // personnel actually held
  org: number; // 0..100 organisation
  training: number; // days of training remaining
  corps: number | null;
  entrench: number; // 0..1
  inBattle: boolean;
  seaMove?: boolean; // current move is an amphibious landing
}

export interface Corps {
  id: number;
  owner: string;
  name: string;
  commander: string;
}

export type AirMission = 'superiority' | 'cas' | 'idle';

export interface AirWing {
  id: number;
  owner: string;
  name: string;
  equip: string;
  count: number;
  theater: string | null; // country tag whose airspace it operates over
  mission: AirMission;
}

export interface Fleet {
  id: number;
  owner: string;
  name: string;
  ships: Record<string, number>;
}

export interface War {
  id: number;
  name: string;
  attackers: string[];
  defenders: string[];
  start: number;
}

export type BillKind = 'law' | 'budget' | 'war' | 'peace';

export interface Bill {
  id: number;
  country: string;
  kind: BillKind;
  title: string;
  daysLeft: number;
  // payloads
  law?: Partial<Laws>;
  budget?: Budget;
  tax?: number;
  target?: string;
  stance: { econ: number; hawk: number };
  result?: { yes: number; no: number; passed: boolean };
}

export interface Justification {
  target: string;
  daysLeft: number;
}

export interface CountryStats {
  revenue: number; // B$/yr
  spending: number; // B$/yr
  personnelCost: number;
  procurement: number; // B$/yr available for procurement
  prodSpending: number; // B$/yr actually spent on production
  rpPerDay: number;
  growth: number; // % annual
  resAvail: Record<Resource, number>;
  supplyOk: number; // average supply level of divisions
  casualties: number; // cumulative personnel lost
}

export interface Country {
  tag: string;
  name: string;
  color: string;
  detailed: boolean;
  gov: GovType;
  leader: string;
  leaderTitle: string;
  parliament: string;
  parties: Party[];
  nextElection: number | null; // day index
  electionEvery: number;
  gdp: number; // B$
  pop: number; // millions
  baseGrowth: number;
  tax: number;
  budget: Budget;
  debt: number; // B$
  laws: Laws;
  approval: number;
  stability: number;
  warSupport: number;
  manpower: number; // available recruitable personnel (thousands)
  reserveK: number; // trained reservists not yet called up (thousands)
  defIndustry: number; // B$/yr base capacity
  mobilization: number; // 0..1 ramp toward economy law target
  resources: Record<Resource, number>;
  techs: string[];
  research: ResearchSlot[];
  licenses: string[];
  stockpile: Record<string, number>;
  lines: ProductionLine[];
  purchases: Purchase[];
  templates: DivisionTemplate[];
  justifications: Justification[];
  capital: number;
  alive: boolean;
  stats: CountryStats;
  baseTax: number;
  baseWelfare: number;
  /** Fixed other government spending (education, administration, health...), % of GDP. */
  otherSpend: number;
  /** Starting-point economic reference values (set on first economy tick). */
  base?: { infra: number; research: number; stability: number; mob: number; sanc: number; oil: number; chips: number; debt: number; consc: number; trade: number };
}

export interface ProvinceState {
  owner: string;
  controller: string;
}

export interface Battle {
  prov: number;
  attacker: string;
  defender: string;
  days: number;
}

export interface LogEntry {
  day: number;
  text: string;
  tags: string[];
  important?: boolean;
}

export interface GameState {
  version: number;
  day: number; // days since 2026-01-01
  player: string;
  countries: Record<string, Country>;
  provinces: ProvinceState[];
  divisions: Record<number, Division>;
  corps: Record<number, Corps>;
  airWings: Record<number, AirWing>;
  fleets: Record<number, Fleet>;
  wars: War[];
  alliances: AllianceData[];
  relations: Record<string, number>;
  sanctions: Record<string, string[]>;
  bills: Bill[];
  battles: Battle[];
  log: LogEntry[];
  nextId: number;
  tension: number;
  seed: number;
  forts: Record<number, number>; // province -> fortification level 0..1 (defence +100% at 1)
  gameOver?: string;
}

/** Static (not saved) world geometry & metadata. */
export interface ProvinceStatic {
  id: number;
  owner: string;
  name: string;
  cityPop: number;
  capital: boolean;
  area: number;
  lon: number;
  lat: number;
  cx: number;
  cy: number;
  adj: number[];
  coastal: boolean;
}

export interface CountryStatic {
  tag: string;
  name: string;
  nameEn: string;
  pop: number;
  gdpMd: number;
  area: number;
}

export interface WorldStatic {
  provinces: ProvinceStatic[];
  countries: CountryStatic[];
}

export type { EquipCat };
