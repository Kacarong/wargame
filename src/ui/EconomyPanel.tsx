import { useState } from 'react';
import { budgetStance, industryCap, interestRate, predictVote, sanctionedShare, worldGdp, activeK } from '../sim/domestic';
import { proposeBudget } from '../sim/actions';
import type { Bill, Budget } from '../sim/types';
import { money, pct } from '../sim/util';
import { Bar, Section, Stat, type UICtx } from './common';

const RES_NAMES = { steel: '철강', oil: '석유', chips: '반도체', rare: '희토류' } as const;

export function EconomyPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const [b, setB] = useState<Budget>({ ...c.budget });
  const [tax, setTax] = useState(c.tax);
  const st = c.stats;
  const spendPct = b.military + b.welfare + b.research + b.infra + c.otherSpend;
  const interestPct = ((c.debt * interestRate(c)) / c.gdp) * 100;
  const balance = tax - spendPct - interestPct;
  const milB = (c.gdp * b.military) / 100;
  const procurementNew = milB - st.personnelCost - milB * 0.2;
  const fake: Bill = { id: 77, country: c.tag, kind: 'budget', title: '', daysLeft: 0, budget: b, tax, stance: budgetStance(c, b, tax) };
  const pv = c.gov === 'democracy' ? predictVote(s, fake) : null;
  const slider = (key: keyof Budget, label: string, max: number, hint: string) => (
    <div className="slider-row" title={hint}>
      <span>{label}</span>
      <input type="range" min={0} max={max} step={0.1} value={b[key]} onChange={(e) => setB({ ...b, [key]: +e.target.value })} />
      <span className="num">{b[key].toFixed(1)}%</span>
      <span className="muted num">{money((c.gdp * b[key]) / 100)}</span>
    </div>
  );
  const wg = worldGdp(s);
  return (
    <div>
      <Section title="거시 경제">
        <Stat k="GDP" v={money(c.gdp)} />
        <Stat k="1인당 GDP" v={`$${Math.round((c.gdp * 1e9) / (c.pop * 1e6)).toLocaleString()}`} />
        <Stat k="인구" v={`${c.pop.toFixed(1)}백만`} />
        <Stat k="성장률 (연)" v={<span className={st.growth >= 0 ? 'ok' : 'bad'}>{pct(st.growth, 2)}</span>} hint="기본 성장 + 인프라·R&D 투자, 무역, 안정도, 동원, 제재, 자원, 점령 피해" />
        <Stat k="세입 (연)" v={money(st.revenue)} />
        <Stat k="세출 (연)" v={money(st.spending)} />
        <Stat k="재정수지" v={<span className={st.revenue - st.spending >= 0 ? 'ok' : 'bad'}>{money(st.revenue - st.spending)}</span>} />
        <Stat k="국가부채" v={`${money(c.debt)} (GDP 대비 ${pct((c.debt / c.gdp) * 100, 0)})`} />
        <Stat k="제재 노출도" v={pct(sanctionedShare(s, c.tag, wg) * 100)} hint="우리를 제재하는 국가들의 세계 GDP 비중" />
      </Section>
      <Section title="자원 수급">
        {(Object.keys(RES_NAMES) as (keyof typeof RES_NAMES)[]).map((r) => (
          <div key={r} className="slider-row">
            <span>{RES_NAMES[r]}</span>
            <Bar value={st.resAvail[r] * 100} color={st.resAvail[r] > 0.95 ? '#58b368' : st.resAvail[r] > 0.7 ? '#d9b44f' : '#d9534f'} label={`${(st.resAvail[r] * 100).toFixed(0)}%`} />
            <span className="muted">자급 {(c.resources[r] * 100).toFixed(0)}%</span>
          </div>
        ))}
        <div className="muted">부족한 자원은 무역으로 수입합니다. 무역 정책과 해외 제재가 수입량을 결정하고, 부족분은 무기 생산 효율과 성장률을 떨어뜨립니다.</div>
      </Section>
      <Section title="예산안 편성 (GDP 대비 %)">
        <div className="slider-row" title="정부 세입 (GDP 대비). 올리면 재정이 좋아지지만 지지율과 성장률이 떨어집니다.">
          <span>세입(조세)</span>
          <input type="range" min={5} max={55} step={0.5} value={tax} onChange={(e) => setTax(+e.target.value)} />
          <span className="num">{tax.toFixed(1)}%</span>
          <span className="muted num">{money((c.gdp * tax) / 100)}</span>
        </div>
        {slider('military', '국방비', 30, '인건비(현역 규모) + 운영유지비 + 무기 획득비')}
        {slider('welfare', '복지', 30, '지지율에 큰 영향')}
        {slider('research', '연구개발', 6, '연구 속도(연구 포인트)와 성장률')}
        {slider('infra', '인프라', 8, '성장률')}
        <div className="slider-row" title="교육·행정·보건·지방교부금 등 조정할 수 없는 경직성 지출">
          <span>기타 지출</span><span className="muted">교육·행정·보건 등 (고정)</span><span className="num">{c.otherSpend.toFixed(1)}%</span><span className="muted num">{money((c.gdp * c.otherSpend) / 100)}</span>
        </div>
        <div className="budget-summary">
          <Stat k="재정수지 (이자 포함)" v={<span className={balance >= 0 ? 'ok' : 'bad'}>{pct(balance)} of GDP</span>} />
          <Stat k="국방비 중 무기획득 가능액" v={<span className={procurementNew >= 0 ? 'ok' : 'bad'}>{money(procurementNew)} / 연</span>} hint="국방비 - 인건비 - 운영유지비(20%). 음수면 부대 조직력 회복이 느려집니다." />
          <Stat k="현역 병력 인건비" v={`${money(st.personnelCost)} (${Math.round(activeK(s, c.tag))}천 명)`} />
          <Stat k="방산 생산 능력" v={money(industryCap(c))} />
          {pv && <Stat k="예상 표결" v={<span className={pv.yes > pv.no ? 'ok' : 'bad'}>찬성 {pv.yes} / 반대 {pv.no}</span>} />}
        </div>
        <div className="row">
          <button onClick={() => { setB({ ...c.budget }); setTax(c.tax); }}>현행으로 되돌리기</button>
          <button className="primary" onClick={() => ctx.run(() => proposeBudget(s, c.tag, b, tax), '예산안을 의회에 제출했습니다.')}>예산안 제출</button>
        </div>
      </Section>
    </div>
  );
}
