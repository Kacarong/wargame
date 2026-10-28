// Player-facing commands. Each returns an error string (Korean) or null on success.
import { EQUIP_BY_ID } from '../data/equipment';
import { canProduce, discontinued, exportable, gameYear, TECH_BY_ID } from './equip';
import { availableTechs, budgetStance, lawStance, researchSlots, submitBill } from './domestic';
import { atWar, endWar, friendly, occupiedShare, warScore } from './military';
import type { Budget, GameState, Laws } from './types';
import { addRel, getRel, log } from './util';

export function startResearch(s: GameState, tag: string, tech: string): string | null {
  const c = s.countries[tag];
  if (c.research.length >= researchSlots(c)) return '연구 슬롯이 가득 찼습니다.';
  if (!availableTechs(c).some((t) => t.id === tech)) return '선행 기술이 필요합니다.';
  c.research.push({ tech, progress: 0 });
  return null;
}

export function cancelResearch(s: GameState, tag: string, tech: string): void {
  const c = s.countries[tag];
  c.research = c.research.filter((r) => r.tech !== tech);
}

export function addLine(s: GameState, tag: string, equip: string): string | null {
  const c = s.countries[tag];
  const e = EQUIP_BY_ID[equip];
  if (e && discontinued(e)) return `${e.name}은(는) 생산이 종료된 장비입니다. 해외 중고 구매만 가능합니다.`;
  if (e && e.year > gameYear()) return `${e.name}은(는) ${e.year}년 실전배치 이후 생산할 수 있습니다.`;
  if (!e || !canProduce(c, e)) return '생산 권한(기술/설계국/라이선스)이 없습니다.';
  const ex = c.lines.find((l) => l.equip === equip);
  if (ex) { ex.lines++; return null; }
  c.lines.push({ id: s.nextId++, equip, lines: 1, eff: 0.1, progress: 0 });
  return null;
}

export function setLines(s: GameState, tag: string, lineId: number, n: number): void {
  const c = s.countries[tag];
  const l = c.lines.find((x) => x.id === lineId);
  if (!l) return;
  if (n <= 0) c.lines = c.lines.filter((x) => x !== l);
  else {
    if (n < l.lines) l.eff = Math.max(0.1, l.eff); // shrinking keeps efficiency
    else if (n > l.lines) l.eff = Math.max(0.1, l.eff * (l.lines / n)); // new lines start inefficient
    l.lines = n;
  }
}

export function purchasePrice(equip: string, qty: number): number {
  const e = EQUIP_BY_ID[equip];
  return (e.cost * 1.25 * qty) / 1000;
}

export function canBuy(s: GameState, tag: string, equip: string): string | null {
  const e = EQUIP_BY_ID[equip];
  if (!e) return '알 수 없는 장비';
  if (e.origin === tag) return '자국 설계 장비는 생산 라인으로 생산하세요.';
  if (!exportable(e)) return '수출 금지 품목입니다.';
  if (e.year > 2026 + Math.floor(s.day / 365)) return '아직 실전배치 전입니다.';
  const seller = s.countries[e.origin];
  if (!seller?.alive) return '설계국이 존재하지 않습니다.';
  if (atWar(s, tag, e.origin)) return '교전국입니다.';
  if (s.sanctions[e.origin]?.includes(tag)) return `${seller.name}이(가) 우리에게 제재를 가하고 있습니다.`;
  const rel = getRel(s, tag, e.origin);
  const need = friendly(s, tag, e.origin) ? -20 : 20;
  if (rel < need) return `${seller.name}과의 관계가 부족합니다 (${rel.toFixed(0)} / 필요 ${need}).`;
  return null;
}

export function buyEquipment(s: GameState, tag: string, equip: string, qty: number): string | null {
  const err = canBuy(s, tag, equip);
  if (err) return err;
  const c = s.countries[tag];
  const e = EQUIP_BY_ID[equip];
  const price = purchasePrice(equip, qty);
  c.debt += price; // paid from a special appropriation (adds to public debt)
  const days = Math.round(120 + (qty / Math.max(1, e.perLineYear)) * 365 * 0.3);
  c.purchases.push({ id: s.nextId++, equip, qty, from: e.origin, daysLeft: days });
  addRel(s, tag, e.origin, 3);
  log(s, `${s.countries[e.origin].name}에서 ${e.name} ${qty}대 구매 계약 (${price.toFixed(2)}B$, ${days}일 후 인도)`, [tag]);
  return null;
}

export function licensePrice(equip: string): number {
  const e = EQUIP_BY_ID[equip];
  return (e.cost * e.perLineYear * 0.6) / 1000;
}

export function requestLicense(s: GameState, tag: string, equip: string): string | null {
  const c = s.countries[tag];
  const e = EQUIP_BY_ID[equip];
  if (!e) return '알 수 없는 장비';
  if (c.licenses.includes(equip) || e.origin === tag) return '이미 생산 권한이 있습니다.';
  if (!exportable(e)) return '라이선스 제공 불가 품목입니다.';
  if (!c.techs.includes(e.tech)) return `기술 '${TECH_BY_ID[e.tech]?.name ?? e.tech}'을(를) 먼저 연구해야 합니다.`;
  const rel = getRel(s, tag, e.origin);
  if (!friendly(s, tag, e.origin) && rel < 50) return `${s.countries[e.origin]?.name}과의 관계 50 이상 또는 동맹이 필요합니다 (현재 ${rel.toFixed(0)}).`;
  if (s.sanctions[e.origin]?.includes(tag)) return '제재 대상입니다.';
  const price = licensePrice(equip);
  c.debt += price;
  c.licenses.push(equip);
  log(s, `${s.countries[e.origin].name}로부터 ${e.name} 라이선스 생산권 획득 (${price.toFixed(2)}B$)`, [tag], true);
  return null;
}

export function proposeBudget(s: GameState, tag: string, budget: Budget, tax: number): string | null {
  const c = s.countries[tag];
  if (s.bills.some((b) => b.country === tag && b.kind === 'budget' && !b.result)) return '이미 심의 중인 예산안이 있습니다.';
  submitBill(s, { country: tag, kind: 'budget', title: `예산안 (국방 ${budget.military.toFixed(1)}% · 복지 ${budget.welfare.toFixed(1)}% · R&D ${budget.research.toFixed(1)}% · 인프라 ${budget.infra.toFixed(1)}% · 세입 ${tax.toFixed(1)}%)`, budget, tax, stance: budgetStance(c, budget, tax) });
  return null;
}

export function proposeLaw(s: GameState, tag: string, law: Partial<Laws>, title: string): string | null {
  const c = s.countries[tag];
  const key = Object.keys(law)[0];
  if (s.bills.some((b) => b.country === tag && !b.result && b.law && Object.keys(b.law)[0] === key)) return '같은 분야 법안이 이미 심의 중입니다.';
  submitBill(s, { country: tag, kind: 'law', title, law, stance: lawStance(c, law) });
  return null;
}

export function justifyWar(s: GameState, tag: string, target: string): string | null {
  const c = s.countries[tag];
  if (c.justifications.some((j) => j.target === target)) return '이미 명분을 준비 중입니다.';
  if (friendly(s, tag, target)) return '동맹국에는 불가능합니다.';
  const rel = getRel(s, tag, target);
  const days = rel < -60 ? 30 : rel < 0 ? 60 : 120;
  c.justifications.push({ target, daysLeft: days });
  s.tension = Math.min(100, s.tension + 3);
  addRel(s, tag, target, -15);
  log(s, `${s.countries[target].name}에 대한 전쟁 명분 조성 시작 (${days}일)`, [tag, target]);
  return null;
}

export function proposeWar(s: GameState, tag: string, target: string): string | null {
  const c = s.countries[tag];
  if (atWar(s, tag, target)) return '이미 전쟁 중입니다.';
  if (friendly(s, tag, target)) return '동맹국입니다.';
  const just = c.justifications.find((j) => j.target === target);
  if (c.gov !== 'authoritarian' && (!just || just.daysLeft > 0)) return '전쟁 명분이 완성되지 않았습니다.';
  if (s.bills.some((b) => b.country === tag && b.kind === 'war' && !b.result)) return '이미 심의 중인 선전포고안이 있습니다.';
  submitBill(s, { country: tag, kind: 'war', title: `${s.countries[target].name}에 대한 선전포고 동의안`, target, stance: { econ: 0, hawk: 0.8 } });
  return null;
}

export function proposePeace(s: GameState, tag: string, warId: number, annex: boolean): string | null {
  const w = s.wars.find((x) => x.id === warId);
  if (!w) return '전쟁이 없습니다.';
  const side = w.attackers.includes(tag) ? 'attackers' : 'defenders';
  const score = warScore(s, warId, side);
  const enemyLeader = side === 'attackers' ? w.defenders[0] : w.attackers[0];
  const enemy = s.countries[enemyLeader];
  if (annex) {
    if (score < 0.25 && enemy.stability > 30) return `${enemy.name}이(가) 거절했습니다. 전쟁 점수가 더 필요합니다 (현재 ${(score * 100).toFixed(0)} / 25).`;
    endWar(s, warId, side === 'attackers' ? w.attackers : w.defenders, true);
  } else {
    const enemyOcc = occupiedShare(s, enemyLeader);
    if (score < -0.05 && s.day - w.start < 180) return `${enemy.name}은(는) 승리를 확신하고 있습니다. 거절.`;
    if (score < -0.15) return `${enemy.name}이(가) 백색평화를 거절했습니다.`;
    void enemyOcc;
    endWar(s, warId, null, false);
  }
  return null;
}

export function improveRelations(s: GameState, tag: string, target: string): string | null {
  const c = s.countries[tag];
  if (atWar(s, tag, target)) return '교전 중입니다.';
  c.debt += 0.3;
  addRel(s, tag, target, 6);
  return null;
}

export function toggleSanction(s: GameState, tag: string, target: string): void {
  const list = (s.sanctions[tag] ??= []);
  if (list.includes(target)) {
    s.sanctions[tag] = list.filter((x) => x !== target);
    addRel(s, tag, target, 10);
    log(s, `${s.countries[target].name}에 대한 제재 해제`, [tag, target]);
  } else {
    list.push(target);
    addRel(s, tag, target, -25);
    log(s, `${s.countries[target].name}에 경제 제재 부과`, [tag, target]);
  }
}

export function proposeAlliance(s: GameState, tag: string, target: string): string | null {
  if (friendly(s, tag, target)) return '이미 동맹 관계입니다.';
  const rel = getRel(s, tag, target);
  if (rel < 70) return `${s.countries[target].name}이(가) 거절했습니다 (관계 ${rel.toFixed(0)} / 필요 70).`;
  const enemiesOfTarget = s.wars.some((w) => w.attackers.includes(target) || w.defenders.includes(target));
  if (enemiesOfTarget) return '상대가 전쟁 중이라 조약 체결을 미룹니다.';
  s.alliances.push({ id: `pact_${s.nextId++}`, name: `${s.countries[tag].name}-${s.countries[target].name} 상호방위조약`, members: [tag, target], mutualDefense: true });
  log(s, `${s.countries[target].name}과 상호방위조약 체결`, [tag, target], true);
  return null;
}

/** Ship a share of the land-equipment stockpile to a friendly country at war. */
export function sendAid(s: GameState, from: string, to: string, share = 0.05, quiet = false): string | null {
  if (atWar(s, from, to)) return '교전국입니다.';
  if (getRel(s, from, to) < 30 && !friendly(s, from, to)) return '관계가 30 이상이어야 합니다.';
  const a = s.countries[from];
  const b = s.countries[to];
  let units = 0;
  let value = 0;
  for (const [id, n] of Object.entries(a.stockpile)) {
    const e = EQUIP_BY_ID[id];
    if (!e || !['inf', 'tank', 'ifv', 'apc', 'spg', 'towed', 'mlrs', 'sam'].includes(e.cat)) continue;
    const k = Math.floor(n * share);
    if (k <= 0) continue;
    a.stockpile[id] -= k;
    b.stockpile[id] = (b.stockpile[id] ?? 0) + k;
    units += e.cat === 'inf' ? 0 : k;
    value += (k * e.cost) / 1000;
  }
  if (value <= 0) return '보낼 수 있는 비축 장비가 없습니다.';
  addRel(s, from, to, 4);
  if (!quiet || to === s.player || from === s.player)
    log(s, `${a.name} → ${b.name} 군사 원조: 장비 ${units}대 등 ${value.toFixed(2)}B$ 상당`, [from, to]);
  return null;
}
