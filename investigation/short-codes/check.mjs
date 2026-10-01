import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const batch=Number(process.env.SPIKE_BATCH || 15);
assert.ok(Number.isInteger(batch) && batch>0 && batch<=1000);
const replayCount=1+batch*2+10, acceptedCount=batch*4+23;
await mkdir(path.join(here,'local'),{recursive:true});
await copyFile(path.join(here,'local/demo.html'),path.join(here,'local/check-demo.html'));
const { chromium, firefox }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}: {})});
const errors=[];
const context=await browser.newContext();
const host=await context.newPage(), guest=await context.newPage();
const url=pathToFileURL(path.join(here,'local/check-demo.html')).href;
for(const page of [host,guest]) {
  page.on('pageerror',e=>errors.push(e.message));
  // No HTTP/WebSocket requests, including analytics, imports or localhost.
  page.on('request',request=>assert.ok(request.url().startsWith('file:'),request.url()));
  await page.goto(url);
  await page.waitForFunction(()=>window.spike);
}
const snapshot=page=>page.evaluate(()=>window.spike.snapshot());
async function connect(h,g,useStun=false) {
  const start=performance.now();
  await g.evaluate(()=>window.spike.join());
  const invite=await h.evaluate(s=>window.spike.invite(s),useStun);
  // Canonical connection-code roundtrip of real browser SDP.
  assert.equal(await h.evaluate(c=>window.spike.codec.encode(window.spike.codec.decode(c)).code,invite),invite);
  const reply=await g.evaluate(async args=>window.spike.accept(...args),[invite,useStun]);
  assert.equal(await g.evaluate(c=>window.spike.codec.encode(window.spike.codec.decode(c)).code,reply),reply);
  await h.evaluate(c=>window.spike.accept(c),reply);
  await Promise.all([h,g].map(p=>p.waitForFunction(()=>window.spike.snapshot().ready,{},{timeout:60000})));
  const hs=await snapshot(h),gs=await snapshot(g);
  assert.equal(hs.hash,gs.hash);
  assert.equal(hs.seq,gs.seq);
  return {totalAutomationMs:performance.now()-start,inviteChars:invite.length,replyChars:reply.length};
}
const summary={date:'2026-10-01',base:'0f4a978b',browser:browser.version(),connections:[],checks:{}};
await mkdir(path.join(here,'local'),{recursive:true});
try {
  console.log('Connecting two Chromium tabs from file://, STUN off.');
  summary.connections.push(await connect(host,guest));
  // Exercise a real UI stroke and the copy action.
  await host.locator('#copy').click();
  await host.locator('#map').click({position:{x:180,y:180}});
  await host.waitForFunction(()=>window.spike.snapshot().seq===1 && window.spike.snapshot().peerChecked===1);
  console.log('Connected; concurrent first half: '+batch*2+' mixed operations.');
  const first=await Promise.all([host.evaluate(n=>window.spike.runMixed(n,158),batch),guest.evaluate(n=>window.spike.runMixed(n,342),batch)]);
  assert.ok(first.flat().every(r=>r.ok),'Every first-half request must be accepted.');
  let hs=await snapshot(host),gs=await snapshot(guest);
  assert.equal(hs.hash,gs.hash);assert.equal(hs.seq,1+batch*2);
  console.log('Dropping mid-session; guest frozen, host edits offline.');
  await guest.evaluate(()=>window.spike.drop());
  await host.waitForFunction(()=>!window.spike.snapshot().ready);
  assert.equal((await guest.evaluate(()=>window.spike.submit(window.spike.brush(8,8)))).ok,false);
  for(let i=0;i<10;i++)assert.ok((await host.evaluate(i=>window.spike.submit(window.spike.brush(8+i,8)),i)).ok);
  assert.equal((await snapshot(host)).seq,replayCount);
  summary.connections.push(await connect(host,guest));
  hs=await snapshot(host);gs=await snapshot(guest);
  assert.equal(hs.hash,gs.hash);assert.equal(gs.seq,replayCount);
  assert.equal(gs.metrics.checks.filter(c=>c.replay).length,replayCount);
  console.log('Replayed '+replayCount+' entries; concurrent second half: '+batch*2+' mixed operations.');
  const second=await Promise.all([host.evaluate(n=>window.spike.runMixed(n,349),batch),guest.evaluate(n=>window.spike.runMixed(n,158349),batch)]);
  assert.ok(second.flat().every(r=>r.ok),'Every second-half request must be accepted.');
  // Same-location conflicting operations authored before either knows the other's result.
  for(let i=0;i<6;i++){
    const pair=await Promise.all([host.evaluate(()=>window.spike.submit(window.spike.brush(25,25,'raise'))),guest.evaluate(()=>window.spike.submit(window.spike.brush(25,25,'lower')))]);
    assert.ok(pair.every(r=>r.ok));
  }
  await host.waitForFunction(()=>window.spike.snapshot().peerChecked===window.spike.snapshot().seq);
  hs=await snapshot(host);gs=await snapshot(guest);
  assert.equal(hs.seq,acceptedCount);assert.equal(hs.hash,gs.hash);
  assert.ok(hs.metrics.checks.every(c=>c.ok));assert.ok(gs.metrics.checks.every(c=>c.ok));
  assert.equal(gs.metrics.checks.filter(c=>!c.replay).length,batch*4+13);
  assert.equal(hs.metrics.errors.length,0);assert.equal(gs.metrics.errors.length,0);
  // Verify host-side schema rejection consumes no sequence number and affects no hash.
  const invalid=await guest.evaluate(()=>window.spike.submit({op:'brush',params:{tool:'raise',size:500,strength:5,dabs:[10,10]}}));
  assert.equal(invalid.ok,false);assert.equal((await snapshot(host)).seq,acceptedCount);
  summary.checks={accepted:hs.seq,liveGuestChecks:gs.metrics.checks.filter(c=>!c.replay).length,replayGuestChecks:replayCount,mismatches:0,finalHash:hs.hash,
    kinds:Object.fromEntries(['brush','placeEntity','carve'].map(kind=>[kind,hs.log.filter(e=>e.op.op===kind).length])),
    authors:new Set(hs.log.map(e=>e.author)).size,invalidRejected:invalid.reason};
  function stats(values){
    const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
    const at=p=>xs[Math.min(xs.length-1,Math.floor(xs.length*p))];
    return {n:xs.length,min:xs[0],median:at(.5),p95:at(.95),max:xs.at(-1)};
  }
  summary.latency={
    hostToGuestVisibleMs:stats(hs.metrics.latencies.map(x=>x.peerRenderedAt-x.submittedAt)),
    guestToHostVisibleMs:stats(gs.metrics.latencies.map(x=>x.peerRenderedAt-x.submittedAt)),
    confirmationMs:stats([...hs.metrics.latencies,...gs.metrics.latencies].map(x=>x.confirmedMs)),
    note:'Same-machine epoch clocks, from submit to peer canvas update; canonical settle included. Confirmation is round trip with hashes. Not a two-device one-way measurement.',
  };
  summary.codes={host:hs.metrics.codes,guest:gs.metrics.codes};
  summary.timing={host:hs.metrics.connections,guest:gs.metrics.connections};
  summary.network=await host.evaluate(()=>window.spike.network());
  await writeFile(path.join(here,'local/host.json'),JSON.stringify(hs,null,2));
  await writeFile(path.join(here,'local/guest.json'),JSON.stringify(gs,null,2));
  await host.screenshot({path:path.join(here,'local/host.png'),fullPage:true});
  await guest.screenshot({path:path.join(here,'local/guest.png'),fullPage:true});
  console.log(JSON.stringify(summary.checks));
  // A second network configuration: public STUN lookup enabled, still two local tabs.
  // Distinguish lookup availability from the selected path; this is NOT an internet test.
  await guest.evaluate(()=>window.spike.drop());
  await host.waitForFunction(()=>!window.spike.snapshot().ready);
  if(process.env.CHECK_STUN==='1')try {
    console.log('Checking public STUN gathering; replaying full log.');
    summary.stun=await connect(host,guest,true);
    summary.stun.network=await host.evaluate(()=>window.spike.network());
    summary.stun.codes={host:(await snapshot(host)).metrics.codes.at(-1),guest:(await snapshot(guest)).metrics.codes.at(-1)};
  } catch(error) { summary.stun={untestedOrFailed:error.message}; }
  // Optional cross-engine check, if Firefox is available locally.
  if(process.env.CHECK_FIREFOX==='1'){
    const fb=await firefox.launch({headless:true,...(process.env.FIREFOX_PATH?{executablePath:process.env.FIREFOX_PATH}:{})});
    let fg;
    try{
      const fc=await fb.newContext();fg=await fc.newPage();
      fg.on('pageerror',e=>errors.push(e.message));
      await fg.goto(url);await fg.waitForFunction(()=>window.spike);
      await guest.evaluate(()=>window.spike.drop());
      await host.waitForFunction(()=>!window.spike.snapshot().ready);
      console.log('Cross-engine: Chromium host, Firefox guest, full log replay.');
      const c=await connect(host,fg);
      const ops=await Promise.all([host.evaluate(()=>window.spike.runMixed(30,1001)),fg.evaluate(()=>window.spike.runMixed(30,1002))]);
      assert.ok(ops.flat().every(r=>r.ok));
      const fs=await snapshot(fg);const cs=await snapshot(host);
      assert.equal(fs.hash,cs.hash);
      summary.firefox={version:fb.version(),connection:c,accepted:60,replayed:acceptedCount,hash:fs.hash,mismatches:0,
        codes:fs.metrics.codes,network:await fg.evaluate(()=>window.spike.network())};
      await writeFile(path.join(here,'local/firefox.json'),JSON.stringify(fs,null,2));
    }catch(error){summary.firefox={failed:error.message,state:fg?await snapshot(fg):undefined};throw error;}
    finally{await fb.close();}
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS. Evidence is in local/results.json.');
} catch(error) {
  summary.failure=error.stack;
  summary.failureState={host:await snapshot(host),guest:await snapshot(guest)};
  console.error(error);
  process.exitCode=1;
} finally {
  summary.browserErrors=errors;
  await writeFile(path.join(here,'local/results.json'),JSON.stringify(summary,null,2));
  await browser.close();
}
