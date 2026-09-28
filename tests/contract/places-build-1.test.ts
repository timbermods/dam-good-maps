// Real places (ROADMAP "Real places"): every map validates and is the same file, shard 1 of 3
// (tests/contract/placesCommon.ts; split so the builds run side by side). Nightly and in the release
// check (vitest.config.ts, "heavy"); a sample runs on every push (places.test.ts).

import { checkShard } from "./placesCommon";

checkShard(0, 3);
