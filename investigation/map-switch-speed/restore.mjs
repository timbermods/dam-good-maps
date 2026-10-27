import fs from 'node:fs';import path from 'node:path';
for(const f of ['src/ui/App.tsx','src/worker/session.ts','src/ui/View3D.tsx','src/core/sim/parallelPolicy.ts','src/platform/index.ts']){const dir='investigation/map-switch-speed/local';const backup=path.join(dir,'instrument-backup',f);fs.copyFileSync(fs.existsSync(backup)?backup:path.join(dir,'baseline',f),f);}
