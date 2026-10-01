import {deps,ROOT,HERE,LOCAL} from './common.mjs';
import {resolve,dirname} from 'node:path';
const variant=process.env.WATER_VARIANT??'fast';
const pkg=name=>resolve(dirname(deps.resolve(name+'/package.json')));
export default {
  root:ROOT,cacheDir:resolve(LOCAL,'vite-'+variant),
  resolve:{alias:[
    {find:/^vitest$/,replacement:resolve(pkg('vitest'),'dist/index.js')},
    {find:/^fflate$/,replacement:resolve(pkg('fflate'),'esm/index.mjs')},
    {find:/^ajv$/,replacement:deps.resolve('ajv')},
    {find:/^ajv\/dist\/2020$/,replacement:deps.resolve('ajv/dist/2020')},
    {find:/^comlink$/,replacement:deps.resolve('comlink')},
    {find:/^three$/,replacement:resolve(dirname(deps.resolve('three')),'three.module.js')},
  ]},
  plugins:[{name:'water-speed-under-test',enforce:'pre',resolveId(source,importer){
    if(variant==='fast'&&importer&&source.endsWith('/water')) {
      if(resolve(dirname(importer),source)===resolve(ROOT,'src/core/sim/water')) return resolve(HERE,'water.ts');
    }
  },transform(code,id){
    if(id.endsWith('/tests/unit/water.test.ts')&&process.env.DGM_SAVES) {
      return code.replace('"investigation/raw/saves/generated-river-valley-day1-2.timber"',JSON.stringify(resolve(process.env.DGM_SAVES,'generated-river-valley-day1-2.timber')));
    }
  }}],
  test:{include:[
    'tests/unit/water.test.ts','tests/unit/water-speedups.test.ts','tests/unit/waterGame.test.ts',
    'tests/unit/sealedBasins.test.ts','tests/unit/startWater.test.ts','tests/unit/weather.test.ts',
    'tests/contract/live-water.test.ts','tests/contract/waterFix.test.ts',
    'tests/contract/outflows.test.ts','tests/contract/badwater.test.ts',
    'tests/contract/projects.test.ts','tests/contract/look-mine-ruins.test.ts',
    'tests/contract/places.test.ts',
    'tests/contract/places-build-1.test.ts','tests/contract/places-build-2.test.ts','tests/contract/places-build-3.test.ts',
  ],maxWorkers:2,testTimeout:300000,hookTimeout:300000,
    reporters:['default','json'],outputFile:{json:resolve(LOCAL,'tests-'+variant+'.json')},
  },
};
