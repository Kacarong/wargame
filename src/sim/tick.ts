import { aiAttack, aiMonthly, autoDeploy } from './ai';
import { billTick, economyTick, politicsMonthly, productionTick, researchTick, worldGdp } from './domestic';
import { militaryTick, warsOf, warTick } from './military';
import type { GameState } from './types';
import { dateOf, log } from './util';
import { setGameYear } from './equip';

/** Advance the simulation by one day. */
export function step(s: GameState): void {
  if (s.gameOver) return;
  s.day++;
  setGameYear(dateOf(s.day).getUTCFullYear());
  const wg = worldGdp(s);
  const countries = Object.values(s.countries).filter((c) => c.alive);
  for (const c of countries) {
    economyTick(s, c, wg);
    researchTick(s, c);
    productionTick(s, c);
    for (const j of c.justifications) {
      if (j.daysLeft > 0) {
        j.daysLeft--;
        if (j.daysLeft === 0 && c.tag === s.player) log(s, `${s.countries[j.target].name}에 대한 전쟁 명분이 완성되었습니다. 선전포고안을 제출할 수 있습니다.`, [c.tag], true);
      }
    }
  }
  billTick(s);
  militaryTick(s);
  warTick(s);

  for (const c of countries) {
    if (c.tag === s.player || !c.alive) continue;
    if (!warsOf(s, c.tag).length) continue;
    if (s.day % 7 === c.tag.charCodeAt(0) % 7) autoDeploy(s, c.tag);
    else if (s.day % 2 === 0) aiAttack(s, c.tag);
  }

  if (dateOf(s.day).getUTCDate() === 1) {
    for (const c of countries) {
      if (!c.alive) continue;
      politicsMonthly(s, c);
      if (c.tag !== s.player) {
        aiMonthly(s, c);
        if (!warsOf(s, c.tag).length && dateOf(s.day).getUTCMonth() % 3 === 0) autoDeploy(s, c.tag);
      }
    }
    s.tension += (30 - s.tension) * 0.03;
  }

  const p = s.countries[s.player];
  if (!p?.alive) s.gameOver = `${p?.name ?? s.player}이(가) 멸망했습니다.`;
}
