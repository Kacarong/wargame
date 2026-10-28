import { readFileSync } from 'node:fs';
import { setWorld } from '../src/sim/world';
import { newGame } from '../src/sim/init';
import { EQUIP_BY_ID } from '../src/data/equipment';
const meta = JSON.parse(readFileSync('public/data/provinces.json', 'utf8'));
setWorld({ provinces: meta.provinces, countries: meta.countries });
const s = newGame('KOR');
for (const t of ['KOR', 'USA', 'CHN', 'RUS', 'JPN']) console.log(t, s.countries[t].lines.map((l) => `${EQUIP_BY_ID[l.equip].name}(${EQUIP_BY_ID[l.equip].year})x${l.lines}`).join(', '));
