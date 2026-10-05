import { readFileSync, writeFileSync } from 'node:fs';
const root = 'investigation/page-hunt';
let patch = readFileSync(`${root}/local/page-product.diff`, 'utf8')
  .replaceAll('b/investigation/page-hunt/overlay/', 'b/').replace(/\r\n/g,'\n');
const file = 'tests/unit/pageHunt.test.ts';
const body = readFileSync(`${root}/overlay/${file}`, 'utf8').replace(/\r\n/g,'\n').trimEnd().split('\n');
patch += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${body.length} @@\n${body.map(l=>'+'+l).join('\n')}\n`;
writeFileSync(`${root}/adoption-page.patch`,patch);
console.log('Packaged page adoption patch (two fixes, one regression per fix).');
