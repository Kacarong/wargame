import { EQUIP_BY_ID } from '../data/equipment';
import { airAdvantage, airPower, enemiesOf, navalPower, friendly } from '../sim/military';
import type { AirMission } from '../sim/types';
import { num } from '../sim/util';
import { Section, Stat, type UICtx } from './common';
import { equipTooltip } from './ProductionPanel';

export function AirNavyPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const wings = Object.values(s.airWings).filter((w) => w.owner === c.tag);
  const fleets = Object.values(s.fleets).filter((f) => f.owner === c.tag);
  const enemies = enemiesOf(s, c.tag);
  const theaters = [c.tag, ...enemies, ...Object.values(s.countries).filter((x) => x.tag !== c.tag && friendly(s, x.tag, c.tag) && s.wars.some((w) => w.defenders.includes(x.tag) || w.attackers.includes(x.tag))).map((x) => x.tag)];
  const uniq = [...new Set(theaters)];
  const setAll = (theater: string | null) => { for (const w of wings) w.theater = theater; ctx.bump(); };
  return (
    <div>
      <Section title="공군">
        <Stat k="비행대대" v={`${wings.length}개 · ${num(wings.reduce((a, w) => a + w.count, 0))}대`} />
        {enemies.map((e) => (
          <Stat key={e} k={`${s.countries[e].name} 상공 제공권`} v={`${(airAdvantage(s, c.tag, e, e) * 100).toFixed(0)}`} hint="-100(적 우세) ~ 100(아군 우세). 전투 공격력 ±25%, 근접항공지원 가능 여부에 영향" />
        ))}
        <div className="row">
          <span className="muted">일괄 작전구역:</span>
          <button className="small" onClick={() => setAll(null)}>기지 대기</button>
          {uniq.map((t) => <button key={t} className="small" onClick={() => setAll(t)}>{s.countries[t].name}</button>)}
        </div>
        <table className="tbl">
          <thead><tr><th>부대</th><th>기체</th><th>대수</th><th>작전구역</th><th>임무</th></tr></thead>
          <tbody>
            {wings.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td title={equipTooltip(w.equip)}>{EQUIP_BY_ID[w.equip]?.name}</td>
                <td className="num">{w.count.toFixed(0)}</td>
                <td>
                  <select value={w.theater ?? ''} onChange={(e) => { w.theater = e.target.value || null; ctx.bump(); }}>
                    <option value="">기지 대기</option>
                    {uniq.map((t) => <option key={t} value={t}>{s.countries[t].name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={w.mission} onChange={(e) => { w.mission = e.target.value as AirMission; ctx.bump(); }}>
                    <option value="superiority">제공권 장악</option>
                    <option value="cas">근접항공지원</option>
                    <option value="idle">대기</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted">새로 생산·구매한 항공기는 같은 기종 대대를 먼저 채우고, 남으면 새 비행대대가 창설됩니다.</div>
      </Section>
      <Section title="해군">
        <Stat k="해군력 지수" v={navalPower(s, [c.tag]).toFixed(0)} hint="상륙작전에는 적 진영 해군력의 1.2배 이상이 필요합니다" />
        {enemies.map((e) => <Stat key={e} k={`vs ${s.countries[e].name}`} v={`${navalPower(s, [c.tag]).toFixed(0)} : ${navalPower(s, [e]).toFixed(0)}`} />)}
        {fleets.map((f) => (
          <div key={f.id}>
            <b>{f.name}</b>
            <table className="tbl">
              <tbody>
                {Object.entries(f.ships).filter(([, n]) => n > 0).map(([id, n]) => (
                  <tr key={id}><td title={equipTooltip(id)}>{EQUIP_BY_ID[id]?.name ?? id}</td><td className="num">{n}척</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="muted">공중 전력: 작전구역 국가 상공에서 벌어지는 모든 지상 전투에 영향을 줍니다. ({airPower(s, [c.tag], c.tag, 'superiority').toFixed(0)} 본토 방공 전력)</div>
      </Section>
    </div>
  );
}
