import { useCallback, useEffect, useRef, useState } from 'react';
import type { Topology } from 'topojson-specification';
import { ALLIANCES, COUNTRY_DATA } from '../data/countries';
import { newGame } from '../sim/init';
import { step } from '../sim/tick';
import type { GameState } from '../sim/types';
import { atWar, orderMove } from '../sim/military';
import { fmtDate, money, num } from '../sim/util';
import { countryStatic, prov } from '../sim/world';
import { Bar, type Tab, type UICtx } from './common';
import { MapView, type MapMode } from './MapView';
import { OverviewPanel } from './OverviewPanel';
import { PoliticsPanel } from './PoliticsPanel';
import { EconomyPanel } from './EconomyPanel';
import { ResearchPanel } from './ResearchPanel';
import { ProductionPanel } from './ProductionPanel';
import { ArmyPanel } from './ArmyPanel';
import { AirNavyPanel } from './AirNavyPanel';
import { DiplomacyPanel, countrySummary } from './DiplomacyPanel';

const SPEEDS = [0, 1000, 450, 200, 80, 25]; // ms per day
const SAVE_KEY = 'modern-wargame-save';

const TABS: [Tab, string][] = [
  ['overview', '개요'],
  ['politics', '정치·의회'],
  ['economy', '경제·예산'],
  ['research', '연구'],
  ['production', '생산·조달'],
  ['army', '지상군 편제'],
  ['airnavy', '공군·해군'],
  ['diplomacy', '외교'],
];

export function App({ topo }: { topo: Topology }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [version, setVersion] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [lastSpeed, setLastSpeed] = useState(2);
  const [tab, setTab] = useState<Tab>('overview');
  const [mode, setMode] = useState<MapMode>('political');
  const [selProv, setSelProv] = useState<number | null>(null);
  const [selDivs, setSelDivs] = useState<number[]>([]);
  const [diploTarget, setDiploTarget] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [focus, setFocus] = useState<{ prov: number; nonce: number } | null>(null);
  const [pick, setPick] = useState<string>('KOR');
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const toast = useCallback((text: string) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const gameRef = useRef(game);
  gameRef.current = game;

  // game loop
  useEffect(() => {
    if (!game || speed === 0) return;
    const ms = SPEEDS[speed];
    const tickMs = Math.max(ms, 40);
    const perTick = Math.max(1, Math.round(tickMs / ms));
    const h = setInterval(() => {
      const s = gameRef.current;
      if (!s) return;
      for (let i = 0; i < perTick; i++) step(s);
      if (s.gameOver) setSpeed(0);
      bump();
    }, tickMs);
    return () => clearInterval(h);
  }, [game, speed, bump]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (!gameRef.current) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpeed((sp) => { if (sp) { setLastSpeed(sp); return 0; } return lastSpeed; });
      }
      if (/^Digit[1-5]$/.test(e.code)) setSpeed(+e.code.slice(5));
      if (e.code === 'Escape') setSelDivs([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastSpeed]);

  if (!game) {
    const majors = COUNTRY_DATA.slice().sort((a, b) => b.gdp - a.gdp);
    const d = COUNTRY_DATA.find((x) => x.tag === pick);
    return (
      <div className="start">
        <div className="start-box">
          <h1>현대전 전략 시뮬레이션</h1>
          <div className="muted">2026년 1월 1일 시나리오 · 실제 세계지도 · 실존 무기 체계</div>
          <div className="start-grid">
            <div className="country-list">
              {majors.map((c) => (
                <div key={c.tag} className={`country-item ${pick === c.tag ? 'sel' : ''}`} onClick={() => setPick(c.tag)}>
                  <span className="swatch" style={{ background: c.color }} />
                  {c.name ?? countryStatic(c.tag)?.name ?? c.tag}
                  <span className="muted"> {money(c.gdp)}</span>
                </div>
              ))}
            </div>
            {d && (
              <div className="country-card">
                <h2>{d.name ?? countryStatic(d.tag)?.name ?? d.tag}</h2>
                <div>{d.leaderTitle} {d.leader}</div>
                <div className="muted">{{ democracy: '민주주의', hybrid: '혼합 체제', authoritarian: '권위주의' }[d.gov]} · {d.parliament}</div>
                <div>GDP {money(d.gdp)} · 인구 {d.pop.toFixed(1)}백만</div>
                <div>국방비 GDP {d.budget.military}% · 현역 {num(d.milActive * 1000)}명</div>
                <div>사단: {Object.entries(d.divisions).map(([k, v]) => `${{ armored: '기갑', mech: '기계화', inf: '보병', marine: '해병', airborne: '공수' }[k]} ${v}`).join(' · ')}</div>
                <div className="muted">동맹·조약: {d.alliances.map((a) => ALLIANCES.find((x) => x.id === a)?.name ?? a).join(', ') || '없음'}</div>
                <button className="primary big" onClick={() => {
                  const s = newGame(d.tag);
                  setGame(s);
                  setFocus({ prov: s.countries[d.tag].capital, nonce: Date.now() });
                }}>이 나라로 시작</button>
              </div>
            )}
          </div>
          <div className="row">
            <button onClick={() => {
              const raw = localStorage.getItem(SAVE_KEY);
              if (!raw) { toast('저장된 게임이 없습니다.'); return; }
              const s = JSON.parse(raw) as GameState;
              setGame(s);
              setFocus({ prov: s.countries[s.player].capital, nonce: Date.now() });
            }}>저장된 게임 불러오기</button>
            <span className="muted">지도에서 다른 나라도 플레이할 수 있도록 확장 예정</span>
          </div>
        </div>
        <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
      </div>
    );
  }

  const s = game;
  const c = s.countries[s.player];
  const ctx: UICtx = {
    s,
    bump,
    toast,
    run: (fn, ok) => {
      const err = fn();
      if (typeof err === 'string') toast(err);
      else if (ok) toast(ok);
      bump();
    },
    diploTarget,
    setDiploTarget,
    openTab: setTab,
    selectedDivs: selDivs,
    setSelectedDivs: (ids) => { setSelDivs(ids); if (ids.length) setTab('army'); bump(); },
    focusProv: (id) => setFocus({ prov: id, nonce: Date.now() }),
  };

  const onProvince = (id: number, shift: boolean) => {
    setSelProv(id);
    if (!shift) setSelDivs([]);
    const owner = s.provinces[id].controller;
    if (owner !== s.player) setDiploTarget(owner);
  };
  const onUnits = (pid: number, shift: boolean) => {
    const ids = Object.values(s.divisions).filter((d) => d.owner === s.player && d.prov === pid).map((d) => d.id);
    setSelDivs((cur) => (shift ? [...new Set([...cur, ...ids])] : ids));
    setSelProv(pid);
    setTab('army');
  };
  const onOrder = (pid: number) => {
    if (!selDivs.length) { onProvince(pid, false); return; }
    let err: string | null = null;
    let n = 0;
    for (const id of selDivs) {
      const d = s.divisions[id];
      if (!d) continue;
      const e = orderMove(s, d, pid);
      if (e) err = e; else n++;
    }
    if (err && !n) toast(err);
    else toast(`${n}개 사단 → ${prov(pid).name}${atWar(s, s.player, s.provinces[pid].controller) ? ' 공격' : ' 이동'}`);
    bump();
  };

  const sp = selProv !== null ? prov(selProv) : null;
  const spState = selProv !== null ? s.provinces[selProv] : null;
  const recent = s.log.filter((l) => l.tags.includes(s.player) || l.important).slice(-7).reverse();
  const summary = countrySummary(s, s.player);

  return (
    <div className="game">
      <MapView topo={topo} game={s} version={version} mode={mode} selectedProv={selProv} selectedDivs={selDivs} onProvince={onProvince} onUnits={onUnits} onOrder={onOrder} focus={focus} />
      <div className="topbar">
        <span className="swatch big" style={{ background: c.color }} />
        <b className="cname-top">{c.name}</b>
        <span className="tb" title="GDP">💰 {money(c.gdp)}</span>
        <span className="tb" title="성장률">{c.stats.growth >= 0 ? '▲' : '▼'} {c.stats.growth.toFixed(1)}%</span>
        <span className="tb" title="재정수지">재정 {money(c.stats.revenue - c.stats.spending)}</span>
        <span className="tb" title="현역 / 징집가능">👥 {num(summary.active)}k / {num(c.manpower)}k</span>
        <span className="tb tb-bar" title="지지율">지지 <Bar value={c.approval} label={c.approval.toFixed(0)} /></span>
        <span className="tb tb-bar" title="안정도">안정 <Bar value={c.stability} color="#58b368" label={c.stability.toFixed(0)} /></span>
        <span className="tb tb-bar" title="전쟁지지도">전쟁지지 <Bar value={c.warSupport} color="#d9734f" label={c.warSupport.toFixed(0)} /></span>
        <span className="spacer" />
        <span className="date">{fmtDate(s.day)}</span>
        <span className="speed">
          <button className={speed === 0 ? 'active' : ''} onClick={() => setSpeed(0)}>⏸</button>
          {[1, 2, 3, 4, 5].map((k) => <button key={k} className={speed === k ? 'active' : ''} onClick={() => setSpeed(k)}>{'▶'.repeat(Math.min(k, 3))}{k > 3 ? k : ''}</button>)}
        </span>
        <button className="small" onClick={() => { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); toast('저장했습니다.'); }}>저장</button>
      </div>
      <div className="sidebar">
        <div className="tabs">
          {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </div>
        <div className="panel">
          {tab === 'overview' && <OverviewPanel ctx={ctx} />}
          {tab === 'politics' && <PoliticsPanel ctx={ctx} />}
          {tab === 'economy' && <EconomyPanel key={JSON.stringify(c.budget) + c.tax} ctx={ctx} />}
          {tab === 'research' && <ResearchPanel ctx={ctx} />}
          {tab === 'production' && <ProductionPanel ctx={ctx} />}
          {tab === 'army' && <ArmyPanel ctx={ctx} />}
          {tab === 'airnavy' && <AirNavyPanel ctx={ctx} />}
          {tab === 'diplomacy' && <DiplomacyPanel ctx={ctx} />}
        </div>
      </div>
      <div className="mapmodes">
        {([['political', '정치'], ['relations', '관계'], ['alliance', '동맹/적']] as [MapMode, string][]).map(([m, l]) => (
          <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{l}</button>
        ))}
      </div>
      {sp && spState && (
        <div className="provinfo">
          <b>{sp.name}</b> {sp.capital && <span className="tag-gov">수도</span>}
          <div className="muted">
            소유: {s.countries[spState.owner]?.name}
            {spState.controller !== spState.owner && <> · 점령: {s.countries[spState.controller]?.name}</>}
            {' '}· 면적 {num(sp.area)}km² · 도시 인구 {num(sp.cityPop)}{sp.coastal ? ' · 해안' : ''}
          </div>
          <div className="muted">
            주둔: {Object.values(s.divisions).filter((d) => d.prov === selProv).map((d) => `${s.countries[d.owner]?.name} ${d.name}`).slice(0, 6).join(', ') || '없음'}
          </div>
          {spState.controller !== s.player && (
            <button className="small" onClick={() => { setDiploTarget(spState.controller); setTab('diplomacy'); }}>{s.countries[spState.controller]?.name} 외교</button>
          )}
        </div>
      )}
      <div className="log">
        {recent.map((l, i) => <div key={i} className={l.important ? 'imp' : ''}><span className="muted">{fmtDate(l.day)}</span> {l.text}</div>)}
      </div>
      {s.gameOver && <div className="gameover">{s.gameOver}</div>}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
    </div>
  );
}
