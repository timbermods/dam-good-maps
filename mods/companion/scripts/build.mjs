// Builds the companion mod against the local Timberborn install and assembles it, ready to copy, in
// mods/companion/dist/DGMCompanion (the folder a player puts in Documents\Timberborn\Mods).
//   node mods/companion/scripts/build.mjs
// It installs nothing. Needs the .NET 8 SDK and Timberborn from Steam (GameDir overrides its folder).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The .NET 8 SDK: the per-user install the machine keeps (HANDOFF "The machine"), else whatever `dotnet` is. */
export function dotnet() {
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'dotnet', 'dotnet.exe');
  return process.env.DOTNET ?? (local && existsSync(local) ? local : 'dotnet');
}

export function build(gameDir = process.env.GameDir) {
  const args = ['build', join(root, 'DGMCompanion.csproj'), '-c', 'Release', '--nologo', '-v', 'q'];
  if (gameDir) args.push(`-p:GameDir=${gameDir}`);
  execFileSync(dotnet(), args, { stdio: 'inherit' });
  const dll = join(root, 'bin', 'Release', 'netstandard2.1', 'DGMCompanion.dll');
  if (!existsSync(dll)) throw new Error(`The build left no ${dll}`);
  const out = join(root, 'dist', 'DGMCompanion');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'version-1.1', 'Scripts'), { recursive: true });
  copyFileSync(dll, join(out, 'version-1.1', 'Scripts', 'DGMCompanion.dll'));
  copyFileSync(join(root, 'manifest.json'), join(out, 'version-1.1', 'manifest.json'));
  copyFileSync(join(root, 'README.md'), join(out, 'README.md'));
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Dam Good Maps Companion: ${build()}`);
}
