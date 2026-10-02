// Invoke before showing an editable document. This can reload once on first visit.
export async function registerIsolation(url='./isolation-sw.js') {
  if (!isSecureContext || !('serviceWorker' in navigator)) return false;
  const key='dgm-isolation-reload:'+new URL(url,location.href).href;
  try {
    const expected=new URL(url,location.href).href;
    const scope=new URL('./',expected).href;
    const previous=await navigator.serviceWorker.getRegistration(expected);
    // Preserve another worker in THIS scope. An inherited parent registration
    // can remain intact while /preview/ installs its own child-scope policy.
    if(previous?.scope===scope && previous.active && previous.active.scriptURL!==expected)return crossOriginIsolated;
    const registration=await navigator.serviceWorker.register(url,{scope,updateViaCache:'none'});
    if(crossOriginIsolated)return true;
    // A controller does not upgrade the already loaded document: navigate once.
    if (navigator.serviceWorker.controller?.scriptURL!==expected) {
      await new Promise(resolve=>{
        const check=()=>{
          if(navigator.serviceWorker.controller?.scriptURL!==expected)return;
          clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',check);resolve();
        };
        const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',check);resolve();},5000);
        navigator.serviceWorker.addEventListener('controllerchange',check);check();
      });
    }
    if (navigator.serviceWorker.controller?.scriptURL===expected && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key,'1'); location.reload(); return await new Promise(()=>{});
    }
    // Unsupported isolation remains scalar, without a reload loop. Safe UI can later
    // message registration.waiting with ACTIVATE_WHEN_SAFE and explicitly navigate.
    return crossOriginIsolated;
  } catch {return false;}
}
