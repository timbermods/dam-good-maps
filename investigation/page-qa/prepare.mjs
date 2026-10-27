import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const out=path.join(root,'investigation/page-qa/local/patched');
fs.mkdirSync(out,{recursive:true});
const baseline='f2c6c34b86993c822541b5c8365140e45bbd5678';
const clean=path.join(root,'investigation/page-qa/local/baseline');
fs.mkdirSync(clean,{recursive:true});
const archive=path.join(root,'investigation/page-qa/local/source.tar');
fs.writeFileSync(archive,execFileSync('git',['archive',baseline,'src','index.html','real-places/index.html','tsconfig.json'],{maxBuffer:100*1024*1024}));
execFileSync('tar',['-xf',archive,'-C',clean]);
fs.cpSync(clean,out,{recursive:true});
const changed=[];
function edit(file, pairs){let source=fs.readFileSync(path.join(out,file),'utf8');for(const [a,b] of pairs){if(!source.includes(a))throw new Error('Missing anchor in '+file+': '+a.slice(0,70));source=source.replace(a,b)}fs.writeFileSync(path.join(out,file),source);changed.push(file)}
edit('src/editor/save/useSave.ts',[
 ['    const p = await enqueue(() => api.project());','    // Keep the visible force before taking a file (investigation/page-qa).\n    await ed.forcer.current?.stop();\n    const p = await enqueue(() => api.project());'],
 ['      const onProgress = proxy(', '      // A force draft lives outside the document until it is kept.\n      await ed.forcer.current?.stop();\n      const onProgress = proxy(']
]);
edit('src/editor/Editor.tsx',[[
 '  keepView?: boolean;','  keepView?: boolean;\n  /** In-session history of map replacements, after the map\'s own edits. */\n  mapHistory?: { canUndo: boolean; canRedo: boolean; undo(): Promise<void>; redo(): Promise<void> };'
]]);
edit('src/editor/paint/usePaint.ts',[
 ['    if (!s) return run(() => api.undo(), (u) => u.ok && juice.current?.undo());', '    if (!s) {\n      if (!infoRef.current.canUndo && props.mapHistory?.canUndo) return props.mapHistory.undo();\n      return run(() => api.undo(), (u) => u.ok && juice.current?.undo());\n    }'],
 ['    if (!s) return run(() => api.redo());', '    if (!s) {\n      if (!infoRef.current.canRedo && props.mapHistory?.canRedo) return props.mapHistory.redo();\n      return run(() => api.redo());\n    }']
]);
edit('src/editor/render/header.tsx',[
 ['canUndo={info.canUndo || !!localUndo.current.length}', 'canUndo={info.canUndo || !!localUndo.current.length || !!props.mapHistory?.canUndo}'],
 ['canRedo={info.canRedo || !!localRedo.current.length}', 'canRedo={info.canRedo || !!localRedo.current.length || !!props.mapHistory?.canRedo}']
]);
edit('src/ui/App.tsx',[
 ['  const cancelling = useRef(false);', `  const cancelling = useRef(false);
  type MapCheckpoint = { entry: YourMapEntry; bytes: Uint8Array; kept: boolean; place?: string };
  const mapPast = useRef<MapCheckpoint[]>([]);
  const mapFuture = useRef<MapCheckpoint[]>([]);
  const restoringMap = useRef(false);`],
 ['      return await load();', `      const leaving = entry.current ? await mapCheckpoint() : null;
      const data = await load();
      if (leaving) {
        mapPast.current.push(leaving);
        mapFuture.current = [];
        setNote(\`New map. Undo to get \${leaving.entry.name} back.\`);
      }
      return data;`],
 ['  /** The map is the editor\'s, the address its link;', `  /** The replacement boundary lives in the page; document edits stay in the worker. */
  async function mapCheckpoint(): Promise<MapCheckpoint> {
    const s = await snapshot();
    return { entry: s.entry, bytes: s.project, kept: kept.current, place: placeFromHash(location.hash) ?? undefined };
  }

  async function restoreMap(redo: boolean): Promise<void> {
    if (restoringMap.current || busy || !entry.current) return;
    const from = redo ? mapFuture.current : mapPast.current;
    const to = redo ? mapPast.current : mapFuture.current;
    const target = from.at(-1);
    if (!target) return;
    restoringMap.current = true;
    switching.current = true;
    setBusy(true);
    stopBackground();
    try {
      await saver.flush();
      const leaving = await mapCheckpoint();
      const data = await generator.openProject(target.bytes);
      from.pop();
      to.push(leaving);
      enterEditor(data, { entry: target.entry, kept: target.kept }, target.place);
      setNote(null);
    } catch (e) {
      setError(\`The map could not be restored: \${words(e)}\`);
    } finally {
      switching.current = false;
      restoringMap.current = false;
      setBusy(false);
    }
  }

  /** The map is the editor's, the address its link;`],
 ['    infoRef.current = info;\n    setSession(info);','    if (info.version !== infoRef.current?.version) mapFuture.current = [];\n    infoRef.current = info;\n    setSession(info);'],
 ['        keepView={opened.keepView}',`        keepView={opened.keepView}
        mapHistory={{ canUndo: mapPast.current.length > 0, canRedo: mapFuture.current.length > 0, undo: () => restoreMap(false), redo: () => restoreMap(true) }}`]
]);
edit('src/core/format/world.ts',[
 ['export interface SettledState {', '/** Preserve the Single values sent to the view through a timber round trip (page-qa). */\nfunction waterToken(v: number): string {\n  return formatFloat(Number(Math.fround(v).toPrecision(9)));\n}\n\nexport interface SettledState {'],
 ['const ds = numToken(d);', 'const ds = waterToken(d);'],
 ['c > 1e-6 ? numToken(c)', 'c > 1e-6 ? waterToken(c)']
]);
const patches={page:'',milestone:''};
for(const file of changed){let diff='';try{diff=execFileSync('git',['diff','--no-index','--',path.relative(root,path.join(clean,file)).replaceAll('\\','/'),path.relative(root,path.join(out,file)).replaceAll('\\','/')],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}diff=diff.replaceAll('a/investigation/page-qa/local/baseline/'+file,'a/'+file).replaceAll('b/investigation/page-qa/local/patched/'+file,'b/'+file);patches[file.startsWith('src/core/')?'milestone':'page']+=diff.replace(/^ $/gm, '');}
for(const [owner,patch] of Object.entries(patches)) fs.writeFileSync('investigation/page-qa/adoption-'+owner+'.patch',patch);
const config={compilerOptions:JSON.parse(fs.readFileSync(path.join(clean,'tsconfig.json'),'utf8')).compilerOptions,include:['src','../../*.spec.ts']};
fs.writeFileSync(path.join(out,'tsconfig.json'),JSON.stringify(config,null,2));
for(const dir of [out,clean]) fs.writeFileSync(path.join(dir,'vite.config.mjs'),`import {defineConfig} from 'vite';\nimport preact from '@preact/preset-vite';\nexport default defineConfig({root:${JSON.stringify(dir)},base:'/dam-good-maps/',publicDir:${JSON.stringify(path.join(root,'public'))},cacheDir:${JSON.stringify(path.join(dir,'.vite'))},plugins:[preact()],worker:{format:'es'},server:{headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}}});\n`);
console.log('Prepared patch and isolated source copy: '+changed.length+' source files; product tree untouched.');
