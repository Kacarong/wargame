import { useState } from 'react';
import { EQUIPMENT, EQUIP_BY_ID } from '../data/equipment';
import type { EquipCat } from '../data/schema';
import { autoDeploy, createDivision } from '../sim/ai';
import { CAT_NAMES, canProduce, quality } from '../sim/equip';
import { disband, divStats, maxOrg, supplyAt } from '../sim/military';
import type { Battalion, Country, Division, GameState } from '../sim/types';
import { BATTALION_KINDS, COMPANY_DEFS, makeBattalion, requirements } from '../sim/units';
import { num } from '../sim/util';
import { prov } from '../sim/world';
import { Bar, Section, Stat, type UICtx } from './common';
import { equipTooltip } from './ProductionPanel';

function modelsFor(s: GameState, c: Country, cat: EquipCat): string[] {
  const set = new Set<string>();
  for (const [id, n] of Object.entries(c.stockpile)) if (n > 0 && EQUIP_BY_ID[id]?.cat === cat) set.add(id);
  for (const d of Object.values(s.divisions)) if (d.owner === c.tag) for (const id of Object.keys(d.equip)) if (EQUIP_BY_ID[id]?.cat === cat) set.add(id);
  for (const e of EQUIPMENT) if (e.cat === cat && canProduce(c, e)) set.add(e.id);
  return [...set].sort((a, b) => quality(EQUIP_BY_ID[b]) - quality(EQUIP_BY_ID[a]));
}

function stockOfCat(c: Country, cat: EquipCat): number {
  let n = 0;
  for (const [id, v] of Object.entries(c.stockpile)) if (EQUIP_BY_ID[id]?.cat === cat) n += v;
  return n;
}

/** Battalion/company editor shared by divisions and templates. */
function OrbatEditor({ ctx, bns, onChange }: { ctx: UICtx; bns: Battalion[]; onChange: (b: Battalion[]) => void }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const [open, setOpen] = useState<number | null>(null);
  const [addKind, setAddKind] = useState('inf_bn');
  const defaults: Partial<Record<EquipCat, string>> = {};
  for (const cat of ['tank', 'ifv', 'apc', 'spg', 'towed', 'mlrs', 'sam'] as EquipCat[]) defaults[cat] = modelsFor(s, c, cat)[0];
  const update = (i: number, b: Battalion | null) => {
    const next = bns.slice();
    if (b) next[i] = b; else next.splice(i, 1);
    onChange(next);
  };
  return (
    <div className="orbat">
      {bns.map((b, i) => (
        <div key={i} className="bn">
          <div className="row between bn-head" onClick={() => setOpen(open === i ? null : i)}>
            <span>{open === i ? '▾' : '▸'} {b.name} <span className="muted">({b.companies.length}개 중대)</span></span>
            <button className="small" onClick={(e) => { e.stopPropagation(); update(i, null); }}>삭제</button>
          </div>
          {open === i && (
            <div className="companies">
              {b.companies.map((comp, j) => {
                const def = COMPANY_DEFS[comp.type];
                return (
                  <div key={j} className="row company">
                    <span className="cname">{def.name}</span>
                    <span className="muted">{def.men}명{def.count ? ` · ${CAT_NAMES[def.cat!]} ${def.count}` : ''}</span>
                    {def.cat && (
                      <select value={comp.equip ?? ''} onChange={(e) => {
                        const nb = { ...b, companies: b.companies.slice() };
                        nb.companies[j] = { ...comp, equip: e.target.value || undefined };
                        update(i, nb);
                      }}>
                        <option value="">(자동)</option>
                        {modelsFor(s, c, def.cat).map((id) => <option key={id} value={id}>{EQUIP_BY_ID[id].name}</option>)}
                      </select>
                    )}
                    <button className="small" onClick={() => { const nb = { ...b, companies: b.companies.filter((_, k) => k !== j) }; update(i, nb); }}>×</button>
                  </div>
                );
              })}
              <div className="row">
                <select onChange={(e) => {
                  if (!e.target.value) return;
                  const t = e.target.value as keyof typeof COMPANY_DEFS;
                  const def = COMPANY_DEFS[t];
                  const nb = { ...b, companies: [...b.companies, def.cat ? { type: t, equip: defaults[def.cat] } : { type: t }] };
                  update(i, nb);
                  e.target.value = '';
                }}>
                  <option value="">+ 중대 추가</option>
                  {Object.values(COMPANY_DEFS).map((d) => <option key={d.type} value={d.type}>{d.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="row">
        <select value={addKind} onChange={(e) => setAddKind(e.target.value)}>
          {BATTALION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button className="small" onClick={() => {
          const n = bns.filter((b) => b.kind === addKind).length + 1;
          onChange([...bns, makeBattalion(addKind, defaults, n)]);
        }}>대대 추가</button>
      </div>
    </div>
  );
}

function ReqTable({ c, d, bns }: { c: Country; d?: Division; bns: Battalion[] }) {
  const req = requirements(bns);
  return (
    <table className="tbl">
      <thead><tr><th>구분</th><th>소요</th>{d && <th>보유</th>}<th>비축</th><th>장비</th></tr></thead>
      <tbody>
        <tr><td>병력</td><td className="num">{num(req.men)}</td>{d && <td className="num">{num(d.men)}</td>}<td className="num">{num(c.manpower * 1000)}</td><td className="muted">징집 가능 인원</td></tr>
        {(Object.entries(req.byCat) as [EquipCat, { count: number }][]).map(([cat, slot]) => {
          const held = d ? Object.entries(d.equip).filter(([id]) => EQUIP_BY_ID[id]?.cat === cat) : [];
          const have = held.reduce((a, [, n]) => a + n, 0);
          return (
            <tr key={cat}>
              <td>{CAT_NAMES[cat]}</td>
              <td className="num">{num(slot.count)}</td>
              {d && <td className={`num ${have < slot.count * 0.9 ? 'bad' : ''}`}>{num(have)}</td>}
              <td className="num">{num(stockOfCat(c, cat))}</td>
              <td className="muted small-text">{held.filter(([, n]) => n >= 1).map(([id, n]) => <span key={id} title={equipTooltip(id)}>{EQUIP_BY_ID[id].name} {num(n)} </span>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DivisionDetail({ ctx, d }: { ctx: UICtx; d: Division }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const st = divStats(d);
  const corps = Object.values(s.corps).filter((x) => x.owner === c.tag);
  return (
    <Section title={d.name} right={<span className="row">
      <button className="small" onClick={() => ctx.focusProv(d.prov)}>지도</button>
      <button className="small" onClick={() => { if (confirm(`${d.name}을(를) 해산할까요? 장비와 병력은 비축으로 돌아갑니다.`)) { disband(s, d); ctx.setSelectedDivs([]); ctx.bump(); } }}>해산</button>
    </span>}>
      <div className="row">
        <input className="name-input" value={d.name} onChange={(e) => { d.name = e.target.value; ctx.bump(); }} />
        <select value={d.corps ?? ''} onChange={(e) => { d.corps = e.target.value ? +e.target.value : null; ctx.bump(); }}>
          <option value="">(군단 미배속)</option>
          {corps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <Stat k="위치" v={`${prov(d.prov).name}${d.path.length ? ` → ${prov(d.path[d.path.length - 1]).name} 이동 중` : ''}`} />
      <div className="kv3">
        <div>조직력<Bar value={d.org} max={100} color="#58b368" label={`${d.org.toFixed(0)} / ${maxOrg(d).toFixed(0)}`} /></div>
        <div>충원율<Bar value={st.fill * 100} color="#4f9dd9" label={`${(st.fill * 100).toFixed(0)}%`} /></div>
        <div>보급<Bar value={supplyAt(s, c.tag, d.prov) * 100} max={120} color="#d9b44f" label={`${(supplyAt(s, c.tag, d.prov) * 100).toFixed(0)}%`} /></div>
      </div>
      {d.training > 0 && <div className="warn">훈련 중: {d.training}일 남음 (조직력 상한 감소)</div>}
      <div className="statgrid">
        <Stat k="대인 공격" v={st.soft.toFixed(0)} />
        <Stat k="대전차 공격" v={st.hard.toFixed(0)} />
        <Stat k="방어" v={st.def.toFixed(0)} />
        <Stat k="방공" v={st.aa.toFixed(0)} />
        <Stat k="장갑" v={st.armor.toFixed(0)} />
        <Stat k="관통" v={st.pierce.toFixed(0)} />
        <Stat k="기갑화율" v={`${(st.hardness * 100).toFixed(0)}%`} />
        <Stat k="속도" v={`${st.speed.toFixed(0)} km/일`} />
      </div>
      <ReqTable c={c} d={d} bns={d.battalions} />
      <div className="muted">대대·중대 구성을 바꾸면 부족한 장비와 병력은 비축분에서 매일 조금씩 보충됩니다.</div>
      <OrbatEditor ctx={ctx} bns={d.battalions} onChange={(b) => { d.battalions = b; ctx.bump(); }} />
    </Section>
  );
}

export function ArmyPanel({ ctx }: { ctx: UICtx }) {
  const s = ctx.s;
  const c = s.countries[s.player];
  const [tab, setTab] = useState<'oob' | 'templates'>('oob');
  const [tpl, setTpl] = useState<number | null>(c.templates[0]?.id ?? null);
  const divs = Object.values(s.divisions).filter((d) => d.owner === c.tag);
  const corps = Object.values(s.corps).filter((x) => x.owner === c.tag);
  const sel = ctx.selectedDivs.length === 1 ? s.divisions[ctx.selectedDivs[0]] : undefined;
  const groups: { id: number | null; name: string; divs: Division[] }[] = [
    ...corps.map((x) => ({ id: x.id as number | null, name: x.name, divs: divs.filter((d) => d.corps === x.id) })),
    { id: null, name: '군단 미배속', divs: divs.filter((d) => d.corps === null || !s.corps[d.corps]) },
  ];
  const template = c.templates.find((t) => t.id === tpl);
  const totalMen = divs.reduce((a, d) => a + d.men, 0);
  return (
    <div>
      <Section title="지상군">
        <Stat k="사단" v={`${divs.length}개`} />
        <Stat k="야전 병력" v={`${num(totalMen)}명`} />
        <Stat k="징집 가능 인원" v={`${num(c.manpower * 1000)}명`} />
        <div className="muted">지도: 부대 마커 클릭(Shift로 추가 선택) → 목표 프로빈스 우클릭으로 이동/공격. 해안끼리는 해군 우세 시 상륙작전 가능.</div>
      </Section>
      <div className="tabs-small">
        <button className={tab === 'oob' ? 'active' : ''} onClick={() => setTab('oob')}>전투 서열 (군단·사단)</button>
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>사단 편제 설계 · 창설</button>
      </div>
      {tab === 'oob' && (
        <>
          <div className="row">
            <button className="small" onClick={() => {
              const id = s.nextId++;
              s.corps[id] = { id, owner: c.tag, name: `제${corps.length + 1}군단`, commander: '-' };
              ctx.bump();
            }}>새 군단 창설</button>
            {ctx.selectedDivs.length > 1 && <span className="muted">{ctx.selectedDivs.length}개 사단 선택됨</span>}
          </div>
          {groups.map((g) => (
            <div key={g.id ?? 'none'} className="corps">
              <div className="row between corps-head">
                {g.id !== null ? (
                  <input className="name-input" value={g.name} onChange={(e) => { s.corps[g.id!].name = e.target.value; ctx.bump(); }} />
                ) : <b>{g.name}</b>}
                <span className="row">
                  <span className="muted">{g.divs.length}개 사단</span>
                  <button className="small" onClick={() => ctx.setSelectedDivs(g.divs.map((d) => d.id))}>전체 선택</button>
                  <button className="small" title="이 부대들을 전선(적 또는 적대국 접경)에 자동 배치합니다" onClick={() => { autoDeploy(s, c.tag, g.divs); ctx.bump(); }}>전선 배치</button>
                  {g.id !== null && g.divs.length === 0 && <button className="small" onClick={() => { delete s.corps[g.id!]; ctx.bump(); }}>해체</button>}
                </span>
              </div>
              {g.divs.map((d) => {
                const st = divStats(d);
                return (
                  <div key={d.id} className={`div-row ${ctx.selectedDivs.includes(d.id) ? 'sel' : ''}`} onClick={(e) => {
                    if (e.shiftKey) ctx.setSelectedDivs(ctx.selectedDivs.includes(d.id) ? ctx.selectedDivs.filter((x) => x !== d.id) : [...ctx.selectedDivs, d.id]);
                    else ctx.setSelectedDivs([d.id]);
                  }}>
                    <span className="dname">{d.name}</span>
                    <span className="muted dloc">{prov(d.prov).name}{d.inBattle ? ' ⚔' : d.path.length ? ' →' : ''}</span>
                    <Bar value={d.org} color="#58b368" />
                    <Bar value={st.fill * 100} color="#4f9dd9" />
                  </div>
                );
              })}
            </div>
          ))}
          {sel && <DivisionDetail ctx={ctx} d={sel} />}
        </>
      )}
      {tab === 'templates' && (
        <>
          <div className="row">
            <select value={tpl ?? ''} onChange={(e) => setTpl(+e.target.value)}>
              {c.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="small" onClick={() => {
              const id = Math.max(0, ...c.templates.map((t) => t.id)) + 1;
              const base = template ? JSON.parse(JSON.stringify(template.battalions)) : [];
              c.templates.push({ id, name: `${template?.name ?? '신규'} (사본)`, battalions: base });
              setTpl(id);
              ctx.bump();
            }}>복제</button>
            <button className="small" onClick={() => {
              const id = Math.max(0, ...c.templates.map((t) => t.id)) + 1;
              c.templates.push({ id, name: '신규 편제', battalions: [] });
              setTpl(id);
              ctx.bump();
            }}>새 편제</button>
          </div>
          {template && (
            <Section title="편제 설계" right={<button className="primary small" onClick={() => {
              const d = createDivision(s, c, template.id);
              if (d) { ctx.toast(`${d.name} 창설 — 수도에서 60일간 훈련 후 전력화됩니다.`); ctx.setSelectedDivs([d.id]); }
              ctx.bump();
            }}>이 편제로 사단 창설</button>}>
              <input className="name-input" value={template.name} onChange={(e) => { template.name = e.target.value; ctx.bump(); }} />
              <ReqTable c={c} bns={template.battalions} />
              <OrbatEditor ctx={ctx} bns={template.battalions} onChange={(b) => { template.battalions = b; ctx.bump(); }} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
