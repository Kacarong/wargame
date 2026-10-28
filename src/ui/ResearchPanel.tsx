import { useState } from 'react';
import { EQUIPMENT } from '../data/equipment';
import { TECHS } from '../data/tech';
import type { TechCat } from '../data/schema';
import { availableTechs, researchSlots, techCost } from '../sim/domestic';
import { cancelResearch, startResearch } from '../sim/actions';
import { TECH_BY_ID } from '../sim/equip';
import { Bar, Section, Stat, type UICtx } from './common';

export const TECH_CAT_NAMES: Record<TechCat, string> = {
  armor: '기갑',
  land: '지상군',
  artillery: '포병',
  air: '항공',
  naval: '해군',
  electronics: '전자·정보',
  industry: '산업',
  missile: '미사일',
};

const EFFECT_NAMES: Record<string, string> = {
  industryCap: '방산 생산력', researchSpeed: '연구 속도', gdpGrowth: '성장률', supply: '보급',
  landAttack: '지상 공격', landDefense: '지상 방어', airPower: '공군력', navalPower: '해군력',
  orgRecovery: '조직력 회복', prodEfficiency: '생산 효율 상한',
};

export function techEffects(id: string): string {
  const t = TECH_BY_ID[id];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(t?.effects ?? {})) parts.push(`${EFFECT_NAMES[k] ?? k} +${k === 'gdpGrowth' ? `${v}%p` : `${Math.round(v * 100)}%`}`);
  const eqs = EQUIPMENT.filter((e) => e.tech === id).map((e) => e.name);
  if (eqs.length) parts.push(`해금: ${eqs.slice(0, 6).join(', ')}${eqs.length > 6 ? ` 외 ${eqs.length - 6}` : ''}`);
  return parts.join(' · ');
}

export function ResearchPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const [cat, setCat] = useState<TechCat | 'all'>('all');
  const slots = researchSlots(c);
  const avail = availableTechs(c).filter((t) => cat === 'all' || t.cat === cat).sort((a, b) => a.year - b.year);
  const rp = c.stats.rpPerDay;
  const done = TECHS.filter((t) => c.techs.includes(t.id) && (cat === 'all' || t.cat === cat));
  return (
    <div>
      <Section title="연구 현황">
        <Stat k="연구 포인트" v={`${rp.toFixed(2)} / 일`} hint="R&D 예산(√), 교육 수준(1인당 GDP), 안정도에 비례" />
        <Stat k="연구 슬롯" v={`${c.research.length} / ${slots}`} hint="R&D 예산 규모에 따라 2~5개" />
        {c.research.map((r) => {
          const t = TECH_BY_ID[r.tech];
          const cost = techCost(s, c, t);
          const per = rp / c.research.length;
          return (
            <div key={r.tech} className="research-slot">
              <div className="row between">
                <b>{t.name}</b>
                <button className="small" onClick={() => { cancelResearch(s, c.tag, r.tech); ctx.bump(); }}>취소</button>
              </div>
              <Bar value={r.progress} max={cost} label={`${Math.floor(r.progress)} / ${Math.ceil(cost)} · 약 ${Math.ceil((cost - r.progress) / Math.max(0.01, per))}일`} />
            </div>
          );
        })}
      </Section>
      <div className="tabs-small">
        {(['all', ...Object.keys(TECH_CAT_NAMES)] as (TechCat | 'all')[]).map((k) => (
          <button key={k} className={cat === k ? 'active' : ''} onClick={() => setCat(k)}>{k === 'all' ? '전체' : TECH_CAT_NAMES[k]}</button>
        ))}
      </div>
      <Section title="연구 가능">
        {avail.length === 0 && <div className="muted">연구 가능한 기술이 없습니다.</div>}
        {avail.map((t) => {
          const cost = techCost(s, c, t);
          return (
            <div key={t.id} className="tech">
              <div className="row between">
                <span><b>{t.name}</b> <span className="muted">({TECH_CAT_NAMES[t.cat]} · {t.year}년)</span></span>
                <button className="small primary" disabled={c.research.length >= slots} onClick={() => ctx.run(() => startResearch(s, c.tag, t.id))}>연구</button>
              </div>
              <div className="muted">{t.desc}</div>
              <div className="muted">비용 {Math.ceil(cost)} RP{t.year > 2026 ? ' (시대를 앞선 연구: 비용 증가)' : ''} · {techEffects(t.id)}</div>
            </div>
          );
        })}
      </Section>
      <Section title={`보유 기술 (${done.length})`}>
        <div className="chips">{done.map((t) => <span key={t.id} className="chip" title={`${t.desc}\n${techEffects(t.id)}`}>{t.name}</span>)}</div>
      </Section>
    </div>
  );
}
