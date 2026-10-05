import {copyFileSync} from 'node:fs';
const base='investigation/deposit-pillars';
copyFileSync(`${base}/overlay/rust/forces/src/deposit.rs`,`${base}/local/checkout/rust/forces/src/deposit.rs`);
copyFileSync('rust/forces/src/lib.rs',`${base}/local/checkout/rust/forces/src/lib.rs`);
copyFileSync('src/core/forces/rust/bridge.ts',`${base}/local/checkout/src/core/forces/rust/bridge.ts`);
