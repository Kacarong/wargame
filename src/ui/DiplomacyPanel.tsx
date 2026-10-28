import { improveRelations, justifyWar, proposeAlliance, proposePeace, proposeWar, toggleSanction } from '../sim/actions';
import { activeK } from '../sim/domestic';
import { atWar, friendly, navalPower, occupiedShare, warScore, warsOf } from '../sim/military';
import type { GameState } from '../sim/types';
import { getRel, money, num } from '../sim/util';
import { Section, Stat, Swatch, type UICtx } from './common';
import { Parliament } from './PoliticsPanel';

export function countrySummary(s: GameState, tag: string) {
  const c = s.countries[tag];
  const divs = Object.values(s.divisions).filter((d) => d.owner === tag).length;
  const air = Object.values(s.airWings).filter((w) => w.owner === tag).reduce((a, w) => a + w.count, 0);
  return { c, divs, air, navy: navalPower(s, [tag]), active: activeK(s, tag) };
}

export function DiplomacyPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const me = s.countries[s.player];
  const tag = ctx.diploTarget;
  const wars = warsOf(s, me.tag);
  return (
    <div>
      <Section title="진행 중인 전쟁">
        {wars.length === 0 && <div className="muted">전쟁 중이 아닙니다.</div>}
        {wars.map((w) => {
          const side = w.attackers.includes(me.tag) ? 'attackers' : 'defenders';
          const sc = warScore(s, w.id, side);
          return (
            <div key={w.id} className="war">
              <b>{w.name}</b>
              <div className="muted">공격측: {w.attackers.map((t) => s.countries[t]?.name).join(', ')} / 방어측: {w.defenders.map((t) => s.countries[t]?.name).join(', ')}</div>
              <Stat k="전쟁 점수" v={<span className={sc >= 0 ? 'ok' : 'bad'}>{(sc * 100).toFixed(0)}</span>} hint="적 핵심 영토 점령률 - 아군 피점령률 (가치 가중)" />
              {[...w.attackers, ...w.defenders].map((t) => <Stat key={t} k={`${s.countries[t]?.name} 피점령률`} v={`${(occupiedShare(s, t) * 100).toFixed(0)}%`} />)}
              <div className="row">
                <button className="small" onClick={() => ctx.run(() => proposePeace(s, me.tag, w.id, false), '백색평화가 성립했습니다.')}>백색평화 제안</button>
                <button className="small" onClick={() => ctx.run(() => proposePeace(s, me.tag, w.id, true), '점령지를 할양받고 종전했습니다.')}>점령지 할양 요구</button>
              </div>
            </div>
          );
        })}
      </Section>
      <Section title="동맹·조약">
        {s.alliances.filter((a) => a.members.includes(me.tag)).map((a) => (
          <div key={a.id}><b>{a.name}</b> <span className="muted">{a.mutualDefense ? '상호방위' : '협력'} · {a.members.filter((m) => s.countries[m]).map((m) => s.countries[m].name).join(', ')}</span></div>
        ))}
        {!s.alliances.some((a) => a.members.includes(me.tag)) && <div className="muted">가입한 동맹이 없습니다.</div>}
      </Section>
      {!tag || tag === me.tag ? (
        <div className="muted">지도에서 다른 나라를 클릭하면 외교 행동을 할 수 있습니다.</div>
      ) : (
        <TargetDiplomacy ctx={ctx} tag={tag} />
      )}
    </div>
  );
}

function TargetDiplomacy({ ctx, tag }: { ctx: UICtx; tag: string }) {
  const s = ctx.s;
  const me = s.countries[s.player];
  const { c, divs, air, navy, active } = countrySummary(s, tag);
  const rel = getRel(s, me.tag, tag);
  const war = atWar(s, me.tag, tag);
  const ally = friendly(s, me.tag, tag);
  const just = me.justifications.find((j) => j.target === tag);
  const sanctioning = s.sanctions[me.tag]?.includes(tag);
  const sanctionedBy = s.sanctions[tag]?.includes(me.tag);
  const govName = { democracy: '민주주의', hybrid: '혼합 체제', authoritarian: '권위주의' }[c.gov];
  return (
    <Section title={c.name} right={<Swatch color={c.color} />}>
      <Stat k="관계" v={<span className={rel >= 0 ? 'ok' : 'bad'}>{rel.toFixed(0)}</span>} />
      <Stat k="상태" v={war ? '교전 중' : ally ? '동맹' : '평화'} />
      <Stat k="체제 / 지도자" v={`${govName} · ${c.leaderTitle} ${c.leader}`} />
      <Stat k="GDP" v={money(c.gdp)} />
      <Stat k="국방비" v={`${c.budget.military.toFixed(1)}% (${money((c.gdp * c.budget.military) / 100)})`} />
      <Stat k="병력 / 사단" v={`${num(active * 1000)}명 / ${divs}개 사단`} />
      <Stat k="항공기 / 해군력" v={`${num(air)}대 / ${navy.toFixed(0)}`} />
      <Stat k="안정도 · 전쟁지지도" v={`${c.stability.toFixed(0)} · ${c.warSupport.toFixed(0)}`} />
      {sanctionedBy && <div className="warn">{c.name}이(가) 우리에게 제재를 가하고 있습니다.</div>}
      <div className="row wrap">
        <button className="small" disabled={war} onClick={() => ctx.run(() => improveRelations(s, me.tag, tag), '관계 개선 (+6, $0.3B)')}>관계 개선</button>
        <button className="small" disabled={war} onClick={() => { toggleSanction(s, me.tag, tag); ctx.bump(); }}>{sanctioning ? '제재 해제' : '경제 제재'}</button>
        <button className="small" disabled={war || ally} onClick={() => ctx.run(() => proposeAlliance(s, me.tag, tag))}>상호방위조약 제안</button>
      </div>
      {!war && !ally && (
        <div className="row wrap">
          <button className="small" disabled={!!just} onClick={() => ctx.run(() => justifyWar(s, me.tag, tag))}>{just ? (just.daysLeft > 0 ? `명분 조성 중 (${just.daysLeft}일)` : '명분 완성') : '전쟁 명분 조성'}</button>
          <button className="small danger" onClick={() => ctx.run(() => proposeWar(s, me.tag, tag), me.gov === 'authoritarian' ? '선전포고 결정' : '선전포고 동의안을 의회에 제출했습니다.')}>선전포고 {me.gov === 'authoritarian' ? '' : '동의안 제출'}</button>
        </div>
      )}
      <div className="muted">
        민주국가는 전쟁 명분 조성 후 의회가 선전포고 동의안을 가결해야 전쟁을 시작할 수 있습니다. 상대의 상호방위 동맹국은 자동으로 참전합니다.
      </div>
      <Section title={`${c.parliament}`}>
        <Parliament ctx={ctx} tag={tag} />
      </Section>
    </Section>
  );
}
