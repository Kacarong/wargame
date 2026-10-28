import { industryCap, researchSlots } from '../sim/domestic';
import { enemiesOf, occupiedShare } from '../sim/military';
import { fmtDate, money, num } from '../sim/util';
import { Bar, Section, Stat, type UICtx } from './common';
import { countrySummary } from './DiplomacyPanel';

export function OverviewPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const { c, divs, air, navy, active } = countrySummary(s, s.player);
  const alerts: { text: string; tab: Parameters<UICtx['openTab']>[0] }[] = [];
  if (c.research.length < researchSlots(c)) alerts.push({ text: `빈 연구 슬롯 ${researchSlots(c) - c.research.length}개`, tab: 'research' });
  if (!c.lines.length) alerts.push({ text: '가동 중인 무기 생산 라인이 없습니다', tab: 'production' });
  if (c.stats.procurement < 0) alerts.push({ text: '국방비가 인건비·운영비도 감당하지 못합니다 (부대 회복 저하)', tab: 'economy' });
  if (c.stats.revenue < c.stats.spending * 0.85) alerts.push({ text: '재정 적자가 큽니다', tab: 'economy' });
  if (c.stats.resAvail.oil < 0.8) alerts.push({ text: '석유 부족: 보급과 성장률 저하', tab: 'economy' });
  for (const j of c.justifications) if (j.daysLeft <= 0) alerts.push({ text: `${s.countries[j.target].name} 전쟁 명분 완성`, tab: 'diplomacy' });
  const pendingBills = s.bills.filter((b) => b.country === c.tag && !b.result).length;
  if (pendingBills) alerts.push({ text: `의회 심의 중인 법안 ${pendingBills}건`, tab: 'politics' });
  const enemies = enemiesOf(s, c.tag);
  return (
    <div>
      <Section title={`${c.name}`}>
        <Stat k={c.leaderTitle || '정부 수반'} v={c.leader} />
        <Stat k="날짜" v={fmtDate(s.day)} />
        <Stat k="GDP / 성장률" v={`${money(c.gdp)} / ${c.stats.growth.toFixed(2)}%`} />
        <Stat k="국방비" v={`${c.budget.military.toFixed(1)}% (${money((c.gdp * c.budget.military) / 100)})`} />
        <Stat k="방산 생산 능력" v={money(industryCap(c))} />
        <Stat k="현역 병력" v={`${num(active * 1000)}명`} />
        <Stat k="사단 / 항공기 / 해군력" v={`${divs} / ${num(air)} / ${navy.toFixed(0)}`} />
        <Stat k="세계 긴장도" v={s.tension.toFixed(0)} />
        <div className="kv3">
          <div>지지율<Bar value={c.approval} label={c.approval.toFixed(0)} /></div>
          <div>안정도<Bar value={c.stability} color="#58b368" label={c.stability.toFixed(0)} /></div>
          <div>전쟁지지도<Bar value={c.warSupport} color="#d9734f" label={c.warSupport.toFixed(0)} /></div>
        </div>
        {enemies.length > 0 && <div className="warn">교전국: {enemies.map((e) => s.countries[e].name).join(', ')} · 피점령률 {(occupiedShare(s, c.tag) * 100).toFixed(0)}%</div>}
      </Section>
      <Section title="알림">
        {alerts.length === 0 && <div className="muted">특이사항 없음</div>}
        {alerts.map((a, i) => <div key={i} className="alert" onClick={() => ctx.openTab(a.tab)}>⚠ {a.text}</div>)}
      </Section>
      <Section title="플레이 방법">
        <ul className="help">
          <li>스페이스바: 일시정지/재개 · 1~5: 게임 속도</li>
          <li>경제: 예산안(국방·복지·R&D·인프라·세율)을 편성해 의회에 제출합니다.</li>
          <li>정치: 병역·경제 동원·무역·언론 정책을 법안으로 발의하고 정당별 표결을 거칩니다.</li>
          <li>연구 → 생산: 기술을 연구하면 자국 설계 무기를 생산할 수 있고, 외국 무기는 구매하거나 라이선스를 받습니다.</li>
          <li>편제: 사단을 대대·중대 단위로 설계하고, 중대마다 실제 장비 모델을 지정합니다. 군단으로 묶어 지휘합니다.</li>
          <li>지도: 부대 마커 클릭 → 목표 지역 우클릭으로 이동·공격합니다.</li>
        </ul>
      </Section>
    </div>
  );
}
