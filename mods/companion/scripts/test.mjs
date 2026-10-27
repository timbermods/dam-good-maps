// Runs the companion's own checks (the logic in src/Core, no game needed):
//   node mods/companion/scripts/test.mjs
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dotnet } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(dotnet(), ['run', '--project', join(root, 'tests', 'Tests.csproj'), '-c', 'Release', '--nologo', '-v', 'q'], { stdio: 'inherit' });
