import {spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync} from 'node:fs';
const tasks=JSON.parse(process.argv[2]);
for(const t of tasks){
  const dir=`investigation/settings/local/${t.out}`;
  mkdirSync(dir,{recursive:true});
  const fd=openSync(dir+'.log','w');
  console.log('Starting '+t.out+' '+new Date().toISOString());
  const r=spawnSync(process.execPath,[`investigation/settings/local/${t.bundle}.mjs`,t.command??'sweep',dir],{
    env:{...process.env,SETTINGS_CONTROLS:t.control??(t.bundle.startsWith('verticality')?'verticality':t.bundle.startsWith('lakes')?'lakes':'verticality,lakes'),SETTINGS_SIZE:String(t.size??128),SETTINGS_SEEDS:t.seeds??'1,2,3,4,5',SETTINGS_VALUES:t.values??'0,25,50,75,100',...(t.themes?{SETTINGS_THEMES:t.themes}:{}),...(t.experiments?{SETTINGS_EXPERIMENTS:t.experiments}:{})},stdio:['ignore',fd,fd]});
  closeSync(fd);console.log('Finished '+t.out+' exit '+r.status);
  if(r.error)throw r.error;
  if(r.status!==0)process.exit(r.status??1);
}
