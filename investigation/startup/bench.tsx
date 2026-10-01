// Measurement-only workspace composition. PR #92's parts are not connected to main.tsx yet.
import { render } from 'preact';
import { SidePanel } from './src/page/panel/SidePanel';
import { MapCard } from './src/page/card/MapCard';
import { loadFirstVisit } from './src/page/firstVisit/load';
import { createGenerator } from './src/platform';
import './src/styles/app.css';
import './src/styles/editor.css';
import './src/styles/components.css';
declare const __AFTER__: boolean;

const mark = (s: string) => performance.mark(s);
const api = createGenerator();
mark('worker-created');
const readyWorker = api.sessionInfo().then(() => mark('worker-ready'));
function panel(card = null) {
  return <SidePanel mode="generate" onMode={() => {}} onOpenChange={() => mark('response')} controls={{ generate: null, places: null }} card={card} />;
}
render(<div style={{ display: 'flex' }}>{panel()}<main /></div>, document.getElementById('app')!);
mark('shell');
const random = () => Number(new URLSearchParams(location.search).get('pick') ?? '0');
const editorLoad = () => import('./src/editor/Editor').then(m => { mark('editor-loaded'); return m.default; });
const load = async () => { const first = await loadFirstVisit(random); mark('map-downloaded'); return first; };
const pendingEditor = __AFTER__ ? editorLoad() : null;
const first = await load();
if (!first) throw Error('First-visit fixture unavailable');
await readyWorker;
mark('project-open-start');
const opened = await api.openProject(first.project);
mark('project-open-end');
const Editor = await (pendingEditor ?? editorLoad());
const card = { name: first.map.name, plays: '', origin: { kind: 'generated' as const, seed: first.map.seed, W: opened.info.W, H: opened.info.H }, entities: [], walkReach: null, levers: null };
render(<div style={{ display: 'flex', height: '100vh' }}>{panel(<MapCard card={card} />)}<main style={{ flex: 1, position: 'relative' }}><Editor api={api} opened={opened} onBack={() => {}} onChange={() => {}} onOpenFile={() => {}} saveState="" /></main></div>, document.getElementById('app')!);
// The harness exposes the worker for semantic edit/undo and equality checks.
(window as any).startup = { api, opened, map: first.map };
mark('editor-mounted');
