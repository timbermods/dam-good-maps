// Materialize proposals only inside ignored local/. Product sources remain read-only.
const fs=require('node:fs'), path=require('node:path');
const transform=require('./transform.cjs');
for(const file of ['src/core/land/genome.ts','src/core/land/hydro.ts']) {
  const src=path.resolve(__dirname,'../..',file), dst=path.join(__dirname,'local/proposed',file);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.writeFileSync(dst,transform(src,fs.readFileSync(src,'utf8'),{shared:false}));
}
