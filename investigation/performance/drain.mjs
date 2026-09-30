// Consume early rejection immediately, retaining unexpected failure for the main await.
export function protectDrain(promise, isIntentionalAbort, recordFailure) {
  const guarded=promise.catch(error=>{
    if(isIntentionalAbort()) return;
    recordFailure(error);
    throw error;
  });
  guarded.catch(()=>{});
  return guarded;
}
