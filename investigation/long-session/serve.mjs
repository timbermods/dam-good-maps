import {build, preview} from 'vite';
import {fileURLToPath} from 'node:url';
const probe = fileURLToPath(new URL('./probe.mjs', import.meta.url)).replaceAll('\\', '/');
const instrumentation = () => ({name: 'long-session-probes', enforce: 'pre', transform(code, id) {
  if (/\/(generator|checks|waterStrip|waterMesh|bake)\.worker\.ts$/.test(id.replaceAll('\\','/'))) {
    return {code: `import ${JSON.stringify(probe)};\n${code}`, map: null};
  }
}});
await build({mode:'e2e', build:{outDir:'investigation/long-session/local/dist'},
  plugins:[instrumentation()], worker:{plugins:()=>[instrumentation()]}});
const s = await preview({build:{outDir:'investigation/long-session/local/dist'}, preview:{port:4189, strictPort:true}});
s.printUrls();
