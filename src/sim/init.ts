import { ALLIANCES, COUNTRY_DATA } from '../data/countries';
import { EQUIP_BY_ID } from '../data/equipment';
import { TECHS } from '../data/tech';
import type { CountryData, EquipCat, GovType, Resource } from '../data/schema';
import { AIR_CATS, NAVAL_CATS } from '../data/schema';
import { quality, setGameYear } from './equip';
import { coreProvinces, prov, world } from './world';
import type { Battalion, Country, Division, GameState, Party } from './types';
import { buildArchetype, COMPANY_DEFS, DIVISION_ARCHETYPES, requirements } from './units';
import { addRel, dayOfYear, getRel, relKey } from './util';
import { aiProduction, aiResearch, autoDeploy } from './ai';
import { fillDivision } from './military';
import { economyTick, worldGdp } from './domestic';

// ---------- generic country heuristics ----------
const AUTHORITARIAN = new Set([
  'CUB', 'VEN', 'NIC', 'SYR', 'LAO', 'KAZ', 'UZB', 'TKM', 'TJK', 'AZE', 'ERI', 'SDN', 'TCD', 'ARE', 'QAT', 'BHR',
  'OMN', 'KWT', 'LBY', 'MMR', 'AFG', 'CMR', 'GNQ', 'RWA', 'BDI', 'SDS', 'DJI', 'KHM', 'BRN', 'ETH', 'MLI', 'NER',
  'BFA', 'GIN', 'JOR', 'DZA',
]);
const HYBRID = new Set(['HUN', 'SRB', 'GEO', 'ARM', 'KGZ', 'BGD', 'THA', 'IRQ', 'LBN', 'TUN', 'MAR', 'ZWE', 'UGA', 'TZA', 'NGA', 'KEN', 'SGP', 'MYS']);
const WEST = new Set([
  'ALB', 'AUT', 'BEL', 'BGR', 'HRV', 'CZE', 'DNK', 'EST', 'HUN', 'ISL', 'IRL', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
  'MKD', 'PRT', 'ROU', 'SVK', 'SVN', 'CHE', 'NZL', 'MEX', 'COL', 'CHL', 'ARG', 'URY', 'PER', 'ECU', 'PRY', 'BOL',
  'PAN', 'CRI', 'GTM', 'HND', 'SLV', 'DOM', 'JAM', 'TTO', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'JOR', 'MAR', 'TUN',
  'THA', 'MYS', 'SGP', 'BRN', 'ISR', 'CYP', 'MLT', 'KOS', 'BIH', 'GEO', 'KEN', 'ZAF', 'BWA', 'IRQ', 'LBN',
]);
const CHINA_KIT = new Set(['BGD', 'MMR', 'LKA', 'KHM', 'TZA', 'ZWE', 'NAM', 'SDN', 'NPL']);
const OIL = new Set(['ARE', 'QAT', 'KWT', 'IRQ', 'NGA', 'AGO', 'DZA', 'LBY', 'KAZ', 'VEN', 'OMN', 'AZE', 'BRN', 'TKM', 'GAB', 'COG', 'GNQ']);

const KITS: Record<'west' | 'east' | 'china', Partial<Record<EquipCat, string>>> = {
  west: {
    inf: 'inf_m16a2', tank: 'm60a3', ifv: 'm113', apc: 'm113', spg: 'm109a5', towed: 'm114', mlrs: 'm270a2',
    sam: 'hawk', fighter: 'f16ab', attacker: 'f5e', heli: 'ah1', frigate: 'oliver_perry', submarine: 'type209',
  },
  east: {
    inf: 'inf_akm', tank: 't72a', ifv: 'bmp2', apc: 'btr80', spg: '2s1', towed: 'd30', mlrs: 'bm21', sam: 'osa',
    fighter: 'mig29', attacker: 'su25', heli: 'mi24', frigate: 'krivak', submarine: 'kilo636',
  },
  china: {
    inf: 'inf_qbz95', tank: 'type59', ifv: 'type86', apc: 'btr80', spg: '2s1', towed: 'd30', mlrs: 'bm21', sam: 'osa',
    fighter: 'mig21', attacker: 'su25', heli: 'mi24', frigate: 'type054a', submarine: 'romeo',
  },
};

const PALETTE = ['#8c6d46', '#6b8e5a', '#9b6b8e', '#5f7f9e', '#a3874f', '#7a6f9b', '#5e9b8f', '#9e6e5a', '#768a4c', '#8a5f6f', '#4f8a7a', '#9a8a6a'];
function hashColor(tag: string): string {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function genericData(tag: string): CountryData {
  const cs = world().countries.find((c) => c.tag === tag)!;
  const pop = Math.max(0.05, cs.pop / 1e6);
  const gdp = Math.max(0.3, (cs.gdpMd / 1000) * 1.3);
  const pcap = (gdp * 1e9) / (pop * 1e6);
  const gov: GovType = AUTHORITARIAN.has(tag) ? 'authoritarian' : HYBRID.has(tag) ? 'hybrid' : 'democracy';
  const mil = gov === 'authoritarian' ? 2.6 : 1.4;
  const milB = (gdp * mil) / 100;
  const perSoldier = Math.max(4000, pcap * 1.2);
  let active = Math.min(pop * 4, ((milB * 0.55) * 1e9) / perSoldier / 1000);
  active = Math.max(1, active);
  const nDiv = Math.max(0, Math.round(active / 18));
  const kitName = WEST.has(tag) ? 'west' : CHINA_KIT.has(tag) ? 'china' : 'east';
  const kit = KITS[kitName];
  const div = {
    armored: Math.round(nDiv * 0.1),
    mech: Math.round(nDiv * 0.2),
    inf: nDiv - Math.round(nDiv * 0.1) - Math.round(nDiv * 0.2),
  };
  // inventory = division needs * 1.1 + air/naval
  const inventory: Record<string, number> = {};
  const add = (id: string | undefined, n: number) => {
    if (!id || !EQUIP_BY_ID[id] || n <= 0) return;
    inventory[id] = (inventory[id] ?? 0) + Math.round(n);
  };
  for (const [arch, n] of Object.entries(div)) {
    if (!n) continue;
    const req = requirements(buildArchetype(arch, {}));
    for (const [cat, slot] of Object.entries(req.byCat)) add(kit[cat as EquipCat], slot!.count * n * 1.1);
  }
  add(kit.inf, active * 1000 * 1.2 - (inventory[kit.inf!] ?? 0));
  add(kit.fighter, Math.min(300, milB * 3));
  add(kit.heli, Math.min(80, milB));
  const coastal = coreProvinces(tag).some((p) => prov(p).coastal);
  if (coastal && milB > 1.5) {
    add(kit.frigate, Math.min(20, milB / 2));
    if (milB > 4) add(kit.submarine, Math.min(10, milB / 6));
  }
  const parties: Party[] =
    gov === 'democracy'
      ? [
          { name: '집권당', seats: 52, econ: 0.2, hawk: 0.1, gov: true },
          { name: '제1야당', seats: 38, econ: -0.2, hawk: -0.1, gov: false },
          { name: '군소정당', seats: 10, econ: 0, hawk: -0.3, gov: false },
        ]
      : [
          { name: '집권당', seats: 85, econ: 0, hawk: 0.3, gov: true },
          { name: '관제 야당', seats: 15, econ: 0, hawk: 0, gov: false },
        ];
  return {
    tag,
    gdp,
    pop,
    growth: pcap < 3000 ? 4 : pcap < 15000 ? 3 : 1.6,
    gov,
    leader: '정부 수반',
    leaderTitle: '',
    parliament: '의회',
    parties,
    electionYear: gov === 'democracy' ? 2027 + (tag.charCodeAt(0) % 3) : undefined,
    electionEvery: 4,
    tax: pcap > 30000 ? 36 : pcap > 10000 ? 26 : 17,
    budget: { military: mil, welfare: pcap > 30000 ? 17 : 7, research: 0.5, infra: 3 },
    debt: 60,
    milActive: active,
    reserve: active * 1.5,
    conscription: gov === 'authoritarian' ? 'conscript' : 'volunteer',
    defIndustry: Math.max(0.05, milB * 0.08),
    resources: { steel: 0.5, oil: OIL.has(tag) ? 2.5 : 0.3, chips: 0.1, rare: 0.2 },
    techYear: pcap > 30000 ? 2012 : pcap > 10000 ? 2003 : 1992,
    divisions: div,
    inventory,
    alliances: [],
  };
}

// ---------- tech start ----------
function startTechs(d: CountryData): string[] {
  const set = new Set<string>();
  for (const t of TECHS) if (t.year <= d.techYear) set.add(t.id);
  for (const t of d.extraTechs ?? []) set.add(t);
  // equipment of own design that is already in service implies the tech (and its prerequisites)
  for (const id of Object.keys(d.inventory)) {
    const e = EQUIP_BY_ID[id];
    if (e && (e.origin === d.tag || e.partners?.includes(d.tag) || d.licenses?.includes(id))) set.add(e.tech);
  }
  // close prerequisites
  const byId = Object.fromEntries(TECHS.map((t) => [t.id, t]));
  const stack = [...set];
  while (stack.length) {
    const t = byId[stack.pop()!];
    if (!t) continue;
    for (const r of t.req) if (!set.has(r)) { set.add(r); stack.push(r); }
  }
  return [...set];
}

function makeCountry(d: CountryData, detailed: boolean): Country {
  const cs = world().countries.find((c) => c.tag === d.tag)!;
  const capital = coreProvinces(d.tag).find((p) => prov(p).capital) ?? coreProvinces(d.tag)[0];
  const pcapK = (d.gdp * 1e9) / (d.pop * 1e6) / 1000;
  const conscriptRate = { volunteer: 0.015, conscript: 0.03, extended: 0.06, total: 0.12 }[d.conscription];
  const c: Country = {
    tag: d.tag,
    name: d.name ?? cs.name,
    color: d.color ?? hashColor(d.tag),
    detailed,
    gov: d.gov,
    leader: d.leader,
    leaderTitle: d.leaderTitle,
    parliament: d.parliament,
    parties: d.parties.map((p) => ({ ...p })),
    nextElection: d.electionYear ? dayOfYear(d.electionYear, 4, 10) : null,
    electionEvery: d.electionEvery ?? 4,
    gdp: d.gdp,
    pop: d.pop,
    baseGrowth: d.growth,
    tax: d.tax,
    budget: { ...d.budget },
    debt: (d.debt / 100) * d.gdp,
    laws: {
      conscription: d.conscription,
      economy: d.budget.military > 10 ? 'war' : d.budget.military > 5 ? 'partial' : 'civilian',
      trade: 'balanced',
      press: d.gov === 'democracy' ? 'free' : d.gov === 'hybrid' ? 'limited' : 'controlled',
    },
    approval: d.gov === 'democracy' ? 45 : 60,
    stability: d.gov === 'democracy' ? 65 : 60,
    warSupport: 35 + d.budget.military * 3,
    manpower: Math.max(1, d.pop * 1000 * conscriptRate * 0.3 + d.reserve * 0.2),
    reserveK: d.reserve,
    defIndustry: d.defIndustry,
    mobilization: 0,
    resources: { ...d.resources } as Record<Resource, number>,
    techs: startTechs(d),
    research: [],
    licenses: [...(d.licenses ?? [])],
    stockpile: { ...d.inventory },
    lines: [],
    purchases: [],
    templates: [],
    justifications: [],
    capital,
    alive: true,
    stats: {
      revenue: 0, spending: 0, personnelCost: 0, procurement: 0, prodSpending: 0, rpPerDay: 0,
      growth: d.growth, resAvail: { steel: 1, oil: 1, chips: 1, rare: 1 }, supplyOk: 1, casualties: 0,
    },
    baseTax: d.tax,
    baseWelfare: d.budget.welfare,
    otherSpend: 0,
  };
  c.mobilization = c.laws.economy === 'war' ? 1 : c.laws.economy === 'partial' ? 0.5 : 0;
  // calibrate fixed other spending so the starting deficit is realistic (~2.5% of GDP, USA ~6%)
  const deficit = { USA: 6, JPN: 3, CHN: 4, UKR: 0, FRA: 5, ITA: 3.5, GBR: 4.5, BRA: 7, IND: 5 }[d.tag as string] ?? 2.5;
  const interestPct = (d.debt / 100) * (0.018 + Math.max(0, d.debt / 100 - 1.3) * 0.004) * 100;
  const four = d.budget.military + d.budget.welfare + d.budget.research + d.budget.infra;
  c.otherSpend = Math.max(0, d.tax - four - interestPct + deficit);
  void pcapK;
  return c;
}

const ORDINAL_ARCH: [string, string][] = [
  ['armored', '기갑사단'],
  ['mech', '기계화보병사단'],
  ['marine', '해병사단'],
  ['airborne', '공수사단'],
  ['inf', '보병사단'],
];

function equipByCatFor(c: Country): Partial<Record<EquipCat, string>> {
  const out: Partial<Record<EquipCat, string>> = {};
  for (const [id, n] of Object.entries(c.stockpile)) {
    const e = EQUIP_BY_ID[id];
    if (!e || n <= 0) continue;
    const cur = out[e.cat];
    if (!cur || quality(e) > quality(EQUIP_BY_ID[cur])) out[e.cat] = id;
  }
  return out;
}

/** Assign company preferred models from the stockpile best-first, so mixed fleets (K2/K1A2/K1E1) are spread realistically. */
function assignModels(bns: Battalion[], reserve: Record<string, number>): void {
  for (const b of bns)
    for (const comp of b.companies) {
      const def = COMPANY_DEFS[comp.type];
      if (!def.cat) continue;
      const cands = Object.entries(reserve)
        .filter(([id, n]) => EQUIP_BY_ID[id]?.cat === def.cat && n > 0)
        .sort((a, b2) => quality(EQUIP_BY_ID[b2[0]]) - quality(EQUIP_BY_ID[a[0]]));
      const pick = cands.find(([, n]) => n >= def.count) ?? cands[0];
      if (pick) {
        comp.equip = pick[0];
        reserve[pick[0]] -= def.count;
      }
    }
}

function createStartingArmy(s: GameState, c: Country, d: CountryData): void {
  const reserve = { ...c.stockpile };
  const base = equipByCatFor(c);
  let corpsNo = 0;
  let inCorps = 4;
  let corpsId: number | null = null;
  const counters: Record<string, number> = {};
  for (const [arch, label] of ORDINAL_ARCH) {
    const n = (d.divisions as Record<string, number | undefined>)[arch] ?? 0;
    for (let i = 0; i < n; i++) {
      counters[arch] = (counters[arch] ?? 0) + 1;
      const bns = buildArchetype(arch, base);
      assignModels(bns, reserve);
      if (inCorps >= 4) {
        corpsNo++;
        corpsId = s.nextId++;
        s.corps[corpsId] = { id: corpsId, owner: c.tag, name: `제${corpsNo}군단`, commander: '-' };
        inCorps = 0;
      }
      inCorps++;
      const div: Division = {
        id: s.nextId++,
        owner: c.tag,
        name: `제${counters[arch]}${label}`,
        battalions: bns,
        prov: c.capital,
        path: [],
        moveProgress: 0,
        equip: {},
        men: 0,
        org: 70,
        training: 0,
        corps: corpsId,
        entrench: 0.5,
        inBattle: false,
      };
      s.divisions[div.id] = div;
      fillDivision(c, div, 1e9, true);
    }
  }
  // default templates from archetypes
  let tid = 1;
  for (const [arch, a] of Object.entries(DIVISION_ARCHETYPES)) {
    c.templates.push({ id: tid++, name: `표준 ${a.name}`, battalions: buildArchetype(arch, base) });
  }
  // air wings
  for (const [id, n] of Object.entries({ ...c.stockpile })) {
    const e = EQUIP_BY_ID[id];
    if (!e || !AIR_CATS.includes(e.cat) || n <= 0) continue;
    const size = e.cat === 'heli' ? 12 : e.cat === 'attacker' ? 16 : 20;
    let left = n;
    let k = 0;
    while (left > 0) {
      const cnt = Math.min(size, left);
      left -= cnt;
      k++;
      const wid = s.nextId++;
      const kind = e.cat === 'heli' ? '공격헬기대대' : e.cat === 'attacker' ? '공격비행대대' : '전투비행대대';
      s.airWings[wid] = { id: wid, owner: c.tag, name: `${e.name} ${kind} ${k}`, equip: id, count: cnt, theater: null, mission: 'superiority' };
      if (e.cat !== 'fighter') s.airWings[wid].mission = 'cas';
    }
    c.stockpile[id] = 0;
  }
  // fleet
  const ships: Record<string, number> = {};
  for (const [id, n] of Object.entries({ ...c.stockpile })) {
    const e = EQUIP_BY_ID[id];
    if (!e || !NAVAL_CATS.includes(e.cat) || n <= 0) continue;
    ships[id] = n;
    c.stockpile[id] = 0;
  }
  if (Object.keys(ships).length) {
    const fid = s.nextId++;
    s.fleets[fid] = { id: fid, owner: c.tag, name: `${c.name} 주력함대`, ships };
  }
  for (const k of Object.keys(c.stockpile)) if (c.stockpile[k] <= 0) delete c.stockpile[k];
}

const RIVALS: [string, string, number][] = [
  ['KOR', 'PRK', -80], ['USA', 'PRK', -75], ['JPN', 'PRK', -65], ['USA', 'IRN', -70], ['ISR', 'IRN', -90],
  ['USA', 'RUS', -50], ['USA', 'CHN', -30], ['CHN', 'TWN', -60], ['IND', 'PAK', -60], ['RUS', 'UKR', -100],
  ['BLR', 'UKR', -60], ['JPN', 'CHN', -25], ['KOR', 'JPN', 25], ['KOR', 'USA', 70], ['JPN', 'USA', 70],
  ['SAU', 'IRN', -30], ['ARM', 'AZE', -60], ['GRC', 'TUR', -15], ['CHN', 'IND', -25], ['RUS', 'PRK', 60],
  ['CHN', 'PRK', 40], ['CHN', 'RUS', 50], ['IRN', 'RUS', 40], ['BLR', 'RUS', 85], ['CHN', 'PAK', 60],
  ['USA', 'ISR', 75], ['USA', 'TWN', 40], ['JPN', 'TWN', 30], ['USA', 'UKR', 40], ['GBR', 'UKR', 60],
  ['DEU', 'UKR', 55], ['FRA', 'UKR', 55], ['POL', 'UKR', 50], ['POL', 'RUS', -70], ['FIN', 'RUS', -60],
  ['PHL', 'CHN', -30], ['VNM', 'CHN', -15], ['IND', 'RUS', 30], ['IND', 'USA', 30], ['EGY', 'USA', 30],
  ['SAU', 'USA', 45], ['KOR', 'CHN', 5], ['KOR', 'RUS', -15],
];

export function newGame(player: string): GameState {
  setGameYear(2026);
  const s: GameState = {
    version: 1,
    day: 0,
    player,
    countries: {},
    provinces: world().provinces.map((p) => ({ owner: p.owner, controller: p.owner })),
    divisions: {},
    corps: {},
    airWings: {},
    fleets: {},
    wars: [],
    alliances: ALLIANCES.map((a) => ({ ...a, members: [...a.members] })),
    relations: {},
    sanctions: {},
    bills: [],
    battles: [],
    log: [],
    nextId: 1,
    tension: 35,
    seed: 20260101,
    forts: {},
  };
  const detailed = new Map(COUNTRY_DATA.map((d) => [d.tag, d]));
  for (const cs of world().countries) {
    const d = detailed.get(cs.tag) ?? genericData(cs.tag);
    const c = makeCountry(d, detailed.has(cs.tag));
    s.countries[c.tag] = c;
    createStartingArmy(s, c, d);
  }
  // relations
  for (const a of s.alliances)
    for (const x of a.members)
      for (const y of a.members) if (x < y && s.countries[x] && s.countries[y]) addRel(s, x, y, a.mutualDefense ? 55 : 35);
  for (const [a, b, v] of RIVALS) if (s.countries[a] && s.countries[b]) s.relations[relKey(a, b)] = v;
  const nato = s.alliances.find((a) => a.id === 'nato');
  if (nato) for (const m of nato.members) if (s.countries[m]) addRel(s, m, 'RUS', -45);
  // sanctions regime
  const sanctioners = ['USA', 'GBR', 'CAN', 'AUS', 'JPN', 'KOR', 'DEU', 'FRA', 'ITA', 'ESP', 'POL', 'SWE', 'FIN', 'NOR', 'NLD', 'BEL', 'DNK', 'CZE', 'EST', 'LVA', 'LTU', 'NZL', 'CHE'];
  for (const x of sanctioners) if (s.countries[x]) s.sanctions[x] = ['RUS', 'PRK', 'IRN', 'BLR'].filter((t) => t !== x);

  // ongoing Russia-Ukraine war with occupied south-east
  if (s.countries.RUS && s.countries.UKR) {
    const wid = s.nextId++;
    s.wars.push({ id: wid, name: '러시아-우크라이나 전쟁', attackers: ['RUS'], defenders: ['UKR'], start: 0 });
    for (const pid of coreProvinces('UKR')) {
      const p = prov(pid);
      if (p.lat < 46.3 || (p.lon > 37.3 && p.lat < 49.2) || (p.lon > 35.0 && p.lat < 47.2)) s.provinces[pid].controller = 'RUS';
    }
  }
  // fortified borders between bitter rivals (DMZ, Russia-Ukraine front line, India-Pakistan LoC...)
  s.provinces.forEach((st, i) => {
    for (const n of prov(i).adj) {
      const other = s.provinces[n].controller;
      if (other === st.controller) continue;
      if (getRel(s, st.controller, other) <= -60) { s.forts[i] = 0.8; break; }
    }
  });
  const wg = worldGdp(s);
  for (const c of Object.values(s.countries)) economyTick(s, c, wg);
  for (const c of Object.values(s.countries)) {
    autoDeploy(s, c.tag);
    // every country (player included) starts with production lines and research matching its doctrine
    aiProduction(s, c, true);
    aiResearch(s, c);
  }
  return s;
}
