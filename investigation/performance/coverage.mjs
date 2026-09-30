import { cases } from './scenarios.mjs';
export const coreCases = cases.filter(c => ['force', 'brush', 'abuse'].includes(c.kind));
export function configurations(budget, suite = 'core') {
  if (!['core', 'full'].includes(suite)) throw new Error('suite must be core or full');
  const plan = budget.suites[suite];
  const platforms = suite === 'core' ? plan.platforms : plan.browsers.flatMap(browser => plan.profiles.map(profile => ({browser,profile,repeats:plan.repeats})));
  return platforms.flatMap(platform => plan.sizes.flatMap(size => plan.looks.map(look => ({...platform,size,look,captureRepeats:plan.captureRepeats}))));
}
export function requirements(budget, suite = 'core') {
  const selected = suite === 'core' ? coreCases : cases;
  return configurations(budget, suite).flatMap(config => selected.map(c => ({...config,case:c.id,id:`${config.browser}/${config.profile}/${config.size}/${config.look}/${c.id}`})));
}
export function isQuiet(load, quiet) {
  const rows = load?.samples ?? [];
  const duration = rows.length > 1 ? Date.parse(rows.at(-1).at) - Date.parse(rows[0].at) : 0;
  return load?.quiet === true && duration >= quiet.durationMs && rows.every((s,i) =>
    Number.isFinite(s.cpuPercent) && s.cpuPercent >= 0 && s.cpuPercent <= quiet.cpuPercentMax &&
    (!i || (Date.parse(s.at) > Date.parse(rows[i-1].at) && Date.parse(s.at)-Date.parse(rows[i-1].at) <= quiet.maxSampleGapMs)));
}
export function loadSpiked(samples, quiet) {
  return !samples?.length || samples.some((s,i) => !Number.isFinite(s.cpuPercent) || s.cpuPercent < 0 || s.cpuPercent > quiet.cpuPercentMax ||
    !Number.isFinite(s.unrelatedCpuPercent) || s.unrelatedCpuPercent < 0 || s.unrelatedCpuPercent > quiet.cpuPercentMax ||
    !Number.isFinite(Date.parse(s.at)) || (i && (Date.parse(s.at)<=Date.parse(samples[i-1].at) || Date.parse(s.at)-Date.parse(samples[i-1].at)>quiet.maxSampleGapMs)));
}
