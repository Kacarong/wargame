import { LAW_INFO, govShare, lawStance, predictVote } from '../sim/domestic';
import { proposeLaw } from '../sim/actions';
import type { Bill, Laws } from '../sim/types';
import { fmtDate } from '../sim/util';
import { Bar, Section, Stat, type UICtx } from './common';

const PARTY_COLORS = ['#3b6fd1', '#d13b3b', '#e0b13a', '#47a36b', '#8e5bd1', '#d17a3b', '#3bb7c4', '#999', '#c45b9a', '#6b8e23'];

export function partyColor(name: string, i: number): string {
  if (/민주당|Democratic|민주/.test(name) && !/자유민주/.test(name)) return '#1f5fbf';
  if (/국민의힘|공화당|자민당|통합러시아|공산당|기민|보수당/.test(name)) return '#c62f2f';
  return PARTY_COLORS[i % PARTY_COLORS.length];
}

export function Parliament({ ctx, tag }: { ctx: UICtx; tag: string }) {
  const c = ctx.s.countries[tag];
  const total = c.parties.reduce((a, p) => a + p.seats, 0);
  return (
    <div>
      <div className="seatbar">
        {c.parties.map((p, i) => (
          <div key={p.name} title={`${p.name} ${p.seats}석`} style={{ width: `${(p.seats / total) * 100}%`, background: partyColor(p.name, i), opacity: p.gov ? 1 : 0.55 }} />
        ))}
      </div>
      <table className="tbl">
        <thead><tr><th>정당</th><th>의석</th><th>경제</th><th>안보</th><th></th></tr></thead>
        <tbody>
          {c.parties.slice().sort((a, b) => b.seats - a.seats).map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>{p.seats}</td>
              <td>{p.econ > 0.3 ? '우파' : p.econ < -0.3 ? '좌파' : '중도'}</td>
              <td>{p.hawk > 0.3 ? '매파' : p.hawk < -0.3 ? '비둘기파' : '중도'}</td>
              <td>{p.gov ? <span className="tag-gov">여당</span> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">총 {total}석 · 여당 의석 {(govShare(c) * 100).toFixed(1)}%</div>
    </div>
  );
}

export function BillRow({ ctx, b }: { ctx: UICtx; b: Bill }) {
  const pv = b.result ? null : predictVote(ctx.s, b);
  return (
    <div className={`bill ${b.result ? (b.result.passed ? 'passed' : 'failed') : ''}`}>
      <div className="bill-title">{b.title}</div>
      {b.result ? (
        <div className="muted">{b.result.passed ? '가결' : '부결'} · 찬성 {b.result.yes} / 반대 {b.result.no}</div>
      ) : (
        <div className="muted">
          표결까지 {b.daysLeft}일 · 예상 찬성 {pv!.yes} / 반대 {pv!.no}{' '}
          <span className="vote-parties">{pv!.byParty.map((p) => `${p.name}${p.yes ? '○' : '×'}`).join(' ')}</span>
        </div>
      )}
    </div>
  );
}

export function PoliticsPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const govName = { democracy: '민주주의', hybrid: '혼합 체제', authoritarian: '권위주의' }[c.gov];
  const bills = s.bills.filter((b) => b.country === c.tag).slice().reverse();
  const lawKeys = Object.keys(LAW_INFO) as (keyof Laws)[];
  return (
    <div>
      <Section title="정부">
        <Stat k="정치 체제" v={govName} />
        <Stat k={c.leaderTitle || '정부 수반'} v={c.leader} />
        <Stat k="입법부" v={c.parliament} />
        {c.nextElection !== null && <Stat k="다음 총선" v={fmtDate(c.nextElection)} />}
        <div className="kv3">
          <div>지지율<Bar value={c.approval} color="#4f9dd9" label={c.approval.toFixed(0)} /></div>
          <div>안정도<Bar value={c.stability} color="#58b368" label={c.stability.toFixed(0)} /></div>
          <div>전쟁지지도<Bar value={c.warSupport} color="#d9734f" label={c.warSupport.toFixed(0)} /></div>
        </div>
        <div className="muted">
          {c.gov === 'democracy'
            ? '모든 법안·예산안·선전포고는 의회 표결(14일)을 거칩니다. 정당은 이념(경제/안보)과 여야 관계, 지지율, 전쟁지지도에 따라 투표합니다.'
            : c.gov === 'hybrid'
              ? '여당이 과반이면 대부분 통과되지만, 지지율이 매우 낮으면 부결될 수 있습니다.'
              : '의회는 형식적 승인 기관입니다. 인기 없는 결정은 안정도를 깎습니다.'}
        </div>
      </Section>
      <Section title="의회 구성">
        <Parliament ctx={ctx} tag={c.tag} />
      </Section>
      <Section title="국가 정책 (법안 발의)">
        {lawKeys.map((k) => {
          const info = LAW_INFO[k];
          return (
            <div key={k} className="law">
              <div className="law-name">{info.name}</div>
              <div className="law-opts">
                {Object.entries(info.options).map(([opt, o]) => {
                  const active = c.laws[k] === opt;
                  const law = { [k]: opt } as Partial<Laws>;
                  const fake: Bill = { id: s.day + opt.length, country: c.tag, kind: 'law', title: '', daysLeft: 0, law, stance: lawStance(c, law) };
                  const pv = c.gov === 'democracy' && !active ? predictVote(s, fake) : null;
                  return (
                    <button
                      key={opt}
                      className={`opt ${active ? 'active' : ''}`}
                      disabled={active}
                      title={o.desc + (pv ? `\n예상 표결: 찬성 ${pv.yes} / 반대 ${pv.no}` : '')}
                      onClick={() => ctx.run(() => proposeLaw(s, c.tag, law, `${info.name}: ${o.name}`), '법안을 제출했습니다.')}
                    >
                      {o.name}
                      {pv && <span className={pv.yes > pv.no ? 'ok' : 'bad'}> {pv.yes > pv.no ? '▲' : '▼'}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="muted">{(info.options as Record<string, { desc: string }>)[c.laws[k]].desc}</div>
            </div>
          );
        })}
      </Section>
      <Section title="법안 현황">
        {bills.length === 0 && <div className="muted">심의 중인 법안이 없습니다.</div>}
        {bills.map((b) => <BillRow key={b.id} ctx={ctx} b={b} />)}
      </Section>
    </div>
  );
}
