// One map, attempt by attempt: the stage it reached, its start, its pads, the mine sites' check and what failed.
// Usage: npx tsx investigation/m9b/tools/trace.ts <theme> <seed> <size>
import { generate } from '../../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../../src/core/spec/mapspec';
const [theme, seedS, sizeS] = process.argv.slice(2);
generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: Number(sizeS), y: Number(sizeS) } }), { onAttempt: ({ attempt, result }) => {
  const mine = result.report.checks.find((c) => c.id === 'resources.mine_site');
  const st = result.built?.start;
  console.log('#' + attempt, result.info.stage, 'start', st ? `${st.x},${st.y}` : '-', 'pads', JSON.stringify((result.info as any).pads?.map((p: any) => [p.x, p.y, p.level, p.cut.length])), '|', mine?.message, '| fails', result.report.checks.filter((c) => !c.ok && !c.advisory && !c.approximate && c.applicable !== false).map((c) => c.id + ': ' + c.message.slice(0, 90)).join(' ; '));
} });
