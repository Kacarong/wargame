import type { ProvinceStatic, WorldStatic, CountryStatic } from './types';

let WORLD: WorldStatic | null = null;
let byOwner: Map<string, number[]> = new Map();

export function setWorld(w: WorldStatic): void {
  WORLD = w;
  byOwner = new Map();
  for (const p of w.provinces) {
    if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
    byOwner.get(p.owner)!.push(p.id);
  }
}

export function world(): WorldStatic {
  if (!WORLD) throw new Error('world not loaded');
  return WORLD;
}

export function prov(id: number): ProvinceStatic {
  return world().provinces[id];
}

/** Provinces whose original (core) owner is `tag`. */
export function coreProvinces(tag: string): number[] {
  return byOwner.get(tag) ?? [];
}

export function countryStatic(tag: string): CountryStatic | undefined {
  return world().countries.find((c) => c.tag === tag);
}

export async function loadWorld(base = './data'): Promise<{ world: WorldStatic; topo: unknown }> {
  const [meta, topo] = await Promise.all([
    fetch(`${base}/provinces.json`).then((r) => r.json()),
    fetch(`${base}/world.topo.json`).then((r) => r.json()),
  ]);
  const w: WorldStatic = { provinces: meta.provinces, countries: meta.countries };
  setWorld(w);
  return { world: w, topo };
}
