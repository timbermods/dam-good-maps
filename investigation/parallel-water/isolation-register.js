// Invoke before showing an editable document. This can reload once on first visit.
export async function registerIsolation(url='./isolation-sw.js') {
  if (!isSecureContext || !('serviceWorker' in navigator)) return false;
  const key='dgm-isolation-reload:'+new URL(url,location.href).href;
  try {
    const expected=new URL(url,location.href).href;
    const previous=await navigator.serviceWorker.getRegistration(expected);
    if(previous?.active && previous.active.scriptURL!==expected)return crossOriginIsolated;
    const registration=await navigator.serviceWorker.register(url,{updateViaCache:'none'});
    if(crossOriginIsolated)return true;
    // A controller does not upgrade the already loaded document: navigate once.
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),
        new Promise(resolve=>setTimeout(resolve,5000)),
      ]);
    }
    if (navigator.serviceWorker.controller && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key,'1'); location.reload(); return await new Promise(()=>{});
    }
    // Unsupported isolation remains scalar, without a reload loop. Safe UI can later
    // message registration.waiting with ACTIVATE_WHEN_SAFE and explicitly navigate.
    return crossOriginIsolated;
  } catch {return false;}
}
