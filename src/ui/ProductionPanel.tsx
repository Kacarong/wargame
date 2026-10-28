import { useState } from 'react';
import { EQUIPMENT, EQUIP_BY_ID } from '../data/equipment';
import type { EquipCat } from '../data/schema';
import { industryCap, lineDemand } from '../sim/domestic';
import { addLine, buyEquipment, canBuy, licensePrice, purchasePrice, requestLicense, setLines } from '../sim/actions';
import { CAT_NAMES, canProduce, discontinued, exportable, gameYear, quality, TECH_BY_ID } from '../sim/equip';
import { money, num } from '../sim/util';
import { Bar, Section, Stat, type UICtx } from './common';

const CATS = Object.keys(CAT_NAMES) as EquipCat[];

export function equipTooltip(id: string): string {
  const e = EQUIP_BY_ID[id];
  if (!e) return id;
  const r = Object.entries(e.r).map(([k, v]) => `${k} ${v}`).join(', ');
  return `${e.name} (${e.origin}, ${e.year})\n${e.desc}\n능력치: ${r}\n단가 $${e.cost}M · 라인당 연 ${e.perLineYear}대`;
}

export function ProductionPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const [cat, setCat] = useState<EquipCat>('tank');
  const [qty, setQty] = useState(10);
  const cap = industryCap(c);
  const budget = Math.max(0, c.stats.procurement);
  const demand = c.lines.reduce((a, _l, i) => a + lineDemand(c, i) * c.lines[i].eff, 0);
  const usable = Math.min(budget, cap);
  const scale = demand > 0 ? Math.min(1, usable / demand) : 0;
  const list = EQUIPMENT.filter((e) => e.cat === cat).sort((a, b) => quality(b) - quality(a));
  const stock = Object.entries(c.stockpile).filter(([, n]) => n >= 1).sort((a, b) => (EQUIP_BY_ID[a[0]]?.cat ?? '').localeCompare(EQUIP_BY_ID[b[0]]?.cat ?? ''));
  return (
    <div>
      <Section title="방위산업">
        <Stat k="무기획득 예산" v={money(c.stats.procurement)} hint="국방비 - 인건비 - 운영유지비" />
        <Stat k="방산 생산 능력" v={money(cap)} hint="기본 방산 규모 × 경제 동원 수준 × 산업 기술" />
        <Stat k="생산 라인 수요" v={money(demand)} />
        <Stat k="실제 집행" v={`${money(c.stats.prodSpending)} (가동률 ${(scale * 100).toFixed(0)}%)`} />
        {demand > usable * 1.05 && <div className="warn">{budget < cap ? '예산 부족: 국방비를 늘리거나 라인을 줄이세요.' : '생산 능력 부족: 경제 동원 법안으로 방산 능력을 늘리세요.'}</div>}
      </Section>
      <Section title="생산 라인">
        {c.lines.length === 0 && <div className="muted">생산 라인이 없습니다. 아래 목록에서 추가하세요.</div>}
        <table className="tbl">
          <thead><tr><th>장비</th><th>라인</th><th>효율</th><th>연 생산</th><th>연 비용</th></tr></thead>
          <tbody>
            {c.lines.map((l, i) => {
              const e = EQUIP_BY_ID[l.equip];
              const perYear = l.lines * e.perLineYear * l.eff * scale;
              return (
                <tr key={l.id}>
                  <td title={equipTooltip(e.id)}>{e.name}</td>
                  <td className="nowrap">
                    <button className="small" onClick={() => { setLines(s, c.tag, l.id, l.lines - 1); ctx.bump(); }}>−</button>
                    <span className="num"> {l.lines} </span>
                    <button className="small" onClick={() => { setLines(s, c.tag, l.id, l.lines + 1); ctx.bump(); }}>+</button>
                  </td>
                  <td><Bar value={l.eff * 100} label={`${(l.eff * 100).toFixed(0)}%`} /></td>
                  <td className="num">{perYear >= 10 ? num(perYear) : perYear.toFixed(1)}</td>
                  <td className="num">{money(lineDemand(c, i) * l.eff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <div className="tabs-small">
        {CATS.map((k) => <button key={k} className={cat === k ? 'active' : ''} onClick={() => setCat(k)}>{CAT_NAMES[k]}</button>)}
      </div>
      <Section title={`${CAT_NAMES[cat]} — 생산 · 구매 · 라이선스`} right={<span className="row">구매 수량 <input className="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} /></span>}>
        {list.map((e) => {
          const prod = canProduce(c, e);
          const buyErr = canBuy(s, c.tag, e.id);
          const tech = c.techs.includes(e.tech);
          return (
            <div key={e.id} className={`equip ${prod ? 'can' : ''}`}>
              <div className="row between">
                <span title={equipTooltip(e.id)}>
                  <b>{e.name}</b> <span className="muted">{s.countries[e.origin]?.name ?? e.origin} · {e.year}년 · ${e.cost}M</span>
                </span>
                <span className="row">
                  {prod && <button className="small primary" onClick={() => ctx.run(() => addLine(s, c.tag, e.id), `${e.name} 생산 라인 추가`)}>라인 +</button>}
                  {!prod && e.origin !== c.tag && exportable(e) && (
                    <button className="small" disabled={!tech} title={tech ? `라이선스 비용 ${money(licensePrice(e.id))}` : `기술 필요: ${TECH_BY_ID[e.tech]?.name}`} onClick={() => ctx.run(() => requestLicense(s, c.tag, e.id))}>라이선스</button>
                  )}
                  {e.origin !== c.tag && (
                    <button className="small" disabled={!!buyErr} title={buyErr ?? `${qty}대 ${money(purchasePrice(e.id, qty))}`} onClick={() => ctx.run(() => buyEquipment(s, c.tag, e.id, qty))}>구매</button>
                  )}
                </span>
              </div>
              <div className="muted">{e.desc} {!tech && <span className="bad">· 기술 미보유({TECH_BY_ID[e.tech]?.name})</span>}{e.year > gameYear() && <span className="bad"> · {e.year}년 실전배치 이후 생산 가능</span>}{discontinued(e) && <span className="bad"> · 생산 종료</span>}</div>
            </div>
          );
        })}
      </Section>
      {c.purchases.length > 0 && (
        <Section title="해외 구매 인도 대기">
          {c.purchases.map((p) => <Stat key={p.id} k={`${EQUIP_BY_ID[p.equip]?.name} ×${p.qty}`} v={`${p.daysLeft}일 후`} />)}
        </Section>
      )}
      <Section title="비축 장비 (부대 미배치)">
        <table className="tbl">
          <tbody>
            {stock.map(([id, n]) => (
              <tr key={id}><td>{CAT_NAMES[EQUIP_BY_ID[id]?.cat ?? 'inf']}</td><td title={equipTooltip(id)}>{EQUIP_BY_ID[id]?.name ?? id}</td><td className="num">{num(n)}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
