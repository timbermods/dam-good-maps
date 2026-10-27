// Work the page's thread does when it has a moment to spare (requestIdleCallback, at most a few milliseconds at a
// time, each job a small one): putting away objects no longer drawn, and making ahead the models the map may yet need.
// Done in the frame that needed it, the same work made long tasks of an edit's answer (D453).

const queue: (() => void)[] = [];
let asked = false;

/** Do `job` when the page next has a moment (within half a second whatever happens). */
export function whenIdle(job: () => void): void {
  queue.push(job);
  ask();
}

function ask(): void {
  if (asked || !queue.length) return;
  asked = true;
  const run = (deadline?: IdleDeadline) => {
    asked = false;
    const t0 = performance.now();
    // (a few milliseconds, or what the idle period has left)
    while (queue.length && performance.now() - t0 < 4 && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 1)) {
      try {
        queue.shift()!();
      } catch (e) {
        console.error(e);
      }
    }
    ask();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 16);
}
