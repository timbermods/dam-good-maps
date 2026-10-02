// Absolute activation bounds bind every recorded frame to continuous machine telemetry.
export function completeInterval(record,raw){
 return Number.isFinite(raw?.startedAtUnixMs)&&Number.isFinite(raw?.endedAtUnixMs)&&
  raw.endedAtUnixMs>=raw.startedAtUnixMs&&record.from<=raw.startedAtUnixMs&&record.to>=raw.endedAtUnixMs;
}
