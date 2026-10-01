import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {adopt} from '../proposal.mjs';
export const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../local/round2/base'),proposed=resolve(dir,'proposed');
export const base='75cb5d4c4a168eb17113bd0dd19576bb43b3ffc9',det='f306fd495c713e19278c507686102b2c603cdef8';
const local=resolve(dir,'../local/round2');
export function change(s,a,b){if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))throw Error('drifted source: '+a.slice(0,100));return s.replace(a,b);}
export function overlay(file,code){let s=adopt(file,code);
 if(file==='src/core/doc/session.ts') {
  s='import {ResultStore} from "./resultStore";\nimport {HistorySnapshots} from "./historySnapshots";\nimport {writeProject} from "./projectStream";\nimport {projectObject} from "./document";\n'+s;
  s=change(s,'  private snaps = new Map<number, BuildResult>();','  private snaps = new HistorySnapshots<BuildResult>();');
  s=change(s,'  private log: AppliedOp[];',`  private log: AppliedOp[];
  /** Already validated legacy input: preserve replay/orphan semantics, page literal payloads. */
  importAppliedForReplay(input:AppliedOp):AppliedOp {
    this.setReplaySequence(input.seq);
    const op=clone(input);
    if(this.resultStore&&(op.op==="forceResult"||op.op==="carve"||op.op==="deleteEntities"))op.params=this.resultStore.keep(op.seq,op.params);
    applyOp(this.st,op);this.log.push(op);this.seqNext=op.seq+1;
    this.pushHistory({kind:"ops",ops:[op]});this.cur=this.rebuilt();this.snapshot();return op;
  }
  /** Roll back an execution/storage exception without cloning or materializing derived vectors. */
  historyTransaction<T>(action:()=>T):T {
    const saved={log:this.log.slice(),st:{...this.st,features:this.st.features.slice(),sculpts:this.st.sculpts.slice(),slopeEdits:this.st.slopeEdits.slice(),entityEdits:this.st.entityEdits.slice()},
      cur:this.cur,seqNext:this.seqNext,undoStack:this.undoStack.slice(),redoStack:this.redoStack.slice(),snaps:new Map(this.snaps),waterAt:new Map(this.waterAt)};
    try{return action();}catch(error){Object.assign(this,{...saved,snaps:new HistorySnapshots(saved.snaps)});throw error;}
  }
  private resultStore: ResultStore | null = null;
  private waterAt = new Map<number,number>();
  private rememberHistoryWater():void {if(this.resultStore)this.waterAt.set(this.undoStack.length,this.resultStore.keepWater(this.cur.cache.settle));}
  private restoreHistoryWater(at:number):void {
    if(!this.resultStore||this.snaps.has(at))return;
    const key=this.waterAt.get(at);if(key===undefined)throw Error("missing historical water input");
    this.cur={...this.cur,cache:{...this.cur.cache,settle:this.resultStore.readWater(key),moisture:null,soil:null,occupiedBeforeResources:null,resources:new Map(),resourceOrder:[]}};
  }
  private snapshotBudget = Infinity;
  private snapshotSteps = MAX_SNAPSHOTS;
  useResultStore(store: ResultStore, snapshotBudget = 128*1024*1024, snapshotSteps = 16): void {
    if (!Number.isSafeInteger(snapshotBudget) || snapshotBudget<0 || !Number.isSafeInteger(snapshotSteps) || snapshotSteps<1) throw Error("invalid history cache policy");
    this.resultStore = store;this.snapshotBudget=snapshotBudget;this.snapshotSteps=snapshotSteps;this.rememberHistoryWater();
  }
  get nextOperationSeq(): number {return this.seqNext;}
  setReplaySequence(seq:number):void {if(!Number.isSafeInteger(seq)||seq<this.seqNext)throw Error("invalid replay sequence");this.seqNext=seq;}
  get historyCacheStats() {return {snapshots:this.snaps.size, bytes:this.snaps.bytes, budget:this.snapshotBudget};}
  /** The immutable generation, without copying/materializing the operation log. */
  get generationDocument(): MapDocument {
    return {formatVersion:3,app:"dam-good-maps",generatorVersion:this.gen.generatorVersion,spec:this.gen.spec,
      base:this.gen.base,...(this.gen.field?{field:this.gen.field}:{}),baseFeatures:this.gen.baseFeatures,
      kept:this.gen.kept,features:clone(this.gen.baseFeatures),edits:[],nextSeq:1,meta:this.gen.meta};
  }`);
  s=change(s,'    const applied = { op: op.op, params: clone(op.params), seq: this.seqNext++, origin, ...(text ? { label: text } : {}) } as AppliedOp;',`    let params = clone(op.params);
    if ((op.op === "forceResult" || op.op === "deleteEntities") && this.resultStore) params = this.resultStore.keep(this.seqNext,params);
    const applied = { op: op.op, params, seq: this.seqNext++, origin, ...(text ? { label: text } : {}) } as AppliedOp;`);
  s=change(s,'    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();\n    return true;', '    this.restoreHistoryWater(this.undoStack.length);\n    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();\n    return true;');
  s=change(s,'    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();\n    this.snapshot();','    this.restoreHistoryWater(this.undoStack.length);\n    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();\n    this.snapshot();');
  s=change(s,'    for (const [k, b] of this.snaps) if (b === before) this.snaps.set(k, this.cur);','    for (const [k, b] of this.snaps) if (b === before) this.snaps.set(k, this.cur);\n    this.rememberHistoryWater();\n    if(this.resultStore)this.snapshot(true);');
  s=change(s,'    if (!force && at % SNAPSHOT_EVERY !== 0) return;', '    this.rememberHistoryWater();\n    if (!force && !this.resultStore && at % SNAPSHOT_EVERY !== 0) return;');
  s=change(s,'    while (this.snaps.size > MAX_SNAPSHOTS) {','    while (this.snaps.size > 1 && (this.snaps.size > this.snapshotSteps || this.snaps.bytes > this.snapshotBudget)) {');
  s=change(s,'      const oldest = [...this.snaps.keys()].filter((k) => k !== 0).sort((a, b) => a - b)[0];','      const oldest = this.resultStore ? [...this.snaps.keys()].find(k=>k!==at)! : [...this.snaps.keys()].filter((k) => k !== 0).sort((a, b) => a - b)[0];');
  s=change(s,'  project(level?: number): Uint8Array {',`  /** Legacy-format streaming save: no clone of literal vectors or whole-document string. */
  async projectStreaming(sink:(bytes:Uint8Array)=>Promise<void>,level=9):Promise<void> {
    const doc={...this.generationDocument,features:clone(this.st.features),edits:this.log.slice(),nextSeq:this.seqNext};
    await writeProject(projectObject(doc),sink,level);
  }

  project(level?: number): Uint8Array {`);
 }
 if(file==='src/core/features/build.ts') {
  s='import {derivedResultKey} from "../doc/resultStore";\nimport {BoundedFields} from "../doc/boundedFields";\n'+s;
  s=change(s,'const fields: FieldCache = prev ? prev.fields : new Map();','const fields: FieldCache = prev ? prev.fields : new BoundedFields();');
  s=change(s,'function paramsKey(p: object): string {','function paramsKey(p: object): string {\n  const derived = derivedResultKey(p);if(derived !== undefined)return derived;');
 }
 if(file==='src/core/doc/ops.ts') {
  s='import {derivedResultKey} from "./resultStore";\nimport {forceEntityEdits, expandedEntityEdits} from "./entityForceEdits";\n'+s;
  s=change(s,'  entityEdits: EntityOp[];','  entityEdits: (EntityOp | ForceOp)[];');
  s=change(s,'      state.entityEdits.push(...forceEntityEdits(op));','      state.entityEdits.push(...(derivedResultKey(op.params) ? [op] : forceEntityEdits(op)));');
  s=change(s,'        const edits = forceEntityEdits(r.op);','        const edits = derivedResultKey(r.op.params) ? [r.op] : forceEntityEdits(r.op);');
  s=s.replaceAll('state.entityEdits.some((e) => e.op === "placeEntity"', '[...expandedEntityEdits(state.entityEdits)].some((e) => e.op === "placeEntity"');
  const sf=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true),n=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='forceEntityEdits');
  s=s.slice(0,n.getStart(sf))+s.slice(n.end);
 }
 if(file==='src/core/features/edits.ts') {
  s='import {expandedEntityEdits} from "../doc/entityForceEdits";\nimport type {ForceOp} from "../doc/ops";\n'+s;
  s=change(s,'  edits: readonly EntityEdit[],','  edits: readonly (EntityEdit | ForceOp)[],');
  s=change(s,'  for (const ed of edits) {\n    switch (ed.op) {','  for (const ed of expandedEntityEdits(edits)) {\n    switch (ed.op) {');
 }
 if(file==='src/core/features/build.ts')s=change(s,'entityEdits?: readonly EntityEdit[];', 'entityEdits?: readonly (EntityEdit | import("../doc/ops").ForceOp)[];');
 if(file==='src/core/doc/document.ts') {
  s=change(s,'  const out: MapDocument = { ...doc };', '  return gzipSync(strToU8(JSON.stringify(projectObject(doc))), { level: level as 9, mtime: 0 });\n}\n\nexport function projectObject(doc:MapDocument):MapDocument {\n  const out: MapDocument = { ...doc };');
  s=change(s,'  return gzipSync(strToU8(JSON.stringify(out)), { level: level as 9, mtime: 0 });','  return out;');
  s=change(s,'  if (raw.app !== "dam-good-maps")','  return decodeProjectObject(raw);\n}\n\n/** Shared legacy migrations after incremental JSON decoding. */\nexport function decodeProjectObject(raw: {app?:string;formatVersion?:number}): MapDocument {\n  if (raw.app !== "dam-good-maps")');
 }
 return s;
}
export function prepareDeterminism() {
 mkdirSync(local,{recursive:true});
 const gitRoot=resolve(dir,'../../..');
 let source=execFileSync('git',['show',`${det}:investigation/determinism/transform.mjs`],{cwd:gitRoot,encoding:'utf8'});
 source=source.replace("import ts from './local/runtime/node_modules/typescript/lib/typescript.js';","import ts from 'typescript';");
 writeFileSync(resolve(local,'det-transform.mjs'),source);
 source=execFileSync('git',['show',`${det}:investigation/determinism/portable.ts`],{cwd:gitRoot,encoding:'utf8'}).replace("'../../src/core/math/detmath'",JSON.stringify(resolve(root,'src/core/math/detmath').replaceAll('\\','/')));
 writeFileSync(resolve(local,'portable.ts'),source);
}
export function helpers() {
 const opSource=readFileSync(resolve(root,'src/core/doc/ops.ts'),'utf8'),opSf=ts.createSourceFile('ops.ts',opSource,ts.ScriptTarget.Latest,true);
 const opFn=opSf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='forceEntityEdits');
 const entityOut=resolve(proposed,'src/core/doc/entityForceEdits.ts');mkdirSync(resolve(entityOut,'..'),{recursive:true});
 writeFileSync(entityOut,'import type {ForceOp,EntityOp} from "./ops";\nimport type {EntityEdit} from "../features/edits";\nexport '+opFn.getText(opSf)+'\nexport function* expandedEntityEdits(edits: readonly (EntityEdit | ForceOp)[]): Generator<EntityEdit> {\n for(const e of edits) {if(e.op==="forceResult"||e.op==="carve")yield* forceEntityEdits(e);else yield e;}\n}\n');
 const source=readFileSync(resolve(root,'src/worker/session.ts'),'utf8'),sf=ts.createSourceFile('worker.ts',source,ts.ScriptTarget.Latest,true);
 const names=['geologyOf','rockOf','fallenOf','stagedForceMap','buildTouches','withOwned','glacierSprings','featherForce'];
 const bodies=names.map(name=>{const n=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!n)throw Error(name);return n.getText(sf);});
 let imports=`import type {MapSession} from "./session";
import {geology} from "../forces/random";
import {trimRock} from "../forces/rock";
import {plainEntities,type FullForceMap} from "../forces/force";
import type {ForceResultParams} from "../forces/op";
import type {TerrainState} from "../features/raster/strokePreview";
import {integrityAt} from "../features/raster/terrain";
import type {Finalize} from "../forces/runs";
const geologies=new WeakMap<MapSession,number[]>(),rocks=new WeakMap<object,Uint32Array|null>();
const poses=new WeakMap<object,Map<string,{dx:number;dy:number}>>();
const lifeOf=(c:any)=>({dead:c?.LivingNaturalResource?.IsDead===true});
`;
 const out=resolve(proposed,'src/core/doc/forceHelpers.ts');mkdirSync(resolve(out,'..'),{recursive:true});
 writeFileSync(out,'// Pure worker helpers extracted from pinned source; share these at adoption.\n'+imports+bodies.map(s=>'export '+s).join('\n\n')+'\n');
 let remove=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='removeAt').getText(sf);
 remove=change(remove,'export function removeAt(tiles: readonly number[], kinds: readonly RemoveKind[], label?: string): SessionUpdate & { removed: number[] } {','export function planRemoveAt(s:MapSession, tiles:readonly number[], kinds:readonly RemoveKind[], label?:string):{ops:EditOp[];label:string;removed:number[]} {');
 remove=change(remove,'  const t0 = performance.now();\n  const s = need();','');
 remove=change(remove,'  if (!removed.length) return { ...changed(s, false, ["nothing to remove there"], t0), removed };','  if (!removed.length) throw Error("nothing to remove there");');
 remove=change(remove,'  const r = s.applyAll(ops, "user", label ?? auto);\n  return { ...changed(s, r.ok, r.errors, t0), removed: r.ok ? removed : [] };','  return {ops,label:label??auto,removed};');
 writeFileSync(resolve(proposed,'src/core/doc/selectionHelpers.ts'),`// Pure Select planner extracted from the pinned worker; share at adoption.
import type {MapSession} from "./session";
import type {EditOp} from "./ops";
import {removeKindOf,removeTakes,type RemoveKind} from "../features/objects";
import {entityTiles} from "../features/edits";
import {objectsIn,ruinFieldTilesIn,submergedIn} from "./inArea";
import {rebuiltSlope} from "../features/ids";
import {placementOf} from "../format/entities";
import {runsToTiles,tilesToRuns,type Runs} from "../math/grid";
`+remove+'\n');
}
export async function plugin(phase='after') {
 prepareDeterminism();const {transform}=await import(pathToFileURL(resolve(local,'det-transform.mjs')).href);
 return {name:'scaling-round2',setup(b){
  b.onResolve({filter:/^product-(history|stream|cache)$/},args=>({path:resolve(root,'src/core/doc',{'product-history':'gestureHistory.ts','product-stream':'projectStream.ts','product-cache':'resultStore.ts'}[args.path])}));
  b.onResolve({filter:/.*/},args=>{if(!args.importer)return;const path=resolve(args.resolveDir,args.path);if(!path.startsWith(root))return;
    for(const p of [path,path+'.ts'])if(p.startsWith(root)&&p.endsWith('.ts')){const rel=p.slice(root.length+1),candidate=resolve(proposed,rel);try{readFileSync(candidate);return {path:p};}catch{}}});
  b.onLoad({filter:/\.(ts|json)$/},args=>{
    const file=args.path.replaceAll('\\','/').slice(root.replaceAll('\\','/').length+1),candidate=resolve(proposed,file);
    let code;try{code=readFileSync(candidate,'utf8');}catch{code=readFileSync(args.path,'utf8');}
    if(args.path.startsWith(root))code=phase==='after'||file==='src/core/doc/document.ts'?overlay(file,code):adopt(file,code);
    if(args.path.replaceAll('\\','/').includes('/src/core/')&&args.path.endsWith('.ts'))code=transform(code,args.path,resolve(local,'portable.ts').replaceAll('\\','/'));
    return {contents:code,loader:args.path.endsWith('.json')?'json':'ts'};
  });
 }};
}
