import type { ReactNode } from 'react';
import type { GameState } from '../sim/types';

export interface UICtx {
  s: GameState;
  bump: () => void;
  toast: (msg: string) => void;
  /** Run an action returning an error string; toasts errors and re-renders. */
  run: (fn: () => string | null | void, ok?: string) => void;
  diploTarget: string | null;
  setDiploTarget: (tag: string | null) => void;
  openTab: (tab: Tab) => void;
  selectedDivs: number[];
  setSelectedDivs: (ids: number[]) => void;
  focusProv: (id: number) => void;
}

export type Tab = 'overview' | 'politics' | 'economy' | 'research' | 'production' | 'army' | 'airnavy' | 'diplomacy';

export function Bar({ value, max = 100, color = '#4f9dd9', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar" title={label}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      {label && <span className="bar-label">{label}</span>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Stat({ k, v, hint }: { k: string; v: ReactNode; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <span className="stat-k">{k}</span>
      <span className="stat-v">{v}</span>
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} />;
}
