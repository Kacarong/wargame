import { useEffect, useMemo, useRef } from 'react';
import { geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { GameState } from '../sim/types';
import { world } from '../sim/world';
import { atWar, friendly } from '../sim/military';
import { getRel } from '../sim/util';

export type MapMode = 'political' | 'relations' | 'alliance';

interface Props {
  topo: Topology;
  game: GameState;
  version: number;
  mode: MapMode;
  selectedProv: number | null;
  selectedDivs: number[];
  onProvince: (id: number, shift: boolean) => void;
  onUnits: (prov: number, shift: boolean) => void;
  onOrder: (id: number) => void;
  focus?: { prov: number; nonce: number } | null;
}

const W = 2000;
const H = 1300;

interface Geo {
  projection: GeoProjection;
  paths: Path2D[];
  bbox: [number, number, number, number][];
  centers: [number, number][];
  coast: Path2D;
  provBorders: Path2D;
}

function buildGeo(topo: Topology): Geo {
  const obj = topo.objects.provinces as GeometryCollection;
  const fc = feature(topo, obj) as unknown as GeoJSON.FeatureCollection;
  // antimeridian cut at 169°W so Chukotka stays with Russia and Alaska with the Americas
  const projection = geoMercator()
    .rotate([-11, 0])
    .fitExtent([[0, 0], [W, H]], { type: 'MultiPoint', coordinates: [[-168.5, -56], [-170.2, 78]] } as GeoJSON.MultiPoint);
  const gp = geoPath(projection);
  const paths: Path2D[] = [];
  const bbox: [number, number, number, number][] = [];
  const centers: [number, number][] = [];
  const n = world().provinces.length;
  for (let i = 0; i < n; i++) { paths.push(new Path2D()); bbox.push([0, 0, 0, 0]); centers.push([0, 0]); }
  for (const f of fc.features) {
    const id = (f.properties as { id: number }).id;
    const d = gp(f) ?? '';
    paths[id] = new Path2D(d);
    const b = gp.bounds(f);
    bbox[id] = [b[0][0], b[0][1], b[1][0], b[1][1]];
  }
  world().provinces.forEach((p) => {
    const xy = projection([p.lon, p.lat]) ?? [0, 0];
    centers[p.id] = [xy[0], xy[1]];
  });
  const coast = new Path2D(gp(mesh(topo, obj, (a, b) => a === b)) ?? '');
  const provBorders = new Path2D(gp(mesh(topo, obj, (a, b) => a !== b)) ?? '');
  return { projection, paths, bbox, centers, coast, provBorders };
}

function countryBorders(topo: Topology, geo: Geo, owners: string[]): Path2D {
  const obj = topo.objects.provinces as GeometryCollection;
  const gp = geoPath(geo.projection);
  const m = mesh(topo, obj, (a, b) => {
    const ia = (a.properties as { id: number }).id;
    const ib = (b.properties as { id: number }).id;
    return owners[ia] !== owners[ib];
  });
  return new Path2D(gp(m) ?? '');
}

function relColor(v: number): string {
  if (v >= 0) {
    const t = Math.min(1, v / 100);
    return `rgb(${Math.round(120 - 80 * t)},${Math.round(120 + 60 * t)},${Math.round(110 - 40 * t)})`;
  }
  const t = Math.min(1, -v / 100);
  return `rgb(${Math.round(130 + 90 * t)},${Math.round(115 - 70 * t)},${Math.round(105 - 60 * t)})`;
}

export function MapView(props: Props) {
  const { topo, game, version, mode, selectedProv, selectedDivs } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef<ZoomTransform>(zoomIdentity);
  const geo = useMemo(() => buildGeo(topo), [topo]);
  const bordersRef = useRef<{ key: string; path: Path2D } | null>(null);
  const hatch = useRef<CanvasPattern | null>(null);
  const counterRects = useRef<{ prov: number; x: number; y: number; w: number; h: number }[]>([]);
  const raf = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;

  const draw = () => {
    raf.current = 0;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; }
    const { game: s, mode: mm, selectedProv: sp, selectedDivs: sd } = propsRef.current;
    const t = tRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#16232e';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    const k = t.k;
    // visible bounds in map coords
    const vx0 = -t.x / k, vy0 = -t.y / k, vx1 = (cw - t.x) / k, vy1 = (ch - t.y) / k;
    if (!hatch.current) {
      const pc = document.createElement('canvas');
      pc.width = pc.height = 8;
      const g = pc.getContext('2d')!;
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
      hatch.current = ctx.createPattern(pc, 'repeat');
    }
    const player = s.player;
    const provs = s.provinces;
    for (let i = 0; i < provs.length; i++) {
      const b = geo.bbox[i];
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      const st = provs[i];
      let color: string;
      if (mm === 'relations') {
        color = st.owner === player ? '#d9c36a' : atWar(s, player, st.controller) ? '#c0392b' : relColor(getRel(s, player, st.owner));
      } else if (mm === 'alliance') {
        color = st.owner === player ? '#d9c36a' : atWar(s, player, st.controller) ? '#c0392b' : friendly(s, player, st.owner) ? '#4f9d69' : '#59636b';
      } else {
        color = s.countries[st.controller]?.color ?? '#555';
      }
      ctx.fillStyle = color;
      ctx.fill(geo.paths[i]);
      if (st.controller !== st.owner && mm === 'political') {
        ctx.fillStyle = hatch.current!;
        ctx.fill(geo.paths[i]);
      }
    }
    // province borders when zoomed in
    if (k > 2.2) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.6 / k;
      ctx.stroke(geo.provBorders);
    }
    // country borders (recomputed when ownership changes)
    const owners = provs.map((p) => p.owner);
    const key = owners.join(',');
    if (!bordersRef.current || bordersRef.current.key !== key) bordersRef.current = { key, path: countryBorders(topo, geo, owners) };
    ctx.strokeStyle = 'rgba(10,10,10,0.85)';
    ctx.lineWidth = 1.2 / k;
    ctx.stroke(bordersRef.current.path);
    ctx.strokeStyle = 'rgba(200,220,235,0.35)';
    ctx.lineWidth = 0.8 / k;
    ctx.stroke(geo.coast);
    // selected province outline
    if (sp !== null) {
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 2.2 / k;
      ctx.stroke(geo.paths[sp]);
    }
    // battles
    for (const b of s.battles) {
      const [x, y] = geo.centers[b.prov];
      ctx.fillStyle = 'rgba(230,40,30,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 7 / Math.sqrt(k), 0, Math.PI * 2);
      ctx.fill();
    }
    // labels: countries at low zoom, provinces at high zoom
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (k < 4.5) {
      ctx.font = `${12 / k}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const c of Object.values(s.countries)) {
        if (!c.alive) continue;
        const cs = world().countries.find((x) => x.tag === c.tag);
        if (!cs || cs.area * k * k < 250000) continue;
        const [x, y] = geo.centers[c.capital];
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        ctx.fillText(c.name, x, y - 10 / k);
      }
    } else {
      ctx.font = `${10 / k}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const p of world().provinces) {
        const [x, y] = geo.centers[p.id];
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const b = geo.bbox[p.id];
        // only label provinces that are wide enough on screen to fit their name
        if ((b[2] - b[0]) * k < p.name.length * 9) continue;
        ctx.fillText(p.name, x, y - 12 / k);
      }
    }
    // unit counters
    const byProv = new Map<number, { own: number; enemy: number; other: number; sel: boolean; color: string }>();
    for (const d of Object.values(s.divisions)) {
      const own = d.owner === player;
      if (!own && k < 2.5 && !atWar(s, player, d.owner)) continue;
      const e = byProv.get(d.prov) ?? { own: 0, enemy: 0, other: 0, sel: false, color: s.countries[d.owner]?.color ?? '#888' };
      if (own) e.own++;
      else if (atWar(s, player, d.owner)) e.enemy++;
      else e.other++;
      if (sd.includes(d.id)) e.sel = true;
      byProv.set(d.prov, e);
    }
    const rects: typeof counterRects.current = [];
    const sz = 1 / k;
    ctx.font = `bold ${11 * sz}px sans-serif`;
    for (const [pid, e] of byProv) {
      const [x, y] = geo.centers[pid];
      if (x < vx0 - 20 || x > vx1 + 20 || y < vy0 - 20 || y > vy1 + 20) continue;
      const draws: [number, string, string][] = [];
      if (e.own) draws.push([e.own, '#2f6fbf', '#fff']);
      if (e.enemy) draws.push([e.enemy, '#b8352b', '#fff']);
      if (e.other) draws.push([e.other, '#555c63', '#ddd']);
      draws.forEach(([n, bg, fg], j) => {
        const w = 22 * sz, h = 13 * sz;
        const rx = x - w / 2 + j * (w + 2 * sz) - ((draws.length - 1) * (w + 2 * sz)) / 2;
        const ry = y - h / 2;
        ctx.fillStyle = bg;
        ctx.fillRect(rx, ry, w, h);
        ctx.strokeStyle = e.sel && bg === '#2f6fbf' ? '#ffe680' : 'rgba(0,0,0,0.8)';
        ctx.lineWidth = (e.sel && bg === '#2f6fbf' ? 2 : 1) * sz;
        ctx.strokeRect(rx, ry, w, h);
        ctx.fillStyle = fg;
        ctx.fillText(String(n), rx + w / 2, ry + h / 2 + 0.5 * sz);
        if (bg === '#2f6fbf') rects.push({ prov: pid, x: rx, y: ry, w, h });
      });
    }
    counterRects.current = rects;
    // movement arrows for selected divisions
    ctx.strokeStyle = '#ffe680';
    ctx.lineWidth = 1.6 / k;
    for (const id of sd) {
      const d = s.divisions[id];
      if (!d || !d.path.length) continue;
      ctx.beginPath();
      const [x0, y0] = geo.centers[d.prov];
      ctx.moveTo(x0, y0);
      for (const p of d.path) { const [x, y] = geo.centers[p]; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  };

  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(draw); };

  useEffect(() => { schedule(); });
  useEffect(() => {
    const cv = canvasRef.current!;
    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.6, 60])
      .filter((ev: Event) => (ev.type === 'mousedown' ? (ev as MouseEvent).button === 0 : true) && !(ev as MouseEvent).ctrlKey)
      .on('zoom', (ev) => { tRef.current = ev.transform; schedule(); });
    const sel = select(cv);
    sel.call(z);
    // initial view: fit world
    const cw = cv.clientWidth, ch = cv.clientHeight;
    const k0 = Math.min(cw / W, ch / H) * 1.05;
    sel.call(z.transform, zoomIdentity.translate((cw - W * k0) / 2, (ch - H * k0) / 2).scale(k0));
    zoomRef.current = z;
    const onResize = () => schedule();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); sel.on('.zoom', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);
  const zoomRef = useRef<ReturnType<typeof d3zoom<HTMLCanvasElement, unknown>> | null>(null);

  // focus on a province (e.g. player's capital at start)
  useEffect(() => {
    if (!props.focus || !zoomRef.current) return;
    const cv = canvasRef.current!;
    const [x, y] = geo.centers[props.focus.prov];
    const k = 11;
    // the left sidebar covers ~470px: centre the focus in the visible part of the map
    const cx = 470 + (cv.clientWidth - 470) / 2;
    select(cv).call(zoomRef.current.transform, zoomIdentity.translate(cx - x * k, cv.clientHeight / 2 - y * k).scale(k));
  }, [props.focus, geo]);

  const pick = (ev: React.MouseEvent): { prov: number | null; unit: number | null } => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const t = tRef.current;
    const mx = (ev.clientX - r.left - t.x) / t.k;
    const my = (ev.clientY - r.top - t.y) / t.k;
    for (const c of counterRects.current) if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) return { prov: c.prov, unit: c.prov };
    const ctx = cv.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let found: number | null = null;
    for (let i = 0; i < geo.paths.length; i++) {
      const b = geo.bbox[i];
      if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
      if (ctx.isPointInPath(geo.paths[i], mx, my)) { found = i; break; }
    }
    ctx.restore();
    return { prov: found, unit: null };
  };

  const down = useRef<{ x: number; y: number } | null>(null);
  void version; void mode; void selectedProv; void selectedDivs; void game;

  return (
    <canvas
      ref={canvasRef}
      className="map"
      onMouseDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 4) return;
        const p = pick(e);
        if (p.unit !== null) props.onUnits(p.unit, e.shiftKey);
        else if (p.prov !== null) props.onProvince(p.prov, e.shiftKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const p = pick(e);
        if (p.prov !== null) props.onOrder(p.prov);
      }}
    />
  );
}
