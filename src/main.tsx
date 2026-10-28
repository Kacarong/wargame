import { createRoot } from 'react-dom/client';
import type { Topology } from 'topojson-specification';
import { loadWorld } from './sim/world';
import { App } from './ui/App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="loading">세계 지도를 불러오는 중…</div>);
loadWorld('./data').then(({ topo }) => {
  root.render(<App topo={topo as Topology} />);
});
