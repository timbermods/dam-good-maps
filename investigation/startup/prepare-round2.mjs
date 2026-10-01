import {cpSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
const here=dirname(fileURLToPath(import.meta.url)),local=join(here,'local');
const before=join(local,'round2-before'),after=join(local,'round2-after');
for(const dir of [before,after])cpSync(join(local,'after'),dir,{recursive:true});
const changes=new Map();
const change=(path,fn)=>{const old=readFileSync(join(before,path),'utf8').replaceAll('\r\n','\n');changes.set(path,fn(old));};
changes.set('src/core/doc/checkpoint.ts',readFileSync(join(here,'checkpoint.ts'),'utf8'));
changes.set('src/render3d/prepared.ts',readFileSync(join(here,'prepared.ts'),'utf8'));
change('src/core/doc/document.ts',s=>s.replace('export interface MapDocument {','import type { BuildCheckpoint } from "./checkpoint";\n\nexport interface MapDocument {\n  /** Exact optional current build; old readers ignore it and rebuild the document. */\n  checkpoint?: BuildCheckpoint;'));
change('src/core/doc/session.ts',s=>s.replace('import { buildMap,','import { checkpoint, restoreCheckpoint } from "./checkpoint";\nimport { buildMap,')
  .replace('this.cur = built ?? buildMap(this.input());',`const stored = built ? null : restoreCheckpoint(doc);
    this.cur = built ?? stored ?? buildMap(this.input());
    if (stored) {
      // Incremental build keys compare immutable input layers by identity. Rebind the decoded
      // cache to this session's equivalent layers; do not treat opening as a changed terrain.
      const input = this.input();
      this.cur.cache = { ...this.cur.cache, base: input.base ?? null, field: input.field ?? null, locked: input.locked ?? null };
    }`)
  .replace('return encodeProject(this.document, level);','const doc = this.document;\n    // A pending preview has no built canonical state to store. Keep the existing fast save\n    // and canonical reopen path; never make autosave settle water on the editing worker.\n    if (this.waterPending) return encodeProject(doc, level);\n    return encodeProject({ ...doc, checkpoint: checkpoint(doc, this.cur) }, level);'));
change('src/core/library/firstVisit.ts',s=>s.replace('const project = encodeProject(generatedDocument(r));','const project = MapSession.open(generatedDocument(r)).project();'));
change('src/worker/session.ts',s=>s.replace('import { MapSession', 'import { checkpoint } from "../core/doc/checkpoint";\nimport { MapSession')
 .replace('    p = { version, doc: s.document, keep: 0, add: [] };',`    const doc = s.document;
    // The canonical initial replica can use the same exact state. A pending preview keeps the
    // normal replay/rebuild route: never settle on the editing worker merely to start checks.
    if (!s.waterPending) doc.checkpoint = checkpoint(doc, s.built);
    p = { version, doc, keep: 0, add: [] };`));
change('src/platform/index.ts',s=>s.replace('export function createGenerator(): Remote<GeneratorApi> {','export function createGenerator(options: { checksAfter?: Promise<void> } = {}): Remote<GeneratorApi> {')
 .replace('  try {\n    const checks = new Worker','  const startChecks = () => {\n  try {\n    const checks = new Worker')
 .replace('  return api;','  };\n  if (options.checksAfter) void options.checksAfter.then(startChecks);\n  else startChecks();\n  return api;'));
change('src/render3d/renderer.ts',s=>s.replace('  /** WebGL context info:',`  /** Warm the same terrain/water/fall/instanced-object programs and GPU state used on first visit. */
  async prepareFirstFrame(): Promise<void> {
    const W=4, H=4, heights=new Uint8Array([3,3,1,1,3,3,1,1,1,1,1,1,1,1,1,1]);
    this.setMap({W,H,heights,columns:{tiles:new Int32Array(0),voxels:new Uint8Array(0)},
      water:{count:3,tile:new Int32Array([1,2,6]),floor:new Float32Array([3,1,1]),depth:new Float32Array([1,1,1]),contamination:new Float32Array(3)},
      entities:{count:1,templates:["Oak"],owners:["warm"],template:new Uint16Array(1),x:new Int16Array([0]),y:new Int16Array([0]),z:new Int16Array([3]),orientation:new Uint8Array(1),flags:new Uint8Array(1),owner:new Uint16Array(1),variant:new Uint8Array([255]),strength:new Float32Array(1)}}, false, true);
    this.placeCamera();
    await this.gl.compileAsync(this.scene,this.camera());
    this.renderNow();
    const ctx=this.gl.getContext();ctx.readPixels(0,0,1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,new Uint8Array(4));
  }

  /** The loader reparents this canvas into View3D; its ResizeObserver follows the same canvas. */
  fitPreparedCanvas(): void { this.fit(); }

  /** WebGL context info:`)
 .replace('setMap(v: MapView, keepView = false): BuildStats {','setMap(v: MapView, keepView = false, prepare = false): BuildStats {')
 .replace('    this.renderNow();\n    // wait for the GPU','    if (!prepare) this.renderNow();\n    // wait for the GPU')
 .replace('    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4));','    if (!prepare) ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4));'));
change('src/ui/View3D.tsx',s=>s.replace('import type { ComponentChildren }','import { takePreparedRenderer } from "../render3d/prepared";\nimport type { ComponentChildren }')
 .replace('  onReady?(r: MapRenderer, stats: BuildStats): void;','  onReady?(r: MapRenderer, stats: BuildStats): void;\n  onError?(): void;')
 .replace('  const canvas = useRef<HTMLCanvasElement>(null);','  const canvas = useRef<HTMLCanvasElement>(null);\n  const canvasHost = useRef<HTMLDivElement>(null);')
 .replace('r = new MapRenderer(canvas.current!);',`r = takePreparedRenderer(canvasHost.current!) ?? (() => {
        const c = document.createElement("canvas"); canvasHost.current!.append(c); return new MapRenderer(c);
      })();
      canvas.current = r.canvas;
      r.canvas.setAttribute("aria-label", props.label);`)
 .replace('      console.warn(e);','      props.onError?.();\n      console.warn(e);')
 .replace('      r.dispose();','      r.dispose();\n      r.canvas.remove();')
 .replace('      <canvas ref={canvas} aria-label={props.label} />','      <div ref={canvasHost} style={{ width:"100%", height:"100%" }} />')
 .replace('  const pick = (m: ViewMode)', '  useEffect(() => { canvas.current?.setAttribute("aria-label", props.label); }, [props.label]);\n\n  const pick = (m: ViewMode)'));
change('src/editor/Editor.tsx',s=>s.replace('    setProgress(null);\n    let live = true;\n    const t = setTimeout','    setProgress(null);\n    if (!ready) return;\n    let live = true;\n    const t = setTimeout')
 .replace('    if (!ready) return;','    if (!ready && !viewFailed) return;')
 .replace('  const [ready, setReady]', '  const [viewFailed, setViewFailed] = useState(false);\n  const [ready, setReady]')
 .replace('  }, [info.version]);\n\n  // the water layer','  }, [info.version, ready, viewFailed]);\n\n  // the water layer')
 .replace('export interface EditorProps {','export interface EditorProps {\n  /** Called after a painted frame with the editor\'s input handlers attached. */\n  onEditable?(): void;')
 .replace('    setReady(r);','    setReady(r);\n    requestAnimationFrame(() => requestAnimationFrame(() => { if (mounted.current) props.onEditable?.(); }));')
 .replace('            onReady={onReady}','            onReady={onReady}\n            onError={() => { setViewFailed(true); props.onEditable?.(); }}'));
// A milestone caller can use this helper directly; cancellation disposes any unused GPU context.
change('src/page/firstVisit/start.ts',s=>s
 .replace('  const [editor, first] = await Promise.all([',`  const loading = loadFirstVisit(random); // dispatch fetch before any GPU work
  const gpu = import("../../render3d/prepared"); // preserve the small static entry
  const preparing = gpu.then(m => m.prepareFirstRenderer());
  try {
  const [editor, first] = await Promise.all([`)
 .replace('    loadFirstVisit(random).then','    loading.then')
 .replace('  return first ?','  await preparing;\n  if (!first) (await gpu).discardPreparedRenderer();\n  return first ?')
 .replace(': null;\n}',': null;\n  } catch (e) { await preparing; (await gpu).discardPreparedRenderer(); throw e; }\n}'));
for(const [path,text] of changes){mkdirSync(dirname(join(after,path)),{recursive:true});writeFileSync(join(after,path),text);}
let patch='';
for(const [path,text] of changes){
 const old=join(before,path),next=join(after,path),existed=existsSync(old);let diff;
 try{diff=execFileSync('git',['diff','--no-index','--no-prefix','--',existed?old:(process.platform==='win32'?'NUL':'/dev/null'),next],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout.toString();}
 const lines=diff.replaceAll('\r\n','\n').split('\n');lines[0]=`diff --git a/${path} b/${path}`;
 patch+=lines.map(l=>l.startsWith('--- ')?`--- ${existed?'a/'+path:'/dev/null'}`:l.startsWith('+++ ')?`+++ b/${path}`:l===' '?'':l).join('\n');
}
writeFileSync(join(here,'round2-adoption.patch'),patch);
execFileSync('git',['apply','--no-index','--check',join(here,'round2-adoption.patch')],{cwd:before});
if(!process.argv.includes('--skip-fixtures'))execFileSync(process.execPath,['--import','tsx',join(here,'identity-round2.ts')],{stdio:'inherit'});
else cpSync(join(local,'round2-fixtures'),join(after,'public/first-visit'),{recursive:true});
cpSync(join(after,'public/first-visit'),join(local,'round2-fixtures'),{recursive:true});
for(const variant of ['before','after']){
 let bench=readFileSync(join(here,'bench.tsx'),'utf8');
 if(variant==='after'){
  bench=bench.replace('const api = createGenerator();',`let editableResolve!: () => void;
const editableFrame = new Promise<void>(r => editableResolve=r);
const api = createGenerator({checksAfter:editableFrame});`);
  bench=bench.replace('const first = await load();',`const firstPending = load();
const preparing = import('./src/render3d/prepared').then(async m=>{mark('renderer-prepare-start');await m.prepareFirstRenderer();mark('renderer-prepared');});
const first = await firstPending;`);
  bench=bench.replace('const Editor = await (pendingEditor ?? editorLoad());','const Editor = await (pendingEditor ?? editorLoad());\nawait preparing;');
  bench=bench.replace('saveState=""','saveState="" onEditable={()=>{mark("first-editable-frame");mark("checks-start");editableResolve();}}');
 }
 writeFileSync(join(local,`round2-${variant}/bench.tsx`),bench);
 const marks={name:'startup-clock',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/ui/View3D.tsx'))return code.replace('const stats = r.setMap(props.view);','const stats = r.setMap(props.view); performance.mark("map-frame");');}};
 await build({configFile:false,root:join(local,`round2-${variant}`),base:'/dam-good-maps/',plugins:[marks,(await import('@preact/preset-vite')).default()],worker:{format:'es'},define:{__AFTER__:'true'},build:{target:'es2022',manifest:true,sourcemap:true,outDir:join(local,`dist-round2-${variant}`),emptyOutDir:true}});
}
