import type { GameState, ProvinceStatic } from './types';

export const START_YEAR = 2026;

export function dateOf(day: number): Date {
  return new Date(Date.UTC(START_YEAR, 0, 1 + day));
}

export function fmtDate(day: number): string {
  const d = dateOf(day);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function yearOf(day: number): number {
  return dateOf(day).getUTCFullYear() + dateOf(day).getUTCMonth() / 12;
}

export function dayOfYear(year: number, month = 1, date = 1): number {
  return Math.round((Date.UTC(year, month - 1, date) - Date.UTC(START_YEAR, 0, 1)) / 86400000);
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function relKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getRel(s: GameState, a: string, b: string): number {
  return s.relations[relKey(a, b)] ?? 0;
}

export function addRel(s: GameState, a: string, b: string, d: number): void {
  const k = relKey(a, b);
  s.relations[k] = clamp((s.relations[k] ?? 0) + d, -100, 100);
}

export function rand(s: GameState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

export function km(a: ProvinceStatic, b: ProvinceStatic): number {
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Billion USD -> compact Korean string. */
export function money(b: number): string {
  const abs = Math.abs(b);
  const sign = b < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}T`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}B`;
  return `${sign}$${(abs * 1000).toFixed(0)}M`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function log(s: GameState, text: string, tags: string[], important = false): void {
  s.log.push({ day: s.day, text, tags, important });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

export function nextId(s: GameState): number {
  return s.nextId++;
}
